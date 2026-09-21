import { getCatalogSnapshot } from "../lib/catalogData";
import { priceCake } from "../lib/pricing";
import { migrateConfig } from "../lib/schema";
import { db } from "../lib/db";

const SIZES = ["0.5kg", "1kg", "1.5kg", "2kg", "3kg", "5kg"] as const;
const EGGS = ["egg", "eggless"] as const;

async function main() {
  const catalog = await getCatalogSnapshot();
  if (!catalog) throw new Error("No catalog");

  const cakes = await db.cakeProduct.findMany({
    include: { variants: true }
  });

  let created = 0;

  for (const cake of cakes) {
    if (!cake.config) continue;
    
    const config = migrateConfig(cake.config);
    if (!config) continue;

    for (const size of SIZES) {
      for (const eggType of EGGS) {
        if (cake.variants.some(v => v.sizeBand === size && v.eggType === eggType)) {
          continue;
        }

        const modifiedConfig = {
          ...config,
          size,
          eggless: eggType === "eggless"
        };
        const priced = priceCake(modifiedConfig, catalog);
        const deliveryFee = catalog.price.deliveryFee[modifiedConfig.delivery] ?? 0;
        const pricePaise = priced.subtotal - deliveryFee;

        await db.cakeVariant.create({
          data: {
            cakeId: cake.id,
            sizeBand: size,
            eggType: eggType,
            pricePaise: pricePaise,
            isAvailable: true,
          }
        });
        created++;
      }
    }
  }

  console.log(`Created ${created} missing variants`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
