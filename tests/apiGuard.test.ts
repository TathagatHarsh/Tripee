import { describe, expect, it } from "vitest";
import {
  callerKey, crossSite, LIMITS, rateLimit, tooMany, type Limit,
} from "@/lib/apiGuard";

/**
 * The doorman on the three public POST endpoints.
 *
 * Tested the way it will be attacked rather than the way it will be used: what
 * does a request from somebody else's page get, what does a forged
 * `x-forwarded-for` get, what does the hundredth request in a minute get. The
 * cases that must *not* be refused are here in equal number, because a guard
 * that turns away the end-to-end suite or an uptime monitor is a guard somebody
 * deletes in a hurry three weeks from now.
 */

function req(headers: Record<string, string>): Request {
  return new Request("https://makemycake.example/api/orders", {
    method: "POST",
    headers,
  });
}

describe("the cross-site check", () => {
  it("lets a request from our own page through", () => {
    expect(crossSite(req({
      origin: "https://makemycake.example",
      host: "makemycake.example",
    }))).toBe(false);
  });

  it("lets a request with no Origin through", () => {
    // curl, the Playwright request context, an uptime monitor. No ambient
    // cookies, so not the shape this defends against — and refusing them would
    // break e2e/checkout.spec.ts in exchange for nothing.
    expect(crossSite(req({ host: "makemycake.example" }))).toBe(false);
  });

  it("turns away a form posted from somebody else's site", () => {
    // The whole point: `<form enctype="text/plain">` needs no preflight, and
    // `req.json()` will happily parse whatever it sends.
    expect(crossSite(req({
      origin: "https://evil.example",
      host: "makemycake.example",
    }))).toBe(true);
  });

  it("is not fooled by a lookalike origin", () => {
    for (const origin of [
      "https://makemycake.example.evil.test",
      "https://evil.test/?makemycake.example",
      "https://makemycake.example:8443",
      "null",
      "not a url",
    ]) {
      expect(crossSite(req({ origin, host: "makemycake.example" })), origin).toBe(true);
    }
  });

  it("prefers the forwarded host, which is the public name behind a proxy", () => {
    expect(crossSite(req({
      origin: "https://makemycake.example",
      "x-forwarded-host": "makemycake.example",
      host: "some-internal-lambda.vercel.internal",
    }))).toBe(false);
  });
});

describe("who a request is counted against", () => {
  it("takes the last x-forwarded-for entry, which is the one the edge appended", () => {
    // Everything left of the proxy's own addition is the client's invention, so
    // a caller cannot escape their bucket by prepending a fake address.
    expect(callerKey(req({ "x-forwarded-for": "1.1.1.1" }))).toBe("1.1.1.1");
    expect(callerKey(req({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(callerKey(req({ "x-forwarded-for": "spoofed, spoofed2, 203.0.113.7" })))
      .toBe("203.0.113.7");
  });

  it("falls back rather than throwing when no proxy has been through", () => {
    expect(callerKey(req({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(callerKey(req({}))).toBe("local");
    expect(callerKey(req({ "x-forwarded-for": " , ," }))).toBe("local");
  });
});

describe("the rate limit", () => {
  const tiny: Limit = { max: 3, windowSeconds: 600 };

  /** A fresh bucket per case: the Map is module state and outlives a test. */
  let n = 0;
  const bucket = () => `test-${Date.now()}-${n++}`;

  it("allows exactly the limit and then stops", () => {
    const b = bucket();
    for (let i = 1; i <= 3; i++) {
      expect(rateLimit(b, "1.1.1.1", tiny).ok, `request ${i}`).toBe(true);
    }
    expect(rateLimit(b, "1.1.1.1", tiny).ok).toBe(false);
  });

  it("counts each caller separately", () => {
    const b = bucket();
    for (let i = 0; i < 3; i++) rateLimit(b, "1.1.1.1", tiny);
    expect(rateLimit(b, "1.1.1.1", tiny).ok).toBe(false);
    expect(rateLimit(b, "2.2.2.2", tiny).ok).toBe(true);
  });

  it("counts each endpoint separately", () => {
    const a = bucket();
    const c = bucket();
    for (let i = 0; i < 3; i++) rateLimit(a, "1.1.1.1", tiny);
    expect(rateLimit(a, "1.1.1.1", tiny).ok).toBe(false);
    expect(rateLimit(c, "1.1.1.1", tiny).ok).toBe(true);
  });

  it("reopens once the window has passed", () => {
    const b = bucket();
    const instant: Limit = { max: 1, windowSeconds: 0 };
    expect(rateLimit(b, "1.1.1.1", instant).ok).toBe(true);
    expect(rateLimit(b, "1.1.1.1", instant).ok).toBe(true);
  });

  it("says how long to wait, and the refusal is a 429 a person can read", async () => {
    const b = bucket();
    for (let i = 0; i < 3; i++) rateLimit(b, "1.1.1.1", tiny);
    const verdict = rateLimit(b, "1.1.1.1", tiny);

    expect(verdict.ok).toBe(false);
    expect(verdict.retryAfter).toBeGreaterThan(0);
    expect(verdict.retryAfter).toBeLessThanOrEqual(600);

    const res = tooMany(verdict, "order attempts");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe(String(verdict.retryAfter));

    const body = await res.json();
    expect(body.code).toBe("rate_limited");
    // §19: this is what a customer reads. No internals, no bare status codes.
    expect(body.error).toMatch(/try again/i);
    expect(body.error).not.toMatch(/prisma|postgres|node_modules|\bat \//i);
  });
});

describe("the limits themselves", () => {
  it("clears the end-to-end suite, which sends about two dozen orders a run", () => {
    // If this ever drops below ~30, the CI browser job starts failing on the
    // last few refusal cases in e2e/checkout.spec.ts, and the failure looks
    // nothing like a rate limit.
    expect(LIMITS.orders.max).toBeGreaterThanOrEqual(30);
  });

  it("stays low enough to be worth having", () => {
    // A real customer places one order. Anything needing hundreds is a script,
    // and a limit a script cannot reach is not a limit.
    for (const [name, l] of Object.entries(LIMITS)) {
      expect(l.max, name).toBeLessThanOrEqual(600);
      expect(l.windowSeconds, name).toBeGreaterThan(0);
    }
  });
});
