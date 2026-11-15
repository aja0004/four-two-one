'use client';

import React, { useEffect, useState } from 'react';
import {
  DeliveryTiming,
  GeoLocationData,
  HouseholdFavorite,
  ManualIncludedPlace,
  MealType,
  PRESET_CUISINES,
  PriceTier,
  QuestionnaireAnswers,
  RecentWinner,
  SURPRISE_ME_LABEL,
  TransportMode,
  TravelMinutes,
} from '@/lib/types';
import {
  ArrowLeft,
  Car,
  ChevronDown,
  ChevronUp,
  Footprints,
  Heart,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  TrainFront,
  Utensils,
  X,
} from 'lucide-react';

interface QuestionnaireViewProps {
  page: 1 | 2;
  user1Name: string;
  answers: QuestionnaireAnswers;
  recentWinners: RecentWinner[];
  favorites: HouseholdFavorite[];
  location: GeoLocationData;
  sessionExcludedCount: number;
  onUpdateAnswers: (next: QuestionnaireAnswers) => void;
  onToggleFavoritePlace: (place: ManualIncludedPlace) => void;
  onGoToPage2: () => void;
  onBackToPage1: () => void;
  onSubmitFindOptions: () => void;
  onResetSessionExclusions: () => void;
}

const PRICE_TIERS: PriceTier[] = ['$', '$$', '$$$', '$$$$'];

const DELIVERY_TIMINGS: Array<{ id: DeliveryTiming; label: string }> = [
  { id: 'under_30', label: 'Under 30 min' },
  { id: 'under_45', label: 'Under 45 min' },
  { id: 'under_60', label: 'Under 60 min' },
  { id: 'no_rush', label: 'No rush' },
];

const TRAVEL_TIMES: TravelMinutes[] = [10, 15, 25, 40];

export function QuestionnaireView({
  page,
  user1Name,
  answers,
  recentWinners,
  favorites,
  location,
  sessionExcludedCount,
  onUpdateAnswers,
  onToggleFavoritePlace,
  onGoToPage2,
  onBackToPage1,
  onSubmitFindOptions,
  onResetSessionExclusions,
}: QuestionnaireViewProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCuisineText, setCustomCuisineText] = useState('');
  const [showRecentDrawer, setShowRecentDrawer] = useState(false);

  // Manual restaurant lookup & inclusion state
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<ManualIncludedPlace[]>([]);
  const [isSearchingLookup, setIsSearchingLookup] = useState(false);

  const manuallyIncluded = answers.manuallyIncludedPlaces || [];

  // Debounced live lookup against GET /api/options?q=...
  useEffect(() => {
    const trimmed = lookupQuery.trim();
    if (trimmed.length < 2) {
      setLookupResults([]);
      setIsSearchingLookup(false);
      return;
    }

    let cancelled = false;
    setIsSearchingLookup(true);

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
          setLookupResults(data.results);
        }
      } catch {
        if (!cancelled) setLookupResults([]);
      } finally {
        if (!cancelled) setIsSearchingLookup(false);
      }
    }, 240);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lookupQuery, location.lat, location.lng, location.label]);

  const isManualPlaceSelected = (place: { placeId: string; name: string }) => {
    const normName = place.name.trim().toLowerCase();
    return manuallyIncluded.some(
      (m) =>
        m.placeId === place.placeId || m.name.trim().toLowerCase() === normName
    );
  };

  const toggleManualIncludePlace = (place: ManualIncludedPlace) => {
    const normName = place.name.trim().toLowerCase();
    const exists = manuallyIncluded.some(
      (m) =>
        m.placeId === place.placeId || m.name.trim().toLowerCase() === normName
    );
    if (exists) {
      const next = manuallyIncluded.filter(
        (m) =>
          m.placeId !== place.placeId &&
          m.name.trim().toLowerCase() !== normName
      );
      onUpdateAnswers({ ...answers, manuallyIncludedPlaces: next });
      return;
    }

    if (manuallyIncluded.length >= 4) return;
    onUpdateAnswers({
      ...answers,
      manuallyIncludedPlaces: [...manuallyIncluded, place],
    });
  };

  const handleIncludeCustomLookupText = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = lookupQuery.trim();
    if (!cleaned || manuallyIncluded.length >= 4) return;
    const slug = cleaned
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const customPlace: ManualIncludedPlace = {
      placeId: `manual_${slug}`,
      name: cleaned,
      cuisine: 'Restaurant',
      priceTier: '$$',
      shortAddress: location.label,
    };
    toggleManualIncludePlace(customPlace);
    setLookupQuery('');
    setLookupResults([]);
  };

  // Deduplicate recent winners by placeId
  const uniqueRecentWinners = React.useMemo(() => {
    const map = new Map<string, RecentWinner>();
    for (const w of recentWinners) {
      if (!map.has(w.placeId)) {
        map.set(w.placeId, w);
      }
    }
    return Array.from(map.values());
  }, [recentWinners]);

  const customCuisines = answers.cuisines.filter(
    (c) => !(PRESET_CUISINES as readonly string[]).includes(c)
  );

  const toggleMealType = (mt: MealType) => {
    const exists = answers.mealTypes.includes(mt);
    if (exists && answers.mealTypes.length === 1) {
      // Must keep at least 1 selected; switch to the other one if tapping the only active one
      const other: MealType = mt === 'order_in' ? 'eat_out' : 'order_in';
      onUpdateAnswers({ ...answers, mealTypes: [other] });
      return;
    }
    const nextMealTypes = exists
      ? answers.mealTypes.filter((m) => m !== mt)
      : [...answers.mealTypes, mt];
    onUpdateAnswers({ ...answers, mealTypes: nextMealTypes });
  };

  const toggleCuisine = (cuisine: string) => {
    if (cuisine === SURPRISE_ME_LABEL) {
      onUpdateAnswers({
        ...answers,
        cuisines: [SURPRISE_ME_LABEL],
      });
      return;
    }

    const withoutSurprise = answers.cuisines.filter(
      (c) => c !== SURPRISE_ME_LABEL
    );
    const exists = withoutSurprise.includes(cuisine);
    let next = exists
      ? withoutSurprise.filter((c) => c !== cuisine)
      : [...withoutSurprise, cuisine];

    if (next.length === 0) {
      next = [SURPRISE_ME_LABEL];
    }

    onUpdateAnswers({ ...answers, cuisines: next });
  };

  const handleAddCustomCuisine = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customCuisineText.trim();
    if (!cleaned) return;
    const withoutSurprise = answers.cuisines.filter(
      (c) => c !== SURPRISE_ME_LABEL
    );
    if (!withoutSurprise.includes(cleaned)) {
      onUpdateAnswers({
        ...answers,
        cuisines: [...withoutSurprise, cleaned],
      });
    }
    setCustomCuisineText('');
    setShowCustomInput(false);
  };

  const togglePriceTier = (tier: PriceTier) => {
    const exists = answers.priceTiers.includes(tier);
    if (exists && answers.priceTiers.length === 1) return; // keep at least 1
    const next = exists
      ? answers.priceTiers.filter((t) => t !== tier)
      : [...answers.priceTiers, tier];
    onUpdateAnswers({ ...answers, priceTiers: next });
  };

  const toggleIndividualRecentWinner = (placeId: string) => {
    const exists = answers.excludedRecentWinnerIds.includes(placeId);
    const nextIds = exists
      ? answers.excludedRecentWinnerIds.filter((id) => id !== placeId)
      : [...answers.excludedRecentWinnerIds, placeId];
    onUpdateAnswers({
      ...answers,
      excludedRecentWinnerIds: nextIds,
      excludeRecentWinners: nextIds.length > 0,
    });
  };

  if (page === 1) {
    const bothMealTypesSelected =
      answers.mealTypes.includes('order_in') &&
      answers.mealTypes.includes('eat_out');

    return (
      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ios-accent">
            Step 1 of 2 • {user1Name}’s Cravings
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-ios-label">
            What sounds good?
          </h1>
        </div>

        {/* COMPACT TOP EXCLUDE TOGGLE (Small Footprint) */}
        <section className="mb-3.5 rounded-xl border border-ios-border bg-ios-card px-3.5 py-2 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-xs font-semibold text-ios-label">
                Exclude recent winners (7d)
              </span>
              {uniqueRecentWinners.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowRecentDrawer((v) => !v)}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-ios-elevated px-2 py-0.5 text-[11px] font-semibold text-ios-accent"
                >
                  <span>
                    {answers.excludeRecentWinners
                      ? answers.excludedRecentWinnerIds.length
                      : 0}
                    /{uniqueRecentWinners.length}
                  </span>
                  {showRecentDrawer ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              ) : (
                <span className="shrink-0 rounded-full bg-ios-elevated px-2 py-0.5 text-[10px] font-medium text-ios-secondary">
                  0 recent
                </span>
              )}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={answers.excludeRecentWinners}
              onClick={() => {
                const nextToggle = !answers.excludeRecentWinners;
                onUpdateAnswers({
                  ...answers,
                  excludeRecentWinners: nextToggle,
                  excludedRecentWinnerIds: nextToggle
                    ? uniqueRecentWinners.map((w) => w.placeId)
                    : [],
                });
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                answers.excludeRecentWinners
                  ? 'bg-ios-accent'
                  : 'bg-ios-elevated'
              }`}
            >
              <span
                className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-xs transition-transform ${
                  answers.excludeRecentWinners
                    ? 'translate-x-5.5'
                    : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {showRecentDrawer && uniqueRecentWinners.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-ios-border pt-2">
              {uniqueRecentWinners.map((w) => {
                const isExcluded =
                  answers.excludeRecentWinners &&
                  answers.excludedRecentWinnerIds.includes(w.placeId);
                return (
                  <button
                    key={w.placeId}
                    type="button"
                    onClick={() => toggleIndividualRecentWinner(w.placeId)}
                    className="flex min-h-[36px] w-full items-center justify-between rounded-lg bg-ios-bg px-2.5 py-1.5 text-left text-xs"
                  >
                    <div className="truncate pr-2">
                      <span className="font-semibold text-ios-label">
                        {w.name}
                      </span>
                      <span className="ml-1.5 text-ios-secondary">
                        {w.cuisine}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        isExcluded
                          ? 'bg-red-500/15 text-red-500'
                          : 'bg-emerald-500/15 text-emerald-500'
                      }`}
                    >
                      {isExcluded ? 'Excluded' : 'Allowed'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* 1. Meal Type (Order In, Eat Out, or Both) */}
        <section className="mb-4 rounded-2xl border border-ios-border bg-ios-card p-4 shadow-sm">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
              Meal Type (Pick 1 or Both)
            </span>
            {bothMealTypesSelected && (
              <span className="rounded-full bg-ios-accent/15 px-2 py-0.5 text-[11px] font-semibold text-ios-accent">
                2 Order In + 2 Eat Out
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => toggleMealType('order_in')}
              className={`flex min-h-[56px] items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                answers.mealTypes.includes('order_in')
                  ? 'border-ios-accent bg-ios-accent/10 text-ios-label ring-2 ring-ios-accent/30'
                  : 'border-ios-border bg-ios-bg text-ios-secondary'
              }`}
            >
              <ShoppingBag className="h-4 w-4 text-amber-500" />
              <span>Order In</span>
            </button>

            <button
              type="button"
              onClick={() => toggleMealType('eat_out')}
              className={`flex min-h-[56px] items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                answers.mealTypes.includes('eat_out')
                  ? 'border-ios-accent bg-ios-accent/10 text-ios-label ring-2 ring-ios-accent/30'
                  : 'border-ios-border bg-ios-bg text-ios-secondary'
              }`}
            >
              <Utensils className="h-4 w-4 text-emerald-500" />
              <span>Eat Out</span>
            </button>
          </div>
        </section>

        {/* 2. Cuisine Multi-Select Chips */}
        <section className="mb-4 rounded-2xl border border-ios-border bg-ios-card p-4 shadow-sm">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
              Cuisines
            </span>
            <span className="text-[11px] text-ios-secondary">
              {answers.cuisines.includes(SURPRISE_ME_LABEL)
                ? 'Open to anything'
                : `${answers.cuisines.length} selected`}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESET_CUISINES.map((cuisine) => {
              const selected = answers.cuisines.includes(cuisine);
              const isSurprise = cuisine === SURPRISE_ME_LABEL;

              return (
                <button
                  key={cuisine}
                  type="button"
                  onClick={() => toggleCuisine(cuisine)}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all active:scale-95 ${
                    selected
                      ? 'border-ios-accent bg-ios-accent text-white shadow-xs'
                      : 'border-ios-border bg-ios-bg text-ios-label'
                  }`}
                >
                  {isSurprise && <Sparkles className="h-3.5 w-3.5" />}
                  <span>{cuisine}</span>
                </button>
              );
            })}

            {customCuisines.map((custom) => (
              <button
                key={custom}
                type="button"
                onClick={() => toggleCuisine(custom)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-ios-accent bg-ios-accent px-3.5 py-2 text-xs font-semibold text-white shadow-xs active:scale-95"
              >
                <span>{custom}</span>
              </button>
            ))}

            {!showCustomInput ? (
              <button
                type="button"
                onClick={() => setShowCustomInput(true)}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-dashed border-ios-border bg-ios-bg px-3.5 py-2 text-xs font-semibold text-ios-accent active:bg-ios-elevated"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Custom</span>
              </button>
            ) : (
              <form
                onSubmit={handleAddCustomCuisine}
                className="flex w-full items-center gap-2 pt-1"
              >
                <input
                  type="text"
                  maxLength={32}
                  value={customCuisineText}
                  onChange={(e) => setCustomCuisineText(e.target.value)}
                  placeholder="e.g. Ethiopian, Tapas, Pho…"
                  autoFocus
                  className="min-h-[44px] flex-1 rounded-xl border border-ios-border bg-ios-bg px-3 text-base text-ios-label focus:border-ios-accent focus:outline-none"
                />
                <button
                  type="submit"
                  className="min-h-[44px] rounded-xl bg-ios-accent px-4 text-xs font-semibold text-white"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomInput(false)}
                  className="min-h-[44px] px-2 text-xs font-medium text-ios-secondary"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        </section>

        {/* 3. Optional Cravings / Dietary / Dealbreakers Note */}
        <section className="mb-4 rounded-2xl border border-ios-border bg-ios-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <label
              htmlFor="cravings-note"
              className="text-xs font-semibold uppercase tracking-wider text-ios-secondary"
            >
              Cravings or Dealbreakers (Optional)
            </label>
            <span className="text-[11px] text-ios-tertiary">
              {answers.cravingsNote.length}/160
            </span>
          </div>
          <input
            id="cravings-note"
            type="text"
            maxLength={160}
            value={answers.cravingsNote}
            onChange={(e) =>
              onUpdateAnswers({ ...answers, cravingsNote: e.target.value })
            }
            placeholder="e.g., cozy ramen, vegetarian options, patio, no sushi"
            className="min-h-[44px] w-full rounded-xl border border-ios-border bg-ios-bg px-3.5 text-base text-ios-label placeholder:text-ios-tertiary focus:border-ios-accent focus:outline-none"
          />
        </section>

        {/* 4. Manually Include Specific Restaurants (Lookup or Radio Buttons of Favorites) */}
        <section className="mb-4 rounded-2xl border border-ios-border bg-ios-card p-4 shadow-sm">
          <div className="mb-2.5 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                Include Specific Spots (Optional)
              </span>
              <p className="mt-0.5 text-[11px] text-ios-tertiary">
                Lock up to 4 spots into tonight’s 4 options
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                manuallyIncluded.length > 0
                  ? 'bg-ios-accent/15 text-ios-accent'
                  : 'bg-ios-elevated text-ios-secondary'
              }`}
            >
              {manuallyIncluded.length}/4 included
            </span>
          </div>

          {/* Selected manual spots pills */}
          {manuallyIncluded.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {manuallyIncluded.map((spot) => (
                <button
                  key={spot.placeId}
                  type="button"
                  onClick={() => toggleManualIncludePlace(spot)}
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-ios-accent/40 bg-ios-accent/10 px-2.5 py-1 text-xs font-semibold text-ios-accent active:scale-95"
                >
                  <span>{spot.name}</span>
                  <X className="h-3 w-3 opacity-80" />
                </button>
              ))}
            </div>
          )}

          {/* Restaurant Lookup Input */}
          <form onSubmit={handleIncludeCustomLookupText} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ios-tertiary" />
            <input
              type="text"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder="Lookup a restaurant to include…"
              className="min-h-[44px] w-full rounded-xl border border-ios-border bg-ios-bg pl-9 pr-9 text-base text-ios-label placeholder:text-ios-tertiary focus:border-ios-accent focus:outline-none"
            />
            {lookupQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setLookupQuery('');
                  setLookupResults([]);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ios-tertiary hover:text-ios-label"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </form>

          {/* Live Lookup Results */}
          {lookupQuery.trim().length >= 2 && (
            <div className="mt-2 space-y-1.5 rounded-xl border border-ios-border bg-ios-bg p-2">
              {isSearchingLookup && (
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-ios-secondary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-ios-accent" />
                  <span>Searching nearby spots…</span>
                </div>
              )}

              {!isSearchingLookup &&
                lookupResults.map((resPlace) => {
                  const selected = isManualPlaceSelected(resPlace);
                  const disabled = !selected && manuallyIncluded.length >= 4;
                  const isFav = favorites.some(
                    (f) =>
                      f.placeId === resPlace.placeId ||
                      f.name.trim().toLowerCase() ===
                        resPlace.name.trim().toLowerCase()
                  );

                  return (
                    <div
                      key={resPlace.placeId}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                        selected ? 'bg-ios-accent/10' : 'hover:bg-ios-elevated/60'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleManualIncludePlace(resPlace)}
                        className="min-w-0 flex-1 text-left disabled:opacity-45"
                      >
                        <p className="truncate text-xs font-semibold text-ios-label">
                          {resPlace.name}
                        </p>
                        <p className="truncate text-[11px] text-ios-secondary">
                          {resPlace.cuisine}
                          {resPlace.priceTier ? ` • ${resPlace.priceTier}` : ''}
                          {resPlace.shortAddress
                            ? ` • ${resPlace.shortAddress}`
                            : ''}
                        </p>
                      </button>

                      <div className="flex shrink-0 items-center gap-2">
                        {/* Fast-add to Favorites heart toggle */}
                        <button
                          type="button"
                          onClick={() => onToggleFavoritePlace(resPlace)}
                          aria-label={
                            isFav ? 'Remove from Favorites' : 'Add to Favorites'
                          }
                          title={
                            isFav ? 'Saved in Favorites' : 'Fast-add to Favorites'
                          }
                          className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold transition-all active:scale-95 ${
                            isFav
                              ? 'border-rose-500/40 bg-rose-500/15 text-rose-500'
                              : 'border-ios-border bg-ios-card text-ios-secondary hover:text-ios-label'
                          }`}
                        >
                          <Heart
                            className={`h-3 w-3 ${
                              isFav ? 'fill-rose-500 text-rose-500' : ''
                            }`}
                          />
                          <span>{isFav ? 'Saved' : 'Fav'}</span>
                        </button>

                        {/* Radio-style indicator to include in tonight's 4 */}
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => toggleManualIncludePlace(resPlace)}
                          aria-label={
                            selected
                              ? 'Remove from tonight’s options'
                              : 'Include in tonight’s options'
                          }
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all disabled:opacity-45 ${
                            selected
                              ? 'border-ios-accent bg-ios-accent'
                              : 'border-ios-tertiary/50 bg-transparent'
                          }`}
                        >
                          {selected && (
                            <span className="h-2 w-2 rounded-full bg-white" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}

              {/* Option to directly include typed restaurant name if not already in results */}
              {!isSearchingLookup &&
                !lookupResults.some(
                  (r) =>
                    r.name.trim().toLowerCase() ===
                    lookupQuery.trim().toLowerCase()
                ) && (
                  <button
                    type="button"
                    disabled={manuallyIncluded.length >= 4}
                    onClick={handleIncludeCustomLookupText}
                    className="flex min-h-[40px] w-full items-center justify-between rounded-lg bg-ios-elevated/60 px-2.5 py-1.5 text-left text-xs font-semibold text-ios-accent disabled:opacity-45"
                  >
                    <span className="truncate">
                      Include “{lookupQuery.trim()}”
                    </span>
                    <Plus className="h-4 w-4 shrink-0" />
                  </button>
                )}
            </div>
          )}

          {/* Radio buttons list of all Favorites */}
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ios-secondary">
                <Heart className="h-3 w-3 text-rose-500" />
                From Your Favorites ({favorites.length})
              </span>
            </div>

            {favorites.length === 0 ? (
              <p className="rounded-xl bg-ios-bg px-3 py-2.5 text-xs text-ios-tertiary">
                No favorites saved yet — use the lookup above or add favorites on
                the home screen.
              </p>
            ) : (
              <div className="max-h-52 space-y-1.5 overflow-y-auto pr-0.5">
                {favorites.map((fav) => {
                  const favPlace: ManualIncludedPlace = {
                    placeId: fav.placeId,
                    name: fav.name,
                    cuisine: fav.cuisine || 'Favorite',
                    priceTier: fav.priceTier || '$$',
                    shortAddress: fav.shortAddress,
                  };
                  const selected = isManualPlaceSelected(favPlace);
                  const disabled = !selected && manuallyIncluded.length >= 4;

                  return (
                    <button
                      key={fav.placeId}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      onClick={() => toggleManualIncludePlace(favPlace)}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-left transition-all ${
                        selected
                          ? 'border-ios-accent bg-ios-accent/10 text-ios-label'
                          : 'border-ios-border bg-ios-bg text-ios-label disabled:opacity-45'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold">
                            {fav.name}
                          </span>
                          {fav.winsCount > 0 && (
                            <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                              {fav.winsCount}× won
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-ios-secondary">
                          {fav.cuisine}
                          {fav.priceTier ? ` • ${fav.priceTier}` : ''}
                        </p>
                      </div>

                      {/* Radio button circle */}
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                          selected
                            ? 'border-ios-accent bg-ios-accent'
                            : 'border-ios-tertiary/50 bg-transparent'
                        }`}
                      >
                        {selected && (
                          <span className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Optional Reset Rejected Spots if User 1 returned to Edit Filters mid-session */}
        {sessionExcludedCount > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-ios-border bg-ios-card px-4 py-3 text-xs">
            <span className="text-ios-secondary">
              {sessionExcludedCount} spot{sessionExcludedCount === 1 ? '' : 's'}{' '}
              rejected this game
            </span>
            <button
              type="button"
              onClick={onResetSessionExclusions}
              className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-ios-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset rejected spots
            </button>
          </div>
        )}

        {/* Sticky Bottom CTA */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ios-border bg-ios-bg/85 px-4 pb-safe pt-3 backdrop-blur-xl">
          <div className="mx-auto max-w-md">
            <button
              type="button"
              onClick={onGoToPage2}
              disabled={
                answers.mealTypes.length === 0 || answers.cuisines.length === 0
              }
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-ios-accent px-6 text-base font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-50"
            >
              Next: Price & Distance →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PAGE 2: Price Range + Delivery Timing (if Order In) + Transport & Max Travel Time (if Eat Out)
  const wantsOrderIn = answers.mealTypes.includes('order_in');
  const wantsEatOut = answers.mealTypes.includes('eat_out');

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-4">
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBackToPage1}
          aria-label="Back to Page 1"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ios-accent active:bg-ios-elevated"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ios-accent">
            Step 2 of 2 • {user1Name}’s Logistics
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-ios-label">
            Price & timing
          </h1>
        </div>
      </div>

      {/* 1. Shared Price Range */}
      <section className="mb-4 rounded-2xl border border-ios-border bg-ios-card p-4 shadow-sm">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
            Price Range (Multi-select)
          </span>
          <span className="text-xs font-semibold text-ios-label">
            {answers.priceTiers.join(' • ')}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {PRICE_TIERS.map((tier) => {
            const selected = answers.priceTiers.includes(tier);
            return (
              <button
                key={tier}
                type="button"
                onClick={() => togglePriceTier(tier)}
                className={`flex min-h-[48px] items-center justify-center rounded-xl border text-sm font-bold transition-all active:scale-95 ${
                  selected
                    ? 'border-ios-accent bg-ios-accent text-white shadow-xs'
                    : 'border-ios-border bg-ios-bg text-ios-label'
                }`}
              >
                {tier}
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Delivery Timing (If Order In selected) */}
      {wantsOrderIn && (
        <section className="mb-4 rounded-2xl border border-ios-border bg-ios-card p-4 shadow-sm">
          <div className="mb-2.5 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
              Order In • Delivery Timing
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {DELIVERY_TIMINGS.map((item) => {
              const selected = answers.deliveryTiming === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    onUpdateAnswers({ ...answers, deliveryTiming: item.id })
                  }
                  className={`flex min-h-[48px] items-center justify-center rounded-xl border px-3 text-xs font-semibold transition-all ${
                    selected
                      ? 'border-ios-accent bg-ios-accent/10 text-ios-label ring-2 ring-ios-accent/30'
                      : 'border-ios-border bg-ios-bg text-ios-secondary'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Getting There + Max Travel Time (If Eat Out selected) */}
      {wantsEatOut && (
        <section className="mb-4 rounded-2xl border border-ios-border bg-ios-card p-4 shadow-sm">
          <div className="mb-2.5 flex items-center gap-2">
            <Utensils className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
              Eat Out • Getting There
            </span>
          </div>

          {/* Transport Segmented Control */}
          <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-ios-elevated p-1">
            {(
              [
                { id: 'walk', label: 'Walk', icon: Footprints },
                { id: 'drive', label: 'Drive', icon: Car },
                { id: 'transit', label: 'Transit', icon: TrainFront },
              ] as const
            ).map((mode) => {
              const Icon = mode.icon;
              const selected = answers.transportMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() =>
                    onUpdateAnswers({ ...answers, transportMode: mode.id })
                  }
                  className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selected
                      ? 'bg-ios-card text-ios-label shadow-sm'
                      : 'text-ios-secondary'
                  }`}
                >
                  <Icon className="h-4 w-4 text-ios-accent" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ios-secondary">
              Max Travel Time
            </span>
            <div className="grid grid-cols-4 gap-2">
              {TRAVEL_TIMES.map((mins) => {
                const selected = answers.maxTravelMinutes === mins;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() =>
                      onUpdateAnswers({ ...answers, maxTravelMinutes: mins })
                    }
                    className={`flex min-h-[48px] items-center justify-center rounded-xl border text-xs font-semibold transition-all ${
                      selected
                        ? 'border-ios-accent bg-ios-accent/10 text-ios-label ring-2 ring-ios-accent/30'
                        : 'border-ios-border bg-ios-bg text-ios-secondary'
                    }`}
                  >
                    {mins} min
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Sticky Bottom CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ios-border bg-ios-bg/85 px-4 pb-safe pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md gap-2.5">
          <button
            type="button"
            onClick={onBackToPage1}
            className="flex min-h-[52px] items-center justify-center rounded-2xl bg-ios-elevated px-5 text-sm font-semibold text-ios-label active:opacity-80"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onSubmitFindOptions}
            className="flex min-h-[52px] flex-1 items-center justify-center rounded-2xl bg-ios-accent px-6 text-base font-semibold text-white shadow-sm active:scale-[0.99]"
          >
            Find 4 Options
          </button>
        </div>
      </div>
    </div>
  );
}
