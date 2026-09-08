"use client";

import { useEffect } from "react";
import { useCake, useTemporal } from "@/lib/store";
import { iconBtn } from "@/lib/ui";

/**
 * Changing your mind is the normal case, not the exception. ⌘Z / Ctrl+Z works
 * anywhere on the page, and there is a visible control for people who do not
 * know the shortcut.
 *
 * These sit in the header next to the step chips and are the easiest thing in
 * the product to hit by accident, so they hold the 44px floor. `iconBtn` sets
 * that with `size-11`, but `w-auto` — needed so the words can widen the button
 * at sm — silently overrode the width back to ~34px. `min-w-11` is what
 * actually holds the floor; keep both. The arrows carry the meaning at small
 * widths; the words come back at sm and the accessible name is the full one at
 * every width.
 *
 * Start again does NOT clear the temporal stack. Wiping nine steps on one tap,
 * with the undo button sitting right beside it, is not something to make
 * unrecoverable — so reset is one more undoable step and needs no dialog.
 */
export function UndoBar() {
  const { canUndo, canRedo, undo, redo } = useTemporal();
  const reset = useCake(s => s.reset);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;

      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className="flex shrink-0 items-center gap-3">
      {/* Wrapped: undo/redo take a step count, and a click event is not one. */}
      <button
        type="button"
        onClick={() => undo()}
        disabled={!canUndo}
        className={iconBtn("w-auto min-w-11 gap-2 px-3 text-meta sm:px-4")}
        aria-label="Undo"
      >
        <span aria-hidden>↶</span>
        <span aria-hidden className="hidden sm:inline">Undo</span>
      </button>
      <button
        type="button"
        onClick={() => redo()}
        disabled={!canRedo}
        className={iconBtn("w-auto min-w-11 gap-2 px-3 text-meta sm:px-4")}
        aria-label="Redo"
      >
        <span aria-hidden>↷</span>
        <span aria-hidden className="hidden sm:inline">Redo</span>
      </button>
      <button
        type="button"
        onClick={() => reset()}
        className={iconBtn("w-auto min-w-11 px-3 text-meta sm:px-4")}
      >
        <span className="hidden sm:inline">Start again</span>
        <span aria-hidden className="sm:hidden">⟲</span>
        <span className="sr-only sm:hidden">Start again</span>
      </button>
    </div>
  );
}
