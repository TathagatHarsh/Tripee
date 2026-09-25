import { Earnings } from "@/components/assignment/Earnings";
import Link from "next/link";
import { CakePhoto } from "@/components/shop/CakePhoto";
import { Icon } from "@/components/admin/icons";
import { StatusBadge } from "@/components/admin/ui";
import { sizeName } from "@/lib/cakes";
import { formatIST, titleCase } from "@/lib/format";
import { dueAt } from "@/lib/orders";
import { servingsLabel } from "@/lib/servings";
import {
  dueUrgency,
  isVendorFinished,
  VENDOR_NEXT,
  VENDOR_STATUS_LABEL,
  VENDOR_STATUS_TONE,
} from "@/lib/vendors";
import type { VendorCard } from "./data";
import { DueBadge } from "./DueBadge";
import { OrderActions } from "./OrderActions";

/**
 * One cake, as the person making it needs it.
 *
 * §9's list in the order somebody at a bench actually reads it, which is not the
 * order the database stores it in:
 *
 *   1. **What cake?** The photograph and the name, biggest thing on the card.
 *   2. **When?** The countdown, then the absolute time under it.
 *   3. **What do I press?** One large button, and only the legal one.
 *
 * Everything else — who it is for, the slot, the message, the allergens — sits
 * between 2 and 3 in small type, because it is read once while the cake is being
 * made rather than scanned across a room.
 *
 * ## The photograph is the order's, not the shop's
 *
 * `order.cakeImageUrl` is frozen on the Order row at checkout. A bakery must see
 * the cake that was sold, and an owner who replaces Chocolate Truffle's
 * photograph this afternoon must not silently change what a cake already in
 * somebody's oven is supposed to look like. §24 and §35 are the same rule stated
 * for the customer and for the catalogue; this is it stated for the kitchen.
 *
 * With no photograph, `CakePhoto` draws the cake from its configuration rather
 * than showing a stock picture of somebody else's, and the drawing is real: real
 * tiers, real frosting colour. See the note on that file.
 *
 * ## There is no quantity on this card, and that is not an omission
 *
 * §9 asks for one. The product does not have one: `app/api/orders` writes one
 * order per cake, so an order for two is two references, two dockets and two
 * cards. Printing "Quantity 1" on every card in the kitchen would be a field
 * that is never anything else, and a baker who learned to read it would one day
 * meet a second card and take it for a duplicate.
 */
export function OrderTicket({
  card,
  /** The board shows the forward move inline. The history list shows none. */
  actions = true,
}: {
  card: VendorCard;
  actions?: boolean;
}) {
  const { order, config, status } = card;
  const due = dueAt(order);
  const finished = isVendorFinished(status);

  /*
   * One clock for the card, read once and handed to the badge as well.
   *
   * The border says the same thing the badge says, so they must not be two
   * readings taken a moment apart: a border drawn from the server's clock beside
   * a badge drawn from the browser's is a card that can show a calm edge around
   * a red countdown. DueBadge starts from this value and then follows the
   * browser's own clock — see the note there on why the first render has to
   * match byte for byte.
   *
   * ponytail: the border is server-time and does not re-colour on its own, so a
   * tablet left open all morning keeps the edge it was rendered with while the
   * badge inside it stays live. The badge is the signal that has to be right and
   * it is; lift the border into the client component if the edge itself ever
   * needs to change without a navigation.
   */
  const now = new Date();
  /* Urgency is only a question while somebody can still do something about it.
     A cake handed over last Tuesday is not late, and colouring it red on the
     history page would be the board shouting at nobody. */
  const urgent = !finished && dueUrgency(due, now) !== "later";

  const name = order.cakeName ?? "Custom cake";
  const size = config ? sizeName(config.size) : null;
  /* Whether it has egg in it, from the order's own frozen config — which is
     where the chosen variant landed when the order was placed. §22: the bench
     needs this and it is not derivable from the cake's name. */
  const sponge = config ? (config.eggless ? "Eggless" : "With egg") : null;
  const message = config?.message?.trim();

  return (
    <article
      className={[
        "vendor-ticket flex flex-col overflow-hidden rounded-a border bg-a-surface shadow-a-card",
        "transition-[border-color,box-shadow] duration-[var(--dur-ui)]",
        urgent ? "border-a-bad-line" : "border-a-line",
      ].join(" ")}
    >
      {/* ── what cake ──────────────────────────────────────────────────── */}
      <div className="flex gap-3 p-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-a-sm border border-a-line bg-a-sunken sm:size-24">
          <CakePhoto
            src={order.cakeImageUrl}
            /* Empty, because the cake is named in words immediately beside it.
               Alt text repeating an adjacent heading is read out twice. */
            alt=""
            config={config}
            sizes="96px"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="font-a-sans text-a-item leading-tight font-semibold text-balance text-a-ink">
            {order.cakes.length > 1
              ? `${order.cakes.length} cakes · ${name}`
              : name}
          </h3>
          <p className="font-a-mono text-a-small tabular-nums text-a-muted">
            {[size, sponge, config ? servingsLabel(config) : null]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
          <p className="mt-auto">
            <Link
              href={`/vendor/orders/${order.ref}`}
              className="font-a-mono text-a-meta tabular-nums text-a-accent-ink underline decoration-a-accent-line underline-offset-2"
            >
              {order.ref}
            </Link>
          </p>
        </div>
      </div>

      {order.cakes.length > 1 && (
        <ul className="border-t border-a-line px-4 py-3 text-a-small">
          {order.cakes.map((cake, i) => (
            <li key={cake.id} className="py-1">
              <strong>
                {i + 1}. {cake.cakeName ?? "Custom cake"}
              </strong>
              <span className="block text-a-muted">{cake.variantLabel}</span>
            </li>
          ))}
        </ul>
      )}
      {order.customerNotes && (
        <p className="border-t border-a-line px-4 py-3 text-a-small text-a-muted">
          Note: {order.customerNotes}
        </p>
      )}
      {/* ── when ───────────────────────────────────────────────────────── */}
      <div
        className={[
          "flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t px-3 py-2.5",
          urgent
            ? "border-a-bad-line bg-a-bad-wash"
            : "border-a-line bg-a-sunken",
        ].join(" ")}
      >
        {finished ? (
          <StatusBadge
            label={VENDOR_STATUS_LABEL[status]}
            tone={VENDOR_STATUS_TONE[status]}
          />
        ) : (
          <DueBadge dueISO={due.toISOString()} nowISO={now.toISOString()} />
        )}
        <span className="font-a-mono text-a-meta tabular-nums text-a-muted">
          {formatIST(due)}
        </span>
      </div>

      {/* ── the details that are read once, while making it ─────────────── */}
      <dl className="flex flex-col gap-1.5 px-3 py-2.5 text-a-small">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-a-muted">For</dt>
          <dd className="min-w-0 flex-1 text-a-ink">
            {order.customerName ?? "No name taken"}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-a-muted">Slot</dt>
          <dd className="min-w-0 flex-1 text-a-ink">
            {titleCase(order.deliverySlot)}
          </dd>
        </div>
        {message && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-a-muted">Pipe</dt>
            {/*
              Quoted and never title-cased. This is the one string on the card
              that goes onto the cake letter for letter, and a helper that
              tidied "happy bday NANI" into "Happy Bday Nani" would be the
              kitchen quietly editing a customer's words.
            */}
            <dd className="min-w-0 flex-1 font-medium text-a-ink">
              &ldquo;{message}&rdquo;
            </dd>
          </div>
        )}
      </dl>

      {order.allergens.length > 0 && (
        <p className="flex items-start gap-1.5 border-t border-a-warn-line bg-a-warn-wash px-3 py-2 text-a-small leading-snug font-medium text-a-warn-ink">
          <Icon name="alert" size={15} className="mt-px shrink-0" />
          Contains {order.allergens.join(", ")}
        </p>
      )}

      {!config && (
        <p className="flex items-start gap-1.5 border-t border-a-bad-line bg-a-bad-wash px-3 py-2 text-a-small leading-snug font-medium text-a-bad-ink">
          <Icon name="alert" size={15} className="mt-px shrink-0" />
          This order&rsquo;s specification cannot be read. Ring MakeYourCakes
          before you start.
        </p>
      )}

        <Earnings snapshot={card} address={[order.addressLine1, order.addressLine2, order.city, order.state, order.pincode].filter(Boolean).join(", ")} location={order.deliveryLocation} />
      {/* ── what to press ──────────────────────────────────────────────── */}
      {actions && VENDOR_NEXT[status].length > 0 && (
        <div className="mt-auto flex flex-col gap-2 border-t border-a-line p-3">
          {/*
            The forward move only. Declining needs the order in front of you and
            a box to say why, which is the detail page — see OrderActions' own
            note on the reason panel.
          */}
          <OrderActions
            assignmentId={card.id}
            orderRef={order.ref}
            next={VENDOR_NEXT[status]}
            compact
          />

          {/*
            §11 puts Accept and Reject side by side on a new order, and the
            second one is a link rather than a button because of where it has to
            go. A decline asks a question — which of five reasons, and anything
            to add — and that fieldset does not fit in a column this narrow
            without pushing every other card below the fold.

            So it is honest about being a journey: the word says Decline and it
            lands on the page where you decline. What it must not do is submit
            anything from here, because a one-tap decline with no reason is the
            outcome §12 exists to avoid.
          */}
          {VENDOR_NEXT[status].includes("rejected") && (
            <Link
              href={`/vendor/orders/${order.ref}`}
              className="flex min-h-12 items-center justify-center rounded-a border border-a-line px-4 font-a-sans text-a-small font-medium text-a-bad-ink transition-colors hover:border-a-bad-line hover:bg-a-bad-wash"
            >
              Can&rsquo;t take it? Decline
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
