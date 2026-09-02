"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { DELIVERY_OPTIONS, SIZES } from "@/lib/catalog";
import { PRESETS } from "@/lib/presets";
import type { CakeConfig, DeliverySlot, SizeBand } from "@/lib/schema";
import { deriveServings } from "@/lib/servings";
import { useCake } from "@/lib/store";

/**
 * The builder's front door, and the only place that reads what the homepage
 * carried in.
 *
 * This used to be a bare redirect to /build-legacy/shape, which meant every query
 * string arriving from the homepage was silently dropped: the twenty-one preset
 * stubs each link to /build?preset=<slug> under the sentence "open any of them
 * and the builder loads that exact cake", and the intake hands over the
 * headcount, pincode and slot it just validated. None of it survived the hop, so
 * a stranger's first act after answering four questions was to answer them
 * again — and the catalogue's promise was false at the moment of the click.
 *
 * Loading a design here deliberately does not become an undoable step, for the
 * same reason components/builder/LoadConfig gives: undoing straight back to the
 * default cake the instant you opened somebody's link would be baffling.
 */

/** The smallest size that still feeds the number of people who are eating. */
function sizeForPeople(people: number, base: CakeConfig): SizeBand {
  const fit = SIZES.find(s => deriveServings({ ...base, size: s.value }).max >= people);
  return (fit ?? SIZES[SIZES.length - 1]).value;
}

function BuildEntry() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    /*
     * Rehydration must finish BEFORE anything is loaded, not alongside it.
     * The store persists to sessionStorage with skipHydration, so rehydrate()
     * is async — kicked off in its own effect it resolved after loadPreset and
     * overwrote the cake the link had just asked for with whatever was left
     * from the previous visit. The preset appeared to load and then silently
     * reverted.
     */
    void (async () => {
      await useCake.persist.rehydrate();
      if (cancelled) return;
      apply();
    })();
    return () => { cancelled = true; };

    function apply() {
    const load = (c: CakeConfig, to: string) => {
      useCake.getState().loadPreset(c);
      useCake.temporal.getState().clear();
      router.replace(to);
    };

    /* A preset is a whole cake, so it lands on the docket — there is nothing
       left to choose, only something to check. */
    const slug = params.get("preset");
    if (slug) {
      const preset = PRESETS.find(p => p.slug === slug);
      if (preset) return load(preset.config, "/build-legacy/review");
    }

    /* The intake's answers are a head start, not a finished cake, so they land
       on the first step with the parts it could actually determine already set. */
    const current = useCake.getState().config;
    const patch: Partial<CakeConfig> = {};

    const people = Number(params.get("people"));
    if (Number.isFinite(people) && people > 0) patch.size = sizeForPeople(people, current);

    const pincode = params.get("pincode");
    if (pincode && /^\d{6}$/.test(pincode)) patch.pincode = pincode;

    const delivery = params.get("delivery");
    if (delivery && DELIVERY_OPTIONS.some(o => o.value === delivery)) {
      patch.delivery = delivery as DeliverySlot;
    }

    if (Object.keys(patch).length) return load({ ...current, ...patch }, "/build-legacy/shape");
    router.replace("/build-legacy/shape");
    }
  }, [params, router]);

  return null;
}

export default function BuildIndex() {
  /* useSearchParams needs a boundary or the whole route opts out of prerender. */
  return (
    <Suspense fallback={null}>
      <BuildEntry />
    </Suspense>
  );
}
