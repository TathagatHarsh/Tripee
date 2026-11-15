/* No server imports: the page builds rows with this and the client grid edits them. */
export type GridVariant = { productId: string; name: string; photo: string | null; sizeBand: string; eggType: string };
export type GridRowInput = { productId: string; sizeBand: string; eggType: string; isAvailable: boolean };
export type GridRow = {
  productId: string;
  name: string;
  photo: string | null;
  sizes: { band: string; on: boolean }[];
  /** null means the cake has no variant of that egg type. */
  egg: boolean | null;
  eggless: boolean | null;
  /** Every variant the cake has, as `band|eggType`. */
  variants: string[];
};

export const sizeLabel = (band: string) => band.replace(/\s*kg$/, ' kg');

export function gridFromRows(variants: GridVariant[], rows: GridRowInput[]): GridRow[] {
  const cakes = new Map<string, GridVariant[]>();
  for (const v of variants) cakes.set(v.productId, [...(cakes.get(v.productId) ?? []), v]);
  return [...cakes.values()].map(vs => {
    const mine = rows.filter(r => r.productId === vs[0].productId && r.isAvailable);
    const bands = [...new Set(vs.map(v => v.sizeBand))].sort((a, b) => parseFloat(a) - parseFloat(b));
    const has = (type: string) => vs.some(v => v.eggType === type);
    return {
      productId: vs[0].productId,
      name: vs[0].name,
      photo: vs[0].photo,
      sizes: bands.map(band => ({ band, on: mine.some(r => r.sizeBand === band) })),
      egg: has('egg') ? mine.some(r => r.eggType === 'egg') : null,
      eggless: has('eggless') ? mine.some(r => r.eggType === 'eggless') : null,
      variants: bands.flatMap(b => vs.filter(v => v.sizeBand === b).map(v => `${b}|${v.eggType}`)),
    };
  });
}

/** The variants a row describes: ticked sizes x enabled egg types, restricted to ones that exist. */
export function wantedVariants(row: GridRow): string[] {
  const bands = new Set(row.sizes.filter(s => s.on).map(s => s.band));
  return row.variants.filter(k => { const [band, type] = k.split('|'); return bands.has(band) && (type === 'egg' ? row.egg : row.eggless); });
}
