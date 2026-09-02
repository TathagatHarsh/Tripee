"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildDocket } from "@/lib/docket";
import { formatINR } from "@/lib/format";
import { LazyCakeScene, SceneSkeleton } from "@/components/three/LazyCakeScene";
import { Docket } from "@/components/docket/Docket";
import { PhaseMeters, StepFooter, StepNav, useStepPosition } from "@/components/builder/StepNav";
import { ToppingBar } from "@/components/builder/ToppingBar";
import { UndoBar } from "@/components/builder/UndoBar";
import { useConfig, useHydrated } from "@/lib/store";
import { useView } from "@/lib/view";
import { btn, eyebrow, iconBtn } from "@/lib/ui";

/**
 * The room the cake stands in.
 *
 * The three regions are unchanged — cake, controls, docket — and the change is
 * entirely in how they are measured. They used to be 50% / 29% / 21% of the
 * viewport, which at 1024px gave the docket 214px and broke AMERICAN
 * BUTTERCREAM across four lines. The docket is now rem-locked at 20rem, the
 * controls take a 30rem cap, and the cake pane is *bounded generous*: it gets
 * whatever width is left. Three columns genuinely do not fit below 1280, so
 * below that the docket becomes a sheet reached from the price — which is where
 * a phone has always had it — rather than being crushed.
 *
 * The cake also gets a frame. A canvas bleeding to the edge of a pane is a
 * preview widget; the same canvas inside an inset counter panel with 24px of
 * camera safe area is a product shot. Nothing inside the canvas changes.
 */
export function BuilderShell({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const config = useConfig();
  const pathname = usePathname();
  const sliced = useView(s => s.sliced);
  const toggleSlice = useView(s => s.toggleSlice);
  const { phase, index, total: stepCount } = useStepPosition();

  const onReview = pathname.endsWith("/review");
  /*
   * The toppings step is the one step that puts a control on the render — see
   * builder/ToppingBar. It costs the caption its corner and moves the slice
   * button back up to where a phone already has it.
   */
  const onToppings = pathname.endsWith("/toppings");
  const docket = hydrated ? buildDocket(config) : null;
  const caption = hydrated ? describeCake(config) : null;

  /*
   * The controls column is its own scroll container. Going Next replaced its
   * contents but left the scroll position where it was, so on a phone — where
   * every step is taller than the viewport — tapping Next landed you in the
   * middle of the new step with its heading somewhere above you. It also moved
   * no focus and announced nothing.
   */
  const controls = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = controls.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    el.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-slab">
      <ShellBar reference={docket?.ref} />

      {/*
        Nine chips were nine equal siblings with a 1px hairline at 1.30:1
        underneath them, which answered neither of the two questions a wizard
        header owes you. They are now grouped into the four decisions they
        actually are, with a named position and a meter per phase.
      */}
      <div className="hidden shrink-0 items-center gap-7 border-b border-rule bg-paper px-6 lg:flex lg:h-[78px]">
        <div className="flex min-w-[8.25rem] flex-col gap-1">
          <span className={eyebrow}>{phase}</span>
          <span className="font-mono text-micro font-medium tracking-[0.1em] text-ink">
            Step {index + 1} of {stepCount}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <StepNav />
        </div>
        <div className="w-[13.5rem] shrink-0 min-[1440px]:w-[21.25rem]">
          <PhaseMeters />
        </div>
      </div>

      {/* The same two facts, one row deep, on anything narrower. */}
      <div className="shrink-0 border-b border-rule bg-paper px-4 py-2 lg:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <span className={eyebrow}>{phase}</span>
          <span className="font-mono text-micro tracking-[0.12em] text-steel">
            Step {index + 1} of {stepCount}
          </span>
        </div>
        <div className="mt-2">
          <PhaseMeters />
        </div>
      </div>

      <div
        className={[
          "flex min-h-0 flex-1 flex-col",
          "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(23rem,30rem)]",
          "xl:grid-cols-[minmax(26.875rem,1fr)_minmax(23rem,30rem)_20rem]",
        ].join(" ")}
      >
        {/* ── The cake, on a counter ──────────────────────────────────── */}
        <div className="shrink-0 p-3 pb-0 lg:h-full lg:min-h-0 lg:p-[22px] lg:pr-[10px]">
          {/*
            Taller below lg on the one step that puts a control in the panel.
            39dvh is a good frame for a cake and a bad one for a cake plus a
            three-row bar: measured on a 375×812 phone the canvas came out 99px
            high and the cake fitted itself into it, which is a preview of
            nothing. The extra height comes off the picker below, which scrolls
            anyway. From lg the panel already fills its column and pays for the
            bar out of a canvas that has height to spare.
          */}
          <div
            className={[
              /* §10 item 2: no rounded container, no inset panel, no frame. The
                 specimen sits full-bleed on the chipboard. Padding stays, because
                 it is the camera safe area — the cake never touches the edge. */
              /* p-4 is a sixth of the canvas below lg — measured, the stage is
                 438px on a 375x812 phone and the cake gets 182 of it. The safe
                 area is still there, it is just no longer desktop-sized. */
              "cake-stage relative overflow-hidden p-2 sm:p-3 lg:h-full lg:p-6",
              onToppings ? "h-[54dvh] md:h-[56dvh]" : "h-[39dvh] md:h-[44dvh]",
            ].join(" ")}
          >
            {/*
              The 3D pane was an unlabelled, unreachable box: to anyone not
              looking at it, half the product did not exist. It is a figure with
              a caption, and the caption is now visible as well as announced —
              the same sentence, so the two cannot drift. The label sits on the
              canvas wrapper alone; role="img" one level up would swallow the
              slice button and the topping bar and make them unreachable.

              A column rather than one filling box, because a step that needs a
              control on the render should take it out of the *canvas* height
              rather than lay it over the cake.
            */}
            <div className="flex h-full flex-col gap-2.5">
              <div
                className="min-h-0 w-full flex-1"
                role="img"
                aria-label={caption ? `Preview: ${caption}` : "Preview of your cake, loading"}
              >
                {hydrated ? (
                  <LazyCakeScene config={config} autoRotate={onReview} followView />
                ) : (
                  <SceneSkeleton />
                )}
              </div>

              {hydrated && onToppings && <ToppingBar />}
            </div>

            {/* Caption and hint: desktop only, where there is room below the
                cake that the cake does not want. */}
            {caption && !onToppings && (
              <div className="pointer-events-none absolute bottom-5 left-[22px] hidden max-w-[min(30rem,calc(100%-13rem))] flex-col gap-2 lg:flex">
                <span className="text-meta leading-normal text-steel">{caption}</span>
                <span className="font-mono text-micro tracking-[0.1em] text-steel">
                  DRAG TO TURN · SCROLL TO ZOOM
                </span>
              </div>
            )}

            {hydrated && (
              <button
                type="button"
                onClick={toggleSlice}
                aria-pressed={sliced}
                className={btn(
                  sliced ? "primary" : "secondary",
                  "md",
                  onToppings
                    ? "absolute top-4 right-4 lg:top-5 lg:right-5"
                    : "absolute top-4 right-4 lg:top-auto lg:right-5 lg:bottom-5",
                )}
              >
                {sliced ? "Whole cake" : "Cut a slice"}
              </button>
            )}
          </div>
        </div>

        {/* ── The controls ────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col lg:h-full lg:px-[10px]">
          {/*
            tabIndex={-1} makes this a target for the focus move on every step
            change — an announcement for a screen reader, never a keyboard stop.
            Chromium matches :focus-visible on that programmatic focus, which
            drew a 2px ink ring around the entire controls column on arrival at
            every step. Nobody can reach it with a keyboard, so there is nothing
            for the ring to indicate.
          */}
          <main
            ref={controls}
            className="@container min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 focus-visible:outline-none sm:px-5 lg:px-3.5"
            tabIndex={-1}
          >
            <div
              key={pathname}
              className="motion-safe:animate-[step-in_var(--dur-ui)_var(--ease-out)]"
            >
              {hydrated ? children : <ControlSkeleton />}
            </div>
          </main>

          {/*
            Back and Next used to scroll away with the content, so on a phone the
            only way forward was to reach the bottom of the step first. They are
            pinned, and on a phone the price sits between them — one 48px row
            doing progress, total and navigation, with the home-indicator inset
            paid for.
          */}
          <StepFooter
            price={
              hydrated && docket ? (
                <MobileTotal total={docket.price.total} config={config} />
              ) : null
            }
          />
        </div>

        {/*
         * The price moves on almost every tap and was never spoken. Polite, not
         * assertive, because it must not interrupt the name of the option that
         * was just chosen.
         */}
        <p aria-live="polite" className="sr-only">
          {docket ? `Total ${formatINR(docket.price.total)}` : ""}
        </p>

        {/* ── The docket, from 1280 up ────────────────────────────────── */}
        <div className="hidden xl:block xl:h-full xl:min-h-0 xl:p-[22px] xl:pl-[10px]">
          {hydrated && <Docket config={config} className="h-full border border-rule" />}
        </div>
      </div>
    </div>
  );
}

/** MAKEMYCAKE, the design reference, and the things that undo a decision. */
function ShellBar({ reference }: { reference?: string }) {
  return (
    <header className="flex h-15 shrink-0 items-center justify-between gap-4 border-b border-rule bg-paper px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-3.5">
        <Link
          href="/"
          className="shrink-0 font-mono text-meta font-medium tracking-[0.2em] text-ink"
        >
          MAKEMYCAKE
        </Link>
        {reference && (
          <>
            <span aria-hidden className="hidden h-[18px] w-px bg-rule sm:block" />
            <span className="hidden truncate font-mono text-micro tracking-[0.12em] text-steel sm:block">
              DESIGN #{reference}
            </span>
          </>
        )}
      </div>
      <UndoBar />
    </header>
  );
}

/**
 * The total, as a button. It was a label with a chevron glued to it, and the
 * chevron was the only thing that suggested the docket existed at all below
 * 1280. Same rupee format as the docket, so ₹5,000.84 never reads as ₹5,001
 * one tap away.
 */
function MobileTotal({
  total,
  config,
}: {
  total: number;
  config: Parameters<typeof Docket>[0]["config"];
}) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);

  /*
   * <dialog>.showModal() is the focus trap, the Escape handler and the scrim,
   * all of which the old expanding panel had none of. Hand-rolling those three
   * is about eighty lines that the platform already ships correctly.
   */
  const close = useCallback(() => sheet.current?.close(), []);
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-12 flex-1 flex-col items-center justify-center border border-rule-strong bg-paper font-mono transition-colors duration-[--dur-ui] hover:border-ink xl:hidden"
      >
        <span
          key={total}
          className="text-meta font-medium text-ink tabular-nums motion-safe:animate-[price-tick_var(--dur-settle)_var(--ease-out)]"
        >
          {formatINR(total)}
        </span>
        <span className="text-micro tracking-[0.1em] text-steel">INCL. GST</span>
      </button>

      <dialog
        ref={sheet}
        aria-label="Order docket"
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === sheet.current) close(); }}
        className="m-0 mt-auto max-h-[86dvh] w-full max-w-none border-0 bg-paper p-0 shadow-sheet backdrop:bg-ink/40 open:flex open:flex-col motion-safe:open:animate-[sheet-up_var(--dur-settle)_var(--ease-out)]"
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <span aria-hidden className="h-1 w-[38px] bg-rule" />
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-rule px-5 pt-2 pb-3">
          <span className="font-mono text-micro font-medium tracking-[0.14em]">
            ORDER DOCKET
          </span>
          <button type="button" onClick={close} className={iconBtn()} aria-label="Close the docket">
            <span aria-hidden>✕</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Docket config={config} className="border-0 " chromeless />
        </div>
        <div className="border-t border-rule px-5 pt-3.5 pb-[max(1.625rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={close} className={btn("primary", "lg", "w-full")}>
            Back to designing
          </button>
        </div>
      </dialog>
    </>
  );
}

/** One plain sentence naming the cake, for anyone who cannot see the render. */
function describeCake(c: Parameters<typeof buildDocket>[0]): string {
  const t = (s: string) => s.replace(/-/g, " ");
  const bits = [
    `${t(c.size)} ${t(c.shape)} cake`,
    c.tiers > 1 ? `in ${c.tiers} tiers` : null,
    `${t(c.sponge)} sponge`,
    c.filling === "none" ? null : `with ${t(c.filling)}`,
    `covered in ${t(c.frosting)}`,
    `${t(c.finish)} finish`,
    c.hasDrip ? "with a drip" : null,
    c.toppings.length
      ? `topped with ${c.toppings.map(x => t(x.kind)).join(", ")}`
      : null,
    c.message?.trim() ? `and the message “${c.message.trim()}”` : null,
  ].filter(Boolean);
  return bits.join(", ") + ".";
}

function ControlSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-8 w-48 animate-pulse bg-slab-deep" />
      <div className="h-4 w-56 animate-pulse bg-slab-deep" />
      <div className="grid grid-cols-1 gap-2.5 pt-3 @md:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[76px] animate-pulse bg-slab-deep" />
        ))}
      </div>
    </div>
  );
}
