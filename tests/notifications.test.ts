import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/log', () => ({ log: vi.fn() }));
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn() }));
vi.mock('../lib/db', () => ({ db: { notificationOutbox: mocks } }));
import { dispatchPendingNotifications } from '../lib/notifications';

type Row = { id: string; status: string; attempts: number; availableAt: Date; kind: 'vendor_assigned'; channel: string; destination: string | null; payload: object; lastError?: string | null; sentAt?: Date };
type Where = { id?: string; status?: string | { in: string[] }; attempts?: number | { lt?: number; gte?: number }; availableAt?: Date | { lte: Date } };
let row: Row;
const fetchMock = vi.fn();
function matches(where: Where) {
  return (!where.id || row.id === where.id)
    && (!where.status || (typeof where.status === 'string' ? row.status === where.status : where.status.in.includes(row.status)))
    && (where.attempts === undefined || (typeof where.attempts === 'number' ? row.attempts === where.attempts : (where.attempts.lt === undefined || row.attempts < where.attempts.lt) && (where.attempts.gte === undefined || row.attempts >= where.attempts.gte)))
    && (!where.availableAt || (where.availableAt instanceof Date ? row.availableAt.getTime() === where.availableAt.getTime() : row.availableAt <= where.availableAt.lte));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T00:00:00Z'));
  row = { id: 'notice-1', status: 'pending', attempts: 0, availableAt: new Date(), kind: 'vendor_assigned', channel: 'webhook', destination: null, payload: {} };
  mocks.findMany.mockImplementation(async ({ where }: { where: Where }) => matches(where) ? [{ ...row }] : []);
  mocks.updateMany.mockImplementation(async ({ where, data }: { where: Where; data: Partial<Omit<Row, 'attempts'>> & { attempts?: { increment: number } } }) => {
    if (!matches(where)) return { count: 0 };
    const { attempts, ...rest } = data;
    Object.assign(row, rest);
    if (attempts) row.attempts += attempts.increment;
    return { count: 1 };
  });
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NOTIFICATION_WEBHOOK_URL', 'https://notifications.test/webhook');
  vi.stubEnv('NOTIFICATION_WEBHOOK_TOKEN', 'test-token');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('notification claim recovery', () => {
  it('retries an expired sending claim with the original provider idempotency key', async () => {
    row.status = 'sending'; row.attempts = 1;
    expect(await dispatchPendingNotifications()).toEqual({ sent: 1, failed: 0 });
    expect(row).toMatchObject({ status: 'sent', attempts: 2 });
    expect(fetchMock.mock.calls[0][1].headers['idempotency-key']).toBe('notice-1');
  });
  it('does not steal an active lease or retry a future failure', async () => {
    row.availableAt = new Date(Date.now() + 60_000);
    for (const status of ['sending', 'failed']) {
      row.status = status;
      expect(await dispatchPendingNotifications()).toEqual({ sent: 0, failed: 0 });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('turns an exhausted crashed claim into a terminal failure without sending again', async () => {
    row.status = 'sending'; row.attempts = 8;
    await dispatchPendingNotifications();
    await dispatchPendingNotifications();
    expect(row).toMatchObject({ status: 'failed', attempts: 8, lastError: 'notification_claim_expired' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reschedules provider failures and retries only after their backoff', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    expect(await dispatchPendingNotifications()).toEqual({ sent: 0, failed: 1 });
    expect(row).toMatchObject({ status: 'failed', attempts: 1, lastError: 'notification_provider_503' });
    await dispatchPendingNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(Date.now() + 60_000));
    expect(await dispatchPendingNotifications()).toEqual({ sent: 1, failed: 0 });
  });
  it.each([true, false])('a stale claimant cannot overwrite a newer claim (provider ok=%s)', async (ok) => {
    let completeOld!: (response: { ok: boolean; status: number }) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { completeOld = resolve; }));
    const oldDispatch = dispatchPendingNotifications();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    vi.setSystemTime(new Date(Date.now() + 61_000));
    // The second claimant remains active while the first completes.
    let completeNew!: (response: { ok: boolean }) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { completeNew = resolve; }));
    const newDispatch = dispatchPendingNotifications();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const newerLease = row.availableAt;
    completeOld({ ok, status: 503 });
    expect(await oldDispatch).toEqual({ sent: 0, failed: 0 });
    expect(row).toMatchObject({ status: 'sending', attempts: 2, availableAt: newerLease });
    completeNew({ ok: true });
    expect(await newDispatch).toEqual({ sent: 1, failed: 0 });
  });
});

describe('whatsapp outbox rows', () => {
  it('sends whatsapp rows to Meta, not the webhook', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'tok'); vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'PNID');
    Object.assign(row, { channel: 'whatsapp', destination: '919876543210', payload: { type: 'text', body: 'hi' } });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    expect(await dispatchPendingNotifications()).toEqual({ sent: 1, failed: 0 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v23.0/PNID/messages');
  });
  it('fails a whatsapp row with no destination', async () => {
    Object.assign(row, { channel: 'whatsapp', destination: null });
    expect(await dispatchPendingNotifications()).toEqual({ sent: 0, failed: 1 });
    expect(row.lastError).toBe('whatsapp_destination_missing');
  });
});
