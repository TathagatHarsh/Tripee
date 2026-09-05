import { NextResponse, type NextRequest } from "next/server";

/**
 * Two staff areas, two gates.
 *
 * The kitchen board lists customer names and phone numbers. The admin portal
 * sets what the bakery charges. Both need a password, and neither should be
 * reachable with the other's.
 *
 * HTTP Basic rather than an auth library: there is no User model, no session
 * and no signup, and inventing all three to put a password on two staff pages
 * would be a large amount of machinery for one bakery. The browser already
 * knows how to prompt for this, so it costs no login page and no dependency.
 *
 * Separate realms rather than one shared credential, because the two are not
 * the same job: whoever is moving dockets on a counter tablet all day does not
 * also need the ability to reprice the menu, and one password would hand it to
 * them. Browsers cache credentials per realm, so the two stay apart on their
 * own.
 *
 * The obvious ceiling, unchanged: one shared credential *per area*, no
 * per-person identity, and no audit trail of who advanced which docket or who
 * changed which price. When staff need to be told apart, this is the seam to
 * replace — everything else stays as it is.
 */

interface Gate {
  prefix: string;
  realm: string;
  user: string | undefined;
  password: string | undefined;
}

/**
 * Read per request rather than at module load: the edge runtime reuses a module
 * instance across invocations, and an env var read once at import would survive
 * a credential rotation until the next cold start.
 */
function gates(): Gate[] {
  return [
    {
      prefix: "/admin",
      realm: "Makemycake admin",
      user: process.env.ADMIN_USER,
      password: process.env.ADMIN_PASSWORD,
    },
    {
      prefix: "/kitchen",
      realm: "Makemycake kitchen",
      user: process.env.KITCHEN_USER,
      password: process.env.KITCHEN_PASSWORD,
    },
  ];
}

/**
 * The edge runtime has no `crypto.timingSafeEqual`, so compare every character
 * regardless of where the first difference falls. Length still leaks, which is
 * a fair trade for four lines; the secret is a password, not a key.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default function proxy(req: NextRequest) {
  const gate = gates().find((g) => req.nextUrl.pathname.startsWith(g.prefix));

  // The matcher below is what decides which paths arrive here, so a request
  // with no gate is a matcher that has drifted from this list rather than a
  // request to let through on trust.
  if (!gate) {
    return new NextResponse("Not found.\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const { user, password } = gate;

  /*
   * Fail closed. An unconfigured gate must never degrade into an open door onto
   * a page of customer phone numbers, or onto the prices — which is exactly
   * what "if no password is set, skip the check" would do on the first
   * deployment where someone forgot to set the variable.
   */
  if (!user || !password) {
    const prefix = gate.prefix.slice(1).toUpperCase();
    return new NextResponse(
      `The ${gate.prefix} area is not configured on this deployment.\n` +
      `Set ${prefix}_USER and ${prefix}_PASSWORD.\n`,
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const header = req.headers.get("authorization") ?? "";

  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {
      decoded = "";
    }
    // Split on the FIRST colon only: a colon is legal inside a password.
    const split = decoded.indexOf(":");
    if (split !== -1) {
      const okUser = safeEqual(decoded.slice(0, split), user);
      const okPass = safeEqual(decoded.slice(split + 1), password);
      // Both are evaluated before the branch, so a wrong username and a wrong
      // password cost the same.
      if (okUser && okPass) return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required.\n", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${gate.realm}", charset="UTF-8"`,
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

/**
 * `:path*` matches zero or more segments, so each entry covers the area's own
 * page as well as everything under it — including the POST a server action
 * makes back to the page it lives on, which is how both boards write.
 */
export const config = {
  matcher: ["/admin/:path*", "/kitchen/:path*"],
};
