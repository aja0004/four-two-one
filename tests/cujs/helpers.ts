import { BrowserContext, Page } from '@playwright/test';
import {
  DinnerOption,
  GameSessionState,
  VerifiedPlaceCandidate,
} from '../../lib/types';

export const TEST_LOCATION = {
  lat: 51.539,
  lng: -0.1026,
  label: 'Islington, London',
};

export const MOCK_CANDIDATE_POOL: VerifiedPlaceCandidate[] = [
  {
    placeId: 'mock_trullo',
    name: 'Trullo',
    shortAddress: '300 St Paul’s Rd, Highbury',
    fullAddress: '300-302 St Paul’s Rd, London N1 2LH',
    lat: 51.5465,
    lng: -0.0987,
    distanceMeters: 620,
    rating: 4.7,
    userRatingCount: 1840,
    priceTier: '$$$',
    primaryType: 'Italian',
    editorialSummary: 'Hand-rolled pappardelle with beef shin ragu and charcoal-grilled fish.',
    googleMapsUri: 'https://maps.google.com/?cid=trullo',
    canOrderIn: true,
    canEatOut: true,
    deliverySupported: true,
    dineInSupported: true,
    takeoutSupported: true,
  },
  {
    placeId: 'mock_farang',
    name: 'Farang',
    shortAddress: '72 Highbury Park',
    fullAddress: '72 Highbury Park, London N5 2XE',
    lat: 51.554,
    lng: -0.097,
    distanceMeters: 950,
    rating: 4.6,
    userRatingCount: 1120,
    priceTier: '$$',
    primaryType: 'Thai',
    editorialSummary: 'Vibrant regional Thai sharing plates with crispy gai prik and aromatic curries.',
    googleMapsUri: 'https://maps.google.com/?cid=farang',
    canOrderIn: true,
    canEatOut: true,
    deliverySupported: true,
    dineInSupported: true,
    takeoutSupported: true,
  },
  {
    placeId: 'mock_smoking_goat',
    name: 'Smoking Goat',
    shortAddress: '64 Shoreditch High St',
    fullAddress: '64 Shoreditch High St, London E1 6JJ',
    lat: 51.5245,
    lng: -0.0772,
    distanceMeters: 1450,
    rating: 4.5,
    userRatingCount: 1650,
    priceTier: '$$',
    primaryType: 'Thai',
    editorialSummary: 'Late-night Thai barbecue famous for chili fish sauce wings and lardo fried rice.',
    googleMapsUri: 'https://maps.google.com/?cid=smoking_goat',
    canOrderIn: true,
    canEatOut: true,
    deliverySupported: true,
    dineInSupported: true,
    takeoutSupported: true,
  },
  {
    placeId: 'mock_padella',
    name: 'Padella',
    shortAddress: '1 Phipp St, Shoreditch',
    fullAddress: '1 Phipp St, London EC2A 4PS',
    lat: 51.5238,
    lng: -0.0811,
    distanceMeters: 1380,
    rating: 4.8,
    userRatingCount: 3420,
    priceTier: '$',
    primaryType: 'Italian',
    editorialSummary: 'Freshly rolled pici cacio e pepe and silky tagliarini at unbeatable value.',
    googleMapsUri: 'https://maps.google.com/?cid=padella',
    canOrderIn: true,
    canEatOut: true,
    deliverySupported: true,
    dineInSupported: true,
    takeoutSupported: true,
  },
  {
    placeId: 'mock_dishoom',
    name: 'Dishoom Upper Street',
    shortAddress: '31 Upper St, Angel',
    fullAddress: '31 Upper St, London N1 0PN',
    lat: 51.5352,
    lng: -0.1041,
    distanceMeters: 480,
    rating: 4.8,
    userRatingCount: 4120,
    priceTier: '$$',
    primaryType: 'Indian',
    editorialSummary: 'Signature house black daal, ruby chicken, and fluffy garlic naan delivered hot.',
    googleMapsUri: 'https://maps.google.com/?cid=dishoom',
    canOrderIn: true,
    canEatOut: true,
    deliverySupported: true,
    dineInSupported: true,
    takeoutSupported: true,
  },
  {
    placeId: 'mock_roti_king',
    name: 'Roti King',
    shortAddress: '97 Lower Marsh',
    fullAddress: '97 Lower Marsh, London N1',
    lat: 51.538,
    lng: -0.105,
    distanceMeters: 510,
    rating: 4.6,
    userRatingCount: 2100,
    priceTier: '$',
    primaryType: 'Malaysian',
    editorialSummary: 'Flaky, buttery roti canai paired with rich kari dhal and beef rendang.',
    googleMapsUri: 'https://maps.google.com/?cid=roti_king',
    canOrderIn: true,
    canEatOut: true,
    deliverySupported: true,
    dineInSupported: true,
    takeoutSupported: true,
  },
  {
    placeId: 'mock_blacklock',
    name: 'Blacklock Islington',
    shortAddress: '28-30 Rivington St',
    fullAddress: '28-30 Rivington St, London EC2A 3DZ',
    lat: 51.526,
    lng: -0.08,
    distanceMeters: 1200,
    rating: 4.7,
    userRatingCount: 1990,
    priceTier: '$$$',
    primaryType: 'Steakhouse',
    editorialSummary: 'Charcoal-seared chops and legendary white chocolate cheesecake.',
    googleMapsUri: 'https://maps.google.com/?cid=blacklock',
    canOrderIn: true,
    canEatOut: true,
    deliverySupported: true,
    dineInSupported: true,
    takeoutSupported: true,
  },
  {
    placeId: 'mock_bao',
    name: 'BAO Noodle Shop',
    shortAddress: '1 Redchurch St',
    fullAddress: '1 Redchurch St, London E2 7DJ',
    lat: 51.5242,
    lng: -0.0765,
    distanceMeters: 1500,
    rating: 4.5,
    userRatingCount: 1410,
    priceTier: '$$',
    primaryType: 'Taiwanese',
    editorialSummary: 'Pillow-soft Taiwanese steamed buns and rich beef soup noodles.',
    googleMapsUri: 'https://maps.google.com/?cid=bao',
    canOrderIn: true,
    canEatOut: true,
    deliverySupported: true,
    dineInSupported: true,
    takeoutSupported: true,
  },
  {
    placeId: 'mock_mangal_2',
    name: 'Mangal 2',
    shortAddress: '4 Stoke Newington Rd',
    fullAddress: '4 Stoke Newington Rd, London N16 8BH',
    lat: 51.549,
    lng: -0.0755,
    distanceMeters: 1620,
    rating: 4.7,
    userRatingCount: 1530,
    priceTier: '$$$',
    primaryType: 'Turkish',
    editorialSummary: 'Modern Anatolian ocakbasi grilling over live coals with sourdough pide.',
    googleMapsUri: 'https://maps.google.com/?cid=mangal_2',
    canOrderIn: true,
    canEatOut: true,
    deliverySupported: true,
    dineInSupported: true,
    takeoutSupported: true,
  },
  {
    placeId: 'mock_brutto',
    name: 'Brutto',
    shortAddress: '35-37 Greenhill Rents',
    fullAddress: '35-37 Greenhill Rents, London EC1M 6BN',
    lat: 51.5205,
    lng: -0.1018,
    distanceMeters: 1700,
    rating: 4.6,
    userRatingCount: 980,
    priceTier: '$$',
    primaryType: 'Italian',
    editorialSummary: 'Cozy Florentine trattoria serving peposo beef stew and tiramisu.',
    googleMapsUri: 'https://maps.google.com/?cid=brutto',
    canOrderIn: true,
    canEatOut: true,
    deliverySupported: true,
    dineInSupported: true,
    takeoutSupported: true,
  },
];

export function candidateToDinnerOption(
  c: VerifiedPlaceCandidate,
  mealType: 'order_in' | 'eat_out' = 'order_in'
): DinnerOption {
  return {
    kind: 'restaurant',
    placeId: c.placeId,
    name: c.name,
    mealType,
    cuisineLabel: c.primaryType || 'Restaurant',
    pitch: c.editorialSummary || `Delicious ${c.primaryType} spot near ${c.shortAddress}.`,
    rating: c.rating,
    userRatingCount: c.userRatingCount,
    priceTier: c.priceTier || '$$',
    shortAddress: c.shortAddress,
    fullAddress: c.fullAddress,
    distanceMeters: c.distanceMeters,
    estimatedTimeLabel: mealType === 'order_in' ? '25–35 min delivery' : '12 min drive',
    googleMapsUri: c.googleMapsUri,
    deliveryQuotes:
      mealType === 'order_in'
        ? [
            {
              platformId: 'deliveroo',
              label: 'Deliveroo',
              available: true,
              etaMinMinutes: 20,
              etaMaxMinutes: 30,
              etaLabel: '20–30 min',
              storeUrl: `https://deliveroo.co.uk/menu/london/islington/${c.placeId}`,
              source: 'smart_model',
              checkedAt: new Date().toISOString(),
            },
            {
              platformId: 'uber_eats',
              label: 'Uber Eats',
              available: true,
              etaMinMinutes: 25,
              etaMaxMinutes: 35,
              etaLabel: '25–35 min',
              storeUrl: `https://www.ubereats.com/gb/store/${c.placeId}`,
              source: 'smart_model',
              checkedAt: new Date().toISOString(),
            },
          ]
        : undefined,
  };
}

/**
 * Seeds localStorage on a Page so onboarding is pre-completed (or left empty if testing onboarding)
 * and location is immediately hydrated.
 */
export async function seedPlayerDevice(
  page: Page,
  options: {
    ownerName?: string;
    recentPartners?: string[];
    location?: { lat: number; lng: number; label: string };
    recentWinners?: Array<{
      id: string;
      householdId: string;
      sessionId: string;
      placeId: string;
      name: string;
      cuisine: string;
      mealType: 'order_in' | 'eat_out';
      priceTier: '$' | '$$' | '$$$' | '$$$$' | null;
      address: string;
      mapsUrl: string;
      createdAt: string;
    }>;
  } = {}
) {
  const {
    ownerName = 'Alex',
    recentPartners = ['Lauren'],
    location = TEST_LOCATION,
    recentWinners = [],
  } = options;

  await page.addInitScript(
    ({ ownerName, recentPartners, location, recentWinners }) => {
      if (ownerName) {
        window.localStorage.setItem('421_device_owner_name_v1', ownerName);
      }
      if (recentPartners) {
        window.localStorage.setItem(
          '421_recent_partners_v1',
          JSON.stringify(recentPartners)
        );
      }
      if (location) {
        window.localStorage.setItem(
          '421_last_known_location_v1',
          JSON.stringify(location)
        );
      }
      if (recentWinners && recentWinners.length > 0) {
        window.localStorage.setItem(
          '421_recent_winners_v1',
          JSON.stringify(recentWinners)
        );
      }
    },
    { ownerName, recentPartners, location, recentWinners }
  );
}

/**
 * Installs deterministic API route mocks on a Page or BrowserContext:
 * - `/api/geocode`
 * - `/api/options` (supports GET lookup + POST initial, reroll_all, reroll_unkept, manual inclusions, and exclusions)
 * - `/api/delivery-link`
 * - Supabase REST calls (`/rest/v1/*`) so tests never mutate production DB rows and can simulate 2-phone sync!
 */
export async function installDeterministicMocks(
  target: Page | BrowserContext,
  options: {
    sharedSessions?: Map<string, GameSessionState>;
    onSessionSynced?: (session: GameSessionState) => Promise<void> | void;
    forceExhaustedOnInitial?: boolean;
    failNextUpsertRef?: { count: number };
  } = {}
) {
  const sharedSessions = options.sharedSessions || new Map<string, GameSessionState>();

  // 1. Mock Geocode API & external reverse-geocoders
  await target.route('**/api/geocode**', async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get('q');
    if (q && q.toLowerCase().includes('nowhere_invalid_xyz')) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Location not found' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lat: TEST_LOCATION.lat,
        lng: TEST_LOCATION.lng,
        label: q ? `${q}, London` : TEST_LOCATION.label,
      }),
    });
  });

  await target.route('**/nominatim.openstreetmap.org/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await target.route('**/api.bigdatacloud.net/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        latitude: TEST_LOCATION.lat,
        longitude: TEST_LOCATION.lng,
        locality: 'Islington',
        city: 'London',
      }),
    });
  });

  // 2. Mock Delivery Link Resolver
  await target.route('**/api/delivery-link**', async (route) => {
    const url = new URL(route.request().url());
    const platform = url.searchParams.get('platform') || 'deliveroo';
    const name = (url.searchParams.get('name') || 'restaurant')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        storeUrl:
          platform === 'uber_eats'
            ? `https://www.ubereats.com/gb/store/${name}`
            : `https://deliveroo.co.uk/menu/london/islington/${name}`,
      }),
    });
  });

  // 3. Mock `/api/options` (GET lookup & POST curation/reroll)
  await target.route('**/api/options**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      const url = new URL(req.url());
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const matches = MOCK_CANDIDATE_POOL.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.primaryType || '').toLowerCase().includes(q)
      ).map((c) => ({
        placeId: c.placeId,
        name: c.name,
        cuisine: c.primaryType || 'Restaurant',
        priceTier: c.priceTier || '$$',
        shortAddress: c.shortAddress,
        pitch: c.editorialSummary || '',
      }));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: matches }),
      });
    }

    const body = req.postDataJSON() || {};
    if (options.forceExhaustedOnInitial) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          options: [],
          candidatePool: [],
          exhausted: true,
          notice:
            'No matching open restaurants found for your exact filters. Try broadening your search!',
        }),
      });
    }

    const excludedIds = new Set<string>([
      ...(body.excludedPlaceIds || []),
      ...(body.questionnaire?.excludeRecentWinners
        ? body.questionnaire?.excludedRecentWinnerIds || []
        : []),
      ...(body.currentVisibleIds || []),
    ]);
    const excludedNames = new Set<string>(
      (body.excludedNames || []).map((n: string) => n.toLowerCase().trim())
    );

    const requestedMealType: 'order_in' | 'eat_out' =
      body.questionnaire?.mealTypes?.includes('eat_out') &&
      !body.questionnaire?.mealTypes?.includes('order_in')
        ? 'eat_out'
        : 'order_in';

    const availablePool = MOCK_CANDIDATE_POOL.filter(
      (c) =>
        !excludedIds.has(c.placeId) &&
        !excludedNames.has(c.name.toLowerCase().trim())
    );

    // Handle partial reroll (`reroll_unkept`)
    if (body.mode === 'reroll_unkept') {
      const countNeeded = Array.isArray(body.targetMealTypes)
        ? body.targetMealTypes.length
        : 1;
      const picked = availablePool
        .slice(0, countNeeded)
        .map((c) => candidateToDinnerOption(c, requestedMealType));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          options: picked,
          candidatePool: availablePool,
          exhausted: availablePool.length < countNeeded,
          notice: null,
        }),
      });
    }

    // Handle initial / reroll_all (honoring manuallyIncludedPlaces first!)
    const manualPlaces: Array<{
      placeId: string;
      name: string;
      cuisine: string;
      priceTier?: '$' | '$$' | '$$$' | '$$$$';
      shortAddress?: string;
      pitch?: string;
    }> = body.questionnaire?.manuallyIncludedPlaces || [];

    const finalOptions: DinnerOption[] = [];
    const usedIds = new Set<string>();

    if (body.mode === 'initial') {
      for (const m of manualPlaces) {
        if (!excludedIds.has(m.placeId)) {
          usedIds.add(m.placeId);
          finalOptions.push({
            kind: 'restaurant',
            placeId: m.placeId,
            name: m.name,
            mealType: requestedMealType,
            cuisineLabel: m.cuisine || 'Favorite',
            pitch: m.pitch || `Locked-in favorite spot: ${m.name}.`,
            rating: 4.9,
            userRatingCount: 950,
            priceTier: m.priceTier || '$$',
            shortAddress: m.shortAddress || TEST_LOCATION.label,
            fullAddress: m.shortAddress || TEST_LOCATION.label,
            distanceMeters: 500,
            estimatedTimeLabel: '20–30 min delivery',
            googleMapsUri: `https://maps.google.com/?q=${encodeURIComponent(m.name)}`,
          });
        }
      }
    }

    for (const c of availablePool) {
      if (finalOptions.length >= 4) break;
      if (usedIds.has(c.placeId)) continue;
      usedIds.add(c.placeId);
      finalOptions.push(candidateToDinnerOption(c, requestedMealType));
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        options: finalOptions,
        candidatePool: availablePool,
        exhausted: finalOptions.length === 0,
        notice: null,
      }),
    });
  });

  // 4. Intercept Supabase REST calls so tests run hermetically and support in-memory session sharing
  await target.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();

    if (url.pathname.endsWith('/game_sessions')) {
      if (method === 'POST' || method === 'PATCH') {
        if (options.failNextUpsertRef && options.failNextUpsertRef.count > 0) {
          options.failNextUpsertRef.count -= 1;
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Transient network failure' }),
          });
        }
        const payload = req.postDataJSON();
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          if (row?.state?.id) {
            sharedSessions.set(row.state.id, row.state);
            if (options.onSessionSynced) {
              setTimeout(() => {
                void options.onSessionSynced?.(row.state);
              }, 20);
            }
          }
        }
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(rows),
        });
      }

      if (method === 'GET') {
        const idFilter = url.searchParams.get('id');
        const roomCodeFilter = url.searchParams.get('room_code');
        const allSessions = Array.from(sharedSessions.values());

        if (idFilter && idFilter.startsWith('eq.')) {
          const targetId = idFilter.replace('eq.', '');
          const match = sharedSessions.get(targetId);
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              match
                ? {
                    id: match.id,
                    phase: match.phase,
                    play_mode: match.playMode,
                    state: match,
                    updated_at: match.updatedAt,
                  }
                : null
            ),
          });
        }

        if (roomCodeFilter && roomCodeFilter.startsWith('eq.')) {
          const code = roomCodeFilter.replace('eq.', '');
          const match = allSessions.find((s) => s.roomCode === code && !s.abandoned);
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(match ? { state: match } : null),
          });
        }

        // Active household lobby query
        const activeRows = allSessions
          .filter((s) => !s.abandoned && s.phase !== 'WINNER' && s.playMode === 'two_phones')
          .map((s) => ({
            id: s.id,
            phase: s.phase,
            play_mode: s.playMode,
            state: s,
            updated_at: s.updatedAt,
          }));
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(activeRows),
        });
      }
    }

    // Default empty / success response for household_profiles, recent_winners, household_favorites
    if (method === 'GET') {
      const accept = req.headers()['accept'] || '';
      const isSingle = accept.includes('vnd.pgrst.object');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isSingle ? null : []),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}
