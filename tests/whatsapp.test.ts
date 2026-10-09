import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { adminNumbers, normalizePhone, photoSignature, photoUrl, sendWhatsApp, siteUrl, verifyPhotoSignature, verifySignature, whatsappConfigured } from '../lib/whatsapp';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('normalizePhone', () => {
  it.each([
    ['98765 43210', '919876543210'], ['+91-98765-43210', '919876543210'], ['09876543210', '919876543210'],
    ['919876543210', '919876543210'], ['040 2345 6789', '914023456789'], ['+44 7700 900123', '447700900123'],
  ])('%s → %s', (raw, want) => expect(normalizePhone(raw)).toBe(want));
  it.each([null, undefined, '', '12345', 'abc'])('%s → null', raw => expect(normalizePhone(raw)).toBeNull());
});
it('adminNumbers normalises, drops junk and dedupes', () => {
  vi.stubEnv('WHATSAPP_ADMIN_NUMBERS', '98765 43210, +919876543210,xx, 9000000001');
  expect(adminNumbers()).toEqual(['919876543210', '919000000001']);
});
it('adminNumbers is empty when the variable is unset', () => {
  vi.stubEnv('WHATSAPP_ADMIN_NUMBERS', '');
  expect(adminNumbers()).toEqual([]);
});
describe('whatsappConfigured', () => {
  it('needs both the access token and the phone-number id', () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'tok'); vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '');
    expect(whatsappConfigured()).toBe(false);
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'PNID');
    expect(whatsappConfigured()).toBe(true);
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', '');
    expect(whatsappConfigured()).toBe(false);
  });
});
describe('siteUrl', () => {
  it('defaults to the live domain and drops a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined as unknown as string);
    expect(siteUrl()).toBe('https://makeyourcakes.com');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cakes.test/');
    expect(siteUrl()).toBe('https://cakes.test');
  });
});
describe('verifySignature', () => {
  const sig = (body: string) => 'sha256=' + createHmac('sha256', 'app-secret').update(body).digest('hex');
  beforeEach(() => vi.stubEnv('WHATSAPP_APP_SECRET', 'app-secret'));
  it('accepts Meta’s signature', () => expect(verifySignature('{"a":1}', sig('{"a":1}'))).toBe(true));
  it('rejects a tampered body', () => expect(verifySignature('{"a":2}', sig('{"a":1}'))).toBe(false));
  it('rejects missing or short headers without throwing', () => {
    expect(verifySignature('x', null)).toBe(false); expect(verifySignature('x', 'sha256=ab')).toBe(false);
  });
  it('rejects everything when the secret is unset, even a header forged with the empty key', () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', '');
    const forged = 'sha256=' + createHmac('sha256', '').update('x').digest('hex');
    expect(verifySignature('x', forged)).toBe(false);
    expect(verifySignature('x', sig('x'))).toBe(false);
  });
});
it('photoUrl is signed and stable', () => {
  vi.stubEnv('WHATSAPP_APP_SECRET', 'app-secret'); vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cakes.test');
  expect(photoUrl('ord1')).toBe(`https://cakes.test/api/whatsapp/photo/ord1?s=${photoSignature('ord1')}`);
  expect(photoSignature('ord1')).toMatch(/^[A-Za-z0-9_-]{22}$/); expect(photoSignature('ord2')).not.toBe(photoSignature('ord1'));
});
describe('verifyPhotoSignature', () => {
  beforeEach(() => vi.stubEnv('WHATSAPP_APP_SECRET', 'app-secret'));
  it('accepts the signature photoSignature issues for that order', () => expect(verifyPhotoSignature('ord1', photoSignature('ord1'))).toBe(true));
  it('rejects another order’s signature, a missing one and a wrong-length one', () => {
    expect(verifyPhotoSignature('ord1', photoSignature('ord2'))).toBe(false);
    expect(verifyPhotoSignature('ord1', null)).toBe(false);
    expect(verifyPhotoSignature('ord1', photoSignature('ord1').slice(0, 21))).toBe(false);
    expect(verifyPhotoSignature('ord1', photoSignature('ord1') + 'A')).toBe(false);
  });
  it('fails closed when the secret is unset, even for a signature minted with the empty key', () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', '');
    expect(verifyPhotoSignature('ord1', photoSignature('ord1'))).toBe(false);
  });
});
describe('sendWhatsApp', () => {
  const fetchMock = vi.fn();
  const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body);
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'tok'); vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'PNID');
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
  });
  it('posts text to the Graph messages endpoint', async () => {
    await sendWhatsApp('919876543210', { type: 'text', body: 'hi' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v23.0/PNID/messages');
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '919876543210', type: 'text', text: { body: 'hi', preview_url: false } });
  });
  it('maps buttons to an interactive reply message', async () => {
    await sendWhatsApp('919876543210', { type: 'buttons', body: 'b', buttons: [{ id: 'start:1', title: 'Started' }] });
    expect(sent()).toMatchObject({ to: '919876543210', type: 'interactive' });
    expect(sent().interactive).toEqual({ type: 'button', body: { text: 'b' }, action: { buttons: [{ type: 'reply', reply: { id: 'start:1', title: 'Started' } }] } });
  });
  it('maps templates with language en', async () => {
    await sendWhatsApp('919876543210', { type: 'template', name: 'order_update', components: [] });
    expect(sent()).toMatchObject({ to: '919876543210', type: 'template' });
    expect(sent().template).toEqual({ name: 'order_update', language: { code: 'en' }, components: [] });
  });
  it('throws whatsapp_<status>_<metaCode> on failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { code: 131026 } }) });
    await expect(sendWhatsApp('919876543210', { type: 'text', body: 'x' })).rejects.toThrow('whatsapp_400_131026');
  });
  it('still throws whatsapp_<status> when Meta’s error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
    await expect(sendWhatsApp('919876543210', { type: 'text', body: 'x' })).rejects.toThrow('whatsapp_502');
  });
  it('refuses to call Meta without credentials', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', '');
    await expect(sendWhatsApp('919876543210', { type: 'text', body: 'x' })).rejects.toThrow('whatsapp_not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
