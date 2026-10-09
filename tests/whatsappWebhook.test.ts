import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/whatsappInbound", () => ({ handleInbound: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ dispatchPendingNotifications: vi.fn() }));
vi.mock("@/lib/log", () => ({ log: vi.fn() }));

import { log } from "@/lib/log";
import { dispatchPendingNotifications } from "@/lib/notifications";
import { handleInbound } from "@/lib/whatsappInbound";
import { GET, POST } from "@/app/api/whatsapp/webhook/route";

const URL = "https://x/api/whatsapp/webhook";
function signed(body: string, signature?: string) {
  const sig = signature ?? "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
  return new Request(URL, { method: "POST", body, headers: { "x-hub-signature-256": sig } });
}
const wrap = (value: object) => JSON.stringify({ entry: [{ changes: [{ value }] }] });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dispatchPendingNotifications).mockResolvedValue({} as never);
  vi.stubEnv("WHATSAPP_APP_SECRET", "secret");
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "tok");
});

describe("GET verify handshake", () => {
  it("answers the verify handshake", async () => {
    const res = await GET(new Request(`${URL}?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=42`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("42");
  });
  it("refuses a wrong verify token", async () => {
    const res = await GET(new Request(`${URL}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42`));
    expect(res.status).toBe(403);
  });
  it("refuses everything when no verify token is configured", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "");
    const res = await GET(new Request(`${URL}?hub.mode=subscribe&hub.verify_token=&hub.challenge=42`));
    expect(res.status).toBe(403);
  });
});

describe("POST", () => {
  it("rejects an unsigned POST without parsing it", async () => {
    const res = await POST(signed("not json", "sha256=bad"));
    expect(res.status).toBe(401);
    expect(handleInbound).not.toHaveBeenCalled();
    expect(dispatchPendingNotifications).not.toHaveBeenCalled();
  });

  it("hands a signed button tap to handleInbound and dispatches", async () => {
    const body = wrap({ messages: [{ id: "wamid.1", from: "919876543210", type: "button", button: { payload: "accept:as1", text: "Accept" } }] });
    const res = await POST(signed(body));
    expect(res.status).toBe(200);
    expect(handleInbound).toHaveBeenCalledWith({ id: "wamid.1", from: "919876543210", text: "Accept", payload: "accept:as1" });
    expect(dispatchPendingNotifications).toHaveBeenCalledWith(10);
  });

  it("maps plain text and interactive replies", async () => {
    const body = wrap({
      messages: [
        { id: "a", from: "1", type: "text", text: { body: "ready" } },
        { id: "b", from: "2", type: "interactive", interactive: { button_reply: { id: "start:as2", title: "Start" } } },
      ],
    });
    await POST(signed(body));
    expect(handleInbound).toHaveBeenNthCalledWith(1, { id: "a", from: "1", text: "ready", payload: null });
    expect(handleInbound).toHaveBeenNthCalledWith(2, { id: "b", from: "2", text: "Start", payload: "start:as2" });
  });

  it("logs failed deliveries with a masked number", async () => {
    const body = wrap({ statuses: [
      { id: "wamid.9", status: "failed", recipient_id: "919876543210", errors: [{ code: 131026 }] },
      { id: "wamid.10", status: "delivered", recipient_id: "919876543210" },
    ] });
    const res = await POST(signed(body));
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("error", "whatsapp_delivery_failed", { id: "wamid.9", recipient: "…3210", code: 131026 });
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("returns 500 so Meta retries when handling throws", async () => {
    vi.mocked(handleInbound).mockRejectedValueOnce(new Error("db down"));
    const body = wrap({ messages: [{ id: "a", from: "1", type: "text", text: { body: "ok" } }] });
    const res = await POST(signed(body));
    expect(res.status).toBe(500);
    expect(log).toHaveBeenCalledWith("error", "whatsapp_webhook_failed", expect.anything());
  });

  it("does not let an outbox failure surface", async () => {
    vi.mocked(dispatchPendingNotifications).mockRejectedValueOnce(new Error("outbox"));
    const res = await POST(signed(wrap({})));
    expect(res.status).toBe(200);
    await Promise.resolve();
    expect(log).toHaveBeenCalledWith("error", "whatsapp_dispatch_failed", expect.anything());
  });
});
