import { DeliveryTiming, MealType, TransportMode, TravelMinutes } from './types';

const EARTH_RADIUS_METERS = 6371000;

export interface BoundingBox {
  low: {
    latitude: number;
    longitude: number;
  };
  high: {
    latitude: number;
    longitude: number;
  };
}

/**
 * Computes a latitude/longitude rectangle bounding box from a center point and radius in meters.
 * Required by Google Places API (New) `places:searchText`, where `locationRestriction` ONLY accepts `rectangle`
 * (passing `circle` to `locationRestriction` throws a 400 error).
 */
export function boundingBoxFromCenter(
  lat: number,
  lng: number,
  radiusMeters: number
): BoundingBox {
  const latDelta = (radiusMeters / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngDelta =
    cosLat > 0.0001
      ? (radiusMeters / (EARTH_RADIUS_METERS * cosLat)) * (180 / Math.PI)
      : 180;

  const minLat = Math.max(-89.9, lat - latDelta);
  const maxLat = Math.min(89.9, lat + latDelta);
  const minLng = Math.max(-179.9, lng - lngDelta);
  const maxLng = Math.min(179.9, lng + lngDelta);

  return {
    low: {
      latitude: Number(minLat.toFixed(6)),
      longitude: Number(minLng.toFixed(6)),
    },
    high: {
      latitude: Number(maxLat.toFixed(6)),
      longitude: Number(maxLng.toFixed(6)),
    },
  };
}

/**
 * Exact Haversine distance in meters between two coordinates.
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Eat Out radius (meters):
 * - walk: minutes * 75 (approx 4.5 km/h walking speed)
 * - transit: minutes * 250 (accounts for walk + wait + transit)
 * - drive: minutes * 450 (realistic urban/suburban traffic average, clamped 800m..20000m)
 */
export function computeEatOutRadiusMeters(
  transportMode: TransportMode,
  minutes: TravelMinutes
): number {
  if (transportMode === 'walk') {
    return minutes * 75;
  }
  if (transportMode === 'transit') {
    return minutes * 250;
  }
  return Math.min(20000, Math.max(800, minutes * 450));
}

/**
 * Order In delivery proximity heuristic (meters):
 * - <30 min: 2500m
 * - <45 min: 5000m
 * - <60 min: 8000m
 * - No rush: 11000m
 */
export function computeOrderInRadiusMeters(timing: DeliveryTiming): number {
  switch (timing) {
    case 'under_30':
      return 2500;
    case 'under_45':
      return 5000;
    case 'under_60':
      return 8000;
    case 'no_rush':
    default:
      return 11000;
  }
}

export function formatDistanceMiles(distanceMeters: number): string {
  const miles = distanceMeters / 1609.34;
  if (miles < 0.15) return '0.1 mi';
  return `${miles.toFixed(1)} mi`;
}

/**
 * Cuisine-specific kitchen prep time (minutes) + peak dinner hour multiplier
 * + road/courier urban routing factor (1.32x straight-line Haversine distance).
 */
export function computeSmartDeliveryEtaRange(
  distanceMeters: number,
  cuisineLabel?: string,
  priceTier?: string | null,
  platformId?: string
): { min: number; max: number } {
  const cLower = (cuisineLabel || '').toLowerCase();

  // 1. Cuisine & price-tier kitchen prep time baseline (minutes)
  let prepMinutes = 14;
  if (
    cLower.includes('sandwich') ||
    cLower.includes('healthy') ||
    cLower.includes('bowl') ||
    cLower.includes('burger') ||
    cLower.includes('mexican') ||
    cLower.includes('taco')
  ) {
    prepMinutes = 11;
  } else if (
    cLower.includes('pizza') ||
    cLower.includes('thai') ||
    cLower.includes('chinese') ||
    cLower.includes('vietnamese') ||
    cLower.includes('turkish') ||
    cLower.includes('mediterranean')
  ) {
    prepMinutes = 14;
  } else if (
    cLower.includes('indian') ||
    cLower.includes('italian') ||
    cLower.includes('korean') ||
    cLower.includes('sushi') ||
    cLower.includes('japanese') ||
    cLower.includes('seafood')
  ) {
    prepMinutes = 17;
  }

  if (priceTier === '$$$' || priceTier === '$$$$') {
    prepMinutes += 4;
  }

  // 2. Actual urban courier routing distance (~1.32x straight-line Haversine)
  // Average e-bike / moped courier speed in urban traffic ~19 km/h (~315m/min) + 3 min handoff
  const routedMeters = distanceMeters * 1.32;
  const courierMinutes = 3 + routedMeters / 315;

  // 3. Peak dinner rush factor (Fri/Sat 18:30–21:00 or Sun–Thu 19:00–20:30)
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const day = now.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const isWeekendPeak = (day === 5 || day === 6) && hour >= 18.5 && hour <= 21.0;
  const isWeekdayPeak = hour >= 19.0 && hour <= 20.5;
  const rushBuffer = isWeekendPeak ? 6 : isWeekdayPeak ? 3 : 0;

  // 4. Platform-specific dispatch characteristics
  const platformOffset =
    platformId === 'deliveroo'
      ? -1
      : platformId === 'uber_eats'
      ? 0
      : platformId === 'just_eat'
      ? 3
      : 1;

  const rawMin = Math.round(prepMinutes + courierMinutes + rushBuffer + platformOffset);
  const clampedMin = Math.max(15, Math.min(65, rawMin));
  const clampedMax = clampedMin + 10;

  return { min: clampedMin, max: clampedMax };
}

/**
 * Computes a clean estimated time label prefixed with `~` from smart routing + cuisine prep model.
 */
export function formatEstimatedTimeLabel(
  mealType: MealType,
  distanceMeters: number,
  transportMode: TransportMode,
  deliveryTiming: DeliveryTiming,
  cuisineLabel?: string,
  priceTier?: string | null
): string {
  const milesStr = formatDistanceMiles(distanceMeters);

  if (mealType === 'order_in') {
    const { min, max } = computeSmartDeliveryEtaRange(
      distanceMeters,
      cuisineLabel,
      priceTier
    );
    if (deliveryTiming === 'under_30' && min > 25) {
      return `~20–30m delivery • ${milesStr}`;
    }
    return `~${min}–${max}m delivery • ${milesStr}`;
  }

  // Eat Out travel estimate (with 1.28x street grid factor vs straight line)
  const routedMeters = distanceMeters * 1.28;
  if (transportMode === 'walk') {
    const mins = Math.max(2, Math.round(routedMeters / 80));
    return `~${mins} min walk • ${milesStr}`;
  }

  if (transportMode === 'transit') {
    const mins = Math.max(6, Math.round(4 + routedMeters / 270));
    return `~${mins} min transit • ${milesStr}`;
  }

  // drive
  const mins = Math.max(3, Math.round(2 + routedMeters / 480));
  return `~${mins} min drive • ${milesStr}`;
}
