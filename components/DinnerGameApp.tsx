'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_DELIVERY_PLATFORMS,
  DEFAULT_FUNNEL,
  DELIVERY_PLATFORMS,
  DeliveryPlatformId,
  DinnerOption,
  GameSessionState,
  GeoLocationData,
  HouseholdFavorite,
  HouseholdProfile,
  LearnedRestaurantDeliveryInfo,
  ManualIncludedPlace,
  MealType,
  PlayerRole,
  PlayMode,
  PRESET_CUISINES,
  QuestionnaireAnswers,
  RecentWinner,
  SURPRISE_ME_LABEL,
  TransportMode,
} from '@/lib/types';
import {
  addRecentPartner,
  addUploadedFavorites,
  compareSessionProgress,
  fetchActiveHouseholdLobbySession,
  fetchCombinedFavoritesForPlayers,
  fetchHouseholdFavorites,
  fetchHouseholdProfile,
  fetchRecentWinnersLast7Days,
  fetchSessionById,
  fetchSessionByRoomCode,
  fetchSharedLearnedDeliveryCache,
  getDefaultProfile,
  getDeviceOwnerName,
  getDeviceOwnerSlot,
  getDeviceRoleForSession,
  HOUSEHOLD_ID,
  isPlaceholderPartnerName,
  joinSessionPlayerSafely,
  loadLearnedDeliveryCache,
  loadLocalSession,
  loadRecentPartners,
  mergeSessionStates,
  recordGameWinnerIdempotent,
  recordTasteSignals,
  removeHouseholdFavorite,
  removeRecentPartner,
  saveDeviceOwnerName,
  saveDeviceOwnerSlot,
  saveDeviceRoleForSession,
  saveLearnedDeliveryEntries,
  saveLocalSession,
  savePreferredDeliveryApps,
  subscribeToGameSession,
  subscribeToHouseholdLobby,
  syncGameSession,
  upsertHouseholdProfile,
} from '@/lib/supabase';
import { SetupScreen } from './SetupScreen';
import { copyTextResilient, FunnelHeader } from './FunnelHeader';
import { QuestionnaireView } from './QuestionnaireView';
import { RestaurantCard } from './RestaurantCard';
import { FavoritesSheet } from './FavoritesSheet';
import UserSettingsSheet from './UserSettingsSheet';
import { Stage4AddSpotSheet } from './Stage4AddSpotSheet';
import { Stage4FilterSheet } from './Stage4FilterSheet';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Heart,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Trophy,
  Utensils,
  X,
} from 'lucide-react';

interface DinnerGameAppProps {
  initialRoomCode?: string;
}

function generateRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generateUuid(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
      ''
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
      12,
      16
    )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

const LS_LAST_KNOWN_LOCATION_KEY = '421_last_known_location_v1';

function loadCachedLocation(): GeoLocationData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_LAST_KNOWN_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GeoLocationData;
    if (
      parsed &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      typeof parsed.label === 'string' &&
      parsed.label.trim()
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveCachedLocation(loc: GeoLocationData): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_LAST_KNOWN_LOCATION_KEY, JSON.stringify(loc));
  } catch {
    // ignore
  }
}

async function resolveReadableLocationLabel(
  lat: number,
  lng: number
): Promise<string> {
  const coordPattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/;

  // 1. Try server-side `/api/geocode` (uses Google Places API (New) + Nominatim)
  try {
    const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
    if (res.ok) {
      const data = await res.json();
      if (
        data?.label &&
        data.label !== 'Current Area' &&
        !coordPattern.test(data.label.trim())
      ) {
        return data.label.trim();
      }
    }
  } catch {
    // Continue to browser fallbacks
  }

  // 2. Try OpenStreetMap Nominatim directly from browser (returns exact neighborhood/suburb/borough)
  try {
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=15&addressdetails=1`,
      { headers: { Accept: 'application/json' } }
    );
    if (nomRes.ok) {
      const nom = await nomRes.json();
      const addr = nom?.address || {};
      const neighborhood =
        addr.neighbourhood ||
        addr.suburb ||
        addr.quarter ||
        addr.city_district ||
        addr.borough ||
        addr.village ||
        addr.hamlet;
      const city = addr.city || addr.town || addr.municipality || addr.county;
      if (neighborhood && city && neighborhood !== city) {
        return `${neighborhood}, ${city}`;
      }
      if (neighborhood) return neighborhood;
      if (city) return city;
    }
  } catch {
    // Continue to BigDataCloud fallback
  }

  // 3. Try BigDataCloud client reverse-geocode (extracting most granular borough/neighborhood)
  try {
    const bdcRes = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    if (bdcRes.ok) {
      const bdc = await bdcRes.json();
      const infoAdmin = Array.isArray(bdc.localityInfo?.administrative)
        ? bdc.localityInfo.administrative
        : [];
      const granularAdmin = [...infoAdmin]
        .reverse()
        .find(
          (item: { name?: string }) =>
            item?.name &&
            item.name !== bdc.city &&
            item.name !== bdc.principalSubdivision &&
            item.name !== bdc.countryName
        )?.name;

      const locality = granularAdmin || bdc.locality || '';
      const city = bdc.city || bdc.principalSubdivision || '';
      if (locality && city && locality !== city) {
        return `${locality}, ${city}`;
      }
      if (locality || city) {
        return locality || city;
      }
    }
  } catch {
    // Fall through
  }

  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

export function DinnerGameApp({ initialRoomCode }: DinnerGameAppProps) {
  const [profile, setProfile] = useState<HouseholdProfile>(getDefaultProfile());
  const [location, setLocation] = useState<GeoLocationData | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [recentWinners, setRecentWinners] = useState<RecentWinner[]>([]);
  const [favorites, setFavorites] = useState<HouseholdFavorite[]>([]);
  const [showFavoritesSheet, setShowFavoritesSheet] = useState<boolean>(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState<boolean>(false);
  const [deviceOwnerName, setDeviceOwnerName] = useState<string>('');
  const [hasCheckedOwnerName, setHasCheckedOwnerName] =
    useState<boolean>(false);
  const [inGameOnboardingInput, setInGameOnboardingInput] =
    useState<string>('');
  const [recentPartners, setRecentPartners] = useState<string[]>([]);
  const [learnedDeliveryCache, setLearnedDeliveryCache] = useState<
    Record<string, LearnedRestaurantDeliveryInfo>
  >({});
  const [activeLobbySession, setActiveLobbySession] =
    useState<GameSessionState | null>(null);

  const [session, setSession] = useState<GameSessionState | null>(null);
  const [deviceRole, setDeviceRole] = useState<PlayerRole>('user1');

  // Local UI states for active game phases (Stage 4 keep & reroll state)
  const [keptFourIds, setKeptFourIds] = useState<string[]>([]);
  const [rerollingPlaceIds, setRerollingPlaceIds] = useState<string[]>([]);
  const [isRerollingAll, setIsRerollingAll] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showStage4AddSpot, setShowStage4AddSpot] = useState<boolean>(false);
  const [addingManualPlaceId, setAddingManualPlaceId] = useState<string | null>(
    null
  );
  const [showStage4FilterSheet, setShowStage4FilterSheet] =
    useState<boolean>(false);
  const [showInlineCuisinePicker, setShowInlineCuisinePicker] =
    useState<boolean>(false);
  const [inlineCustomCuisine, setInlineCustomCuisine] = useState<string>('');
  const [hasUnrolledCuisineEdit, setHasUnrolledCuisineEdit] =
    useState<boolean>(false);

  // Stage 2 (User 2 picks 2 or vetoes) local selection state
  const [selectedTwoIds, setSelectedTwoIds] = useState<string[]>([]);
  const [showVetoConfirmSheet, setShowVetoConfirmSheet] =
    useState<boolean>(false);
  const [selectionNudge, setSelectionNudge] = useState<string | null>(null);

  // Stage 1 (User 1 picks 1 winner) local selection state
  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(null);

  // Live 2-phone sync reliability states & refs
  const [syncFailed, setSyncFailed] = useState<boolean>(false);
  const [isRetryingSync, setIsRetryingSync] = useState<boolean>(false);
  const [liveSyncStatus, setLiveSyncStatus] = useState<
    'connecting' | 'live' | 'reconnecting'
  >('live');
  const [isManualRefreshing, setIsManualRefreshing] = useState<boolean>(false);
  const [showCustomJoinInput, setShowCustomJoinInput] =
    useState<boolean>(false);

  const sessionRef = useRef<GameSessionState | null>(null);
  sessionRef.current = session;
  const pendingSyncSessionRef = useRef<GameSessionState | null>(null);
  const hasHandledInitialRoomRef = useRef<boolean>(false);
  const recordedWinnerSessionRef = useRef<string | null>(null);

  const applyIncomingRemoteSession = useCallback(
    (incoming: GameSessionState, roleOverride?: PlayerRole) => {
      if (!incoming) return;

      // If partner ended/abandoned the live game, exit cleanly back to Setup instead of hanging on a dead room
      if (incoming.abandoned && incoming.phase !== 'WINNER') {
        if (!sessionRef.current || sessionRef.current.id === incoming.id) {
          pendingSyncSessionRef.current = null;
          setSyncFailed(false);
          saveLocalSession(null);
          sessionRef.current = null;
          setSession(null);
          setActiveLobbySession(null);
          if (
            typeof window !== 'undefined' &&
            window.location.pathname.startsWith('/room/')
          ) {
            window.history.replaceState(window.history.state, '', '/');
          }
        }
        return;
      }

      const effectiveRole = roleOverride || deviceRole;
      if (
        effectiveRole === 'user1' &&
        incoming.user2Name &&
        !isPlaceholderPartnerName(incoming.user2Name)
      ) {
        setRecentPartners(
          addRecentPartner(
            incoming.user2Name,
            deviceOwnerName || getDeviceOwnerName()
          )
        );
      }

      setSession((prev) => {
        if (!prev || prev.id !== incoming.id) {
          sessionRef.current = incoming;
          saveLocalSession(incoming);
          return incoming;
        }

        const merged = mergeSessionStates(prev, incoming);

        if (
          prev.phase !== merged.phase &&
          typeof navigator !== 'undefined' &&
          navigator.vibrate
        ) {
          navigator.vibrate(30);
        }

        if (
          pendingSyncSessionRef.current &&
          pendingSyncSessionRef.current.id === merged.id &&
          compareSessionProgress(merged, pendingSyncSessionRef.current) >= 0
        ) {
          pendingSyncSessionRef.current = null;
          setSyncFailed(false);
        }

        sessionRef.current = merged;
        saveLocalSession(merged);
        return merged;
      });
    },
    [deviceRole, deviceOwnerName]
  );

  // 2b. Keep URL synced to `/room/[code]` during active 2-phone games so browser reload & native iOS Share always work
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (
      session &&
      session.playMode === 'two_phones' &&
      session.phase !== 'SETUP' &&
      !session.abandoned &&
      session.roomCode
    ) {
      const targetPath = `/room/${session.roomCode}`;
      if (window.location.pathname !== targetPath) {
        window.history.replaceState(window.history.state, '', targetPath);
      }
    } else if (
      (!session || session.phase === 'SETUP') &&
      hasHandledInitialRoomRef.current &&
      window.location.pathname.startsWith('/room/')
    ) {
      window.history.replaceState(window.history.state, '', '/');
    }
  }, [session]);
  const detectBrowserLocation = useCallback((forceFresh = false) => {
    const applyAndCacheLocation = (loc: GeoLocationData) => {
      setLocation(loc);
      saveCachedLocation(loc);
      setLocationError(null);
      setIsLocating(false);
    };

    // Hydrate cached location immediately on initial mount so UI is never stuck or blank
    if (!forceFresh) {
      const cached = loadCachedLocation();
      if (cached) {
        setLocation((prev) => prev || cached);
      }
    }

    const fallbackToIpOrCached = async () => {
      // Try IP-based location via BigDataCloud (works without latitude/longitude!)
      try {
        const bdcRes = await fetch(
          'https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en'
        );
        if (bdcRes.ok) {
          const bdc = await bdcRes.json();
          if (
            typeof bdc.latitude === 'number' &&
            typeof bdc.longitude === 'number'
          ) {
            const label = await resolveReadableLocationLabel(
              bdc.latitude,
              bdc.longitude
            );
            applyAndCacheLocation({
              lat: bdc.latitude,
              lng: bdc.longitude,
              label,
            });
            return;
          }
        }
      } catch {
        // Ignore IP geocode error
      }

      const cached = loadCachedLocation();
      if (cached) {
        applyAndCacheLocation(cached);
        return;
      }

      setIsLocating(false);
      setLocation((prev) =>
        prev || {
          lat: 40.7336,
          lng: -74.0027,
          label: 'West Village, New York',
        }
      );
    };

    if (typeof window === 'undefined' || !navigator.geolocation) {
      fallbackToIpOrCached();
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    const onGpsSuccess = async (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const label = await resolveReadableLocationLabel(lat, lng);
      applyAndCacheLocation({ lat, lng, label });
    };

    // Attempt 1: Fast network/Wi-Fi location (accept cached fix up to 15 mins old, 8s timeout)
    navigator.geolocation.getCurrentPosition(
      onGpsSuccess,
      () => {
        // Attempt 2: Retry with highAccuracy and longer timeout (12s) in case Wi-Fi positioning timed out
        navigator.geolocation.getCurrentPosition(
          onGpsSuccess,
          () => {
            fallbackToIpOrCached();
          },
          {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 600000,
          }
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: forceFresh ? 0 : 900000,
      }
    );
  }, []);

  // 2. Initial bootstrap: load profile, recent winners, active household lobby, or initialRoomCode
  useEffect(() => {
    detectBrowserLocation();
    setLearnedDeliveryCache(loadLearnedDeliveryCache());
    fetchSharedLearnedDeliveryCache().then(setLearnedDeliveryCache);

    const savedOwnerName = getDeviceOwnerName() || '';
    const savedOwnerSlot = getDeviceOwnerSlot();
    if (savedOwnerName) {
      setDeviceOwnerName(savedOwnerName);
    }
    setHasCheckedOwnerName(true);
    setRecentPartners(loadRecentPartners(savedOwnerName));

    (async () => {
      const [loadedProfile, favs, lobby] = await Promise.all([
        fetchHouseholdProfile(),
        fetchHouseholdFavorites(savedOwnerName || undefined),
        fetchActiveHouseholdLobbySession(savedOwnerName || undefined),
      ]);

      if (savedOwnerName) {
        setDeviceOwnerName(savedOwnerName);
        const lowerSaved = savedOwnerName.toLowerCase();
        if (lowerSaved === (loadedProfile.playerB || '').trim().toLowerCase()) {
          saveDeviceOwnerSlot('B');
          setProfile(loadedProfile);
        } else if (
          lowerSaved === (loadedProfile.playerA || '').trim().toLowerCase()
        ) {
          saveDeviceOwnerSlot('A');
          setProfile(loadedProfile);
        } else {
          const targetSlot = savedOwnerSlot || 'A';
          saveDeviceOwnerSlot(targetSlot);
          const syncedProfile = await upsertHouseholdProfile(
            targetSlot === 'A'
              ? { playerA: savedOwnerName }
              : { playerB: savedOwnerName }
          );
          setProfile(syncedProfile);
        }
      } else {
        // Leave deviceOwnerName empty so first-time users see the 1-step "What's your name?" onboarding prompt
        setDeviceOwnerName('');
        setProfile(loadedProfile);
      }

      const partners = loadRecentPartners(savedOwnerName, loadedProfile);
      setRecentPartners(partners);

      const defaultPartner = partners[0] || '';
      const winners =
        savedOwnerName && defaultPartner
          ? await fetchRecentWinnersLast7Days(savedOwnerName, defaultPartner)
          : await fetchRecentWinnersLast7Days();

      setRecentWinners(winners);
      setFavorites(favs);
      if (lobby) {
        setActiveLobbySession(lobby);
      }

      // If opened via /room/[code], auto-join that room safely (without clobbering concurrent turns!)
      if (initialRoomCode && !hasHandledInitialRoomRef.current) {
        hasHandledInitialRoomRef.current = true;
        const found = await fetchSessionByRoomCode(initialRoomCode);
        if (found) {
          const mySavedName = (getDeviceOwnerName() || '').trim();
          const myNameLower = mySavedName.toLowerCase();
          const inferredRole: PlayerRole | null = myNameLower
            ? found.user1Name.trim().toLowerCase() === myNameLower
              ? 'user1'
              : found.user2Name.trim().toLowerCase() === myNameLower
              ? 'user2'
              : null
            : null;
          const savedRole =
            getDeviceRoleForSession(found.id) || inferredRole || 'user2';

          let joinedSession = found;
          if (mySavedName) {
            joinedSession = await joinSessionPlayerSafely({
              sessionId: found.id,
              fallbackSession: found,
              role: savedRole,
              playerName: mySavedName,
              localFavorites: favs,
            });
            const otherPlayerName =
              savedRole === 'user1'
                ? joinedSession.user2Name
                : joinedSession.user1Name;
            if (otherPlayerName && !isPlaceholderPartnerName(otherPlayerName)) {
              setRecentPartners(addRecentPartner(otherPlayerName, mySavedName));
            }
          }

          saveDeviceRoleForSession(joinedSession.id, savedRole);
          setDeviceRole(savedRole);
          setLocation(joinedSession.location);
          if (Array.isArray(joinedSession.keptPlaceIds)) {
            setKeptFourIds(joinedSession.keptPlaceIds);
          }
          sessionRef.current = joinedSession;
          setSession(joinedSession);
          saveLocalSession(joinedSession);
          return;
        } else if (typeof window !== 'undefined') {
          window.history.replaceState(window.history.state, '', '/');
        }
      }

      // Restore active in-progress local session if present, then immediately reconcile with cloud!
      const localSess = loadLocalSession();
      if (localSess && !localSess.abandoned && localSess.phase !== 'SETUP') {
        const savedRole = getDeviceRoleForSession(localSess.id) || 'user1';
        setDeviceRole(savedRole);
        if (Array.isArray(localSess.keptPlaceIds)) {
          setKeptFourIds(localSess.keptPlaceIds);
        }
        sessionRef.current = localSess;
        setSession(localSess);

        if (localSess.playMode === 'two_phones') {
          const remoteSess = await fetchSessionById(localSess.id);
          if (remoteSess) {
            applyIncomingRemoteSession(remoteSess, savedRole);
          }
        }
      }
    })();
  }, [detectBrowserLocation, initialRoomCode, applyIncomingRemoteSession]);

  // 3. Subscribe to Household Auto-Lobby when on SETUP screen (scoped to deviceOwnerName)
  useEffect(() => {
    if (session && session.phase !== 'SETUP') return;
    const unsubscribe = subscribeToHouseholdLobby(
      (latestLobby) => {
        setActiveLobbySession(latestLobby);
      },
      deviceOwnerName || undefined
    );
    return unsubscribe;
  }, [session, deviceOwnerName]);

  // 4. Subscribe to Realtime + Foreground Catch-Up + Heartbeat Polling for active 2-phone game session
  useEffect(() => {
    if (!session?.id || session.playMode !== 'two_phones') return;
    const unsubscribe = subscribeToGameSession(
      session.id,
      (updated) => {
        applyIncomingRemoteSession(updated);
      },
      {
        pollIntervalMs: 2500,
        onSyncStatusChange: setLiveSyncStatus,
      }
    );
    return unsubscribe;
  }, [session?.id, session?.playMode, applyIncomingRemoteSession]);

  // 5. Reset Stage 4 / Stage 2 / Stage 1 local selections when entering those phases
  useEffect(() => {
    if (session?.phase === 'GENERATING') {
      setKeptFourIds([]);
    }
    if (session?.phase === 'U2_PICK_2') {
      setSelectedTwoIds([]);
      setSelectionNudge(null);
      setShowVetoConfirmSheet(false);
    }
    if (session?.phase === 'U1_PICK_1') {
      setSelectedWinnerId(null);
    }
  }, [session?.phase, session?.roundNumber]);

  // 6. Idempotently persist winner to `recent_winners` and update `last_first_player` when entering WINNER phase
  useEffect(() => {
    if (
      session?.phase === 'WINNER' &&
      session.winner &&
      recordedWinnerSessionRef.current !== session.id
    ) {
      recordedWinnerSessionRef.current = session.id;
      Promise.all([
        recordGameWinnerIdempotent(session),
        recordTasteSignals({ winnerOption: session.winner }),
      ]).then(async ([, updatedFavs]) => {
        const [updatedProfile, updatedWinners] = await Promise.all([
          fetchHouseholdProfile(),
          fetchRecentWinnersLast7Days(session.user1Name, session.user2Name),
        ]);
        setProfile(updatedProfile);
        setRecentWinners(updatedWinners);
        setFavorites(updatedFavs);
      });
    }
  }, [session]);

  const handleRetryPendingSync = useCallback(async () => {
    const pending = pendingSyncSessionRef.current;
    if (!pending) {
      setSyncFailed(false);
      return;
    }
    setIsRetryingSync(true);
    try {
      const latestRemote = await fetchSessionById(pending.id);
      const toPush = latestRemote
        ? mergeSessionStates(latestRemote, pending)
        : pending;
      const ok = await syncGameSession(toPush);
      if (ok) {
        pendingSyncSessionRef.current = null;
        setSyncFailed(false);
        sessionRef.current = toPush;
        setSession(toPush);
      }
    } finally {
      setIsRetryingSync(false);
    }
  }, []);

  // Automatically retry any failed turn sync every 3s and immediately when network/tab wakes up
  useEffect(() => {
    if (!syncFailed) return;
    const interval = setInterval(() => {
      void handleRetryPendingSync();
    }, 3000);
    const onWake = () => {
      if (
        typeof document === 'undefined' ||
        document.visibilityState === 'visible'
      ) {
        void handleRetryPendingSync();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onWake);
      window.addEventListener('focus', onWake);
      document.addEventListener('visibilitychange', onWake);
    }
    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onWake);
        window.removeEventListener('focus', onWake);
        document.removeEventListener('visibilitychange', onWake);
      }
    };
  }, [syncFailed, handleRetryPendingSync]);

  const handleManualRefreshSession = useCallback(async () => {
    const currentId = sessionRef.current?.id;
    if (!currentId) return;
    setIsManualRefreshing(true);
    try {
      if (pendingSyncSessionRef.current) {
        await handleRetryPendingSync();
      }
      const remote = await fetchSessionById(currentId);
      if (remote) {
        applyIncomingRemoteSession(remote);
      }
    } finally {
      setIsManualRefreshing(false);
    }
  }, [applyIncomingRemoteSession, handleRetryPendingSync]);

  const updateAndSyncSession = async (next: GameSessionState) => {
    const latestInMemory = sessionRef.current;
    const nextRevision =
      Math.max(
        next.revision ?? 0,
        latestInMemory?.id === next.id ? latestInMemory.revision ?? 0 : 0
      ) + 1;

    const candidate: GameSessionState = {
      ...next,
      revision: nextRevision,
      updatedAt: new Date().toISOString(),
    };

    const prepared =
      latestInMemory && latestInMemory.id === candidate.id
        ? mergeSessionStates(latestInMemory, candidate)
        : candidate;

    sessionRef.current = prepared;
    setSession(prepared);

    const ok = await syncGameSession(prepared);
    if (!ok && prepared.playMode === 'two_phones') {
      pendingSyncSessionRef.current = prepared;
      setSyncFailed(true);
    } else if (ok) {
      if (
        !pendingSyncSessionRef.current ||
        pendingSyncSessionRef.current.id !== prepared.id ||
        compareSessionProgress(prepared, pendingSyncSessionRef.current) >= 0
      ) {
        pendingSyncSessionRef.current = null;
        setSyncFailed(false);
      }
    }
  };

  const handleUpdateProfileNames = async (updates: {
    playerA: string;
    playerB: string;
  }) => {
    const next = await upsertHouseholdProfile(updates);
    setProfile(next);
  };

  const handleUpdatePreferredDeliveryApps = async (
    apps: DeliveryPlatformId[]
  ) => {
    savePreferredDeliveryApps(apps);
    const next = await upsertHouseholdProfile({ preferredDeliveryApps: apps });
    setProfile(next);
  };

  const handleUpdateDefaultTransport = async (mode: TransportMode) => {
    const next = await upsertHouseholdProfile({ defaultTransport: mode });
    setProfile(next);
  };

  const handleSaveDeviceOwnerName = async (
    newName: string,
    explicitRole?: PlayerRole
  ) => {
    const clean = newName.trim();
    if (!clean) return;
    saveDeviceOwnerName(clean);
    setDeviceOwnerName(clean);
    setShowCustomJoinInput(false);

    const activeRole = explicitRole || deviceRole;
    if (explicitRole && explicitRole !== deviceRole) {
      setDeviceRole(explicitRole);
    }

    const lowerClean = clean.toLowerCase();
    let targetSlot: 'A' | 'B';
    if (lowerClean === (profile.playerB || '').trim().toLowerCase()) {
      targetSlot = 'B';
    } else if (lowerClean === (profile.playerA || '').trim().toLowerCase()) {
      targetSlot = 'A';
    } else {
      targetSlot = getDeviceOwnerSlot() || 'A';
    }
    saveDeviceOwnerSlot(targetSlot);
    const next = await upsertHouseholdProfile(
      targetSlot === 'A' ? { playerA: clean } : { playerB: clean }
    );
    setProfile(next);

    const updatedPartners = loadRecentPartners(clean, next);
    setRecentPartners(updatedPartners);
    const loadedFavs = await fetchHouseholdFavorites(clean);
    setFavorites(loadedFavs);
    fetchActiveHouseholdLobbySession(clean).then(setActiveLobbySession);

    // If currently in an active 2-phone game, safely merge this player's name onto the latest remote session!
    const currentSess = sessionRef.current;
    if (currentSess && currentSess.playMode === 'two_phones') {
      saveDeviceRoleForSession(currentSess.id, activeRole);
      const joined = await joinSessionPlayerSafely({
        sessionId: currentSess.id,
        fallbackSession: currentSess,
        role: activeRole,
        playerName: clean,
        localFavorites: loadedFavs,
      });
      const otherPlayerName =
        activeRole === 'user1' ? joined.user2Name : joined.user1Name;
      if (otherPlayerName && !isPlaceholderPartnerName(otherPlayerName)) {
        setRecentPartners(addRecentPartner(otherPlayerName, clean));
      }
      sessionRef.current = joined;
      setSession(joined);
      saveLocalSession(joined);
    }
  };

  const handleAddPartner = (partnerName: string) => {
    const updated = addRecentPartner(partnerName, deviceOwnerName);
    setRecentPartners(updated);
  };

  const handleRemovePartner = (partnerName: string) => {
    const updated = removeRecentPartner(partnerName, deviceOwnerName);
    setRecentPartners(updated);
  };

  const handleStartGame = async ({
    playMode,
    user1Name,
    user2Name,
    holderName,
    isOpenInvite,
  }: {
    playMode: PlayMode;
    user1Name: string;
    user2Name: string;
    holderName: string;
    isOpenInvite?: boolean;
  }) => {
    if (!location) return;

    const [pairWinners, combinedFavs] = await Promise.all([
      isOpenInvite
        ? Promise.resolve([])
        : fetchRecentWinnersLast7Days(user1Name, user2Name),
      fetchCombinedFavoritesForPlayers(
        isOpenInvite ? [user1Name] : [user1Name, user2Name],
        favorites
      ),
    ]);
    setRecentWinners(pairWinners);

    const uniqueRecentIds = dedupeStrings(pairWinners.map((w) => w.placeId));
    const sessionId = generateUuid();
    const roomCode = generateRoomCode();
    const nowIso = new Date().toISOString();

    const myRole: PlayerRole =
      playMode === 'two_phones' && holderName === user2Name ? 'user2' : 'user1';

    const newSession: GameSessionState = {
      id: sessionId,
      householdId: HOUSEHOLD_ID,
      roomCode,
      playMode,
      phase: 'Q_PAGE_1',
      funnelSteps: [...DEFAULT_FUNNEL],
      location,
      players: [
        { id: 'p1', name: user1Name, role: 'user1' },
        { id: 'p2', name: user2Name, role: 'user2' },
      ],
      user1Name,
      user2Name,
      isOpenInvite: Boolean(isOpenInvite),
      combinedFavorites: combinedFavs,
      questionnaire: {
        mealTypes: ['order_in'],
        cuisines: [SURPRISE_ME_LABEL],
        cravingsNote: '',
        excludeRecentWinners: uniqueRecentIds.length > 0,
        excludedRecentWinnerIds: uniqueRecentIds,
        manuallyIncludedPlaces: [],
        priceTiers: ['$$'],
        deliveryTiming: 'under_45',
        transportMode: profile.defaultTransport || 'drive',
        maxTravelMinutes: 25,
      },
      excludedPlaceIds: [],
      excludedNames: [],
      candidatePool: [],
      currentFour: [],
      finalistTwo: [],
      winner: null,
      user2VetoesRemaining: 1,
      notice: null,
      exhausted: false,
      roundNumber: 1,
      rerollCount: 0,
      keptPlaceIds: [],
      revision: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    hasHandledInitialRoomRef.current = true;
    saveDeviceRoleForSession(sessionId, myRole);
    setDeviceRole(myRole);
    setApiError(null);
    await updateAndSyncSession(newSession);
  };

  const handleJoinLobbySession = async (
    targetSession: GameSessionState,
    asRole: PlayerRole
  ) => {
    const mySavedName = (deviceOwnerName || getDeviceOwnerName() || '').trim();
    const joinedSession = await joinSessionPlayerSafely({
      sessionId: targetSession.id,
      fallbackSession: targetSession,
      role: asRole,
      playerName: mySavedName || null,
      localFavorites: favorites,
    });

    const otherPlayerName =
      asRole === 'user1' ? joinedSession.user2Name : joinedSession.user1Name;
    if (
      mySavedName &&
      otherPlayerName &&
      !isPlaceholderPartnerName(otherPlayerName)
    ) {
      setRecentPartners(addRecentPartner(otherPlayerName, mySavedName));
    }

    if (
      joinedSession.user1Name &&
      joinedSession.user2Name &&
      !isPlaceholderPartnerName(joinedSession.user2Name)
    ) {
      fetchRecentWinnersLast7Days(
        joinedSession.user1Name,
        joinedSession.user2Name
      ).then(setRecentWinners);
    }

    hasHandledInitialRoomRef.current = true;
    saveDeviceRoleForSession(joinedSession.id, asRole);
    setDeviceRole(asRole);
    setLocation(joinedSession.location);
    if (Array.isArray(joinedSession.keptPlaceIds)) {
      setKeptFourIds(joinedSession.keptPlaceIds);
    }
    sessionRef.current = joinedSession;
    setSession(joinedSession);
    saveLocalSession(joinedSession);
  };

  const handleDismissLobbySession = async (staleSession: GameSessionState) => {
    setActiveLobbySession(null);
    await syncGameSession({
      ...staleSession,
      abandoned: true,
    });
  };

  const handleJoinByRoomCode = async (code: string): Promise<boolean> => {
    const found = await fetchSessionByRoomCode(code);
    if (!found) return false;
    const mySavedName = (deviceOwnerName || getDeviceOwnerName() || '').trim();
    const ownerSlot = getDeviceOwnerSlot();
    const myPlayerName =
      mySavedName ||
      (ownerSlot === 'A'
        ? profile.playerA
        : ownerSlot === 'B'
        ? profile.playerB
        : null);
    const inferredRole: PlayerRole =
      myPlayerName &&
      found.user1Name.trim().toLowerCase() ===
        myPlayerName.trim().toLowerCase()
        ? 'user1'
        : 'user2';

    await handleJoinLobbySession(found, inferredRole);
    return true;
  };

  const handleResetToSetup = async () => {
    const active = sessionRef.current || session;
    pendingSyncSessionRef.current = null;
    setSyncFailed(false);
    if (
      active &&
      active.playMode === 'two_phones' &&
      active.phase !== 'WINNER'
    ) {
      await syncGameSession({
        ...active,
        abandoned: true,
      });
    }
    saveLocalSession(null);
    sessionRef.current = null;
    setSession(null);
    setActiveLobbySession(null);
    setApiError(null);
    if (
      typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/room/')
    ) {
      window.history.replaceState(window.history.state, '', '/');
    }
  };

  /**
   * Calls `/api/options` to generate 4 options (initial, after User 1 Reroll All 4, or after User 2 Veto)
   */
  const generateFourOptions = async (
    baseSession: GameSessionState,
    mode: 'initial' | 'reroll_all',
    forceRefreshPool = false
  ) => {
    setApiError(null);
    setIsRerollingAll(true);
    setHasUnrolledCuisineEdit(false);

    const generatingState: GameSessionState = {
      ...baseSession,
      phase: 'GENERATING',
    };
    await updateAndSyncSession(generatingState);

    try {
      const activeFavs =
        baseSession.combinedFavorites &&
        baseSession.combinedFavorites.length > 0
          ? baseSession.combinedFavorites
          : favorites;
      const res = await fetch('/api/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          location: baseSession.location,
          questionnaire: baseSession.questionnaire,
          excludedPlaceIds: baseSession.excludedPlaceIds,
          excludedNames: baseSession.excludedNames,
          candidatePool: baseSession.candidatePool,
          favorites: activeFavs,
          preferredDeliveryApps:
            profile.preferredDeliveryApps || DEFAULT_DELIVERY_PLATFORMS,
          learnedDeliveryCache,
          rerollCount: baseSession.rerollCount || 0,
          forceRefreshPool,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to fetch dinner options.');
      }

      if (
        Array.isArray(data.learnedDeliveryUpdates) &&
        data.learnedDeliveryUpdates.length > 0
      ) {
        const updatedCache = saveLearnedDeliveryEntries(
          data.learnedDeliveryUpdates
        );
        setLearnedDeliveryCache(updatedCache);
      }

      const returnedOptions: DinnerOption[] = data.options || [];

      // On initial Stage 4 generation, preselect any manually added restaurants as "Keep"
      let initialKeptIds: string[] = [];
      if (mode === 'initial') {
        const manualList = baseSession.questionnaire.manuallyIncludedPlaces || [];
        const manualIds = new Set(manualList.map((m) => m.placeId));
        const manualNames = new Set(
          manualList.map((m) => m.name.trim().toLowerCase())
        );
        initialKeptIds = returnedOptions
          .filter(
            (opt) =>
              manualIds.has(opt.placeId) ||
              manualNames.has(opt.name.trim().toLowerCase())
          )
          .map((opt) => opt.placeId);
      }
      setKeptFourIds(initialKeptIds);

      const nextSession: GameSessionState = {
        ...baseSession,
        phase: 'U1_REVIEW_4',
        currentFour: returnedOptions,
        keptPlaceIds: initialKeptIds,
        candidatePool: data.candidatePool || [],
        notice: data.notice || null,
        exhausted: Boolean(data.exhausted),
      };
      await updateAndSyncSession(nextSession);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error generating options.';
      setApiError(message);
      await updateAndSyncSession({
        ...baseSession,
        phase:
          baseSession.currentFour.length > 0 ? 'U1_REVIEW_4' : 'Q_PAGE_2',
      });
    } finally {
      setIsRerollingAll(false);
    }
  };

  /**
   * Stage 4: User 1 taps cards they want to keep
   */
  const handleToggleKeepStage4 = (option: DinnerOption) => {
    if (rerollingPlaceIds.length > 0 || isRerollingAll) return;
    const id = option.placeId;
    const nextKept = keptFourIds.includes(id)
      ? keptFourIds.filter((item) => item !== id)
      : [...keptFourIds, id];
    setKeptFourIds(nextKept);
    if (session) {
      const updated = { ...session, keptPlaceIds: nextKept };
      setSession(updated);
      saveLocalSession(updated);
    }
  };

  /**
   * Computes balanced target mealTypes for `slotsNeeded` replacements while accounting for kept cards
   */
  const computeReplacementMealTypes = (
    questionnaire: QuestionnaireAnswers,
    keptCards: DinnerOption[],
    slotsNeeded: number
  ): MealType[] => {
    const wantsOrderIn = questionnaire.mealTypes.includes('order_in');
    const wantsEatOut = questionnaire.mealTypes.includes('eat_out');
    if (wantsOrderIn && !wantsEatOut) {
      return Array(slotsNeeded).fill('order_in');
    }
    if (wantsEatOut && !wantsOrderIn) {
      return Array(slotsNeeded).fill('eat_out');
    }
    // Both selected: aim for 2 order_in + 2 eat_out across the 4 total cards
    const keptOrderIn = keptCards.filter((c) => c.mealType === 'order_in').length;
    const keptEatOut = keptCards.filter((c) => c.mealType === 'eat_out').length;
    const neededOrderIn = Math.max(0, Math.min(slotsNeeded, 2 - keptOrderIn));
    const neededEatOut = Math.max(
      0,
      Math.min(slotsNeeded - neededOrderIn, 2 - keptEatOut)
    );
    const list: MealType[] = [
      ...Array(neededOrderIn).fill('order_in'),
      ...Array(neededEatOut).fill('eat_out'),
    ];
    while (list.length < slotsNeeded) {
      list.push(list.length % 2 === 0 ? 'order_in' : 'eat_out');
    }
    return list;
  };

  /**
   * Stage 4: Reroll Unkept Spots (or Reroll All 4 if 0 are kept), OR refresh unkept slots after filter edits!
   * Dampens cuisines of kept cards and escalates Favorites gravity as `rerollCount` climbs.
   */
  const runRerollOrFilterRefresh = async ({
    overrideSession,
    forceRefreshPool = false,
    isFilterUpdate = false,
  }: {
    overrideSession?: GameSessionState;
    forceRefreshPool?: boolean;
    isFilterUpdate?: boolean;
  } = {}) => {
    const activeSession = overrideSession || session;
    if (!activeSession || isRerollingAll || rerollingPlaceIds.length > 0) return;

    setHasUnrolledCuisineEdit(false);
    const keptSet = new Set(keptFourIds);
    const keptCards = activeSession.currentFour.filter((c) =>
      keptSet.has(c.placeId)
    );
    const unkeptCards = activeSession.currentFour.filter(
      (c) => !keptSet.has(c.placeId)
    );

    const targetTotalSlots = 4;
    const slotsNeeded = Math.max(0, targetTotalSlots - keptCards.length);

    if (slotsNeeded === 0) {
      // All 4 cards are kept — simply persist any updated questionnaire on session
      await updateAndSyncSession({
        ...activeSession,
        keptPlaceIds: keptFourIds,
        notice: null,
      });
      return;
    }

    // If 0 cards are kept, reroll all 4!
    if (keptCards.length === 0) {
      if (!isFilterUpdate && activeSession.currentFour.length > 0) {
        recordTasteSignals({ rerolledOptions: activeSession.currentFour }).then(
          setFavorites
        );
      }
      const rejectedIds = activeSession.currentFour.map((c) => c.placeId);
      const rejectedNames = activeSession.currentFour.map((c) => c.name);
      const nextRerollCount = isFilterUpdate
        ? activeSession.rerollCount || 0
        : (activeSession.rerollCount || 0) + 1;

      const updatedBase: GameSessionState = {
        ...activeSession,
        excludedPlaceIds: dedupeStrings([
          ...activeSession.excludedPlaceIds,
          ...rejectedIds,
        ]),
        excludedNames: dedupeStrings([
          ...activeSession.excludedNames,
          ...rejectedNames,
        ]),
        roundNumber: activeSession.roundNumber + 1,
        rerollCount: nextRerollCount,
        keptPlaceIds: [],
      };

      setKeptFourIds([]);
      await generateFourOptions(updatedBase, 'reroll_all', forceRefreshPool);
      return;
    }

    // Partial reroll / filter refresh: keep locked cards in place and fill `slotsNeeded` slots!
    if (!isFilterUpdate && unkeptCards.length > 0) {
      recordTasteSignals({
        keptOptions: keptCards,
        rerolledOptions: unkeptCards,
      }).then(setFavorites);
    }

    const unkeptIds = unkeptCards.map((c) => c.placeId);
    const unkeptNames = unkeptCards.map((c) => c.name);
    const targetMealTypes = computeReplacementMealTypes(
      activeSession.questionnaire,
      keptCards,
      slotsNeeded
    );
    const keptCuisines = keptCards.map((c) => c.cuisineLabel);
    const nextRerollCount = isFilterUpdate
      ? activeSession.rerollCount || 0
      : (activeSession.rerollCount || 0) + 1;

    setRerollingPlaceIds(
      unkeptIds.length > 0 ? unkeptIds : ['__filling_extra_slots__']
    );
    setApiError(null);

    const nextExcludedIds = dedupeStrings([
      ...activeSession.excludedPlaceIds,
      ...unkeptIds,
    ]);
    const nextExcludedNames = dedupeStrings([
      ...activeSession.excludedNames,
      ...unkeptNames,
    ]);
    const currentVisibleIds = keptCards.map((c) => c.placeId);

    try {
      const activeFavs =
        activeSession.combinedFavorites &&
        activeSession.combinedFavorites.length > 0
          ? activeSession.combinedFavorites
          : favorites;
      const res = await fetch('/api/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'reroll_unkept',
          location: activeSession.location,
          questionnaire: activeSession.questionnaire,
          excludedPlaceIds: nextExcludedIds,
          excludedNames: nextExcludedNames,
          candidatePool: activeSession.candidatePool,
          favorites: activeFavs,
          preferredDeliveryApps:
            profile.preferredDeliveryApps || DEFAULT_DELIVERY_PLATFORMS,
          learnedDeliveryCache,
          targetMealTypes,
          currentVisibleIds,
          keptCuisines,
          rerollCount: nextRerollCount,
          forceRefreshPool,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Could not reroll unkept spots.');
      }

      if (
        Array.isArray(data.learnedDeliveryUpdates) &&
        data.learnedDeliveryUpdates.length > 0
      ) {
        const updatedCache = saveLearnedDeliveryEntries(
          data.learnedDeliveryUpdates
        );
        setLearnedDeliveryCache(updatedCache);
      }

      const replacements: DinnerOption[] = Array.isArray(data.options)
        ? [...data.options]
        : [];

      if (replacements.length === 0) {
        const updatedSession: GameSessionState = {
          ...activeSession,
          currentFour: keptCards,
          keptPlaceIds: keptCards.map((c) => c.placeId),
          excludedPlaceIds: nextExcludedIds,
          excludedNames: nextExcludedNames,
          rerollCount: nextRerollCount,
          candidatePool: data.candidatePool || activeSession.candidatePool,
          notice:
            data.notice ||
            'No additional open spots matched to replace the unkept options. Try broadening your filters or searching a spot!',
          exhausted: true,
        };
        await updateAndSyncSession(updatedSession);
        return;
      }

      // Preserve kept cards in their existing visual positions and slot replacements into unkept / missing positions
      const usedIndexes = new Set<number>();
      const nextFour: DinnerOption[] = [];

      for (const card of activeSession.currentFour) {
        if (keptSet.has(card.placeId)) {
          nextFour.push(card);
          continue;
        }
        let matchIdx = replacements.findIndex(
          (r, idx) => !usedIndexes.has(idx) && r.mealType === card.mealType
        );
        if (matchIdx === -1) {
          matchIdx = replacements.findIndex((_, idx) => !usedIndexes.has(idx));
        }
        if (matchIdx !== -1) {
          usedIndexes.add(matchIdx);
          nextFour.push(replacements[matchIdx]);
        }
      }

      // If previous currentFour had <4 cards (e.g. after exhaustion), append any remaining replacements up to 4!
      for (let i = 0; i < replacements.length && nextFour.length < 4; i++) {
        if (!usedIndexes.has(i)) {
          usedIndexes.add(i);
          nextFour.push(replacements[i]);
        }
      }

      const updatedSession: GameSessionState = {
        ...activeSession,
        excludedPlaceIds: nextExcludedIds,
        excludedNames: nextExcludedNames,
        currentFour: nextFour,
        keptPlaceIds: keptCards.map((c) => c.placeId),
        rerollCount: nextRerollCount,
        candidatePool: data.candidatePool || activeSession.candidatePool,
        notice: data.notice || null,
        exhausted: Boolean(data.exhausted),
      };
      await updateAndSyncSession(updatedSession);
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : 'Unable to reroll unkept cards.'
      );
    } finally {
      setRerollingPlaceIds([]);
    }
  };

  const handleRerollUnkeptOrAll = async () => {
    await runRerollOrFilterRefresh();
  };

  /**
   * Stage 4 In-Place Filter Sheet Submit:
   * Updates filters WITHOUT losing kept restaurants and refreshes only the unkept slots!
   */
  const handleApplyStage4Filters = async (nextAnswers: QuestionnaireAnswers) => {
    if (!session) return;
    setShowStage4FilterSheet(false);

    const prevQ = session.questionnaire;
    const poolAffectingChanged =
      prevQ.deliveryTiming !== nextAnswers.deliveryTiming ||
      prevQ.transportMode !== nextAnswers.transportMode ||
      prevQ.maxTravelMinutes !== nextAnswers.maxTravelMinutes ||
      prevQ.priceTiers.join(',') !== nextAnswers.priceTiers.join(',') ||
      prevQ.mealTypes.join(',') !== nextAnswers.mealTypes.join(',') ||
      prevQ.cuisines.join(',') !== nextAnswers.cuisines.join(',');

    const updatedSession: GameSessionState = {
      ...session,
      questionnaire: nextAnswers,
      notice: null,
      exhausted: false,
    };
    setSession(updatedSession);
    saveLocalSession(updatedSession);

    await runRerollOrFilterRefresh({
      overrideSession: updatedSession,
      forceRefreshPool: poolAffectingChanged,
      isFilterUpdate: true,
    });
  };

  /**
   * Stage 4 Inline Cuisine Pill Toggle (quick × or + Cuisine right above the 4 cards)
   */
  const handleInlineToggleCuisine = (cuisine: string) => {
    if (!session) return;
    let nextCuisines: string[];
    if (cuisine === SURPRISE_ME_LABEL) {
      nextCuisines = [SURPRISE_ME_LABEL];
    } else {
      const currentSpecific = session.questionnaire.cuisines.filter(
        (c) => c !== SURPRISE_ME_LABEL
      );
      const exists = currentSpecific.includes(cuisine);
      const updated = exists
        ? currentSpecific.filter((c) => c !== cuisine)
        : [...currentSpecific, cuisine];
      nextCuisines = updated.length > 0 ? updated : [SURPRISE_ME_LABEL];
    }

    const updatedSession: GameSessionState = {
      ...session,
      questionnaire: {
        ...session.questionnaire,
        cuisines: nextCuisines,
      },
    };
    setSession(updatedSession);
    saveLocalSession(updatedSession);
    setHasUnrolledCuisineEdit(true);
  };

  /**
   * Stage 4 Manual Search & Keep:
   * Hydrates any searched restaurant or saved Favorite and immediately slots it into Stage 4 as Kept!
   */
  const handleSelectManualSpotStage4 = async (place: ManualIncludedPlace) => {
    if (!session || addingManualPlaceId) return;
    setAddingManualPlaceId(place.placeId);
    setApiError(null);

    try {
      const res = await fetch('/api/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'hydrate_manual',
          location: session.location,
          questionnaire: session.questionnaire,
          preferredDeliveryApps:
            profile.preferredDeliveryApps || DEFAULT_DELIVERY_PLATFORMS,
          learnedDeliveryCache,
          manualPlace: place,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error || !Array.isArray(data.options) || !data.options[0]) {
        throw new Error(data.error || 'Could not add selected restaurant.');
      }

      if (
        Array.isArray(data.learnedDeliveryUpdates) &&
        data.learnedDeliveryUpdates.length > 0
      ) {
        const updatedCache = saveLearnedDeliveryEntries(
          data.learnedDeliveryUpdates
        );
        setLearnedDeliveryCache(updatedCache);
      }

      const hydratedSpot: DinnerOption = data.options[0];
      const current = [...session.currentFour];
      const keptSet = new Set(keptFourIds);

      let nextFour: DinnerOption[];
      let replacedId: string | null = null;

      if (current.length < 4) {
        nextFour = [...current, hydratedSpot];
      } else {
        // Replace the last unkept slot so top cards stay steady; if all 4 are kept, replace slot #4
        let replaceIdx = -1;
        for (let i = current.length - 1; i >= 0; i--) {
          if (!keptSet.has(current[i].placeId)) {
            replaceIdx = i;
            break;
          }
        }
        if (replaceIdx === -1) {
          replaceIdx = current.length - 1;
        }
        replacedId = current[replaceIdx].placeId;
        nextFour = current.map((item, idx) =>
          idx === replaceIdx ? hydratedSpot : item
        );
      }

      const nextKept = dedupeStrings([
        ...keptFourIds.filter((id) => id !== replacedId),
        hydratedSpot.placeId,
      ]);
      setKeptFourIds(nextKept);
      setShowStage4AddSpot(false);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(25);
      }

      const updatedSession: GameSessionState = {
        ...session,
        currentFour: nextFour,
        keptPlaceIds: nextKept,
        excludedPlaceIds: replacedId
          ? dedupeStrings([...session.excludedPlaceIds, replacedId])
          : session.excludedPlaceIds,
        exhausted: false,
        notice: null,
      };
      await updateAndSyncSession(updatedSession);
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : 'Could not add restaurant.'
      );
    } finally {
      setAddingManualPlaceId(null);
    }
  };

  /**
   * User 1 "Edit Filters":
   * In Stage 4 (`U1_REVIEW_4`), opens the non-destructive Filter Sheet so kept spots stay locked!
   * In Vetoed state (`U2_VETOED`), navigates to Q_PAGE_1.
   */
  const handleEditFilters = async () => {
    if (!session) return;
    if (session.phase === 'U1_REVIEW_4') {
      setShowStage4FilterSheet(true);
      return;
    }
    const nextSession: GameSessionState = {
      ...session,
      phase: 'Q_PAGE_1',
      notice: null,
      exhausted: false,
    };
    await updateAndSyncSession(nextSession);
  };

  /**
   * User 1 "Confirm These 4" (or current lineup):
   * Locks the options and advances to User 2 (`HANDOFF_TO_U2` in Pass Phone mode; `U2_PICK_2` in 2-iPhones mode)
   */
  const handleConfirmFour = async () => {
    if (!session || session.currentFour.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }

    const keptCards = session.currentFour.filter((c) =>
      keptFourIds.includes(c.placeId)
    );
    if (keptCards.length > 0) {
      recordTasteSignals({ keptOptions: keptCards }).then(setFavorites);
    }

    const nextPhase =
      session.playMode === 'pass_phone' ? 'HANDOFF_TO_U2' : 'U2_PICK_2';

    await updateAndSyncSession({
      ...session,
      phase: nextPhase,
      funnelSteps: [session.currentFour.length, 2, 1],
      notice: null,
    });
  };

  /**
   * Escape Hatch ("Send Just My 3 Kept Spots"):
   * Lets User 1 send 3 loved kept spots to User 2 instead of forcing a filler 4th option!
   */
  const handleConfirmThreeKept = async () => {
    if (!session) return;
    const keptSet = new Set(keptFourIds);
    const keptThree = session.currentFour.filter((c) => keptSet.has(c.placeId));
    if (keptThree.length !== 3) return;

    const dropped = session.currentFour.filter((c) => !keptSet.has(c.placeId));
    recordTasteSignals({
      keptOptions: keptThree,
      rerolledOptions: dropped,
    }).then(setFavorites);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }

    const nextPhase =
      session.playMode === 'pass_phone' ? 'HANDOFF_TO_U2' : 'U2_PICK_2';

    await updateAndSyncSession({
      ...session,
      currentFour: keptThree,
      funnelSteps: [3, 2, 1],
      excludedPlaceIds: dedupeStrings([
        ...session.excludedPlaceIds,
        ...dropped.map((d) => d.placeId),
      ]),
      excludedNames: dedupeStrings([
        ...session.excludedNames,
        ...dropped.map((d) => d.name),
      ]),
      phase: nextPhase,
      notice: null,
    });
  };

  /**
   * Stage 2: User 2 toggles selection of up to 2 cards
   */
  const handleToggleSelectStage2 = (option: DinnerOption) => {
    const id = option.placeId;
    if (selectedTwoIds.includes(id)) {
      setSelectedTwoIds((prev) => prev.filter((item) => item !== id));
      setSelectionNudge(null);
      return;
    }

    if (selectedTwoIds.length >= 2) {
      setSelectionNudge('2 of 2 selected — tap a selected spot to swap it.');
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }
      return;
    }

    setSelectionNudge(null);
    setSelectedTwoIds((prev) => [...prev, id]);
  };

  /**
   * Stage 2: User 2 confirms their 2 finalists -> sends back to User 1
   */
  const handleConfirmTwoFinalists = async () => {
    if (!session || selectedTwoIds.length !== 2) return;
    const finalists = session.currentFour.filter((c) =>
      selectedTwoIds.includes(c.placeId)
    );
    if (finalists.length !== 2) return;

    // Learn from User 2's 2 finalist selections
    recordTasteSignals({ keptOptions: finalists }).then(setFavorites);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }

    const nextPhase =
      session.playMode === 'pass_phone' ? 'HANDOFF_TO_U1' : 'U1_PICK_1';

    await updateAndSyncSession({
      ...session,
      phase: nextPhase,
      finalistTwo: finalists,
      lastHandoffReason: 'normal',
    });
  };

  /**
   * Stage 2: User 2 uses their 1 Veto (Strictly max 1 per game):
   * Appends all 4 placeIds to cumulative `excludedPlaceIds`, sets `user2VetoesRemaining = 0`,
   * clears selection, and transitions to `U2_VETOED` (via handoff screen in 1-phone mode, or instant push in 2-phone mode).
   */
  const handleConfirmUser2Veto = async () => {
    if (!session || session.user2VetoesRemaining < 1) return;
    setShowVetoConfirmSheet(false);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([30, 50, 30]);
    }

    // Cool down affinity on vetoed options
    recordTasteSignals({ rerolledOptions: session.currentFour }).then(
      setFavorites
    );

    const rejectedIds = session.currentFour.map((c) => c.placeId);
    const rejectedNames = session.currentFour.map((c) => c.name);

    const nextPhase =
      session.playMode === 'pass_phone' ? 'HANDOFF_TO_U1' : 'U2_VETOED';

    await updateAndSyncSession({
      ...session,
      phase: nextPhase,
      excludedPlaceIds: dedupeStrings([
        ...session.excludedPlaceIds,
        ...rejectedIds,
      ]),
      excludedNames: dedupeStrings([
        ...session.excludedNames,
        ...rejectedNames,
      ]),
      user2VetoesRemaining: 0,
      currentFour: [],
      keptPlaceIds: [],
      rerollCount: 0,
      lastHandoffReason: 'veto',
      roundNumber: session.roundNumber + 1,
    });
  };

  /**
   * Stage 1: User 1 locks in the 1 winning dinner option
   */
  const handleConfirmWinner = async () => {
    if (!session || !selectedWinnerId) return;
    const chosen = session.finalistTwo.find(
      (c) => c.placeId === selectedWinnerId
    );
    if (!chosen) return;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([40, 60, 80]);
    }

    await updateAndSyncSession({
      ...session,
      phase: 'WINNER',
      winner: chosen,
    });
  };

  /**
   * Fast-add or remove a restaurant from Favorites during the selection flow
   */
  const isPlaceInFavorites = (placeId: string, name: string) => {
    const normName = name.trim().toLowerCase();
    return favorites.some(
      (f) => f.placeId === placeId || f.name.trim().toLowerCase() === normName
    );
  };

  const handleToggleFavoriteOption = async (option: DinnerOption) => {
    const normName = option.name.trim().toLowerCase();
    const existing = favorites.find(
      (f) =>
        f.placeId === option.placeId || f.name.trim().toLowerCase() === normName
    );

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(20);
    }

    if (existing) {
      const updated = await removeHouseholdFavorite(existing.placeId);
      setFavorites(updated);
    } else {
      const updated = await addUploadedFavorites([
        {
          placeId: option.placeId,
          name: option.name,
          cuisine: option.cuisineLabel,
          priceTier: option.priceTier || '$$',
          mealTypes: [option.mealType],
          shortAddress: option.shortAddress,
          notes: option.pitch,
        },
      ]);
      setFavorites(updated);
    }
  };

  const handleToggleFavoriteManualPlace = async (place: ManualIncludedPlace) => {
    const normName = place.name.trim().toLowerCase();
    const existing = favorites.find(
      (f) =>
        f.placeId === place.placeId || f.name.trim().toLowerCase() === normName
    );

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(20);
    }

    if (existing) {
      const updated = await removeHouseholdFavorite(existing.placeId);
      setFavorites(updated);
    } else {
      const updated = await addUploadedFavorites([
        {
          placeId: place.placeId,
          name: place.name,
          cuisine: place.cuisine || 'Local Favorite',
          priceTier: place.priceTier || '$$',
          shortAddress: place.shortAddress,
          notes: place.pitch,
        },
      ]);
      setFavorites(updated);
    }
  };

  // RENDER 1: SETUP SCREEN
  if (!session || session.phase === 'SETUP') {
    return (
      <>
        <SetupScreen
          profile={profile}
          favorites={favorites}
          deviceOwnerName={deviceOwnerName}
          recentPartners={recentPartners}
          location={location}
          isLocating={isLocating}
          locationError={locationError}
          activeLobbySession={activeLobbySession}
          onOpenFavorites={() => setShowFavoritesSheet(true)}
          onOpenSettings={() => setShowSettingsSheet(true)}
          onSaveDeviceOwnerName={handleSaveDeviceOwnerName}
          onAddPartner={handleAddPartner}
          onRemovePartner={handleRemovePartner}
          onUpdateLocation={(loc) => {
            setLocation(loc);
            saveCachedLocation(loc);
            setLocationError(null);
          }}
          onRetryGps={() => detectBrowserLocation(true)}
          onUpdateProfile={(updates) => {
            const slot = getDeviceOwnerSlot() || 'A';
            const updatedMyName =
              slot === 'B' ? updates.playerB : updates.playerA;
            if (updatedMyName) {
              setDeviceOwnerName(updatedMyName);
            }
            handleUpdateProfileNames(updates);
          }}
          onStartGame={handleStartGame}
          onJoinLobbySession={handleJoinLobbySession}
          onDismissLobbySession={handleDismissLobbySession}
          onJoinByRoomCode={handleJoinByRoomCode}
        />

        {showFavoritesSheet && (
          <FavoritesSheet
            favorites={favorites}
            location={location}
            onClose={() => setShowFavoritesSheet(false)}
            onAddFavorites={async (entries) => {
              const updated = await addUploadedFavorites(entries);
              setFavorites(updated);
            }}
            onRemoveFavorite={async (placeId) => {
              const updated = await removeHouseholdFavorite(placeId);
              setFavorites(updated);
            }}
          />
        )}

        <UserSettingsSheet
          isOpen={showSettingsSheet}
          onClose={() => setShowSettingsSheet(false)}
          deviceOwnerName={deviceOwnerName || profile.playerA}
          onSaveDeviceOwnerName={handleSaveDeviceOwnerName}
          favorites={favorites}
          onManageFavorites={() => setShowFavoritesSheet(true)}
          preferredDeliveryApps={
            profile.preferredDeliveryApps &&
            profile.preferredDeliveryApps.length > 0
              ? profile.preferredDeliveryApps
              : DEFAULT_DELIVERY_PLATFORMS
          }
          onChangePreferredDeliveryApps={handleUpdatePreferredDeliveryApps}
          defaultTransport={profile.defaultTransport || 'drive'}
          onChangeDefaultTransport={handleUpdateDefaultTransport}
          learnedDeliveryCache={learnedDeliveryCache}
        />
      </>
    );
  }

  // Determine whether this device is waiting on the other player in 2-iPhones Live Mode
  const isTwoPhones = session.playMode === 'two_phones';
  const isUser1Phase =
    session.phase === 'Q_PAGE_1' ||
    session.phase === 'Q_PAGE_2' ||
    session.phase === 'GENERATING' ||
    session.phase === 'U1_REVIEW_4' ||
    session.phase === 'U2_VETOED' ||
    session.phase === 'U1_PICK_1';
  const isUser2Phase = session.phase === 'U2_PICK_2';

  const isWaitingForPartner =
    isTwoPhones &&
    session.phase !== 'WINNER' &&
    ((deviceRole === 'user2' && isUser1Phase) ||
      (deviceRole === 'user1' && isUser2Phase));

  const getWaitingStatusCopy = () => {
    switch (session.phase) {
      case 'Q_PAGE_1':
        return {
          title: `${session.user1Name} is picking tonight’s cravings…`,
          subtitle: 'Step 1 of 2: Choosing meal type & cuisines',
        };
      case 'Q_PAGE_2':
        return {
          title: `${session.user1Name} is setting price & travel distance…`,
          subtitle: 'Step 2 of 2: Almost ready to roll 4 options',
        };
      case 'GENERATING':
        return {
          title: `Finding 4 open spots for ${session.user1Name}…`,
          subtitle: 'Checking live local places & curating pitches',
        };
      case 'U1_REVIEW_4':
        return {
          title: `${session.user1Name} is reviewing 4 options…`,
          subtitle: `Get ready! You’ll narrow them down to 2 finalists next.`,
        };
      case 'U2_VETOED':
        return {
          title: `Veto sent! ${session.user1Name} is rolling 4 fresh spots…`,
          subtitle: 'All 4 previous spots have been permanently excluded',
        };
      case 'U2_PICK_2':
        return {
          title: `${session.user2Name} is narrowing 4 down to 2…`,
          subtitle: `You’ll make the final call between ${session.user2Name}’s top 2!`,
        };
      case 'U1_PICK_1':
        return {
          title: `${session.user1Name} is choosing between your 2 finalists!`,
          subtitle: 'Tonight’s winner will appear here in a moment…',
        };
      default:
        return {
          title: 'Syncing live game…',
          subtitle: 'Connected via Household Live Sync',
        };
    }
  };

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-ios-bg">
      {/* First-Time / In-App Browser Identity Modal when joining directly via /room/[code] */}
      {hasCheckedOwnerName && !deviceOwnerName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-ios-border bg-ios-card p-6 shadow-2xl">
            {!session.isOpenInvite &&
            !isPlaceholderPartnerName(session.user2Name) &&
            !showCustomJoinInput ? (
              <>
                <h2 className="text-center text-xl font-bold text-ios-label">
                  Ready to play with {session.user1Name}?
                </h2>
                <p className="mt-1.5 text-center text-xs text-ios-secondary">
                  Tap your name to jump straight into Room {session.roomCode}.
                </p>
                <div className="mt-5 space-y-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleSaveDeviceOwnerName(session.user2Name, 'user2')
                    }
                    className="flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-ios-accent px-4 text-base font-semibold text-white shadow-sm active:scale-[0.99]"
                  >
                    Continue as {session.user2Name} →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSaveDeviceOwnerName(session.user1Name, 'user1')
                    }
                    className="flex min-h-[46px] w-full items-center justify-center rounded-2xl border border-ios-border bg-ios-elevated/70 px-4 text-sm font-semibold text-ios-label active:opacity-80"
                  >
                    I’m {session.user1Name} (Host)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCustomJoinInput(true)}
                    className="flex min-h-[38px] w-full items-center justify-center text-xs font-medium text-ios-secondary underline decoration-ios-border underline-offset-4"
                  >
                    Someone else? Enter your name
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-center text-xl font-bold text-ios-label">
                  Joining {session.user1Name}’s game — what’s your name?
                </h2>
                <p className="mt-1.5 text-center text-xs text-ios-secondary">
                  We’ll save this on your phone so {session.user1Name} sees your
                  name and you’re remembered for future games.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!inGameOnboardingInput.trim()) return;
                    handleSaveDeviceOwnerName(
                      inGameOnboardingInput.trim(),
                      'user2'
                    );
                  }}
                  className="mt-5 space-y-3"
                >
                  <input
                    type="text"
                    maxLength={24}
                    value={inGameOnboardingInput}
                    onChange={(e) => setInGameOnboardingInput(e.target.value)}
                    placeholder="Your first name…"
                    autoFocus
                    className="min-h-[48px] w-full rounded-2xl border border-ios-border bg-ios-bg px-4 text-base font-medium text-ios-label placeholder:text-ios-tertiary focus:border-ios-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!inGameOnboardingInput.trim()}
                    className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-ios-accent px-4 text-base font-semibold text-white shadow-sm disabled:opacity-45"
                  >
                    Join Game
                  </button>
                </form>
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={() =>
                      handleSaveDeviceOwnerName(session.user1Name, 'user1')
                    }
                    className="min-h-[36px] text-xs font-medium text-ios-secondary underline decoration-ios-border underline-offset-4"
                  >
                    Already {session.user1Name}? Open host view
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <FunnelHeader
        session={session}
        deviceRole={deviceRole}
        onResetGame={handleResetToSetup}
      />

      {/* Live Sync Retry Banner if a turn handoff hit spotty mobile connectivity */}
      {syncFailed && isTwoPhones && (
        <div className="mx-auto mt-3 max-w-md px-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/12 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <RefreshCw
                className={`h-4 w-4 shrink-0 ${
                  isRetryingSync ? 'animate-spin' : ''
                }`}
              />
              <span>
                Reconnecting to send your selection…
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleRetryPendingSync()}
              disabled={isRetryingSync}
              className="shrink-0 rounded-xl bg-amber-500 px-3 py-1.5 font-semibold text-white active:opacity-85 disabled:opacity-50"
            >
              {isRetryingSync ? 'Syncing…' : 'Retry Now'}
            </button>
          </div>
        </div>
      )}

      {/* Global API Error Banner */}
      {apiError && (
        <div className="mx-auto mt-3 max-w-md px-4">
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Couldn’t fetch restaurants</p>
              <p className="mt-0.5 opacity-90">{apiError}</p>
            </div>
          </div>
        </div>
      )}

      {/* CALM LIVE WAITING SCREEN (2-iPhones Mode when partner is acting) */}
      {isWaitingForPartner ? (
        <main className="mx-auto flex max-w-md flex-col items-center px-4 pb-24 pt-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-ios-border bg-ios-card shadow-sm">
            <Loader2 className="h-7 w-7 animate-spin text-ios-accent" />
          </div>

          <h1 className="mt-5 text-xl font-bold tracking-tight text-ios-label">
            {getWaitingStatusCopy().title}
          </h1>
          <p className="mt-1.5 max-w-xs text-sm text-ios-secondary">
            {getWaitingStatusCopy().subtitle}
          </p>

          {/* Live Sync Status Pill + 1-Tap On-Demand Cloud Check */}
          <button
            type="button"
            onClick={() => void handleManualRefreshSession()}
            disabled={isManualRefreshing}
            className="mt-3.5 inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-ios-border bg-ios-card px-3.5 py-1 text-xs font-medium text-ios-secondary shadow-2xs active:opacity-80"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                liveSyncStatus === 'live'
                  ? 'bg-emerald-500'
                  : 'animate-pulse bg-amber-500'
              }`}
            />
            <span>
              {isManualRefreshing
                ? 'Checking live game…'
                : liveSyncStatus === 'live'
                ? 'Live Sync Active • Check now'
                : 'Syncing • Tap to check now'}
            </span>
            <RefreshCw
              className={`h-3 w-3 ${isManualRefreshing ? 'animate-spin' : ''}`}
            />
          </button>

          {/* If in U2_PICK_2, show User 1 the spots sent over to User 2 */}
          {session.phase === 'U2_PICK_2' && session.currentFour.length > 0 && (
            <div className="mt-6 w-full rounded-2xl border border-ios-border bg-ios-card p-4 text-left shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                {session.currentFour.length} Spots Sent to {session.user2Name}
              </p>
              <div className="mt-2.5 space-y-2">
                {session.currentFour.map((opt) => (
                  <div
                    key={opt.placeId}
                    className="flex items-center justify-between rounded-xl bg-ios-bg px-3 py-2 text-sm font-semibold text-ios-label"
                  >
                    <span className="truncate pr-2">{opt.name}</span>
                    <span className="shrink-0 text-xs font-medium text-ios-secondary">
                      {opt.cuisineLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* If in U1_PICK_1, show User 2 which 2 finalists they sent over */}
          {session.phase === 'U1_PICK_1' && session.finalistTwo.length === 2 && (
            <div className="mt-6 w-full rounded-2xl border border-ios-border bg-ios-card p-4 text-left shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                Your 2 Finalists Sent to {session.user1Name}
              </p>
              <div className="mt-2.5 space-y-2">
                {session.finalistTwo.map((opt) => (
                  <div
                    key={opt.placeId}
                    className="flex items-center justify-between rounded-xl bg-ios-bg px-3 py-2.5 text-sm font-semibold text-ios-label"
                  >
                    <span>{opt.name}</span>
                    <span className="text-xs font-medium text-ios-secondary">
                      {opt.cuisineLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Room Code Card + Role Switcher if needed */}
          <div className="mt-6 w-full rounded-2xl border border-ios-border bg-ios-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-left">
                <p className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                  Live Room Code
                </p>
                <p className="mt-0.5 text-2xl font-extrabold tracking-widest text-ios-label">
                  {session.roomCode}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const url = `${window.location.origin}/room/${session.roomCode}`;
                  await copyTextResilient(url);
                  if (
                    typeof navigator !== 'undefined' &&
                    typeof navigator.share === 'function'
                  ) {
                    try {
                      await navigator.share({
                        title: 'Join our 4-2-1 Game',
                        text: `Join our 4-2-1 game! Code: ${session.roomCode}`,
                        url,
                      });
                      return;
                    } catch {
                      // ignore
                    }
                  }
                  setSelectionNudge('Invite link copied to clipboard!');
                  setTimeout(() => setSelectionNudge(null), 2500);
                }}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-ios-accent/15 px-3.5 text-xs font-semibold text-ios-accent"
              >
                <Share2 className="h-4 w-4" />
                {selectionNudge === 'Invite link copied to clipboard!'
                  ? 'Link Copied!'
                  : 'Share Link'}
              </button>
            </div>

            <div className="mt-3.5 border-t border-ios-border pt-3 text-left">
              <button
                type="button"
                onClick={() => {
                  const flipped: PlayerRole =
                    deviceRole === 'user1' ? 'user2' : 'user1';
                  const flippedName =
                    flipped === 'user1' ? session.user1Name : session.user2Name;
                  saveDeviceOwnerSlot(
                    flippedName === profile.playerA ? 'A' : 'B'
                  );
                  saveDeviceRoleForSession(session.id, flipped);
                  setDeviceRole(flipped);
                }}
                className="min-h-[44px] text-xs font-medium text-ios-secondary underline decoration-ios-border underline-offset-4"
              >
                Switch this iPhone to{' '}
                {deviceRole === 'user1' ? session.user2Name : session.user1Name}
              </button>
            </div>
          </div>
        </main>
      ) : (
        <>
          {/* SCREEN 2 & 3: USER 1 QUESTIONNAIRE (PAGE 1 & PAGE 2) */}
          {(session.phase === 'Q_PAGE_1' || session.phase === 'Q_PAGE_2') && (
            <QuestionnaireView
              page={session.phase === 'Q_PAGE_1' ? 1 : 2}
              user1Name={session.user1Name}
              answers={session.questionnaire}
              recentWinners={recentWinners}
              favorites={
                session.combinedFavorites &&
                session.combinedFavorites.length > 0
                  ? session.combinedFavorites
                  : favorites
              }
              location={session.location}
              sessionExcludedCount={session.excludedPlaceIds.length}
              onUpdateAnswers={(nextAnswers: QuestionnaireAnswers) => {
                setSession((prev) =>
                  prev ? { ...prev, questionnaire: nextAnswers } : prev
                );
              }}
              onToggleFavoritePlace={handleToggleFavoriteManualPlace}
              onGoToPage2={() =>
                updateAndSyncSession({ ...session, phase: 'Q_PAGE_2' })
              }
              onBackToPage1={() =>
                updateAndSyncSession({ ...session, phase: 'Q_PAGE_1' })
              }
              onSubmitFindOptions={() => generateFourOptions(session, 'initial')}
              onResetSessionExclusions={() =>
                updateAndSyncSession({
                  ...session,
                  excludedPlaceIds: [],
                  excludedNames: [],
                  notice: null,
                  exhausted: false,
                })
              }
            />
          )}

          {/* GENERATING LOADING STATE */}
          {session.phase === 'GENERATING' && (
            <main className="mx-auto max-w-md px-4 pb-24 pt-6">
              <div className="mb-5 flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-ios-accent" />
                <div>
                  <h1 className="text-lg font-bold text-ios-label">
                    Curating 4 open spots near {session.location.label}…
                  </h1>
                  <p className="text-xs text-ios-secondary">
                    Verifying live hours, distances & tailoring pitches
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="animate-shimmer rounded-2xl border border-ios-border p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-5 w-44 rounded-md bg-ios-border/50" />
                      <div className="h-6 w-20 rounded-full bg-ios-border/50" />
                    </div>
                    <div className="mt-3 h-3.5 w-56 rounded-md bg-ios-border/40" />
                    <div className="mt-3 h-4 w-full rounded-md bg-ios-border/40" />
                  </div>
                ))}
              </div>
            </main>
          )}

          {/* SCREEN 4: STAGE "4" — USER 1 REVIEWS 4 OPTIONS */}
          {session.phase === 'U1_REVIEW_4' && (
            <main className="mx-auto max-w-md px-4 pb-44 pt-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ios-accent">
                    Stage 4 • {session.user1Name}’s Review
                  </p>
                  <h1 className="text-xl font-bold tracking-tight text-ios-label">
                    Review your 4 spots
                  </h1>
                  <p className="text-xs text-ios-secondary">
                    Tap spots to keep, reroll the rest, or search &amp; lock in
                    any restaurant.
                  </p>
                </div>

                {session.currentFour.length > 0 && (
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      keptFourIds.length > 0
                        ? 'bg-ios-accent text-white'
                        : 'bg-ios-elevated text-ios-label'
                    }`}
                  >
                    {keptFourIds.length} of {session.currentFour.length} kept
                  </span>
                )}
              </div>

              {/* Inline Cuisine Chip Bar (Idea #4: Instant Mid-Roll Cuisine Tweaks) */}
              <div className="mb-3 rounded-2xl border border-ios-border/80 bg-ios-card/80 p-2.5 shadow-2xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  {session.questionnaire.cuisines.map((c) => {
                    const isSurprise = c === SURPRISE_ME_LABEL;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          if (!isSurprise) {
                            handleInlineToggleCuisine(c);
                          } else {
                            setShowInlineCuisinePicker((prev) => !prev);
                          }
                        }}
                        title={
                          isSurprise
                            ? 'Tap to pick specific cuisines'
                            : `Remove ${c}`
                        }
                        className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-ios-accent/15 px-2.5 py-1 text-xs font-semibold text-ios-accent transition-all active:scale-95"
                      >
                        <span>{isSurprise ? 'Surprise Me ✨' : c}</span>
                        {!isSurprise && (
                          <X className="h-3 w-3 opacity-80" />
                        )}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setShowInlineCuisinePicker((prev) => !prev)}
                    className={`inline-flex min-h-[30px] items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all active:scale-95 ${
                      showInlineCuisinePicker
                        ? 'border-ios-accent bg-ios-accent text-white'
                        : 'border-dashed border-ios-border bg-ios-bg text-ios-secondary hover:text-ios-label'
                    }`}
                  >
                    <Plus className="h-3 w-3" />
                    <span>Cuisine</span>
                  </button>

                  {hasUnrolledCuisineEdit && (
                    <button
                      type="button"
                      disabled={
                        isRerollingAll || rerollingPlaceIds.length > 0
                      }
                      onClick={() =>
                        runRerollOrFilterRefresh({
                          forceRefreshPool: true,
                          isFilterUpdate: true,
                        })
                      }
                      className="ml-auto inline-flex min-h-[30px] items-center gap-1 rounded-full bg-ios-accent px-3 py-1 text-xs font-semibold text-white shadow-2xs active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Refresh Unkept</span>
                    </button>
                  )}
                </div>

                {/* Expandable Inline Cuisine Picker Tray */}
                {showInlineCuisinePicker && (
                  <div className="mt-2.5 border-t border-ios-border pt-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_CUISINES.filter(
                        (c) => !session.questionnaire.cuisines.includes(c)
                      ).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleInlineToggleCuisine(c)}
                          className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-ios-border bg-ios-bg px-2.5 py-0.5 text-[11px] font-semibold text-ios-label active:bg-ios-elevated"
                        >
                          <Plus className="h-2.5 w-2.5 text-ios-accent" />
                          <span>{c}</span>
                        </button>
                      ))}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const cleaned = inlineCustomCuisine.trim();
                        if (!cleaned) return;
                        handleInlineToggleCuisine(cleaned);
                        setInlineCustomCuisine('');
                      }}
                      className="mt-2 flex gap-1.5"
                    >
                      <input
                        type="text"
                        value={inlineCustomCuisine}
                        onChange={(e) => setInlineCustomCuisine(e.target.value)}
                        placeholder="Other cuisine (e.g. Tapas, Ramen)…"
                        className="min-h-[34px] flex-1 rounded-xl border border-ios-border bg-ios-bg px-2.5 text-xs text-ios-label placeholder:text-ios-tertiary focus:border-ios-accent focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!inlineCustomCuisine.trim()}
                        className="rounded-xl bg-ios-elevated px-3 text-xs font-semibold text-ios-label disabled:opacity-45"
                      >
                        Add
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* Notice or Exhaustion Banner */}
              {session.notice && (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-ios-accent/30 bg-ios-accent/10 p-3 text-xs text-ios-label">
                  <span>{session.notice}</span>
                  {session.exhausted && (
                    <button
                      type="button"
                      onClick={handleEditFilters}
                      className="shrink-0 font-bold text-ios-accent underline"
                    >
                      Edit Filters
                    </button>
                  )}
                </div>
              )}

              {session.currentFour.length === 0 ? (
                <div className="my-8 rounded-3xl border border-ios-border bg-ios-card p-6 text-center shadow-sm">
                  <p className="text-base font-bold text-ios-label">
                    No matching open restaurants left
                  </p>
                  <p className="mt-1 text-xs text-ios-secondary">
                    We filtered out {session.excludedPlaceIds.length} rejected
                    spots and couldn’t find more open matches for your exact
                    filters.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleEditFilters}
                      className="inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-2xl bg-ios-accent px-4 text-xs font-semibold text-white"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Edit Filters
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowStage4AddSpot(true)}
                      className="inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-2xl border border-ios-border bg-ios-bg px-4 text-xs font-semibold text-ios-label"
                    >
                      <Search className="h-3.5 w-3.5 text-ios-accent" />
                      Search a Spot
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {session.currentFour.map((option) => (
                    <RestaurantCard
                      key={option.placeId}
                      option={option}
                      mode="review_4"
                      isRerolling={rerollingPlaceIds.includes(option.placeId)}
                      isSelected={keptFourIds.includes(option.placeId)}
                      isFavorited={isPlaceInFavorites(
                        option.placeId,
                        option.name
                      )}
                      onToggleSelect={handleToggleKeepStage4}
                      onToggleFavorite={handleToggleFavoriteOption}
                    />
                  ))}
                </div>
              )}

              {/* Action Row: Reroll Unkept / + Pick Spot / Filters */}
              <div className="mt-4 space-y-2">
                {(() => {
                  const totalCount = session.currentFour.length;
                  const keptCount = session.currentFour.filter((c) =>
                    keptFourIds.includes(c.placeId)
                  ).length;
                  const slotsToRefresh = Math.max(0, 4 - keptCount);
                  const isBusy =
                    isRerollingAll || rerollingPlaceIds.length > 0;

                  const label =
                    totalCount === 0 || keptCount === 0
                      ? `Reroll All ${totalCount || 4}`
                      : slotsToRefresh === 0
                      ? 'All 4 Kept'
                      : `Reroll the Rest (${slotsToRefresh})`;

                  return (
                    <button
                      type="button"
                      onClick={handleRerollUnkeptOrAll}
                      disabled={isBusy || totalCount === 0 || slotsToRefresh === 0}
                      className={`flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-2xl border px-4 text-xs font-semibold shadow-xs transition-all active:scale-[0.99] disabled:opacity-50 ${
                        keptCount > 0 && slotsToRefresh > 0
                          ? 'border-ios-accent bg-ios-accent/15 text-ios-accent'
                          : 'border-ios-border bg-ios-card text-ios-label active:bg-ios-elevated'
                      }`}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${
                          isBusy ? 'animate-spin' : ''
                        }`}
                      />
                      <span>{label}</span>
                      {(session.rerollCount || 0) >= 2 && slotsToRefresh > 0 && (
                        <span className="ml-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-500">
                          Boosting Favorites
                        </span>
                      )}
                    </button>
                  );
                })()}

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowStage4AddSpot(true)}
                    className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-2xl border border-ios-border bg-ios-card px-3 text-xs font-semibold text-ios-label shadow-xs active:bg-ios-elevated"
                  >
                    <Search className="h-3.5 w-3.5 text-ios-accent" />
                    <span>+ Search / Pick Spot</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleEditFilters}
                    className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-2xl border border-ios-border bg-ios-card px-3 text-xs font-semibold text-ios-label shadow-xs active:bg-ios-elevated"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-ios-accent" />
                    <span>
                      {keptFourIds.length > 0
                        ? `Filters (Keep ${keptFourIds.length})`
                        : 'Edit Filters'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Required subtle Google Places attribution */}
              <p className="mt-5 text-center text-[11px] text-ios-tertiary">
                Restaurant data © Google
              </p>

              {/* Sticky Primary CTA: Confirm These 4 (+ Escape Hatch to Send 3 Kept Spots!) */}
              {session.currentFour.length > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ios-border bg-ios-bg/85 px-4 pb-safe pt-3 backdrop-blur-xl">
                  <div className="mx-auto max-w-md space-y-2">
                    {(() => {
                      const keptCount = session.currentFour.filter((c) =>
                        keptFourIds.includes(c.placeId)
                      ).length;
                      const showSendThreeEscape =
                        keptCount === 3 &&
                        session.currentFour.length === 4 &&
                        ((session.rerollCount || 0) >= 1 || session.exhausted);

                      return (
                        <>
                          {showSendThreeEscape && (
                            <button
                              type="button"
                              onClick={handleConfirmThreeKept}
                              disabled={
                                rerollingPlaceIds.length > 0 || isRerollingAll
                              }
                              className="flex min-h-[40px] w-full items-center justify-center rounded-xl border border-ios-accent/40 bg-ios-accent/10 px-4 text-xs font-semibold text-ios-accent active:scale-[0.99] disabled:opacity-50"
                            >
                              Can’t find a 4th? Send just your 3 kept spots to{' '}
                              {session.user2Name} →
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={handleConfirmFour}
                            disabled={
                              rerollingPlaceIds.length > 0 ||
                              isRerollingAll ||
                              session.currentFour.length < 2
                            }
                            className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-ios-accent px-6 text-base font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-50"
                          >
                            Confirm These {session.currentFour.length} for{' '}
                            {session.user2Name} →
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Stage 4 Manual Search & Favorites Quick-Add Sheet */}
              <Stage4AddSpotSheet
                isOpen={showStage4AddSpot}
                onClose={() => setShowStage4AddSpot(false)}
                location={session.location}
                favorites={
                  session.combinedFavorites &&
                  session.combinedFavorites.length > 0
                    ? session.combinedFavorites
                    : favorites
                }
                currentFour={session.currentFour}
                keptCount={
                  session.currentFour.filter((c) =>
                    keptFourIds.includes(c.placeId)
                  ).length
                }
                isAddingPlaceId={addingManualPlaceId}
                onSelectPlace={handleSelectManualSpotStage4}
              />

              {/* Stage 4 Non-Destructive Live Filter Sheet */}
              <Stage4FilterSheet
                isOpen={showStage4FilterSheet}
                onClose={() => setShowStage4FilterSheet(false)}
                answers={session.questionnaire}
                keptCount={
                  session.currentFour.filter((c) =>
                    keptFourIds.includes(c.placeId)
                  ).length
                }
                totalCardsCount={session.currentFour.length}
                sessionExcludedCount={session.excludedPlaceIds.length}
                onResetSessionExclusions={() => {
                  const nextSess: GameSessionState = {
                    ...session,
                    excludedPlaceIds: [],
                    excludedNames: [],
                    notice: null,
                    exhausted: false,
                  };
                  updateAndSyncSession(nextSess);
                }}
                onApplyFilters={handleApplyStage4Filters}
              />
            </main>
          )}

          {/* SCREEN 5A: HANDOFF_TO_U2 (Pass-the-Phone Interstitial) */}
          {session.phase === 'HANDOFF_TO_U2' && (
            <main className="mx-auto flex max-w-md flex-col items-center justify-center px-4 pt-14 text-center">
              <div className="w-full rounded-3xl border border-ios-border bg-ios-card/95 p-7 shadow-md backdrop-blur-xl">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-ios-accent/15 text-ios-accent">
                  <Smartphone className="h-8 w-8" />
                </div>
                <p className="mt-4 text-xs font-bold uppercase tracking-widest text-ios-accent">
                  Stage 4 → 2 Handoff
                </p>
                <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-ios-label">
                  Pass iPhone to {session.user2Name}
                </h1>
                <p className="mt-2 text-sm text-ios-secondary">
                  Pick your top 2 finalists from {session.user1Name}’s{' '}
                  {session.currentFour.length} spots (or use your 1 veto).
                </p>

                <button
                  type="button"
                  onClick={() =>
                    updateAndSyncSession({ ...session, phase: 'U2_PICK_2' })
                  }
                  className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-ios-accent px-6 text-base font-semibold text-white shadow-sm active:scale-[0.99]"
                >
                  I’m {session.user2Name} — Show Options
                </button>
              </div>
            </main>
          )}

          {/* SCREEN 6: STAGE "2" — USER 2 SELECTS 2 (OR USES 1 VETO) */}
          {session.phase === 'U2_PICK_2' && (
            <main className="mx-auto max-w-md px-4 pb-36 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ios-accent">
                    Stage 2 • {session.user2Name}’s Turn
                  </p>
                  <h1 className="text-xl font-bold tracking-tight text-ios-label">
                    Pick your top 2 finalists
                  </h1>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    selectedTwoIds.length === 2
                      ? 'bg-ios-accent text-white'
                      : 'bg-ios-elevated text-ios-label'
                  }`}
                >
                  {selectedTwoIds.length} of 2 selected
                </span>
              </div>

              {selectionNudge && (
                <p className="mb-2.5 text-xs font-medium text-ios-accent">
                  {selectionNudge}
                </p>
              )}

              <div className="space-y-3">
                {session.currentFour.map((option) => {
                  const isSelected = selectedTwoIds.includes(option.placeId);
                  return (
                    <RestaurantCard
                      key={option.placeId}
                      option={option}
                      mode="pick_2"
                      isSelected={isSelected}
                      isFavorited={isPlaceInFavorites(
                        option.placeId,
                        option.name
                      )}
                      selectionDisabled={selectedTwoIds.length >= 2}
                      onToggleSelect={handleToggleSelectStage2}
                      onToggleFavorite={handleToggleFavoriteOption}
                    />
                  );
                })}
              </div>

              {/* User 2 Veto Control (Strictly max 1 per game) */}
              <div className="mt-5 flex flex-col items-center">
                {session.user2VetoesRemaining === 1 ? (
                  <button
                    type="button"
                    onClick={() => setShowVetoConfirmSheet(true)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-400 active:opacity-80"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    <span>Veto All {session.currentFour.length} (1 left)</span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-ios-elevated px-3.5 py-1.5 text-xs font-medium text-ios-secondary">
                    <Ban className="h-3.5 w-3.5 opacity-60" />
                    Veto used — pick 2 finalists
                  </span>
                )}
              </div>

              <p className="mt-4 text-center text-[11px] text-ios-tertiary">
                Restaurant data © Google
              </p>

              {/* Sticky Primary CTA: Send These 2 to User 1 */}
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ios-border bg-ios-bg/85 px-4 pb-safe pt-3 backdrop-blur-xl">
                <div className="mx-auto max-w-md">
                  <button
                    type="button"
                    onClick={handleConfirmTwoFinalists}
                    disabled={selectedTwoIds.length !== 2}
                    className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-ios-accent px-6 text-base font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-45"
                  >
                    Send These 2 to {session.user1Name} →
                  </button>
                </div>
              </div>

              {/* Compact iOS Action-Sheet Confirmation for User 2 Veto */}
              {showVetoConfirmSheet && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-xs sm:items-center">
                  <div className="w-full max-w-sm rounded-3xl border border-ios-border bg-ios-card p-5 text-center shadow-xl">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-500">
                      <Ban className="h-6 w-6" />
                    </div>
                    <h2 className="mt-3 text-lg font-bold text-ios-label">
                      Use your 1 veto and send back to {session.user1Name}?
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-ios-secondary">
                      All {session.currentFour.length} current options will be permanently excluded for the
                      rest of this game, and {session.user1Name} will roll 4
                      fresh spots. You only get 1 veto per game.
                    </p>

                    <div className="mt-5 space-y-2">
                      <button
                        type="button"
                        onClick={handleConfirmUser2Veto}
                        className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-red-500 text-sm font-semibold text-white active:opacity-90"
                      >
                        Yes, Veto All {session.currentFour.length}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowVetoConfirmSheet(false)}
                        className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-ios-elevated text-sm font-semibold text-ios-label active:opacity-80"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </main>
          )}

          {/* SCREEN 5B: HANDOFF_TO_U1 (Pass-the-Phone Interstitial) */}
          {session.phase === 'HANDOFF_TO_U1' && (
            <main className="mx-auto flex max-w-md flex-col items-center justify-center px-4 pt-14 text-center">
              <div className="w-full rounded-3xl border border-ios-border bg-ios-card/95 p-7 shadow-md backdrop-blur-xl">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-ios-accent/15 text-ios-accent">
                  <Smartphone className="h-8 w-8" />
                </div>
                <p className="mt-4 text-xs font-bold uppercase tracking-widest text-ios-accent">
                  {session.lastHandoffReason === 'veto'
                    ? 'Veto Alert'
                    : 'Stage 2 → 1 Handoff'}
                </p>
                <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-ios-label">
                  {session.lastHandoffReason === 'veto'
                    ? `${session.user2Name} used their Veto! Pass back to ${session.user1Name}`
                    : `${session.user2Name} narrowed it down to 2! Pass back to ${session.user1Name}`}
                </h1>
                <p className="mt-2 text-sm text-ios-secondary">
                  {session.lastHandoffReason === 'veto'
                    ? `Pass the iPhone to ${session.user1Name} to roll 4 new spots.`
                    : `Pass the iPhone to ${session.user1Name} for the final call.`}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    updateAndSyncSession({
                      ...session,
                      phase:
                        session.lastHandoffReason === 'veto'
                          ? 'U2_VETOED'
                          : 'U1_PICK_1',
                    })
                  }
                  className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-ios-accent px-6 text-base font-semibold text-white shadow-sm active:scale-[0.99]"
                >
                  I’m {session.user1Name} — Continue
                </button>
              </div>
            </main>
          )}

          {/* U2_VETOED SCREEN (User 1 notified of User 2's Veto) */}
          {session.phase === 'U2_VETOED' && (
            <main className="mx-auto flex max-w-md flex-col items-center justify-center px-4 pt-12 text-center">
              <div className="w-full rounded-3xl border border-ios-border bg-ios-card p-7 shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
                  <RefreshCw className="h-7 w-7" />
                </div>
                <h1 className="mt-4 text-2xl font-bold tracking-tight text-ios-label">
                  {session.user2Name} vetoed those 4 spots
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-ios-secondary">
                  Those 4 restaurants have been excluded for the rest of tonight’s
                  game, and {session.user2Name} has 0 vetoes left. Roll 4 fresh
                  options with your current filters or tweak your filters first!
                </p>

                <div className="mt-6 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => generateFourOptions(session, 'reroll_all')}
                    className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-ios-accent px-6 text-base font-semibold text-white shadow-sm active:scale-[0.99]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Roll 4 New Options
                  </button>

                  <button
                    type="button"
                    onClick={handleEditFilters}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-ios-elevated px-6 text-sm font-semibold text-ios-label active:opacity-80"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Edit Filters First
                  </button>
                </div>
              </div>
            </main>
          )}

          {/* SCREEN 7: STAGE "1" — USER 1 PICKS DINNER FROM THE 2 FINALISTS */}
          {session.phase === 'U1_PICK_1' && (
            <main className="mx-auto max-w-md px-4 pb-36 pt-4">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-ios-accent">
                  Stage 1 • Final Call
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-ios-label">
                  {session.user2Name}’s Top 2 Finalists
                </h1>
                <p className="text-xs text-ios-secondary">
                  {session.user1Name}, pick the winner for tonight’s dinner.
                </p>
              </div>

              <div className="space-y-3.5">
                {session.finalistTwo.map((option, idx) => (
                  <React.Fragment key={option.placeId}>
                    <RestaurantCard
                      option={option}
                      mode="pick_1"
                      isSelected={selectedWinnerId === option.placeId}
                      isFavorited={isPlaceInFavorites(
                        option.placeId,
                        option.name
                      )}
                      onToggleSelect={(opt) => setSelectedWinnerId(opt.placeId)}
                      onToggleFavorite={handleToggleFavoriteOption}
                    />
                    {idx === 0 && session.finalistTwo.length === 2 && (
                      <div className="flex items-center justify-center py-0.5">
                        <span className="rounded-full border border-ios-border bg-ios-elevated px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-ios-secondary">
                          vs
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>

              <p className="mt-5 text-center text-[11px] text-ios-tertiary">
                Restaurant data © Google
              </p>

              {/* Sticky Primary CTA: That's Dinner */}
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ios-border bg-ios-bg/85 px-4 pb-safe pt-3 backdrop-blur-xl">
                <div className="mx-auto max-w-md">
                  <button
                    type="button"
                    onClick={handleConfirmWinner}
                    disabled={!selectedWinnerId}
                    className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-ios-accent px-6 text-base font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-45"
                  >
                    That’s Dinner!
                  </button>
                </div>
              </div>
            </main>
          )}

          {/* SCREEN 8: WINNER SCREEN (Celebratory Reveal + Single Tappable Address Link) */}
          {session.phase === 'WINNER' && session.winner && (
            <main className="mx-auto max-w-md px-4 pb-28 pt-6">
              <div className="overflow-hidden rounded-3xl border border-ios-border bg-ios-card p-6 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-ios-accent/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-ios-accent">
                    <Trophy className="h-3.5 w-3.5" />
                    Tonight’s Dinner
                  </span>

                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const winnerFav = isPlaceInFavorites(
                        session.winner.placeId,
                        session.winner.name
                      );
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            session.winner &&
                            handleToggleFavoriteOption(session.winner)
                          }
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all active:scale-95 ${
                            winnerFav
                              ? 'border-rose-500/40 bg-rose-500/15 text-rose-500'
                              : 'border-ios-border bg-ios-elevated/60 text-ios-secondary hover:text-ios-label'
                          }`}
                        >
                          <Heart
                            className={`h-3.5 w-3.5 ${
                              winnerFav ? 'fill-rose-500 text-rose-500' : ''
                            }`}
                          />
                          <span>{winnerFav ? 'Favorited' : '+ Favorite'}</span>
                        </button>
                      );
                    })()}

                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        session.winner.mealType === 'order_in'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {session.winner.mealType === 'order_in' ? (
                        <>
                          <ShoppingBag className="h-3.5 w-3.5" />
                          Order In
                        </>
                      ) : (
                        <>
                          <Utensils className="h-3.5 w-3.5" />
                          Eat Out
                        </>
                      )}
                    </span>
                  </div>
                </div>

                <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ios-label">
                  {session.winner.name}
                </h1>

                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ios-secondary">
                  <span className="font-semibold text-ios-label">
                    {session.winner.cuisineLabel}
                  </span>
                  {session.winner.priceTier && (
                    <>
                      <span>•</span>
                      <span>{session.winner.priceTier}</span>
                    </>
                  )}
                  {session.winner.rating && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 text-ios-label">
                        <span className="text-amber-500">★</span>
                        <span>{session.winner.rating.toFixed(1)}</span>
                        {session.winner.userRatingCount ? (
                          <span className="text-ios-secondary">
                            ({session.winner.userRatingCount.toLocaleString()})
                          </span>
                        ) : null}
                      </span>
                    </>
                  )}
                  <span>•</span>
                  <span>{session.winner.estimatedTimeLabel}</span>
                </div>

                <p className="mt-4 rounded-2xl bg-ios-bg p-4 text-[15px] leading-relaxed text-ios-label">
                  “{session.winner.pitch}”
                </p>

                {/* Delivery App Deep Links & ETAs when Order In winner */}
                {session.winner.mealType === 'order_in' &&
                  session.winner.kind === 'restaurant' &&
                  Array.isArray(session.winner.deliveryQuotes) &&
                  session.winner.deliveryQuotes.length > 0 && (
                    <div className="mt-5 border-t border-ios-border pt-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ios-secondary">
                        Order on Your Delivery Apps
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {session.winner.deliveryQuotes.map((quote) => {
                          const platformMeta = DELIVERY_PLATFORMS.find(
                            (p) => p.id === quote.platformId
                          );
                          const cleanHref = (quote.storeUrl || '').replace(
                            /\/RK=\d+.*$/i,
                            ''
                          );
                          return (
                            <a
                              key={quote.platformId}
                              href={cleanHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex min-h-[46px] items-center justify-between gap-2 rounded-2xl border border-ios-border bg-ios-bg px-3.5 py-2.5 text-sm font-semibold text-ios-label transition-colors hover:border-ios-accent active:bg-ios-elevated"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{
                                    backgroundColor:
                                      platformMeta?.brandColor || '#007AFF',
                                  }}
                                />
                                <span className="truncate">{quote.label}</span>
                              </div>
                              <span className="shrink-0 rounded-full bg-ios-accent/15 px-2.5 py-0.5 text-xs font-bold text-ios-accent">
                                ~{quote.etaLabel}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* Tappable Full Street Address Link */}
                <div className="mt-5 border-t border-ios-border pt-4">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ios-secondary">
                    Address & Directions
                  </p>
                  <a
                    href={
                      session.winner.googleMapsUri ||
                      `https://maps.apple.com/?q=${encodeURIComponent(
                        `${session.winner.name} ${session.winner.fullAddress}`
                      )}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[48px] items-center gap-2.5 rounded-2xl border border-ios-border bg-ios-bg px-4 py-3 text-sm font-semibold text-ios-accent transition-colors active:bg-ios-elevated"
                  >
                    <MapPin className="h-5 w-5 shrink-0 text-ios-accent" />
                    <span className="underline decoration-ios-accent/40 underline-offset-4">
                      {session.winner.fullAddress || session.winner.shortAddress}
                    </span>
                  </a>
                </div>

                <div className="mt-5 flex items-center justify-between text-xs text-ios-secondary">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Saved to recent household winners
                  </span>
                  <span>
                    {session.user1Name} & {session.user2Name}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-center text-[11px] text-ios-tertiary">
                Restaurant data © Google
              </p>

              {/* Start New Game Button */}
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ios-border bg-ios-bg/85 px-4 pb-safe pt-3 backdrop-blur-xl">
                <div className="mx-auto max-w-md">
                  <button
                    type="button"
                    onClick={handleResetToSetup}
                    className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-ios-accent px-6 text-base font-semibold text-white shadow-sm active:scale-[0.99]"
                  >
                    Start New Game
                  </button>
                </div>
              </div>
            </main>
          )}
        </>
      )}
    </div>
  );
}
