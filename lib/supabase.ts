import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  DEFAULT_DELIVERY_PLATFORMS,
  DeliveryPlatformId,
  DeliveryPlatformQuote,
  DinnerOption,
  GameSessionState,
  HouseholdFavorite,
  HouseholdProfile,
  LearnedRestaurantDeliveryInfo,
  MealType,
  PlayerRole,
  PriceTier,
  RecentWinner,
  TransportMode,
} from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_HOUSEHOLD_ID || 'default';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('your-project-id') &&
    !supabaseAnonKey.includes('your_supabase_anon_key')
);

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: 'no-store',
          }),
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return clientInstance;
}

const LS_PROFILE_KEY = '421_household_profile_v1';
const LS_ACTIVE_SESSION_KEY = '421_active_session_v1';
const LS_RECENT_WINNERS_KEY = '421_recent_winners_v1';
const LS_FAVORITES_KEY = '421_household_favorites_v1';
const LS_DEVICE_ROLE_PREFIX = '421_device_role_';
const LS_DEVICE_OWNER_SLOT_KEY = '421_device_owner_slot_v1';
const LS_DEVICE_OWNER_NAME_KEY = '421_device_owner_name_v1';
const LS_RECENT_PARTNERS_KEY = '421_recent_partners_v1';
const LS_LAST_FIRST_BY_PAIR_KEY = '421_last_first_by_pair_v1';
const LS_DELIVERY_APPS_KEY = '421_preferred_delivery_apps_v1';
const LS_LEARNED_DELIVERY_CACHE_KEY = '421_learned_delivery_cache_v2';

const GLOBAL_DELIVERY_CACHE_ROW_ID = '00000000-0000-4000-8000-000000000421';

export function getUserKey(playerName?: string | null): string {
  const clean = (playerName || getDeviceOwnerName() || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean ? `user_${clean}` : HOUSEHOLD_ID;
}

export function getPairKey(nameA?: string | null, nameB?: string | null): string {
  const a = (nameA || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const b = (nameB || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!a || !b) return HOUSEHOLD_ID;
  const sorted = [a, b].sort();
  return `pair_${sorted[0]}__${sorted[1]}`;
}

export function loadRecentPartners(
  myOwnerName?: string | null,
  legacyProfile?: HouseholdProfile
): string[] {
  if (typeof window === 'undefined') return [];
  const myClean = (myOwnerName || getDeviceOwnerName() || '').trim().toLowerCase();
  try {
    const raw = window.localStorage.getItem(LS_RECENT_PARTNERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        const filtered = parsed
          .map((p) => String(p || '').trim())
          .filter((p) => p && p.toLowerCase() !== myClean);
        if (filtered.length > 0) return filtered;
      }
    }
  } catch {
    // ignore
  }

  // Seed from legacy profile if upgrading from v1 so existing household partner (e.g. Lauren) is preserved
  const seeded: string[] = [];
  if (legacyProfile) {
    const candidates = [legacyProfile.playerB, legacyProfile.playerA];
    for (const c of candidates) {
      const clean = (c || '').trim();
      if (
        clean &&
        clean.toLowerCase() !== myClean &&
        clean.toLowerCase() !== 'player 1' &&
        clean.toLowerCase() !== 'player 2' &&
        clean.toLowerCase() !== 'sam'
      ) {
        if (!seeded.some((s) => s.toLowerCase() === clean.toLowerCase())) {
          seeded.push(clean);
        }
      }
    }
  }
  if (seeded.length > 0) {
    saveRecentPartners(seeded);
  }
  return seeded;
}

export function saveRecentPartners(partners: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LS_RECENT_PARTNERS_KEY,
      JSON.stringify(partners)
    );
  } catch {
    // ignore
  }
}

export function addRecentPartner(
  partnerName: string,
  myOwnerName?: string | null
): string[] {
  const cleanPartner = partnerName.trim();
  const myClean = (myOwnerName || getDeviceOwnerName() || '').trim().toLowerCase();
  const current = loadRecentPartners(myOwnerName);
  if (
    !cleanPartner ||
    cleanPartner.toLowerCase() === myClean ||
    cleanPartner.toLowerCase().includes('joining') ||
    cleanPartner.toLowerCase().includes('waiting')
  ) {
    return current;
  }
  const next = [
    cleanPartner,
    ...current.filter((p) => p.toLowerCase() !== cleanPartner.toLowerCase()),
  ].slice(0, 12);
  saveRecentPartners(next);
  return next;
}

export function removeRecentPartner(
  partnerName: string,
  myOwnerName?: string | null
): string[] {
  const cleanPartner = partnerName.trim().toLowerCase();
  const current = loadRecentPartners(myOwnerName);
  const next = current.filter((p) => p.toLowerCase() !== cleanPartner);
  saveRecentPartners(next);
  return next;
}

export function getLastFirstPlayerForPair(
  nameA: string,
  nameB: string
): string | null {
  if (typeof window === 'undefined') return null;
  const pairKey = getPairKey(nameA, nameB);
  try {
    const raw = window.localStorage.getItem(LS_LAST_FIRST_BY_PAIR_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map?.[pairKey] || null;
  } catch {
    return null;
  }
}

export function saveLastFirstPlayerForPair(
  nameA: string,
  nameB: string,
  firstPlayerName: string
): void {
  if (typeof window === 'undefined') return;
  const pairKey = getPairKey(nameA, nameB);
  if (pairKey === HOUSEHOLD_ID || !firstPlayerName.trim()) return;
  try {
    const raw = window.localStorage.getItem(LS_LAST_FIRST_BY_PAIR_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    map[pairKey] = firstPlayerName.trim();
    window.localStorage.setItem(LS_LAST_FIRST_BY_PAIR_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export async function fetchPairLastFirstPlayer(
  nameA: string,
  nameB: string
): Promise<string | null> {
  const localVal = getLastFirstPlayerForPair(nameA, nameB);
  const pairKey = getPairKey(nameA, nameB);
  const supabase = getSupabaseClient();
  if (!supabase || pairKey === HOUSEHOLD_ID) return localVal;

  try {
    const { data, error } = await supabase
      .from('household_profiles')
      .select('last_first_player')
      .eq('household_id', pairKey)
      .maybeSingle();

    if (!error && data?.last_first_player) {
      saveLastFirstPlayerForPair(nameA, nameB, data.last_first_player);
      return data.last_first_player;
    }
  } catch {
    // ignore
  }
  return localVal;
}

export function loadPreferredDeliveryApps(): DeliveryPlatformId[] {
  if (typeof window === 'undefined') return [...DEFAULT_DELIVERY_PLATFORMS];
  try {
    const raw = window.localStorage.getItem(LS_DELIVERY_APPS_KEY);
    if (!raw) return [...DEFAULT_DELIVERY_PLATFORMS];
    const parsed = JSON.parse(raw) as DeliveryPlatformId[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return [...DEFAULT_DELIVERY_PLATFORMS];
  } catch {
    return [...DEFAULT_DELIVERY_PLATFORMS];
  }
}

export function savePreferredDeliveryApps(apps: DeliveryPlatformId[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_DELIVERY_APPS_KEY, JSON.stringify(apps));
  } catch {
    // ignore
  }
}

export function loadLearnedDeliveryCache(): Record<
  string,
  LearnedRestaurantDeliveryInfo
> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_LEARNED_DELIVERY_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<
      string,
      LearnedRestaurantDeliveryInfo
    >;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLearnedDeliveryEntries(
  entries: LearnedRestaurantDeliveryInfo[]
): Record<string, LearnedRestaurantDeliveryInfo> {
  const current = loadLearnedDeliveryCache();
  for (const item of entries) {
    if (!item?.placeId) continue;
    const prev = current[item.placeId];
    current[item.placeId] = {
      placeId: item.placeId,
      restaurantName: item.restaurantName,
      quotes: {
        ...(prev?.quotes || {}),
        ...(item.quotes || {}),
      },
      updatedAt: item.updatedAt || new Date().toISOString(),
    };
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        LS_LEARNED_DELIVERY_CACHE_KEY,
        JSON.stringify(current)
      );
    } catch {
      // ignore
    }
  }

  // Also sync globally to Supabase so every user's lookups enrich the shared delivery intelligence
  const supabase = getSupabaseClient();
  if (supabase && entries.length > 0) {
    void (async () => {
      try {
        await supabase.from('game_sessions').upsert(
          {
            id: GLOBAL_DELIVERY_CACHE_ROW_ID,
            household_id: 'global_delivery_cache',
            room_code: 'CACH',
            play_mode: 'pass_phone',
            phase: 'WINNER',
            state: current,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      } catch {
        // ignore cloud sync errors
      }
    })();
  }

  return current;
}

export async function fetchSharedLearnedDeliveryCache(): Promise<
  Record<string, LearnedRestaurantDeliveryInfo>
> {
  const local = loadLearnedDeliveryCache();
  const supabase = getSupabaseClient();
  if (!supabase) return local;

  try {
    const { data, error } = await supabase
      .from('game_sessions')
      .select('state')
      .eq('id', GLOBAL_DELIVERY_CACHE_ROW_ID)
      .maybeSingle();

    if (error || !data?.state || typeof data.state !== 'object') {
      return local;
    }

    const remoteMap = data.state as Record<
      string,
      LearnedRestaurantDeliveryInfo
    >;
    const merged: Record<string, LearnedRestaurantDeliveryInfo> = {
      ...remoteMap,
    };

    for (const [placeId, localEntry] of Object.entries(local)) {
      const remEntry = merged[placeId];
      merged[placeId] = {
        placeId,
        restaurantName:
          localEntry.restaurantName || remEntry?.restaurantName || 'Restaurant',
        quotes: {
          ...(remEntry?.quotes || {}),
          ...(localEntry.quotes || {}),
        },
        updatedAt: localEntry.updatedAt || remEntry?.updatedAt || new Date().toISOString(),
      };
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          LS_LEARNED_DELIVERY_CACHE_KEY,
          JSON.stringify(merged)
        );
      } catch {
        // ignore
      }
    }
    return merged;
  } catch {
    return local;
  }
}

export function clearLearnedDeliveryCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LS_LEARNED_DELIVERY_CACHE_KEY);
  } catch {
    // ignore
  }
}

export function getDeviceOwnerSlot(): 'A' | 'B' | null {
  if (typeof window === 'undefined') return null;
  try {
    const slot = window.localStorage.getItem(LS_DEVICE_OWNER_SLOT_KEY);
    if (slot === 'A' || slot === 'B') return slot;
    return null;
  } catch {
    return null;
  }
}

export function saveDeviceOwnerSlot(slot: 'A' | 'B'): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_DEVICE_OWNER_SLOT_KEY, slot);
  } catch {
    // ignore
  }
}

export function getDeviceOwnerName(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = window.localStorage.getItem(LS_DEVICE_OWNER_NAME_KEY)?.trim();
    return val || null;
  } catch {
    return null;
  }
}

export function saveDeviceOwnerName(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = name.trim();
    if (clean) {
      window.localStorage.setItem(LS_DEVICE_OWNER_NAME_KEY, clean);
    } else {
      window.localStorage.removeItem(LS_DEVICE_OWNER_NAME_KEY);
    }
  } catch {
    // ignore
  }
}

export function getDefaultProfile(): HouseholdProfile {
  return {
    householdId: HOUSEHOLD_ID,
    playerA: 'Alex',
    playerB: 'Sam',
    lastFirstPlayer: null,
    defaultTransport: 'drive',
    preferredDeliveryApps: loadPreferredDeliveryApps(),
    updatedAt: new Date().toISOString(),
  };
}

export function loadLocalProfile(): HouseholdProfile {
  if (typeof window === 'undefined') return getDefaultProfile();
  try {
    const raw = window.localStorage.getItem(LS_PROFILE_KEY);
    if (!raw) return getDefaultProfile();
    const parsed = JSON.parse(raw) as Partial<HouseholdProfile>;
    const apps =
      Array.isArray(parsed.preferredDeliveryApps) &&
      parsed.preferredDeliveryApps.length > 0
        ? parsed.preferredDeliveryApps
        : loadPreferredDeliveryApps();
    return {
      householdId: parsed.householdId || HOUSEHOLD_ID,
      playerA: parsed.playerA || 'Alex',
      playerB: parsed.playerB || 'Sam',
      lastFirstPlayer: parsed.lastFirstPlayer ?? null,
      defaultTransport: (parsed.defaultTransport as TransportMode) || 'drive',
      preferredDeliveryApps: apps,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return getDefaultProfile();
  }
}

export function saveLocalProfile(profile: HouseholdProfile): void {
  if (typeof window === 'undefined') return;
  try {
    if (
      Array.isArray(profile.preferredDeliveryApps) &&
      profile.preferredDeliveryApps.length > 0
    ) {
      savePreferredDeliveryApps(profile.preferredDeliveryApps);
    }
    window.localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage errors
  }
}

export async function fetchHouseholdProfile(): Promise<HouseholdProfile> {
  const local = loadLocalProfile();
  const supabase = getSupabaseClient();
  if (!supabase) return local;

  try {
    const { data, error } = await supabase
      .from('household_profiles')
      .select('*')
      .eq('household_id', HOUSEHOLD_ID)
      .maybeSingle();

    if (error || !data) {
      return local;
    }

    const remoteProfile: HouseholdProfile = {
      householdId: data.household_id,
      playerA: data.player_a || local.playerA,
      playerB: data.player_b || local.playerB,
      lastFirstPlayer: data.last_first_player ?? local.lastFirstPlayer,
      defaultTransport:
        (data.default_transport as TransportMode) || local.defaultTransport,
      preferredDeliveryApps:
        local.preferredDeliveryApps || loadPreferredDeliveryApps(),
      updatedAt: data.updated_at || new Date().toISOString(),
    };
    saveLocalProfile(remoteProfile);
    return remoteProfile;
  } catch {
    return local;
  }
}

export async function upsertHouseholdProfile(
  updates: Partial<Omit<HouseholdProfile, 'householdId' | 'updatedAt'>>
): Promise<HouseholdProfile> {
  const current = loadLocalProfile();
  const next: HouseholdProfile = {
    ...current,
    ...updates,
    householdId: HOUSEHOLD_ID,
    updatedAt: new Date().toISOString(),
  };
  saveLocalProfile(next);

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('household_profiles').upsert(
        {
          household_id: HOUSEHOLD_ID,
          player_a: next.playerA,
          player_b: next.playerB,
          last_first_player: next.lastFirstPlayer,
          default_transport: next.defaultTransport,
          updated_at: next.updatedAt,
        },
        { onConflict: 'household_id' }
      );
    } catch {
      // fallback silently to localStorage
    }
  }

  return next;
}

export function saveLocalSession(session: GameSessionState | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!session) {
      window.localStorage.removeItem(LS_ACTIVE_SESSION_KEY);
    } else {
      window.localStorage.setItem(LS_ACTIVE_SESSION_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore
  }
}

const LOCAL_SYNC_CHANNEL = '421_local_sync_channel_v1';

function broadcastLocalSessionUpdate(session: GameSessionState): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return;
  }
  try {
    const bc = new BroadcastChannel(LOCAL_SYNC_CHANNEL);
    bc.postMessage({ type: 'SESSION_UPDATE', session });
    bc.close();
  } catch {
    // ignore
  }
}

export function loadLocalSession(): GameSessionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameSessionState;
    // Check if younger than 2 hours
    const ageMs = Date.now() - new Date(parsed.updatedAt).getTime();
    if (ageMs > 2 * 60 * 60 * 1000) {
      window.localStorage.removeItem(LS_ACTIVE_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDeviceRoleForSession(
  sessionId: string,
  role: 'user1' | 'user2'
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${LS_DEVICE_ROLE_PREFIX}${sessionId}`, role);
  } catch {
    // ignore
  }
}

export function getDeviceRoleForSession(
  sessionId: string
): 'user1' | 'user2' | null {
  if (typeof window === 'undefined') return null;
  try {
    const role = window.localStorage.getItem(`${LS_DEVICE_ROLE_PREFIX}${sessionId}`);
    if (role === 'user1' || role === 'user2') return role;
    return null;
  } catch {
    return null;
  }
}

const activeSessionChannels = new Map<string, RealtimeChannel>();

export function isPlaceholderPartnerName(name?: string | null): boolean {
  const clean = (name || '').trim().toLowerCase();
  return (
    !clean ||
    clean === 'partner (joining…)' ||
    clean === 'partner (joining...)' ||
    clean.includes('joining') ||
    clean.includes('waiting')
  );
}

/**
 * Monotonic turn-stage rank within a single `roundNumber`:
 * Allows free movement within User 1's questionnaire/Stage-4 curation (turnStage = 2),
 * while strictly preventing a stale snapshot from regressing across turn handoffs
 * (e.g. `U1_PICK_1` -> `U2_PICK_2`, or `U2_PICK_2` -> `U1_REVIEW_4`, or `WINNER` -> anything).
 */
function getSessionTurnStage(session: GameSessionState): number {
  switch (session.phase) {
    case 'SETUP':
      return 0;
    case 'U2_VETOED':
      return 1;
    case 'HANDOFF_TO_U1':
      return session.lastHandoffReason === 'veto' ? 1 : 5;
    case 'Q_PAGE_1':
    case 'Q_PAGE_2':
    case 'GENERATING':
    case 'U1_REVIEW_4':
      return 2;
    case 'HANDOFF_TO_U2':
      return 3;
    case 'U2_PICK_2':
      return 4;
    case 'U1_PICK_1':
      return 6;
    case 'WINNER':
      return 7;
    default:
      return 2;
  }
}

/**
 * Returns > 0 if `a` is strictly further ahead / newer than `b`, < 0 if `b` is newer, 0 if tied.
 */
export function compareSessionProgress(
  a: GameSessionState,
  b: GameSessionState
): number {
  const aAbandoned = a.abandoned ? 1 : 0;
  const bAbandoned = b.abandoned ? 1 : 0;
  if (aAbandoned !== bAbandoned) return aAbandoned - bAbandoned;

  const aWinner = a.phase === 'WINNER' ? 1 : 0;
  const bWinner = b.phase === 'WINNER' ? 1 : 0;
  if (aWinner !== bWinner) return aWinner - bWinner;

  const aRound = a.roundNumber || 1;
  const bRound = b.roundNumber || 1;
  if (aRound !== bRound) return aRound - bRound;

  const aStage = getSessionTurnStage(a);
  const bStage = getSessionTurnStage(b);
  if (aStage !== bStage) return aStage - bStage;

  const aRev = a.revision ?? 0;
  const bRev = b.revision ?? 0;
  if (aRev !== bRev) return aRev - bRev;

  const aTime = new Date(a.updatedAt || 0).getTime() || 0;
  const bTime = new Date(b.updatedAt || 0).getTime() || 0;
  return aTime - bTime;
}

function mergeCombinedFavorites(
  favsA?: HouseholdFavorite[],
  favsB?: HouseholdFavorite[]
): HouseholdFavorite[] | undefined {
  const listA = Array.isArray(favsA) ? favsA : [];
  const listB = Array.isArray(favsB) ? favsB : [];
  if (listA.length === 0 && listB.length === 0) return favsA ?? favsB;
  const byId = new Map<string, HouseholdFavorite>();
  for (const fav of [...listA, ...listB]) {
    if (!fav?.placeId) continue;
    const prev = byId.get(fav.placeId);
    if (!prev || fav.affinityScore > prev.affinityScore) {
      byId.set(fav.placeId, fav);
    }
  }
  return Array.from(byId.values()).sort(
    (x, y) => y.affinityScore - x.affinityScore
  );
}

/**
 * Merges two snapshots of the same `GameSessionState` without ever regressing turn progress
 * or losing a joined partner's real name (`user2Name`) back to `'Partner (Joining…)'`.
 */
export function mergeSessionStates(
  current: GameSessionState,
  incoming: GameSessionState
): GameSessionState {
  if (current.id !== incoming.id) return incoming;

  const cmp = compareSessionProgress(incoming, current);
  const primary = cmp >= 0 ? incoming : current;
  const secondary = cmp >= 0 ? current : incoming;

  let mergedUser1 = primary.user1Name;
  let mergedUser2 = primary.user2Name;
  let mergedOpenInvite = Boolean(primary.isOpenInvite);

  // Never allow a placeholder partner name or openInvite=true to overwrite a resolved partner name!
  if (
    (isPlaceholderPartnerName(mergedUser2) || mergedOpenInvite) &&
    !isPlaceholderPartnerName(secondary.user2Name) &&
    secondary.user2Name.trim().toLowerCase() !==
      mergedUser1.trim().toLowerCase()
  ) {
    mergedUser2 = secondary.user2Name.trim();
    mergedOpenInvite = false;
  }

  if (!secondary.isOpenInvite && isPlaceholderPartnerName(mergedUser2) === false) {
    mergedOpenInvite = false;
  }

  const mergedFavs = mergeCombinedFavorites(
    primary.combinedFavorites,
    secondary.combinedFavorites
  );

  const maxRevision = Math.max(primary.revision ?? 0, secondary.revision ?? 0);

  return {
    ...primary,
    abandoned: Boolean(primary.abandoned || secondary.abandoned) || undefined,
    user1Name: mergedUser1,
    user2Name: mergedUser2,
    isOpenInvite: mergedOpenInvite,
    players: [
      { id: 'p1', name: mergedUser1, role: 'user1' },
      { id: 'p2', name: mergedUser2, role: 'user2' },
    ],
    combinedFavorites: mergedFavs,
    revision: maxRevision > 0 ? maxRevision : primary.revision,
  };
}

export async function fetchSessionById(
  sessionId: string
): Promise<GameSessionState | null> {
  if (!sessionId) return null;
  const supabase = getSupabaseClient();
  if (!supabase) {
    const local = loadLocalSession();
    return local && local.id === sessionId ? local : null;
  }

  try {
    const { data, error } = await supabase
      .from('game_sessions')
      .select('state, updated_at')
      .eq('id', sessionId)
      .maybeSingle();

    if (error || !data?.state) return null;
    return data.state as GameSessionState;
  } catch {
    return null;
  }
}

async function fetchSessionMetaById(
  sessionId: string
): Promise<{ phase: string; updatedAtMs: number } | null> {
  if (!sessionId) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('game_sessions')
      .select('phase, updated_at')
      .eq('id', sessionId)
      .maybeSingle();

    if (error || !data) return null;
    return {
      phase: String(data.phase || ''),
      updatedAtMs: new Date(String(data.updated_at || 0)).getTime() || 0,
    };
  } catch {
    return null;
  }
}

export async function syncGameSession(
  session: GameSessionState
): Promise<boolean> {
  const stamped: GameSessionState = {
    ...session,
    revision: (session.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  saveLocalSession(stamped);
  broadcastLocalSessionUpdate(stamped);

  // Instant peer relay (~30ms) if this session already has an open Realtime channel
  const openChannel = activeSessionChannels.get(stamped.id);
  if (openChannel) {
    try {
      void openChannel
        .send({
          type: 'broadcast',
          event: 'session_update',
          payload: { session: stamped },
        })
        .catch(() => {});
    } catch {
      // ignore broadcast fast-path errors
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) return true;

  const retryDelaysMs = [0, 350, 900];
  let payloadToUpsert = stamped;
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    if (retryDelaysMs[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
      // Re-reconcile against cloud before retrying so an iOS wake-up retry never clobbers a newer turn!
      const latestRemote = await fetchSessionById(payloadToUpsert.id);
      if (latestRemote) {
        payloadToUpsert = {
          ...mergeSessionStates(latestRemote, payloadToUpsert),
          updatedAt: new Date().toISOString(),
        };
        saveLocalSession(payloadToUpsert);
      }
    }
    try {
      const { error } = await supabase.from('game_sessions').upsert(
        {
          id: payloadToUpsert.id,
          household_id: payloadToUpsert.householdId || HOUSEHOLD_ID,
          room_code: payloadToUpsert.roomCode,
          play_mode: payloadToUpsert.playMode,
          phase: payloadToUpsert.phase,
          state: payloadToUpsert,
          updated_at: payloadToUpsert.updatedAt,
        },
        { onConflict: 'id' }
      );
      if (!error) {
        return true;
      }
    } catch {
      // retry on transient network / iOS wakeup failure
    }
  }

  return false;
}

/**
 * Safely joins or updates player identity on an active `two_phones` session without
 * clobbering concurrent game phase advances (`U1_REVIEW_4`, `U2_PICK_2`, `U1_PICK_1`, `WINNER`)
 * or creating `Alex vs Alex` duplicate-name collisions.
 */
export async function joinSessionPlayerSafely({
  sessionId,
  fallbackSession,
  role,
  playerName,
  localFavorites = [],
}: {
  sessionId: string;
  fallbackSession: GameSessionState;
  role: PlayerRole;
  playerName?: string | null;
  localFavorites?: HouseholdFavorite[];
}): Promise<GameSessionState> {
  const remoteLatest = await fetchSessionById(sessionId);
  const base = remoteLatest
    ? mergeSessionStates(fallbackSession, remoteLatest)
    : fallbackSession;

  const cleanName = (playerName || '').trim();
  if (!cleanName) {
    return base;
  }

  const cleanLower = cleanName.toLowerCase();
  const currentU1Lower = (base.user1Name || '').trim().toLowerCase();
  const currentU2Lower = (base.user2Name || '').trim().toLowerCase();

  // Prevent overwriting User 2 with User 1's name (or vice versa)
  let nextUser1 = base.user1Name;
  let nextUser2 = base.user2Name;

  if (role === 'user1' && cleanLower !== currentU2Lower) {
    nextUser1 = cleanName;
  } else if (role === 'user2' && cleanLower !== currentU1Lower) {
    nextUser2 = cleanName;
  }

  const combinedFavs = await fetchCombinedFavoritesForPlayers(
    [nextUser1, nextUser2],
    localFavorites
  );

  // Re-fetch right after async favorites query so we never overwrite a turn change that happened during those ~300ms!
  const postFavRemote = await fetchSessionById(sessionId);
  const freshest = postFavRemote ? mergeSessionStates(base, postFavRemote) : base;

  if (role === 'user1' && cleanLower !== freshest.user2Name.trim().toLowerCase()) {
    nextUser1 = cleanName;
    nextUser2 = freshest.user2Name;
  } else if (
    role === 'user2' &&
    cleanLower !== freshest.user1Name.trim().toLowerCase()
  ) {
    nextUser1 = freshest.user1Name;
    nextUser2 = cleanName;
  } else {
    nextUser1 = freshest.user1Name;
    nextUser2 = freshest.user2Name;
  }

  const identityChanged =
    nextUser1 !== freshest.user1Name ||
    nextUser2 !== freshest.user2Name ||
    Boolean(freshest.isOpenInvite);

  const isPreGeneration =
    freshest.phase === 'Q_PAGE_1' || freshest.phase === 'Q_PAGE_2';
  const prevFavCount = freshest.combinedFavorites?.length || 0;
  const favsEnriched = isPreGeneration && combinedFavs.length > prevFavCount;

  const mergedResult: GameSessionState = {
    ...freshest,
    user1Name: nextUser1,
    user2Name: nextUser2,
    isOpenInvite: isPlaceholderPartnerName(nextUser2)
      ? Boolean(freshest.isOpenInvite)
      : false,
    combinedFavorites: mergeCombinedFavorites(
      freshest.combinedFavorites,
      combinedFavs
    ),
    players: [
      { id: 'p1', name: nextUser1, role: 'user1' },
      { id: 'p2', name: nextUser2, role: 'user2' },
    ],
  };

  if (identityChanged || favsEnriched) {
    await syncGameSession(mergedResult);
  } else {
    saveLocalSession(mergedResult);
  }

  return mergedResult;
}

/**
 * Queries Supabase for any active non-WINNER, non-abandoned `two_phones` session
 * updated within the last 2 hours that involves this phone's user (`myOwnerName`).
 */
export async function fetchActiveHouseholdLobbySession(
  myOwnerName?: string | null
): Promise<GameSessionState | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const myClean = (myOwnerName ?? getDeviceOwnerName() ?? '')
    .trim()
    .toLowerCase();
  if (!myClean) return null;

  try {
    const twoHoursAgoIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('game_sessions')
      .select('id, phase, play_mode, state, updated_at')
      .eq('household_id', HOUSEHOLD_ID)
      .eq('play_mode', 'two_phones')
      .neq('phase', 'WINNER')
      .gte('updated_at', twoHoursAgoIso)
      .order('updated_at', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) return null;

    for (const row of data) {
      const st = row.state as GameSessionState | undefined;
      if (
        st &&
        !st.abandoned &&
        st.phase !== 'WINNER' &&
        st.phase !== 'SETUP'
      ) {
        const u1 = (st.user1Name || '').trim().toLowerCase();
        const u2 = (st.user2Name || '').trim().toLowerCase();
        if (
          u1 === myClean ||
          u2 === myClean ||
          st.isOpenInvite ||
          isPlaceholderPartnerName(u2)
        ) {
          return st;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchSessionByRoomCode(
  roomCode: string
): Promise<GameSessionState | null> {
  const cleaned = roomCode.trim();
  if (!cleaned) return null;

  const supabase = getSupabaseClient();
  if (!supabase) {
    const local = loadLocalSession();
    if (local && local.roomCode === cleaned) return local;
    return null;
  }

  try {
    const twoHoursAgoIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('game_sessions')
      .select('state')
      .eq('room_code', cleaned)
      .gte('updated_at', twoHoursAgoIso)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.state) return null;
    const session = data.state as GameSessionState;
    if (session.abandoned) return null;
    return session;
  } catch {
    return null;
  }
}

export function subscribeToHouseholdLobby(
  onActiveSessionChange: (session: GameSessionState | null) => void,
  myOwnerName?: string | null
): () => void {
  let bc: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel(LOCAL_SYNC_CHANNEL);
      bc.onmessage = (event) => {
        if (event.data?.type === 'SESSION_UPDATE') {
          const st = event.data.session as GameSessionState | undefined;
          if (!st || st.playMode !== 'two_phones') return;
          if (st.abandoned || st.phase === 'WINNER' || st.phase === 'SETUP') {
            onActiveSessionChange(null);
            return;
          }
          const myClean = (myOwnerName ?? getDeviceOwnerName() ?? '')
            .trim()
            .toLowerCase();
          if (!myClean) return;
          const u1 = (st.user1Name || '').trim().toLowerCase();
          const u2 = (st.user2Name || '').trim().toLowerCase();
          if (
            u1 === myClean ||
            u2 === myClean ||
            st.isOpenInvite ||
            isPlaceholderPartnerName(u2)
          ) {
            onActiveSessionChange(st);
          }
        }
      };
    } catch {
      bc = null;
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return () => {
      if (bc) bc.close();
    };
  }

  const refreshLobby = async () => {
    const latest = await fetchActiveHouseholdLobbySession(myOwnerName);
    onActiveSessionChange(latest);
  };

  const handleVisibilityOrFocus = () => {
    if (
      typeof document === 'undefined' ||
      document.visibilityState === 'visible'
    ) {
      void refreshLobby();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);
    window.addEventListener('online', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
  }

  const channel: RealtimeChannel = supabase
    .channel(`household_lobby_${HOUSEHOLD_ID}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_sessions',
        filter: `household_id=eq.${HOUSEHOLD_ID}`,
      },
      () => {
        void refreshLobby();
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void refreshLobby();
      }
    });

  return () => {
    if (bc) bc.close();
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
      window.removeEventListener('online', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    }
    supabase.removeChannel(channel);
  };
}

export interface SubscribeGameSessionOptions {
  pollIntervalMs?: number;
  onSyncStatusChange?: (status: 'connecting' | 'live' | 'reconnecting') => void;
}

export function subscribeToGameSession(
  sessionId: string,
  onUpdate: (session: GameSessionState) => void,
  options?: SubscribeGameSessionOptions
): () => void {
  let disposed = false;
  let lastSeenStamp = '';

  const deliverSnapshot = (st: GameSessionState) => {
    if (disposed || !st || st.id !== sessionId) return;
    const tsMs = new Date(st.updatedAt || 0).getTime() || 0;
    lastSeenStamp = `${st.phase}|${tsMs}`;
    saveLocalSession(st);
    onUpdate(st);
  };

  let bc: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel(LOCAL_SYNC_CHANNEL);
      bc.onmessage = (event) => {
        if (event.data?.type === 'SESSION_UPDATE') {
          const st = event.data.session as GameSessionState | undefined;
          if (st && st.id === sessionId) {
            deliverSnapshot(st);
          }
        }
      };
    } catch {
      bc = null;
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return () => {
      disposed = true;
      if (bc) bc.close();
    };
  }

  let catchUpInFlight = false;
  let catchUpQueued = false;

  const catchUpFromCloud = async (forceFullFetch = false): Promise<void> => {
    if (disposed) return;
    if (catchUpInFlight) {
      catchUpQueued = true;
      return;
    }
    catchUpInFlight = true;
    try {
      if (!forceFullFetch && lastSeenStamp) {
        const meta = await fetchSessionMetaById(sessionId);
        if (!meta || disposed) return;
        const remoteStamp = `${meta.phase}|${meta.updatedAtMs}`;
        if (remoteStamp === lastSeenStamp) {
          return;
        }
      }
      const full = await fetchSessionById(sessionId);
      if (full && !disposed) {
        deliverSnapshot(full);
      }
    } finally {
      catchUpInFlight = false;
      if (catchUpQueued && !disposed) {
        catchUpQueued = false;
        void catchUpFromCloud(false);
      }
    }
  };

  let activeChannel: RealtimeChannel | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let channelInstanceSeq = 0;

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!disposed) {
        connectChannel();
      }
    }, 1500);
  };

  const connectChannel = () => {
    if (disposed) return;
    clearReconnectTimer();

    if (activeChannel) {
      if (activeSessionChannels.get(sessionId) === activeChannel) {
        activeSessionChannels.delete(sessionId);
      }
      void supabase.removeChannel(activeChannel).catch(() => {});
      activeChannel = null;
    }

    options?.onSyncStatusChange?.('connecting');
    channelInstanceSeq += 1;
    // Note: keep channel topic stable (`game_session_${sessionId}`) so Realtime Broadcast reaches peers on the same room topic!
    const ch: RealtimeChannel = supabase
      .channel(`game_session_${sessionId}`, {
        config: {
          broadcast: { self: false },
        },
      })
      .on('broadcast', { event: 'session_update' }, (payload) => {
        const st = payload?.payload?.session as GameSessionState | undefined;
        if (st && st.id === sessionId) {
          deliverSnapshot(st);
        }
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const record = payload.new as { state?: GameSessionState } | undefined;
          if (record?.state) {
            deliverSnapshot(record.state);
          }
        }
      );

    const mySeq = channelInstanceSeq;
    activeChannel = ch;

    ch.subscribe((status) => {
      if (disposed || mySeq !== channelInstanceSeq) return;
      if (status === 'SUBSCRIBED') {
        activeSessionChannels.set(sessionId, ch);
        options?.onSyncStatusChange?.('live');
        // Catch up immediately in case partner acted before WebSocket finished subscribing or while iOS backgrounded Safari!
        void catchUpFromCloud(true);
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        if (activeSessionChannels.get(sessionId) === ch) {
          activeSessionChannels.delete(sessionId);
        }
        options?.onSyncStatusChange?.('reconnecting');
        scheduleReconnect();
      }
    });
  };

  connectChannel();
  // Also kick off an immediate HTTP catch-up without waiting for WebSocket handshake on slow cellular networks
  void catchUpFromCloud(true);

  const handleWakeUp = () => {
    if (disposed) return;
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden'
    ) {
      return;
    }
    void catchUpFromCloud(true);
    if (!activeSessionChannels.has(sessionId)) {
      connectChannel();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleWakeUp);
    window.addEventListener('pageshow', handleWakeUp);
    window.addEventListener('online', handleWakeUp);
    document.addEventListener('visibilitychange', handleWakeUp);
  }

  // Lightweight (~75B metadata) heartbeat while visible so silent NAT/WebKit WebSocket drops still update within ~2.5s
  const pollMs = options?.pollIntervalMs ?? 2500;
  const pollInterval = setInterval(() => {
    if (disposed) return;
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden'
    ) {
      return;
    }
    void catchUpFromCloud(false);
  }, pollMs);

  return () => {
    disposed = true;
    clearReconnectTimer();
    clearInterval(pollInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleWakeUp);
      window.removeEventListener('pageshow', handleWakeUp);
      window.removeEventListener('online', handleWakeUp);
      document.removeEventListener('visibilitychange', handleWakeUp);
    }
    if (bc) bc.close();
    if (activeChannel) {
      if (activeSessionChannels.get(sessionId) === activeChannel) {
        activeSessionChannels.delete(sessionId);
      }
      void supabase.removeChannel(activeChannel).catch(() => {});
      activeChannel = null;
    }
  };
}

export function loadLocalRecentWinners(): RecentWinner[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_RECENT_WINNERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentWinner[];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return parsed.filter((w) => new Date(w.createdAt).getTime() >= sevenDaysAgo);
  } catch {
    return [];
  }
}

export function saveLocalRecentWinners(winners: RecentWinner[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_RECENT_WINNERS_KEY, JSON.stringify(winners));
  } catch {
    // ignore
  }
}

export async function fetchRecentWinnersLast7Days(
  nameA?: string | null,
  nameB?: string | null
): Promise<RecentWinner[]> {
  const pairKey = nameA && nameB ? getPairKey(nameA, nameB) : HOUSEHOLD_ID;
  const local = loadLocalRecentWinners().filter(
    (w) =>
      pairKey === HOUSEHOLD_ID ||
      w.householdId === pairKey ||
      w.householdId === HOUSEHOLD_ID
  );
  const supabase = getSupabaseClient();
  if (!supabase) return local;

  try {
    const sevenDaysAgoIso = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const keysToQuery =
      pairKey !== HOUSEHOLD_ID ? [pairKey, HOUSEHOLD_ID] : [HOUSEHOLD_ID];

    const { data, error } = await supabase
      .from('recent_winners')
      .select('*')
      .in('household_id', keysToQuery)
      .gte('created_at', sevenDaysAgoIso)
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) return local;

    // Filter so if pair-specific rows exist, we use pairKey rows (falling back to legacy HOUSEHOLD_ID rows only if pair is Alex & Lauren)
    const isLegacyPair =
      pairKey === 'pair_alex__lauren' || pairKey === HOUSEHOLD_ID;

    const mapped: RecentWinner[] = data
      .filter(
        (row) =>
          row.household_id === pairKey ||
          (isLegacyPair && row.household_id === HOUSEHOLD_ID)
      )
      .map((row) => ({
        id: row.id,
        householdId: row.household_id,
        sessionId: row.session_id,
        placeId: row.place_id,
        name: row.name,
        cuisine: row.cuisine || 'Restaurant',
        mealType: row.meal_type === 'order_in' ? 'order_in' : 'eat_out',
        priceTier: row.price_tier || null,
        address: row.address || '',
        mapsUrl: row.maps_url || '',
        createdAt: row.created_at,
      }));

    return mapped;
  } catch {
    return local;
  }
}

/**
 * Idempotently records the winning restaurant into `recent_winners` (scoped by pairKey)
 * and updates `last_first_player = user1Name` for that specific pair.
 */
export async function recordGameWinnerIdempotent(
  session: GameSessionState
): Promise<void> {
  if (!session.winner) return;

  const winnerOption = session.winner;
  const nowIso = new Date().toISOString();
  const pairKey = getPairKey(session.user1Name, session.user2Name);

  // 1. Update local recent_winners idempotently by sessionId
  const localWinners = loadLocalRecentWinners();
  if (!localWinners.some((w) => w.sessionId === session.id)) {
    const newEntry: RecentWinner = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      householdId: pairKey,
      sessionId: session.id,
      placeId: winnerOption.placeId,
      name: winnerOption.name,
      cuisine: winnerOption.cuisineLabel,
      mealType: winnerOption.mealType,
      priceTier: winnerOption.priceTier,
      address: winnerOption.fullAddress || winnerOption.shortAddress,
      mapsUrl: winnerOption.googleMapsUri,
      createdAt: nowIso,
    };
    saveLocalRecentWinners([newEntry, ...localWinners]);
  }

  // 2. Save per-pair lastFirstPlayer locally and in profile
  saveLastFirstPlayerForPair(
    session.user1Name,
    session.user2Name,
    session.user1Name
  );
  await upsertHouseholdProfile({
    lastFirstPlayer: session.user1Name,
    defaultTransport: session.questionnaire.transportMode,
  });

  // 3. Persist idempotently to Supabase if configured (under pairKey)
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    await Promise.all([
      supabase.from('recent_winners').upsert(
        {
          household_id: pairKey,
          session_id: session.id,
          place_id: winnerOption.placeId,
          name: winnerOption.name,
          cuisine: winnerOption.cuisineLabel,
          meal_type: winnerOption.mealType,
          price_tier: winnerOption.priceTier,
          address: winnerOption.fullAddress || winnerOption.shortAddress,
          maps_url: winnerOption.googleMapsUri,
          created_at: nowIso,
        },
        { onConflict: 'session_id' }
      ),
      pairKey !== HOUSEHOLD_ID
        ? supabase.from('household_profiles').upsert(
            {
              household_id: pairKey,
              player_a: session.user1Name,
              player_b: session.user2Name,
              last_first_player: session.user1Name,
              default_transport: session.questionnaire.transportMode,
              updated_at: nowIso,
            },
            { onConflict: 'household_id' }
          )
        : Promise.resolve(),
    ]);
  } catch {
    // ignore duplicate or network error
  }
}

// ============================================================================
// Household Favorites & Adaptive Taste Learning
// ============================================================================

export function slugifyPlaceId(name: string): string {
  return `fav_${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')}`;
}

export function loadLocalFavorites(): HouseholdFavorite[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HouseholdFavorite[];
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => b.affinityScore - a.affinityScore)
      : [];
  } catch {
    return [];
  }
}

export function saveLocalFavorites(favorites: HouseholdFavorite[]): void {
  if (typeof window === 'undefined') return;
  try {
    const sorted = [...favorites].sort(
      (a, b) => b.affinityScore - a.affinityScore
    );
    window.localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify(sorted));
  } catch {
    // ignore
  }
}

function mapRemoteFavoriteRow(row: Record<string, unknown>): HouseholdFavorite {
  return {
    id: String(row.id || ''),
    householdId: String(row.household_id || HOUSEHOLD_ID),
    placeId: String(row.place_id || ''),
    name: String(row.name || ''),
    cuisine: String(row.cuisine || 'Local Favorite'),
    mealTypes: Array.isArray(row.meal_types)
      ? (row.meal_types as MealType[])
      : ['order_in', 'eat_out'],
    priceTier: (row.price_tier as PriceTier) || '$$',
    shortAddress: String(row.short_address || 'Favorite Spot'),
    notes: String(row.notes || ''),
    source: row.source === 'learned' ? 'learned' : 'uploaded',
    affinityScore: Number(row.affinity_score ?? 5),
    winsCount: Number(row.wins_count ?? 0),
    keptCount: Number(row.kept_count ?? 0),
    rerolledCount: Number(row.rerolled_count ?? 0),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function fetchHouseholdFavorites(
  ownerName?: string | null
): Promise<HouseholdFavorite[]> {
  const local = loadLocalFavorites();
  const supabase = getSupabaseClient();
  if (!supabase) return local;

  const userKey = getUserKey(ownerName);
  const cleanName = (ownerName ?? getDeviceOwnerName() ?? '').trim().toLowerCase();
  const isLegacyOwner =
    cleanName === 'alex' || cleanName === 'lauren' || !cleanName;

  try {
    const keysToQuery =
      isLegacyOwner && userKey !== HOUSEHOLD_ID
        ? [userKey, HOUSEHOLD_ID]
        : [userKey];

    const { data, error } = await supabase
      .from('household_favorites')
      .select('*')
      .in('household_id', keysToQuery)
      .order('affinity_score', { ascending: false });

    if (error || !data || data.length === 0) {
      if (local.length > 0 && userKey !== HOUSEHOLD_ID) {
        await syncFavoritesToSupabase(local, ownerName);
      }
      return local;
    }

    const remote = data.map((row) =>
      mapRemoteFavoriteRow(row as Record<string, unknown>)
    );

    // Merge remote and local by placeId so local uploads are never lost
    const byPlaceId = new Map<string, HouseholdFavorite>();
    for (const item of [...remote, ...local]) {
      byPlaceId.set(item.placeId, {
        ...item,
        householdId: userKey,
      });
    }
    const merged = Array.from(byPlaceId.values()).sort(
      (a, b) => b.affinityScore - a.affinityScore
    );
    saveLocalFavorites(merged);

    // If user had legacy rows under HOUSEHOLD_ID, ensure they're also synced under their personal userKey
    if (
      userKey !== HOUSEHOLD_ID &&
      !data.some((r) => r.household_id === userKey) &&
      merged.length > 0
    ) {
      await syncFavoritesToSupabase(merged, ownerName);
    }

    return merged;
  } catch {
    return local;
  }
}

/**
 * Fetches and combines the Favorites lists of both players in a 2-player game
 * so both players' favorite restaurants are available in Step 1 and Stage 4.
 */
export async function fetchCombinedFavoritesForPlayers(
  playerNames: string[],
  localUserFavorites: HouseholdFavorite[] = []
): Promise<HouseholdFavorite[]> {
  const supabase = getSupabaseClient();
  const userKeys = Array.from(
    new Set(
      playerNames
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => getUserKey(n))
    )
  );

  // Include legacy HOUSEHOLD_ID if either player is Alex or Lauren
  const hasLegacyPlayer = playerNames.some((n) => {
    const c = n.trim().toLowerCase();
    return c === 'alex' || c === 'lauren';
  });
  if (hasLegacyPlayer && !userKeys.includes(HOUSEHOLD_ID)) {
    userKeys.push(HOUSEHOLD_ID);
  }

  let remoteList: HouseholdFavorite[] = [];
  if (supabase && userKeys.length > 0) {
    try {
      const { data, error } = await supabase
        .from('household_favorites')
        .select('*')
        .in('household_id', userKeys)
        .order('affinity_score', { ascending: false });

      if (!error && data) {
        remoteList = data.map((row) =>
          mapRemoteFavoriteRow(row as Record<string, unknown>)
        );
      }
    } catch {
      // ignore
    }
  }

  const byKey = new Map<string, HouseholdFavorite>();
  for (const fav of [...localUserFavorites, ...remoteList]) {
    const existing = byKey.get(fav.placeId);
    if (!existing || fav.affinityScore > existing.affinityScore) {
      byKey.set(fav.placeId, fav);
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) => b.affinityScore - a.affinityScore
  );
}

async function syncFavoritesToSupabase(
  items: HouseholdFavorite[],
  ownerName?: string | null
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || items.length === 0) return;

  const userKey = getUserKey(ownerName);

  try {
    const rows = items.map((f) => ({
      household_id: userKey,
      place_id: f.placeId,
      name: f.name,
      cuisine: f.cuisine,
      meal_types: f.mealTypes,
      price_tier: f.priceTier,
      short_address: f.shortAddress,
      notes: f.notes,
      source: f.source,
      affinity_score: f.affinityScore,
      wins_count: f.winsCount,
      kept_count: f.keptCount,
      rerolled_count: f.rerolledCount,
      updated_at: f.updatedAt,
    }));

    await supabase
      .from('household_favorites')
      .upsert(rows, { onConflict: 'household_id,place_id' });
  } catch {
    // fallback silently to localStorage
  }
}

export async function addUploadedFavorites(
  newEntries: Array<{
    placeId?: string;
    name: string;
    cuisine: string;
    priceTier?: PriceTier;
    mealTypes?: MealType[];
    shortAddress?: string;
    notes?: string;
  }>
): Promise<HouseholdFavorite[]> {
  const existing = loadLocalFavorites();
  const byPlaceId = new Map<string, HouseholdFavorite>(
    existing.map((f) => [f.placeId, f])
  );
  const byNameLower = new Map<string, HouseholdFavorite>(
    existing.map((f) => [f.name.toLowerCase().trim(), f])
  );

  const nowIso = new Date().toISOString();
  const touched: HouseholdFavorite[] = [];

  for (const entry of newEntries) {
    const cleanName = entry.name.trim();
    if (!cleanName) continue;

    const preferredPlaceId = entry.placeId?.trim() || slugifyPlaceId(cleanName);
    const existingMatch =
      byPlaceId.get(preferredPlaceId) ||
      byNameLower.get(cleanName.toLowerCase()) ||
      byPlaceId.get(slugifyPlaceId(cleanName));

    if (existingMatch) {
      const updated: HouseholdFavorite = {
        ...existingMatch,
        placeId: entry.placeId?.trim() || existingMatch.placeId,
        cuisine: entry.cuisine.trim() || existingMatch.cuisine,
        priceTier: entry.priceTier || existingMatch.priceTier,
        mealTypes: entry.mealTypes || existingMatch.mealTypes,
        shortAddress: entry.shortAddress?.trim() || existingMatch.shortAddress,
        notes: entry.notes?.trim() || existingMatch.notes,
        source: 'uploaded',
        affinityScore: Math.max(5, existingMatch.affinityScore + 2),
        updatedAt: nowIso,
      };
      byPlaceId.set(updated.placeId, updated);
      touched.push(updated);
    } else {
      const placeId = preferredPlaceId;
      const created: HouseholdFavorite = {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `fav_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        householdId: HOUSEHOLD_ID,
        placeId,
        name: cleanName,
        cuisine: entry.cuisine.trim() || 'Local Favorite',
        mealTypes: entry.mealTypes || ['order_in', 'eat_out'],
        priceTier: entry.priceTier || '$$',
        shortAddress: entry.shortAddress?.trim() || 'Household Favorite',
        notes: entry.notes?.trim() || '',
        source: 'uploaded',
        affinityScore: 5,
        winsCount: 0,
        keptCount: 0,
        rerolledCount: 0,
        updatedAt: nowIso,
      };
      byPlaceId.set(placeId, created);
      touched.push(created);
    }
  }

  const nextList = Array.from(byPlaceId.values()).sort(
    (a, b) => b.affinityScore - a.affinityScore
  );
  saveLocalFavorites(nextList);
  await syncFavoritesToSupabase(touched);
  return nextList;
}

export async function removeHouseholdFavorite(
  placeId: string
): Promise<HouseholdFavorite[]> {
  const existing = loadLocalFavorites();
  const nextList = existing.filter((f) => f.placeId !== placeId);
  saveLocalFavorites(nextList);

  const supabase = getSupabaseClient();
  if (supabase) {
    const userKey = getUserKey();
    try {
      await supabase
        .from('household_favorites')
        .delete()
        .in('household_id', [userKey, HOUSEHOLD_ID])
        .eq('place_id', placeId);
    } catch {
      // ignore
    }
  }

  return nextList;
}

/**
 * Adaptive Taste Learning Engine:
 * - Kept in Stage 4, Picked as Finalist in Stage 2, or Winner in Stage 1:
 *   Updates affinity & counters ONLY for restaurants that are ALREADY in `household_favorites`.
 *   Does NOT automatically add new restaurants into favorites just because they were kept, selected, or won.
 *   (Users can explicitly fast-add any restaurant to Favorites via the heart button during the selection flow.)
 * - Rerolled / Vetoed: increments rerolledCount (+1) and gently cools down affinity (-0.5, floored at 1.0)
 *   for existing favorites so if the usual favorites get rerolled, fresher options surface.
 */
export async function recordTasteSignals(signals: {
  keptOptions?: DinnerOption[];
  rerolledOptions?: DinnerOption[];
  winnerOption?: DinnerOption;
}): Promise<HouseholdFavorite[]> {
  const existing = loadLocalFavorites();
  const byPlaceId = new Map<string, HouseholdFavorite>(
    existing.map((f) => [f.placeId, f])
  );
  const byNameLower = new Map<string, HouseholdFavorite>(
    existing.map((f) => [f.name.toLowerCase().trim(), f])
  );

  const nowIso = new Date().toISOString();
  const touched: HouseholdFavorite[] = [];

  const findExisting = (opt: DinnerOption) =>
    byPlaceId.get(opt.placeId) || byNameLower.get(opt.name.toLowerCase().trim());

  // 1. Process Kept / Finalist options (+1 affinity for existing favorites only)
  for (const opt of signals.keptOptions || []) {
    const match = findExisting(opt);
    if (match) {
      const updated: HouseholdFavorite = {
        ...match,
        affinityScore: Number((match.affinityScore + 1).toFixed(1)),
        keptCount: match.keptCount + 1,
        updatedAt: nowIso,
      };
      byPlaceId.set(updated.placeId, updated);
      touched.push(updated);
    }
  }

  // 2. Process Rerolled / Vetoed options (-0.5 affinity cooldown + rerolledCount++ for existing favorites)
  for (const opt of signals.rerolledOptions || []) {
    const match = findExisting(opt);
    if (match) {
      const minFloor = match.source === 'uploaded' ? 1.0 : 0.5;
      const updated: HouseholdFavorite = {
        ...match,
        affinityScore: Math.max(
          minFloor,
          Number((match.affinityScore - 0.5).toFixed(1))
        ),
        rerolledCount: match.rerolledCount + 1,
        updatedAt: nowIso,
      };
      byPlaceId.set(updated.placeId, updated);
      touched.push(updated);
    }
  }

  // 3. Process Winner option (+2.5 affinity + winsCount++ for existing favorites only)
  if (signals.winnerOption) {
    const w = signals.winnerOption;
    const match = findExisting(w);
    if (match) {
      const nextMealTypes = match.mealTypes.includes(w.mealType)
        ? match.mealTypes
        : [...match.mealTypes, w.mealType];
      const updated: HouseholdFavorite = {
        ...match,
        mealTypes: nextMealTypes,
        affinityScore: Number((match.affinityScore + 2.5).toFixed(1)),
        winsCount: match.winsCount + 1,
        updatedAt: nowIso,
      };
      byPlaceId.set(updated.placeId, updated);
      touched.push(updated);
    }
  }

  const nextList = Array.from(byPlaceId.values()).sort(
    (a, b) => b.affinityScore - a.affinityScore
  );
  saveLocalFavorites(nextList);
  await syncFavoritesToSupabase(touched);
  return nextList;
}
