"use client";

import { Children, useState, type ReactNode } from "react";
import { pager } from "@/lib/ui";

/**
 * Simple pagination over cards that were already rendered on the server.
 *
 * It takes the cards as `children` rather than taking the presets and rendering
 * them itself, and that is the whole of the design. A card prices its own cake —
 * see PresetCard, which calls priceCake and servingsLabel — and this file says
 * "use client", so rendering them here would drag the pricing tables and the
 * servings maths into the browser bundle to recompute a number the server
 * already knows. Handed finished elements, this only ever decides which of them
 * to show.
 *
 * Local state rather than a URL parameter, which is the opposite of what the
 * catalogue at /presets does. A query string here would make the whole landing
 * page dynamic in order to page one section of it, and would put `?cakes=3` in
 * the address bar of the first thing anybody sees. A catalogue wants pages that
 * can be linked to and crawled; a landing section wants neither.
 */
export function PresetPager({
  perPage,
  className,
  children,
}: {
  perPage: number;
  /** Grid classes for the `<ul>`, which has to live in here to be paged. */
  className: string;
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  const pages = Math.ceil(items.length / perPage);
  const [page, setPage] = useState(1);
  const start = (page - 1) * perPage;

  return (
    <>
      <ul className={className}>{items.slice(start, start + perPage)}</ul>

      {pages > 1 && (
        <nav aria-label="Preset pages" className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {/*
            `aria-disabled` and a clamped handler, not the `disabled` attribute.
            Paging to the last page with the Next button and having that button
            go disabled under the cursor takes the focus ring with it — the
            keyboard user is dropped back at the top of the document with no idea
            the list moved. Left focusable and inert, focus stays where they put
            it, and `OFF` in lib/ui styles the aria form the same as the real one.
          */}
          <button
            type="button"
            className={pager()}
            aria-disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            ← Prev
          </button>

          {Array.from({ length: pages }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              type="button"
              className={pager(n === page)}
              aria-current={n === page ? "page" : undefined}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}

          <button
            type="button"
            className={pager()}
            aria-disabled={page === pages}
            onClick={() => setPage(p => Math.min(pages, p + 1))}
          >
            Next →
          </button>
        </nav>
      )}
    </>
  );
}
