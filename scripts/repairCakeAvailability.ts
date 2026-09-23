import 'dotenv/config';
import { db } from '../lib/db';
import { migrateConfig } from '../lib/schema';
import { ProductionSpec, productionSpecFromConfig } from '../lib/productionSpec';

// Explicit maintenance operation; never runs during a storefront request.
async function main() {
  const enable = process.argv.includes('--enable-all');
  const rows = await db.cakeProduct.findMany({ include: { variants: true } });
  const repairs = rows.map(row => {
    const config = migrateConfig(row.config);
    const spec = row.productionSpec === null && config
      ? productionSpecFromConfig(config) : row.productionSpec;
    const parsed = ProductionSpec.safeParse(spec);
    if (!parsed.success) throw new Error(`${row.slug}: repair ingredients, allergens, instructions and review before enabling sales.`);
    return { row, spec: parsed.data };
  });
  await db.$transaction(async tx => {
    for (const { row, spec } of repairs) {
      await tx.cakeProduct.update({ where: { id: row.id }, data: {
        ...(row.productionSpec === null ? { productionSpec: spec } : {}),
        ...(enable ? { isAvailable: true } : {}),
      }});
    }
    if (enable) await tx.cakeVariant.updateMany({ data: { isAvailable: true } });
  });
  console.log(JSON.stringify({ cakes: rows.length, repaired: rows.filter(r => r.productionSpec === null).length, variants: rows.reduce((n,r)=>n+r.variants.length,0), enabledAll: enable }));
}
main().catch(e=>{ console.error(e.message); process.exitCode=1; }).finally(()=>db.$disconnect());
