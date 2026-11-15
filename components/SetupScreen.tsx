'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  GameSessionState,
  GeoLocationData,
  HouseholdFavorite,
  HouseholdProfile,
  PlayMode,
} from '@/lib/types';
import {
  fetchPairLastFirstPlayer,
  getDeviceOwnerName,
  isSupabaseConfigured,
  saveDeviceOwnerName,
} from '@/lib/supabase';
import {
  Check,
  Hash,
  Link2,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Settings,
  Smartphone,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AddToHomeScreenTip } from './AddToHomeScreenTip';
import { BrandLogo } from './BrandLogo';

interface SetupScreenProps {
  profile: HouseholdProfile;
  favorites: HouseholdFavorite[];
  deviceOwnerName: string;
  recentPartners: string[];
  onSaveDeviceOwnerName: (name: string) => void;
  onAddPartner: (name: string) => void;
  onRemovePartner: (name: string) => void;
  location: GeoLocationData | null;
  isLocating: boolean;
  locationError: string | null;
  activeLobbySession: GameSessionState | null;
  onOpenFavorites: () => void;
  onOpenSettings: () => void;
  onUpdateLocation: (loc: GeoLocationData) => void;
  onRetryGps: () => void;
  onUpdateProfile: (updates: { playerA: string; playerB: string }) => void;
  onStartGame: (params: {
    playMode: PlayMode;
    user1Name: string;
    user2Name: string;
    holderName: string;
    isOpenInvite?: boolean;
  }) => void;
  onJoinLobbySession: (
    session: GameSessionState,
    asRole: 'user1' | 'user2'
  ) => void;
  onDismissLobbySession: (session: GameSessionState) => void;
  onJoinByRoomCode: (code: string) => Promise<boolean>;
}

const OPEN_INVITE_SENTINEL = '__OPEN_INVITE__';

export function SetupScreen({
  profile,
  deviceOwnerName,
  recentPartners,
  onSaveDeviceOwnerName,
  onAddPartner,
  onRemovePartner,
  location,
  isLocating,
  locationError,
  activeLobbySession,
  onOpenSettings,
  onUpdateLocation,
  onRetryGps,
  onUpdateProfile,
  onStartGame,
  onJoinLobbySession,
  onDismissLobbySession,
  onJoinByRoomCode,
}: SetupScreenProps) {
  const [playMode, setPlayMode] = useState<PlayMode>(
    isSupabaseConfigured ? 'two_phones' : 'pass_phone'
  );

  // First-time user onboarding modal state
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [onboardingNameInput, setOnboardingNameInput] = useState('');

  // Selected partner chip state (defaults to most recent partner, e.g. Lauren)
  const [selectedPartner, setSelectedPartner] = useState<string>('');
  const userChoseOpenInviteRef = useRef<boolean>(false);
  const [showAddPartnerDrawer, setShowAddPartnerDrawer] = useState(false);
  const [newPartnerInput, setNewPartnerInput] = useState('');

  // Who goes first ('me' = this phone's user, 'partner' = selected partner)
  const [firstPlayerSlot, setFirstPlayerSlot] = useState<'me' | 'partner'>('me');
  const [pairLastFirstPlayer, setPairLastFirstPlayer] = useState<string | null>(
    null
  );

  // Location inline editor state
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [isGeocodingQuery, setIsGeocodingQuery] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  // Coin flip animation state
  const [isFlippingCoin, setIsFlippingCoin] = useState(false);

  // Join by 4-digit code sheet state
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isJoiningCode, setIsJoiningCode] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);

  // Check if this phone has a saved owner name on mount
  useEffect(() => {
    const saved = (deviceOwnerName || getDeviceOwnerName() || '').trim();
    if (!saved) {
      setNeedsOnboarding(true);
    } else {
      setNeedsOnboarding(false);
    }
  }, [deviceOwnerName]);

  // Keep selectedPartner defaulted to the most recent partner (index 0) when loaded,
  // or OPEN_INVITE_SENTINEL in 2-phone mode ONLY when no recent partners exist (or user explicitly tapped New Partner)
  useEffect(() => {
    if (selectedPartner === OPEN_INVITE_SENTINEL) {
      if (playMode === 'pass_phone') {
        userChoseOpenInviteRef.current = false;
        setSelectedPartner(recentPartners[0] || '');
        return;
      }
      if (!userChoseOpenInviteRef.current && recentPartners.length > 0) {
        setSelectedPartner(recentPartners[0]);
      }
      return;
    }
    if (
      !selectedPartner ||
      !recentPartners.some(
        (p) => p.toLowerCase() === selectedPartner.toLowerCase()
      )
    ) {
      if (recentPartners.length > 0) {
        setSelectedPartner(recentPartners[0]);
      } else if (playMode === 'two_phones') {
        setSelectedPartner(OPEN_INVITE_SENTINEL);
      } else {
        setSelectedPartner('');
      }
    }
  }, [recentPartners, selectedPartner, playMode]);

  const myName = deviceOwnerName.trim() || 'Player 1';
  const isOpenInvite =
    playMode === 'two_phones' && selectedPartner === OPEN_INVITE_SENTINEL;
  const partnerName = isOpenInvite
    ? 'Partner (Joining…)'
    : selectedPartner.trim() || 'Player 2';

  // Fetch per-pair `lastFirstPlayer` whenever `myName` + `selectedPartner` change
  useEffect(() => {
    if (isOpenInvite || !selectedPartner.trim() || !myName) {
      setPairLastFirstPlayer(null);
      setFirstPlayerSlot('me');
      return;
    }

    let cancelled = false;
    fetchPairLastFirstPlayer(myName, selectedPartner.trim()).then((last) => {
      if (cancelled) return;
      const fallbackLast =
        last ||
        (myName.toLowerCase() === profile.playerA.toLowerCase() &&
        selectedPartner.trim().toLowerCase() === profile.playerB.toLowerCase()
          ? profile.lastFirstPlayer
          : null);
      setPairLastFirstPlayer(fallbackLast);

      if (fallbackLast) {
        if (fallbackLast.toLowerCase() === myName.toLowerCase()) {
          setFirstPlayerSlot('partner');
        } else if (
          fallbackLast.toLowerCase() === selectedPartner.trim().toLowerCase()
        ) {
          setFirstPlayerSlot('me');
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [myName, selectedPartner, isOpenInvite, profile.playerA, profile.playerB, profile.lastFirstPlayer]);

  // Open manual location input automatically if GPS fails and no location set yet
  useEffect(() => {
    if (locationError && !location) {
      setIsEditingLocation(true);
    }
  }, [locationError, location]);

  const effectiveFirstSlot: 'me' | 'partner' = isOpenInvite
    ? 'me'
    : firstPlayerSlot;
  const user1Name = effectiveFirstSlot === 'me' ? myName : partnerName;
  const user2Name = effectiveFirstSlot === 'me' ? partnerName : myName;

  const suggestedAlternateSlot: 'me' | 'partner' | null =
    !isOpenInvite && pairLastFirstPlayer
      ? pairLastFirstPlayer.toLowerCase() === myName.toLowerCase()
        ? 'partner'
        : pairLastFirstPlayer.toLowerCase() === partnerName.toLowerCase()
        ? 'me'
        : null
      : null;

  const suggestedAlternateName =
    suggestedAlternateSlot === 'me'
      ? myName
      : suggestedAlternateSlot === 'partner'
      ? partnerName
      : null;

  const handleOnboardingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = onboardingNameInput.trim();
    if (!clean) return;
    saveDeviceOwnerName(clean);
    onSaveDeviceOwnerName(clean);
    setNeedsOnboarding(false);
  };

  const handleAddPartnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newPartnerInput.trim();
    if (!clean) return;
    userChoseOpenInviteRef.current = false;
    onAddPartner(clean);
    setSelectedPartner(clean);
    setNewPartnerInput('');
    setShowAddPartnerDrawer(false);
  };

  const handleSelectOpenInvite = () => {
    userChoseOpenInviteRef.current = true;
    setSelectedPartner(OPEN_INVITE_SENTINEL);
    setFirstPlayerSlot('me');
    setShowAddPartnerDrawer(false);
  };

  const handleCoinFlip = () => {
    if (isFlippingCoin || isOpenInvite) return;
    setIsFlippingCoin(true);
    let ticks = 0;
    const interval = setInterval(() => {
      ticks += 1;
      setFirstPlayerSlot((prev) => (prev === 'me' ? 'partner' : 'me'));
      if (ticks >= 7) {
        clearInterval(interval);
        const winner: 'me' | 'partner' = Math.random() < 0.5 ? 'me' : 'partner';
        setFirstPlayerSlot(winner);
        setIsFlippingCoin(false);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(25);
        }
      }
    }, 90);
  };

  const handleManualLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = locationQuery.trim();
    if (!q) return;

    setIsGeocodingQuery(true);
    setGeocodeError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (res.ok && !data.error && typeof data.lat === 'number') {
        onUpdateLocation({
          lat: data.lat,
          lng: data.lng,
          label: data.label,
        });
        setIsEditingLocation(false);
        setLocationQuery('');
        return;
      }

      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          q
        )}&limit=1&addressdetails=1`
      );
      if (nomRes.ok) {
        const nomList = await nomRes.json();
        if (Array.isArray(nomList) && nomList.length > 0) {
          const top = nomList[0];
          const lat = Number(top.lat);
          const lng = Number(top.lon);
          const parts = String(top.display_name || q)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const label =
            parts.length >= 2 ? `${parts[0]}, ${parts[1]}` : parts[0] || q;
          onUpdateLocation({ lat, lng, label });
          setIsEditingLocation(false);
          setLocationQuery('');
          return;
        }
      }

      throw new Error(data.error || 'Location not found');
    } catch (err) {
      setGeocodeError(
        err instanceof Error
          ? err.message
          : 'Could not find that neighborhood or ZIP.'
      );
    } finally {
      setIsGeocodingQuery(false);
    }
  };

  const handleJoinCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCodeInput.trim();
    if (code.length < 4) return;
    setIsJoiningCode(true);
    setJoinCodeError(null);
    const ok = await onJoinByRoomCode(code);
    setIsJoiningCode(false);
    if (!ok) {
      setJoinCodeError('No active dinner game found with that 4-digit code.');
    } else {
      setShowCodeModal(false);
    }
  };

  const handleStart = () => {
    if (!location) {
      setIsEditingLocation(true);
      return;
    }
    if (!isOpenInvite && !selectedPartner.trim()) {
      setShowAddPartnerDrawer(true);
      return;
    }

    if (!isOpenInvite && selectedPartner.trim()) {
      onAddPartner(selectedPartner.trim());
      onUpdateProfile({
        playerA: myName,
        playerB: selectedPartner.trim(),
      });
    }

    onStartGame({
      playMode,
      user1Name,
      user2Name,
      holderName: myName,
      isOpenInvite,
    });
  };

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden pb-safe pt-safe">
      <AddToHomeScreenTip />

      <div className="mx-auto w-full max-w-md px-4 pb-28 pt-2">
        {/* 1. Scoped Active Live Game Banner (Only appears if this phone's user is one of the 2 players) */}
        {activeLobbySession && (
          <div className="mb-5 overflow-hidden rounded-2xl border border-ios-accent/40 bg-ios-card/95 p-4 shadow-md backdrop-blur-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ios-accent opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ios-accent" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-ios-accent">
                  Live Game With You • #{activeLobbySession.roomCode}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onDismissLobbySession(activeLobbySession)}
                aria-label="Dismiss active game"
                className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-ios-secondary active:bg-ios-elevated"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-1.5 text-[15px] font-semibold text-ios-label">
              {activeLobbySession.user1Name.toLowerCase() ===
              myName.toLowerCase()
                ? `Resume your dinner game with ${activeLobbySession.user2Name}`
                : `${activeLobbySession.user1Name} started a dinner game with you`}
            </p>
            <p className="mt-0.5 text-xs text-ios-secondary">
              Near {activeLobbySession.location.label} • Tap below to jump right in
            </p>

            <div className="mt-3">
              {(() => {
                const autoRole: 'user1' | 'user2' =
                  activeLobbySession.user1Name.trim().toLowerCase() ===
                  myName.toLowerCase()
                    ? 'user1'
                    : 'user2';
                return (
                  <button
                    type="button"
                    onClick={() =>
                      onJoinLobbySession(activeLobbySession, autoRole)
                    }
                    className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-ios-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm active:opacity-90"
                  >
                    Join as {myName}
                  </button>
                );
              })()}
            </div>
          </div>
        )}

        {/* Minimal Header: Signature 4-2-1 Logo on Left + GPS Location Pill + Join + Settings on Right */}
        <header className="mb-5 pt-1">
          <div className="flex items-center justify-between gap-2">
            <div className="shrink-0">
              <BrandLogo size="md" />
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setGeocodeError(null);
                  setIsEditingLocation((v) => !v);
                }}
                className="inline-flex min-h-[38px] min-w-0 max-w-[190px] items-center gap-1.5 rounded-full border border-ios-border bg-ios-card px-2.5 py-1.5 text-xs shadow-2xs transition-colors active:bg-ios-elevated sm:max-w-[230px]"
              >
                {isLocating ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ios-accent" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-ios-accent" />
                )}
                <span className="truncate font-medium text-ios-label">
                  {isLocating
                    ? 'Locating…'
                    : location?.label || 'Set location'}
                </span>
                <span className="ml-0.5 shrink-0 font-semibold text-ios-accent">
                  Edit
                </span>
              </button>

              {isSupabaseConfigured && (
                <button
                  type="button"
                  onClick={() => {
                    setJoinCodeError(null);
                    setShowCodeModal(true);
                  }}
                  title="Join by 4-digit code"
                  className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-full border border-ios-border bg-ios-card px-2.5 text-xs font-semibold text-ios-accent shadow-2xs active:bg-ios-elevated"
                >
                  <Hash className="h-3.5 w-3.5" />
                  <span>Join</span>
                </button>
              )}

              <button
                type="button"
                onClick={onOpenSettings}
                title="User Settings"
                aria-label="User Settings"
                className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-ios-border bg-ios-card text-ios-secondary shadow-2xs active:bg-ios-elevated"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Inline Manual Location Editor */}
          {isEditingLocation && (
            <form
              onSubmit={handleManualLocationSubmit}
              className="mt-3 rounded-2xl border border-ios-border bg-ios-card p-3.5 shadow-sm"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={locationQuery}
                  onChange={(e) => setLocationQuery(e.target.value)}
                  placeholder="Neighborhood, address, or ZIP…"
                  className="min-h-[42px] flex-1 rounded-xl border border-ios-border bg-ios-bg px-3 text-base text-ios-label placeholder:text-ios-tertiary focus:border-ios-accent focus:outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isGeocodingQuery || !locationQuery.trim()}
                  className="flex min-h-[42px] items-center justify-center rounded-xl bg-ios-accent px-4 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {isGeocodingQuery ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Set'
                  )}
                </button>
              </div>

              {geocodeError && (
                <p className="mt-1.5 text-xs font-medium text-red-500">
                  {geocodeError}
                </p>
              )}

              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingLocation(false);
                    onRetryGps();
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-ios-accent"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Use current GPS
                </button>

                {location && (
                  <button
                    type="button"
                    onClick={() => setIsEditingLocation(false)}
                    className="min-h-[36px] px-2 text-xs font-medium text-ios-secondary"
                  >
                    Close
                  </button>
                )}
              </div>
            </form>
          )}
        </header>

        {/* 2. Play Mode Segmented Control */}
        <section className="mb-4 rounded-2xl border border-ios-border bg-ios-card p-4 shadow-sm">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
              Play Mode
            </span>
            {!isSupabaseConfigured && (
              <span className="text-[11px] font-medium text-amber-500">
                Local Mode (Supabase unconfigured)
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-ios-elevated p-1">
            <button
              type="button"
              onClick={() => {
                if (isSupabaseConfigured) setPlayMode('two_phones');
              }}
              disabled={!isSupabaseConfigured}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all ${
                playMode === 'two_phones'
                  ? 'bg-ios-card text-ios-label shadow-sm'
                  : 'text-ios-secondary disabled:opacity-45'
              }`}
            >
              <Smartphone className="h-4 w-4 text-ios-accent" />
              <span>2 iPhones (Live)</span>
            </button>

            <button
              type="button"
              onClick={() => setPlayMode('pass_phone')}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all ${
                playMode === 'pass_phone'
                  ? 'bg-ios-card text-ios-label shadow-sm'
                  : 'text-ios-secondary'
              }`}
            >
              <Users className="h-4 w-4 text-ios-accent" />
              <span>1 iPhone (Pass)</span>
            </button>
          </div>
        </section>

        {/* 3. Playing With & Who Goes First */}
        <section className="mb-4 rounded-2xl border border-ios-border bg-ios-card p-4 shadow-sm">
          {/* Partner Picker */}
          <div className="mb-5 border-b border-ios-border pb-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                Playing With
              </span>
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-xs font-medium text-ios-secondary hover:text-ios-label"
              >
                You: <strong className="font-semibold text-ios-label">{myName}</strong>
              </button>
            </div>

            {/* Partner Chips */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {recentPartners.map((partner) => {
                const isSelected =
                  !isOpenInvite &&
                  selectedPartner.toLowerCase() === partner.toLowerCase();
                return (
                  <div
                    key={partner}
                    className={`inline-flex min-h-[38px] items-center rounded-full border pl-3.5 pr-1.5 text-xs font-semibold transition-all ${
                      isSelected
                        ? 'border-ios-accent bg-ios-accent text-white shadow-2xs'
                        : 'border-ios-border bg-ios-bg text-ios-label hover:border-ios-secondary/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        userChoseOpenInviteRef.current = false;
                        setSelectedPartner(partner);
                        setShowAddPartnerDrawer(false);
                      }}
                      className="flex items-center gap-1.5 py-1.5 pr-1.5"
                    >
                      {isSelected && <Check className="h-3.5 w-3.5 stroke-[2.75]" />}
                      <span>{partner}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemovePartner(partner);
                      }}
                      aria-label={`Remove ${partner}`}
                      title={`Remove ${partner}`}
                      className={`ml-0.5 flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                        isSelected
                          ? 'text-white/80 hover:bg-white/20 hover:text-white'
                          : 'text-ios-secondary hover:bg-ios-elevated hover:text-ios-label'
                      }`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}

              {playMode === 'two_phones' ? (
                <button
                  type="button"
                  onClick={handleSelectOpenInvite}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    isOpenInvite
                      ? 'border-ios-accent bg-ios-accent text-white shadow-2xs'
                      : 'border-dashed border-ios-border bg-ios-bg text-ios-accent hover:border-ios-accent/50'
                  }`}
                >
                  {isOpenInvite ? (
                    <Link2 className="h-3.5 w-3.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  <span>New Partner (Invite Link)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddPartnerDrawer((v) => !v)}
                  className={`inline-flex min-h-[38px] items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                    showAddPartnerDrawer
                      ? 'border-ios-accent bg-ios-accent/15 text-ios-accent'
                      : 'border-dashed border-ios-border bg-ios-bg text-ios-accent hover:border-ios-accent/50'
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Partner</span>
                </button>
              )}
            </div>

            {/* Expandable "+ New Partner" Drawer (Only needed in 1-Phone Pass Mode) */}
            {playMode === 'pass_phone' &&
              (showAddPartnerDrawer || recentPartners.length === 0) && (
                <div className="mt-3 rounded-2xl border border-ios-border bg-ios-bg p-3.5">
                  <form onSubmit={handleAddPartnerSubmit} className="flex gap-2">
                    <input
                      type="text"
                      maxLength={24}
                      value={newPartnerInput}
                      onChange={(e) => setNewPartnerInput(e.target.value)}
                      placeholder="Partner’s name (e.g. Lauren)"
                      autoFocus={showAddPartnerDrawer}
                      className="min-h-[42px] flex-1 rounded-xl border border-ios-border bg-ios-card px-3 text-base font-medium text-ios-label placeholder:text-ios-tertiary focus:border-ios-accent focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!newPartnerInput.trim()}
                      className="inline-flex min-h-[42px] items-center gap-1 rounded-xl bg-ios-accent px-4 text-xs font-semibold text-white disabled:opacity-45"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Add</span>
                    </button>
                  </form>
                </div>
              )}
          </div>

          {/* Who Goes First */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                Who Goes First?
              </span>

              {!isOpenInvite && (
                <button
                  type="button"
                  onClick={handleCoinFlip}
                  aria-label="Flip a coin to pick who goes first"
                  title="Flip coin (Heads / Tails)"
                  className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:scale-90"
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-amber-400/90 bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 text-amber-950 shadow-sm transition-transform ${
                      isFlippingCoin ? 'animate-coin-flip' : ''
                    }`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-700/30 text-[11px] font-black tracking-tighter">
                      {effectiveFirstSlot === 'me' ? 'H' : 'T'}
                    </span>
                  </span>
                </button>
              )}
            </div>

            {isOpenInvite ? (
              <p className="mt-2 rounded-xl bg-ios-accent/10 px-3 py-2 text-xs text-ios-secondary">
                <strong className="font-semibold text-ios-label">{myName}</strong>{' '}
                starts the game and gets a shareable link. When your partner opens the link, their phone’s name fills in automatically and is saved for future games!
              </p>
            ) : (
              <>
                {pairLastFirstPlayer && suggestedAlternateName && (
                  <div className="mt-2.5 flex items-center justify-between rounded-xl bg-ios-accent/10 px-3 py-2 text-xs">
                    <span className="text-ios-secondary">
                      Last game:{' '}
                      <strong className="font-semibold text-ios-label">
                        {pairLastFirstPlayer}
                      </strong>{' '}
                      went first
                    </span>
                    {effectiveFirstSlot !== suggestedAlternateSlot && (
                      <button
                        type="button"
                        onClick={() =>
                          suggestedAlternateSlot &&
                          setFirstPlayerSlot(suggestedAlternateSlot)
                        }
                        className="inline-flex items-center gap-1 font-semibold text-ios-accent"
                      >
                        <Sparkles className="h-3 w-3" />
                        Alternate ({suggestedAlternateName}’s turn)
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFirstPlayerSlot('me')}
                    className={`flex min-h-[48px] items-center justify-center rounded-xl border px-3 py-2 transition-all ${
                      effectiveFirstSlot === 'me'
                        ? 'border-ios-accent bg-ios-accent/10 text-ios-label ring-2 ring-ios-accent/30'
                        : 'border-ios-border bg-ios-bg text-ios-secondary'
                    }`}
                  >
                    <span className="truncate text-sm font-bold text-ios-label">
                      {myName}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFirstPlayerSlot('partner')}
                    className={`flex min-h-[48px] items-center justify-center rounded-xl border px-3 py-2 transition-all ${
                      effectiveFirstSlot === 'partner'
                        ? 'border-ios-accent bg-ios-accent/10 text-ios-label ring-2 ring-ios-accent/30'
                        : 'border-ios-border bg-ios-bg text-ios-secondary'
                    }`}
                  >
                    <span className="truncate text-sm font-bold text-ios-label">
                      {partnerName}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {/* Sticky Bottom Primary CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ios-border bg-ios-bg/85 px-4 pb-safe pt-3 backdrop-blur-xl">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={handleStart}
            disabled={(isLocating && !location) || (!isOpenInvite && !selectedPartner.trim())}
            className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-ios-accent px-6 text-base font-semibold text-white shadow-sm transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            Start
          </button>
        </div>
      </div>

      {/* First-Time User Onboarding Modal ("What's your name?") */}
      {needsOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-ios-border bg-ios-card p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <BrandLogo size="sm" />
              <div>
                <h2 className="text-lg font-bold text-ios-label">
                  Welcome to 4·2·1
                </h2>
                <p className="text-xs text-ios-secondary">
                  Set your name for this iPhone
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-ios-secondary">
              We’ll remember your name on this phone so you can jump straight into 2-player dinner games with anyone.
            </p>

            <form onSubmit={handleOnboardingSubmit} className="mt-4 space-y-3">
              <input
                type="text"
                maxLength={24}
                value={onboardingNameInput}
                onChange={(e) => setOnboardingNameInput(e.target.value)}
                placeholder="Your first name (e.g. Alex)"
                autoFocus
                className="min-h-[48px] w-full rounded-2xl border border-ios-border bg-ios-bg px-4 text-base font-semibold text-ios-label placeholder:text-ios-tertiary focus:border-ios-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={!onboardingNameInput.trim()}
                className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-ios-accent text-sm font-semibold text-white shadow-sm disabled:opacity-45"
              >
                Continue
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Join by 4-Digit Room Code Modal Sheet */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-xs sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border border-ios-border bg-ios-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-ios-label">
                Join by 4-Digit Code
              </h2>
              <button
                type="button"
                onClick={() => setShowCodeModal(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-ios-secondary active:bg-ios-elevated"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-ios-secondary">
              Enter the 4-digit code shown at the top of your partner’s iPhone.
            </p>

            <form onSubmit={handleJoinCodeSubmit} className="mt-4 space-y-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={roomCodeInput}
                onChange={(e) =>
                  setRoomCodeInput(e.target.value.replace(/\D/g, ''))
                }
                placeholder="1234"
                autoFocus
                className="min-h-[52px] w-full rounded-2xl border border-ios-border bg-ios-bg text-center text-2xl font-bold tracking-[0.35em] text-ios-label focus:border-ios-accent focus:outline-none"
              />

              {joinCodeError && (
                <p className="text-center text-xs font-medium text-red-500">
                  {joinCodeError}
                </p>
              )}

              <button
                type="submit"
                disabled={roomCodeInput.length < 4 || isJoiningCode}
                className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-ios-accent text-sm font-semibold text-white disabled:opacity-50"
              >
                {isJoiningCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Join Live Game'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
