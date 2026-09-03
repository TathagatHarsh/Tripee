"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CakeConfig } from "@/lib/schema";
import { useCake } from "@/lib/store";
import { btn } from "@/lib/ui";

/**
 * Loads a shared or preset design into the builder. The restored design does not
 * become an undoable step — undoing straight back to the default cake the moment
 * you opened somebody's link would be baffling.
 */
export function LoadConfig({
  config,
  to = "/build-legacy/review",
  label = "Open in the builder",
  variant = "secondary",
  className = "",
}: {
  config: CakeConfig;
  to?: string;
  label?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const router = useRouter();
  const loadPreset = useCake(s => s.loadPreset);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void useCake.persist.rehydrate();
  }, []);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        loadPreset(config);
        useCake.temporal.getState().clear();
        router.push(to);
      }}
      className={btn(variant, "md", className)}
    >
      {busy ? "Opening…" : label}
    </button>
  );
}
