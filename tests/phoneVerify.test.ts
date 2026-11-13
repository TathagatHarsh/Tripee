import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let jar: Record<string, string> = {};
let cookiesThrow = false;
vi.mock("next/headers", () => ({
  cookies: async () => {
    if (cookiesThrow) throw new Error("no request scope");
    return { get: (n: string) => (jar[n] ? { value: jar[n] } : undefined) };
  },
}));

import { checkCode, issueCode, phoneProblem, provenCookie, provenPhone } from "@/lib/phoneVerify";

const P = "919876543210", T0 = 1_700_000_000_000;

beforeEach(() => { jar = {}; cookiesThrow = false; vi.stubEnv("WHATSAPP_APP_SECRET", "s"); });
afterEach(() => vi.unstubAllEnvs());

it("round trip", () => { const { code, token } = issueCode(P, T0); expect(code).toMatch(/^\d{6}$/); expect(checkCode(P, code, token, T0 + 60_000)).toBe("ok"); });
it("wrong code", () => { const { code, token } = issueCode(P, T0); expect(checkCode(P, code === "000000" ? "000001" : "000000", token, T0)).toBe("wrong"); });
it("expired after 10 minutes", () => { const { code, token } = issueCode(P, T0); expect(checkCode(P, code, token, T0 + 10 * 60_000 + 1)).toBe("expired"); });
it("other phone", () => { const { code, token } = issueCode(P, T0); expect(checkCode("919999999999", code, token, T0)).toBe("wrong"); });
it("tampered expiry", () => { const { code, token } = issueCode(P, T0); const [, sig] = token.split("."); expect(checkCode(P, code, `${T0 + 9e9}.${sig}`, T0)).toBe("wrong"); });
it("malformed token", () => { expect(checkCode(P, "123456", "garbage", T0)).toBe("wrong"); expect(checkCode(P, "123456", "", T0)).toBe("wrong"); });
it("no secret: issue throws, nothing verifies", () => { const { code, token } = issueCode(P, T0); const c = provenCookie(P, T0); vi.stubEnv("WHATSAPP_APP_SECRET", ""); expect(() => issueCode(P, T0)).toThrow("phone_verify_no_secret"); expect(checkCode(P, code, token, T0)).toBe("wrong"); expect(provenPhone(c, T0)).toBeNull(); });
it("cookie round trip and expiry", () => { const c = provenCookie(P, T0); expect(provenPhone(c, T0 + 29 * 86400_000)).toBe(P); expect(provenPhone(c, T0 + 30 * 86400_000 + 1)).toBeNull(); });
it("tampered or missing cookie", () => { const c = provenCookie(P, T0); expect(provenPhone(c.replace(P, "919999999999"), T0)).toBeNull(); expect(provenPhone(undefined, T0)).toBeNull(); expect(provenPhone("a.b", T0)).toBeNull(); });

describe("phoneProblem", () => {
  it("flag off → null", async () => { expect(await phoneProblem("9876543210", false)).toBeNull(); });
  it("flag on, paid → null even with no cookie", async () => { vi.stubEnv("PHONE_VERIFICATION", "on"); expect(await phoneProblem("9876543210", true)).toBeNull(); });
  it("flag on, no cookie → 422 phone_unverified", async () => { vi.stubEnv("PHONE_VERIFICATION", "on"); const r = await phoneProblem("9876543210", false); expect(r!.status).toBe(422); expect(await r!.json()).toEqual({ error: "Verify your number on WhatsApp to continue.", code: "phone_unverified", field: "customerPhone" }); });
  it("flag on, cookie for the same number spelled differently → null", async () => { vi.stubEnv("PHONE_VERIFICATION", "on"); jar.myc_phone = provenCookie(P); expect(await phoneProblem("098765 43210", false)).toBeNull(); expect(await phoneProblem("+91 98765-43210", false)).toBeNull(); });
  it("flag on, cookie for another number → 422", async () => { vi.stubEnv("PHONE_VERIFICATION", "on"); jar.myc_phone = provenCookie("919999999999"); expect((await phoneProblem("9876543210", false))!.status).toBe(422); });
  it("cookies() throwing (no request scope) → treated as no cookie", async () => { vi.stubEnv("PHONE_VERIFICATION", "on"); cookiesThrow = true; expect((await phoneProblem("9876543210", false))!.status).toBe(422); });
});
