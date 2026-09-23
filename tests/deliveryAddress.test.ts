import { describe, expect, it } from 'vitest';
import { FulfillmentInput } from '@/lib/checkout';
import { ProductionSpec, resolveProductionSpec, productionSpecFromConfig } from '@/lib/productionSpec';
import { DEFAULT_CAKE } from '@/lib/schema';
import { checkDeliveryServiceability } from '@/lib/delivery';
import { DEFAULT_SNAPSHOT } from '@/lib/catalogDefaults';
const manual = { method: 'delivery', slot: 'standard', recipientName: 'Test Recipient', addressLine1: 'Flat 402', city: 'Hyderabad', state: 'Telangana', pincode: '500081', requestedDate: '2026-12-01', requestedWindow: 'Daytime', source: 'manual' };
describe('delivery and specification boundaries', () => {
  it('accepts a structured manual address without coordinates', () => {
    expect(FulfillmentInput.safeParse(manual).success).toBe(true);
    expect(FulfillmentInput.safeParse({...manual,pincode:''}).success).toBe(false);
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
