export type PlayMode = 'two_phones' | 'pass_phone';
export type MealType = 'order_in' | 'eat_out';
export type TransportMode = 'walk' | 'drive' | 'transit';
export type PriceTier = '$' | '$$' | '$$$' | '$$$$';
export type DeliveryTiming = 'under_30' | 'under_45' | 'under_60' | 'no_rush';
export type TravelMinutes = 10 | 15 | 25 | 40;
export type PlayerRole = 'user1' | 'user2';

export type DeliveryPlatformId =
  | 'deliveroo'
  | 'uber_eats'
  | 'just_eat'
  | 'doordash'
  | 'grubhub';

export const DELIVERY_PLATFORMS: Array<{
  id: DeliveryPlatformId;
  label: string;
  shortLabel: string;
  brandColor: string;
}> = [
  {
    id: 'deliveroo',
    label: 'Deliveroo',
    shortLabel: 'Deliveroo',
    brandColor: '#00CCBC',
  },
  {
    id: 'uber_eats',
    label: 'Uber Eats',
    shortLabel: 'Uber Eats',
    brandColor: '#06C167',
  },
  {
    id: 'just_eat',
    label: 'Just Eat',
    shortLabel: 'Just Eat',
    brandColor: '#FF8000',
  },
  {
    id: 'doordash',
    label: 'DoorDash',
    shortLabel: 'DoorDash',
    brandColor: '#FF3008',
  },
  {
    id: 'grubhub',
    label: 'Grubhub',
    shortLabel: 'Grubhub',
    brandColor: '#F63440',
  },
];

export const DEFAULT_DELIVERY_PLATFORMS: DeliveryPlatformId[] = [
  'deliveroo',
  'uber_eats',
];

export interface DeliveryPlatformQuote {
  platformId: DeliveryPlatformId;
  label: string;
  available: boolean;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  etaLabel: string; // e.g. "20–30 min"
  storeUrl: string;
  source: 'live_scraped' | 'cached_learned' | 'smart_model';
  checkedAt: string;
}

export interface LearnedRestaurantDeliveryInfo {
  placeId: string;
  restaurantName: string;
  quotes: Partial<Record<DeliveryPlatformId, DeliveryPlatformQuote>>;
  updatedAt: string;
}

export type GamePhase =
  | 'SETUP'
  | 'Q_PAGE_1'          // User 1 selects meal type(s), cuisines, cravings note, skip-recent toggle
  | 'Q_PAGE_2'          // User 1 selects price + delivery timing and/or transport + travel time
  | 'GENERATING'        // Fetching & curating 4 options
  | 'U1_REVIEW_4'       // Stage "4": User 1 reviews, single-rerolls, rerolls all 4, edits filters, or confirms
  | 'HANDOFF_TO_U2'     // Pass-the-phone interstitial only (skipped in two_phones mode)
  | 'U2_PICK_2'         // Stage "2": User 2 picks exactly 2 OR uses their 1 veto
  | 'U2_VETOED'         // User 1 notified of veto -> regenerate 4 w/ same filters OR edit filters
  | 'HANDOFF_TO_U1'     // Pass-the-phone interstitial only (skipped in two_phones mode)
  | 'U1_PICK_1'         // Stage "1": User 1 picks 1 winner from the 2 finalists
  | 'WINNER';           // Final chosen restaurant synced to both devices

/**
 * Extensible funnel config for v2 (e.g., 3-6 players or custom counts)
 */
export const DEFAULT_FUNNEL = [4, 2, 1] as const;

export const PRESET_CUISINES = [
  'Surprise Me / Anything',
  'Italian',
  'Mexican',
  'Japanese / Sushi',
  'Thai',
  'Chinese',
  'Indian',
  'Mediterranean',
  'Turkish',
  'Burgers / American',
  'Sandwiches',
  'Pizza',
  'Korean',
  'Vietnamese',
  'Healthy / Bowls',
  'Seafood',
] as const;

export const SURPRISE_ME_LABEL = 'Surprise Me / Anything';

export interface GeoLocationData {
  lat: number;
  lng: number;
  label: string;
}

export interface PlayerInfo {
  id: string;
  name: string;
  role: PlayerRole;
}

/**
 * Verified Google Places candidate stored in candidatePool for <1s single-card rerolls
 */
export interface VerifiedPlaceCandidate {
  placeId: string;
  name: string;
  shortAddress: string;
  fullAddress: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  rating: number | null;
  userRatingCount: number | null;
  priceTier: PriceTier | null;
  primaryType: string | null;
  editorialSummary: string | null;
  googleMapsUri: string;
  canOrderIn: boolean;
  canEatOut: boolean;
  deliverySupported: boolean;
  dineInSupported: boolean;
  takeoutSupported: boolean;
  isFavorite?: boolean;
  favoriteSource?: 'uploaded' | 'learned';
  affinityScore?: number;
  matchedCuisine?: string;
  matchesSelectedCuisine?: boolean;
}

/**
 * Hydrated restaurant card option (v1).
 * Uses discriminated union `kind: 'restaurant'` so v2 can add `RecipeOption` cleanly.
 */
export interface RestaurantOption {
  kind: 'restaurant';
  placeId: string;
  name: string;
  mealType: MealType;
  cuisineLabel: string;
  pitch: string;
  rating: number | null;
  userRatingCount: number | null;
  priceTier: PriceTier | null;
  shortAddress: string;
  fullAddress: string;
  distanceMeters: number;
  estimatedTimeLabel: string;
  googleMapsUri: string;
  deliveryQuotes?: DeliveryPlatformQuote[];
  isFavorite?: boolean;
  favoriteSource?: 'uploaded' | 'learned';
}

export type DinnerOption = RestaurantOption; // | RecipeOption (in v2)

export interface ManualIncludedPlace {
  placeId: string;
  name: string;
  cuisine: string;
  priceTier?: PriceTier | null;
  shortAddress?: string;
  fullAddress?: string;
  pitch?: string;
  rating?: number | null;
  userRatingCount?: number | null;
  distanceMeters?: number;
  googleMapsUri?: string;
  isFavorite?: boolean;
}

export interface QuestionnaireAnswers {
  mealTypes: MealType[]; // ['order_in'], ['eat_out'], or ['order_in', 'eat_out']
  cuisines: string[];
  cravingsNote: string;
  excludeRecentWinners: boolean;
  excludedRecentWinnerIds: string[]; // specific recent winner placeIds to exclude
  manuallyIncludedPlaces?: ManualIncludedPlace[]; // up to 4 manually chosen spots to include
  priceTiers: PriceTier[];
  deliveryTiming: DeliveryTiming;
  transportMode: TransportMode;
  maxTravelMinutes: TravelMinutes;
}

export interface GameSessionState {
  id: string;
  householdId: string;
  roomCode: string;
  playMode: PlayMode;
  phase: GamePhase;
  funnelSteps: number[];
  location: GeoLocationData;
  players: PlayerInfo[];
  user1Name: string;
  user2Name: string;
  questionnaire: QuestionnaireAnswers;
  /**
   * Cumulative exclusion invariant across the entire session:
   * Every single-card reroll, U1 reroll-all, and U2 veto appends here and never resets between rounds.
   */
  excludedPlaceIds: string[];
  excludedNames: string[];
  /**
   * Cached verified Places pool for fast single-card rerolls without extra Places API calls
   */
  candidatePool: VerifiedPlaceCandidate[];
  /**
   * Current 4 options in Stage 4 / Stage 2
   */
  currentFour: DinnerOption[];
  /**
   * Finalist 2 options selected by User 2 for Stage 1
   */
  finalistTwo: DinnerOption[];
  /**
   * Final winning option chosen by User 1 in Stage 1
   */
  winner: DinnerOption | null;
  /**
   * Strictly max 1 veto per game for User 2
   */
  user2VetoesRemaining: number;
  lastHandoffReason?: 'normal' | 'veto';
  isOpenInvite?: boolean;
  combinedFavorites?: HouseholdFavorite[];
  notice: string | null;
  exhausted: boolean;
  roundNumber: number;
  rerollCount?: number;
  keptPlaceIds?: string[];
  revision?: number;
  abandoned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdProfile {
  householdId: string;
  playerA: string;
  playerB: string;
  lastFirstPlayer: string | null;
  defaultTransport: TransportMode;
  preferredDeliveryApps?: DeliveryPlatformId[];
  updatedAt: string;
}

export interface RecentWinner {
  id: string;
  householdId: string;
  sessionId: string;
  placeId: string;
  name: string;
  cuisine: string;
  mealType: MealType;
  priceTier: PriceTier | null;
  address: string;
  mapsUrl: string;
  createdAt: string;
}

export interface HouseholdFavorite {
  id: string;
  householdId: string;
  placeId: string;
  name: string;
  cuisine: string;
  mealTypes: MealType[];
  priceTier: PriceTier;
  shortAddress: string;
  notes: string;
  source: 'uploaded' | 'learned';
  affinityScore: number;
  winsCount: number;
  keptCount: number;
  rerolledCount: number;
  updatedAt: string;
}
