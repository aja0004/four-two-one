import { NextRequest, NextResponse } from 'next/server';

const NOMINATIM_USER_AGENT = '4-2-1-DinnerDecisionApp/1.0 (iOS-PWA)';

interface AddressComponent {
  longText?: string;
  shortText?: string;
  long_name?: string;
  short_name?: string;
  types?: string[];
}

function formatReadableLabelFromGoogleComponents(
  components: AddressComponent[],
  fallbackFormatted?: string
): string {
  const getComp = (type: string) => {
    const found = components.find((c) => c.types?.includes(type));
    return found?.longText || found?.long_name || found?.shortText || found?.short_name || '';
  };

  const neighborhood =
    getComp('neighborhood') ||
    getComp('sublocality_level_1') ||
    getComp('sublocality') ||
    getComp('administrative_area_level_3') ||
    getComp('postal_code_prefix');
  const city =
    getComp('locality') ||
    getComp('postal_town') ||
    getComp('administrative_area_level_2');
  const state = getComp('administrative_area_level_1');

  if (neighborhood && city && neighborhood !== city) {
    return `${neighborhood}, ${city}`;
  }
  if (city && state && city !== state) {
    return `${city}, ${state}`;
  }
  if (neighborhood && state && neighborhood !== state) {
    return `${neighborhood}, ${state}`;
  }
  if (city) {
    return city;
  }
  if (fallbackFormatted) {
    return fallbackFormatted.replace(/, (USA|UK|United Kingdom)$/, '');
  }
  return 'Current Area';
}

function formatReadableLabelFromNominatim(addr?: Record<string, string>, displayName?: string): string {
  if (addr) {
    const neighborhood =
      addr.neighbourhood ||
      addr.suburb ||
      addr.quarter ||
      addr.borough ||
      addr.hamlet ||
      addr.village;
    const city =
      addr.city ||
      addr.town ||
      addr.municipality ||
      addr.county;
    const state = addr.state;

    if (neighborhood && city && neighborhood !== city) {
      return `${neighborhood}, ${city}`;
    }
    if (city && state) {
      return `${city}, ${state}`;
    }
    if (neighborhood && state) {
      return `${neighborhood}, ${state}`;
    }
  }

  if (displayName) {
    const parts = displayName
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}, ${parts[1]}`;
    }
    return parts[0] || 'Selected Area';
  }

  return 'Selected Area';
}

async function reverseGeocode(lat: number, lng: number) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();

  // 1. Try Google Places API (New) searchNearby first (works with Places API (New) key restriction!)
  if (apiKey && !apiKey.includes('your_google_places_api_key')) {
    try {
      const placesRes = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.addressComponents,places.shortFormattedAddress,places.formattedAddress',
        },
        body: JSON.stringify({
          maxResultCount: 1,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: 500.0,
            },
          },
        }),
        cache: 'no-store',
      });

      if (placesRes.ok) {
        const data = await placesRes.json();
        const place = data?.places?.[0];
        if (place?.addressComponents) {
          const label = formatReadableLabelFromGoogleComponents(
            place.addressComponents,
            place.shortFormattedAddress || place.formattedAddress
          );
          if (label && label !== 'Current Area') {
            return { lat, lng, label };
          }
        }
      }
    } catch {
      // Fall through to Google Geocoding / BigDataCloud / Nominatim
    }

    // 2. Try Google Geocoding API if enabled on the key
    try {
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(
        `${lat},${lng}`
      )}&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(googleUrl, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
          const primary = data.results[0];
          const label = formatReadableLabelFromGoogleComponents(
            primary.address_components || [],
            primary.formatted_address
          );
          return { lat, lng, label };
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 3. Free BigDataCloud client-friendly reverse geocoder (no API key required)
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(
      String(lat)
    )}&longitude=${encodeURIComponent(String(lng))}&localityLanguage=en`;
    const res = await fetch(bdcUrl, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const infoAdmin = Array.isArray(data.localityInfo?.administrative)
        ? data.localityInfo.administrative
        : [];
      // Pick the most granular neighborhood/borough name (e.g. Islington, Camden, Westminster)
      const granularAdmin = [...infoAdmin]
        .reverse()
        .find(
          (item: { name?: string; order?: number }) =>
            item?.name &&
            item.name !== data.city &&
            item.name !== data.principalSubdivision &&
            item.name !== data.countryName
        )?.name;

      const locality = granularAdmin || data.locality || '';
      const city = data.city || data.principalSubdivision || '';
      if (locality && city && locality !== city) {
        return { lat, lng, label: `${locality}, ${city}` };
      }
      if (locality) {
        return { lat, lng, label: locality };
      }
      if (city) {
        return { lat, lng, label: city };
      }
    }
  } catch {
    // Fallback to Nominatim below
  }

  // 4. Transparent fallback to OpenStreetMap Nominatim
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      String(lat)
    )}&lon=${encodeURIComponent(String(lng))}&zoom=14&addressdetails=1`;
    const res = await fetch(nomUrl, {
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      const label = formatReadableLabelFromNominatim(data.address, data.display_name);
      return { lat, lng, label };
    }
  } catch {
    // Fallback to coordinate label
  }

  return {
    lat,
    lng,
    label: `${lat.toFixed(3)}, ${lng.toFixed(3)}`,
  };
}

async function forwardGeocode(query: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();

  // 1. Try Google Places API (New) Text Search first (since user definitely has Places API (New) enabled!)
  if (apiKey && !apiKey.includes('your_google_places_api_key')) {
    try {
      const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.addressComponents',
        },
        body: JSON.stringify({
          textQuery: query,
          maxResultCount: 1,
        }),
        cache: 'no-store',
      });

      if (placesRes.ok) {
        const data = await placesRes.json();
        const place = data?.places?.[0];
        if (place?.location?.latitude && place?.location?.longitude) {
          const lat = Number(place.location.latitude);
          const lng = Number(place.location.longitude);
          const label = place.addressComponents
            ? formatReadableLabelFromGoogleComponents(
                place.addressComponents,
                place.shortFormattedAddress || place.formattedAddress
              )
            : (place.displayName?.text || place.shortFormattedAddress || query);
          return { lat, lng, label };
        }
      }
    } catch {
      // Fall through to Google Geocoding / Nominatim
    }

    // Try standard Google Geocoding API
    try {
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        query
      )}&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(googleUrl, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
          const first = data.results[0];
          const loc = first.geometry?.location;
          if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
            const label = formatReadableLabelFromGoogleComponents(
              first.address_components || [],
              first.formatted_address
            );
            return { lat: loc.lat, lng: loc.lng, label };
          }
        }
      }
    } catch {
      // Fall through to Nominatim
    }
  }

  // 2. Transparent fallback to OpenStreetMap Nominatim
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      query
    )}&limit=1&addressdetails=1`;
    const res = await fetch(nomUrl, {
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        const top = results[0];
        const lat = Number(top.lat);
        const lng = Number(top.lon);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          const label = formatReadableLabelFromNominatim(top.address, top.display_name);
          return { lat, lng, label };
        }
      }
    }
  } catch {
    // Fallback below if offline
  }

  return {
    lat: 40.7336,
    lng: -74.0027,
    label: query,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');

  try {
    if (q) {
      const result = await forwardGeocode(q);
      return NextResponse.json(result);
    }

    if (latStr && lngStr) {
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
      }
      const result = await reverseGeocode(lat, lng);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: 'Provide either ?q=address or ?lat=...&lng=...' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to resolve location. Please try another city or ZIP code.',
      },
      { status: 404 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.query === 'string' && body.query.trim()) {
      const result = await forwardGeocode(body.query.trim());
      return NextResponse.json(result);
    }
    if (typeof body.lat === 'number' && typeof body.lng === 'number') {
      const result = await reverseGeocode(body.lat, body.lng);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: 'Invalid geocode request payload' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to resolve location. Please try another address or ZIP.',
      },
      { status: 404 }
    );
  }
}
