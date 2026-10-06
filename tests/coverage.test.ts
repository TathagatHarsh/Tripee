import { describe, expect, it } from 'vitest';
import { coversPoint, serviceAreaCovers, type CoverageVendor } from '@/lib/coverage';
import { haversine } from '@/lib/assignmentRules';

const pin = { lat: 17.431, lng: 78.401 };
const near: CoverageVendor = { latitude: 17.43, longitude: 78.4, serviceRadiusKm: 10, isActive: true, isAcceptingOrders: true };

describe('whether any bakery covers a delivery pin', () => {
  it('covers a pin inside a radius', () => expect(coversPoint([near], pin)).toBe(true));

  it('covers a pin exactly on the radius', () => {
    const edge = haversine({ lat: near.latitude!, lng: near.longitude! }, pin);
    expect(coversPoint([{ ...near, serviceRadiusKm: edge }], pin)).toBe(true);
  });

  it('does not cover a pin 28 km away', () => expect(coversPoint([{ ...near, latitude: 17.68 }], pin)).toBe(false));
  it('ignores an inactive bakery', () => expect(coversPoint([{ ...near, isActive: false }], pin)).toBe(false));
  it('ignores a bakery not accepting orders', () => expect(coversPoint([{ ...near, isAcceptingOrders: false }], pin)).toBe(false));
  it('ignores a bakery without coordinates', () => expect(coversPoint([{ ...near, latitude: null, longitude: null }], pin)).toBe(false));
  it('covers nothing with no bakeries', () => expect(coversPoint([], pin)).toBe(false));
});

describe('a whole-city service area, for demos before bakeries are mapped', () => {
  const banjara = { lat: 17.4126, lng: 78.4392 };
  const connaughtPlace = { lat: 28.6315, lng: 77.2167 };
  it('covers any pin inside Hyderabad when the area is set', () => expect(serviceAreaCovers(banjara, 'hyderabad')).toBe(true));
  it('never covers a pin outside Hyderabad', () => expect(serviceAreaCovers(connaughtPlace, 'hyderabad')).toBe(false));
  it('covers nothing when no area is set', () => expect(serviceAreaCovers(banjara, undefined)).toBe(false));
});
