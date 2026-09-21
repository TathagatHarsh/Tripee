import Link from "next/link";
import { CATALOG_GROUPS, CATEGORY_META, type CatalogGroup } from "@/lib/adminNav";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { CatalogList } from "@/components/admin/CatalogList";
import { SearchForm } from "@/components/admin/Filters";
import {
  aBtn, Card, CardHead, Notice, PageHeader, StatusBadge,
} from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";
import { loadCategory } from "./data";

/**
 * One catalogue group — Cakes, Ingredients or Add-ons — as a page.
 *
 * Three routes, one component, because the three pages differ only in which
 * categories they are responsible for. The alternative was three near-identical
 * files, which is three places to fix a table and two of them forgotten; §35's
 * "do not duplicate styling across every page" applies to whole pages as much
 * as to buttons.
 *
 * ## Why a category is a section rather than a tab
 *
 * "Ingredients" is three categories — sponges, fillings, frostings — and an
 * owner repricing after a supplier's increase touches all three in one sitting.
 * Tabs would make that three clicks and three page loads to see whether they
 * had finished. One scrolling page with three tables means the browser's own
 * find-in-page works across the lot, which is the search an owner reaches for
 * first whatever we put on screen.
 *
 * The search box narrows every table on the page at once, for the same reason.
 */

export async function CatalogGroupPage({
  slug,
  searchParams,
}: {
  slug: CatalogGroup["slug"];
  searchParams: Promise<{ q?: string }>;
}) {
  const group = CATALOG_GROUPS.find((g) => g.slug === slug);
  /* A slug with no group is a routing mistake rather than a user error, so it
     fails loudly at build/render rather than rendering an empty page. */
  if (!group) throw new Error(`unknown catalogue group: ${slug}`);

  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={group.title} blurb={group.blurb} />
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const sections = await Promise.all(
    group.categories.map(async (category) => ({
      category,
      meta: CATEGORY_META[category],
      rows: await loadCategory(category, query),
    })),
  );

  const found = sections.reduce((n, s) => n + s.rows.length, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={group.title} blurb={group.blurb}>
        <Link href="/admin/catalog" className={aBtn("secondary", "md")}>
          <Icon name="arrowLeft" size={15} />
          Whole catalogue
        </Link>
      </PageHeader>

      {/*
        The sign on the door, and §20's actual requirement.
        
        An owner who lands here looking for "the price of Chocolate Truffle" is
        in the wrong room, and the page has to say so rather than letting them
        reprice a filling and wonder why the shop did not move. One line, with
        the way out on it.
      */}
      <Notice tone="accent" icon="info">
        These are the options the 3D cake builder assembles a cake from. To
        change the name, price or photograph of a cake in the shop, go to{" "}
        <Link href="/admin/cakes" className="font-semibold underline underline-offset-2">
          Cakes
        </Link>
        .
      </Notice>

      <div className="flex flex-col gap-2">
        <SearchForm
          action={`/admin/catalog/${slug}`}
          value={query}
          label={`Search ${group.title.toLowerCase()} by name or description`}
          placeholder={`Search ${group.title.toLowerCase()}…`}
        />
        {query && (
          <p className="text-a-small text-a-muted">
            <span className="font-semibold text-a-ink">{found}</span>{" "}
            {found === 1 ? "option matches" : "options match"} “{query}”.
          </p>
        )}
      </div>

      {/*
        §21: nothing on this page lets somebody add or delete an option, and the
        absence is deliberate rather than unfinished. A new filling needs an
        entry in lib/schema's Zod enum, an allergen row, and — for a topping — a
        mesh and placement maths, none of which a form can supply; `saveOption`
        refuses a value the enums have never heard of for exactly this reason.
        Saying so once here is better than an "Add" button that explains itself
        only after somebody has filled it in.
      */}
      <Notice tone="accent" icon="info">
        The bakery decides what each of these costs, whether it is on today and
        how it is described. Adding a genuinely new option also needs a recipe,
        an allergen entry and — for a topping — a 3D model, so it stays a
        development job rather than a form.
      </Notice>

      {sections.map((s) => (
        <Card key={s.category} flush>
          <CardHead title={s.meta.plural} note={s.meta.blurb}>
            <StatusBadge
              dot={false}
              label={`${s.rows.length} ${s.rows.length === 1 ? "option" : "options"}`}
            />
          </CardHead>
          <CatalogList category={s.category} rows={s.rows} query={query} />
        </Card>
      ))}
    </div>
  );
}
