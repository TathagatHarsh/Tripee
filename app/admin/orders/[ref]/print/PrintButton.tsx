"use client";

import { useEffect } from "react";
import { btn } from "@/lib/ui";

/**
 * Opens the browser's print dialog, and offers the button again afterwards.
 *
 * The dialog is raised on mount because this route exists for one reason and
 * arriving here is the request — a page that renders a docket and then waits to
 * be told to print it makes somebody find Cmd+P while holding a phone. The
 * button stays for the second copy, and for whoever dismissed the dialog by
 * accident.
 *
 * No PDF library. The browser already has a renderer, a page-size dialog and a
 * "save as PDF" option in it, all of which work on the office machine and the
 * counter tablet; shipping a megabyte of JavaScript to reproduce that badly is
 * not a feature.
 */
export function PrintButton() {
  useEffect(() => {
    window.print();
  }, []);

  return (
    <button type="button" onClick={() => window.print()} className={btn("secondary", "md")}>
      Print
    </button>
  );
}
