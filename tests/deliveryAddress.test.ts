import { describe, expect, it } from 'vitest';
import { FulfillmentInput } from '@/lib/checkout';
import { ProductionSpec, resolveProductionSpec, productionSpecFromConfig } from '@/lib/productionSpec';
import { DEFAULT_CAKE } from '@/lib/schema';
import { checkDeliveryServiceability } from '@/lib/delivery';
import { DEFAULT_SNAPSHOT } from '@/lib/catalogDefaults';
const manual = { method: 'delivery', slot: 'standard', recipientName: 'Test Recipient', addressLine1: 'Flat 402', city: 'Hyderabad', state: 'Telangana', pincode: '500081', requestedDate: '2026-12-01', requestedWindow: 'Daytime', source: 'manual' };
const pinned = { ...manual, source: 'map', location: { lat: 17.431, lng: 78.401, placeId: 'N1' } };
describe('delivery and specification boundaries', () => {
  it('refuses a delivery address without a map pin', () => {
    const issue = FulfillmentInput.safeParse(manual).error?.issues.find((i) => i.path[0] === 'location');
    expect(issue?.message).toBe('Choose your delivery location on the map.');
  });
  it('accepts a pickup without a map pin', () => {
    expect(FulfillmentInput.safeParse({ method: 'pickup', slot: 'pickup', recipientName: 'Test Recipient', requestedDate: '2026-12-01', requestedWindow: 'Daytime' }).success).toBe(true);
  });
  it('takes an optional 10-digit receiver phone', () => {
    expect(FulfillmentInput.safeParse({ ...pinned, recipientPhone: '9876543210' }).success).toBe(true);
    expect(FulfillmentInput.safeParse({ ...pinned, recipientPhone: '98765' }).success).toBe(false);
    expect(FulfillmentInput.safeParse(pinned).success).toBe(true);
  });
  it('accepts a two-character flat number', () => {
    expect(FulfillmentInput.safeParse({ ...pinned, addressLine1: '4B' }).success).toBe(true);
  });
  it('accepts a structured address with a pin', () => {
    expect(FulfillmentInput.safeParse(pinned).success).toBe(true);
    expect(FulfillmentInput.safeParse({...pinned,pincode:''}).success).toBe(false);
    expect(FulfillmentInput.safeParse({...manual,location:{lat:100,lng:78,placeId:''}}).success).toBe(false);
    expect(FulfillmentInput.safeParse({...manual,source:'trusted'}).success).toBe(false);
  });
  it('never uses coordinates to promise unconfigured delivery', () => {
    expect(checkDeliveryServiceability({postalCode:'110001', latitude:17,longitude:78}, {...DEFAULT_SNAPSHOT,zones:[]}).serviceable).toBe(false);
  });
  it('repairs absent recipe-backed specs but never replaces invalid authored specs', () => {
    expect(ProductionSpec.safeParse(productionSpecFromConfig(DEFAULT_CAKE)).success).toBe(true);
    expect(resolveProductionSpec(null,DEFAULT_CAKE)).not.toBeNull();
    expect(resolveProductionSpec({allergenStatementReviewed:false},DEFAULT_CAKE)).toBeNull();
    expect(resolveProductionSpec(null,null)).toBeNull();
  });
});
