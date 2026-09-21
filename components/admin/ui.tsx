import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { Icon, type IconName } from "./icons";

/**
 * The portal's visual vocabulary, in one file.
 *
 * §35 asks for a set of reusable admin components and lists twenty-two names.
 * They are here and in five sibling files rather than in twenty-two files,
 * split on the one line that actually matters in this codebase: whether a thing
 * needs `"use client"`. Everything in here is server-renderable and stateless,
 * so it costs the browser nothing; the six components that genuinely need an
 * event handler — the shell's drawer, toasts, the confirm dialog, the uploader,
 * the price editor, the availability switch — are client components with their
 * own files, and a page can see at a glance which of its parts ship JavaScript.
 *
 * The alternative — one file per name — was tried in the storefront and lib/ui.ts
 * is the correction: "deliberately a class-string helper rather than a component:
 * the same styling has to land on `<button>`, on next/link's `<a>`, and on a
 * `<label>`, and a wrapper component for each of those is three files to
 * maintain for no gain." `aBtn` below is that same conclusion for this palette.
 *
 * Every colour here is an `a-` token. Nothing in this file names a hex or reaches
 * for `bg-paper` — see the note above the admin palette in app/globals.css for
 * why the two systems stay separated by prefix rather than by discipline.
 */

/* ══════════════════════════════════════════════════════════ buttons */

type Variant =
  | "primary"   /* the one way forward on this screen */
  | "secondary" /* a real alternative */
  | "quiet"     /* tertiary: cancel, back, dismiss */
  | "danger"    /* deletes something */
  | "ghost";    /* a control inside a row, competing with nothing */

type Size = "sm" | "md" | "lg";

/*
 * 44px is the floor for anything a finger has to hit, which is `md` and `lg`.
 *
 * `sm` is 32px and is the one exception, restricted to controls that sit inside
 * a table row on a pointer-driven screen — the same row's mobile card renders
 * the `md` version. A 32px target is below the guideline and the guideline is
 * about touch; putting a 44px button in every cell of a twelve-row table makes
 * the table twice as tall as the information in it. Where the small size is
 * used, it is used next to a whole row that is itself a link.
 */
const A_SIZE: Record<Size, string> = {
  sm: "min-h-8 gap-1.5 px-2.5 text-a-meta",
  md: "min-h-11 gap-2 px-3.5 text-a-body",
  lg: "min-h-12 gap-2 px-5 text-a-item",
};

const A_VARIANT: Record<Variant, string> = {
  primary:
    "border border-a-accent bg-a-accent text-white shadow-a-card "
    + "hover:border-a-accent-ink hover:bg-a-accent-ink",
  secondary:
    "border border-a-line-strong bg-a-surface text-a-ink shadow-a-card "
    + "hover:border-a-ghost hover:bg-a-sunken",
  quiet:
    "border border-transparent bg-transparent text-a-muted "
    + "hover:bg-a-idle-wash hover:text-a-ink",
  danger:
    "border border-a-bad bg-a-bad text-white shadow-a-card "
    + "hover:border-a-bad-ink hover:bg-a-bad-ink",
  ghost:
    "border border-a-line bg-a-surface text-a-muted "
    + "hover:border-a-line-strong hover:text-a-ink",
};

/*
 * Disabled changes colour, never alpha — the same rule lib/ui.ts arrived at for
 * the storefront and for the same measured reason: `opacity-50` on white text
 * over terracotta lands around 2.3:1, and the primary action of a form is
 * frequently in that state while it saves.
 *
 * `aria-disabled` is styled alongside `disabled` because a submit button that is
 * genuinely disabled cannot be focused, and a form the keyboard cannot reach the
 * end of is worse than one whose last control explains why it will not fire.
 */
const A_OFF =
  "disabled:cursor-not-allowed disabled:border-a-line disabled:bg-a-idle-wash "
  + "disabled:text-a-faint disabled:shadow-none "
  + "aria-disabled:cursor-not-allowed aria-disabled:border-a-line "
  + "aria-disabled:bg-a-idle-wash aria-disabled:text-a-faint aria-disabled:shadow-none";

export function aBtn(variant: Variant = "secondary", size: Size = "md", extra = ""): string {
  return [
    "inline-flex shrink-0 items-center justify-center rounded-a font-a-sans font-medium",
    "whitespace-nowrap transition-[background-color,border-color,color,box-shadow]",
    /* `var(--dur-ui)` spelled out: Tailwind v4 dropped the `[--x]` shorthand,
       which now compiles to an invalid duration silently resolved to 0s. The
       storefront's lib/ui.ts documents finding every button in the app jumping
       between states because of it. */
    "duration-[var(--dur-ui)] ease-[var(--ease-out)]",
    A_SIZE[size],
    A_VARIANT[variant],
    A_OFF,
    extra,
  ].join(" ");
}

/** A text input, textarea or select. One height, one border, one focus state. */
export function aField(extra = ""): string {
  return [
    "w-full rounded-a border border-a-line-strong bg-a-surface px-3 py-2.5",
    "font-a-sans text-a-body text-a-ink placeholder:text-a-faint",
    "transition-colors duration-[var(--dur-ui)]",
    "hover:border-a-ghost focus:border-a-accent focus:outline-none",
    /* A field whose value is wrong is outlined, and the message sits under it —
       see FormRow. Colour alone never carries the error. */
    "aria-[invalid=true]:border-a-bad aria-[invalid=true]:bg-a-bad-wash",
    "disabled:cursor-not-allowed disabled:bg-a-idle-wash disabled:text-a-faint",
    extra,
  ].join(" ");
}

/** The mono variant: a price, a pincode, a phone number, a reference. */
export function aMonoField(extra = ""): string {
  return aField(`font-a-mono tracking-[0.02em] ${extra}`);
}

/** The label above a field. */
export const aLabel = "block font-a-sans text-a-body font-medium text-a-ink";

/** The uppercase tracked-out line that names a section or a table column. */
export const aEyebrow =
  "font-a-sans text-a-micro font-semibold uppercase tracking-[0.09em] text-a-faint";

/* ══════════════════════════════════════════════════════════ surfaces */

/**
 * A panel. The portal's single container.
 *
 * `flush` drops the padding, for a card whose whole body is a table or a list
 * that needs to run edge to edge — the alternative is every table page undoing
 * this component's padding with a negative margin.
 */
export function Card({
  children,
  className = "",
  flush = false,
}: {
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section
      className={[
        "rounded-a border border-a-line bg-a-surface shadow-a-card",
        flush ? "" : "p-4 sm:p-5",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}

/** A card's own heading row, with room for one control on the right. */
export function CardHead({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-a-line px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <h2 className="font-a-sans text-a-item font-semibold text-a-ink">{title}</h2>
        {note && <p className="mt-0.5 text-a-small leading-snug text-a-muted">{note}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * The page's own header: title, one line of explanation, and its actions.
 *
 * The `back` link is a real link rather than a history-back button, because
 * history-back on an order page reached from a search result goes to the search
 * result, and on one reached from a bookmark goes to another site. A named
 * destination is always right.
 */
export function PageHeader({
  title,
  blurb,
  back,
  children,
}: {
  title: string;
  blurb?: string;
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {back && (
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1.5 rounded-a-sm text-a-small font-medium text-a-muted transition-colors hover:text-a-accent-ink"
        >
          <Icon name="arrowLeft" size={15} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-a-sans text-a-title font-bold tracking-[-0.015em] text-a-ink">
            {title}
          </h1>
          {blurb && (
            <p className="mt-1 max-w-2xl text-a-body leading-relaxed text-a-muted">{blurb}</p>
          )}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}

/** A labelled group of fields. §34's answer to a form with no sections in it. */
export function FormSection({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-x-8 gap-y-4 border-b border-a-line py-6 first:pt-0 last:border-0 last:pb-0 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div className="lg:pt-0.5">
        <h3 className="font-a-sans text-a-body font-semibold text-a-ink">{title}</h3>
        {blurb && <p className="mt-1 text-a-small leading-relaxed text-a-muted">{blurb}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * One field, its label, its hint and its error.
 *
 * The error is rendered into the same element every time — present or absent —
 * so `aria-describedby` on the input can point at a stable id, and a screen
 * reader announces the message when it appears rather than losing the
 * association. `role="alert"` only when there is something to say.
 */
export function FormRow({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={aLabel}>{label}</label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-a-meta leading-relaxed text-a-muted">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-a-meta font-medium leading-relaxed text-a-bad-ink"
        >
          <Icon name="alert" size={14} className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ figures */

/**
 * One number, and what it counts.
 *
 * The number is 28px and semibold with tabular figures; the label above it is
 * 11px uppercase. That order is deliberate — the label is read once and the
 * figure is read every morning, so the figure is what the eye lands on.
 *
 * `href` makes the whole card a link, which is why the wrapper is chosen at
 * render time rather than the card always being a div with a link inside it: a
 * 200x100 target beats a 60x20 one, and a card that is partly clickable is the
 * kind of thing people learn to distrust.
 *
 * `tone` exists for one job — "12 awaiting confirmation" and "3 overdue" are not
 * the same kind of number as "42 orders today" — and defaults to none, because a
 * dashboard where every card is coloured has told you nothing about which one to
 * look at.
 */
export function StatCard({
  label,
  value,
  note,
  href,
  tone = "plain",
  icon,
}: {
  label: string;
  value: string;
  note?: string;
  href?: string;
  tone?: "plain" | "good" | "warn" | "bad" | "accent";
  icon?: IconName | string;
}) {
  const TONE = {
    plain: { ring: "border-a-line", text: "text-a-ink", chip: "bg-a-idle-wash text-a-muted" },
    good: { ring: "border-a-good-line", text: "text-a-good-ink", chip: "bg-a-good-wash text-a-good-ink" },
    warn: { ring: "border-a-warn-line", text: "text-a-warn-ink", chip: "bg-a-warn-wash text-a-warn-ink" },
    bad: { ring: "border-a-bad-line", text: "text-a-bad-ink", chip: "bg-a-bad-wash text-a-bad-ink" },
    accent: { ring: "border-a-accent-line", text: "text-a-accent-ink", chip: "bg-a-accent-wash text-a-accent-ink" },
  }[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={aEyebrow}>{label}</span>
        {icon && (
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-a-sm ${TONE.chip}`}>
            <Icon name={icon} size={15} />
          </span>
        )}
      </div>
      <span className={`mt-2 block font-a-sans text-a-figure font-semibold leading-none tracking-[-0.02em] tabular-nums ${TONE.text}`}>
        {value}
      </span>
      {note && <span className="mt-1.5 block text-a-meta leading-snug text-a-muted">{note}</span>}
      {href && (
        <span className="mt-2.5 inline-flex items-center gap-1 text-a-meta font-medium text-a-accent-ink">
          View
          <Icon name="chevronRight" size={13} />
        </span>
      )}
    </>
  );

  const shell =
    `ops-metric flex flex-col rounded-a border bg-a-surface p-5 shadow-a-card ${TONE.ring}`;

  return href ? (
    <Link
      href={href}
      className={`${shell} transition-[border-color,box-shadow] duration-[var(--dur-ui)] hover:border-a-ghost hover:shadow-a-pop`}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/* ══════════════════════════════════════════════════════════ badges */

/**
 * The six order states, coloured by what they ask of the person reading them.
 *
 * Mapped from the Prisma enum as a Record rather than a switch, for the reason
 * lib/orders.ts gives about STATUS_LABEL: a seventh status added to the schema
 * fails the build here instead of rendering an uncoloured badge nobody notices.
 *
 * `draft` is amber and it is the most important assignment in the table. Its
 * label is "Awaiting our call" — it is not a neutral resting state, it is an
 * order that nobody has rung yet, and a grey badge on it is how an order sits
 * unconfirmed for two days.
 */
const STATUS_TONE: Record<OrderStatus, "good" | "warn" | "bad" | "accent" | "plain"> = {
  draft: "warn",
  confirmed: "accent",
  in_kitchen: "accent",
  out_for_delivery: "accent",
  delivered: "good",
  cancelled: "plain",
};

const BADGE_TONE = {
  plain: "border-a-idle-line bg-a-idle-wash text-a-muted",
  good: "border-a-good-line bg-a-good-wash text-a-good-ink",
  warn: "border-a-warn-line bg-a-warn-wash text-a-warn-ink",
  bad: "border-a-bad-line bg-a-bad-wash text-a-bad-ink",
  accent: "border-a-accent-line bg-a-accent-wash text-a-accent-ink",
} as const;

export type BadgeTone = keyof typeof BADGE_TONE;

/**
 * A status pill.
 *
 * `dot` draws a filled circle in the badge's own colour. It is on by default
 * because a badge whose only signal is its background is a badge that says
 * nothing in greyscale or to a colour-blind reader — the dot plus the words
 * carry it, and the colour is the third channel rather than the only one.
 */
export function StatusBadge({
  label,
  tone = "plain",
  dot = true,
  className = "",
}: {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  const DOT = {
    plain: "bg-a-ghost",
    good: "bg-a-good",
    warn: "bg-a-warn",
    bad: "bg-a-bad",
    accent: "bg-a-accent",
  }[tone];

  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1.5 rounded-a-sm border px-2 py-1",
        "font-a-sans text-a-meta font-medium leading-none whitespace-nowrap",
        BADGE_TONE[tone],
        className,
      ].join(" ")}
    >
      {dot && <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${DOT}`} />}
      {label}
    </span>
  );
}

/** An order's status badge, coloured from the enum. */
export function OrderStatusBadge({
  status,
  label,
  className = "",
}: {
  status: OrderStatus;
  label: string;
  className?: string;
}) {
  return <StatusBadge label={label} tone={STATUS_TONE[status]} className={className} />;
}

/**
 * On, or withdrawn.
 *
 * The words are the signal and the colour agrees with them — §19's requirement
 * that the state be "immediately understandable" is not met by a green dot on
 * its own. "Not available" rather than "Unavailable" because the negative is
 * easier to miss when it is a prefix.
 */
export function AvailabilityBadge({ available }: { available: boolean }) {
  return (
    <StatusBadge
      label={available ? "Available" : "Not available"}
      tone={available ? "good" : "plain"}
    />
  );
}

/** A monospaced reference: an order ref, a pincode, an option's internal value. */
export function Ref({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`font-a-mono text-a-small tracking-[0.03em] tabular-nums ${className}`}>
      {children}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════ tables */

/**
 * A table that scrolls inside itself instead of pushing the page sideways.
 *
 * The `min-w` on the inner table is what makes the wrapper's `overflow-x` do
 * anything: without it the table shrinks to the viewport and the cells wrap into
 * unreadable stacks, which looks like a responsive table and reads like a
 * ransom note. With it, the table keeps its column widths and the wrapper
 * scrolls — see `.a-scroll-x` in globals.css.
 *
 * Every page that uses this also renders a card list at the same breakpoint, so
 * the horizontal scroll is the tablet case rather than the phone case. §33's
 * "do not allow horizontal page overflow" is about the document, and this is
 * how a data table honours it.
 */
export function DataTable({
  head,
  children,
  minWidth = "48rem",
  caption,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  minWidth?: string;
  caption?: string;
}) {
  return (
    <div className="a-scroll-x">
      <table className="w-full border-collapse text-left" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-a-line bg-a-sunken">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** A column heading. `align` right for money and counts, which read off the decimal. */
export function Th({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={[
        "px-3 py-2.5 font-a-sans text-a-micro font-semibold uppercase tracking-[0.09em] text-a-faint",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      ].join(" ")}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <td
      className={[
        "px-3 py-3 align-middle text-a-small text-a-ink",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      ].join(" ")}
    >
      {children}
    </td>
  );
}

/** A body row. Hairline between rows, none after the last. */
export function Tr({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <tr
      className={[
        "border-b border-a-line last:border-0",
        "transition-colors duration-[var(--dur-ui)] hover:bg-a-sunken",
        className,
      ].join(" ")}
    >
      {children}
    </tr>
  );
}

/* ══════════════════════════════════════════════════════════ states */

/**
 * Nothing here, and what to do about it.
 *
 * §36's rule, and the `action` is the part that makes it worth having: "No cakes
 * found." is a blank page with a sentence on it. The distinction the callers all
 * make is between *empty* (nothing exists yet — offer to create one) and
 * *filtered to nothing* (things exist, the search excluded them — offer to clear
 * it), which are two different sentences and two different buttons.
 */
export function EmptyState({
  icon = "info",
  title,
  blurb,
  children,
}: {
  icon?: IconName | string;
  title: string;
  blurb?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-a-idle-wash text-a-faint">
        <Icon name={icon} size={20} />
      </span>
      <div className="max-w-md">
        <p className="font-a-sans text-a-item font-semibold text-a-ink">{title}</p>
        {blurb && <p className="mt-1 text-a-body leading-relaxed text-a-muted">{blurb}</p>}
      </div>
      {children && <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * A skeleton row, for a `loading.tsx`.
 *
 * §37 asks for loading states that do not flash the screen blank. `animate-pulse`
 * respects nothing about reduced motion on its own, so the media query is here:
 * a pulsing grey rectangle is decoration, and somebody who has asked for less
 * motion still gets the layout.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-a-sm bg-a-idle-wash motion-safe:animate-pulse ${className}`}
    />
  );
}

/**
 * A page's loading state.
 *
 * `aria-busy` and a visually-hidden "Loading" rather than an animated spinner
 * announced as an image: the point is that a screen reader says the page is
 * working, once, and not that it describes eight grey rectangles.
 */
export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-7 w-52" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="rounded-a border border-a-line bg-a-surface p-4">
        <div className="flex flex-col gap-3">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Something failed, and what can be done.
 *
 * `retry` is a link rather than a callback so this stays server-renderable and
 * so the retry is a real navigation — a client-side retry of a server render
 * that failed usually fails again with less information.
 */
export function ErrorState({
  title = "Something went wrong",
  blurb,
  retry,
}: {
  title?: string;
  blurb?: string;
  retry?: { href: string; label: string };
}) {
  return (
    <Card className="border-a-bad-line bg-a-bad-wash">
      <div className="flex items-start gap-3">
        <span className="mt-px shrink-0 text-a-bad-ink">
          <Icon name="alert" size={19} />
        </span>
        <div className="min-w-0">
          <p className="font-a-sans text-a-item font-semibold text-a-ink">{title}</p>
          {blurb && <p className="mt-1 text-a-body leading-relaxed text-a-ink">{blurb}</p>}
          {retry && (
            <Link href={retry.href} className={aBtn("secondary", "md", "mt-3")}>
              {retry.label}
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * A neutral note, for a fact the page needs to state and nobody has to act on.
 *
 * Used for the deployment-has-no-database and no-blob-store cases, both of which
 * are honest states rather than errors — the rest of the page works, and saying
 * so in amber next to the thing that does not is better than a red banner over
 * a page that is mostly fine.
 */
export function Notice({
  tone = "warn",
  icon = "info",
  children,
}: {
  tone?: BadgeTone;
  icon?: IconName | string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-a border px-3.5 py-3 text-a-small leading-relaxed ${BADGE_TONE[tone]}`}
    >
      <span className="mt-px shrink-0">
        <Icon name={icon} size={16} />
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
