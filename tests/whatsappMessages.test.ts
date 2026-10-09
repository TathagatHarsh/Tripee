import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/log', () => ({ log: vi.fn() }));
vi.mock('../lib/db', () => ({ db: {} }));
import type { WhatsAppMessage } from '../lib/whatsapp';
import { acceptedMessage, adminNewOrderMessage, cleanParam, formatDue, offerMessage, queueWhatsApp, rupees, textMessage, updateMessage } from '../lib/whatsappMessages';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

const facts = { orderId: 'ord1', ref: 'MC-AB12CD', totalPaise: 125000, dueAt: new Date('2026-10-10T10:30:00Z'), area: 'Jubilee Hills, Hyderabad 500033', cake: 'Chocolate Truffle · 1kg · eggless · message "Happy\nBirthday"' };
const params = (m: WhatsAppMessage, type: string) => (m as any).components.find((c: any) => c.type === type).parameters;
const bodyTexts = (m: WhatsAppMessage) => params(m, 'body').map((p: any) => p.text);

describe('builders', () => {
  it('cleanParam flattens whitespace, caps length, never returns empty', () => {
    expect(cleanParam('a\n\tb    c')).toBe('a b c'); expect(cleanParam('')).toBe('-'); expect(cleanParam(null)).toBe('-');
    expect(cleanParam('x'.repeat(200), 10)).toBe('x'.repeat(9) + '…');
  });
  it('rupees uses Indian grouping', () => { expect(rupees(125000)).toBe('1,250'); expect(rupees(189950)).toBe('1,899.50'); expect(rupees(10000000)).toBe('1,00,000'); });
  it('formatDue is IST', () => { expect(formatDue(new Date('2026-10-10T10:30:00Z'))).toBe('Sat 10 Oct, 4:00 pm'); expect(formatDue(null)).toBe('not set'); });
  it('offerMessage: photo header, 7 clean params, accept/reject payloads', () => {
    const m = offerMessage(facts, { assignmentId: 'as1', distanceKm: 2.04, earningPaise: 100000, replyMinutes: 15 });
    expect(m).toMatchObject({ type: 'template', name: 'order_offer' });
    expect(params(m, 'header')[0].image.link).toContain('/api/whatsapp/photo/ord1?s=');
    expect(bodyTexts(m)).toEqual(['MC-AB12CD', 'Chocolate Truffle · 1kg · eggless · message "Happy Birthday"', 'Sat 10 Oct, 4:00 pm', 'Jubilee Hills, Hyderabad 500033', '2.0', '1,000', '15']);
    const payloads = (m as any).components.filter((c: any) => c.type === 'button').map((c: any) => [c.index, c.parameters[0].payload]);
    expect(payloads).toEqual([['0', 'accept:as1'], ['1', 'reject:as1']]);
  });
  it('offerMessage handles unknown distance and earning', () => {
    const body = bodyTexts(offerMessage(facts, { assignmentId: 'as1', distanceKm: null, earningPaise: null, replyMinutes: 15 }));
    expect(body[4]).toBe('?'); expect(body[5]).toBe('-');
  });
  it('adminNewOrderMessage: photo + [ref, rupees, cake, due, area]', () => {
    const m = adminNewOrderMessage(facts);
    expect(m).toMatchObject({ type: 'template', name: 'admin_new_order' });
    expect(params(m, 'header')[0].image.link).toContain('/api/whatsapp/photo/ord1?s=');
    expect(bodyTexts(m)).toEqual(['MC-AB12CD', '1,250', 'Chocolate Truffle · 1kg · eggless · message "Happy Birthday"', 'Sat 10 Oct, 4:00 pm', 'Jubilee Hills, Hyderabad 500033']);
  });
  it('updateMessage: [ref, text]', () => {
    const m = updateMessage('MC-1', 'Sweet Crumbs accepted');
    expect(m).toMatchObject({ type: 'template', name: 'order_update' });
    expect(bodyTexts(m)).toEqual(['MC-1', 'Sweet Crumbs accepted']);
  });
  it('updateMessage allows 400 chars of text', () => {
    expect(bodyTexts(updateMessage('MC-1', 'y'.repeat(500)))[1]).toBe('y'.repeat(399) + '…');
  });
  it('acceptedMessage offers the three steps', () => {
    expect(acceptedMessage('MC-1', 'as1')).toEqual({ type: 'buttons', body: 'MC-1 is yours. Tap each step as you go.',
      buttons: [{ id: 'start:as1', title: 'Started' }, { id: 'ready:as1', title: 'Ready' }, { id: 'handover:as1', title: 'Handed over' }] });
  });
  it('textMessage wraps the body', () => { expect(textMessage('hi')).toEqual({ type: 'text', body: 'hi' }); });
});

describe('queueWhatsApp', () => {
  const tx = { notificationOutbox: { upsert: vi.fn() } } as any;
  it('writes nothing when WhatsApp is not configured', async () => {
    expect(await queueWhatsApp(tx, { orderId: 'o', kind: 'status_changed', to: ['9876543210'], dedupeKey: 'k', message: textMessage('x') })).toBe(0);
    expect(tx.notificationOutbox.upsert).not.toHaveBeenCalled();
  });
  it('one idempotent whatsapp row per unique normalised number', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'tok'); vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'PNID');
    expect(await queueWhatsApp(tx, { orderId: 'o', kind: 'status_changed', to: ['98765 43210', '+919876543210', null, 'junk'], dedupeKey: 'k', message: textMessage('x') })).toBe(1);
    expect(tx.notificationOutbox.upsert).toHaveBeenCalledTimes(1);
    expect(tx.notificationOutbox.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { dedupeKey: 'k:919876543210' }, update: {},
      create: expect.objectContaining({ channel: 'whatsapp', destination: '919876543210', dedupeKey: 'k:919876543210' }) }));
  });
});
