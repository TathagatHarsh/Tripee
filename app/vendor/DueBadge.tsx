"use client";

import { useEffect, useState } from "react";
import { DUE_TONE, dueLabel, dueUrgency } from "@/lib/vendors";
import { StatusBadge } from "@/components/admin/ui";

/**
 * How long is left, kept true.
 *
 * ## Why this is the one client component on the board
 *
 * Everything else here is server-rendered, and a relative time is the reason to
 * break that. This board is opened at six in the morning on a tablet propped
 * against a wall and is not touched again until something needs collecting. A
 * server-rendered "Due in 6 hours" is correct for one minute and wrong for the
 * rest of the shift, and the whole point of §9's urgency is that somebody acts
 * on it. An absolute time never goes stale but also never shouts; the card
 * carries both, and this is the half that has to keep moving.
 *
 * ## No timestamp is invented
 *
 * `dueISO` is `lib/orders`' `dueAt` serialised: the moment the order was placed
 * plus the lead hours the slot the customer chose promised. That is the window
 * they were quoted, so it is the one a bakery should be judged against, and it
 * is the same arithmetic the admin's order book, the delivery board and the
 * kitchen use. This component does subtraction on it and nothing else.
 *
 * ## `nowISO` is a prop, and that is the whole hydration story
 *
 * The obvious version of this holds `useState(() => new Date())`, which runs
 * once on the server and again in the browser with a different value. Two
 * renders that straddle a band boundary then disagree about the badge's *tone
 * class*, and React reports an attribute mismatch — which `suppressHydrationWarning`
 * does not cover, because it only excuses an element's own text.
 *
 * Taking the server's clock as a prop makes the first client render byte-identical
 * to the server's by construction. The effect then immediately replaces it with
 * the browser's own, which is an ordinary state update after hydration rather
 * than a mismatch during it.
 *
 * The same prop drives the card's urgency border in OrderTicket, so the border
 * and the badge are never two opinions about one cake.
 *
 * ## The interval, and why it is not a minute
 *
 * The smallest unit shown is a minute, so a minute looks like the obvious
 * period. It is the wrong one, because until the first tick the browser is still
 * showing the server's clock — and a label computed from an older `now` shows
 * *more* time remaining than there is, which is the one direction this must not
 * err in. `dueLabel` rounds down for the same reason.
 *
 * Half a minute bounds that drift at thirty seconds on a label whose unit is
 * sixty, which is under the resolution anybody can read. Closing it completely
 * would mean setting state on mount, and a cascading render on every card of a
 * board is what react-hooks/set-state-in-effect exists to catch.
 */
export function DueBadge({ dueISO, nowISO }: { dueISO: string; nowISO: string }) {
  const due = new Date(dueISO);
  const [now, setNow] = useState(() => new Date(nowISO));

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const urgency = dueUrgency(due, now);

  return (
    <StatusBadge
      label={dueLabel(due, now)}
      tone={DUE_TONE[urgency]}
      /* The dot is meaningful here rather than decorative: it is the part of the
         badge that carries across a room, and the words beside it say the same
         thing for anybody who cannot separate the colours. */
      dot={urgency === "late" || urgency === "urgent"}
    />
  );
}
