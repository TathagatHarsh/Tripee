"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

/**
 * "Saved", "Couldn't save", and nothing more intrusive than that.
 *
 * §24 asks that every modification say whether it worked, and §24 also says not
 * to use a modal for it. Those two together are what a toast is for: it appears
 * without taking focus, it says one sentence, and it leaves.
 *
 * ## Why this is not a library
 *
 * sonner is the obvious import and it is 15KB for a queue, a portal and a
 * timer. This is those three things in about eighty lines, and it buys something
 * the library would have to be configured into: the live region is a *single*
 * `aria-live="polite"` element that exists from first paint, which is the one
 * detail that makes announcements actually work. A region added to the DOM at
 * the same moment as its first message is frequently not announced at all —
 * screen readers subscribe to the region, and it has to be there to subscribe
 * to. So the container renders empty and always.
 *
 * `polite`, not `assertive`: "Cake updated" must not interrupt somebody
 * mid-sentence, and the two failures that genuinely need interrupting — a
 * refused save, a failed upload — are also rendered inline next to the control
 * that failed, where a screen reader reaches them by reading the form.
 */

export interface Toast {
  id: number;
  message: string;
  tone: "good" | "bad";
}

interface ToastApi {
  /** Announce a result. `ok` picks the tone, so a caller can pass an ActionResult. */
  toast: (message: string, ok?: boolean) => void;
}

const Ctx = createContext<ToastApi | null>(null);

/**
 * Toasts are optional, and a component that wants one gets a no-op when there
 * is no provider above it.
 *
 * Deliberately not a thrown error. These components are also rendered in the
 * catalogue's print view and in tests, neither of which mounts the admin shell,
 * and a missing toast is not a reason for a page to fail to render — the action
 * still ran and the page still re-rendered with the new value on it.
 */
export function useToast(): ToastApi {
  return useContext(Ctx) ?? { toast: () => {} };
}

const LIFETIME_MS = 4200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  /* Monotonic, so a toast dismissed and re-raised with the same text is a new
     element rather than React reusing the old one mid-exit. */
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, ok = true) => {
      const id = nextId.current++;
      setItems((prev) => [
        /*
         * Three at once, oldest dropped. A save that fires in a loop — a
         * misbehaving form, a double-submitted action — must not stack forty
         * cards over the page it is reporting on.
         */
        ...prev.slice(-2),
        { id, message, tone: ok ? "good" : "bad" },
      ]);
      timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME_MS));
    },
    [dismiss],
  );

  /* Clear the timers on unmount, so a navigation away mid-toast does not leave
     a setState pointed at a component that is gone. */
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}

      {/*
        Bottom on a phone, bottom-right on a desktop. Bottom rather than top
        because the top of every page in this portal is the header and the page
        title, and a card that covers the title of the thing you just saved is
        the one place it must not be.

        `pointer-events-none` on the container and `auto` on each card: the strip
        spans the width of the viewport and would otherwise swallow clicks on
        whatever is under the empty part of it.
      */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-5"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={[
              "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-a border px-3.5 py-3",
              "shadow-a-pop motion-safe:animate-[a-toast-in_var(--dur-settle)_var(--ease-out)]",
              t.tone === "good"
                ? "border-a-good-line bg-a-good-wash text-a-good-ink"
                : "border-a-bad-line bg-a-bad-wash text-a-bad-ink",
            ].join(" ")}
          >
            <span className="mt-px shrink-0">
              <Icon name={t.tone === "good" ? "check" : "alert"} size={16} />
            </span>
            <p className="min-w-0 flex-1 text-a-small font-medium leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              /* A real 32px target, and a label — this is the one icon-only
                 control in the portal, so it is the one that needs one. */
              className="-my-1 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-a-sm opacity-70 transition-opacity hover:opacity-100"
            >
              <span className="sr-only">Dismiss</span>
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
