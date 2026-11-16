import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';

interface MemoryQuotaState {
  dateKey: string;
  count: number;
}

const globalForQuota = globalThis as unknown as {
  __placesQuotaState?: MemoryQuotaState;
  __supabaseAdminClient?: SupabaseClient | null;
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
 * Returns a server-only Supabase admin client (`SUPABASE_SERVICE_ROLE_KEY`) when configured,
 * falling back cleanly to the standard client (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
 */
export function getServerSupabaseClient(): SupabaseClient | null {
  if (globalForQuota.__supabaseAdminClient !== undefined) {
    return globalForQuota.__supabaseAdminClient || getSupabaseClient();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

  if (
    url &&
    serviceKey &&
    url.startsWith('http') &&
    !url.includes('your-project-id') &&
    !serviceKey.includes('your_supabase_service_role_key')
  ) {
    globalForQuota.__supabaseAdminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return globalForQuota.__supabaseAdminClient;
  }

  globalForQuota.__supabaseAdminClient = null;
  return getSupabaseClient();
}

/**
 * Read-only inspection of today's Places quota usage (used by `/api/health` without consuming quota).
 */
export async function peekDailyPlacesQuota(): Promise<{
  currentCount: number;
  limit: number;
  source: 'supabase' | 'memory';
}> {
  const limit = getDailyPlacesSoftLimit();
  const today = getTodayDateKey();

  const supabase = getServerSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('api_usage_daily')
        .select('places_search_count')
        .eq('usage_date', today)
        .maybeSingle();

      if (!error) {
        return {
          currentCount:
            typeof data?.places_search_count === 'number'
              ? data.places_search_count
              : 0,
          limit,
          source: 'supabase',
        };
      }
    } catch {
      // fall through to memory
    }
  }

  const memCount =
    globalForQuota.__placesQuotaState?.dateKey === today
      ? globalForQuota.__placesQuotaState.count
      : 0;
  return { currentCount: memCount, limit, source: 'memory' };
}

/**
 * Checks whether the daily soft limit has been reached, and atomically increments the count by `callsToMake`.
 * 1. Primary path: Calls the atomic Postgres RPC `increment_places_quota` (`FOR UPDATE` row lock).
 * 2. Fallback path: Uses `api_usage_daily` table upsert (if RPC migration hasn't been applied yet) or in-memory counter.
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

  const supabase = getServerSupabaseClient();
  if (supabase) {
    // 1. Try atomic Postgres RPC (`increment_places_quota`) first
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'increment_places_quota',
        {
          p_date: today,
          p_increment: callsToMake,
          p_limit: limit,
        }
      );

      if (!rpcError && rpcData) {
        const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (row && typeof row.allowed === 'boolean') {
          const count =
            typeof row.current_count === 'number' ? row.current_count : 0;
          globalForQuota.__placesQuotaState.count = count;
          return { allowed: row.allowed, currentCount: count, limit };
        }
      }
    } catch {
      // Fall through if RPC is not yet installed in Supabase
    }

    // 2. Fallback: direct table read + upsert (backward-compatible pre-migration)
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
