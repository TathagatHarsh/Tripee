/**
 * The two things every public, state-changing route handler needs, and which
 * server actions already get for free.
 *
 * Next checks the Origin of a server action itself, so /admin, /vendor and
 * /kitchen have never needed anything here — every write in those areas is an
 * action. The route handlers under /api are the exception: they are ordinary
 * POST endpoints, reachable by anything that can open a socket, and two of them
 * write rows while a third sets a cookie.
 *
 * No `server-only` marker, unlike its neighbours in lib/. There is nothing here
 * that would be dangerous in a browser bundle — no Prisma, no cookie jar, no
 * secret, just header arithmetic and a Map — and the marker's cost is that the
 * module stops being importable by the unit suite, which is where a guard like
 * this most wants to be exercised. Route handlers are still the only callers.
 */

/* ───────────────────────────────────── origin ────────────────────────────── */

/**
 * Refuse a cross-site browser request.
 *
 * The attack this closes is narrow but real. A cross-origin `fetch` carrying
 * `content-type: application/json` is already stopped by the preflight, because
 * nothing here answers one — but a plain HTML form is not a fetch, and
 * `<form method="post" enctype="text/plain">` posts a body of the attacker's
 * choosing to any URL with no preflight at all. `req.json()` parses that body
 * regardless of the content type it arrived under, so evil.example could have a
 * signed-in customer's browser place an order against their account, or stuff
 * their tracking cookie with references to orders they never placed.
 *
 * The rule is "present and wrong", not "absent or wrong", and that distinction
 * is the whole design:
 *
 *   - A browser always sends `Origin` on a cross-origin POST, and on a
 *     same-origin one. So every case being defended against has the header.
 *   - Anything without it is not a browser — curl, a Playwright request
 *     context, an uptime monitor. Those carry no ambient cookies, so they are
 *     not the CSRF shape at all, and refusing them would break the end-to-end
 *     suite and every legitimate integration in exchange for nothing.
 *
 * The host is read from `x-forwarded-host` before `host`, because the former is
 * what a proxy rewrites to the public name; on Vercel both are set and agree.
 */
export function crossSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return true;

  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export const CROSS_SITE_MESSAGE =
  "That request didn't come from this site, so it wasn't accepted.";

/* ────────────────────────────────── rate limit ───────────────────────────── */

/**
 * A fixed window per caller, held in memory.
 *
 * ponytail: per-instance, not per-deployment. Every serverless instance has its
 * own module scope, so the real ceiling is (limit × warm instances) rather than
 * (limit), and a caller who spreads requests thinly enough to land on a cold
 * instance each time is not counted at all. That is understood and accepted: it
 * is the difference between stopping a script in a loop — which is what
 * actually turns up, and which does keep hitting one warm instance — and
 * stopping a distributed attacker, which no amount of application code does.
 * The upgrade path is a rate-limit rule in the Vercel Firewall or a shared
 * counter in Redis, both configuration rather than a second system to maintain,
 * and neither worth pulling in before there is traffic to justify it.
 *
 * Deliberately not a sliding window and not a token bucket. A fixed window lets
 * through at most 2× the limit across two adjacent windows, and at these limits
 * — chosen so no real customer can reach them — 2× is still far below anything
 * that matters.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

/** Cheap enough to run on every call, and keeps the map from growing forever. */
function sweep(now: number): void {
  if (windows.size < 5_000) return;
  for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
}

export interface Limit {
  /** Requests allowed per window. */
  max: number;
  /** Window length, in seconds. */
  windowSeconds: number;
}

export interface LimitVerdict {
  ok: boolean;
  /** Seconds until the caller may try again. Only meaningful when `!ok`. */
  retryAfter: number;
}

export function rateLimit(bucket: string, caller: string, limit: Limit): LimitVerdict {
  const now = Date.now();
  sweep(now);

  const key = `${bucket}:${caller}`;
  const found = windows.get(key);

  if (!found || found.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + limit.windowSeconds * 1000 });
    return { ok: true, retryAfter: 0 };
  }

  found.count++;
  if (found.count <= limit.max) return { ok: true, retryAfter: 0 };

  return { ok: false, retryAfter: Math.ceil((found.resetAt - now) / 1000) };
}

/**
 * Who to count against.
 *
 * `x-forwarded-for` is a list, and only the entry the *edge* appended can be
 * trusted — a client may send the header itself, and everything to the left of
 * the proxy's own addition is then its invention. Vercel appends last, so the
 * last entry is the one to take. Behind a different proxy this needs revisiting;
 * behind none it collapses to one shared bucket, which in development is
 * exactly right.
 */
export function callerKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return req.headers.get("x-real-ip") ?? "local";
}

/**
 * The standard refusal: 429 with `Retry-After`, and a sentence rather than a
 * bare status, because a real customer who has double-tapped their way here
 * needs to be told that waiting fixes it.
 */
export function tooMany(verdict: LimitVerdict, what: string): Response {
  const minutes = Math.max(1, Math.ceil(verdict.retryAfter / 60));
  return Response.json(
    {
      error:
        `Too many ${what} from this connection in a short time. Please wait `
        + `${minutes === 1 ? "a minute" : `about ${minutes} minutes`} and try again.`,
      code: "rate_limited",
    },
    { status: 429, headers: { "retry-after": String(verdict.retryAfter) } },
  );
}

/**
 * The limits, in one place so they can be read against each other.
 *
 * Each is set well above what a person doing the thing honestly can reach, and
 * well below what a script doing it dishonestly wants. The order limit has to
 * clear the end-to-end suite as well, which sends about two dozen requests —
 * most of them refusals — in a single run.
 */
export const LIMITS = {
  /** Placing orders. A customer places one; the suite sends ~25. */
  orders: { max: 60, windowSeconds: 600 },
  /** Saving a shareable design. Each one is a row nobody can delete. */
  designs: { max: 40, windowSeconds: 600 },
  /** Quoting a price. Writes nothing; a 20-cake basket re-quotes 20 at a time. */
  price: { max: 600, windowSeconds: 600 },
} as const satisfies Record<string, Limit>;
