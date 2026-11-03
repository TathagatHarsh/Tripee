import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/db', () => ({ db: {} }));
vi.mock('../lib/assignment', () => ({ respondToAssignment: vi.fn(), moveFulfillment: vi.fn(), AssignmentConflict: class extends Error {} }));
import { parseInbound, pickTarget, type OpenRow } from '../lib/whatsappInbound';

describe('parseInbound', () => {
  it.each([
    [{ payload: 'accept:as1' }, { action: 'accept', assignmentId: 'as1' }], [{ payload: 'handover:as1', text: 'Handed over' }, { action: 'handover', assignmentId: 'as1' }],
    [{ text: 'Order started' }, { action: 'start' }], [{ text: 'STARTED mc-ab12cd' }, { action: 'start', ref: 'MC-AB12CD' }],
    [{ text: 'Started ✅' }, { action: 'start' }], [{ text: 'READY!!' }, { action: 'ready' }], [{ text: 'picked up' }, { action: 'handover' }],
    [{ text: 'order\nstarted' }, { action: 'start' }], [{ text: 'handed\tover' }, { action: 'handover' }], [{ text: 'ok' }, { action: 'accept' }], [{ text: 'No' }, { action: 'reject' }],
    [{ payload: 'deliver:as1', text: 'Delivered' }, { action: 'deliver', assignmentId: 'as1' }], [{ text: 'Delivered' }, { action: 'deliver' }],
    [{ text: 'order delivered MC-AB12' }, { action: 'deliver', ref: 'MC-AB12' }], [{ text: 'Collected' }, { action: 'deliver' }],
  ])('parses %j', (input, want) => expect(parseInbound(input)).toEqual(want));
  it.each([{ text: 'hello' }, { text: '' }, { payload: 'delete:as1' }, {}])('ignores %j', input => expect(parseInbound(input)).toBeNull());
});

const row = (id: string, ref: string, assignmentStatus: string, status: string, orderStatus = 'confirmed') => ({ id, orderId: `o-${id}`, ref, assignmentStatus, status, orderStatus, pickup: false }) as OpenRow;
describe('pickTarget', () => {
  it('none / one / many / ref filter / step fit', () => {
    const offered = [row('a', 'MC-1', 'OFFERED', 'assigned'), row('b', 'MC-2', 'OFFERED', 'assigned')];
    expect(pickTarget('start', offered)).toEqual({ kind: 'none' });
    expect(pickTarget('accept', offered)).toEqual({ kind: 'many', refs: ['MC-1', 'MC-2'] });
    expect(pickTarget('accept', offered, 'MC-2')).toEqual({ kind: 'one', row: offered[1] });
    expect(pickTarget('ready', [row('c', 'MC-3', 'ACCEPTED', 'in_preparation')])).toMatchObject({ kind: 'one' });
    expect(pickTarget('handover', [row('c', 'MC-3', 'ACCEPTED', 'in_preparation')])).toEqual({ kind: 'none' });
  });
  it('delivered fits only a handed-over order that is out for delivery', () => {
    expect(pickTarget('deliver', [row('d', 'MC-4', 'ACCEPTED', 'handed_over', 'out_for_delivery')])).toMatchObject({ kind: 'one' });
    expect(pickTarget('deliver', [row('d', 'MC-4', 'ACCEPTED', 'handed_over', 'in_kitchen')])).toEqual({ kind: 'none' });
    expect(pickTarget('deliver', [row('d', 'MC-4', 'ACCEPTED', 'ready', 'in_kitchen')])).toEqual({ kind: 'none' });
  });
});
