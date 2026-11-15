-- ============================================================================
-- 4-2-1 Dinner Decision App — Supabase Schema (Idempotent)
-- Paste this into your Supabase SQL Editor and click "Run"
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. Household Profiles (persists player names, who went first last, transport preference)
create table if not exists public.household_profiles (
  household_id text primary key,
  player_a text not null default 'Alex',
  player_b text not null default 'Sam',
  last_first_player text,
  default_transport text not null default 'drive',
  updated_at timestamptz not null default now()
);

-- 2. Game Sessions (live state machine synced across iPhones via Supabase Realtime)
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id text not null default 'default',
  room_code text not null,
  play_mode text not null default 'two_phones',
  phase text not null default 'SETUP',
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_game_sessions_household_updated
  on public.game_sessions (household_id, updated_at desc);

create index if not exists idx_game_sessions_room_code
  on public.game_sessions (room_code);

-- 3. Recent Winners (persists chosen restaurants to avoid repeats for 7 days)
create table if not exists public.recent_winners (
  id uuid primary key default gen_random_uuid(),
  household_id text not null default 'default',
  session_id uuid unique,
  place_id text not null,
  name text not null,
  cuisine text,
  meal_type text,
  price_tier text,
  address text,
  maps_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_recent_winners_household_created
  on public.recent_winners (household_id, created_at desc);

-- 4. Household Favorites & Learned Taste Memory (uploaded up front + learned over time)
create table if not exists public.household_favorites (
  id uuid primary key default gen_random_uuid(),
  household_id text not null default 'default',
  place_id text not null,
  name text not null,
  cuisine text not null default 'Local Favorite',
  meal_types text[] not null default array['order_in', 'eat_out'],
  price_tier text not null default '$$',
  short_address text,
  notes text,
  source text not null default 'uploaded',
  affinity_score numeric not null default 5,
  wins_count integer not null default 0,
  kept_count integer not null default 0,
  rerolled_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(household_id, place_id)
);

create index if not exists idx_household_favorites_household_affinity
  on public.household_favorites (household_id, affinity_score desc);

-- 5. Daily Places API Soft Quota Tracker (prevents accidental refresh loops exceeding free cap)
create table if not exists public.api_usage_daily (
  usage_date date primary key default current_date,
  places_search_count integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security (permissive household-scoped anon policies for zero-login couple UX)
alter table public.household_profiles enable row level security;
alter table public.game_sessions enable row level security;
alter table public.recent_winners enable row level security;
alter table public.household_favorites enable row level security;
alter table public.api_usage_daily enable row level security;

drop policy if exists "Allow anon access to household_profiles" on public.household_profiles;
create policy "Allow anon access to household_profiles"
  on public.household_profiles
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Allow anon access to game_sessions" on public.game_sessions;
create policy "Allow anon access to game_sessions"
  on public.game_sessions
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Allow anon access to recent_winners" on public.recent_winners;
create policy "Allow anon access to recent_winners"
  on public.recent_winners
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Allow anon access to household_favorites" on public.household_favorites;
create policy "Allow anon access to household_favorites"
  on public.household_favorites
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Allow anon access to api_usage_daily" on public.api_usage_daily;
create policy "Allow anon access to api_usage_daily"
  on public.api_usage_daily
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Enable Realtime on game_sessions safely (idempotent check)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_sessions'
  ) then
    alter publication supabase_realtime add table public.game_sessions;
  end if;
end $$;
