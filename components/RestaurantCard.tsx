'use client';

import React, { useEffect, useState } from 'react';
import {
  DELIVERY_PLATFORMS,
  DeliveryPlatformId,
  DinnerOption,
} from '@/lib/types';
import { isDirectStorefrontUrl } from '@/lib/delivery-lookup';
import { saveLearnedDeliveryEntries } from '@/lib/supabase';
import { Check, Heart, ShoppingBag, Utensils } from 'lucide-react';

interface RestaurantCardProps {
  option: DinnerOption;
  mode: 'review_4' | 'pick_2' | 'pick_1';
  isRerolling?: boolean;
  isSelected?: boolean;
  isFavorited?: boolean;
  selectionDisabled?: boolean;
  onRerollCard?: (option: DinnerOption) => void;
  onToggleSelect?: (option: DinnerOption) => void;
  onToggleFavorite?: (option: DinnerOption) => void;
}

export function RestaurantCard({
  option,
  mode,
  isRerolling = false,
  isSelected = false,
  isFavorited = false,
  selectionDisabled = false,
  onToggleSelect,
  onToggleFavorite,
}: RestaurantCardProps) {
  const [resolvedUrls, setResolvedUrls] = useState<
    Partial<Record<DeliveryPlatformId, string>>
  >({});

  // Upgrade any fallback or legacy storeUrl to a direct canonical Universal Link (`deliveroo.co.uk/menu/...`) on mount
  useEffect(() => {
    if (
      option.mealType !== 'order_in' ||
      option.kind !== 'restaurant' ||
      !Array.isArray(option.deliveryQuotes)
    ) {
      return;
    }

    let cancelled = false;
    for (const quote of option.deliveryQuotes) {
      const cleaned = (quote.storeUrl || '').replace(/\/RK=\d+.*$/i, '');
      if (isDirectStorefrontUrl(quote.platformId, cleaned)) {
        if (cleaned !== quote.storeUrl) {
          setResolvedUrls((prev) => ({ ...prev, [quote.platformId]: cleaned }));
        }
        continue;
      }

      const params = new URLSearchParams({
        platform: quote.platformId,
        name: option.name,
        area: option.shortAddress || 'London',
        json: '1',
      });
      fetch(`/api/delivery-link?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data?.storeUrl) {
            setResolvedUrls((prev) => ({
              ...prev,
              [quote.platformId]: data.storeUrl,
            }));
            saveLearnedDeliveryEntries([
              {
                placeId: option.placeId,
                restaurantName: option.name,
                quotes: {
                  [quote.platformId]: {
                    ...quote,
                    storeUrl: data.storeUrl,
                  },
                },
                updatedAt: new Date().toISOString(),
              },
            ]);
          }
        })
        .catch(() => {
          // ignore
        });
    }

    return () => {
      cancelled = true;
    };
  }, [option]);

  if (isRerolling) {
    return (
      <div className="animate-shimmer rounded-2xl border border-ios-border p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="h-5 w-44 rounded-md bg-ios-border/50" />
          <div className="h-6 w-20 rounded-full bg-ios-border/50" />
        </div>
        <div className="mt-3 h-3.5 w-60 rounded-md bg-ios-border/40" />
        <div className="mt-3 h-4 w-full rounded-md bg-ios-border/40" />
        <div className="mt-1.5 h-4 w-3/4 rounded-md bg-ios-border/40" />
      </div>
    );
  }

  const isSelectable =
    mode === 'review_4' || mode === 'pick_2' || mode === 'pick_1';
  const isOrderIn = option.mealType === 'order_in';
  const favActive = Boolean(isFavorited || option.isFavorite);

  const handleCardClick = () => {
    if (!isSelectable || !onToggleSelect) return;
    onToggleSelect(option);
  };

  return (
    <div
      role={isSelectable ? 'button' : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (isSelectable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleCardClick();
        }
      }}
      className={`group relative rounded-2xl border p-4 transition-all duration-150 ${
        isSelectable ? 'cursor-pointer active:scale-[0.99]' : ''
      } ${
        isSelected
          ? 'border-ios-accent bg-ios-card ring-2 ring-ios-accent/35 shadow-sm'
          : 'border-ios-border bg-ios-card shadow-sm'
      } ${
        selectionDisabled && !isSelected ? 'opacity-65' : 'opacity-100'
      }`}
    >
      {/* Header Row: Name + MealType Pill + Fast-Favorite Heart + Keep Badge (Stage 4) OR Checkmark Ring (Stage 2 / 1) */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-semibold leading-snug tracking-tight text-ios-label">
              {option.name}
            </h3>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-tight ${
                isOrderIn
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {isOrderIn ? (
                <>
                  <ShoppingBag className="h-3 w-3" />
                  Order In
                </>
              ) : (
                <>
                  <Utensils className="h-3 w-3" />
                  Eat Out
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(option);
              }}
              aria-label={
                favActive ? 'Remove from Favorites' : 'Add to Favorites'
              }
              title={favActive ? 'Saved in Favorites' : 'Save to Favorites'}
              className={`inline-flex min-h-[30px] items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all active:scale-95 ${
                favActive
                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-500'
                  : 'border-ios-border bg-ios-elevated/60 text-ios-secondary hover:text-ios-label'
              }`}
            >
              <Heart
                className={`h-3.5 w-3.5 ${favActive ? 'fill-rose-500 text-rose-500' : ''}`}
              />
              <span className="text-[11px]">{favActive ? 'Saved' : 'Fav'}</span>
            </button>
          )}

          {mode === 'review_4' && (
            <div
              className={`inline-flex min-h-[30px] shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${
                isSelected
                  ? 'border-ios-accent bg-ios-accent text-white shadow-xs'
                  : 'border-ios-border bg-ios-elevated/60 text-ios-secondary'
              }`}
            >
              {isSelected ? (
                <>
                  <Check className="h-3.5 w-3.5 stroke-[2.75]" />
                  <span>Kept</span>
                </>
              ) : (
                <span>Keep</span>
              )}
            </div>
          )}

          {(mode === 'pick_2' || mode === 'pick_1') && (
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all ${
                isSelected
                  ? 'border-ios-accent bg-ios-accent text-white shadow-sm'
                  : 'border-ios-tertiary bg-ios-elevated/40 text-transparent'
              }`}
            >
              <Check className="h-4 w-4 stroke-[2.75]" />
            </div>
          )}
        </div>
      </div>

      {/* Meta Row: Cuisine • Price • Rating • Est. Time & Short Street/Neighborhood */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium text-ios-secondary">
        <span className="font-semibold text-ios-label/90">
          {option.cuisineLabel}
        </span>
        {option.priceTier && (
          <>
            <span>•</span>
            <span>{option.priceTier}</span>
          </>
        )}
        {option.rating && (
          <>
            <span>•</span>
            <span className="inline-flex items-center gap-0.5 text-ios-label/90">
              <span className="text-amber-500">★</span>
              <span>{option.rating.toFixed(1)}</span>
              {option.userRatingCount ? (
                <span className="text-ios-secondary">
                  ({option.userRatingCount.toLocaleString()})
                </span>
              ) : null}
            </span>
          </>
        )}
        <span>•</span>
        <span>{option.estimatedTimeLabel}</span>
        {option.shortAddress && (
          <>
            <span>•</span>
            <span className="truncate max-w-[180px]">{option.shortAddress}</span>
          </>
        )}
      </div>

      {/* Per-Delivery-App ETA Badges for Order In candidates */}
      {isOrderIn &&
        option.kind === 'restaurant' &&
        Array.isArray(option.deliveryQuotes) &&
        option.deliveryQuotes.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {option.deliveryQuotes.map((quote) => {
              const platformMeta = DELIVERY_PLATFORMS.find(
                (p) => p.id === quote.platformId
              );
              const cleanHref =
                resolvedUrls[quote.platformId] ||
                (quote.storeUrl || '').replace(/\/RK=\d+.*$/i, '');
              return (
                <a
                  key={quote.platformId}
                  href={cleanHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ios-border bg-ios-bg px-2 py-0.5 text-[11px] font-semibold text-ios-label transition-colors hover:border-ios-accent"
                  title={`Open ${option.name} on ${quote.label}`}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: platformMeta?.brandColor || '#007AFF',
                    }}
                  />
                  <span>{quote.label}</span>
                  <span className="font-bold text-ios-accent">
                    {quote.etaLabel}
                  </span>
                </a>
              );
            })}
          </div>
        )}

      {/* Body: 1-Sentence Appetizing Pitch */}
      <p className="mt-2.5 text-[14px] leading-relaxed text-ios-label/90">
        {option.pitch}
      </p>
    </div>
  );
}
