'use client';

import React, { useEffect, useState } from 'react';
import {
  DeliveryTiming,
  MealType,
  PRESET_CUISINES,
  PriceTier,
  QuestionnaireAnswers,
  SURPRISE_ME_LABEL,
  TransportMode,
  TravelMinutes,
} from '@/lib/types';
import {
  Car,
  Check,
  Footprints,
  Lock,
  Plus,
  RotateCcw,
  ShoppingBag,
  TrainFront,
  Utensils,
  X,
} from 'lucide-react';

interface Stage4FilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  answers: QuestionnaireAnswers;
  keptCount: number;
  totalCardsCount: number;
  sessionExcludedCount: number;
  onResetSessionExclusions: () => void;
  onApplyFilters: (nextAnswers: QuestionnaireAnswers) => void;
}

const PRICE_TIERS: PriceTier[] = ['$', '$$', '$$$', '$$$$'];

const DELIVERY_TIMINGS: Array<{ id: DeliveryTiming; label: string }> = [
  { id: 'under_30', label: '< 30m' },
  { id: 'under_45', label: '< 45m' },
  { id: 'under_60', label: '< 60m' },
  { id: 'no_rush', label: 'No rush' },
];

const TRAVEL_TIMES: TravelMinutes[] = [10, 15, 25, 40];

export function Stage4FilterSheet({
  isOpen,
  onClose,
  answers,
  keptCount,
  totalCardsCount,
  sessionExcludedCount,
  onResetSessionExclusions,
  onApplyFilters,
}: Stage4FilterSheetProps) {
  const [draft, setDraft] = useState<QuestionnaireAnswers>(answers);
  const [customCuisine, setCustomCuisine] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDraft(answers);
      setCustomCuisine('');
    }
  }, [isOpen, answers]);

  if (!isOpen) return null;

  const toggleMealType = (mt: MealType) => {
    const exists = draft.mealTypes.includes(mt);
    if (exists && draft.mealTypes.length === 1) return; // keep at least 1
    const next = exists
      ? draft.mealTypes.filter((m) => m !== mt)
      : [...draft.mealTypes, mt];
    setDraft({ ...draft, mealTypes: next });
  };

  const toggleCuisine = (c: string) => {
    if (c === SURPRISE_ME_LABEL) {
      setDraft({ ...draft, cuisines: [SURPRISE_ME_LABEL] });
      return;
    }
    const withoutSurprise = draft.cuisines.filter(
      (item) => item !== SURPRISE_ME_LABEL
    );
    const exists = withoutSurprise.includes(c);
    const next = exists
      ? withoutSurprise.filter((item) => item !== c)
      : [...withoutSurprise, c];
    setDraft({
      ...draft,
      cuisines: next.length > 0 ? next : [SURPRISE_ME_LABEL],
    });
  };

  const handleAddCustomCuisine = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customCuisine.trim();
    if (!cleaned) return;
    const withoutSurprise = draft.cuisines.filter(
      (item) => item !== SURPRISE_ME_LABEL
    );
    if (
      !withoutSurprise.some(
        (item) => item.toLowerCase() === cleaned.toLowerCase()
      )
    ) {
      setDraft({ ...draft, cuisines: [...withoutSurprise, cleaned] });
    }
    setCustomCuisine('');
  };

  const togglePriceTier = (tier: PriceTier) => {
    const exists = draft.priceTiers.includes(tier);
    if (exists && draft.priceTiers.length === 1) return;
    const next = exists
      ? draft.priceTiers.filter((t) => t !== tier)
      : [...draft.priceTiers, tier];
    setDraft({ ...draft, priceTiers: next });
  };

  const customAddedCuisines = draft.cuisines.filter(
    (c) =>
      c !== SURPRISE_ME_LABEL &&
      !PRESET_CUISINES.includes(c as (typeof PRESET_CUISINES)[number])
  );
  const allDisplayCuisines = [...PRESET_CUISINES, ...customAddedCuisines];

  const slotsToFill = Math.max(0, Math.max(4, totalCardsCount) - keptCount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl border border-ios-border bg-ios-card shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-ios-border px-5 pb-3.5 pt-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ios-label">
              Update Filters
            </h2>
            {keptCount > 0 ? (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-ios-accent">
                <Lock className="h-3 w-3" />
                <span>
                  Keeping {keptCount} locked spot{keptCount === 1 ? '' : 's'} —
                  only refreshes the other {slotsToFill}
                </span>
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-ios-secondary">
                Adjust cuisines, budget, or range and roll fresh options.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ios-elevated text-ios-secondary active:opacity-80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Meal Type */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
              Meal Type (Pick 1 or Both)
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => toggleMealType('order_in')}
                className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all ${
                  draft.mealTypes.includes('order_in')
                    ? 'border-ios-accent bg-ios-accent/15 text-ios-accent'
                    : 'border-ios-border bg-ios-bg text-ios-secondary'
                }`}
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                <span>Order In</span>
              </button>
              <button
                type="button"
                onClick={() => toggleMealType('eat_out')}
                className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all ${
                  draft.mealTypes.includes('eat_out')
                    ? 'border-ios-accent bg-ios-accent/15 text-ios-accent'
                    : 'border-ios-border bg-ios-bg text-ios-secondary'
                }`}
              >
                <Utensils className="h-3.5 w-3.5" />
                <span>Eat Out</span>
              </button>
            </div>
          </div>

          {/* Cuisines */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
              Cuisines
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allDisplayCuisines.map((c) => {
                const active = draft.cuisines.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCuisine(c)}
                    className={`inline-flex min-h-[34px] items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                      active
                        ? 'border-ios-accent bg-ios-accent text-white'
                        : 'border-ios-border bg-ios-bg text-ios-label'
                    }`}
                  >
                    {active && <Check className="h-3 w-3 stroke-[2.5]" />}
                    <span>{c}</span>
                  </button>
                );
              })}
            </div>
            <form onSubmit={handleAddCustomCuisine} className="mt-2 flex gap-2">
              <input
                type="text"
                value={customCuisine}
                onChange={(e) => setCustomCuisine(e.target.value)}
                placeholder="Add custom cuisine (e.g. Tapas, Ethiopian)…"
                className="min-h-[38px] flex-1 rounded-xl border border-ios-border bg-ios-bg px-3 text-xs text-ios-label placeholder:text-ios-tertiary focus:border-ios-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={!customCuisine.trim()}
                className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-ios-elevated px-3 text-xs font-semibold text-ios-label disabled:opacity-45"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </form>
          </div>

          {/* Budget / Price Tiers */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
              Budget (Local Gems Without Tags Still Included)
            </label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {PRICE_TIERS.map((tier) => {
                const active = draft.priceTiers.includes(tier);
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => togglePriceTier(tier)}
                    className={`flex min-h-[42px] items-center justify-center rounded-xl border text-xs font-bold transition-all ${
                      active
                        ? 'border-ios-accent bg-ios-accent text-white'
                        : 'border-ios-border bg-ios-bg text-ios-label'
                    }`}
                  >
                    {tier}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Delivery Timing (when Order In active) */}
          {draft.mealTypes.includes('order_in') && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                Delivery Speed / Range
              </label>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {DELIVERY_TIMINGS.map((dt) => {
                  const active = draft.deliveryTiming === dt.id;
                  return (
                    <button
                      key={dt.id}
                      type="button"
                      onClick={() =>
                        setDraft({ ...draft, deliveryTiming: dt.id })
                      }
                      className={`flex min-h-[40px] items-center justify-center rounded-xl border px-2 text-xs font-semibold transition-all ${
                        active
                          ? 'border-ios-accent bg-ios-accent/15 text-ios-accent'
                          : 'border-ios-border bg-ios-bg text-ios-secondary'
                      }`}
                    >
                      {dt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Eat Out Transport & Travel Time */}
          {draft.mealTypes.includes('eat_out') && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                  Getting There
                </label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    { id: 'walk' as TransportMode, label: 'Walk', Icon: Footprints },
                    { id: 'transit' as TransportMode, label: 'Transit', Icon: TrainFront },
                    { id: 'drive' as TransportMode, label: 'Drive', Icon: Car },
                  ].map(({ id, label, Icon }) => {
                    const active = draft.transportMode === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          setDraft({ ...draft, transportMode: id })
                        }
                        className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition-all ${
                          active
                            ? 'border-ios-accent bg-ios-accent/15 text-ios-accent'
                            : 'border-ios-border bg-ios-bg text-ios-secondary'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                  Max Travel Time
                </label>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {TRAVEL_TIMES.map((mins) => {
                    const active = draft.maxTravelMinutes === mins;
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() =>
                          setDraft({ ...draft, maxTravelMinutes: mins })
                        }
                        className={`flex min-h-[40px] items-center justify-center rounded-xl border text-xs font-semibold transition-all ${
                          active
                            ? 'border-ios-accent bg-ios-accent/15 text-ios-accent'
                            : 'border-ios-border bg-ios-bg text-ios-secondary'
                        }`}
                      >
                        {mins}m
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Cravings / Dealbreakers Note */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
              Cravings or Dealbreakers Note
            </label>
            <input
              type="text"
              value={draft.cravingsNote}
              onChange={(e) =>
                setDraft({ ...draft, cravingsNote: e.target.value })
              }
              placeholder="e.g. spicy noodles, no sushi, cozy date spot…"
              className="mt-2 min-h-[42px] w-full rounded-xl border border-ios-border bg-ios-bg px-3 text-xs text-ios-label placeholder:text-ios-tertiary focus:border-ios-accent focus:outline-none"
            />
          </div>

          {/* Reset Rejected Spots */}
          {sessionExcludedCount > 0 && (
            <div className="flex items-center justify-between rounded-2xl border border-ios-border bg-ios-bg px-3.5 py-2.5">
              <span className="text-xs text-ios-secondary">
                {sessionExcludedCount} previously skipped spot
                {sessionExcludedCount === 1 ? '' : 's'} hidden
              </span>
              <button
                type="button"
                onClick={onResetSessionExclusions}
                className="inline-flex items-center gap-1 text-xs font-semibold text-ios-accent active:opacity-80"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Put Back in Play</span>
              </button>
            </div>
          )}
        </div>

        {/* Sticky Apply CTA */}
        <div className="border-t border-ios-border px-5 pb-safe pt-3">
          <button
            type="button"
            onClick={() => onApplyFilters(draft)}
            className="mb-3 flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-ios-accent px-5 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
          >
            {keptCount === 0
              ? 'Apply & Roll 4 Fresh Spots'
              : slotsToFill > 0
              ? `Apply & Refresh ${slotsToFill} Unkept Spot${
                  slotsToFill === 1 ? '' : 's'
                }`
              : 'Save Filter Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
