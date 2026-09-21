"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createCake, saveCake, type CreateResult } from "@/app/admin/cakes/actions";
import type { EggType } from "@prisma/client";
import {
  CAKE_CATEGORIES, EGG_LABEL, EGG_TYPES, slugify,
  type CakeProductView, type CakeVariantView,
} from "@/lib/cakes";
import { SIZES } from "@/lib/catalog";
import type { SizeBand } from "@/lib/schema";
import { formatINR } from "@/lib/format";
import { ALLERGENS } from "@/lib/productionSpec";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./Toast";
import { UnsavedDialog, useUnsavedGuard } from "./UnsavedGuard";
import { aBtn, aField, aMonoField, FormRow, FormSection } from "./ui";

/**
 * Everything about a cake that a customer can see, on one form.
 *
 * One component for Add and Edit, because they differ in three things — the
 * action, whether there is an id, and what happens afterwards — and not in a
 * single field. Two files would be two places to add the next column to, and
 * the one that gets forgotten is always the one nobody is looking at.
 *
 * ## The grid is the cake's price list
 *
 * A row per weight band, a column per sponge, and a cell is either a price or
 * empty. Empty means "we do not sell that", which is §17's "do not force every
 * cake to have every size" expressed as the absence of a number rather than as a
 * checkbox somebody has to find. Beside each price is whether it is currently on
 * sale, so a bakery can stop selling the 2 kg for a fortnight without forgetting
 * what it cost.
 *
 * It posts as one hidden JSON field rather than twenty-four named inputs — see
 * `VariantInput` in the actions, which is both the wire format and the
 * validator. Nothing here is trusted: every cell is re-parsed and re-checked on
 * the server.
 *
 * ## The price is confirmed before it is saved
 *
 * Only when something has actually changed, and only on an existing cake. §7's
 * whole point is that repricing a cake stops being a code change — which makes
 * it a thing somebody can now do by accident in a grid beside a description. The
 * dialog names what moved and says plainly that existing orders keep what they
 * were quoted, because that is the question an owner asks themselves before they
 * press it.
 *
 * Rupees in, paise stored. A cell takes "849" or "849.50" and the server
 * re-parses the string it was sent. Nothing about the number is computed here.
 *
 * ## The slug follows the name until somebody touches it
 *
 * A cake's address should be `/cakes/chocolate-truffle` without anybody having
 * to think about it, and it must stop moving the moment it is real: renaming a
 * cake that customers already have links to must not silently break them. So
 * the field mirrors the name while it has never been edited, and after that it
 * is the owner's. On an existing cake it never auto-follows at all.
 */
export function CakeForm({ cake }: { cake?: CakeProductView }) {
  const router = useRouter();
  const { toast } = useToast();
  const editing = Boolean(cake);

  const [createState, create, creating] = useActionState(createCake, undefined);
  const [saveState, save, saving] = useActionState(saveCake, undefined);
  const state = editing ? saveState : createState;
  const pending = creating || saving;

  const [name, setName] = useState(cake?.name ?? "");
  const [slug, setSlug] = useState(cake?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(editing);
  /* The grid, as strings, because that is what the fields hold and what the
     server re-parses. Dividing by 100 is the one place paise become rupees in
     this component. */
  const [cells, setCells] = useState<CellMap>(() => cellsFrom(cake?.variants ?? []));
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState<FormData | null>(null);
  const guard = useUnsavedGuard(dirty && !pending);

  /*
   * React to each result once, and keep the side effects out of the render.
   *
   * The `seen` comparison is the pattern components/admin/PriceEditor
   * documents: `useActionState` hands back a fresh object per submission, so
   * comparing against the last one fires exactly once. What that block may do
   * is set state and nothing else — announcing and navigating are effects, and
   * running either during render is a side effect React is entitled to run
   * twice or discard.
   */
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setDirty(false);
  }

  useEffect(() => {
    if (state) toast(state.message, state.ok);
  }, [state, toast]);

  useEffect(() => {
    /* Straight to the editor after a create, because the photograph is the next
       thing an owner wants and it lives there. */
    const created = state as CreateResult | undefined;
    if (!editing && created?.ok && created.id) router.push(`/admin/cakes/${created.id}`);
  }, [state, editing, router]);

  const rows = rowsFrom(cells);
  /* What the server will be sent, built once so the hidden field and the
     confirmation dialog cannot describe two different saves. */
  const payload = JSON.stringify(rows);

  /* Which prices actually moved, named. An empty list means nothing to confirm —
     asking "are you sure" over a typo fix in a description is how a dialog
     becomes a thing people click through without reading. */
  const moved = editing ? movedPrices(cake!.variants, rows) : [];

  function submit(form: FormData) {
    if (moved.length > 0) {
      setConfirming(form);
      return;
    }
    (editing ? save : create)(form);
  }

  return (
    <>
      <UnsavedDialog blocking={guard.blocking} onDiscard={guard.discard} onStay={guard.stay} />

      <form action={submit} onChange={() => setDirty(true)} className="flex flex-col">
        {cake && <input type="hidden" name="id" value={cake.id} />}

        <FormSection
          title="On the shelf"
          blurb="The name, the sentence underneath it and the family it is filed under. All three are what a customer reads."
        >
          <FormRow label="Cake name" htmlFor="name">
            <input
              id="name"
              name="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              required
              maxLength={80}
              autoComplete="off"
              className={aField()}
              placeholder="Chocolate Truffle"
            />
          </FormRow>

          <FormRow
            label="Web address"
            htmlFor="slug"
            hint={`Customers will find this cake at /cakes/${slug || "…"}. Changing it breaks any link somebody already has.`}
          >
            <input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              maxLength={60}
              autoComplete="off"
              className={aMonoField()}
              placeholder="chocolate-truffle"
            />
          </FormRow>

          <FormRow
            label="Description"
            htmlFor="description"
            hint="One or two lines. It prints on the card and again on the cake's own page."
          >
            <textarea
              id="description"
              name="description"
              defaultValue={cake?.description ?? ""}
              required
              rows={3}
              maxLength={600}
              className={aField("resize-y")}
              placeholder="Belgian sponge, dark ganache, truffles piled on top."
            />
          </FormRow>

          <FormRow label="Category" htmlFor="category">
            <select
              id="category"
              name="category"
              defaultValue={cake?.category ?? "classic"}
              className={aField()}
            >
              {CAKE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormRow>
        </FormSection>

        <FormSection
          title="Production specification"
          blurb="The kitchen and allergen record frozen onto every new order. A cake cannot be sold until this has been reviewed."
        >
          <FormRow label="Ingredients" htmlFor="ingredients" hint="One ingredient or prepared component per line.">
            <textarea
              id="ingredients"
              name="ingredients"
              defaultValue={cake?.productionSpec?.ingredients.join("\n") ?? ""}
              required
              rows={6}
              className={aField("resize-y")}
              placeholder={"Chocolate sponge\nDark ganache\nWhipping cream"}
            />
          </FormRow>

          <fieldset className="grid gap-3 border-0 p-0">
            <legend className="font-a-mono text-a-meta uppercase tracking-[0.1em] text-a-muted">
              Allergens
            </legend>
            <p className="text-a-meta text-a-muted">
              Select every allergen present in any component. Egg is added automatically for a with-egg variant.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ALLERGENS.filter((a) => a !== "Egg").map((allergen) => (
                <label key={allergen} className="flex min-h-11 items-center gap-3 rounded-a border border-a-line px-3 py-2">
                  <input
                    type="checkbox"
                    name="allergens"
                    value={allergen}
                    defaultChecked={cake?.productionSpec?.allergens.includes(allergen)}
                  />
                  <span className="text-a-small text-a-ink">{allergen}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <FormRow label="Dietary claims" htmlFor="dietaryClaims" hint="One reviewed claim per line. Leave empty if none apply.">
            <textarea
              id="dietaryClaims"
              name="dietaryClaims"
              defaultValue={cake?.productionSpec?.dietaryClaims.join("\n") ?? ""}
              rows={3}
              className={aField("resize-y")}
              placeholder="Eggless sponge available"
            />
          </FormRow>

          <FormRow label="Kitchen instructions" htmlFor="kitchenInstructions" hint="The reproducible recipe and assembly instructions the assigned bakery follows.">
            <textarea
              id="kitchenInstructions"
              name="kitchenInstructions"
              defaultValue={cake?.productionSpec?.kitchenInstructions ?? ""}
              required
              minLength={10}
              maxLength={4000}
              rows={8}
              className={aField("resize-y")}
            />
          </FormRow>

          <FormRow label="Preparation notes" htmlFor="preparationNotes" hint="Optional handling, cross-contact, storage, or finishing notes.">
            <textarea
              id="preparationNotes"
              name="preparationNotes"
              defaultValue={cake?.productionSpec?.preparationNotes ?? ""}
              maxLength={2000}
              rows={4}
              className={aField("resize-y")}
            />
          </FormRow>

          <Check
            name="allergenStatementReviewed"
            label="Allergen statement reviewed"
            hint="I have checked the ingredients and selected every allergen."
            defaultChecked={cake?.productionSpec?.allergenStatementReviewed ?? false}
          />
        </FormSection>

        <FormSection
          title="Sizes and prices"
          blurb="What a customer actually buys. Leave a box empty for a size you do not sell in that sponge — a cake only offers what is priced here."
        >
          <VariantGrid
            cells={cells}
            onChange={(next) => {
              setCells(next);
              setDirty(true);
            }}
          />
          {/* The grid, as one field. See the note at the top of this file and
              `VariantInput` in the actions, which parses it. */}
          <input type="hidden" name="variants" value={payload} />
          {rows.length === 0 && (
            <p role="alert" className="text-a-meta text-a-bad-ink">
              Price at least one size. Until you do, there is nothing for a
              customer to put in a basket.
            </p>
          )}
        </FormSection>

        <FormSection
          title="Where it appears"
          blurb="Whether the shop sells it, whether it leads, and in what order it sits."
        >
          <Check
            name="isAvailable"
            label="On the shelf"
            hint="Off takes it out of the shop immediately. Orders already placed are unaffected."
            defaultChecked={cake?.isAvailable ?? false}
          />
          <Check
            name="isFeatured"
            label="Featured"
            hint="Featured cakes come first on the homepage and under the Featured sort."
            defaultChecked={cake?.isFeatured ?? false}
          />

          <FormRow
            label="Display order"
            htmlFor="sortOrder"
            hint="Lower numbers come first. Cakes with the same number are ordered by name."
          >
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              step={1}
              defaultValue={cake?.sortOrder ?? 0}
              className={aMonoField("max-w-32")}
            />
          </FormRow>

          <FormRow
            label="Photo description"
            htmlFor="imageAlt"
            hint="What the photograph shows, for somebody using a screen reader. Left empty, the cake's name is used."
          >
            <input
              id="imageAlt"
              name="imageAlt"
              defaultValue={cake?.imageAlt ?? ""}
              maxLength={160}
              className={aField()}
              placeholder="A dark chocolate cake with truffles piled on top."
            />
          </FormRow>
        </FormSection>

        <div className="flex flex-wrap items-center gap-3 pt-5">
          <button type="submit" disabled={pending} className={aBtn("primary", "lg")}>
            {pending ? "Saving…" : editing ? "Save cake" : "Add cake"}
          </button>
          {!editing && (
            <p className="text-a-small text-a-muted">
              You can add the photos once the cake exists.
            </p>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={confirming !== null}
        title={moved.length === 1 ? "Change this price?" : "Change these prices?"}
        tone="primary"
        confirmLabel={moved.length === 1 ? "Change the price" : "Change the prices"}
        busy={pending}
        body={
          <>
            <p>{name || "This cake"} changes:</p>
            {/* Every price that moved, named by its size and sponge. §14 asks
                for both numbers out loud, and with a grid that means one line
                per cell rather than one sentence about "the price". */}
            <ul className="mt-2 flex flex-col gap-1">
              {moved.map((m) => (
                <li key={m.key} className="font-a-mono text-a-small tabular-nums">
                  {m.label}: {m.before === null ? "new" : formatINR(m.before)} →{" "}
                  <strong>{formatINR(m.after)}</strong>
                </li>
              ))}
            </ul>
            <p className="mt-2">
              It applies to new orders only. Every order already placed keeps the
              price it was quoted.
            </p>
          </>
        }
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const form = confirming;
          setConfirming(null);
          if (form) save(form);
        }}
      />
    </>
  );
}

/**
 * A checkbox with its own explanation.
 *
 * `FormRow` puts the label above the control, which is right for a text field
 * and wrong for a switch — a tickbox belongs beside the words it governs. One
 * small component rather than a `variant` prop on FormRow, because the two
 * layouts share nothing but a hint paragraph.
 */
function Check({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 size-4 shrink-0 accent-[var(--a-accent)]"
      />
      <div className="min-w-0">
        <label htmlFor={name} className="font-a-sans text-a-body font-medium text-a-ink">
          {label}
        </label>
        <p className="mt-0.5 text-a-meta leading-relaxed text-a-muted">{hint}</p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── the grid */

/** One cell: what an owner typed, and whether it is on sale. */
interface Cell {
  price: string;
  isAvailable: boolean;
}

/** Keyed `1.5kg:eggless`, which is the same identity the unique index uses. */
type CellMap = Record<string, Cell>;

const cellKey = (size: SizeBand, egg: EggType) => `${size}:${egg}`;

/** Rupees, as an owner would type them: "849", not "849.00". */
function rupees(paise: number): string {
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}

/** The stored variants, as the grid's editable strings. */
function cellsFrom(variants: readonly CakeVariantView[]): CellMap {
  const out: CellMap = {};
  for (const v of variants) {
    out[cellKey(v.sizeBand, v.eggType)] = {
      price: rupees(v.pricePaise),
      isAvailable: v.isAvailable,
    };
  }
  return out;
}

export interface VariantRow {
  sizeBand: SizeBand;
  eggType: EggType;
  price: string;
  isAvailable: boolean;
}

/**
 * The grid, as the rows the server will be sent.
 *
 * A blank cell is not a row, which is the whole of "configure only the sizes
 * actually sold". Whitespace counts as blank so that clearing a field with the
 * spacebar deletes the variant rather than sending " " for the server to reject.
 */
function rowsFrom(cells: CellMap): VariantRow[] {
  const out: VariantRow[] = [];
  for (const size of SIZES) {
    for (const egg of EGG_TYPES) {
      const cell = cells[cellKey(size.value, egg)];
      if (!cell || !cell.price.trim()) continue;
      out.push({
        sizeBand: size.value,
        eggType: egg,
        price: cell.price.trim(),
        isAvailable: cell.isAvailable,
      });
    }
  }
  return out;
}

/**
 * Which prices changed, in words, for the confirmation.
 *
 * A new variant counts — adding a 2 kg at ₹3,499 is a price going on the shelf
 * and deserves the same look as moving one — and a *removed* one deliberately
 * does not: clearing a cell is already visible as an empty box, and the sentence
 * an owner needs for that is "this size is no longer sold", which the save's own
 * acknowledgement covers.
 *
 * Compared in paise rather than on the strings, so "849" and "849.00" are not
 * reported as a change.
 */
function movedPrices(
  before: readonly CakeVariantView[],
  after: readonly VariantRow[],
): { key: string; label: string; before: number | null; after: number }[] {
  const was = new Map(before.map((v) => [cellKey(v.sizeBand, v.eggType), v.pricePaise]));

  const out: { key: string; label: string; before: number | null; after: number }[] = [];
  for (const row of after) {
    const key = cellKey(row.sizeBand, row.eggType);
    const next = Math.round(Number(row.price) * 100);
    if (!Number.isFinite(next)) continue;
    const prev = was.get(key) ?? null;
    if (prev === next) continue;
    out.push({
      key,
      label: `${SIZES.find((s) => s.value === row.sizeBand)?.name ?? row.sizeBand} · ${EGG_LABEL[row.eggType]}`,
      before: prev,
      after: next,
    });
  }
  return out;
}

/**
 * Six rows, two columns, and a price in as many cells as the bakery sells.
 *
 * ## Why a grid rather than a repeating "add a variant" list
 *
 * Because the set of possibilities is fixed and small. There are six weight
 * bands and two sponges, so the complete space is twelve cells — which fits on a
 * screen, needs no Add button, no Remove button, no empty-state and no ordering,
 * and makes "which sizes do we sell" answerable at a glance instead of by
 * reading a list. An add/remove list is the right shape when the rows are
 * open-ended; these are an enum crossed with an enum.
 *
 * ## The availability tick is per cell, and only where there is a price
 *
 * §16 asks to enable and disable egg, eggless and individual sizes. All three
 * are the same control at different scales: clear a column and the sponge is
 * gone, clear a row and the size is gone, untick one box and that exact version
 * stops selling while keeping the price it had. A cell with no price has nothing
 * to be available *for*, so its tick is disabled rather than hidden — a control
 * that vanishes as you type in the box beside it is a layout that jumps.
 *
 * `inputMode="decimal"` rather than `type="number"`: a number input on a phone
 * gets spinners nobody wants, silently discards "1,299" as unparseable, and
 * scroll-wheels a price while somebody is reading the page.
 */
function VariantGrid({
  cells,
  onChange,
}: {
  cells: CellMap;
  onChange: (next: CellMap) => void;
}) {
  function set(size: SizeBand, egg: EggType, patch: Partial<Cell>) {
    const key = cellKey(size, egg);
    const current = cells[key] ?? { price: "", isAvailable: true };
    onChange({ ...cells, [key]: { ...current, ...patch } });
  }

  return (
    /* Its own scroll box, so two price columns plus their ticks cannot widen the
       page on a narrow admin window — the rule components/admin/DataTable and
       `a-scroll-x` already follow. */
    <div className="a-scroll-x">
      <table className="w-full min-w-[34rem] border-collapse">
        <thead>
          <tr>
            <th
              scope="col"
              className="w-[9rem] pb-2 text-left font-a-mono text-a-meta tracking-[0.1em] text-a-muted uppercase"
            >
              Size
            </th>
            {EGG_TYPES.map((egg) => (
              <th
                key={egg}
                scope="col"
                className="pb-2 text-left font-a-mono text-a-meta tracking-[0.1em] text-a-muted uppercase"
              >
                {EGG_LABEL[egg]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SIZES.map((size) => (
            <tr key={size.value} className="border-t border-a-line">
              <th scope="row" className="py-2.5 pr-4 text-left align-middle">
                <span className="font-a-sans text-a-body font-medium text-a-ink">{size.name}</span>
                <span className="block text-a-meta text-a-muted">{size.blurb}</span>
              </th>

              {EGG_TYPES.map((egg) => {
                const cell = cells[cellKey(size.value, egg)];
                const priced = Boolean(cell?.price.trim());
                const id = `v-${size.value}-${egg}`;
                return (
                  <td key={egg} className="py-2.5 pr-4 align-middle">
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="font-a-mono text-a-body text-a-muted">
                        &#8377;
                      </span>
                      <input
                        id={id}
                        /* Labelled by its own column and row headers, which is
                           what a `th scope` pair is for — an explicit <label>
                           per cell would print "1.5 kg with egg" twelve times
                           into a table that already says it. */
                        aria-label={`${size.name}, ${EGG_LABEL[egg]}, price in rupees`}
                        value={cell?.price ?? ""}
                        onChange={(e) => set(size.value, egg, { price: e.target.value })}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="—"
                        className={aMonoField("max-w-28")}
                      />
                      <label
                        className={
                          "inline-flex items-center gap-1.5 text-a-meta " +
                          (priced ? "text-a-muted" : "text-a-muted/50")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={priced ? (cell?.isAvailable ?? true) : false}
                          disabled={!priced}
                          onChange={(e) => set(size.value, egg, { isAvailable: e.target.checked })}
                          aria-label={`${size.name}, ${EGG_LABEL[egg]}, on sale`}
                          className="size-4 accent-[var(--a-accent)]"
                        />
                        On sale
                      </label>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
