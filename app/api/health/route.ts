import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getServerSupabaseClient, peekDailyPlacesQuota } from '@/lib/quota';

export const dynamic = 'force-dynamic';

function isKeyConfigured(val: string | undefined, placeholderFragment: string): boolean {
  const clean = (val || '').trim();
  return Boolean(clean && !clean.includes(placeholderFragment));
}

export async function GET() {
  const startedAt = Date.now();

  const placesConfigured = isKeyConfigured(
    process.env.GOOGLE_PLACES_API_KEY,
    'your_google_places_api_key'
  );
  const geminiConfigured = isKeyConfigured(
    process.env.GEMINI_API_KEY,
    'your_gemini_api_key'
  );
  const serviceRoleConfigured = isKeyConfigured(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    'your_supabase_service_role_key'
  );

  let supabaseReachable: boolean | null = null;
  if (isSupabaseConfigured) {
    const supabase = getServerSupabaseClient();
    if (supabase) {
      try {
        const { error } = await supabase
          .from('household_profiles')
          .select('household_id')
          .limit(1);
        supabaseReachable = !error;
      } catch {
        supabaseReachable = false;
      }
    }
  }

  const quota = await peekDailyPlacesQuota();
  const ok = supabaseReachable !== false;

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      providers: {
        googlePlacesConfigured: placesConfigured,
        geminiConfigured,
        supabaseConfigured: isSupabaseConfigured,
        supabaseServiceRoleConfigured: serviceRoleConfigured,
        supabaseReachable,
      },
      placesQuota: {
        usedToday: quota.currentCount,
        dailySoftLimit: quota.limit,
        remainingToday: Math.max(0, quota.limit - quota.currentCount),
        source: quota.source,
      },
    },
    { status: ok ? 200 : 503 }
  );
}
