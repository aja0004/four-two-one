'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  GeoLocationData,
  HouseholdFavorite,
  ManualIncludedPlace,
  MealType,
  PRESET_CUISINES,
  PriceTier,
  SURPRISE_ME_LABEL,
} from '@/lib/types';
import {
  Check,
  FileUp,
  Heart,
  Loader2,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface FavoritesSheetProps {
  favorites: HouseholdFavorite[];
  location?: GeoLocationData | null;
  onClose: () => void;
  onAddFavorites: (
    entries: Array<{
      placeId?: string;
      name: string;
      cuisine: string;
      priceTier?: PriceTier;
      mealTypes?: MealType[];
      shortAddress?: string;
      notes?: string;
    }>
  ) => Promise<void>;
  onRemoveFavorite: (placeId: string) => Promise<void>;
}

const CUISINE_OPTIONS = PRESET_CUISINES.filter((c) => c !== SURPRISE_ME_LABEL);

function inferCuisineFromText(text: string, fallback = 'Local Favorite'): string {
  const lower = text.toLowerCase();
  if (lower.includes('pizza') || lower.includes('pizzeria') || lower.includes('pie'))
    return 'Pizza';
  if (
    lower.includes('sushi') ||
    lower.includes('ramen') ||
    lower.includes('izakaya') ||
    lower.includes('japanese') ||
    lower.includes('omakase')
  )
    return 'Japanese / Sushi';
  if (
    lower.includes('taco') ||
    lower.includes('taqueria') ||
    lower.includes('mexican') ||
    lower.includes('cantina') ||
    lower.includes('burrito')
  )
    return 'Mexican';
  if (
    lower.includes('thai') ||
    lower.includes('siam') ||
    lower.includes('khao') ||
    lower.includes('pad')
  )
    return 'Thai';
  if (
    lower.includes('osteria') ||
    lower.includes('trattoria') ||
    lower.includes('pasta') ||
    lower.includes('italian') ||
    lower.includes('cucina')
  )
    return 'Italian';
  if (
    lower.includes('indian') ||
    lower.includes('tandoor') ||
    lower.includes('curry') ||
    lower.includes('masala') ||
    lower.includes('bombay')
  )
    return 'Indian';
  if (
    lower.includes('chinese') ||
    lower.includes('dumpling') ||
    lower.includes('szechuan') ||
    lower.includes('sichuan') ||
    lower.includes('dim sum') ||
    lower.includes('wok')
  )
    return 'Chinese';
  if (
    lower.includes('korean') ||
    lower.includes('seoul') ||
    lower.includes('bbq') ||
    lower.includes('bibimbap')
  )
    return 'Korean';
  if (
    lower.includes('pho') ||
    lower.includes('saigon') ||
    lower.includes('viet') ||
    lower.includes('banh mi')
  )
    return 'Vietnamese';
  if (
    lower.includes('turkish') ||
    lower.includes('istanbul') ||
    lower.includes('anatolia') ||
    lower.includes('pide') ||
    lower.includes('doner') ||
    lower.includes('döner') ||
    lower.includes('adana') ||
    lower.includes('lahmacun')
  )
    return 'Turkish';
  if (
    lower.includes('mediterranean') ||
    lower.includes('falafel') ||
    lower.includes('greek') ||
    lower.includes('mezze') ||
    lower.includes('kebab')
  )
    return 'Mediterranean';
  if (
    lower.includes('burger') ||
    lower.includes('tavern') ||
    lower.includes('diner') ||
    lower.includes('grill') ||
    lower.includes('american')
  )
    return 'Burgers / American';
  if (
    lower.includes('seafood') ||
    lower.includes('oyster') ||
    lower.includes('fish') ||
    lower.includes('lobster') ||
    lower.includes('crab')
  )
    return 'Seafood';
  if (
    lower.includes('salad') ||
    lower.includes('bowl') ||
    lower.includes('green') ||
    lower.includes('healthy') ||
    lower.includes('vegan')
  )
    return 'Healthy / Bowls';
  return fallback;
}

/**
 * Parses lines or comma-separated bulk input like:
 * "Osteria Mozza - Italian"
 * "Roberta's Pizza, Thai Villa, Sugarfish"
 */
function parseBulkFavoritesText(rawText: string): Array<{
  name: string;
  cuisine: string;
  notes?: string;
}> {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results: Array<{ name: string; cuisine: string; notes?: string }> = [];

  for (const line of lines) {
    // Check if the line has " - " or " | " separating Name and Cuisine/Notes
    if (line.includes(' - ') || line.includes(' | ')) {
      const parts = line.split(/\s+[-|]\s+/);
      const name = parts[0]?.trim();
      const second = parts[1]?.trim() || '';
      const notes = parts[2]?.trim() || '';
      if (name) {
        const cuisine = inferCuisineFromText(`${name} ${second}`, second || 'Local Favorite');
        results.push({ name, cuisine, notes });
      }
      continue;
    }

    // Otherwise split by comma if multiple names on one line
    const commaParts = line
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of commaParts) {
      results.push({
        name: part,
        cuisine: inferCuisineFromText(part),
      });
    }
  }

  return results;
}

export function FavoritesSheet({
  favorites,
  location,
  onClose,
  onAddFavorites,
  onRemoveFavorite,
}: FavoritesSheetProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'upload' | 'single'>(
    favorites.length === 0 ? 'single' : 'list'
  );

  // Bulk upload state
  const [bulkText, setBulkText] = useState('');
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Single add + Google Places live lookup state
  const [singleName, setSingleName] = useState('');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [singleCuisine, setSingleCuisine] = useState<string>('Italian');
  const [singlePrice, setSinglePrice] = useState<PriceTier>('$$');
  const [singleNotes, setSingleNotes] = useState('');
  const [isSavingSingle, setIsSavingSingle] = useState(false);

  const [placeResults, setPlaceResults] = useState<ManualIncludedPlace[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

  // Debounced live Google Places lookup as user types in "+ Add One"
  useEffect(() => {
    const trimmed = singleName.trim();
    if (trimmed.length < 2 || selectedPlaceId) {
      if (trimmed.length < 2) setPlaceResults([]);
      setIsSearchingPlaces(false);
      return;
    }

    let cancelled = false;
    setIsSearchingPlaces(true);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: trimmed,
          lat: String(location?.lat ?? 40.7336),
          lng: String(location?.lng ?? -74.0027),
          label: location?.label ?? 'Current Area',
        });
        const res = await fetch(`/api/options?${params.toString()}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data.results)) {
          setPlaceResults(data.results);
        }
      } catch {
        if (!cancelled) setPlaceResults([]);
      } finally {
        if (!cancelled) setIsSearchingPlaces(false);
      }
    }, 240);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [singleName, selectedPlaceId, location?.lat, location?.lng, location?.label]);

  const handleSelectPlaceSuggestion = (place: ManualIncludedPlace) => {
    setSingleName(place.name);
    setSelectedPlaceId(place.placeId);
    setSelectedAddress(place.shortAddress || '');
    const matchedCuisine = CUISINE_OPTIONS.find(
      (c) =>
        c.toLowerCase() === place.cuisine.toLowerCase() ||
        place.cuisine.toLowerCase().includes(c.toLowerCase()) ||
        c.toLowerCase().includes(place.cuisine.toLowerCase())
    );
    if (matchedCuisine) {
      setSingleCuisine(matchedCuisine);
    } else {
      const inferred = inferCuisineFromText(`${place.name} ${place.cuisine}`, '');
      if (inferred) setSingleCuisine(inferred);
    }
    if (place.priceTier) {
      setSinglePrice(place.priceTier);
    }
    setPlaceResults([]);
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseBulkFavoritesText(bulkText);
    if (parsed.length === 0) return;

    setIsSavingBulk(true);
    try {
      await onAddFavorites(parsed);
      setBulkText('');
      setActiveTab('list');
    } finally {
      setIsSavingBulk(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setBulkText((prev) => (prev ? `${prev}\n${text}` : text));
    } catch {
      // ignore
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleName.trim()) return;
    setIsSavingSingle(true);
    try {
      await onAddFavorites([
        {
          placeId: selectedPlaceId || undefined,
          name: singleName.trim(),
          cuisine: singleCuisine,
          priceTier: singlePrice,
          shortAddress: selectedAddress || undefined,
          notes: singleNotes.trim(),
        },
      ]);
      setSingleName('');
      setSelectedPlaceId(null);
      setSelectedAddress('');
      setSingleNotes('');
      setPlaceResults([]);
      setActiveTab('list');
    } finally {
      setIsSavingSingle(false);
    }
  };

  const uploadedCount = favorites.filter((f) => f.source === 'uploaded').length;
  const learnedCount = favorites.filter((f) => f.source === 'learned').length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl border border-ios-border bg-ios-card shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ios-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ios-accent/15 text-ios-accent">
              <Heart className="h-5 w-5 fill-ios-accent" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ios-label">
                Favorites & Taste Memory
              </h2>
              <p className="text-[11px] text-ios-secondary">
                {uploadedCount} uploaded • {learnedCount} learned over time
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ios-secondary active:bg-ios-elevated"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Segmented Mode Switcher */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-ios-elevated p-1">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'list'
                  ? 'bg-ios-card text-ios-label shadow-sm'
                  : 'text-ios-secondary'
              }`}
            >
              Saved ({favorites.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'upload'
                  ? 'bg-ios-card text-ios-label shadow-sm'
                  : 'text-ios-secondary'
              }`}
            >
              Bulk Upload
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('single')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'single'
                  ? 'bg-ios-card text-ios-label shadow-sm'
                  : 'text-ios-secondary'
              }`}
            >
              + Add One
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
          {activeTab === 'upload' && (
            <form onSubmit={handleBulkSubmit} className="space-y-3.5">
              <div className="rounded-2xl bg-ios-bg p-3.5 text-xs leading-relaxed text-ios-secondary">
                <p className="font-semibold text-ios-label">
                  Upload your go-to spots up front
                </p>
                <p className="mt-0.5">
                  Paste restaurant names below (one per line or comma-separated)
                  or upload a <code>.txt</code> / <code>.csv</code> file. We’ll
                  bias Stage 4 toward your matching favorites first, and
                  automatically switch to fresh recommendations whenever you
                  reroll them!
                </p>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                    Paste Favorite Spots
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ios-accent"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    Import .txt / .csv
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.csv,text/plain,text/csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                <textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`Examples:\nL'Artusi - Italian - Best olive oil cake\nRoberta's Pizza\nThai Villa, Sugarfish, Tacos No. 1`}
                  className="w-full rounded-2xl border border-ios-border bg-ios-bg p-3.5 text-base text-ios-label placeholder:text-ios-tertiary focus:border-ios-accent focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!bulkText.trim() || isSavingBulk}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-ios-accent px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                <span>
                  {isSavingBulk
                    ? 'Saving Favorites…'
                    : `Save ${
                        parseBulkFavoritesText(bulkText).length || ''
                      } Spots to Favorites`}
                </span>
              </button>
            </form>
          )}

          {activeTab === 'single' && (
            <form onSubmit={handleSingleSubmit} className="space-y-3.5">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                    Search Restaurant (Google Places)
                  </label>
                  {location?.label && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-ios-tertiary">
                      <MapPin className="h-3 w-3 text-ios-accent" />
                      {location.label}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ios-tertiary" />
                  <input
                    type="text"
                    value={singleName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSingleName(val);
                      setSelectedPlaceId(null);
                      setSelectedAddress('');
                      const inferred = inferCuisineFromText(val, '');
                      if (inferred) setSingleCuisine(inferred);
                    }}
                    placeholder="Search exact restaurant name…"
                    className="min-h-[44px] w-full rounded-xl border border-ios-border bg-ios-bg pl-9 pr-9 text-base text-ios-label focus:border-ios-accent focus:outline-none"
                  />
                  {singleName && (
                    <button
                      type="button"
                      aria-label="Clear restaurant search"
                      onClick={() => {
                        setSingleName('');
                        setSelectedPlaceId(null);
                        setSelectedAddress('');
                        setPlaceResults([]);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ios-tertiary hover:text-ios-label"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Selected Google Place badge */}
                {selectedPlaceId && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate font-semibold">
                        Matched: {singleName}
                      </span>
                      {selectedAddress && (
                        <span className="truncate opacity-80">
                          • {selectedAddress}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPlaceId(null);
                      }}
                      className="shrink-0 text-[11px] font-semibold underline"
                    >
                      Change
                    </button>
                  </div>
                )}

                {/* Live Google Places results dropdown */}
                {!selectedPlaceId && singleName.trim().length >= 2 && (
                  <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-xl border border-ios-border bg-ios-bg p-1.5 shadow-sm">
                    {isSearchingPlaces && (
                      <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-ios-secondary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-ios-accent" />
                        <span>Searching Google Places…</span>
                      </div>
                    )}

                    {!isSearchingPlaces && placeResults.length === 0 && (
                      <p className="px-2.5 py-2 text-xs text-ios-tertiary">
                        No exact Places match — you can still add “{singleName.trim()}” below.
                      </p>
                    )}

                    {!isSearchingPlaces &&
                      placeResults.map((place) => (
                        <button
                          key={place.placeId}
                          type="button"
                          onClick={() => handleSelectPlaceSuggestion(place)}
                          className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-ios-elevated/70 active:bg-ios-elevated"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-ios-label">
                              {place.name}
                            </p>
                            <p className="truncate text-[11px] text-ios-secondary">
                              {place.cuisine}
                              {place.priceTier ? ` • ${place.priceTier}` : ''}
                              {place.shortAddress ? ` • ${place.shortAddress}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-ios-accent/15 px-2.5 py-1 text-[11px] font-semibold text-ios-accent">
                            Select
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                    Cuisine
                  </label>
                  <select
                    value={singleCuisine}
                    onChange={(e) => setSingleCuisine(e.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-ios-border bg-ios-bg px-3 text-base text-ios-label focus:border-ios-accent focus:outline-none"
                  >
                    {CUISINE_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="Local Favorite">Other / General</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                    Price Tier
                  </label>
                  <div className="grid grid-cols-4 gap-1 rounded-xl bg-ios-bg p-1">
                    {(['$', '$$', '$$$', '$$$$'] as PriceTier[]).map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setSinglePrice(tier)}
                        className={`min-h-[36px] rounded-lg text-xs font-bold ${
                          singlePrice === tier
                            ? 'bg-ios-accent text-white'
                            : 'text-ios-secondary'
                        }`}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ios-secondary">
                  Go-To Dish or Note (Optional)
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={singleNotes}
                  onChange={(e) => setSingleNotes(e.target.value)}
                  placeholder="e.g. Spicy rigatoni & Caesar salad"
                  className="min-h-[44px] w-full rounded-xl border border-ios-border bg-ios-bg px-3.5 text-base text-ios-label focus:border-ios-accent focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!singleName.trim() || isSavingSingle}
                className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-2xl bg-ios-accent px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                <span>Add to Favorites</span>
              </button>
            </form>
          )}

          {activeTab === 'list' && (
            <div className="space-y-2.5">
              {favorites.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-ios-border bg-ios-bg p-6 text-center">
                  <p className="text-sm font-semibold text-ios-label">
                    No favorites saved yet
                  </p>
                  <p className="mt-1 text-xs text-ios-secondary">
                    Upload your favorite spots up front, or just start playing
                    and the app will automatically learn what you keep & pick!
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('upload')}
                    className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-ios-accent px-4 text-xs font-semibold text-white"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Bulk Upload Favorites
                  </button>
                </div>
              ) : (
                favorites.map((fav) => (
                  <div
                    key={fav.placeId}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-ios-border bg-ios-bg p-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-ios-label">
                          {fav.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            fav.source === 'uploaded'
                              ? 'bg-ios-accent/15 text-ios-accent'
                              : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                          }`}
                        >
                          {fav.source === 'uploaded' ? (
                            <>
                              <Star className="h-2.5 w-2.5 fill-current" />
                              Favorite
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-2.5 w-2.5" />
                              Learned
                            </>
                          )}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ios-secondary">
                        <span className="font-medium text-ios-label/80">
                          {fav.cuisine}
                        </span>
                        <span>•</span>
                        <span>{fav.priceTier}</span>
                        {fav.shortAddress &&
                          fav.shortAddress !== 'Household Favorite' &&
                          fav.shortAddress !== 'Favorite Spot' && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[160px]">
                                {fav.shortAddress}
                              </span>
                            </>
                          )}
                        <span>•</span>
                        <span>Affinity {fav.affinityScore.toFixed(1)}</span>
                        {(fav.winsCount > 0 || fav.keptCount > 0) && (
                          <>
                            <span>•</span>
                            <span>
                              {fav.winsCount > 0 ? `Won ${fav.winsCount}x ` : ''}
                              {fav.keptCount > 0 ? `Kept ${fav.keptCount}x` : ''}
                            </span>
                          </>
                        )}
                      </div>

                      {fav.notes && (
                        <p className="mt-1 truncate text-xs text-ios-secondary">
                          “{fav.notes}”
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveFavorite(fav.placeId)}
                      aria-label={`Remove ${fav.name}`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ios-secondary hover:text-red-500 active:bg-ios-elevated"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
