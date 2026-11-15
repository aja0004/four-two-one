import { getSupabaseClient } from './supabase';

interface MemoryQuotaState {
  dateKey: string;
  count: number;
}

const globalForQuota = globalThis as unknown as {
  __placesQuotaState?: MemoryQuotaState;
};

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function getDailyPlacesSoftLimit(): number {
  const parsed = Number(process.env.DAILY_PLACES_SOFT_LIMIT);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return parsed;
  }
  return 200;
}

/**
 * Checks whether the daily soft limit has been reached, and increments the count by `callsToMake`.
 * Tracks in Supabase (`api_usage_daily`) if configured, with automatic in-memory fallback.
 */
export async function checkAndIncrementPlacesQuota(
  callsToMake: number = 1
): Promise<{ allowed: boolean; currentCount: number; limit: number }> {
  const limit = getDailyPlacesSoftLimit();
  const today = getTodayDateKey();

  if (
    !globalForQuota.__placesQuotaState ||
    globalForQuota.__placesQuotaState.dateKey !== today
  ) {
    globalForQuota.__placesQuotaState = { dateKey: today, count: 0 };
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('api_usage_daily')
        .select('places_search_count')
        .eq('usage_date', today)
        .maybeSingle();

      const existingCount =
        typeof data?.places_search_count === 'number'
          ? data.places_search_count
          : globalForQuota.__placesQuotaState.count;

      if (existingCount + callsToMake > limit) {
        return { allowed: false, currentCount: existingCount, limit };
      }

      const nextCount = existingCount + callsToMake;
      globalForQuota.__placesQuotaState.count = nextCount;

      await supabase.from('api_usage_daily').upsert(
        {
          usage_date: today,
          places_search_count: nextCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'usage_date' }
      );

      return { allowed: true, currentCount: nextCount, limit };
    } catch {
      // Fallback to in-memory counter if table wasn't created yet
    }
  }

  const mem = globalForQuota.__placesQuotaState;
  if (mem.count + callsToMake > limit) {
    return { allowed: false, currentCount: mem.count, limit };
  }

  mem.count += callsToMake;
  return { allowed: true, currentCount: mem.count, limit };
}
