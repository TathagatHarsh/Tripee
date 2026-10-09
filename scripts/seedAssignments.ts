import dotenv from "dotenv";
import { createClerkClient } from "@clerk/backend";
import { db } from "../lib/db";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const bakeries = [
  { id: "demo-sweet-crumbs", name: "Sweet Crumbs (Demo)", latitude: 17.4401, longitude: 78.3489, address: "Gachibowli, Hyderabad, Telangana 500032" },
  { id: "demo-cake-studio", name: "Cake Studio (Demo)", latitude: 17.4399, longitude: 78.4983, address: "Secunderabad, Hyderabad, Telangana 500003" },
  { id: "demo-oven-house", name: "Oven House (Demo)", latitude: 17.3457, longitude: 78.5522, address: "LB Nagar, Hyderabad, Telangana 500074" },
  { id: "demo-sugar-petal", name: "Sugar Petal (Demo)", latitude: 17.3958, longitude: 78.4312, address: "Mehdipatnam, Hyderabad, Telangana 500028" },
];

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  let existingVendorId: string | undefined;
  if (email) {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const { data } = await clerk.users.getUserList({ emailAddress: [email], limit: 2 });
    if (data.length !== 1) throw new Error(`Expected exactly one account for ${email}.`);
    const profile = await db.userProfile.findUnique({ where: { id: data[0].id } });
    if (profile?.role !== "VENDOR" || !profile.vendorId) throw new Error(`${email} is not linked to a vendor.`);
    existingVendorId = profile.vendorId;
  }
  const products = await db.cakeProduct.findMany({ include: { variants: true } });
  if (!products.length || products.some(p => !p.variants.length)) throw new Error("Every catalogue cake must have variants before seeding demo inventory.");

  const vendorIds = [...bakeries.map(v => v.id), ...(existingVendorId ? [existingVendorId] : [])];
  await db.$transaction(async tx => {
    // Share the lock used by assignment and inventory changes.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(7142026)`;
    for (const bakery of bakeries) {
      const data = { ...bakery, isActive: true, isAcceptingOrders: true, isBusy: false, unavailableUntil: null, fulfillsAllProducts: true, serviceRadiusKm: 30, maxConcurrentOrders: 20 };
      await tx.vendor.upsert({ where: { id: bakery.id }, update: data, create: data });
    }
    if (existingVendorId) await tx.vendor.update({ where: { id: existingVendorId }, data: { fulfillsAllProducts: true } });
    const where = { vendorId: { in: vendorIds }, productId: { in: products.map(p => p.id) } };
    const before = await tx.vendorInventory.findMany({ where });
    await tx.vendorInventory.createMany({
      skipDuplicates: true,
      data: vendorIds.flatMap(vendorId => products.flatMap(product => product.variants.map(variant => ({
        vendorId, productId: product.id, productName: product.name, sizeBand: variant.sizeBand, eggType: variant.eggType, isAvailable: true,
      })))),
    });
    await tx.vendorInventory.updateMany({ where, data: { isAvailable: true } });
    const after = await tx.vendorInventory.findMany({ where });
    const previous = new Map(before.map(row => [row.id, row.isAvailable]));
    const changes = after.filter(row => previous.get(row.id) !== true);
    if (changes.length) await tx.inventoryAvailabilityChange.createMany({ data: changes.map(row => ({ inventoryId: row.id, previousAvailable: previous.get(row.id) ?? null, newAvailable: true, userId: "script:demo-assignments" })) });
  }, { timeout: 30000 });

  console.log(JSON.stringify({ cakes: products.length, variantsPerVendor: products.reduce((n, p) => n + p.variants.length, 0), vendors: await db.vendor.findMany({ where: { id: { in: vendorIds } }, select: { name: true, address: true, _count: { select: { inventory: { where: { isAvailable: true } } } } } }) }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => db.$disconnect());
