'use client';

import React, { useEffect, useState } from 'react';
import {
  DinnerOption,
  GeoLocationData,
  HouseholdFavorite,
  ManualIncludedPlace,
} from '@/lib/types';
import { Check, Heart, Loader2, Plus, Search, X } from 'lucide-react';

interface Stage4AddSpotSheetProps {
  isOpen: boolean;
  onClose: () => void;
  location: GeoLocationData;
  favorites: HouseholdFavorite[];
  currentFour: DinnerOption[];
  keptCount: number;
  isAddingPlaceId: string | null;
  onSelectPlace: (place: ManualIncludedPlace) => Promise<void>;
}

export function Stage4AddSpotSheet({
  isOpen,
  onClose,
  location,
  favorites,
  currentFour,
  keptCount,
  isAddingPlaceId,
  onSelectPlace,
}: Stage4AddSpotSheetProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ManualIncludedPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setIsSearching(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: trimmed,
          lat: String(location.lat),
          lng: String(location.lng),
          label: location.label,
        });
        const res = await fetch(`/api/options?${params.toString()}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data.results)) {
          setResults(data.results);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, query, location.lat, location.lng, location.label]);

  if (!isOpen) return null;

  const currentIds = new Set(currentFour.map((c) => c.placeId));
  const currentNamesLower = new Set(
    currentFour.map((c) => c.name.trim().toLowerCase())
  );

  const isAlreadyOnScreen = (placeId: string, name: string) =>
    currentIds.has(placeId) || currentNamesLower.has(name.trim().toLowerCase());

  const availableFavorites = favorites.filter(
    (f) => !isAlreadyOnScreen(f.placeId, f.name)
  );

  const filteredFavorites = query.trim()
    ? availableFavorites.filter(
        (f) =>
          f.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          f.cuisine.toLowerCase().includes(query.trim().toLowerCase())
      )
    : availableFavorites.slice(0, 8);

  const unkeptCount = Math.max(0, currentFour.length - keptCount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={() => {
        if (!isAddingPlaceId) onClose();
      }}
    >
      <div
        className="flex max-h-[86dvh] w-full max-w-md flex-col rounded-t-3xl border border-ios-border bg-ios-card shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-ios-border px-5 pb-3.5 pt-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ios-label">
              Add & Keep a Restaurant
            </h2>
            <p className="mt-0.5 text-xs text-ios-secondary">
              {currentFour.length < 4
                ? 'Adds directly to your lineup and marks it Kept.'
                : unkeptCount > 0
                ? `Replaces 1 unkept option and locks it in as Kept.`
                : `All 4 slots are kept — picking a spot swaps slot #4.`}
            </p>
          </div>
          <button
            type="button"
            disabled={Boolean(isAddingPlaceId)}
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ios-elevated text-ios-secondary active:opacity-80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="border-b border-ios-border px-5 py-3">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-ios-secondary" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search any spot near ${location.label.split(',')[0]}…`}
              autoFocus
              className="min-h-[44px] w-full rounded-2xl border border-ios-border bg-ios-bg pl-10 pr-9 text-sm font-medium text-ios-label placeholder:text-ios-tertiary focus:border-ios-accent focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-ios-elevated text-ios-secondary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Results & Favorites */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 pb-safe">
          {/* Live Search Results */}
          {query.trim().length >= 2 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ios-secondary">
                  Search Results
                </span>
                {isSearching && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-ios-accent" />
                )}
              </div>

              <div className="space-y-2">
                {results.map((place) => {
                  const alreadyIn = isAlreadyOnScreen(
                    place.placeId,
                    place.name
                  );
                  const isBusy = isAddingPlaceId === place.placeId;
                  return (
                    <button
                      key={place.placeId}
                      type="button"
                      disabled={alreadyIn || Boolean(isAddingPlaceId)}
                      onClick={() => onSelectPlace(place)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-ios-border bg-ios-bg p-3 text-left transition-all active:scale-[0.99] disabled:opacity-55"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ios-label">
                          {place.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-ios-secondary">
                          {place.cuisine}
                          {place.rating ? ` • ★ ${place.rating.toFixed(1)}` : ''}
                          {place.priceTier ? ` • ${place.priceTier}` : ''}
                          {place.shortAddress ? ` • ${place.shortAddress}` : ''}
                        </p>
                      </div>
                      <span
                        className={`inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold ${
                          alreadyIn
                            ? 'bg-ios-elevated text-ios-secondary'
                            : 'bg-ios-accent text-white'
                        }`}
                      >
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : alreadyIn ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>In List</span>
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" />
                            <span>Keep</span>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}

                {/* Custom fallback so any restaurant name can always be added */}
                {!isSearching &&
                  !results.some(
                    (r) =>
                      r.name.trim().toLowerCase() ===
                      query.trim().toLowerCase()
                  ) && (
                    <button
                      type="button"
                      disabled={Boolean(isAddingPlaceId)}
                      onClick={() => {
                        const customId = `manual_${query
                          .trim()
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`;
                        onSelectPlace({
                          placeId: customId,
                          name: query.trim(),
                          cuisine: 'Hand-Picked',
                          shortAddress: location.label,
                        });
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-ios-accent/50 bg-ios-accent/5 p-3 text-left active:scale-[0.99] disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ios-accent">
                          Add “{query.trim()}”
                        </p>
                        <p className="mt-0.5 text-xs text-ios-secondary">
                          Include custom restaurant & mark Kept
                        </p>
                      </div>
                      <span className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-full bg-ios-accent px-3 text-xs font-semibold text-white">
                        <Plus className="h-3.5 w-3.5" />
                        <span>Keep</span>
                      </span>
                    </button>
                  )}
              </div>
            </div>
          )}

          {/* Saved Favorites Quick-Pick */}
          {filteredFavorites.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ios-secondary">
                  Quick-Add From Favorites
                </span>
              </div>
              <div className="space-y-2">
                {filteredFavorites.map((fav) => {
                  const isBusy = isAddingPlaceId === fav.placeId;
                  return (
                    <button
                      key={fav.placeId}
                      type="button"
                      disabled={Boolean(isAddingPlaceId)}
                      onClick={() =>
                        onSelectPlace({
                          placeId: fav.placeId,
                          name: fav.name,
                          cuisine: fav.cuisine,
                          priceTier: fav.priceTier,
                          shortAddress:
                            fav.shortAddress &&
                            fav.shortAddress !== 'Household Favorite'
                              ? fav.shortAddress
                              : location.label,
                          pitch: fav.notes,
                          isFavorite: true,
                        })
                      }
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-ios-border bg-ios-bg p-3 text-left transition-all active:scale-[0.99] disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-semibold text-ios-label">
                            {fav.name}
                          </p>
                          <Heart className="h-3 w-3 shrink-0 fill-rose-500 text-rose-500" />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ios-secondary">
                          {fav.cuisine}
                          {fav.priceTier ? ` • ${fav.priceTier}` : ''}
                          {fav.shortAddress &&
                          fav.shortAddress !== 'Household Favorite'
                            ? ` • ${fav.shortAddress}`
                            : ''}
                        </p>
                      </div>
                      <span className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-full bg-ios-accent/15 px-3 text-xs font-semibold text-ios-accent">
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" />
                            <span>Keep</span>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {query.trim().length < 2 && filteredFavorites.length === 0 && (
            <p className="py-6 text-center text-xs text-ios-secondary">
              Type at least 2 letters above to search any restaurant nearby and
              lock it into your 4 options.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
