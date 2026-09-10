import { CustomerNav } from "@/components/CustomerNav";

/**
 * The chrome every state of this area shares.
 *
 * Here rather than in the pages so that the bar and the column survive the four
 * states a route has: the page, its `loading.tsx`, its `error.tsx` and its
 * `not-found.tsx`. A skeleton that also had to draw the header would be a second
 * copy of the header, and the one thing a loading state must not do is move the
 * furniture when the content lands.
 *
 * No guard here. The refusal lives in each page's `requireRole("CUSTOMER")`,
 * next to the query it protects — a layout is not a gate, for the reason
 * proxy.ts spells out at length: authorisation belongs as close to the data as
 * it can get. app/admin's layout does hold its own guard, and that is because
 * every page beneath it reads staff-only rows; here the pages read the viewer's
 * own, filtered by their own id.
 */
export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-slab">
      <CustomerNav current="orders" />
      <main
        id="main"
        className="mx-auto flex w-full max-w-[64rem] flex-col gap-6 px-4 py-8 sm:px-8 sm:py-12"
      >
        {children}
      </main>
    </div>
  );
}
