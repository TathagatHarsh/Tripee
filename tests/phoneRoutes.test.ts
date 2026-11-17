import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const log = vi.fn();
vi.mock("@/lib/log", () => ({ log }));
const sendWhatsApp = vi.fn<(to: string, message: { name: string; components: unknown[] }) => Promise<void>>(async () => {});
vi.mock("@/lib/whatsapp", async () => ({ ...(await vi.importActual<object>("@/lib/whatsapp")), sendWhatsApp }));
// Route handlers use next/headers cookies(); outside a request, give them a jar that writes a real Set-Cookie header.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string, o: { httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string; maxAge?: number }) =>
      jar.set(name, `${name}=${value}; Path=${o.path}; Max-Age=${o.maxAge}; ${o.httpOnly ? "HttpOnly; " : ""}${o.secure ? "Secure; " : ""}SameSite=${o.sameSite}`),
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
const { POST: send } = await import("@/app/api/phone/send/route");
const { POST: verify } = await import("@/app/api/phone/verify/route");

let n = 0;
const post = (url: string, body: unknown, headers: Record<string, string> = {}, ip = `10.1.0.${++n}`) =>
  new Request(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": ip, host: "localhost", ...headers } });
const sendTo = (phone: string, ip?: string) => send(post("/api/phone/send", { phone }, {}, ip));
const lastCode = () => {
  const message = sendWhatsApp.mock.calls.at(-1)![1];
  return (message.components[0] as { parameters: { text: string }[] }).parameters[0].text;
};
const WRONG = "That code isn't right.";

describe("phone routes", () => {
  beforeEach(() => {
    vi.stubEnv("PHONE_VERIFICATION", "on");
    vi.stubEnv("WHATSAPP_APP_SECRET", "test-secret");
    sendWhatsApp.mockReset().mockResolvedValue(undefined);
    log.mockClear();
    jar.clear();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  describe("send", () => {
    it("404 when the flag is off", async () => {
      vi.stubEnv("PHONE_VERIFICATION", "");
      expect((await sendTo("9876500001")).status).toBe(404);
      expect(sendWhatsApp).not.toHaveBeenCalled();
    });
    it("403 for a cross-site origin", async () => {
      const res = await send(post("/api/phone/send", { phone: "9876500002" }, { origin: "https://evil.example" }));
      expect(res.status).toBe(403);
    });
    it("400 with the field for a bad number", async () => {
      const res = await sendTo("12345");
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe("customerPhone");
    });
    it("400 for a body that is not JSON", async () => {
      const res = await send(new Request("http://localhost/api/phone/send", { method: "POST", body: "nope", headers: { "x-forwarded-for": "10.9.9.9" } }));
      expect(res.status).toBe(400);
    });
    it("sends the code to the normalised number and returns a token", async () => {
      const res = await sendTo("98765 00003");
      expect(res.status).toBe(200);
      expect(typeof (await res.json()).token).toBe("string");
      expect(sendWhatsApp).toHaveBeenCalledTimes(1);
      expect(sendWhatsApp).toHaveBeenCalledWith("919876500003", expect.objectContaining({ name: "verify_code" }));
    });
    it("503 with the couldn't-send copy when WhatsApp fails, and never logs the code", async () => {
      sendWhatsApp.mockRejectedValue(new Error("meta 131000"));
      const res = await sendTo("9876500004");
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe("We couldn't send the code right now. Try again in a minute, or write to hello@makeyourcakes.com.");
      expect(log).toHaveBeenCalledWith("error", "phone_code_send_failed", { error: "meta 131000" });
      const code = lastCode();
      expect(JSON.stringify(log.mock.calls)).not.toContain(code);
    });
    it("503 when the secret is missing", async () => {
      vi.stubEnv("WHATSAPP_APP_SECRET", "");
      const res = await sendTo("9876500005");
      expect(res.status).toBe(503);
      expect(sendWhatsApp).not.toHaveBeenCalled();
    });
    it("429 on the 4th send to one number in an hour, even from different IPs", async () => {
      for (let i = 0; i < 3; i++) expect((await sendTo("9876500006")).status).toBe(200);
      const res = await sendTo("9876500006");
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBeTruthy();
      expect((await res.json()).error).toMatch(/^Too many codes sent to this number\. Please wait (a minute|about \d+ minutes) and try again, or write to hello@makeyourcakes\.com\.$/);
    });
  });

  describe("verify", () => {
    const verifyWith = (phone: string, code: string, token: string, ip?: string) => verify(post("/api/phone/verify", { phone, code, token }, {}, ip));
    async function issued(phone: string) {
      const { token } = await (await sendTo(phone)).json();
      return { token, code: lastCode() };
    }
    it("404 when the flag is off", async () => {
      vi.stubEnv("PHONE_VERIFICATION", "");
      expect((await verifyWith("9876500010", "123456", "x")).status).toBe(404);
    });
    it("403 for a cross-site origin", async () => {
      const res = await verify(post("/api/phone/verify", { phone: "9876500011", code: "1", token: "x" }, { origin: "https://evil.example" }));
      expect(res.status).toBe(403);
    });
    it("the right code returns the phone and sets the proven-phone cookie", async () => {
      const { token, code } = await issued("9876500012");
      const res = await verifyWith("9876500012", code, token);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ phone: "919876500012" });
      const cookie = jar.get("myc_phone")!;
      expect(cookie).toMatch(/^myc_phone=919876500012\./);
      for (const part of [/httponly/i, /max-age=2592000/i, /samesite=lax/i]) expect(cookie).toMatch(part);
    });
    it("400 with the exact copy for a wrong code, and no cookie", async () => {
      const { token, code } = await issued("9876500013");
      const res = await verifyWith("9876500013", code === "000000" ? "000001" : "000000", token);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(WRONG);
      expect(jar.size).toBe(0);
    });
    it("410 for an expired token", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { token, code } = await issued("9876500014");
      vi.setSystemTime(Date.now() + 11 * 60_000);
      const res = await verifyWith("9876500014", code, token);
      expect(res.status).toBe(410);
      expect((await res.json()).error).toBe("That code has expired. Send a new one.");
    });
    it("429 on the 6th try within 10 minutes", async () => {
      const { token } = await issued("9876500015");
      for (let i = 0; i < 5; i++) expect((await verifyWith("9876500015", "000000", token, "10.2.0.1")).status).toBe(400);
      expect((await verifyWith("9876500015", "000000", token, "10.2.0.1")).status).toBe(429);
    });
  });
});
