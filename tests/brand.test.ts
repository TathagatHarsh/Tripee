import { expect, it } from "vitest";
import { publicBakeryBrand } from "@/lib/brand";
import { DEFAULT_BAKERY } from "@/lib/catalogDefaults";

it("displays legacy bakery settings with current branding without mutating them", () => {
  for (const name of ["MakeMyCake", "Make My Cake", "Make my Cake", "makemycake", "Make Your Cakes"]) {
    const legacy = { ...DEFAULT_BAKERY, name, email: "orders@makemycake.example" };
    const branded = publicBakeryBrand(legacy);
    expect(branded).toEqual({ ...legacy, name: "MakeYourCakes", email: "orders@makeyourcakes.com" });
    expect(legacy.name).toBe(name);
  }
  expect(publicBakeryBrand({ ...DEFAULT_BAKERY, email: "hello@makemycake.com" }).email).toBe("hello@makeyourcakes.com");
  const custom = { ...DEFAULT_BAKERY, name: "Partner Bakery", email: "hello@partner.com" };
  expect(publicBakeryBrand(custom)).toEqual(custom);
});
