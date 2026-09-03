"use client";

import { useEffect, useSyncExternalStore } from "react";
import { create, useStore } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { temporal } from "zundo";
import { CakeConfig, DEFAULT_CAKE, coerceLegacy } from "./schema";

interface CakeState {
  config: CakeConfig;
  set: (patch: Partial<CakeConfig>) => void;
  reset: () => void;
  loadPreset: (c: CakeConfig) => void;
}

export const useCake = create<CakeState>()(
  persist(
    temporal(
      (set) => ({
        config: DEFAULT_CAKE,
        set: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
        reset: () => set({ config: DEFAULT_CAKE }),
        loadPreset: (c) => set({ config: c }),
      }),
      {
        limit: 50,
        // Functions stringify away, so this compares the config and nothing else.
        equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      },
    ),
    {
      name: "makemycake.design",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ config: s.config }),
      // Rehydrate manually after mount so server and client render the same
      // first frame. Without this the default cake flashes over a saved one.
      skipHydration: true,
      merge: (persisted, current) => {
        const p = persisted as { config?: unknown } | undefined;
        /*
         * coerceLegacy, not a bare parse: a withdrawn option value would
         * otherwise fail validation on a *required* field, and the salvage below
         * can only drop optional ones — so a saved bundt lost the entire design
         * rather than one shape. schema.coerceLegacy is the single place that
         * knows what old values mean.
         */
        const stored = coerceLegacy(p?.config);
        const parsed = CakeConfig.safeParse(stored);
        if (parsed.success) return { ...current, config: parsed.data };

        // All-or-nothing was too blunt. `pincode` is validated as /^\d{6}$/ and
        // is written on every keystroke, so a customer who typed four digits and
        // then reloaded had the entire cake they had spent ten minutes on thrown
        // away and replaced with the default — because of one optional field
        // that was mid-typing. Drop the fields that failed and keep the design.
        const salvaged = { ...(stored as Record<string, unknown> | undefined) };
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (typeof key === "string") delete salvaged[key];
        }
        const retry = CakeConfig.safeParse(salvaged);
        return retry.success ? { ...current, config: retry.data } : current;
      },
    },
  ),
);

/** Reactive undo/redo availability — `getState()` alone won't re-render. */
export function useTemporal() {
  const past = useStore(useCake.temporal, (s) => s.pastStates.length);
  const future = useStore(useCake.temporal, (s) => s.futureStates.length);
  const t = useCake.temporal.getState();
  return {
    canUndo: past > 0,
    canRedo: future > 0,
    undo: t.undo,
    redo: t.redo,
    clear: t.clear,
  };
}

let started = false;

/** True once sessionStorage has been read. Gate config-dependent UI on it. */
export function useHydrated(): boolean {
  const hydrated = useSyncExternalStore(
    (onChange) => useCake.persist.onFinishHydration(onChange),
    () => useCake.persist.hasHydrated(),
    () => false,
  );

  useEffect(() => {
    if (started) return;
    started = true;
    void Promise.resolve(useCake.persist.rehydrate()).then(() => {
      // The restored value must not become an undoable step — undoing straight
      // back to the default cake on page load would be baffling.
      useCake.temporal.getState().clear();
    });
  }, []);

  return hydrated;
}

export const useConfig = () => useCake((s) => s.config);
export const useSetConfig = () => useCake((s) => s.set);
