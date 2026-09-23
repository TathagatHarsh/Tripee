import "dotenv/config";
import { db } from "../lib/db";
const bakeries = [
  {
    id: "demo-sweet-crumbs",
    name: "Sweet Crumbs",
    latitude: 17.4325,
    longitude: 78.4075,
    address: "Jubilee Hills, Hyderabad, Telangana 500033",
  },
  {
    id: "demo-cake-studio",
    name: "Cake Studio",
    latitude: 17.4415,
    longitude: 78.413,
    address: "Road No. 36, Jubilee Hills, Hyderabad, Telangana 500033",
  },
  {
    id: "demo-oven-house",
    name: "Oven House",
    latitude: 17.4505,
    longitude: 78.391,
    address: "Madhapur, Hyderabad, Telangana 500081",
  },
];
async function main() {
  for (const v of bakeries)
    await db.vendor.upsert({
      where: { id: v.id },
      update: {},
      create: {
        ...v,
        isActive: true,
        isAcceptingOrders: true,
        fulfillsAllProducts: true,
        serviceRadiusKm: 25,
        maxConcurrentOrders: 20,
        commissionBps: 2000,
      },
    });
  const product = await db.cakeProduct.findFirst({
    where: { isAvailable: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { variants: true },
  });
  if (!product) throw new Error("Create an available catalogue cake before running demo:assignments.");
  const variant = product.variants.find(v => v.sizeBand === "2kg" && v.eggType === "eggless") ?? product.variants[0];
  const sizeBand = variant?.sizeBand ?? product.sizeBand;
  const eggType = variant?.eggType ?? (product.isEggless ? "eggless" : "egg");
  for (const [index, vendor] of bakeries.entries()) {
    await db.vendorInventory.upsert({
      where: { vendorId_productId_sizeBand_eggType: { vendorId: vendor.id, productId: product.id, sizeBand, eggType } },
      update: {},
      create: { vendorId: vendor.id, productId: product.id, productName: product.name, sizeBand, eggType, isAvailable: index !== 1 },
    });
  }
  console.log(`Demo variant: ${product.name} · ${sizeBand} · ${eggType}. New availability rows: Sweet Crumbs/Oven House available; Cake Studio unavailable. Existing flags are preserved; verify them in inventory before the demo.`);
  console.log(
    "Demo bakeries created if missing. Customer pin: 17.431, 78.407 (Jubilee Hills, 500033). Link separate signed-in accounts under /admin/vendors.",
  );
}
main().finally(() => db.$disconnect());
