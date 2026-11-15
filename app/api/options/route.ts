import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import {
  DEFAULT_DELIVERY_PLATFORMS,
  DELIVERY_PLATFORMS,
  DeliveryPlatformId,
  DeliveryPlatformQuote,
  DinnerOption,
  GeoLocationData,
  HouseholdFavorite,
  LearnedRestaurantDeliveryInfo,
  ManualIncludedPlace,
  MealType,
  PriceTier,
  QuestionnaireAnswers,
  SURPRISE_ME_LABEL,
  VerifiedPlaceCandidate,
} from '@/lib/types';
import {
  boundingBoxFromCenter,
  computeEatOutRadiusMeters,
  computeOrderInRadiusMeters,
  computeSmartDeliveryEtaRange,
  formatEstimatedTimeLabel,
  haversineDistanceMeters,
} from '@/lib/geo';
import {
  buildFallbackDeliveryRedirectUrl,
  isDirectStorefrontUrl,
  resolveDirectStorefrontUrl,
} from '@/lib/delivery-lookup';
import { checkAndIncrementPlacesQuota } from '@/lib/quota';

const PLACES_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.primaryTypeDisplayName,places.delivery,places.dineIn,places.takeout,places.editorialSummary,places.googleMapsUri';

const GOOGLE_TO_PRICE_TIER: Record<string, PriceTier> = {
  PRICE_LEVEL_FREE: '$',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

const PRICE_TIER_RANK: Record<PriceTier, number> = {
  $: 1,
  $$: 2,
  $$$: 3,
  $$$$: 4,
};

const CANONICAL_CUISINE_KEYWORDS: Array<{
  canonical: string;
  keywords: string[];
}> = [
  {
    canonical: 'Pizza',
    keywords: ['pizza', 'pizzeria', 'neapolitan'],
  },
  {
    canonical: 'Italian',
    keywords: ['italian', 'pasta', 'trattoria', 'osteria', 'roman', 'sicilian'],
  },
  {
    canonical: 'Japanese / Sushi',
    keywords: [
      'japanese',
      'sushi',
      'ramen',
      'izakaya',
      'udon',
      'yakitori',
      'omakase',
      'poke',
    ],
  },
  {
    canonical: 'Thai',
    keywords: ['thai', 'pad thai', 'khao soi'],
  },
  {
    canonical: 'Mexican',
    keywords: ['mexican', 'taco', 'taqueria', 'burrito', 'cantina', 'tex-mex'],
  },
  {
    canonical: 'Chinese',
    keywords: [
      'chinese',
      'dim sum',
      'szechuan',
      'sichuan',
      'cantonese',
      'dumpling',
      'noodle house',
      'taiwanese',
    ],
  },
  {
    canonical: 'Indian',
    keywords: ['indian', 'curry', 'tandoori', 'biryani', 'south indian', 'desi'],
  },
  {
    canonical: 'Turkish',
    keywords: ['turkish', 'ocakbasi', 'pide', 'doner', 'anatolian'],
  },
  {
    canonical: 'Mediterranean',
    keywords: [
      'mediterranean',
      'greek',
      'lebanese',
      'middle eastern',
      'mezze',
      'falafel',
      'shawarma',
      'levant',
      'persian',
      'israeli',
    ],
  },
  {
    canonical: 'Burgers / American',
    keywords: [
      'burger',
      'hamburger',
      'american',
      'smashburger',
      'diner',
      'bbq',
      'barbecue',
      'fried chicken',
      'steak',
      'gastropub',
      'pub',
    ],
  },
  {
    canonical: 'Sandwiches',
    keywords: ['sandwich', 'deli', 'sub ', 'subs', 'bagel', 'panini', 'hoagie'],
  },
  {
    canonical: 'Korean',
    keywords: ['korean', 'bibimbap', 'kbbq', 'kimchi'],
  },
  {
    canonical: 'Vietnamese',
    keywords: ['vietnamese', 'pho', 'banh mi', 'saigon'],
  },
  {
    canonical: 'Healthy / Bowls',
    keywords: [
      'salad',
      'healthy',
      'grain bowl',
      'vegan',
      'vegetarian',
      'plant-based',
      'acai',
      'bowls',
    ],
  },
  {
    canonical: 'Seafood',
    keywords: ['seafood', 'oyster', 'fish', 'lobster', 'crab'],
  },
];

interface GooglePlaceRaw {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  primaryTypeDisplayName?: { text?: string };
  delivery?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  editorialSummary?: { text?: string };
  googleMapsUri?: string;
}

interface OptionsRequestBody {
  mode:
    | 'initial'
    | 'reroll_all'
    | 'reroll_one'
    | 'reroll_unkept'
    | 'hydrate_manual';
  location: GeoLocationData;
  questionnaire: QuestionnaireAnswers;
  excludedPlaceIds?: string[];
  excludedNames?: string[];
  candidatePool?: VerifiedPlaceCandidate[];
  favorites?: HouseholdFavorite[];
  preferredDeliveryApps?: DeliveryPlatformId[];
  learnedDeliveryCache?: Record<string, LearnedRestaurantDeliveryInfo>;
  targetMealType?: MealType; // For single-card reroll (`reroll_one`)
  targetMealTypes?: MealType[]; // For multi-card unkept reroll (`reroll_unkept`)
  currentVisibleIds?: string[]; // Currently displayed on screen so rerolls never duplicate kept cards
  keptCuisines?: string[]; // Cuisines of options User 1 has locked in so rerolls diversify away from them
  rerollCount?: number; // Escalates gravity toward Favorites as User 1 rerolls repeatedly
  forceRefreshPool?: boolean; // Set when price/distance/mealType filters changed mid-game
  manualPlace?: ManualIncludedPlace; // Used when mode === 'hydrate_manual'
}

/**
 * Maps any free-form cuisine label (e.g. "Neapolitan Pizza", "Thai Street Food", "Italian Restaurant")
 * or candidate metadata to either one of the user's selected `specificCuisines` or a canonical family.
 */
function normalizeToCuisineFamily(
  rawText: string,
  specificCuisines: string[] = []
): string {
  const lower = (rawText || '').toLowerCase().trim();
  if (!lower) return 'Local Favorite';

  // 1. Direct or keyword match against user's chosen cuisines
  for (const sc of specificCuisines) {
    const scLower = sc.toLowerCase().trim();
    if (!scLower) continue;
    if (lower === scLower || lower.includes(scLower) || scLower.includes(lower)) {
      return sc;
    }
    const entry = CANONICAL_CUISINE_KEYWORDS.find(
      (k) => k.canonical.toLowerCase() === scLower
    );
    if (entry && entry.keywords.some((kw) => lower.includes(kw))) {
      return sc;
    }
  }

  // 2. Match against canonical families (note: if Italian is selected & Pizza isn't, Italian can match pizza if needed,
  // otherwise keep Pizza and Italian distinct when both or neither are selected)
  for (const entry of CANONICAL_CUISINE_KEYWORDS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      // If user selected 'Italian' and NOT 'Pizza', treat pizzerias under 'Italian'
      if (
        entry.canonical === 'Pizza' &&
        specificCuisines.includes('Italian') &&
        !specificCuisines.includes('Pizza')
      ) {
        return 'Italian';
      }
      return entry.canonical;
    }
  }

  const cleaned = rawText.replace(/\s*Restaurant$/i, '').trim();
  return cleaned || 'Local Favorite';
}

function classifyCandidateCuisine(
  cand: Pick<
    VerifiedPlaceCandidate,
    'name' | 'primaryType' | 'editorialSummary' | 'matchedCuisine'
  >,
  specificCuisines: string[],
  sourceCuisineHint?: string
): { matchedCuisine: string; matchesSelectedCuisine: boolean } {
  const combinedText = [
    cand.primaryType || '',
    cand.name || '',
    cand.editorialSummary || '',
  ]
    .join(' ')
    .toLowerCase();

  // Check if metadata explicitly matches any selected cuisine
  for (const sc of specificCuisines) {
    const scLower = sc.toLowerCase().trim();
    const parts = scLower.split(/[\/,&]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.some((p) => p.length >= 3 && combinedText.includes(p))) {
      return { matchedCuisine: sc, matchesSelectedCuisine: true };
    }
    const syn = CANONICAL_CUISINE_KEYWORDS.find(
      (k) => k.canonical.toLowerCase() === scLower
    );
    if (syn && syn.keywords.some((kw) => combinedText.includes(kw))) {
      return { matchedCuisine: sc, matchesSelectedCuisine: true };
    }
  }

  // If Google returned this place specifically for `sourceCuisineHint` and its primaryType is generic ("Restaurant")
  const genericTypes = new Set([
    '',
    'restaurant',
    'meal takeaway',
    'meal delivery',
    'food',
    'bar',
    'cafe',
    'bistro',
  ]);
  const cleanPrimary = (cand.primaryType || '')
    .replace(/\s*restaurant$/i, '')
    .trim()
    .toLowerCase();

  if (
    sourceCuisineHint &&
    specificCuisines.includes(sourceCuisineHint) &&
    genericTypes.has(cleanPrimary)
  ) {
    return { matchedCuisine: sourceCuisineHint, matchesSelectedCuisine: true };
  }

  if (
    cand.matchedCuisine &&
    specificCuisines.includes(cand.matchedCuisine)
  ) {
    return {
      matchedCuisine: cand.matchedCuisine,
      matchesSelectedCuisine: true,
    };
  }

  const family = normalizeToCuisineFamily(
    `${cand.primaryType || ''} ${cand.name || ''}`,
    specificCuisines
  );
  const isSelected =
    specificCuisines.length === 0 || specificCuisines.includes(family);

  // If Google returned this specifically for `sourceCuisineHint` and it didn't conflict with another specific cuisine, credit it
  if (!isSelected && sourceCuisineHint && specificCuisines.includes(sourceCuisineHint)) {
    return { matchedCuisine: sourceCuisineHint, matchesSelectedCuisine: true };
  }

  return { matchedCuisine: family, matchesSelectedCuisine: isSelected };
}

function buildCuisineSearchSpecs(
  questionnaire: QuestionnaireAnswers,
  onlyCuisines?: string[]
): Array<{ query: string; cuisineHint?: string }> {
  const specificCuisines = (
    onlyCuisines && onlyCuisines.length > 0
      ? onlyCuisines
      : questionnaire.cuisines
  ).filter((c) => c !== SURPRISE_ME_LABEL);

  const noteTrimmed = questionnaire.cravingsNote.trim();
  const cravingKeyword =
    noteTrimmed.length > 0 &&
    noteTrimmed.length <= 45 &&
    !/\bno\b|\bwithout\b|\ballerg/i.test(noteTrimmed)
      ? noteTrimmed.replace(/[^\w\s-]/g, '').trim()
      : '';

  if (specificCuisines.length === 0) {
    if (cravingKeyword) {
      return [
        { query: `${cravingKeyword} restaurants` },
        { query: 'best local dinner restaurants' },
      ];
    }
    return [
      { query: 'best dinner restaurants' },
      { query: 'popular local takeout and dining restaurants' },
    ];
  }

  // Up to 4 dedicated parallel per-cuisine queries so each selected cuisine gets its own full 20-place bucket!
  if (specificCuisines.length <= 4) {
    return specificCuisines.map((c) => {
      const cleanTerm = c.includes('/') ? c.split('/')[0].trim() : c;
      return {
        query: `${cleanTerm} restaurants`,
        cuisineHint: c,
      };
    });
  }

  // If >4 cuisines selected, group into 4 balanced parallel queries
  const specs: Array<{ query: string; cuisineHint?: string }> = [];
  const bucketCount = 4;
  for (let i = 0; i < bucketCount; i++) {
    const slice = specificCuisines.filter((_, idx) => idx % bucketCount === i);
    if (slice.length > 0) {
      const q = slice
        .map((c) => (c.includes('/') ? c.split('/')[0].trim() : c))
        .join(' or ');
      specs.push({ query: `${q} restaurants`, cuisineHint: slice[0] });
    }
  }
  return specs;
}

function buildDemoCandidatePool(
  location: GeoLocationData,
  questionnaire: QuestionnaireAnswers,
  orderInRadius: number,
  eatOutRadius: number
): VerifiedPlaceCandidate[] {
  const areaLabel = location.label.split(',')[0]?.trim() || 'Downtown';
  const defaultPrice: PriceTier = questionnaire.priceTiers[0] || '$$';
  const specificCuisines = questionnaire.cuisines.filter(
    (c) => c !== SURPRISE_ME_LABEL
  );

  const catalog: Array<{
    id: string;
    name: string;
    cuisine: string;
    price: PriceTier;
    rating: number;
    reviews: number;
    dist: number;
    street: string;
    pitch: string;
    delivery: boolean;
    dineIn: boolean;
  }> = [
    {
      id: 'demo_osteria_luna',
      name: 'Osteria Luna',
      cuisine: 'Italian',
      price: '$$',
      rating: 4.8,
      reviews: 842,
      dist: 650,
      street: `142 Mercer St, ${areaLabel}`,
      pitch: 'Handmade tagliatelle with slow-braised short rib ragu and warm rosemary focaccia in a candlelit dining room.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_trattoria_trevi',
      name: 'Trattoria Trevi',
      cuisine: 'Italian',
      price: '$$',
      rating: 4.6,
      reviews: 510,
      dist: 980,
      street: `64 Mulberry St, ${areaLabel}`,
      pitch: 'Silky cacio e pepe tossed to order, crispy prosciutto arancini, and house-pulled burrata.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_khao_soi_house',
      name: 'Siam Night Market',
      cuisine: 'Thai',
      price: '$$',
      rating: 4.7,
      reviews: 615,
      dist: 920,
      pitch: 'Rich Northern-style Khao Soi curry noodles, crispy drunken flat noodles, and charred wok-tossed basil dishes.',
      street: `88 Grove St, ${areaLabel}`,
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_bangkok_soi',
      name: 'Soi 11 Thai Kitchen',
      cuisine: 'Thai',
      price: '$$',
      rating: 4.6,
      reviews: 430,
      dist: 1120,
      pitch: 'Smoky wok-charred pad see ew, green papaya salad, and fragrant massaman short rib curry.',
      street: `203 Bleecker St, ${areaLabel}`,
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_taqueria_sol',
      name: 'Alma Cantina & Tacos',
      cuisine: 'Mexican',
      price: '$',
      rating: 4.6,
      reviews: 1120,
      dist: 480,
      street: `215 Bleecker St, ${areaLabel}`,
      pitch: 'Heirloom blue-corn tortillas piled with wood-grilled al pastor, crispy baja fish, and smoky house salsa macha.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_casa_oaxaca',
      name: 'Casa Oaxaca Mezcaleria',
      cuisine: 'Mexican',
      price: '$$',
      rating: 4.8,
      reviews: 675,
      dist: 870,
      street: `91 W Houston St, ${areaLabel}`,
      pitch: 'Slow-braised birria quesatacos with rich consomé, charred street corn, and house-made guacamole.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_izakaya_sora',
      name: 'Izakaya Sora & Sushi',
      cuisine: 'Japanese / Sushi',
      price: '$$$',
      rating: 4.8,
      reviews: 530,
      dist: 1150,
      street: `44 W 8th St, ${areaLabel}`,
      pitch: 'Melt-in-your-mouth toro nigiri, spicy tuna crispy rice, and rich 18-hour tonkotsu black garlic ramen.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_forno_napoli',
      name: 'Forno Di Napoli',
      cuisine: 'Pizza',
      price: '$$',
      rating: 4.7,
      reviews: 980,
      dist: 780,
      street: `310 Hudson St, ${areaLabel}`,
      pitch: 'Blistered 72-hour sourdough Neapolitan pies topped with San Marzano tomatoes, burrata, and Calabrian chili honey.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_levant_mezze',
      name: 'Zait & Za’atar Bistro',
      cuisine: 'Mediterranean',
      price: '$$',
      rating: 4.8,
      reviews: 490,
      dist: 1340,
      street: `76 Bedford St, ${areaLabel}`,
      pitch: 'Wood-fired pita puffed to order with whipped feta, pomegranate-glazed lamb skewers, and crispy herb falafel.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_seoul_ember',
      name: 'Seoul Ember Kitchen',
      cuisine: 'Korean',
      price: '$$',
      rating: 4.7,
      reviews: 710,
      dist: 1420,
      street: `19 Carmine St, ${areaLabel}`,
      pitch: 'Sizzling stone-pot bibimbap, double-fried soy-garlic wings, and tender prime galbi short ribs.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_bombay_social',
      name: 'Verandah Spice Club',
      cuisine: 'Indian',
      price: '$$',
      rating: 4.6,
      reviews: 445,
      dist: 1650,
      street: `128 MacDougal St, ${areaLabel}`,
      pitch: 'Velvety old-Delhi butter chicken, blistered garlic naan, and smoky tandoori lamb chops with mint chutney.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_smash_standard',
      name: 'The Gold Standard Tavern',
      cuisine: 'Burgers / American',
      price: '$$',
      rating: 4.6,
      reviews: 890,
      dist: 590,
      street: `52 Christopher St, ${areaLabel}`,
      pitch: 'Lacy-edged dry-aged double smashburgers on toasted brioche with tallow shoestring fries and house pickles.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_saigon_lantern',
      name: 'Little Saigon Kitchen',
      cuisine: 'Vietnamese',
      price: '$',
      rating: 4.7,
      reviews: 620,
      dist: 1050,
      street: `104 Sullivan St, ${areaLabel}`,
      pitch: 'Aromatic 12-hour beef marrow pho, lemongrass grilled pork vermicelli bowls, and flaky crispy imperial rolls.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_szechuan_pavilion',
      name: 'Red Lantern Dumpling & Wok',
      cuisine: 'Chinese',
      price: '$$',
      rating: 4.6,
      reviews: 760,
      dist: 1210,
      street: `63 Mott St, ${areaLabel}`,
      pitch: 'Hand-pleated pork soup dumplings, crispy chili-oil wontons, and wok-seared string beans with minced garlic.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_harbor_oyster',
      name: 'Salt & Anchor Raw Bar',
      cuisine: 'Seafood',
      price: '$$$',
      rating: 4.8,
      reviews: 410,
      dist: 1500,
      street: `290 West St, ${areaLabel}`,
      pitch: 'Warm brown-butter Maine lobster rolls, pan-seared diver scallops, and crisp coastal whites.',
      delivery: false,
      dineIn: true,
    },
    {
      id: 'demo_verde_harvest',
      name: 'Verde Market & Bowls',
      cuisine: 'Healthy / Bowls',
      price: '$$',
      rating: 4.5,
      reviews: 540,
      dist: 700,
      street: `185 Prince St, ${areaLabel}`,
      pitch: 'Charred harissa salmon grain bowls with roasted sweet potato, avocado, pickled shallots, and tahini drizzle.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_bosphorus_table',
      name: 'Bosphorus Ocakbaşı & Grill',
      cuisine: 'Turkish',
      price: '$$',
      rating: 4.8,
      reviews: 670,
      dist: 890,
      street: `118 Thompson St, ${areaLabel}`,
      pitch: 'Charcoal-grilled Adana lamb kebabs, wood-fired cheese pide, smoky babaganoush, and warm pistachio baklava.',
      delivery: true,
      dineIn: true,
    },
    {
      id: 'demo_crosby_deli',
      name: 'Crosby Street Deli & Provisions',
      cuisine: 'Sandwiches',
      price: '$',
      rating: 4.7,
      reviews: 820,
      dist: 540,
      street: `74 Crosby St, ${areaLabel}`,
      pitch: 'Crisp sesame hero rolls stacked with prosciutto di Parma, fresh mozzarella, roasted peppers, and house calabrian aioli.',
      delivery: true,
      dineIn: true,
    },
  ];

  return catalog.map((item, idx) => {
    const clampedDist = Math.min(
      item.dist,
      Math.max(orderInRadius, eatOutRadius) - 100
    );
    const latOffset = ((idx % 5) - 2) * 0.003;
    const lngOffset = ((idx % 4) - 1.5) * 0.003;
    const classification = classifyCandidateCuisine(
      {
        name: item.name,
        primaryType: `${item.cuisine} Restaurant`,
        editorialSummary: item.pitch,
      },
      specificCuisines,
      item.cuisine
    );
    return {
      placeId: item.id,
      name: item.name,
      shortAddress: item.street,
      fullAddress: `${item.street}, ${location.label}`,
      lat: location.lat + latOffset,
      lng: location.lng + lngOffset,
      distanceMeters: Math.max(250, clampedDist),
      rating: item.rating,
      userRatingCount: item.reviews,
      priceTier: questionnaire.priceTiers.includes(item.price)
        ? item.price
        : defaultPrice,
      primaryType: `${item.cuisine} Restaurant`,
      editorialSummary: item.pitch,
      googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${item.name} ${location.label}`
      )}`,
      canOrderIn: item.delivery,
      canEatOut: item.dineIn,
      deliverySupported: item.delivery,
      dineInSupported: item.dineIn,
      takeoutSupported: true,
      matchedCuisine: classification.matchedCuisine,
      matchesSelectedCuisine: classification.matchesSelectedCuisine,
    };
  });
}

function computeQualityScore(c: VerifiedPlaceCandidate): number {
  const ratingTerm = (c.rating || 4.3) * 2.1;
  // Cap review-count bonus at log10(1500) so mega-chains/tourist traps don't drown out 4.8★ indie gems with 180 reviews!
  const cappedReviews = Math.min(1500, Math.max(15, c.userRatingCount || 45));
  const reviewTerm = Math.log10(cappedReviews) * 0.65;
  const distPenalty = c.distanceMeters / 12000;
  return ratingTerm + reviewTerm - distPenalty;
}

async function fetchPlacesFromGoogle(
  location: GeoLocationData,
  questionnaire: QuestionnaireAnswers,
  orderInRadius: number,
  eatOutRadius: number,
  onlyCuisines?: string[]
): Promise<VerifiedPlaceCandidate[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey || apiKey.includes('your_google_places_api_key')) {
    return buildDemoCandidatePool(
      location,
      questionnaire,
      orderInRadius,
      eatOutRadius
    );
  }

  const wantsOrderIn = questionnaire.mealTypes.includes('order_in');
  const wantsEatOut = questionnaire.mealTypes.includes('eat_out');
  const maxSearchRadius = Math.max(
    wantsOrderIn ? orderInRadius : 0,
    wantsEatOut ? eatOutRadius : 0,
    2500
  );

  const bbox = boundingBoxFromCenter(
    location.lat,
    location.lng,
    maxSearchRadius
  );
  const specs = buildCuisineSearchSpecs(questionnaire, onlyCuisines);
  const specificCuisines = questionnaire.cuisines.filter(
    (c) => c !== SURPRISE_ME_LABEL
  );

  const quotaCheck = await checkAndIncrementPlacesQuota(specs.length);
  if (!quotaCheck.allowed) {
    throw new Error(
      `Daily Places API soft limit reached (${quotaCheck.limit} searches/day).`
    );
  }

  // Do NOT pass `priceLevels` to Google Places! Google omits `priceLevel` on ~40-50% of independent
  // neighborhood restaurants and silently drops all of them when `priceLevels` is set in the request.
  const rawById = new Map<
    string,
    { raw: GooglePlaceRaw; cuisineHint?: string }
  >();

  await Promise.all(
    specs.map(async ({ query, cuisineHint }) => {
      const payload: Record<string, unknown> = {
        textQuery: query,
        openNow: true,
        maxResultCount: 20,
        locationRestriction: {
          rectangle: bbox,
        },
      };

      const res = await fetch(
        'https://places.googleapis.com/v1/places:searchText',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': PLACES_FIELD_MASK,
          },
          body: JSON.stringify(payload),
          cache: 'no-store',
        }
      );

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Google Places API error (${res.status}): ${errBody}`);
      }

      const data = await res.json();
      const list: GooglePlaceRaw[] = Array.isArray(data?.places)
        ? data.places
        : [];
      for (const p of list) {
        if (
          p.id &&
          p.displayName?.text &&
          p.location?.latitude &&
          p.location?.longitude
        ) {
          if (!rawById.has(p.id)) {
            rawById.set(p.id, { raw: p, cuisineHint });
          }
        }
      }
    })
  );

  const maxAllowedPriceRank =
    questionnaire.priceTiers.length > 0
      ? Math.max(...questionnaire.priceTiers.map((t) => PRICE_TIER_RANK[t]))
      : 4;

  const verified: VerifiedPlaceCandidate[] = [];

  for (const { raw: p, cuisineHint } of rawById.values()) {
    const placeId = p.id!;
    const name = p.displayName!.text!.trim();
    const pLat = Number(p.location!.latitude);
    const pLng = Number(p.location!.longitude);

    const distanceMeters = haversineDistanceMeters(
      location.lat,
      location.lng,
      pLat,
      pLng
    );

    if (distanceMeters > maxSearchRadius) {
      continue;
    }

    const priceTier: PriceTier | null = p.priceLevel
      ? GOOGLE_TO_PRICE_TIER[p.priceLevel] || null
      : null;

    if (priceTier && questionnaire.priceTiers.length > 0) {
      // Always exclude places explicitly more expensive than the user's max selected tier
      if (PRICE_TIER_RANK[priceTier] > maxAllowedPriceRank) {
        continue;
      }
      // If we have plenty of results, strictly honor exact selected price tiers for tagged places
      // while ALWAYS keeping untagged (`priceTier === null`) local gems!
      if (
        !questionnaire.priceTiers.includes(priceTier) &&
        rawById.size >= 10
      ) {
        continue;
      }
    } else if (!priceTier && maxAllowedPriceRank === 1) {
      // If user strictly chose '$' only, skip untagged fine-dining / steakhouse types
      const pTypeLower = (p.primaryTypeDisplayName?.text || '').toLowerCase();
      if (
        pTypeLower.includes('fine dining') ||
        pTypeLower.includes('steak house') ||
        pTypeLower.includes('french')
      ) {
        continue;
      }
    }

    const deliverySupported = p.delivery !== false;
    const dineInSupported = p.dineIn !== false;
    const takeoutSupported = p.takeout !== false;

    const canOrderIn =
      distanceMeters <= orderInRadius &&
      (deliverySupported || takeoutSupported);
    const canEatOut = distanceMeters <= eatOutRadius && dineInSupported;

    if ((wantsOrderIn && canOrderIn) || (wantsEatOut && canEatOut)) {
      const shortAddress =
        p.shortFormattedAddress ||
        (p.formattedAddress
          ? p.formattedAddress.split(',').slice(0, 2).join(',').trim()
          : 'Nearby');
      const fullAddress = p.formattedAddress || shortAddress;
      const googleMapsUri =
        p.googleMapsUri ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${name} ${fullAddress}`
        )}&query_place_id=${encodeURIComponent(placeId)}`;

      const primaryType = p.primaryTypeDisplayName?.text || null;
      const editorialSummary = p.editorialSummary?.text || null;
      const classification = classifyCandidateCuisine(
        { name, primaryType, editorialSummary },
        specificCuisines,
        cuisineHint
      );

      verified.push({
        placeId,
        name,
        shortAddress,
        fullAddress,
        lat: pLat,
        lng: pLng,
        distanceMeters,
        rating:
          typeof p.rating === 'number' ? Number(p.rating.toFixed(1)) : null,
        userRatingCount:
          typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
        priceTier,
        primaryType,
        editorialSummary,
        googleMapsUri,
        canOrderIn,
        canEatOut,
        deliverySupported,
        dineInSupported,
        takeoutSupported,
        matchedCuisine: classification.matchedCuisine,
        matchesSelectedCuisine: classification.matchesSelectedCuisine,
      });
    }
  }

  verified.sort((a, b) => computeQualityScore(b) - computeQualityScore(a));
  return verified;
}

function normalizeCuisineLabel(
  candidate: VerifiedPlaceCandidate,
  questionnaire: QuestionnaireAnswers
): string {
  if (candidate.primaryType) {
    const cleaned = candidate.primaryType.replace(/\s*Restaurant$/i, '').trim();
    if (cleaned && cleaned.toLowerCase() !== 'restaurant') {
      return cleaned;
    }
  }
  if (
    candidate.matchedCuisine &&
    candidate.matchedCuisine !== SURPRISE_ME_LABEL
  ) {
    return candidate.matchedCuisine;
  }
  const specific = questionnaire.cuisines.filter(
    (c) => c !== SURPRISE_ME_LABEL
  );
  if (specific.length > 0) return specific[0];
  return 'Local Spot';
}

function buildFallbackPitch(
  candidate: VerifiedPlaceCandidate,
  mealType: MealType
): string {
  if (candidate.editorialSummary) {
    const clean = candidate.editorialSummary.trim();
    if (clean.length <= 135) return clean;
    return `${clean.slice(0, 132).trim()}...`;
  }
  const typeStr = (
    candidate.matchedCuisine ||
    candidate.primaryType ||
    'Neighborhood'
  )
    .replace(/\s*Restaurant$/i, '')
    .toLowerCase();
  if (candidate.isFavorite) {
    return `One of your saved favorite ${typeStr} spots — reliable, crowd-pleasing, and always a hit.`;
  }
  if (mealType === 'order_in') {
    return `Highly rated neighborhood ${typeStr} spot known for crowd-pleasing flavors and reliable delivery.`;
  }
  return `Popular local ${typeStr} spot in ${
    candidate.shortAddress.split(',')[0]
  } with standout dishes and great dinner vibes.`;
}

function hydrateOption(
  candidate: VerifiedPlaceCandidate,
  mealType: MealType,
  cuisineLabel: string,
  pitch: string,
  questionnaire: QuestionnaireAnswers
): DinnerOption {
  const cleanPitch =
    pitch.trim().length > 135
      ? `${pitch.trim().slice(0, 132).trim()}...`
      : pitch.trim() || buildFallbackPitch(candidate, mealType);
  const resolvedCuisine =
    cuisineLabel.trim() || normalizeCuisineLabel(candidate, questionnaire);

  return {
    kind: 'restaurant',
    placeId: candidate.placeId,
    name: candidate.name,
    mealType,
    cuisineLabel: resolvedCuisine,
    pitch: cleanPitch,
    rating: candidate.rating,
    userRatingCount: candidate.userRatingCount,
    priceTier: candidate.priceTier,
    shortAddress: candidate.shortAddress,
    fullAddress: candidate.fullAddress,
    distanceMeters: candidate.distanceMeters,
    estimatedTimeLabel: formatEstimatedTimeLabel(
      mealType,
      candidate.distanceMeters,
      questionnaire.transportMode,
      questionnaire.deliveryTiming,
      resolvedCuisine,
      candidate.priceTier
    ),
    googleMapsUri: candidate.googleMapsUri,
    isFavorite: candidate.isFavorite,
    favoriteSource: candidate.favoriteSource,
  };
}

async function probePlatformQuoteForCandidate(
  option: Extract<DinnerOption, { kind: 'restaurant' }>,
  platformId: DeliveryPlatformId,
  location: GeoLocationData,
  cachedQuote?: DeliveryPlatformQuote
): Promise<DeliveryPlatformQuote> {
  const platformMeta = DELIVERY_PLATFORMS.find((p) => p.id === platformId);
  const label = platformMeta?.label || platformId;
  const areaLabel = location.label || option.shortAddress || 'London';
  const fallbackStoreUrl = buildFallbackDeliveryRedirectUrl(
    platformId,
    option.name,
    areaLabel
  );

  const smartEta = computeSmartDeliveryEtaRange(
    option.distanceMeters,
    option.cuisineLabel,
    option.priceTier,
    platformId
  );

  if (
    cachedQuote &&
    isDirectStorefrontUrl(platformId, cachedQuote.storeUrl)
  ) {
    const checkedAgeMs =
      Date.now() - new Date(cachedQuote.checkedAt || 0).getTime();
    const isFreshLive =
      cachedQuote.source === 'live_scraped' &&
      checkedAgeMs >= 0 &&
      checkedAgeMs < 45 * 60 * 1000;

    const minMins = isFreshLive ? cachedQuote.etaMinMinutes : smartEta.min;
    const maxMins = isFreshLive ? cachedQuote.etaMaxMinutes : smartEta.max;

    return {
      platformId,
      label,
      available: cachedQuote.available !== false,
      etaMinMinutes: minMins,
      etaMaxMinutes: maxMins,
      etaLabel: `${minMins}–${maxMins}m`,
      storeUrl: cachedQuote.storeUrl,
      source: 'cached_learned',
      checkedAt: new Date().toISOString(),
    };
  }

  const resolved = await resolveDirectStorefrontUrl(
    platformId,
    option.name,
    areaLabel,
    2200
  );

  const finalStoreUrl = resolved.storeUrl || fallbackStoreUrl;
  if (resolved.etaRange) {
    return {
      platformId,
      label,
      available: true,
      etaMinMinutes: resolved.etaRange.min,
      etaMaxMinutes: resolved.etaRange.max,
      etaLabel: `${resolved.etaRange.min}–${resolved.etaRange.max}m`,
      storeUrl: finalStoreUrl,
      source: 'live_scraped',
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    platformId,
    label,
    available: true,
    etaMinMinutes: smartEta.min,
    etaMaxMinutes: smartEta.max,
    etaLabel: `${smartEta.min}–${smartEta.max}m`,
    storeUrl: finalStoreUrl,
    source: resolved.storeUrl ? 'cached_learned' : 'smart_model',
    checkedAt: new Date().toISOString(),
  };
}

async function lookupAndEnrichDeliveryQuotes(
  options: DinnerOption[],
  location: GeoLocationData,
  preferredDeliveryApps: DeliveryPlatformId[],
  learnedDeliveryCache: Record<string, LearnedRestaurantDeliveryInfo>
): Promise<{
  enrichedOptions: DinnerOption[];
  learnedDeliveryUpdates: LearnedRestaurantDeliveryInfo[];
}> {
  const activeApps: DeliveryPlatformId[] =
    Array.isArray(preferredDeliveryApps) && preferredDeliveryApps.length > 0
      ? preferredDeliveryApps
      : DEFAULT_DELIVERY_PLATFORMS;

  const learnedDeliveryUpdates: LearnedRestaurantDeliveryInfo[] = [];

  const enrichedOptions = await Promise.all(
    options.map(async (opt) => {
      if (opt.kind !== 'restaurant') return opt;

      const existingEntry = learnedDeliveryCache?.[opt.placeId];
      const quotes = await Promise.all(
        activeApps.map((platformId) =>
          probePlatformQuoteForCandidate(
            opt,
            platformId,
            location,
            existingEntry?.quotes?.[platformId]
          )
        )
      );

      const quotesMap: Partial<
        Record<DeliveryPlatformId, DeliveryPlatformQuote>
      > = {
        ...(existingEntry?.quotes || {}),
      };
      for (const q of quotes) {
        quotesMap[q.platformId] = q;
      }

      learnedDeliveryUpdates.push({
        placeId: opt.placeId,
        restaurantName: opt.name,
        quotes: quotesMap,
        updatedAt: new Date().toISOString(),
      });

      let updatedTimeLabel = opt.estimatedTimeLabel;
      if (opt.mealType === 'order_in' && quotes.length > 0) {
        const fastest = [...quotes].sort(
          (a, b) => a.etaMinMinutes - b.etaMinMinutes
        )[0];
        if (fastest) {
          updatedTimeLabel = `~${fastest.etaMinMinutes}–${fastest.etaMaxMinutes} min delivery`;
        }
      }

      return {
        ...opt,
        estimatedTimeLabel: updatedTimeLabel,
        deliveryQuotes: quotes,
      };
    })
  );

  return { enrichedOptions, learnedDeliveryUpdates };
}

/**
 * Enriches candidates with Household Favorites metadata and injects synthetic candidates
 * for saved favorites. Unlike the old implementation, this does NOT dump all favorites at index 0;
 * instead `selectDiversifiedCandidates` controls exact favorite gravity based on `rerollCount`!
 */
function injectAndEnrichWithFavorites(
  pool: VerifiedPlaceCandidate[],
  favorites: HouseholdFavorite[],
  location: GeoLocationData,
  questionnaire: QuestionnaireAnswers,
  rerollCount: number
): VerifiedPlaceCandidate[] {
  const specificCuisines = questionnaire.cuisines.filter(
    (c) => c !== SURPRISE_ME_LABEL
  );

  // Re-classify existing pool candidates against current questionnaire.cuisines
  const retaggedPool = pool.map((cand) => {
    const classification = classifyCandidateCuisine(
      cand,
      specificCuisines,
      cand.matchedCuisine
    );
    return {
      ...cand,
      matchedCuisine: classification.matchedCuisine,
      matchesSelectedCuisine: classification.matchesSelectedCuisine,
    };
  });

  if (!Array.isArray(favorites) || favorites.length === 0) {
    return retaggedPool;
  }

  const sortedFavs = [...favorites].sort(
    (a, b) => (b.affinityScore || 5) - (a.affinityScore || 5)
  );

  const favById = new Map(sortedFavs.map((f) => [f.placeId, f]));
  const favByNameLower = new Map(
    sortedFavs.map((f) => [f.name.toLowerCase().trim(), f])
  );

  const matchedFavIds = new Set<string>();

  const enrichedPool = retaggedPool.map((cand) => {
    const match =
      favById.get(cand.placeId) ||
      favByNameLower.get(cand.name.toLowerCase().trim());
    if (match) {
      matchedFavIds.add(match.placeId);
      const classification = classifyCandidateCuisine(
        {
          name: cand.name,
          primaryType: cand.primaryType || `${match.cuisine} Restaurant`,
          editorialSummary: match.notes || cand.editorialSummary,
          matchedCuisine: cand.matchedCuisine,
        },
        specificCuisines
      );
      return {
        ...cand,
        isFavorite: true,
        favoriteSource: match.source,
        affinityScore: match.affinityScore,
        matchedCuisine: classification.matchedCuisine,
        matchesSelectedCuisine: classification.matchesSelectedCuisine,
        editorialSummary:
          match.notes ||
          cand.editorialSummary ||
          `One of your household favorites for ${match.cuisine}.`,
      };
    }
    return cand;
  });

  const syntheticFavCandidates: VerifiedPlaceCandidate[] = [];
  for (const fav of sortedFavs) {
    if (matchedFavIds.has(fav.placeId)) continue;

    const classification = classifyCandidateCuisine(
      {
        name: fav.name,
        primaryType: `${fav.cuisine} Restaurant`,
        editorialSummary: fav.notes,
      },
      specificCuisines
    );

    const favCuisineLower = (fav.cuisine || '').toLowerCase();
    const isGenericFav =
      favCuisineLower === 'local favorite' || favCuisineLower === 'restaurant';
    const matchesCuisine =
      specificCuisines.length === 0 ||
      isGenericFav ||
      classification.matchesSelectedCuisine;

    // Include matching favorites always; include cross-cuisine favorites once rerollCount >= 2 ("Rescue Mode")!
    if (!matchesCuisine && rerollCount < 2) {
      continue;
    }

    const canOrderIn = fav.mealTypes.includes('order_in');
    const canEatOut = fav.mealTypes.includes('eat_out');
    syntheticFavCandidates.push({
      placeId: fav.placeId,
      name: fav.name,
      shortAddress:
        fav.shortAddress && fav.shortAddress !== 'Household Favorite'
          ? fav.shortAddress
          : location.label,
      fullAddress:
        fav.shortAddress && fav.shortAddress !== 'Household Favorite'
          ? `${fav.shortAddress}, ${location.label}`
          : `${fav.name}, ${location.label}`,
      lat: location.lat,
      lng: location.lng,
      distanceMeters: 850,
      rating: 4.8,
      userRatingCount: null,
      priceTier: fav.priceTier || null,
      primaryType: `${fav.cuisine} Restaurant`,
      editorialSummary:
        fav.notes ||
        (fav.source === 'uploaded'
          ? `One of your saved favorites for ${fav.cuisine}.`
          : `Household favorite (won ${fav.winsCount}x, kept ${fav.keptCount}x).`),
      googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${fav.name} ${location.label}`
      )}`,
      canOrderIn,
      canEatOut,
      deliverySupported: canOrderIn,
      dineInSupported: canEatOut,
      takeoutSupported: true,
      isFavorite: true,
      favoriteSource: fav.source,
      affinityScore: fav.affinityScore,
      matchedCuisine: classification.matchedCuisine,
      matchesSelectedCuisine: matchesCuisine,
    });
  }

  const combined: VerifiedPlaceCandidate[] = [];
  const seen = new Set<string>();
  for (const item of [...enrichedPool, ...syntheticFavCandidates]) {
    if (!seen.has(item.placeId)) {
      seen.add(item.placeId);
      combined.push(item);
    }
  }
  return combined;
}

/**
 * Filters out simple dealbreakers typed in User 1's cravingsNote (e.g., "no sushi", "no burgers")
 */
function passesCravingsDealbreakers(
  cand: VerifiedPlaceCandidate,
  cravingsNote: string
): boolean {
  const note = cravingsNote.trim().toLowerCase();
  if (!note) return true;
  const hay = `${cand.name} ${cand.primaryType || ''} ${
    cand.matchedCuisine || ''
  } ${cand.editorialSummary || ''}`.toLowerCase();

  const negMatches = Array.from(
    note.matchAll(/\b(?:no|not|without|avoid)\s+([a-z]{3,15})\b/g)
  );
  for (const m of negMatches) {
    const bannedWord = m[1];
    if (bannedWord && hay.includes(bannedWord)) {
      return false;
    }
  }
  return true;
}

/**
 * Core Diversified + Kept-Cuisine-Dampened + Escalating-Favorites Selector.
 * Guarantees representation across User 1's selected cuisines, dampens cuisines User 1 already kept,
 * and ramps up Favorite probability as `rerollCount` increases.
 */
function selectDiversifiedCandidates(
  availableCandidates: VerifiedPlaceCandidate[],
  questionnaire: QuestionnaireAnswers,
  desiredOrderIn: number,
  desiredEatOut: number,
  keptCuisines: string[],
  rerollCount: number
): {
  orderInCands: VerifiedPlaceCandidate[];
  eatOutCands: VerifiedPlaceCandidate[];
  rescuedWithFavorite: boolean;
} {
  const specificCuisines = questionnaire.cuisines.filter(
    (c) => c !== SURPRISE_ME_LABEL
  );

  const filtered = availableCandidates.filter((c) =>
    passesCravingsDealbreakers(c, questionnaire.cravingsNote)
  );
  const pool = filtered.length > 0 ? filtered : availableCandidates;

  // Count how many kept cards already occupy each normalized cuisine family
  const keptCounts = new Map<string, number>();
  for (const kc of keptCuisines) {
    const norm = normalizeToCuisineFamily(kc, specificCuisines);
    keptCounts.set(norm, (keptCounts.get(norm) || 0) + 1);
  }

  const pickedInThisRoll = new Map<string, number>();
  const chosenIds = new Set<string>();
  const orderInCands: VerifiedPlaceCandidate[] = [];
  const eatOutCands: VerifiedPlaceCandidate[] = [];

  const totalNeeded = desiredOrderIn + desiredEatOut;
  if (totalNeeded === 0 || pool.length === 0) {
    return { orderInCands, eatOutCands, rescuedWithFavorite: false };
  }

  // Determine how many Favorite slots to gravitate toward based on rerollCount:
  // Roll 0 (initial): max 1 matching high-affinity favorite so discovery stays front-and-center
  // Roll 1: up to 1 matching favorite
  // Roll 2: up to 2 favorites (matching first, then high-affinity cross-cuisine)
  // Roll 3+: Rescue Mode! Up to 75% of needed slots (min 1) can pull from any unexcluded favorites!
  let targetFavSlots = 0;
  if (rerollCount <= 0) {
    targetFavSlots = totalNeeded >= 3 ? 1 : 0;
  } else if (rerollCount === 1) {
    targetFavSlots = 1;
  } else if (rerollCount === 2) {
    targetFavSlots = Math.min(2, totalNeeded);
  } else {
    targetFavSlots = Math.min(
      totalNeeded,
      Math.max(1, Math.ceil(totalNeeded * 0.75))
    );
  }

  const getCuisineWeight = (
    cand: VerifiedPlaceCandidate,
    allowCrossCuisineFav = false
  ): number => {
    const family =
      cand.matchedCuisine ||
      normalizeToCuisineFamily(
        `${cand.primaryType || ''} ${cand.name}`,
        specificCuisines
      );

    let base = 1.0;
    if (specificCuisines.length > 0) {
      if (cand.matchesSelectedCuisine || specificCuisines.includes(family)) {
        base = 1.0;
      } else if (allowCrossCuisineFav && cand.isFavorite) {
        base = 0.68; // Cross-cuisine favorite rescue weight
      } else {
        base = 0.06; // Off-cuisine non-favorite only used when on-cuisine candidates run out
      }
    }

    // Dampen cuisines already locked as Kept by User 1 (0.18x per kept spot of that cuisine)
    const keptN = keptCounts.get(family) || 0;
    if (keptN > 0) {
      base *= Math.pow(0.18, keptN);
    }

    // Dampen cuisines already picked in THIS roll (0.22x per spot) so all chosen cuisines appear before any repeats!
    const pickedN = pickedInThisRoll.get(family) || 0;
    if (pickedN > 0) {
      base *= Math.pow(0.22, pickedN);
    }

    return base;
  };

  const recordPick = (cand: VerifiedPlaceCandidate, bucket: MealType) => {
    chosenIds.add(cand.placeId);
    const family =
      cand.matchedCuisine ||
      normalizeToCuisineFamily(
        `${cand.primaryType || ''} ${cand.name}`,
        specificCuisines
      );
    pickedInThisRoll.set(family, (pickedInThisRoll.get(family) || 0) + 1);
    if (bucket === 'order_in') orderInCands.push(cand);
    else eatOutCands.push(cand);
  };

  let rescuedWithFavorite = false;

  // Step 1: Fill favorite-gravity quota first (if eligible favorites exist)
  if (targetFavSlots > 0) {
    const eligibleFavs = pool.filter((c) => {
      if (!c.isFavorite) return false;
      if (rerollCount <= 0) {
        return (
          c.matchesSelectedCuisine !== false && (c.affinityScore || 5) >= 6
        );
      }
      if (rerollCount === 1) {
        return c.matchesSelectedCuisine !== false;
      }
      return true; // rerollCount >= 2 allows cross-cuisine favorites too!
    });

    let favsPicked = 0;
    while (favsPicked < targetFavSlots) {
      const needOrderIn = orderInCands.length < desiredOrderIn;
      const needEatOut = eatOutCands.length < desiredEatOut;
      if (!needOrderIn && !needEatOut) break;

      const scoredFavs = eligibleFavs
        .filter((c) => {
          if (chosenIds.has(c.placeId)) return false;
          if (needOrderIn && needEatOut) return c.canOrderIn || c.canEatOut;
          if (needOrderIn) return c.canOrderIn;
          return c.canEatOut;
        })
        .map((c) => {
          const cWeight = getCuisineWeight(c, rerollCount >= 2);
          const affinityNorm = Math.min(1.5, Math.max(0.7, (c.affinityScore || 5) / 8));
          const jitter = Math.random() * 0.08;
          return {
            cand: c,
            score: cWeight * (affinityNorm + jitter),
          };
        })
        .sort((a, b) => b.score - a.score);

      if (scoredFavs.length === 0) break;
      const winner = scoredFavs[0].cand;
      const targetBucket: MealType =
        needOrderIn && winner.canOrderIn
          ? !needEatOut || orderInCands.length <= eatOutCands.length || !winner.canEatOut
            ? 'order_in'
            : 'eat_out'
          : 'eat_out';

      recordPick(winner, targetBucket);
      favsPicked += 1;
      if (rerollCount >= 2) {
        rescuedWithFavorite = true;
      }
    }
  }

  // Step 2: Fill remaining slots via Cuisine-Weighted Round-Robin + Quality Top-K Jitter
  const fillBucket = (bucket: MealType, targetCount: number) => {
    const targetArr = bucket === 'order_in' ? orderInCands : eatOutCands;
    while (targetArr.length < targetCount) {
      const candidatesForBucket = pool.filter((c) => {
        if (chosenIds.has(c.placeId)) return false;
        // On initial roll (rerollCount === 0), don't exceed targetFavSlots with extra favorites if non-favorites exist
        if (rerollCount <= 0 && c.isFavorite) {
          const hasNonFavAlternative = pool.some(
            (other) =>
              !chosenIds.has(other.placeId) &&
              !other.isFavorite &&
              (bucket === 'order_in' ? other.canOrderIn : other.canEatOut)
          );
          if (hasNonFavAlternative) return false;
        }
        return bucket === 'order_in' ? c.canOrderIn : c.canEatOut;
      });

      if (candidatesForBucket.length === 0) break;

      // Normalize quality score across remaining pool into ~[0.85, 1.15] so cuisine diversity weight dominates tier selection
      // while quality + top-3 subtle jitter picks great spots within the winning cuisine tier!
      const rawQualities = candidatesForBucket.map(computeQualityScore);
      const minQ = Math.min(...rawQualities);
      const maxQ = Math.max(...rawQualities);
      const spanQ = Math.max(0.5, maxQ - minQ);

      const scored = candidatesForBucket
        .map((c) => {
          const cWeight = getCuisineWeight(c, rerollCount >= 3);
          const qNorm = 0.88 + 0.24 * ((computeQualityScore(c) - minQ) / spanQ);
          const favBoost =
            c.isFavorite && rerollCount >= 2 ? 1.18 : 1.0;
          const jitter = Math.random() * 0.07;
          return {
            cand: c,
            score: cWeight * favBoost * (qNorm + jitter),
          };
        })
        .sort((a, b) => b.score - a.score);

      recordPick(scored[0].cand, bucket);
    }
  };

  // Interleave filling order_in and eat_out one slot at a time so neither mealType monopolizes a cuisine!
  while (
    orderInCands.length < desiredOrderIn ||
    eatOutCands.length < desiredEatOut
  ) {
    const beforeTotal = orderInCands.length + eatOutCands.length;
    if (orderInCands.length < desiredOrderIn) {
      fillBucket('order_in', orderInCands.length + 1);
    }
    if (eatOutCands.length < desiredEatOut) {
      fillBucket('eat_out', eatOutCands.length + 1);
    }
    if (orderInCands.length + eatOutCands.length === beforeTotal) {
      break;
    }
  }

  return { orderInCands, eatOutCands, rescuedWithFavorite };
}

/**
 * Optional Gemini pitch & label polisher for the already-diversified chosen candidates.
 */
async function polishPitchesWithGemini(
  picked: Array<{ cand: VerifiedPlaceCandidate; mealType: MealType }>,
  questionnaire: QuestionnaireAnswers
): Promise<Map<string, { cuisineLabel: string; pitch: string }>> {
  const result = new Map<string, { cuisineLabel: string; pitch: string }>();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const modelName = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

  if (
    !geminiKey ||
    geminiKey.includes('your_gemini_api_key') ||
    picked.length === 0
  ) {
    return result;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const compact = picked.map(({ cand, mealType }) => ({
      placeId: cand.placeId,
      name: cand.name,
      mealType,
      matchedCuisine: cand.matchedCuisine,
      primaryType: cand.primaryType,
      rating: cand.rating,
      priceTier: cand.priceTier,
      isFavorite: Boolean(cand.isFavorite),
      summary: cand.editorialSummary,
      area: cand.shortAddress,
    }));

    const prompt = `Write a mouth-watering, specific 1-sentence dinner pitch (max 125 chars) and a clean 1-2 word cuisineLabel for each chosen restaurant below.
Cravings note: ${questionnaire.cravingsNote.trim() || 'None'}
Candidates JSON:
${JSON.stringify(compact)}`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  placeId: { type: Type.STRING },
                  cuisineLabel: { type: Type.STRING },
                  pitch: { type: Type.STRING },
                },
                required: ['placeId', 'cuisineLabel', 'pitch'],
              },
            },
          },
          required: ['items'],
        },
      },
    });

    const rawText = response.text;
    if (!rawText) return result;
    const parsed = JSON.parse(rawText) as {
      items?: Array<{ placeId: string; cuisineLabel: string; pitch: string }>;
    };
    for (const item of parsed.items || []) {
      result.set(item.placeId, {
        cuisineLabel: item.cuisineLabel,
        pitch: item.pitch,
      });
    }
  } catch (err) {
    console.warn('Gemini pitch polish fallback:', err);
  }

  return result;
}

async function selectAndHydrateOptions(
  availableCandidates: VerifiedPlaceCandidate[],
  questionnaire: QuestionnaireAnswers,
  countNeeded: number,
  keptCuisines: string[],
  rerollCount: number,
  forcedSingleMealType?: MealType,
  forcedMealTypesList?: MealType[]
): Promise<{
  options: DinnerOption[];
  notice: string | null;
  exhausted: boolean;
}> {
  if (availableCandidates.length === 0) {
    return {
      options: [],
      notice:
        'No currently-open spots matched all filters and exclusions nearby. Try editing your filters or searching a spot directly!',
      exhausted: true,
    };
  }

  const wantsOrderIn = questionnaire.mealTypes.includes('order_in');
  const wantsEatOut = questionnaire.mealTypes.includes('eat_out');

  let desiredOrderIn = 0;
  let desiredEatOut = 0;
  let notice: string | null = null;

  if (forcedMealTypesList && forcedMealTypesList.length > 0) {
    desiredOrderIn = forcedMealTypesList.filter((m) => m === 'order_in').length;
    desiredEatOut = forcedMealTypesList.filter((m) => m === 'eat_out').length;
  } else if (forcedSingleMealType) {
    if (forcedSingleMealType === 'order_in') desiredOrderIn = 1;
    else desiredEatOut = 1;
  } else if (wantsOrderIn && wantsEatOut) {
    desiredOrderIn = Math.ceil(countNeeded / 2);
    desiredEatOut = countNeeded - desiredOrderIn;
  } else if (wantsOrderIn) {
    desiredOrderIn = countNeeded;
  } else {
    desiredEatOut = countNeeded;
  }

  const { orderInCands, eatOutCands, rescuedWithFavorite } =
    selectDiversifiedCandidates(
      availableCandidates,
      questionnaire,
      desiredOrderIn,
      desiredEatOut,
      keptCuisines,
      rerollCount
    );

  // Handle fallback when user wants both Order In & Eat Out (or partial reroll) and one bucket ran short
  const chosenIds = new Set(
    [...orderInCands, ...eatOutCands].map((c) => c.placeId)
  );
  const totalPickedSoFar = orderInCands.length + eatOutCands.length;

  if (totalPickedSoFar < countNeeded && wantsOrderIn && wantsEatOut) {
    const missing = countNeeded - totalPickedSoFar;
    const fallbackPool = availableCandidates.filter(
      (c) => !chosenIds.has(c.placeId) && (c.canOrderIn || c.canEatOut)
    );
    const extra = selectDiversifiedCandidates(
      fallbackPool,
      questionnaire,
      orderInCands.length < desiredOrderIn ? 0 : missing,
      eatOutCands.length < desiredEatOut ? 0 : missing,
      [
        ...keptCuisines,
        ...[...orderInCands, ...eatOutCands].map(
          (c) => c.matchedCuisine || c.primaryType || ''
        ),
      ],
      rerollCount
    );
    for (const c of extra.orderInCands) {
      if (orderInCands.length + eatOutCands.length < countNeeded) {
        orderInCands.push(c);
      }
    }
    for (const c of extra.eatOutCands) {
      if (orderInCands.length + eatOutCands.length < countNeeded) {
        eatOutCands.push(c);
      }
    }
  }

  const pairedList: Array<{ cand: VerifiedPlaceCandidate; mealType: MealType }> =
    [
      ...orderInCands.map((cand) => ({ cand, mealType: 'order_in' as MealType })),
      ...eatOutCands.map((cand) => ({ cand, mealType: 'eat_out' as MealType })),
    ].slice(0, countNeeded);

  const geminiPolish = await polishPitchesWithGemini(pairedList, questionnaire);

  const combined = pairedList.map(({ cand, mealType }) => {
    const polished = geminiPolish.get(cand.placeId);
    return hydrateOption(
      cand,
      mealType,
      polished?.cuisineLabel || normalizeCuisineLabel(cand, questionnaire),
      polished?.pitch || buildFallbackPitch(cand, mealType),
      questionnaire
    );
  });

  const exhausted = combined.length < countNeeded;

  if (exhausted && !notice) {
    notice =
      combined.length === 0
        ? 'No more open restaurants matched your current filters. Try editing filters or searching a spot!'
        : `Only ${combined.length} open spot${
            combined.length === 1 ? '' : 's'
          } matched all filters nearby. You can play with what you have or broaden filters.`;
  } else if (!exhausted && rescuedWithFavorite && rerollCount >= 3) {
    notice =
      'Mixed in saved favorites to help you lock in your picks!';
  }

  return {
    options: combined,
    notice,
    exhausted,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as OptionsRequestBody;
    const {
      mode = 'initial',
      location,
      questionnaire,
      excludedPlaceIds = [],
      excludedNames = [],
      candidatePool = [],
      favorites = [],
      preferredDeliveryApps = DEFAULT_DELIVERY_PLATFORMS,
      learnedDeliveryCache = {},
      targetMealType,
      targetMealTypes,
      currentVisibleIds = [],
      keptCuisines = [],
      rerollCount = 0,
      forceRefreshPool = false,
      manualPlace,
    } = body;

    if (
      !location ||
      typeof location.lat !== 'number' ||
      typeof location.lng !== 'number'
    ) {
      return NextResponse.json(
        { error: 'Valid location coordinates are required.' },
        { status: 400 }
      );
    }

    // Fast path: Hydrate a single manually searched / picked spot right inside Stage 4!
    if (mode === 'hydrate_manual' && manualPlace) {
      const wantsOrderIn = questionnaire.mealTypes.includes('order_in');
      const assignedMealType: MealType = wantsOrderIn ? 'order_in' : 'eat_out';
      const dist =
        typeof manualPlace.distanceMeters === 'number' &&
        manualPlace.distanceMeters > 0
          ? manualPlace.distanceMeters
          : 800;

      const synthCand: VerifiedPlaceCandidate = {
        placeId: manualPlace.placeId,
        name: manualPlace.name,
        shortAddress: manualPlace.shortAddress || location.label,
        fullAddress:
          manualPlace.fullAddress ||
          (manualPlace.shortAddress
            ? `${manualPlace.shortAddress}, ${location.label}`
            : `${manualPlace.name}, ${location.label}`),
        lat: location.lat,
        lng: location.lng,
        distanceMeters: dist,
        rating:
          typeof manualPlace.rating === 'number' ? manualPlace.rating : null,
        userRatingCount:
          typeof manualPlace.userRatingCount === 'number'
            ? manualPlace.userRatingCount
            : null,
        priceTier:
          manualPlace.priceTier !== undefined ? manualPlace.priceTier : null,
        primaryType: `${manualPlace.cuisine || 'Local'} Restaurant`,
        editorialSummary:
          manualPlace.pitch ||
          `Hand-picked by you for tonight’s 4-2-1 lineup.`,
        googleMapsUri:
          manualPlace.googleMapsUri ||
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            `${manualPlace.name} ${location.label}`
          )}`,
        canOrderIn: true,
        canEatOut: true,
        deliverySupported: true,
        dineInSupported: true,
        takeoutSupported: true,
        isFavorite: Boolean(manualPlace.isFavorite),
        matchedCuisine: manualPlace.cuisine || 'Local Spot',
        matchesSelectedCuisine: true,
      };

      const hydrated = hydrateOption(
        synthCand,
        assignedMealType,
        manualPlace.cuisine || 'Hand-Picked',
        synthCand.editorialSummary || '',
        questionnaire
      );

      const { enrichedOptions, learnedDeliveryUpdates } =
        await lookupAndEnrichDeliveryQuotes(
          [hydrated],
          location,
          preferredDeliveryApps,
          learnedDeliveryCache
        );

      return NextResponse.json({
        options: enrichedOptions,
        learnedDeliveryUpdates,
      });
    }

    const orderInRadius = computeOrderInRadiusMeters(
      questionnaire.deliveryTiming
    );
    const eatOutRadius = computeEatOutRadiusMeters(
      questionnaire.transportMode,
      questionnaire.maxTravelMinutes
    );

    const allExcludedIds = new Set<string>([
      ...excludedPlaceIds,
      ...(questionnaire.excludeRecentWinners
        ? questionnaire.excludedRecentWinnerIds || []
        : []),
      ...currentVisibleIds,
    ]);
    const allExcludedNamesLower = new Set<string>(
      excludedNames.map((n) => n.toLowerCase().trim())
    );

    const filterEligible = (pool: VerifiedPlaceCandidate[]) =>
      pool.filter((c) => {
        if (allExcludedIds.has(c.placeId)) return false;
        if (allExcludedNamesLower.has(c.name.toLowerCase().trim())) return false;
        // Re-check distance against current radius (important if user edited travel time / delivery timing mid-game)
        const wantsOrderIn = questionnaire.mealTypes.includes('order_in');
        const wantsEatOut = questionnaire.mealTypes.includes('eat_out');
        const validOrderIn =
          wantsOrderIn && c.canOrderIn && c.distanceMeters <= orderInRadius;
        const validEatOut =
          wantsEatOut && c.canEatOut && c.distanceMeters <= eatOutRadius;

        if (mode === 'reroll_one' && targetMealType) {
          return targetMealType === 'order_in' ? validOrderIn : validEatOut;
        }
        return validOrderIn || validEatOut;
      });

    const basePool = forceRefreshPool
      ? []
      : Array.isArray(candidatePool)
      ? candidatePool
      : [];

    let masterPool: VerifiedPlaceCandidate[] = injectAndEnrichWithFavorites(
      basePool,
      favorites,
      location,
      questionnaire,
      rerollCount
    );
    let eligibleFromCache = filterEligible(masterPool);

    const countNeeded =
      mode === 'reroll_unkept' &&
      Array.isArray(targetMealTypes) &&
      targetMealTypes.length > 0
        ? targetMealTypes.length
        : mode === 'reroll_one'
        ? 1
        : 4;

    const specificCuisines = questionnaire.cuisines.filter(
      (c) => c !== SURPRISE_ME_LABEL
    );

    // Check which selected cuisines are depleted (<2 non-excluded options left) or newly added mid-game!
    const depletedCuisines = specificCuisines.filter((sc) => {
      const countForCuisine = eligibleFromCache.filter(
        (c) => c.matchedCuisine === sc && !c.isFavorite
      ).length;
      return countForCuisine < 2;
    });

    const nonFavEligibleCount = eligibleFromCache.filter(
      (c) => !c.isFavorite
    ).length;
    const minPoolThreshold = countNeeded < 4 ? Math.max(3, countNeeded + 1) : 6;

    const needsGoogleFetch =
      forceRefreshPool ||
      eligibleFromCache.length < minPoolThreshold ||
      (mode === 'initial' && nonFavEligibleCount < 4) ||
      depletedCuisines.length > 0;

    if (needsGoogleFetch) {
      // Only fetch the missing/depleted cuisines if we already have a pool for the others!
      const cuisinesToQuery =
        !forceRefreshPool &&
        basePool.length > 0 &&
        specificCuisines.length > 0 &&
        depletedCuisines.length > 0 &&
        depletedCuisines.length < specificCuisines.length
          ? depletedCuisines
          : undefined;

      const freshlyFetched = await fetchPlacesFromGoogle(
        location,
        questionnaire,
        orderInRadius,
        eatOutRadius,
        cuisinesToQuery
      );
      const mergedMap = new Map<string, VerifiedPlaceCandidate>();
      for (const item of [...masterPool, ...freshlyFetched]) {
        mergedMap.set(item.placeId, item);
      }
      masterPool = injectAndEnrichWithFavorites(
        Array.from(mergedMap.values()),
        favorites,
        location,
        questionnaire,
        rerollCount
      );
      eligibleFromCache = filterEligible(masterPool);
    }

    // Handle manually included places on initial generation
    const manualList =
      mode === 'initial' && Array.isArray(questionnaire.manuallyIncludedPlaces)
        ? questionnaire.manuallyIncludedPlaces.slice(0, 4)
        : [];
    const manualIds = new Set(manualList.map((m) => m.placeId));
    const manualNamesLower = new Set(
      manualList.map((m) => m.name.toLowerCase().trim())
    );

    const manualHydrated: DinnerOption[] = manualList.map((m, idx) => {
      const foundCand = masterPool.find(
        (c) =>
          c.placeId === m.placeId ||
          c.name.toLowerCase().trim() === m.name.toLowerCase().trim()
      );
      const wantsOrderIn = questionnaire.mealTypes.includes('order_in');
      const wantsEatOut = questionnaire.mealTypes.includes('eat_out');
      const assignedMealType: MealType =
        wantsOrderIn && wantsEatOut
          ? idx % 2 === 0
            ? 'order_in'
            : 'eat_out'
          : wantsOrderIn
          ? 'order_in'
          : 'eat_out';

      if (foundCand) {
        return hydrateOption(
          foundCand,
          assignedMealType,
          m.cuisine || normalizeCuisineLabel(foundCand, questionnaire),
          m.pitch ||
            foundCand.editorialSummary ||
            buildFallbackPitch(foundCand, assignedMealType),
          questionnaire
        );
      }

      const synthCand: VerifiedPlaceCandidate = {
        placeId: m.placeId,
        name: m.name,
        shortAddress: m.shortAddress || location.label,
        fullAddress:
          m.fullAddress ||
          (m.shortAddress
            ? `${m.shortAddress}, ${location.label}`
            : `${m.name}, ${location.label}`),
        lat: location.lat,
        lng: location.lng,
        distanceMeters: m.distanceMeters || 800,
        rating: m.rating ?? null,
        userRatingCount: m.userRatingCount ?? null,
        priceTier: m.priceTier !== undefined ? m.priceTier : null,
        primaryType: `${m.cuisine || 'Local'} Restaurant`,
        editorialSummary:
          m.pitch || `Hand-picked spot included by you for tonight’s game.`,
        googleMapsUri:
          m.googleMapsUri ||
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            `${m.name} ${location.label}`
          )}`,
        canOrderIn: true,
        canEatOut: true,
        deliverySupported: true,
        dineInSupported: true,
        takeoutSupported: true,
        isFavorite: true,
        favoriteSource: 'uploaded',
        matchedCuisine: m.cuisine || 'Local Spot',
        matchesSelectedCuisine: true,
      };

      return hydrateOption(
        synthCand,
        assignedMealType,
        m.cuisine || 'Hand-Picked',
        synthCand.editorialSummary || '',
        questionnaire
      );
    });

    const remainingSlotsNeeded = Math.max(
      0,
      countNeeded - manualHydrated.length
    );
    const eligibleWithoutManual = eligibleFromCache.filter(
      (c) =>
        !manualIds.has(c.placeId) &&
        !manualNamesLower.has(c.name.toLowerCase().trim())
    );

    const combinedKeptCuisines = [
      ...keptCuisines,
      ...manualHydrated.map((m) => m.cuisineLabel),
    ];

    const {
      options: autoOptions,
      notice,
      exhausted,
    } = remainingSlotsNeeded > 0
      ? await selectAndHydrateOptions(
          eligibleWithoutManual,
          questionnaire,
          remainingSlotsNeeded,
          combinedKeptCuisines,
          rerollCount,
          mode === 'reroll_one' ? targetMealType : undefined,
          mode === 'reroll_unkept' ? targetMealTypes : undefined
        )
      : { options: [], notice: null, exhausted: false };

    const rawOptions = [...manualHydrated, ...autoOptions].slice(
      0,
      countNeeded
    );

    const { enrichedOptions: options, learnedDeliveryUpdates } =
      await lookupAndEnrichDeliveryQuotes(
        rawOptions,
        location,
        preferredDeliveryApps,
        learnedDeliveryCache
      );

    const newlyChosenIds = new Set(options.map((o) => o.placeId));
    const updatedCandidatePool = masterPool.filter(
      (c) =>
        !excludedPlaceIds.includes(c.placeId) && !newlyChosenIds.has(c.placeId)
    );

    return NextResponse.json({
      options,
      candidatePool: updatedCandidatePool,
      learnedDeliveryUpdates,
      notice,
      exhausted,
    });
  } catch (err) {
    console.error('Error in /api/options:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to generate dinner options. Please check your API keys and network.',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/options?q=searchTerm&lat=...&lng=...&label=...
 * Live lookup for manual restaurant inclusion (both in Questionnaire and anytime in Stage 4).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() || '';
  const lat = Number(searchParams.get('lat')) || 40.7336;
  const lng = Number(searchParams.get('lng')) || -74.0027;
  const label = searchParams.get('label') || 'Nearby';

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (apiKey && !apiKey.includes('your_google_places_api_key')) {
    try {
      const bbox = boundingBoxFromCenter(lat, lng, 18000);
      const res = await fetch(
        'https://places.googleapis.com/v1/places:searchText',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': PLACES_FIELD_MASK,
          },
          body: JSON.stringify({
            textQuery: `${q} restaurant`,
            maxResultCount: 8,
            locationRestriction: { rectangle: bbox },
          }),
          cache: 'no-store',
        }
      );

      if (res.ok) {
        const data = await res.json();
        const places: GooglePlaceRaw[] = Array.isArray(data?.places)
          ? data.places
          : [];
        const results: ManualIncludedPlace[] = places
          .filter((p) => p.id && p.displayName?.text)
          .map((p) => {
            const pLat = p.location?.latitude ?? lat;
            const pLng = p.location?.longitude ?? lng;
            const distanceMeters = haversineDistanceMeters(lat, lng, pLat, pLng);
            const shortAddress =
              p.shortFormattedAddress ||
              p.formattedAddress?.split(',').slice(0, 2).join(',').trim() ||
              label;
            return {
              placeId: p.id!,
              name: p.displayName!.text!,
              cuisine:
                p.primaryTypeDisplayName?.text?.replace(/\s*Restaurant$/i, '') ||
                'Restaurant',
              priceTier: p.priceLevel
                ? GOOGLE_TO_PRICE_TIER[p.priceLevel] || null
                : null,
              shortAddress,
              fullAddress: p.formattedAddress || shortAddress,
              pitch: p.editorialSummary?.text || '',
              rating:
                typeof p.rating === 'number'
                  ? Number(p.rating.toFixed(1))
                  : null,
              userRatingCount:
                typeof p.userRatingCount === 'number'
                  ? p.userRatingCount
                  : null,
              distanceMeters,
              googleMapsUri: p.googleMapsUri,
            };
          });
        return NextResponse.json({ results });
      }
    } catch {
      // Fall through to demo catalog search
    }
  }

  const dummyQ: QuestionnaireAnswers = {
    mealTypes: ['order_in', 'eat_out'],
    cuisines: [SURPRISE_ME_LABEL],
    cravingsNote: '',
    excludeRecentWinners: false,
    excludedRecentWinnerIds: [],
    priceTiers: ['$$'],
    deliveryTiming: 'under_45',
    transportMode: 'drive',
    maxTravelMinutes: 25,
  };
  const pool = buildDemoCandidatePool({ lat, lng, label }, dummyQ, 8000, 8000);
  const qLower = q.toLowerCase();
  const matched: ManualIncludedPlace[] = pool
    .filter(
      (c) =>
        c.name.toLowerCase().includes(qLower) ||
        (c.primaryType || '').toLowerCase().includes(qLower)
    )
    .slice(0, 6)
    .map((c) => ({
      placeId: c.placeId,
      name: c.name,
      cuisine: (c.primaryType || 'Restaurant').replace(/\s*Restaurant$/i, ''),
      priceTier: c.priceTier,
      shortAddress: c.shortAddress,
      fullAddress: c.fullAddress,
      pitch: c.editorialSummary || '',
      rating: c.rating,
      userRatingCount: c.userRatingCount,
      distanceMeters: c.distanceMeters,
      googleMapsUri: c.googleMapsUri,
    }));

  return NextResponse.json({ results: matched });
}
