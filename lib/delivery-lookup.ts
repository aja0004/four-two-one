import { DeliveryPlatformId } from './types';

const CANONICAL_STORE_PATTERNS: Record<DeliveryPlatformId, RegExp> = {
  deliveroo:
    /https?:\/\/(?:www\.)?deliveroo\.[a-z.]+\/menu\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9%-]+/gi,
  uber_eats:
    /https?:\/\/(?:www\.)?ubereats\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?store\/[a-z0-9%-]+\/[a-zA-Z0-9_-]+/gi,
  just_eat:
    /https?:\/\/(?:www\.)?just-eat\.[a-z.]+\/restaurants-[a-z0-9%-]+/gi,
  doordash:
    /https?:\/\/(?:www\.)?doordash\.com\/(?:[a-z]{2}\/)?store\/[a-z0-9%-]+/gi,
  grubhub:
    /https?:\/\/(?:www\.)?grubhub\.com\/restaurant\/[a-z0-9%-]+/gi,
};

const SITE_SEARCH_FILTERS: Record<DeliveryPlatformId, string> = {
  deliveroo: 'site:deliveroo.co.uk/menu',
  uber_eats: 'site:ubereats.com/gb/store',
  just_eat: 'site:just-eat.co.uk',
  doordash: 'site:doordash.com/store',
  grubhub: 'site:grubhub.com/restaurant',
};

const STOP_WORDS = new Set([
  'the',
  'and',
  'restaurant',
  'restaurants',
  'bar',
  'kitchen',
  'cafe',
  'coffee',
  'house',
  'london',
  'uk',
  'ltd',
]);

function cleanRestaurantNameForSearch(name: string): string {
  return name
    .replace(/\b(restaurants?|ltd|limited|uk)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNeighborhoodOrCity(areaLabel: string): string {
  const parts = areaLabel
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  // Skip parts that start with a street number (e.g. "162 Essex Rd")
  const nonStreet = parts.find((p) => !/^\d+\s+/.test(p));
  return nonStreet || parts[parts.length - 1] || 'London';
}

/**
 * Checks whether a URL is Already a direct restaurant storefront URL (rather than a generic search link).
 */
export function isDirectStorefrontUrl(
  platformId: DeliveryPlatformId,
  url?: string | null
): boolean {
  if (!url) return false;
  if (/\/RK=\d+/i.test(url) || /\/RS=/i.test(url)) return false;
  const pattern = CANONICAL_STORE_PATTERNS[platformId];
  if (!pattern) return false;
  pattern.lastIndex = 0;
  return pattern.test(url);
}

/**
 * Builds the local `/api/delivery-link` fallback endpoint that resolves and 302-redirects
 * to the restaurant's storefront page on tap if it wasn't pre-resolved.
 */
export function buildFallbackDeliveryRedirectUrl(
  platformId: DeliveryPlatformId,
  restaurantName: string,
  areaLabel: string
): string {
  const cleanArea = extractNeighborhoodOrCity(areaLabel);
  const params = new URLSearchParams({
    platform: platformId,
    name: restaurantName,
    area: cleanArea,
  });
  return `/api/delivery-link?${params.toString()}`;
}

/**
 * Builds a DuckDuckGo "I'm Feeling Ducky" (`\`) instant-redirect URL that forwards
 * directly to the #1 storefront page for the restaurant.
 */
export function buildInstantDuckyRedirectUrl(
  platformId: DeliveryPlatformId,
  restaurantName: string,
  areaLabel: string
): string {
  const cleanArea = extractNeighborhoodOrCity(areaLabel);
  const cleanName = cleanRestaurantNameForSearch(restaurantName) || restaurantName;
  const siteHint =
    platformId === 'deliveroo'
      ? 'site:deliveroo.co.uk/menu'
      : platformId === 'uber_eats'
      ? 'site:ubereats.com/gb/store'
      : platformId === 'just_eat'
      ? 'site:just-eat.co.uk'
      : platformId === 'doordash'
      ? 'site:doordash.com/store'
      : 'site:grubhub.com/restaurant';

  const query = `\\${siteHint} ${cleanName} ${cleanArea}`.trim();
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}

function getSignificantNameTokens(restaurantName: string): string[] {
  return restaurantName
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function cleanMatchedStoreUrl(rawUrl: string): string {
  let cleaned = rawUrl.trim();
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // ignore malformed percent encoding
  }
  // Strip Yahoo tracking suffixes (/RK=2/RS=...)
  cleaned = cleaned.replace(/\/RK=\d+.*$/i, '');
  // Strip trailing punctuation, query strings, or tracking fragments
  cleaned = cleaned.split(/[?#&"'\s<>]/)[0] || cleaned;
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned;
}

function pickBestMatchingStoreUrl(
  platformId: DeliveryPlatformId,
  rawHtml: string,
  restaurantName: string
): string | null {
  // Decode percent-encoded URLs inside redirect wrappers (e.g. Yahoo RU=.../RK=2 or DDG uddg=...)
  let decodedBlob = rawHtml;
  try {
    decodedBlob =
      rawHtml +
      '\n' +
      rawHtml.replace(/https?%3A%2F%2F[^\s"'&<>]+/gi, (m) => {
        const withoutYahooSuffix = m.split(/\/RK=\d+/i)[0] || m;
        try {
          return decodeURIComponent(withoutYahooSuffix);
        } catch {
          return withoutYahooSuffix;
        }
      });
  } catch {
    // ignore
  }

  const pattern = new RegExp(
    CANONICAL_STORE_PATTERNS[platformId].source,
    'gi'
  );
  const matches = decodedBlob.match(pattern);
  if (!matches || matches.length === 0) return null;

  const tokens = getSignificantNameTokens(restaurantName);
  const uniqueUrls = Array.from(
    new Set(matches.map((m) => cleanMatchedStoreUrl(m)))
  ).filter((u) => {
    // Ignore generic category or search paths
    const lower = u.toLowerCase();
    if (lower.includes('/search') || lower.includes('/cuisine/')) return false;
    return true;
  });

  if (uniqueUrls.length === 0) return null;
  if (tokens.length === 0) return uniqueUrls[0];

  // Score each candidate URL by how many significant tokens from restaurantName appear in its path slug
  let bestUrl: string | null = null;
  let bestScore = 0;

  for (const candidateUrl of uniqueUrls) {
    const slugLower = candidateUrl.toLowerCase().replace(/[^a-z0-9]/g, '');
    let score = 0;
    for (const token of tokens) {
      if (slugLower.includes(token)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestUrl = candidateUrl;
    }
  }

  return bestScore > 0 ? bestUrl : null;
}

async function searchYahooForStoreUrl(
  platformId: DeliveryPlatformId,
  restaurantName: string,
  cleanArea: string,
  timeoutMs: number
): Promise<{ storeUrl: string | null; etaRange: { min: number; max: number } | null }> {
  const siteFilter = SITE_SEARCH_FILTERS[platformId];
  const cleanName = cleanRestaurantNameForSearch(restaurantName) || restaurantName;
  const query = `${siteFilter} ${cleanName} ${cleanArea}`.trim();
  const searchUrl = `https://uk.search.yahoo.com/search?p=${encodeURIComponent(
    query
  )}&n=5`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { storeUrl: null, etaRange: null };

    const html = await res.text();
    const storeUrl = pickBestMatchingStoreUrl(platformId, html, restaurantName);

    let etaRange: { min: number; max: number } | null = null;
    const etaMatch = html.match(
      /(\d{2})\s*(?:-|–|to)\s*(\d{2})\s*(?:min|mins|minutes)/i
    );
    if (etaMatch) {
      const min = Number(etaMatch[1]);
      const max = Number(etaMatch[2]);
      if (min >= 10 && max <= 90 && max > min && max - min <= 30) {
        etaRange = { min, max };
      }
    }

    return { storeUrl, etaRange };
  } catch {
    clearTimeout(timer);
    return { storeUrl: null, etaRange: null };
  }
}

async function searchDuckDuckGoForStoreUrl(
  platformId: DeliveryPlatformId,
  restaurantName: string,
  cleanArea: string,
  timeoutMs: number
): Promise<{ storeUrl: string | null; etaRange: { min: number; max: number } | null }> {
  const siteFilter = SITE_SEARCH_FILTERS[platformId];
  const cleanName = cleanRestaurantNameForSearch(restaurantName) || restaurantName;
  const query = `${siteFilter} ${cleanName} ${cleanArea}`.trim();
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
    query
  )}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { storeUrl: null, etaRange: null };

    const html = await res.text();
    const storeUrl = pickBestMatchingStoreUrl(platformId, html, restaurantName);

    let etaRange: { min: number; max: number } | null = null;
    const etaMatch = html.match(
      /(\d{2})\s*(?:-|–|to)\s*(\d{2})\s*(?:min|mins|minutes)/i
    );
    if (etaMatch) {
      const min = Number(etaMatch[1]);
      const max = Number(etaMatch[2]);
      if (min >= 10 && max <= 90 && max > min && max - min <= 30) {
        etaRange = { min, max };
      }
    }

    return { storeUrl, etaRange };
  } catch {
    clearTimeout(timer);
    return { storeUrl: null, etaRange: null };
  }
}

/**
 * Resolves the direct canonical storefront URL (e.g. `https://deliveroo.co.uk/menu/...`
 * or `https://www.ubereats.com/gb/store/...`) for a restaurant + neighborhood.
 */
export async function resolveDirectStorefrontUrl(
  platformId: DeliveryPlatformId,
  restaurantName: string,
  areaLabel: string,
  timeoutMs = 1800
): Promise<{
  storeUrl: string | null;
  etaRange: { min: number; max: number } | null;
}> {
  const cleanArea = extractNeighborhoodOrCity(areaLabel);

  const [yahooRes, ddgRes] = await Promise.all([
    searchYahooForStoreUrl(platformId, restaurantName, cleanArea, timeoutMs),
    searchDuckDuckGoForStoreUrl(platformId, restaurantName, cleanArea, timeoutMs),
  ]);

  let storeUrl = yahooRes.storeUrl || ddgRes.storeUrl || null;
  let etaRange = yahooRes.etaRange || ddgRes.etaRange || null;

  if (!storeUrl && cleanArea.toLowerCase() !== 'london') {
    const [yahooBroader, ddgBroader] = await Promise.all([
      searchYahooForStoreUrl(platformId, restaurantName, 'London', timeoutMs),
      searchDuckDuckGoForStoreUrl(platformId, restaurantName, 'London', timeoutMs),
    ]);
    storeUrl = yahooBroader.storeUrl || ddgBroader.storeUrl || null;
    etaRange = etaRange || yahooBroader.etaRange || ddgBroader.etaRange || null;
  }

  return { storeUrl, etaRange };
}
