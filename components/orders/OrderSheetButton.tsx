"use client";

import { btn } from "@/lib/ui";

/**
 * The order, as a file the customer keeps.
 *
 * Not called an invoice, because it is not one: this product takes no money on
 * the site — `PaymentStatus` defaults to `none` — so a document headed "Invoice"
 * would claim a payment that has not happened. What it is is the spec sheet the
 * kitchen works from, with the order's own reference on it, which is exactly the
 * thing to have to hand when ringing the bakery about a cake.
 *
 * ## Why the text is a prop rather than rendered here
 *
 * `renderSpecSheet` needs the whole catalogue snapshot to name and price what it
 * prints, and app/build/review's own download button calls it in the browser
 * because the builder already holds one. This page does not: sending the
 * catalogue across the boundary to regenerate a document the server could
 * already have written would put every option row of the shop into the payload
 * of a page showing one cake.
 *
 * So the server renders the sheet — the same function, the same output as the
 * admin's printable docket — and this component is what a page cannot be: a
 * click that writes a Blob to somebody's disk.
 */
export function OrderSheetButton({
  sheet,
  filename,
}: {
  /** Already rendered by lib/docket's `renderSpecSheet` on the server. */
  sheet: string;
  filename: string;
}) {
  function download() {
    const url = URL.createObjectURL(new Blob([sheet], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={download} className={btn("secondary", "md", "w-full")}>
      Download the order sheet
    </button>
  );
}
