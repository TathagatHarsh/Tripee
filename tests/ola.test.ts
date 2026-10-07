import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { olaToAddress, type OlaPlace } from '@/lib/location';
import { geocoder, getDistanceMatrix, ola, olaRouting, osrm, photon, router } from '@/lib/mapping';

/* Shapes from Ola's OpenAPI spec (maps.olakrutrim.com/openapi), Hyderabad values. */
const suggestion: OlaPlace = { description: 'Road No 36, Jubilee Hills, Hyderabad, Telangana, India', geometry: { location: { lat: 17.4307, lng: 78.4069 } }, place_id: 'ola-platform:abc' };
const reverse: OlaPlace = {
  name: 'Ratnadeep Supermarket',
  formatted_address: 'Ratnadeep Supermarket, Road No 36, Madhapur, Hyderabad, 500081, Telangana, India',
  geometry: { location: { lat: 17.4486, lng: 78.3908 } },
  address_components: [
    { long_name: 'India', types: [['country']] },
    { long_name: 'Telangana', types: ['administrative_area_level_1'] },
    { long_name: 'Hyderabad', types: ['locality'] },
    { long_name: 'Madhapur', types: ['sublocality'] },
    { long_name: '500081', types: ['postal_code'] },
  ],
  place_id: 'ola-platform:def',
};

describe('Ola results as delivery addresses', () => {
  it('maps a suggestion, leaving its parts to the pin lookup', () =>
    expect(olaToAddress(suggestion, 'search')).toEqual({ lat: 17.4307, lng: 78.4069, address: 'Road No 36, Jubilee Hills, Hyderabad, Telangana', locality: '', city: '', state: '', pincode: '', placeId: 'ola-platform:abc' }));

  it('cuts a reverse result to its street, dropping the landmark and parts with fields of their own', () =>
    expect(olaToAddress(reverse, 'reverse')).toMatchObject({ address: 'Road No 36', locality: 'Madhapur', city: 'Hyderabad', state: 'Telangana', pincode: '500081' }));

  it('skips a result without coordinates', () =>
    expect(olaToAddress({ description: 'Somewhere' }, 'search')).toBeNull());
});

describe('Ola providers', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('take over only when OLA_MAPS_API_KEY is set', () => {
    vi.stubEnv('GEOCODING_URL', '');
    vi.stubEnv('OLA_MAPS_API_KEY', '');
    expect([geocoder(), router()]).toEqual([photon, osrm]);
    vi.stubEnv('OLA_MAPS_API_KEY', 'k');
    expect([geocoder(), router()]).toEqual([ola, olaRouting]);
  });

  it('search signs the request and holds suggestions to Hyderabad', async () => {
    vi.stubEnv('OLA_MAPS_API_KEY', 'k');
    const sangareddy = { ...suggestion, geometry: { location: { lat: 17.62, lng: 78.08 } } };
    const fetch = vi.fn(async () => Response.json({ predictions: [suggestion, sangareddy], status: 'ok' }));
    vi.stubGlobal('fetch', fetch);
    expect(await ola.search('jubilee')).toHaveLength(1);
    const url = new URL(String((fetch.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toBe('/places/v1/autocomplete');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ input: 'jubilee', api_key: 'k', strictbounds: 'true' });
  });

  it('routing reads metres and seconds', async () => {
    vi.stubEnv('OLA_MAPS_API_KEY', 'k');
    const fetch = vi.fn(async () => Response.json({ status: 'OK', rows: [{ elements: [{ status: 'OK', distance: 3224, duration: 720 }] }, { elements: [{ status: 'OK', distance: 1000, duration: 60 }] }] }));
    vi.stubGlobal('fetch', fetch);
    const rows = await olaRouting.matrix([{ lat: 17.44, lng: 78.38 }, { lat: 17.4, lng: 78.5 }], { lat: 17.45, lng: 78.39 });
    expect(rows).toEqual([{ distanceKm: 3.224, estimatedMinutes: 12, source: 'ola' }, { distanceKm: 1, estimatedMinutes: 1, source: 'ola' }]);
    const url = new URL(String((fetch.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('origins')).toBe('17.44,78.38|17.4,78.5');
    expect(url.searchParams.get('destinations')).toBe('17.45,78.39');
  });

  it('a failed pair falls back to the marked estimate instead of ruling the bakery out', async () => {
    vi.stubEnv('OLA_MAPS_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'FAILURE', rows: [{ elements: [{ status: 'INTERNAL_SERVER_ERROR' }] }] })));
    const [route] = await getDistanceMatrix([{ lat: 17.44, lng: 78.38 }], { lat: 17.45, lng: 78.39 }, olaRouting);
    expect(route?.source).toBe('haversine_estimate');
  });

  it('reuses a route for the next ranking instead of paying for it again', async () => {
    const provider = { matrix: vi.fn(async (origins: unknown[]) => origins.map(() => ({ distanceKm: 2, estimatedMinutes: 6, source: 'ola' }))) };
    const shop = { lat: 17.41, lng: 78.44 }, home = { lat: 17.43, lng: 78.41 };
    await getDistanceMatrix([shop], home, provider);
    expect(await getDistanceMatrix([shop, shop], home, provider)).toEqual([{ distanceKm: 2, estimatedMinutes: 6, source: 'ola' }, { distanceKm: 2, estimatedMinutes: 6, source: 'ola' }]);
    expect(provider.matrix).toHaveBeenCalledTimes(1);
  });
});

describe('map library', () => {
  /* maplibre-gl 6 starts its worker from a separate file that Next/Turbopack does not
     serve ("Worker failed to load"), so the map draws its background and no streets.
     Stay on 5.x until that is fixed upstream or the worker URL is set explicitly. */
  it('stays on 5.x', () => {
    const { version } = JSON.parse(readFileSync('node_modules/maplibre-gl/package.json', 'utf8'));
    expect(version.split('.')[0]).toBe('5');
  });
});
