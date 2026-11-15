'use client';

import React, { useEffect, useState } from 'react';
import {
  DELIVERY_PLATFORMS,
  DeliveryPlatformId,
  HouseholdFavorite,
  LearnedRestaurantDeliveryInfo,
  TransportMode,
} from '@/lib/types';
import { Check, Heart, Settings, Smartphone, X } from 'lucide-react';

interface UserSettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  deviceOwnerName: string;
  onSaveDeviceOwnerName: (name: string) => void;
  favorites: HouseholdFavorite[];
  onManageFavorites: () => void;
  preferredDeliveryApps: DeliveryPlatformId[];
  onChangePreferredDeliveryApps: (apps: DeliveryPlatformId[]) => void;
  defaultTransport: TransportMode;
  onChangeDefaultTransport: (mode: TransportMode) => void;
  learnedDeliveryCache: Record<string, LearnedRestaurantDeliveryInfo>;
}

export default function UserSettingsSheet({
  isOpen,
  onClose,
  deviceOwnerName,
  onSaveDeviceOwnerName,
  favorites,
  onManageFavorites,
  preferredDeliveryApps,
  onChangePreferredDeliveryApps,
  defaultTransport,
  onChangeDefaultTransport,
  learnedDeliveryCache,
}: UserSettingsSheetProps) {
  const [nameInput, setNameInput] = useState(deviceOwnerName);
  const [showLearnedDetails, setShowLearnedDetails] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNameInput(deviceOwnerName);
    }
  }, [isOpen, deviceOwnerName]);

  if (!isOpen) return null;

  const learnedEntries = Object.values(learnedDeliveryCache).sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );

  const handleClose = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== deviceOwnerName) {
      onSaveDeviceOwnerName(trimmed);
    }
    onClose();
  };

  const handleNameBlur = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== deviceOwnerName) {
      onSaveDeviceOwnerName(trimmed);
    }
  };

  const togglePlatform = (platformId: DeliveryPlatformId) => {
    const exists = preferredDeliveryApps.includes(platformId);
    if (exists) {
      if (preferredDeliveryApps.length <= 1) return; // keep at least one selected
      onChangePreferredDeliveryApps(
        preferredDeliveryApps.filter((id) => id !== platformId)
      );
    } else {
      onChangePreferredDeliveryApps([...preferredDeliveryApps, platformId]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl border border-ios-border bg-ios-card shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ios-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ios-accent/15 text-ios-accent">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ios-label">
                User Settings
              </h2>
              <p className="text-[11px] text-ios-secondary">
                Your phone identity &amp; delivery app preferences
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close settings"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ios-secondary active:bg-ios-elevated"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-4">
          {/* 1. Your Name on This Phone */}
          <div className="rounded-2xl border border-ios-border bg-ios-bg p-4">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-ios-accent" />
              <label
                htmlFor="device-owner-name-input"
                className="text-xs font-semibold uppercase tracking-wider text-ios-secondary"
              >
                Your Name (This iPhone)
              </label>
            </div>
            <p className="mt-1 text-xs text-ios-secondary">
              Saved on this phone so we automatically know it&apos;s you whenever you start or join a game.
            </p>
            <div className="mt-2.5 flex gap-2">
              <input
                id="device-owner-name-input"
                type="text"
                maxLength={24}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleNameBlur();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Enter your name (e.g. Alex)"
                className="min-h-[44px] flex-1 rounded-xl border border-ios-border bg-ios-card px-3.5 text-base font-semibold text-ios-label placeholder:text-ios-tertiary focus:border-ios-accent focus:outline-none"
              />
            </div>
          </div>

          {/* 2. Household Favorites */}
          <div className="rounded-2xl border border-ios-border bg-ios-bg p-4">
            <div className="flex items-center justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 shrink-0 fill-ios-accent text-ios-accent" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                    Favorites
                  </h3>
                  <span className="rounded-full bg-ios-accent/15 px-2 py-0.5 text-xs font-bold text-ios-accent">
                    {favorites.length}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-ios-secondary">
                  {favorites.length > 0
                    ? favorites.slice(0, 3).map((f) => f.name).join(', ') +
                      (favorites.length > 3 ? '…' : '')
                    : 'No favorite spots saved yet'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onManageFavorites();
                }}
                className="min-h-[38px] shrink-0 rounded-xl bg-ios-accent px-3.5 py-2 text-xs font-semibold text-white shadow-2xs active:opacity-90"
              >
                {favorites.length === 0 ? '+ Add Spots' : 'Manage'}
              </button>
            </div>
          </div>

          {/* 3. Multi-select Delivery Apps */}
          <div className="rounded-2xl border border-ios-border bg-ios-bg p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                  My Delivery Apps
                </h3>
                <p className="mt-0.5 text-xs text-ios-secondary">
                  Select the apps you use. We&apos;ll check delivery times across these apps for the 4 candidates.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-ios-accent/15 px-2.5 py-0.5 text-xs font-bold text-ios-accent">
                {preferredDeliveryApps.length} selected
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {DELIVERY_PLATFORMS.map((platform) => {
                const isSelected = preferredDeliveryApps.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => togglePlatform(platform.id)}
                    className={`flex min-h-[48px] w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-all active:scale-[0.99] ${
                      isSelected
                        ? 'border-ios-accent bg-ios-accent/15 text-ios-label shadow-2xs'
                        : 'border-ios-border bg-ios-card text-ios-label hover:border-ios-secondary/40'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                        style={{ backgroundColor: platform.brandColor }}
                      />
                      <span className="truncate text-sm font-semibold text-ios-label">
                        {platform.label}
                      </span>
                    </div>

                    {/* High-contrast Radio/Checkbox Indicator */}
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                        isSelected
                          ? 'border-ios-accent bg-ios-accent text-white shadow-2xs'
                          : 'border-ios-secondary/80 bg-ios-bg text-transparent'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Learned Delivery Memory Count (Read-Only, no reset button) */}
          <div className="rounded-2xl border border-ios-border bg-ios-bg p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                  Learned Delivery Memory
                </h3>
                <p className="mt-0.5 text-xs text-ios-secondary">
                  Automatically saved as candidate restaurants are checked
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {learnedEntries.length}{' '}
                {learnedEntries.length === 1 ? 'restaurant' : 'restaurants'}
              </span>
            </div>

            {learnedEntries.length > 0 && (
              <div className="mt-2.5 border-t border-ios-border pt-2.5">
                <button
                  type="button"
                  onClick={() => setShowLearnedDetails((prev) => !prev)}
                  className="text-xs font-semibold text-ios-accent"
                >
                  {showLearnedDetails
                    ? 'Hide learned restaurants'
                    : `Show ${learnedEntries.length} learned ${
                        learnedEntries.length === 1 ? 'restaurant' : 'restaurants'
                      }`}
                </button>

                {showLearnedDetails && (
                  <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {learnedEntries.map((entry) => {
                      const quotes = Object.values(entry.quotes || {});
                      return (
                        <div
                          key={entry.placeId}
                          className="rounded-xl border border-ios-border bg-ios-card px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-ios-label">
                              {entry.restaurantName}
                            </span>
                            <span className="shrink-0 text-[11px] text-ios-secondary">
                              {quotes.length}{' '}
                              {quotes.length === 1 ? 'app' : 'apps'}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {quotes.map((q) => (
                              <span
                                key={q.platformId}
                                className="inline-flex items-center gap-1 rounded-md border border-ios-border bg-ios-bg px-2 py-0.5 text-[11px] font-medium text-ios-label"
                              >
                                <span>{q.label}:</span>
                                <span className="font-semibold text-ios-accent">
                                  {q.etaLabel}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. Default Eat-Out Travel Mode */}
          <div className="rounded-2xl border border-ios-border bg-ios-bg p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
              Default Eat-Out Travel Mode
            </h3>
            <p className="mt-0.5 text-xs text-ios-secondary">
              Used to estimate travel time when dining out
            </p>
            <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl bg-ios-elevated p-1">
              {(
                [
                  { id: 'walk', label: '🚶 Walk' },
                  { id: 'transit', label: '🚇 Transit' },
                  { id: 'drive', label: '🚗 Drive' },
                ] as { id: TransportMode; label: string }[]
              ).map((item) => {
                const active = defaultTransport === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeDefaultTransport(item.id)}
                    className={`min-h-[40px] rounded-lg text-xs font-semibold transition-all ${
                      active
                        ? 'bg-ios-card text-ios-label shadow-sm'
                        : 'text-ios-secondary'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Done Button */}
          <button
            type="button"
            onClick={handleClose}
            className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-ios-accent px-5 text-sm font-semibold text-white shadow-sm active:opacity-90"
          >
            Save &amp; Done
          </button>
        </div>
      </div>
    </div>
  );
}
