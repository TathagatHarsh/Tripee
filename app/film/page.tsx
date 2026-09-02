import type { Metadata } from "next";

import { FilmHome } from "./FilmHome";

/*
 * The same page as `/`, kept addressable while the swap is reviewed. One
 * composition, two routes — a second copy of it would be a second homepage to
 * keep in step, which is exactly the duplication this whole product argues against.
 */
export const metadata: Metadata = {
  title: "Makemycake — nine choices, one cake",
  description:
    "One cake specified decision by decision, on a ticket the kitchen works from. Jubilee Hills, Hyderabad.",
};

export default function FilmPage() {
  return <FilmHome />;
}
