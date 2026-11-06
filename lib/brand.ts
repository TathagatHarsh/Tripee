import type { BakeryInfo } from "./catalogSnapshot";

/**
 * The legal business behind the MakeYourCakes brand: the Food Business Operator
 * on the FSSAI registration certificate (Reg. No. 23624029001006). Named in the
 * terms, privacy policy, contact page and footer.
 */
export const LEGAL_NAME = "Bhuvi Enterprises";

/** Display legacy settings with current branding without rewriting stored records. */
export function publicBakeryBrand(bakery: BakeryInfo): BakeryInfo {
  return {
    ...bakery,
    name: /^make\s*(?:my\s*cake|your\s*cakes)$/i.test(bakery.name.trim())
      ? "MakeYourCakes"
      : bakery.name,
    email: bakery.email.replace(/@(?:makemycake\.(?:com|example)|makeyourcakes\.example)$/i, "@makeyourcakes.com"),
  };
}
