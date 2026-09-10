"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { UserRole } from "@prisma/client";
import { allows } from "@/lib/roles";
import { eyebrow, iconBtn } from "@/lib/ui";

/**
 * The one account control on the shopfront, top right.
 *
 * This replaces the pair of "Log in" / "Sign up" text links that used to sit
 * here. Two controls at the right edge of a bar that already carries a wordmark,
 * a locality, three section links, a presets link and the one filled call to
 * action is where a header stops fitting on a laptop — "Sign up" was already
 * `hidden md:inline-flex`, which is to say it had already been given up on below
 * 768px. One 44px square is the same control at every width, so nothing has to
 * be hidden and nothing has to be decided per breakpoint.
 *
 * ## Why the native popover, and not a div
 *
 * The header is `sticky top-0 z-30 … backdrop-blur-md`. A `backdrop-filter`
 * makes an element a containing block *and* a stacking context, so an
 * absolutely-positioned panel inside this header resolves against the header's
 * own padding box and cannot lift itself above the bar — it would be
 * mispositioned and then clipped by the thing it hangs off. Every fix for that
 * is worse than the disease: portal the panel to the body and hand-roll the
 * position, or move it out of the header and hand-roll the anchoring.
 *
 * `popover="auto"` renders in the **top layer**, whose containing block is the
 * viewport and which paints above the entire document — the header's stacking
 * context is simply not in the conversation, and neither is the z-[100] skip
 * link. It also ships, from the platform, the three behaviours that are the
 * usual reason a dropdown is subtly broken:
 *
 *   - light dismiss — a click anywhere outside closes it;
 *   - Escape closes it;
 *   - focus returns to the invoker when it closes with focus inside.
 *
 * None of that is code here, which is the point. What is left to write is the
 * `aria-expanded` mirror and closing on navigation, because those are the two
 * things `popover` deliberately does not decide for you.
 *
 * ## Not a `role="menu"`
 *
 * These are links to pages. `role="menu"` is the application-menu pattern and
 * taking it on obliges `role="menuitem"` children, focus moved into the panel on
 * open, a roving tabindex, Home/End and typeahead — and `aria-required-children`
 * is a WCAG 2.0 A rule the a11y suite already runs, so a half-built menu fails
 * CI rather than merely reading badly. A `<nav>` of anchors gets Tab, Enter and
 * a screen reader's link list for free, and is what this actually is.
 *
 * ## Why the homepage is still static
 *
 * A client component, deciding in the browser from Clerk's own session. No
 * `cookies()`, no `auth()`, nothing that opts `/` out of the prerender — it is
 * in `.next/prerender-manifest.json` and it stays there. The role is the one
 * fact the browser cannot know, and it is fetched from /api/me on first open
 * rather than read on the server, for exactly this reason.
 *
 * ## Not in the builder
 *
 * Deliberately absent from `/build`, as its predecessor was. That flow is nine
 * steps of a customer's attention and an account is required at no point in it.
 */

/** Singleton by construction — one header, one bar, one of these. */
const MENU_ID = "account-menu";

/**
 * Whether there is a Clerk instance to ask.
 *
 * Read once at module scope because `NEXT_PUBLIC_*` is inlined at build time, so
 * this is a constant folded into the bundle rather than a lookup.
 *
 * **The hazard this guards.** app/layout.tsx only mounts `<ClerkProvider>` when
 * the key is set, and `useUser()` throws without a provider. Hooks cannot be
 * called conditionally, so the branch has to be a *component* boundary — hence
 * `<Session>` below, which is the only thing that touches a Clerk hook and is
 * only ever rendered on the configured side of this constant.
 */
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function AccountMenu() {
  const panel = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  /* One request per page, not one per open. */
  const asked = useRef(false);

  /** Close on navigation — see the note on `Row`. */
  const close = useCallback(() => {
    const el = panel.current;
    // `hidePopover()` on a popover that is not showing throws InvalidStateError.
    if (el?.matches(":popover-open")) el.hidePopover();
  }, []);

  /**
   * Mirror the popover's real state onto the button, and fetch the role.
   *
   * `aria-expanded` is not maintained by the platform — `popovertarget` wires up
   * the *behaviour* and leaves the semantics to the author — so this is the one
   * piece of state that has to be kept by hand. `toggle` fires for every way the
   * popover can close, light dismiss and Escape included, which is why the
   * attribute cannot drift from what is on screen.
   *
   * The role rides along on the first open rather than on mount: the panel is
   * opened by a small minority of visitors, and a fetch on every homepage load
   * would tax the static page for nothing. By the time anybody reads as far as
   * the second row it has landed.
   */
  function onToggle(e: React.ToggleEvent<HTMLElement>) {
    const showing = e.newState === "open";
    setOpen(showing);
    if (!showing || asked.current || !CONFIGURED) return;
    asked.current = true;

    fetch("/api/me", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { role?: UserRole | null } | null) => setRole(d?.role ?? null))
      // A failed request leaves `role` null, so the staff rows stay off. The
      // menu is not the authorisation — see /api/me — but it should still fail
      // in the direction of showing somebody less rather than more.
      .catch(() => {});
  }

  return (
    <>
      {/*
        Rendered only where there is a Clerk instance to ask, for exactly the
        reason `<Session>` is — `useUser()` throws without a provider, hooks
        cannot be called conditionally, so the branch has to be a component
        boundary. This is a conditional *render*, not a conditional hook.
      */}
      {CONFIGURED && <AccountLink />}

      {/* min-h-11 so the bar is its final height from the first frame. The
          control inside is a fixed 44px square in every state, signed in or out,
          resolved or not, so this end of the header never reflows and never
          pushes the call to action beside it. */}
      <span className="inline-flex min-h-11 items-center">
        <button
          type="button"
          popoverTarget={MENU_ID}
          aria-controls={MENU_ID}
          aria-expanded={open}
          /* The icon says nothing to a screen reader, and "Account" is the word
             both states of this menu are about. */
          aria-label="Account"
          className={iconBtn()}
        >
          <PersonGlyph />
        </button>

        <nav
          ref={panel}
          id={MENU_ID}
          popover="auto"
          aria-label="Account"
          onToggle={onToggle}
          className={PANEL}
        >
          {/*
            Always rendered, never gated on `open`.

            Gating these on the open state cost a frame: the popover is shown by
            the platform the moment the button is pressed, but the children only
            appear on the React re-render that the `toggle` event schedules — so
            for one frame there was an empty panel, and Enter-then-Tab moved
            focus straight past it into the page behind. A keyboard user pressing
            two keys quickly is not an edge case, it is how a keyboard is used.

            The gate also bought nothing. "Fetch the role on first open" is
            enforced by `onToggle` above, not by when this subtree mounts, so a
            closed panel already costs no request. What it mounts is one Clerk
            subscription on a provider that is resolving the session regardless.
          */}
          {CONFIGURED ? <Session role={role} close={close} /> : <Guest close={close} />}
        </nav>
      </span>
    </>
  );
}

/**
 * "Account & orders", promoted out of the panel and onto the bar.
 *
 * It was a row inside the menu, which meant the one destination a signed-in
 * customer actually comes back for — where is my order — was two interactions
 * deep behind an unlabelled icon. It is one now.
 *
 * ## Why this is signed-in only, and not a change in who sees what
 *
 * The row this replaces lived inside `<Session>`, never inside `<Guest>`: a
 * signed-out visitor was offered "Sign in" and "Create account" and was never
 * offered /account, because /account for a guest is a redirect to the sign-in
 * page wearing an account page's name. So the gate here is the same gate that
 * was already there, moved. What a guest sees in the bar is unchanged — one
 * 44px square — which is also what keeps the measured widths in app/page.tsx
 * true for the visitors who are nearly all of them.
 *
 * ## Why `hidden sm:inline-flex`, and what covers the gap
 *
 * app/page.tsx measured this bar: at 375px it was 9px over with "Start
 * building" still in it, which is why that button is `max-sm:hidden`. Below
 * 640px the bar is a wordmark and one 44px square, and "ACCOUNT & ORDERS" is
 * wider than the room that leaves — it would put the account control back off
 * the right edge, which is the bug the whole menu exists to have fixed.
 *
 * So below sm the destination goes back into the panel, as a `sm:hidden` row —
 * see `<Session>`. The two are complements on the same 640px, so there is
 * exactly one path to /account at every width and never two.
 *
 * `whitespace-nowrap` because "ACCOUNT &" / "ORDERS" on two lines would grow
 * the 68px bar a second row of text, which is the exact failure the locality's
 * `lg:hidden xl:block` in app/page.tsx exists to avoid.
 */
function AccountLink() {
  const { isSignedIn } = useUser();
  /* `isLoaded` is deliberately not consulted. Until Clerk resolves,
     `isSignedIn` is false and this renders nothing, which is the same quiet
     default the panel takes — and it is the state a guest stays in forever, so
     the overwhelmingly common case never draws and never shifts. */
  if (!isSignedIn) return null;

  return (
    <Link href="/account" className={BAR_LINK}>
      Account &amp; orders
    </Link>
  );
}

/* ----------------------------------------------------------------- states */

/**
 * Signed out, and the no-instance deployment too.
 *
 * With no Clerk instance there is nothing to sign in to, but the door is not
 * hidden: /sign-in is a page of ours that says so plainly. Same two rows either
 * way, so the control is never missing from the bar.
 */
function Guest({ close }: { close: () => void }) {
  return (
    <>
      <p className={`${eyebrow} px-4 py-3`}>Account</p>
      <div className={GROUP}>
        <Row href="/sign-in" close={close}>Sign in</Row>
        <Row href="/sign-up" close={close}>Create account</Row>
      </div>
    </>
  );
}

/**
 * Whoever is actually signed in.
 *
 * The name and the address come from Clerk, client-side, because they are the
 * person's own fields and printing them back is the only thing done with them.
 * The **role does not** — it is a column in Postgres that no browser can read
 * and that nothing on a request path can write. It arrives from /api/me, and
 * until it does this renders exactly the rows a customer gets, which is the
 * quiet default rather than a spinner.
 */
function Session({ role, close }: { role: UserRole | null; close: () => void }) {
  const { isLoaded, isSignedIn, user } = useUser();

  // Only ever seen by somebody who opens this within a few hundred ms of the
  // page loading. It is inside the closed panel, so it is not the "Sign in →
  // Admin" flicker on the bar that this design is meant to avoid.
  if (!isLoaded) {
    return <p className="px-4 py-3 font-sans text-meta text-steel">Checking&hellip;</p>;
  }
  if (!isSignedIn) return <Guest close={close} />;

  const email = user.primaryEmailAddress?.emailAddress;
  /* A customer is never told they are a "CUSTOMER" — it is the default, it
     grants nothing they would notice, and printing an internal enum at somebody
     is jargon pretending to be information. A role is named only when it opens a
     door. Same rule as app/account/page.tsx. */
  const rank = role && role !== "CUSTOMER" ? RANK_LABEL[role] : null;

  return (
    <>
      <div className="flex flex-col gap-0.5 px-4 py-3">
        {user.fullName && (
          <span className="truncate font-mono text-micro tracking-[0.14em] text-ink uppercase">
            {user.fullName}
          </span>
        )}
        {/* Not uppercased and not tracked out: an email address is a string to
            be read back, not a label. `truncate` because a long one would
            otherwise set the width of the whole panel. */}
        {email && <span className="truncate font-sans text-meta text-steel">{email}</span>}
        {rank && (
          <span className="mt-1 font-mono text-micro tracking-[0.14em] text-graphite uppercase">
            {rank}
          </span>
        )}
      </div>

      <div className={GROUP}>
        {/*
          `sm:hidden`, because "Account & orders" is a button on the bar now —
          `<AccountLink>` below — and that button is itself `hidden sm:inline-flex`
          because the bar has no room for it on a phone.

          So the two are exact complements rather than a duplicate: above 640px
          the destination is on the bar and this row would be a second control
          for the same page within 200px of itself; below 640px the bar cannot
          hold it and this row is the only way to reach the one page a returning
          customer actually wants. Exactly one path to /account at every width,
          decided in CSS, with no second breakpoint to keep in step — `sm` here
          and `sm` there is the same 640px both times.
        */}
        <Row href="/account" close={close} extra="sm:hidden">
          Account &amp; orders
        </Row>

        {/*
          `allows`, not `role === "…"`. ROLE_RANK puts ADMIN above KITCHEN
          deliberately — whoever reprices the menu is also the person who moves a
          docket when the counter is busy — so an equality check would hide the
          kitchen from the owner, and contradict /account, which already offers
          an admin both.

          And this is drawing, not deciding. /admin is shut by `requireAdmin()`
          in its own layout and /kitchen by `requireKitchen()` in its page; a
          customer who types either URL is turned away by that guard whatever
          this menu chose to render.
        */}
        {allows(role, "ADMIN") && <Row href="/admin" close={close}>Admin portal</Row>}
        {allows(role, "KITCHEN") && <Row href="/kitchen" close={close}>Kitchen board</Row>}
      </div>

      <div className={GROUP}>
        {/*
          Clerk's own control rather than a server action calling its API: it
          ends the session at Clerk as well as in this browser, which is the
          difference between a shared counter tablet being signed out and merely
          looking signed out. The same component the account page and both staff
          headers already use.
        */}
        <SignOutButton redirectUrl="/">
          <button type="button" className={ROW}>Sign out</button>
        </SignOutButton>
      </div>
    </>
  );
}

/**
 * One row of the panel.
 *
 * `onClick` closes it, and that is not belt-and-braces: these are client-side
 * navigations, so without it the panel would still be hanging open over the page
 * it just took you to. The platform closes a popover on light dismiss and on
 * Escape; it has no opinion about a route change, because it cannot see one.
 */
function Row({
  href,
  close,
  children,
  extra = "",
}: {
  href: string;
  close: () => void;
  children: React.ReactNode;
  /** Appended, so a caller can add a variant — see the `sm:hidden` row above. */
  extra?: string;
}) {
  return (
    <Link href={href} onClick={close} className={`${ROW} ${extra}`}>
      {children}
    </Link>
  );
}

/**
 * The fallback profile mark, and the only one.
 *
 * Clerk hands out an `imageUrl` for every account, generated initials included,
 * and it is deliberately not used. §1.4 is "radius 0 on everything", so a
 * photograph in a circle would be the one round thing in the product; a
 * photograph in a square is worse. It would also mean a remote image host in
 * next.config and a request that can fail or arrive late in the one part of the
 * bar that must not change size. The name and the address are inside the panel,
 * which is where the personalisation belongs.
 *
 * Drawn rather than imported: there is no icon library in this repository and
 * this is two shapes' worth of path data, which is not a dependency's worth of
 * problem. `1.25` stroke to sit with the hairline rules rather than on top of
 * them.
 */
function PersonGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8.5" r="3.25" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

/* ------------------------------------------------------------------ style */

/** What a rank is called out loud, on the two occasions it is said at all. */
const RANK_LABEL: Record<UserRole, string> = {
  CUSTOMER: "",
  KITCHEN: "Kitchen",
  ADMIN: "Administrator",
};

/**
 * The panel.
 *
 * `top-[68px]` is the header's own `h-[68px]`, so the sheet hangs off the bar's
 * bottom rule; the header is `sticky top-0`, so that stays true down the page.
 * `right-4 sm:right-8 lg:right-14` mirrors the header's own `px-4 sm:px-8
 * lg:px-14`, which is what keeps the panel's right edge on the trigger's at
 * every breakpoint without measuring anything.
 *
 * **`left-auto bottom-auto m-0` are load-bearing.** The UA stylesheet gives
 * `[popover]` `inset: 0` and `margin: auto`, and Tailwind's preflight resets
 * neither — without these three the panel centres itself in the viewport.
 *
 * `w-[min(17rem,calc(100vw-2rem))]` is why there is no mobile variant of any of
 * this: at 320px it is 272px wide inside a 288px gutter-to-gutter box, and it
 * cannot overflow at any width because the viewport is one side of the `min()`.
 * `max-h` + `overflow-y-auto` does the same for a short landscape phone.
 *
 * No `z-*`: the top layer is above every stacking context on the page, so a
 * z-index here would be a number that does nothing.
 */
const PANEL =
  "paper-edge fixed top-[68px] right-4 bottom-auto left-auto m-0 sm:right-8 lg:right-14 "
  + "w-[min(17rem,calc(100vw-2rem))] max-h-[calc(100dvh-5.5rem)] overflow-y-auto "
  + "bg-paper py-1 text-ink "
  /* `open:` is Tailwind's `:is([open], :popover-open, :open)`. `step-in` is the
     builder's own entrance — the panel arrives the way a step does. Reduced
     motion is already killed globally in app/globals.css. */
  + "open:animate-[step-in_var(--dur-ui)_var(--ease-out)]";

/**
 * The bar's own account button.
 *
 * Bordered rather than a rule-under-text like "Explore presets" beside it, and
 * that is the point of difference: it borrows `iconBtn()`'s exact edge —
 * `border-rule-strong bg-paper text-graphite`, hover to `border-ink text-ink` —
 * so the label and the 44px square next to it read as one pair of account
 * controls rather than as two unrelated things that happen to be adjacent.
 *
 * Not `btn("secondary", "md", …)`, which is the same border and would have been
 * the reuse. `btn` hard-codes `text-body` in its size, and this bar is
 * `font-mono text-micro` — two font-size utilities in one class string, where
 * the winner is decided by Tailwind's own ordering in the built stylesheet and
 * not by which one I wrote last. The rest of this file already carries two
 * notes about losing that bet (`sm:contents`, `duration-[--dur-ui]`), so the
 * classes are spelled out rather than gambled on.
 *
 * `min-h-11` and not `h-11`: never below 44px is the rule in lib/ui.
 */
const BAR_LINK =
  "hidden min-h-11 shrink-0 items-center whitespace-nowrap border border-rule-strong "
  + "bg-paper px-3.5 font-mono text-micro tracking-[0.14em] text-graphite uppercase "
  + "transition-colors duration-[var(--dur-ui)] ease-[var(--ease-out)] "
  + "hover:border-ink hover:text-ink sm:inline-flex";

/**
 * A row. 44px on the row itself rather than on a span inside it — these are
 * full-bleed, so the box *is* the target and there is none of the floating
 * hairline problem the bar's own nav links have.
 *
 * `duration-[var(--dur-ui)]`, never `duration-[--dur-ui]`: Tailwind v4 dropped
 * the shorthand, and the short form compiles to an invalid declaration that
 * silently resolves to 0s. Both spellings are in this repository; this is the
 * one that works.
 */
const ROW =
  "flex min-h-11 w-full items-center px-4 text-left font-mono text-micro "
  + "tracking-[0.14em] text-graphite uppercase transition-colors "
  + "duration-[var(--dur-ui)] ease-[var(--ease-out)] hover:bg-counter hover:text-ink";

/** A hairline between sections, as everything else on this paper divides. */
const GROUP = "mt-1 flex flex-col border-t border-rule pt-1";
