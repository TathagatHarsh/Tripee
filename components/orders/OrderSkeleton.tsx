/**
 * The shape of the page, before the page.
 *
 * Every block here is the size of the thing it stands in for, which is the only
 * property that matters: a skeleton whose card is 40px shorter than the real one
 * is a layout shift with extra steps. The tones are the manila the design system
 * already uses for an inset well, so these read as blank stationery rather than
 * as grey web furniture.
 *
 * `animate-pulse` is Tailwind's own, and app/globals.css already reduces every
 * animation in the product to nothing under `prefers-reduced-motion` — so this
 * needs no motion query of its own.
 */

/** One bar of blank manila. */
function Bar({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block bg-counter ${className}`} />;
}

export function OrderCardSkeleton() {
  return (
    <li className="paper-edge animate-pulse bg-paper">
      <div className="flex items-center gap-5 border-b border-rule px-4 py-3 sm:px-5">
        <Bar className="h-4 w-32" />
        <Bar className="h-3 w-40 max-sm:hidden" />
        <Bar className="ml-auto h-6 w-24" />
      </div>
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:gap-5 sm:px-5">
        <Bar className="size-20 shrink-0 sm:size-24" />
        <div className="flex flex-1 flex-col gap-2">
          <Bar className="h-4 w-48" />
          <Bar className="h-3 w-full max-w-sm" />
          <Bar className="h-3 w-32" />
          <Bar className="mt-1 h-4 w-24" />
        </div>
        <Bar className="h-11 w-full sm:w-32" />
      </div>
    </li>
  );
}

/** The list, with enough rows to fill a first screen and no more. */
export function OrdersSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-4">
      {Array.from({ length: rows }, (_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </ul>
  );
}

/** The tracking page: status sheet, timeline, then the two columns under it. */
export function OrderDetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-4">
      <div className="paper-edge bg-paper">
        <Bar className="mx-5 mt-5 h-3 w-24" />
        <div className="flex flex-col gap-5 px-5 py-5">
          <Bar className="h-7 w-56" />
          <Bar className="h-px w-full" />
          <div className="flex items-center gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className="flex flex-1 items-center gap-2">
                <Bar className="size-6 shrink-0" />
                <Bar className="h-px flex-1" />
              </span>
            ))}
          </div>
          <Bar className="h-4 w-64" />
        </div>
      </div>

      <div className="paper-edge bg-paper">
        <Bar className="mx-5 mt-4 h-3 w-28" />
        <div className="flex flex-col gap-5 px-5 py-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-4">
              <Bar className="size-6 shrink-0" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Bar className="h-4 w-40" />
                <Bar className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="paper-edge bg-paper">
            <Bar className="mx-5 mt-4 h-3 w-32" />
            <div className="flex flex-col gap-3 px-5 py-5">
              <Bar className="h-4 w-full" />
              <Bar className="h-4 w-3/4" />
              <Bar className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The account centre: greeting, then the two groups of cards. */
export function AccountSkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Bar className="h-3 w-24" />
        <Bar className="h-8 w-64" />
        <Bar className="h-4 w-full max-w-md" />
      </div>
      {Array.from({ length: 2 }, (_, group) => (
        <div key={group} className="flex flex-col gap-3">
          <Bar className="h-3 w-20" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: group === 0 ? 3 : 1 }, (_, i) => (
              <div key={i} className="paper-edge flex flex-col gap-2 bg-paper px-5 py-5">
                <Bar className="h-5 w-40" />
                <Bar className="h-3 w-full max-w-[16rem]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
