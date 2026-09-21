import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CatalogCategory } from "@prisma/client";
import {
  CATEGORY_META, groupFor, priceHint, priceLabel,
} from "@/lib/adminNav";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatINR, formatIST } from "@/lib/format";
import { hasImageStore, NO_IMAGE_STORE_MESSAGE } from "@/lib/storage";
import { AvailabilityToggle } from "@/components/admin/AvailabilityToggle";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { OptionForm } from "@/components/admin/OptionForm";
import { PriceEditor } from "@/components/admin/PriceEditor";
import {
  aBtn, aEyebrow, AvailabilityBadge, Card, CardHead, EmptyState, FormSection,
  Notice, PageHeader, Ref,
} from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";

/**
 * One option, editable.
 *
 * §13 sketches this as a cake editor — a large photo, a name, a description, a
 * category, an availability switch and a price — and that is what this is, for
 * the thing this catalogue actually contains. See lib/adminNav's long note on
 * why there is no editor for the twenty-one named cakes: those are
 * `lib/presets.ts`, code-defined `CakeConfig` objects whose prices are computed
 * from these options rather than stored, so repricing Belgian Chocolate here is
 * how the price of a Death By Chocolate changes.
 *
 * ## Four saves, not one
 *
 * §34 asks for a sectioned form and §14 asks for a price change to be confirmed
 * out loud, and those two together rule out a single Save at the bottom. So the
 * page has four independent writes:
 *
 *   · the photograph      — upload, crop, replace, remove  (§10–§12)
 *   · the price           — with a confirmation and a history  (§14, §15)
 *   · availability        — one press, no ceremony  (§19)
 *   · name and description — a normal form with a dirty state  (§24, §25)
 *
 * Each is the right ceremony for what it changes. Folding them together would
 * mean confirming a price change in order to fix a typo, and it would mean
 * losing a crop because the blurb had an error in it.
 *
 * ## Availability is here twice and that is not a mistake
 *
 * There is a switch in the header, where somebody who came to this page to
 * withdraw one thing can find it immediately, and a section further down where
 * somebody working through the form in order meets it in context. Both are the
 * same component pointed at the same row, so they cannot disagree — the page
 * re-renders from the server after either one.
 */

export const dynamic = "force-dynamic";

/** The category from the URL, or null. Never trusted as a `CatalogCategory`. */
function readCategory(raw: string): CatalogCategory | null {
  return raw in CATEGORY_META ? (raw as CatalogCategory) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; value: string }>;
}): Promise<Metadata> {
  const { category, value } = await params;
  const meta = readCategory(category);
  return {
    title: meta ? `${decodeURIComponent(value)} — ${CATEGORY_META[meta].label} — Admin` : "Admin",
    robots: { index: false, follow: false },
  };
}

export default async function OptionEditor({
  params,
}: {
  params: Promise<{ category: string; value: string }>;
}) {
  const raw = await params;
  const category = readCategory(raw.category);
  /*
   * A URL naming a category the enum does not have is a 404 rather than an
   * error page. It is the same reasoning `saveOption` applies on the write
   * side: this product's ten dimensions are a closed list, and a request for an
   * eleventh is a request for a page that does not exist.
   */
  if (!category) notFound();
  const value = decodeURIComponent(raw.value);

  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={value} back={{ href: "/admin/catalog", label: "Back to the catalogue" }} />
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  const option = await db.catalogOption.findUnique({
    /* The compound unique, not the id — so this page's URL is readable and
       stable rather than carrying a cuid an owner would see in their address
       bar (§23). */
    where: { category_value: { category, value } },
    include: {
      priceChanges: {
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { actor: { select: { name: true } } },
      },
    },
  });
  if (!option) notFound();

  const meta = CATEGORY_META[category];
  const group = groupFor(category);
  const store = hasImageStore();

  /* Where "back" goes. Delivery has no catalogue group — it lives on its own
     page with the zones and lead times — so it is the one category whose
     editor points somewhere else. */
  const back = group
    ? { href: `/admin/catalog/${group.slug}`, label: `Back to ${group.title.toLowerCase()}` }
    : { href: "/admin/delivery", label: "Back to delivery" };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={option.name} blurb={meta.blurb} back={back}>
        <AvailabilityBadge available={option.isAvailable} />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-a border border-a-line bg-a-surface px-4 py-3 shadow-a-card">
        <span className="flex items-center gap-1.5">
          <span className={aEyebrow}>{meta.label}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className={aEyebrow}>Reference</span>
          <Ref className="text-a-muted">{option.value}</Ref>
        </span>
        <span className="ml-auto">
          <AvailabilityToggle
            id={option.id}
            available={option.isAvailable}
            label={option.name}
          />
        </span>
      </div>

      {category === "delivery" && (
        <Notice tone="accent" icon="delivery">
          A delivery slot also promises a lead time and a window, and those are
          edited on the{" "}
          <Link href="/admin/delivery" className="font-medium underline">
            delivery page
          </Link>{" "}
          alongside the zones that add rider time to them.
        </Notice>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* ══════════════════════════════════════ the form, in sections */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <FormSection
              title="Basic information"
              blurb="What customers read when they are choosing this."
            >
              <OptionForm
                id={option.id}
                category={category}
                value={option.value}
                name={option.name}
                blurb={option.blurb}
                imageAlt={option.imageAlt}
                hasPhoto={Boolean(option.imageUrl)}
              />
            </FormSection>

            {/* ── §14: pricing ─────────────────────────────────────────── */}
            <FormSection title="Pricing" blurb={priceHint(category)}>
              <div>
                <p className={aEyebrow}>{priceLabel(category)}</p>
                <div className="mt-2">
                  <PriceEditor
                    id={option.id}
                    name={option.name}
                    paise={option.priceInputPaise}
                    label={priceLabel(category)}
                  />
                </div>
              </div>

              {category === "size" && option.multiplier !== null && (
                <p className="rounded-a border border-a-line bg-a-sunken px-3 py-2.5 text-a-meta leading-relaxed text-a-muted">
                  Every other choice on a cake this size is multiplied by{" "}
                  <span className="font-a-mono font-semibold text-a-ink">
                    {option.multiplier}×
                  </span>{" "}
                  — pistachio on a large cake is more pistachio than on a small
                  one. Changing that multiplier reprices every option at once, so
                  it is not editable here.
                </p>
              )}

              <p className="text-a-meta leading-relaxed text-a-muted">
                Orders already placed keep the price they were quoted. Changing
                this only affects what the next customer is charged.
              </p>
            </FormSection>

            {/* ── §19: availability ────────────────────────────────────── */}
            <FormSection
              title="Availability"
              blurb="Whether customers can choose this right now."
            >
              <AvailabilityToggle
                id={option.id}
                available={option.isAvailable}
                label={option.name}
              />
              <p className="text-a-meta leading-relaxed text-a-muted">
                Withdrawing it stops new customers picking it. Cakes that already
                name it — a saved design, an order in the kitchen — still render,
                still price and still get made. That is why there is no delete.
              </p>
            </FormSection>

            {/* ── the pill-sized name, placements only ─────────────────── */}
            {category === "placement" && (
              <FormSection
                title="Short name"
                blurb="The same choice named for the small strip that sits over the cake preview."
              >
                <p className="rounded-a border border-a-line bg-a-sunken px-3 py-2.5 text-a-small text-a-ink">
                  Currently{" "}
                  <span className="font-semibold">{option.shortName ?? "not set"}</span>.
                </p>
                <p className="text-a-meta leading-relaxed text-a-muted">
                  &ldquo;Scattered on top&rdquo; does not fit a 36px pill, so
                  placements carry a second, shorter name. The full name above is
                  still the one read aloud to anybody using a screen reader, so
                  nothing is hidden by the abbreviation.
                </p>
              </FormSection>
            )}
          </Card>
        </div>

        {/* ═══════════════════════════════════════ photo, and its history */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── §10–§12: the photograph ──────────────────────────────── */}
          <Card>
            <h2 className="font-a-sans text-a-item font-semibold text-a-ink">
              {meta.label} photo
            </h2>
            <p className="mb-3 mt-0.5 text-a-small leading-relaxed text-a-muted">
              {meta.photo
                ? "Shown to customers on the option they are choosing."
                : "This choice is a property of the arrangement rather than a thing on its own, so a photograph of it would be a photograph of something else."}
            </p>

            {meta.photo ? (
              <ImageUploader
                id={option.id}
                name={option.name}
                imageUrl={option.imageUrl}
                enabled={store}
                disabledReason={NO_IMAGE_STORE_MESSAGE}
              />
            ) : (
              <EmptyState
                icon="info"
                title="No photo for this one."
                blurb={
                  `Customers choose ${meta.plural.toLowerCase()} from the name and the `
                  + "description, which is what this category is."
                }
              />
            )}

            {option.swatch && (
              <div className="mt-4 flex items-center gap-2.5 border-t border-a-line pt-3.5">
                <span
                  aria-hidden="true"
                  className="size-8 shrink-0 rounded-a-sm border border-a-line"
                  style={{ background: option.swatch }}
                />
                <p className="text-a-meta leading-relaxed text-a-muted">
                  This is the colour customers see where there is no photo, and it
                  is also the colour the 3D preview renders. It is matched to the
                  real thing in the kitchen, so it is set in code rather than here.
                </p>
              </div>
            )}
          </Card>

          {/* ── §15: price history ───────────────────────────────────── */}
          <Card flush>
            <CardHead
              title="Price history"
              note="Every change since the portal started recording them."
            />
            {option.priceChanges.length === 0 ? (
              <EmptyState
                icon="clock"
                title="No changes recorded."
                blurb={
                  `This has been ${formatINR(option.priceInputPaise)} for as long as `
                  + "the portal has been keeping track. Nothing has been backfilled — "
                  + "an increase made before this was recorded is not shown, because "
                  + "inventing the date would make this a story rather than a record."
                }
              />
            ) : (
              <ol className="flex flex-col">
                {/* Newest first, and the current price is labelled as such rather
                    than left for somebody to infer from the top row. */}
                <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-a-line bg-a-good-wash px-4 py-2.5 sm:px-5">
                  <span className="flex items-center gap-2">
                    <span className="font-a-mono text-a-item font-semibold tabular-nums text-a-ink">
                      {formatINR(option.priceInputPaise)}
                    </span>
                    <span className="rounded-a-sm bg-a-good-line/50 px-1.5 py-0.5 text-a-meta font-semibold text-a-good-ink">
                      Current
                    </span>
                  </span>
                  <span className="font-a-mono text-a-meta text-a-muted">
                    since {formatIST(option.priceChanges[0]!.createdAt)}
                  </span>
                </li>

                {option.priceChanges.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-a-line px-4 py-2.5 last:border-0 sm:px-5"
                  >
                    <span className="flex flex-col">
                      <span className="font-a-mono text-a-small tabular-nums text-a-ink">
                        {formatINR(c.fromPaise)}
                        <span aria-hidden="true" className="mx-1.5 text-a-faint">→</span>
                        {formatINR(c.toPaise)}
                      </span>
                      <span className="text-a-meta text-a-muted">
                        {/* Who moved it. Null when the account has since been
                            removed, which the FK's SET NULL allows on purpose. */}
                        {c.actor?.name ?? "A staff member since removed"}
                        {c.toPaise > c.fromPaise ? " · increase" : " · reduction"}
                      </span>
                    </span>
                    <span className="font-a-mono text-a-meta text-a-muted">
                      {formatIST(c.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="border-t border-a-line px-4 py-3 text-a-meta leading-relaxed text-a-muted sm:px-5">
              None of this touches an order. Every order froze its own price lines
              when it was placed, and nothing here is joined to them.
            </p>
          </Card>

          <Link href={back.href} className={aBtn("secondary", "md", "w-full")}>
            <Icon name="arrowLeft" size={15} />
            {back.label}
          </Link>
        </div>
      </div>
    </div>
  );
}
