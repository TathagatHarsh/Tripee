"use client";

import type { CakeConfig } from "@/lib/schema";
import { validateCake } from "@/lib/rules";
import { useConfig, useSetConfig } from "@/lib/store";
import { btn } from "@/lib/ui";

/**
 * Blocks get an inline card with the reason and a one-tap fix. Warnings get a
 * quiet note. Neither is ever a modal or a toast — the message belongs attached
 * to the thing it is about, phrased as a fact about cake rather than about
 * software.
 *
 * The two used to differ only by a 40%-alpha border tint, so at a glance a
 * dead end and a footnote looked the same. A block is now the one seal-tinted
 * surface in the product and carries a 44px seal button; a note is paper on a
 * rule, with a brass label, and carries nothing.
 */
export function ViolationCard({ field }: { field?: keyof CakeConfig }) {
  const config = useConfig();
  const set = useSetConfig();

  const violations = validateCake(config).filter(v => !field || v.field === field);
  if (violations.length === 0) return null;

  return (
    <div className="mt-6 flex flex-col gap-2.5">
      {violations.map((v) => {
        const block = v.severity === "block";
        return (
          <div
            key={v.id}
            role={block ? "alert" : "status"}
            className={[
              "flex flex-col gap-3 border px-4",
              block
                ? "border-seal/40 bg-seal-tint py-4"
                : "border-rule bg-paper py-3.5",
            ].join(" ")}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={[
                  "shrink-0 pt-[3px] font-mono text-micro tracking-[0.14em]",
                  block ? "text-seal" : "text-brass",
                ].join(" ")}
              >
                {block ? "BLOCKED" : "NOTE"}
              </span>
              <span
                className={[
                  "flex-1 leading-snug",
                  block ? "text-body text-ink" : "text-meta text-graphite",
                ].join(" ")}
              >
                {v.message}
              </span>
            </div>

            {v.fix && (
              <button
                type="button"
                onClick={() => set(v.fix!.patch)}
                className={btn(block ? "seal" : "secondary", "md", "self-start")}
              >
                {v.fix.label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
