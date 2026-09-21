"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * "You have unsaved changes."
 *
 * §25's requirement, and it needs two separate mechanisms because leaving a
 * page means two unrelated things.
 *
 * **Leaving the site** — a reload, a typed URL, closing the tab — is
 * `beforeunload`. The browser owns that dialog: the wording is the browser's,
 * it cannot be styled, and returning a string from the handler is deprecated in
 * favour of `preventDefault`. It is also the only thing that works, because no
 * page script can prevent a tab from closing. Registered only while there are
 * genuinely unsaved changes, because a permanently-registered handler disables
 * the back/forward cache for the whole page.
 *
 * **Leaving for another admin page** is a `<Link>` click, and that one this can
 * own properly — which is what §25 is actually describing, with its Stay and
 * Discard Changes buttons.
 *
 * ## Why a capture-phase click listener rather than a router API
 *
 * The App Router has no navigation-blocking hook. `useRouter` cannot be
 * intercepted, `next/navigation` exposes no events, and the community answers
 * are all either patching the history object or wrapping every Link in the
 * application. This listens for clicks on anchors during the capture phase,
 * which happens before Link's own handler runs, and stops the ones that would
 * leave the page.
 *
 * It is honest about its limits, which are worth stating because a guard that
 * is trusted more than it deserves is worse than none:
 *
 *   - a programmatic `router.push` from some other component is not caught;
 *   - the browser Back button is not caught (it is a popstate that has already
 *     happened by the time anything can see it);
 *   - a middle-click or Cmd-click is deliberately let through — it opens a new
 *     tab and leaves this page, and its edits, exactly where they are.
 *
 * The first two are covered by `beforeunload` on a real page load and not at
 * all on a soft navigation. That residual gap is the reason the save button in
 * every form using this is always visible rather than only appearing when
 * dirty.
 */
export function useUnsavedGuard(dirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  /* ── leaving the site ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      /* `preventDefault` is the modern spelling; `returnValue` is what older
         Safari and Firefox actually check. Both, because the cost is one line
         and the failure is silently losing somebody's work. */
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /* ── leaving for another page in the portal ───────────────────────────── */
  useEffect(() => {
    if (!dirty) return;

    const onClick = (e: MouseEvent) => {
      /* Let the browser have the ones that do not replace this page. */
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      /* A download is not a navigation. */
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      /* Off-site links go through beforeunload above, which is the browser's
         job and better at it. */
      if (url.origin !== window.location.origin) return;
      /* A jump to an anchor on this same page changes nothing. */
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      setPendingHref(url.pathname + url.search);
    };

    /* Capture, so this runs before Link's own click handler navigates. */
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  const discard = useCallback(() => {
    const href = pendingHref;
    setPendingHref(null);
    if (href) router.push(href);
  }, [pendingHref, router]);

  const stay = useCallback(() => setPendingHref(null), []);

  return { blocking: pendingHref !== null, discard, stay };
}

/** The dialog half. Rendered by whatever form is using the hook. */
export function UnsavedDialog({
  blocking,
  onDiscard,
  onStay,
}: {
  blocking: boolean;
  onDiscard: () => void;
  onStay: () => void;
}) {
  return (
    <ConfirmDialog
      open={blocking}
      title="You have unsaved changes"
      body="Leaving now will lose what you have typed. Nothing has been saved yet."
      /* Stay is the safe answer and so it is Cancel — the button the dialog
         autofocuses and the one Escape triggers. Discard is the destructive
         one and is styled as such. */
      cancelLabel="Stay on this page"
      confirmLabel="Discard changes"
      onConfirm={onDiscard}
      onCancel={onStay}
    />
  );
}
