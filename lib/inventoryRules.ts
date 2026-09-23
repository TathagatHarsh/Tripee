export type VariantNeed = { productId: string; sizeBand: string; eggType: 'egg' | 'eggless' };
export function variantNeeds(order: { cakeProductId: string | null; config: unknown; cakes: { cakeProductId: string | null; config: unknown }[] }): VariantNeed[] {
  const needs: VariantNeed[] = [];
  for (const cake of order.cakes.length ? order.cakes : [order]) {
    const c = cake.config as { size?: unknown; eggless?: unknown } | null;
    if (!cake.cakeProductId || !c || typeof c.size !== 'string' || typeof c.eggless !== 'boolean')
      throw new Error('Order has no verifiable product variant. Review its cake specification.');
    const eggType = c.eggless ? 'eggless' : 'egg';
    const existing = needs.find(n => n.productId === cake.cakeProductId && n.sizeBand === c.size && n.eggType === eggType);
    if (!existing) needs.push({ productId: cake.cakeProductId, sizeBand: c.size, eggType });
  }
  return needs;
}
export function meetsDeadline(deadline: Date | null, preparationMinutes: number, travelMinutes: number, now = new Date()) {
  return !deadline || now.getTime() + (preparationMinutes + travelMinutes) * 60000 <= deadline.getTime();
}
