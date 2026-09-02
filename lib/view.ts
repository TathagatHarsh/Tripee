"use client";

import { create } from "zustand";

/**
 * How the cake is being *looked at*, as opposed to what the cake *is*.
 *
 * None of this belongs in CakeConfig: a slice is not something you order, and
 * putting it there would change the config hash, the docket, the price and
 * every saved design's URL.
 */
interface ViewState {
  /** Cutaway wedge removed so the sponge and filling are visible. */
  sliced: boolean;
  toggleSlice: () => void;

  /**
   * True while the customer is still typing their message. The plaque floats
   * clear of the cake so the lettering is readable against the background
   * rather than against frosting, and settles onto the cake when they're done.
   */
  composingMessage: boolean;
  setComposingMessage: (v: boolean) => void;
}

export const useView = create<ViewState>()((set) => ({
  /*
   * Section is the default; the whole cake is the toggle. §5.3: "Section view is
   * the default. Whole cake is the toggle." — and §10 promotes "Cut a slice" from
   * a small grey button to the opening view.
   *
   * The argument is that a photograph of an iced cylinder is something a
   * photographer will always beat you at, whereas nobody else can show a customer
   * the inside of the cake they are halfway through choosing. The section is the
   * one view where sponge, filling and layer count are all visible at once, which
   * is most of what the builder spends nine steps asking about.
   */
  sliced: true,
  toggleSlice: () => set((s) => ({ sliced: !s.sliced })),

  composingMessage: false,
  setComposingMessage: (composingMessage) => set({ composingMessage }),
}));
