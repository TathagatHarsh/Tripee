import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { photonToAddress, type PhotonFeature } from '@/lib/location';
import { geocoder, nominatim, photon } from '@/lib/mapping';

/* Live Photon responses for Hyderabad, recorded 2026-10-06. */
const search: PhotonFeature = { geometry: { coordinates: [78.4322629, 17.4140777] }, properties: { housenumber: 'Plot No 70', street: 'Road No 12 Koushik Co-Operative Society, Banjara Hills', district: 'Ward 93 Banjara Hills', locality: 'Bhavani Nagar', city: 'Hyderabad', state: 'Telangana', postcode: '500034', countrycode: 'IN', osm_type: 'N', osm_id: 1 } };
const reverse: PhotonFeature = { geometry: { coordinates: [78.4392, 17.4126] }, properties: { name: 'Gowri Shankar Nagar(Mini)', street: 'Banjara Hills Road Number 11', locality: 'Gaffar Khan Colony', district: 'Ward 93 Banjara Hills', county: 'Shaikpet mandal', state: 'Telangana', postcode: '500034', countrycode: 'IN', osm_type: 'N', osm_id: 11985840880 } };

describe('Photon results as delivery addresses', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('maps a search hit', () =>
    expect(photonToAddress(search, 'search')).toMatchObject({ lat: 17.4140777, lng: 78.4322629, locality: 'Bhavani Nagar', city: 'Hyderabad', pincode: '500034', placeId: 'N1' }));

  it('ignores the POI name on reverse and defaults city inside the bbox', () => {
    const a = photonToAddress(reverse, 'reverse')!;
    expect(a.address).not.toContain('Gowri Shankar');
    expect(a.address).toContain('Banjara Hills Road Number 11');
    expect(a.city).toBe('Hyderabad');
  });

  it('strips the ward prefix when locality is missing', () =>
    expect(photonToAddress({ ...reverse, properties: { ...reverse.properties, locality: undefined } }, 'reverse')!.locality).toBe('Banjara Hills'));

  it('drops results outside India', () =>
    expect(photonToAddress({ ...search, properties: { ...search.properties, countrycode: 'PK' } }, 'search')).toBeNull());

  it('uses Nominatim only when GEOCODING_URL is set', () => {
    vi.stubEnv('GEOCODING_URL', 'https://geo.example');
    expect(geocoder()).toBe(nominatim);
    vi.stubEnv('GEOCODING_URL', '');
    expect(geocoder()).toBe(photon);
  });
});
