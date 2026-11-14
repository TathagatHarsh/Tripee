import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn(async () => ({ id: 'v1', name: 'Sweet Crust' }));
const update = vi.fn();
const findUnique = vi.fn();
const sendWhatsApp = vi.fn();
const log = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/assignment', () => ({ lockAssignments: vi.fn() }));
vi.mock('@/lib/catalogData', () => ({ revalidateCatalog: vi.fn() }));
vi.mock('@/lib/log', () => ({ log }));
vi.mock('@/lib/db', () => ({ hasDatabase: () => true, db: { vendor: { create, update, findUnique } } }));
vi.mock('@/lib/whatsapp', async (orig) => ({ ...(await orig<typeof import('@/lib/whatsapp')>()), sendWhatsApp }));

const { sendVendorPhoneCode, addVendor, saveVendor } = await import('../app/admin/actions');

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const MISSING = 'Send a code to this number and enter it to save.';
const sentCode = () => {
  const msg = sendWhatsApp.mock.calls.at(-1)![1] as { components: { parameters: { text: string }[] }[] };
  return msg.components[0].parameters[0].text;
};

beforeEach(() => {
  vi.stubEnv('WHATSAPP_APP_SECRET', 's');
  vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 't');
  vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '1');
  for (const m of [create, update, findUnique, sendWhatsApp, log]) m.mockClear();
  sendWhatsApp.mockResolvedValue(undefined);
});

describe('sendVendorPhoneCode', () => {
  it('refuses an invalid number', async () => {
    expect(await sendVendorPhoneCode('12345')).toEqual({ ok: false, error: 'Enter a 10-digit Indian mobile number, like 98765 43210.' });
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('sends verify_code to the 91 number and returns a token', async () => {
    const r = await sendVendorPhoneCode('98765 11111');
    expect(r.ok).toBe(true);
    expect(sendWhatsApp).toHaveBeenCalledWith('919876511111', expect.objectContaining({ type: 'template', name: 'verify_code' }));
  });

  it('a send failure returns the copy and never logs the code', async () => {
    sendWhatsApp.mockRejectedValue(new Error('graph 500'));
    const r = await sendVendorPhoneCode('98765 22222');
    expect(r).toEqual({ ok: false, error: "We couldn't send the code right now. Try again in a minute." });
    expect(log).toHaveBeenCalledWith('error', 'vendor_phone_code_send_failed', expect.any(Object));
    expect(JSON.stringify(log.mock.calls)).not.toContain(sentCode());
  });

  it('refuses the 6th send to one number in an hour', async () => {
    for (let i = 0; i < 5; i++) expect((await sendVendorPhoneCode('98765 33333')).ok).toBe(true);
    const r = await sendVendorPhoneCode('98765 33333');
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/^Too many codes sent to this number\. Please wait (a minute|about \d+ minutes) and try again\.$/);
    expect(sendWhatsApp).toHaveBeenCalledTimes(5);
  });
});

describe('addVendor / saveVendor enforcement', () => {
  it('addVendor with a number and no code is refused', async () => {
    const r = await addVendor(undefined, form({ name: 'Sweet Crust', phone: '98765 44444', email: '', address: '' }));
    expect(r).toEqual({ ok: false, message: MISSING });
    expect(create).not.toHaveBeenCalled();
  });

  it('addVendor with a number and a valid code saves', async () => {
    const { token } = (await sendVendorPhoneCode('98765 55555')) as { token: string };
    const r = await addVendor(undefined, form({ name: 'Sweet Crust', phone: '98765 55555', email: '', address: '', phoneToken: token, phoneCode: sentCode() }));
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalled();
  });

  it('saveVendor changing only the name (same number, other spelling) saves with no code', async () => {
    findUnique.mockResolvedValue({ phone: '+91 98765 43210' });
    const r = await saveVendor(undefined, form({ id: 'v1', name: 'New Name', phone: '098765 43210', email: '', address: '' }));
    expect(r.ok).toBe(true);
    expect(update).toHaveBeenCalled();
  });

  it('saveVendor changing the number without a code is refused', async () => {
    findUnique.mockResolvedValue({ phone: '+91 98765 43210' });
    const r = await saveVendor(undefined, form({ id: 'v1', name: 'N', phone: '98765 66666', email: '', address: '' }));
    expect(r).toEqual({ ok: false, message: MISSING });
    expect(update).not.toHaveBeenCalled();
  });

  it('saveVendor changing the number with a valid token and code saves', async () => {
    findUnique.mockResolvedValue({ phone: '+91 98765 43210' });
    const { token } = (await sendVendorPhoneCode('98765 77777')) as { token: string };
    const r = await saveVendor(undefined, form({ id: 'v1', name: 'N', phone: '98765 77777', email: '', address: '', phoneToken: token, phoneCode: sentCode() }));
    expect(r.ok).toBe(true);
    expect(update).toHaveBeenCalled();
  });

  it('saveVendor clearing the number saves with no code', async () => {
    findUnique.mockResolvedValue({ phone: '+91 98765 43210' });
    expect((await saveVendor(undefined, form({ id: 'v1', name: 'N', phone: '', email: '', address: '' }))).ok).toBe(true);
  });
});
