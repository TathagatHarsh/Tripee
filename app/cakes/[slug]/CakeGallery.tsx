"use client";

import { useState } from "react";
import { CakePhoto } from "@/components/shop/CakePhoto";
import type { CakeImageView } from "@/lib/cakes";
import type { CakeConfig } from "@/lib/schema";

/**
 * The cake's photographs, when there is more than one.
 *
 * ## Why this is not on the card, and not on a cake with one photo
 *
 * A card shows the primary photograph and nothing else — §14 is explicit — and a
 * cake with no gallery renders the plain `<CakePhoto>` the page always had, with
 * no client component and no state. This file only exists for the case an owner
 * has actually created: several shots of one cake.
 *
 * ## A row of thumbnails, not a carousel
 *
 * No auto-advance, no swipe handler, no dot indicators. A carousel is the right
 * control when there is more content than room and the content is a sequence;
 * this is a handful of photographs of one cake, where somebody wants the *third*
 * one and a component that hides it behind two taps is working against them.
 * Thumbnails put every photograph on screen at once and make choosing one a
 * single click.
 *
 * They are a `tablist` in the accessibility tree, because that is precisely what
 * they are: a row of controls each of which shows a different panel. It costs
 * three attributes and means a screen reader announces "2 of 4" rather than
 * reading a row of unlabelled buttons.
 *
 * The large image keeps `priority`: it is the LCP of this page whichever
 * photograph is showing.
 */
export function CakeGallery({
  name,
  description,
  primary,
  gallery,
  config,
}: {
  name: string;
  description: string;
  /** `CakeProduct.primaryImageUrl` — always first, and always the card's photo. */
  primary: { url: string | null; alt: string | null };
  gallery: CakeImageView[];
  /** Drawn instead when a cake has no photograph at all. */
  config: CakeConfig | null;
}) {
  /* The primary first, then the gallery in its stored order. One list, so the
     index below means the same thing to the big image and to the thumbnails. */
  const shots = [
    { id: "primary", url: primary.url, alt: primary.alt },
    ...gallery.map((g) => ({ id: g.id, url: g.url, alt: g.alt })),
  ];

  const [at, setAt] = useState(0);
  /* Clamped rather than trusted: the list is rebuilt from props on every render,
     and an owner deleting a photograph while this page is open would otherwise
     index past the end. */
  const shown = shots[Math.min(at, shots.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      <div className="s-enter-media s-photo-well relative aspect-square overflow-hidden rounded-s border border-s-line lg:aspect-[4/3.4]">
        <CakePhoto
          /* Keyed on the shot, so the media entrance in globals.css replays on a
             swap. Without it next/image updates the src in place and the new
             photograph appears with no transition at all. */
          key={shown.id}
          src={shown.url}
          alt={shown.alt ?? `${name}. ${description}`}
          config={config}
          sizes="(min-width:1024px) 56vw, 100vw"
          priority
        />
      </div>

      <div
        role="tablist"
        aria-label={`Photographs of ${name}`}
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {shots.map((shot, i) => {
          const on = shot.id === shown.id;
          return (
            <button
              key={shot.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={`Photograph ${i + 1} of ${shots.length}`}
              /* Roving tabindex, the same rule the variant options follow: the
                 row is one tab stop rather than one per photograph. */
              tabIndex={on ? 0 : -1}
              onClick={() => setAt(i)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next =
                  (i + (e.key === "ArrowRight" ? 1 : -1) + shots.length) % shots.length;
                setAt(next);
                /* Automatic activation — focus follows the selection — which is
                   what the APG specifies when switching panels is cheap, and
                   swapping an already-decoded photograph is. */
                (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
              }}
              className={
                "s-photo-well relative size-16 shrink-0 overflow-hidden rounded-s-sm border " +
                "transition-[border-color,opacity] duration-[var(--dur-ui)] ease-[var(--ease-out)] " +
                "sm:size-20 " +
                (on
                  ? "border-s-berry"
                  : "border-s-line opacity-70 hover:border-s-line-strong hover:opacity-100")
              }
            >
              <CakePhoto
                src={shot.url}
                /* Empty: the button's own `aria-label` names it, and alt text
                   inside a labelled control is announced twice. */
                alt=""
                config={config}
                sizes="80px"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
