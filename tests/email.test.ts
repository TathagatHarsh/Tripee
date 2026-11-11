import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { sendEmail } from '../lib/email';

const fetchMock = vi.fn();
const row = { id: 'n1', destination: 'asha@example.com', payload: { subject: 'S', text: 'T', html: '<p>H</p>' } };

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('EMAIL_FROM', 'MakeYourCakes <orders@makeyourcakes.com>');
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('posts one Resend email with idempotency key, from and reply-to', async () => {
  await sendEmail(row);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(init.method).toBe('POST');
  expect(init.headers.authorization).toBe('Bearer re_test');
  expect(init.headers['idempotency-key']).toBe('n1');
  expect(JSON.parse(init.body)).toEqual({
    from: 'MakeYourCakes <orders@makeyourcakes.com>',
    to: ['asha@example.com'],
    reply_to: 'hello@makeyourcakes.com',
    subject: 'S', text: 'T', html: '<p>H</p>',
  });
});

it('maps failures to error codes', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 429 });
  await expect(sendEmail(row)).rejects.toThrow('email_provider_429');
  await expect(sendEmail({ ...row, destination: null })).rejects.toThrow('email_destination_missing');
  vi.stubEnv('RESEND_API_KEY', '');
  await expect(sendEmail(row)).rejects.toThrow('email_provider_unconfigured');
});
