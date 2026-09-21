import type { CakeConfig, SizeBand } from "./schema";

export const WEIGHT_KG: Record<SizeBand, number> = {
  "0.5kg": 0.5,
  "1kg": 1,
  "1.5kg": 1.5,
  "2kg": 2,
  "3kg": 3,
  "5kg": 5,
};

/** Diameter in inches, for the docket. Bakeries speak in inches. */
export const DIAMETER_IN: Record<SizeBand, number> = {
  "0.5kg": 6,
  "1kg": 7,
  "1.5kg": 8,
  "2kg": 9,
  "3kg": 10,
  "5kg": 12,
};

export interface Servings {
  min: number;
  max: number;
  /** The assumption, stated out loud rather than buried. */
  basis: string;
}

/** Based on standard 100g portions; the lower bound allows generous slices. */
export function deriveServings(c: CakeConfig): Servings {
  return servingsForSize(c.size);
}

export function servingsForSize(size: SizeBand): Servings {
  const grams = WEIGHT_KG[size] * 1000;
  const max = Math.round(grams / 100);
  const min = Math.max(2, Math.round(max * 0.8));
  return {
    min,
    max,
    basis: "based on standard 100g portions",
  };
}

export function servingsLabel(c: CakeConfig): string {
  const s = deriveServings(c);
  return s.min === s.max ? `Serves ${s.max}` : `Serves ${s.min}–${s.max}`;
}

export interface Handling {
  storage: string;
  serveAt: string;
  bestBefore: string;
  bestBeforeHours: number;
}

const HIGHLY_PERISHABLE: CakeConfig["frosting"][] = [
  "whipped-cream", "cream-cheese", "mirror-glaze",
];

export function deriveHandling(c: CakeConfig): Handling {
  const perishable =
    HIGHLY_PERISHABLE.includes(c.frosting) ||
    c.filling === "fresh-fruit" ||
    c.filling === "vanilla-custard" ||
    c.toppings.some(t => t.kind === "strawberry" || t.kind === "mixed-berry" || t.kind === "edible-flower");

  const hours = perishable ? 24 : 48;

  return {
    storage: perishable
      ? "Refrigerate at 4°C immediately, keep boxed"
      : "Refrigerate at 4°C",
    serveAt: c.frosting === "fondant" || c.frosting === "dark-ganache"
      ? "Room temperature — rest 30 min before serving"
      : "Room temperature — rest 20 min before serving",
    bestBefore: `${hours} hours from delivery`,
    bestBeforeHours: hours,
  };
}
