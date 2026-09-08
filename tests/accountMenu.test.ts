import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { UserRole } from "@prisma/client";
import { allows } from "@/lib/roles";

/**
 * The account menu's two promises, checked without a browser.
 *
 * The panel itself — opening, Escape, light dismiss, tab order, the five
 * viewports — is e2e/a11y.spec.ts, because none of that is decidable outside a
 * real engine. What is decidable here is the pair of things a menu can get wrong
 * on its own:
 *
 *   1. it can offer a door that is not there, and
 *   2. it can offer a door to somebody who cannot open it.
 *
 * The first is the failure the brief names twice — "do not create broken
 * navigation" — and it is the one a reviewer cannot catch by reading, because
 * `href="/my-cakes"` looks exactly as correct as `href="/account"`.
 */

const ROOT = path.resolve(__dirname, "..");
const SOURCE = readFileSync(path.join(ROOT, "components/AccountMenu.tsx"), "utf8");

/**
 * Every internal path the component can put in front of somebody.
 *
 * Read out of the source rather than restated here, which is the whole point: a
 * list typed into this file would be a second list, and a second list is one
 * list and a bug. Add a row to the menu and this test starts asserting about it
 * without anybody remembering to come here.
 */
const HREFS = [...SOURCE.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]!);

/** Where App Router would look for the page behind a path. */
function pageFor(href: string): string[] {
  const clean = href.split(/[?#]/)[0]!.replace(/\/$/, "");
  return [
    path.join(ROOT, "app", clean, "page.tsx"),
    // The two auth screens are optional catch-alls, because Clerk's flow has
    // more than one screen behind each URL — a second factor, a password reset,
    // an SSO callback.
    path.join(ROOT, "app", clean, `[[...${clean.slice(1)}]]`, "page.tsx"),
  ];
}

describe("every destination in the menu exists", () => {
  it("finds some hrefs at all, so a silent regex miss cannot pass this file", () => {
    // Without this, renaming the prop or reformatting the JSX would empty HREFS
    // and every test below would vacuously pass.
    expect(HREFS.length).toBeGreaterThanOrEqual(4);
  });

  it.each([...new Set(HREFS)])("%s resolves to a real page", (href) => {
    expect(pageFor(href).some(existsSync), `${href} has no page.tsx`).toBe(true);
  });

  /*
   * The two the brief asked for and this menu deliberately does not offer.
   *
   * `/orders` has no route — the order history is a section inside /account, so
   * a row pointing at /orders would 404. `/my-cakes` is not a missing link but a
   * missing feature: Design has no owner column, app/api/designs/route.ts writes
   * three fields and reads no session, and nothing anywhere can list one
   * person's designs. If either is ever built, delete the line here that names
   * it — that is the reminder, and it fires as a failure rather than as a note
   * nobody reads.
   */
  it.each(["/orders", "/my-orders", "/my-cakes", "/cakes", "/designs"])(
    "does not offer %s, which does not exist",
    (missing) => {
      expect(HREFS).not.toContain(missing);
      // And it really is absent, rather than absent-and-also-now-built.
      expect(pageFor(missing).some(existsSync), `${missing} exists now — offer it`).toBe(false);
    },
  );
});

/**
 * The staff rows, as a table.
 *
 * This is the same `allows` the component calls, which is the point: the menu
 * decides what to draw with the ranking function rather than with an equality
 * check, so ADMIN keeps the kitchen it is entitled to. An `=== "KITCHEN"` would
 * pass a naive test and hide the kitchen board from the owner.
 *
 * **What this is not.** It proves what the menu *draws*, and drawing is not
 * authorising. /admin is shut by `requireAdmin()` in its layout and /kitchen by
 * `requireKitchen()` in its page, whatever any of this returns —
 * tests/auth.test.ts settles that matrix and e2e/auth.spec.ts proves it is wired
 * to the routes.
 */
describe("who is shown which portal", () => {
  const CASES: [UserRole | null, { admin: boolean; kitchen: boolean }][] = [
    [null, { admin: false, kitchen: false }],
    ["CUSTOMER", { admin: false, kitchen: false }],
    ["KITCHEN", { admin: false, kitchen: true }],
    ["ADMIN", { admin: true, kitchen: true }],
  ];

  it.each(CASES)("%s", (role, expected) => {
    expect(allows(role, "ADMIN")).toBe(expected.admin);
    expect(allows(role, "KITCHEN")).toBe(expected.kitchen);
  });

  it("gates the portal rows on the ranking function, not on equality", () => {
    // The bug this guards is invisible in a screenshot: `role === "KITCHEN"`
    // renders a correct-looking menu for a baker and silently drops the kitchen
    // board out of the owner's.
    expect(SOURCE).toContain('allows(role, "ADMIN")');
    expect(SOURCE).toContain('allows(role, "KITCHEN")');
    expect(SOURCE).not.toMatch(/role\s*===\s*"(KITCHEN|ADMIN)"/);
  });

  it("never names a role at somebody it grants nothing to", () => {
    // A customer is the default and is told nothing about it; the label table in
    // the component carries an empty string for exactly that reason.
    expect(SOURCE).toContain('CUSTOMER: ""');
  });
});

describe("the menu reads the role from the server, not the browser", () => {
  it("fetches /api/me and nothing else", () => {
    expect(SOURCE).toContain('fetch("/api/me"');
  });

  it.each(["localStorage", "sessionStorage", "useStore", "zustand", "searchParams"])(
    "does not decide anything from %s",
    (forbidden) => {
      expect(SOURCE).not.toContain(forbidden);
    },
  );

  it("asks the endpoint that refuses to be cached by an intermediary", () => {
    const route = readFileSync(path.join(ROOT, "app/api/me/route.ts"), "utf8");
    // A shared cache holding one person's role and replaying it to the next
    // visitor is a privilege leak with nothing in the logs to explain it.
    expect(route).toContain("private, no-store");
    // Read-only by construction: no way in for a client-chosen role.
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
  });
});
