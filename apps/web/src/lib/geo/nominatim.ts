import { z } from 'zod';

/**
 * OpenStreetMap's free geocoder (Nominatim), called straight from the browser: no API key, no
 * account. Its usage policy allows light, user-initiated use only (at most 1 request per second,
 * no search-as-you-type), so callers search on submit and reverse-geocode once per pin drop.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
const BASE_URL = 'https://nominatim.openstreetmap.org';

const addressSchema = z
  .object({
    road: z.string().optional(),
    neighbourhood: z.string().optional(),
    suburb: z.string().optional(),
    village: z.string().optional(),
    town: z.string().optional(),
    city: z.string().optional(),
    county: z.string().optional(),
    state_district: z.string().optional(),
    state: z.string().optional(),
  })
  .partial();

const resultSchema = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  display_name: z.string(),
  address: addressSchema.optional(),
});

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface GeocodeResult extends GeoPoint {
  /** The full, human-readable address OSM has for this point. */
  label: string;
  /** Street-level part, suitable for an "Address" field. */
  street: string;
  city: string;
}

function toResult(raw: z.infer<typeof resultSchema>): GeocodeResult {
  const a = raw.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.county ?? a.state_district ?? '';
  const street = [a.road, a.neighbourhood ?? a.suburb].filter(Boolean).join(', ');
  return {
    latitude: raw.lat,
    longitude: raw.lon,
    label: raw.display_name,
    street: street || raw.display_name.split(',').slice(0, 2).join(',').trim(),
    city,
  };
}

async function getJson(path: string, params: Record<string, string>, signal?: AbortSignal) {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries({
    format: 'jsonv2',
    addressdetails: '1',
    // English names where OSM has them (the header alone is not always honoured).
    'accept-language': 'en',
    ...params,
  })) {
    url.searchParams.set(key, value);
  }
  // A third-party service, not our API, so the API client (base URL, envelope, auth) does not apply.
  // eslint-disable-next-line no-restricted-globals
  const response = await fetch(url, { signal, headers: { 'Accept-Language': 'en' } });
  if (!response.ok) throw new Error(`Map search failed (HTTP ${response.status})`);
  return (await response.json()) as unknown;
}

/** Places matching a free-text query, best first, limited to India. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const json = await getJson('/search', { q: query, countrycodes: 'in', limit: '5' }, signal);
  const parsed = z.array(resultSchema).safeParse(json);
  return parsed.success ? parsed.data.map(toResult) : [];
}

/** The address at a point, or null when OSM has nothing there. */
export async function reverseGeocode(
  point: GeoPoint,
  signal?: AbortSignal,
): Promise<GeocodeResult | null> {
  const json = await getJson(
    '/reverse',
    { lat: String(point.latitude), lon: String(point.longitude), zoom: '18' },
    signal,
  );
  const parsed = resultSchema.safeParse(json);
  return parsed.success ? toResult(parsed.data) : null;
}
