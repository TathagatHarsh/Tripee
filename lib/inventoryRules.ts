export type VariantNeed = { productId: string; sizeBand: string; eggType: 'egg' | 'eggless' };
type OrderedVariant = { cakeProductId: string | null; config: unknown; sizeBand?: string | null; eggType?: 'egg' | 'eggless' | null };
export function variantNeeds(order: OrderedVariant & { cakes: OrderedVariant[] }): VariantNeed[] {
  const needs: VariantNeed[] = [];
  for (const cake of order.cakes.length ? order.cakes : [order]) {
    const c = cake.config as { size?: unknown; eggless?: unknown } | null;
    const sizeBand = cake.sizeBand ?? c?.size;
    const eggType = cake.eggType ?? (typeof c?.eggless === 'boolean' ? (c.eggless ? 'eggless' : 'egg') : null);
    if (!cake.cakeProductId || typeof sizeBand !== 'string' || !sizeBand || !eggType)
      throw new Error('Order has no verifiable product variant. Review its cake specification.');
    if (!needs.some(n => n.productId === cake.cakeProductId && n.sizeBand === sizeBand && n.eggType === eggType))
      needs.push({ productId: cake.cakeProductId, sizeBand, eggType });
  }
  return needs;
}
export function meetsDeadline(deadline: Date | null, preparationMinutes: number, travelMinutes: number, now = new Date()) {
  return !deadline || now.getTime() + (preparationMinutes + travelMinutes) * 60000 <= deadline.getTime();
}
