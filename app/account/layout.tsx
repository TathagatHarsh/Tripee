import { CustomerNav } from "@/components/CustomerNav";

/**
 * The chrome the account centre shares with its own loading and error states,
 * and with the Clerk-hosted profile beneath it.
 *
 * No guard here, for the reason app/orders/layout.tsx gives: the refusal belongs
 * beside the data, and every page under this one calls
 * `requireRole("CUSTOMER")` as its first statement.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-slab">
      <CustomerNav current="account" />
      <main
        id="main"
        className="mx-auto flex w-full max-w-[64rem] flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12"
      >
        {children}
      </main>
    </div>
  );
}
