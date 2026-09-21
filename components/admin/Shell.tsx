"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { SignOutButton } from "@clerk/nextjs";
import { isCurrent, NAV } from "@/lib/adminNav";
import { aBtn } from "./ui";
import { Icon } from "./icons";

/**
 * The frame every admin page sits in.
 *
 * A persistent sidebar on desktop and a drawer under it, which is §4's
 * requirement and a change of kind rather than of style: the portal used to be
 * six text links in a header row, and a header row cannot show that Orders,
 * Deliveries and Vendors are one morning's job while the cakes on sale and the
 * bakery's own settings are decisions made on other days. A sidebar has room for
 * the grouping, and the grouping is the information.
 *
 * ## Why this is a client component and how little of it is
 *
 * Two reasons, both irreducible: `usePathname`, to mark the current item, and
 * the drawer's open state. Everything else — the guard, the viewer's email, the
 * notification counts — is computed on the server in app/admin/layout.tsx and
 * passed in as props. So the JavaScript here is a router hook, a boolean and a
 * key handler; the page's content is server-rendered and never enters this
 * bundle.
 *
 * The alternative, a server sidebar reading the pathname from a header, was
 * tried and abandoned: `x-invoke-path` is not a public contract and marking the
 * current page is not worth depending on one.
 */

export interface ShellProps {
  children: React.ReactNode;
  /** Printed in the account menu. The one thing that matters on a shared office machine. */
  email: string | null;
  /** The bakery's own name, from BakerySettings. Falls back to the product's. */
  bakeryName: string;
  /**
   * Real counts of things that need somebody, computed on the server.
   *
   * §28 is explicit that notifications must be real backend events and not
   * invented ones, so this is exactly two numbers — orders nobody has rung yet,
   * and orders past the window they were quoted — and the panel says nothing
   * when both are zero. There is no notification table and none was added: a
   * per-notification read state would be a feature nobody asked for, and these
   * two numbers are already the answer to "what needs me right now".
   */
  alerts: { awaiting: number; overdue: number };
  /** The global search, rendered on the server so it needs no JavaScript. */
  search: React.ReactNode;
}

export function AdminShell({ children, email, bakeryName, alerts, search }: ShellProps) {
  const pathname = usePathname();
  /*
   * The drawer holds the pathname it was opened *at*, and is considered open
   * only while that still matches. Which means it closes on navigation for
   * free — tapping a link in the drawer on a phone must not navigate behind a
   * panel still covering the page it arrived at, which reads as the link not
   * having worked.
   *
   * This was an effect calling `setDrawer(false)` on a `[pathname]`
   * dependency, and it was the more obvious code. It is also a cascading
   * render — the page commits with the drawer open, the effect fires, it
   * renders again — which is what react-hooks/set-state-in-effect exists to
   * catch. Deriving it is both cheaper and one fewer state to get out of sync.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const drawer = openedAt === pathname;
  const drawerId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  const closeDrawer = useCallback(() => setOpenedAt(null), []);

  /*
   * Escape closes it, and focus goes back to the button that opened it —
   * otherwise focus is left on a link inside a panel that is no longer visible,
   * and the next Tab starts from nowhere.
   *
   * Also locks the body scroll while it is open: a drawer over a scrollable
   * page on iOS scrolls the page behind it, and the drawer's own content is
   * short enough that nobody expects to be scrolling anything.
   */
  useEffect(() => {
    if (!drawer) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDrawer();
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawer, closeDrawer]);

  return (
    /*
     * `a-root` is what opts this subtree out of the storefront's paper grain and
     * onto Inter and the grey canvas — see app/globals.css. It has to be on an
     * element inside <body>, because app/layout.tsx owns <body> and does not
     * know which section is rendering.
     *
     * `print:hidden` is not here but on the chrome below: /admin/orders/[ref]/print
     * is a document a rider carries, and a sidebar printed down the left of it is
     * ink spent on links nobody can click.
     */
    <div className="a-root min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* ── the desktop sidebar ─────────────────────────────────────────── */}
      <div data-admin-chrome className="hidden lg:sticky lg:top-0 lg:block lg:h-dvh">
        <Sidebar pathname={pathname} bakeryName={bakeryName} />
      </div>

      {/* ── the drawer, and the sheet it sits under ─────────────────────── */}
      {drawer && (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeDrawer}
            className="fixed inset-0 z-40 bg-a-ink/45 motion-safe:animate-[a-fade-in_var(--dur-ui)_var(--ease-out)] lg:hidden"
          />
          <div
            id={drawerId}
            className="fixed inset-y-0 left-0 z-50 w-[17rem] max-w-[85vw] motion-safe:animate-[a-drawer-in_var(--dur-settle)_var(--ease-out)] lg:hidden"
          >
            <Sidebar
              pathname={pathname}
              bakeryName={bakeryName}
              onClose={() => {
                closeDrawer();
                toggleRef.current?.focus();
              }}
            />
          </div>
        </>
      )}

      {/* ── the column everything else lives in ─────────────────────────── */}
      <div className="flex min-w-0 flex-col">
        <header data-admin-chrome className="sticky top-0 z-30 border-b border-a-line bg-a-surface/95 backdrop-blur-sm">
          <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-5">
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpenedAt(pathname)}
              aria-expanded={drawer}
              aria-controls={drawerId}
              className={aBtn("ghost", "md", "size-11 !px-0 lg:hidden")}
            >
              <span className="sr-only">Open navigation</span>
              <Icon name="menu" size={19} />
            </button>

            {/* The wordmark only shows where the sidebar does not, so the name
                is on screen exactly once at every width. */}
            <Link
              href="/admin"
              className="font-a-sans text-a-body font-bold tracking-[-0.01em] text-a-ink lg:hidden"
            >
              {bakeryName}
            </Link>

            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
              {search}
              <Notifications alerts={alerts} />
              <Account email={email} />
            </div>
          </div>
        </header>

        {/*
          `min-w-0` on this and on the column above it. Without it a grid child
          takes its width from its widest content, so one wide table would push
          the whole layout past the viewport and produce the horizontal page
          overflow §33 forbids — the table's own scroll box only works if the
          column it is in can be narrower than the table.
        */}
        <main id="main" className="min-w-0 flex-1 px-3 py-5 sm:px-5 sm:py-6 lg:px-7">
          {children}
        </main>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ the sidebar */

function Sidebar({
  pathname,
  bakeryName,
  onClose,
}: {
  pathname: string;
  bakeryName: string;
  onClose?: () => void;
}) {
  return (
    <nav
      aria-label="Admin sections"
      className="flex h-full flex-col overflow-y-auto border-r border-a-nav-active bg-a-nav"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-a-nav-hover px-4">
        <Link
          href="/admin"
          className="min-w-0 flex-1 truncate font-a-sans text-a-item font-bold tracking-[-0.01em] text-a-nav-ink"
        >
          {bakeryName}
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-a-sm text-a-nav-muted transition-colors hover:bg-a-nav-hover hover:text-a-nav-ink"
          >
            <span className="sr-only">Close navigation</span>
            <Icon name="close" size={17} />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-5 px-2.5 py-4">
        {NAV.map((section) => (
          <div key={section.label}>
            <p className="px-2.5 pb-1.5 font-a-sans text-a-micro font-semibold uppercase tracking-[0.11em] text-a-nav-muted">
              {section.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const current = isCurrent(item, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      /*
                       * `aria-current="page"` is the accessible half of the
                       * highlight, and the terracotta left edge is the visual
                       * half. Both, because a nav that marks the current item
                       * only by background colour tells a screen-reader user
                       * nothing and a colour-blind user very little.
                       */
                      aria-current={current ? "page" : undefined}
                      className={[
                        "flex min-h-11 items-center gap-2.5 rounded-a px-2.5",
                        "font-a-sans text-a-body font-medium transition-colors duration-[var(--dur-ui)]",
                        current
                          ? "bg-a-nav-active text-a-nav-ink shadow-[inset_2px_0_0_0_var(--color-a-accent)]"
                          : "text-a-nav-muted hover:bg-a-nav-hover hover:text-a-nav-ink",
                      ].join(" ")}
                    >
                      <Icon name={item.icon} size={17} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* The way back to the shop, at the bottom where a footer goes. An owner
          checking how a price they just changed looks to a customer should not
          have to retype the URL. */}
      <div className="shrink-0 border-t border-a-nav-hover p-2.5">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2.5 rounded-a px-2.5 font-a-sans text-a-body font-medium text-a-nav-muted transition-colors hover:bg-a-nav-hover hover:text-a-nav-ink"
        >
          <Icon name="shop" size={17} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">View the shop</span>
          <Icon name="external" size={13} className="shrink-0 opacity-60" />
        </Link>
      </div>
    </nav>
  );
}

/* ══════════════════════════════════════════════ notifications & account */

/**
 * Two real numbers, or nothing at all.
 *
 * §28's rule is that only real backend events appear here, and the honest
 * consequence of that rule is a bell with no badge on a quiet morning. There is
 * no notification table, no read state and no "catalogue updated" entry — an
 * owner who just changed a price does not need to be told they changed it.
 *
 * A `<details>` rather than a popover with a click-outside handler. It closes on
 * Escape and on a click of its own summary for free, it is keyboard-operable
 * with no handler, and it needs no focus trap because there is nothing in it but
 * two links.
 */
function Notifications({ alerts }: { alerts: { awaiting: number; overdue: number } }) {
  const total = alerts.awaiting + alerts.overdue;

  return (
    <details className="relative shrink-0 [&[open]>summary>span:first-child]:bg-a-idle-wash">
      <summary className="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden">
        <span className="relative flex size-11 items-center justify-center rounded-a text-a-muted transition-colors hover:bg-a-idle-wash hover:text-a-ink">
          <Icon name="bell" size={19} />
          {total > 0 && (
            <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-a-accent px-1 font-a-sans text-[0.625rem] font-bold leading-4 text-white">
              {total > 9 ? "9+" : total}
            </span>
          )}
          <span className="sr-only">
            {total === 0
              ? "Notifications. Nothing needs attention."
              : `Notifications. ${total} ${total === 1 ? "item needs" : "items need"} attention.`}
          </span>
        </span>
      </summary>

      <div className="absolute right-0 top-[calc(100%+0.375rem)] z-40 w-72 overflow-hidden rounded-a border border-a-line bg-a-surface shadow-a-pop">
        <p className="border-b border-a-line bg-a-sunken px-3.5 py-2.5 font-a-sans text-a-micro font-semibold uppercase tracking-[0.09em] text-a-faint">
          Needs attention
        </p>

        {total === 0 ? (
          <p className="px-3.5 py-4 text-a-small leading-relaxed text-a-muted">
            Nothing waiting. Every order has been rung and none is past its window.
          </p>
        ) : (
          <ul className="flex flex-col">
            {alerts.awaiting > 0 && (
              <li>
                <Link
                  href="/admin/orders?status=draft"
                  className="flex items-start gap-2.5 border-b border-a-line px-3.5 py-3 transition-colors last:border-0 hover:bg-a-sunken"
                >
                  <span className="mt-px shrink-0 text-a-warn-ink">
                    <Icon name="phone" size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-a-small font-medium text-a-ink">
                      {alerts.awaiting} {alerts.awaiting === 1 ? "order" : "orders"} awaiting your call
                    </span>
                    <span className="mt-0.5 block text-a-meta leading-snug text-a-muted">
                      Nothing is baked until somebody confirms the details.
                    </span>
                  </span>
                </Link>
              </li>
            )}
            {alerts.overdue > 0 && (
              <li>
                <Link
                  href="/admin/orders?due=late"
                  className="flex items-start gap-2.5 border-b border-a-line px-3.5 py-3 transition-colors last:border-0 hover:bg-a-sunken"
                >
                  <span className="mt-px shrink-0 text-a-bad-ink">
                    <Icon name="clock" size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-a-small font-medium text-a-ink">
                      {alerts.overdue} past the window {alerts.overdue === 1 ? "it was" : "they were"} quoted
                    </span>
                    <span className="mt-0.5 block text-a-meta leading-snug text-a-muted">
                      That is a phone call, not a status change.
                    </span>
                  </span>
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>
    </details>
  );
}

/** Who is holding this session, and how to stop. A `<details>` for the same reasons. */
function Account({ email }: { email: string | null }) {
  /* The first letter of the address, as an avatar. Not a generated identicon
     and not a photo: Clerk has an image URL but printing it here means a
     network request in the header of every page for decoration. */
  const initial = (email ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <details className="relative shrink-0">
      <summary className="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden">
        <span className="flex min-h-11 items-center gap-2 rounded-a px-1.5 transition-colors hover:bg-a-idle-wash">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-a-nav font-a-sans text-a-small font-semibold text-a-nav-ink"
          >
            {initial}
          </span>
          <span className="hidden max-w-[14rem] truncate text-a-small text-a-muted sm:block">
            {email ?? "Signed in"}
          </span>
          <Icon name="chevronDown" size={14} className="hidden shrink-0 text-a-faint sm:block" />
          <span className="sr-only">Account menu</span>
        </span>
      </summary>

      <div className="absolute right-0 top-[calc(100%+0.375rem)] z-40 w-64 overflow-hidden rounded-a border border-a-line bg-a-surface shadow-a-pop">
        <div className="border-b border-a-line bg-a-sunken px-3.5 py-3">
          <p className={"font-a-sans text-a-micro font-semibold uppercase tracking-[0.09em] text-a-faint"}>
            Signed in as
          </p>
          <p className="mt-1 truncate text-a-small font-medium text-a-ink">
            {email ?? "this device"}
          </p>
          <p className="mt-1 text-a-meta text-a-muted">Owner — full access</p>
        </div>

        <div className="flex flex-col p-1.5">
          <Link
            href="/account"
            className="flex min-h-10 items-center gap-2.5 rounded-a-sm px-2.5 text-a-small text-a-muted transition-colors hover:bg-a-sunken hover:text-a-ink"
          >
            <Icon name="staff" size={16} className="shrink-0" />
            Your customer account
          </Link>
          <SignOutButton redirectUrl="/">
            <button
              type="button"
              className="flex min-h-10 w-full items-center gap-2.5 rounded-a-sm px-2.5 text-left text-a-small text-a-muted transition-colors hover:bg-a-bad-wash hover:text-a-bad-ink"
            >
              <Icon name="logout" size={16} className="shrink-0" />
              Sign out
            </button>
          </SignOutButton>
        </div>
      </div>
    </details>
  );
}
