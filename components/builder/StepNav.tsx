"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { STEPS } from "@/lib/catalog";
import { validateCake } from "@/lib/rules";
import { useConfig } from "@/lib/store";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { btn } from "@/lib/ui";

/** Which step owns a given config field, so a blocker can be pointed at. */
const FIELD_STEP: Record<string, string> = {
  shape: "shape",
  size: "size", tiers: "size",
  sponge: "sponge", layers: "sponge", eggless: "sponge", sugarFree: "sponge",
  filling: "filling",
  frosting: "frosting", coverage: "frosting",
  finish: "finish", frostingColor: "finish", hasDrip: "finish", dripColor: "finish",
  toppings: "toppings",
  message: "message", messageColor: "message", delivery: "message", pincode: "message",
};

/**
 * Nine steps are four decisions.
 *
 * Nine equal chips under a 1px hairline told a customer neither of the two
 * things a wizard header owes them — where am I, and how much is left. Grouped,
 * the answer to both is one glance: "Appearance, step 6 of 9", with three of
 * four meters full. The grouping is presentation only; the nine URLs, their
 * order and their slugs are untouched.
 */
const PHASES = [
  { name: "Structure", slugs: ["shape", "size"] },
  { name: "Flavour", slugs: ["sponge", "filling"] },
  { name: "Appearance", slugs: ["frosting", "finish", "toppings"] },
  { name: "Details", slugs: ["message", "review"] },
] as const;

function currentStepIndex(pathname: string): number {
  const slug = pathname.split("/").filter(Boolean).pop();
  const i = STEPS.findIndex(s => s.slug === slug);
  return i === -1 ? 0 : i;
}

/** Where the customer is, in the two units the header reports it in. */
export function useStepPosition() {
  const pathname = usePathname();
  const index = currentStepIndex(pathname);
  const slug = STEPS[index].slug;
  const phase = PHASES.find(p => (p.slugs as readonly string[]).includes(slug)) ?? PHASES[0];
  return { index, slug, phase: phase.name, total: STEPS.length };
}

/** Every step is a URL, so back, forward and refresh all behave. */
export function StepNav() {
  const pathname = usePathname();
  const i = currentStepIndex(pathname);
  const listRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  /*
   * The CSS `scroll-behavior: auto !important` under prefers-reduced-motion
   * does not reach a JS scrollIntoView that names its own behavior, so this was
   * the one animation in the app that ignored the setting.
   */
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-current="step"]');
    el?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [i, reduced]);

  return (
    <nav
      aria-label="Build steps"
      ref={listRef}
      className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {STEPS.map((s, n) => {
        const state = n === i ? "current" : n < i ? "done" : "todo";
        return (
          <Link
            key={s.slug}
            href={`/build/${s.slug}`}
            aria-current={state === "current" ? "step" : undefined}
            className={[
              "flex min-h-11 shrink-0 items-center gap-2.5 rounded-card pr-3 pl-2",
              "text-body whitespace-nowrap transition-colors duration-[--dur-ui]",
              state === "todo" ? "text-steel hover:text-ink" : "text-ink",
            ].join(" ")}
          >
            <span
              aria-hidden
              className={[
                "grid size-[26px] shrink-0 place-items-center rounded-[6px] border",
                "font-mono text-micro font-bold tabular-nums",
                state === "current" ? "border-ink bg-ink text-paper" : "",
                state === "done" ? "border-rule-strong bg-paper text-ink" : "",
                state === "todo" ? "border-rule bg-transparent text-steel" : "",
              ].join(" ")}
            >
              {n + 1}
            </span>
            {s.title}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Four meters, one per decision. The active phase fills in brass and reports
 * part-progress; a finished one is solid ink. Decorative — the same two facts
 * are in text beside it, which is what a screen reader gets.
 */
export function PhaseMeters() {
  const pathname = usePathname();
  const i = currentStepIndex(pathname);
  const slug = STEPS[i].slug;

  return (
    <div aria-hidden className="flex gap-2.5">
      {PHASES.map((p) => {
        const slugs = p.slugs as readonly string[];
        const at = slugs.indexOf(slug);
        const active = at >= 0;
        const done = !active && STEPS.findIndex(s => s.slug === slugs[slugs.length - 1]) < i;
        const width = active ? ((at + 0.5) / slugs.length) * 100 : done ? 100 : 0;

        return (
          <div key={p.name} className="flex flex-1 flex-col gap-[7px]">
            <div className="h-[3px] overflow-hidden rounded-full bg-slab-deep">
              <div
                className={[
                  "h-full rounded-full transition-[width] duration-[--dur-settle] ease-[--ease-out]",
                  active ? "bg-brass" : "bg-ink",
                ].join(" ")}
                style={{ width: `${width}%` }}
              />
            </div>
            <span
              className={[
                "hidden text-meta leading-none min-[1440px]:block",
                active ? "font-semibold text-ink" : "text-steel",
              ].join(" ")}
            >
              {p.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Back is always in the same place, it never loses anything, and it no longer
 * scrolls away with the content — on a phone the only way forward used to be
 * to reach the bottom of the step first. On a phone the total sits between the
 * two, so one 48px row carries progress, price and navigation.
 */
export function StepFooter({ price }: { price?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const config = useConfig();
  const i = currentStepIndex(pathname);

  const prev = STEPS[i - 1];
  const next = STEPS[i + 1];

  /*
   * Next used to disable on *any* blocking violation and say "Sort the note
   * above first". But ViolationCard on most steps is filtered to that step's
   * own field, so a frosting blocker disabled Next on the Shape step and
   * pointed at a note that was not on the page and could not be put there.
   * The blocker names itself and links to the step that owns it.
   */
  const blocker = validateCake(config).find(v => v.severity === "block");
  const blockedHere =
    blocker !== undefined && FIELD_STEP[String(blocker.field)] === STEPS[i]?.slug;
  const blocked = blocker !== undefined;
  const blockerStep = blocker ? FIELD_STEP[String(blocker.field)] : undefined;

  // Keyboard: left and right arrows move between steps when nothing has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && el !== document.body && el.tagName !== "MAIN") return;
      if (e.key === "ArrowLeft" && prev) router.push(`/build/${prev.slug}`);
      if (e.key === "ArrowRight" && next && !blocked) router.push(`/build/${next.slug}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, blocked, router]);

  return (
    <div className="shrink-0 border-t border-rule bg-slab px-3.5 pt-3.5 pb-[max(1.125rem,env(safe-area-inset-bottom))] lg:px-3.5">
      {blocked && next && (
        <p className="mb-2.5 text-meta leading-snug text-seal">
          {blockedHere || !blockerStep ? (
            "Sort the note above before going on."
          ) : (
            <Link href={`/build/${blockerStep}`} className="underline underline-offset-2">
              {blocker!.message} Fix it on{" "}
              {STEPS.find(s => s.slug === blockerStep)?.title ?? blockerStep}.
            </Link>
          )}
        </p>
      )}

      <div className="flex items-center gap-2.5">
        <Link
          href={prev ? `/build/${prev.slug}` : "/"}
          aria-label={prev ? `Back to ${prev.title}` : "Start over"}
          className={btn("secondary", "lg", "max-sm:w-14 max-sm:px-0 sm:px-5")}
        >
          <span aria-hidden className="sm:hidden">←</span>
          <span aria-hidden className="hidden sm:inline">
            ← {prev ? prev.title : "Start over"}
          </span>
        </Link>

        {price}

        {next && (
          <Link
            href={blocked ? pathname : `/build/${next.slug}`}
            aria-disabled={blocked}
            tabIndex={blocked ? -1 : undefined}
            className={btn(blocked ? "secondary" : "primary", "lg", "flex-1 xl:flex-1")}
          >
            {/* Both halves are display:none at the other width, so the
                accessible name is always exactly the visible text. */}
            <span className="hidden sm:inline">{next.title} →</span>
            <span className="sm:hidden">Next →</span>
          </Link>
        )}
      </div>
    </div>
  );
}
