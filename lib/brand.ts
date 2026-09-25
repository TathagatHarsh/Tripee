import type { BakeryInfo } from "./catalogSnapshot";

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
