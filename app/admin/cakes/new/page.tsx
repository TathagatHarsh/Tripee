import type { Metadata } from "next";
import { CakeForm } from "@/components/admin/CakeForm";
import { Card, Notice, PageHeader } from "@/components/admin/ui";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";

/**
 * Add a cake.
 *
 * The photograph is not on this form and that is the one deliberate omission:
 * an upload needs a row to attach itself to, so the cake is created first and
 * the editor it lands on has the uploader on it. The alternative — holding the
 * bytes through a create — means a half-finished cake can exist in two places
 * at once, and a failed upload would have to decide whether to keep the cake.
 *
 * The form says so, and `createCake` sends the owner straight to the editor.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Add a cake — Admin",
  robots: { index: false, follow: false },
};

export default function NewCakePage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Add a cake"
        blurb="Add its prices and reviewed production specification. It stays off the shelf until you explicitly publish it."
        back={{ href: "/admin/cakes", label: "All cakes" }}
      />

      {!hasDatabase() ? (
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      ) : (
        <Card>
          <CakeForm />
        </Card>
      )}
    </div>
  );
}
