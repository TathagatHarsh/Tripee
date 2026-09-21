-- Sellable cakes: finishing the table, and linking orders to it.
--
-- "CakeProduct" and the "CakeCategory" enum were created by
-- 20260913214136_init_cake_product, which landed on the database ahead of the
-- model that reads it. The table has never held a row and nothing has ever
-- queried it, so this migration is free to reshape it -- which it does in three
-- small ways rather than dropping and recreating it, because a DROP TABLE in a
-- migration file is a loaded gun pointed at whichever environment runs it next
-- with data in place.
--
-- Everything here is additive or touches empty columns. No existing row in any
-- table is read, rewritten or deleted.
--
-- ## A note on where that migration sits in the sequence
--
-- Prisma applies migrations in lexical folder order, and a timestamp-named
-- folder does not sort where its name suggests among this project's manual
-- `N_description` ones. The real order is:
--
--   0_init, 1_enable_rls, 20260913214136_init_cake_product, 2_drop_catalog_item,
--   3_catalog_options, ... 8_vendor_fulfilment, 9_cake_products
--
-- so "CakeProduct" is created third rather than tenth. That is harmless today:
-- the table is self-contained and touches nothing migrations 2-8 do, and this
-- migration, which ALTERs it, still sorts last. It is written down because it
-- is not obvious from the filenames, and because a migration authored between
-- 2 and 8 in future must not assume "CakeProduct" does not exist yet.
--
-- The folder is deliberately NOT renamed to fit the sequence. Its name is
-- already recorded in "_prisma_migrations" on the deployed database, so
-- renaming it would make Prisma report that migration as missing locally and
-- treat the renamed folder as new -- i.e. attempt CREATE TABLE "CakeProduct"
-- against a database that already has it. An applied migration's name is
-- immutable; the honest fix is this comment.

-- 1. Row-level security, which the first migration did not switch on.
--
-- Every other table in this schema has it (see 1_enable_rls). Supabase
-- generates a PostgREST API over the public schema, so a table without RLS is
-- readable and writable by anyone holding the publishable anon key. No policies
-- are added, deliberately: with none, anon and authenticated get nothing at
-- all, and Prisma connects as the table owner, which bypasses RLS.
ALTER TABLE "CakeProduct" ENABLE ROW LEVEL SECURITY;

-- 2. One size field instead of two.
--
-- "weightLabel" was free text ("1.5 kg") and carried no meaning the code could
-- use: servings, the docket's diameter and the config an order is written with
-- all need the *band*. So the band is stored and the words are looked up from
-- lib/catalog's SIZES -- one input for the admin, one column, and no second
-- label to drift out of step with the number that means something.
--
-- Safe because the table is empty. The DEFAULT is dropped straight afterwards
-- so a future insert has to say which size it is rather than silently being 1kg.
ALTER TABLE "CakeProduct" ADD COLUMN "sizeBand" TEXT NOT NULL DEFAULT '1kg';
ALTER TABLE "CakeProduct" ALTER COLUMN "sizeBand" DROP DEFAULT;
ALTER TABLE "CakeProduct" DROP COLUMN "weightLabel";

-- 3. "compareAtPricePaise" goes.
--
-- A struck-through "was 999" price, for a storefront that has no such element
-- and a brief (section 26) that rules out discounts and coupons in this phase.
-- An unread nullable column on a new table is a field every future form has to
-- decide not to show; it can come back with the feature that needs it.
ALTER TABLE "CakeProduct" DROP COLUMN "compareAtPricePaise";

-- 4. The order's link back to the cake, and its two snapshots.
--
-- All three nullable, and null is the correct and permanent answer for every
-- order already in this table: they were placed before the shop had products,
-- from a preset or from the 3D builder. Nothing is backfilled -- inventing a
-- product id for a historical order would be a guess printed as a fact, which
-- is the position 6_order_event and 7_catalog_photos_and_price_history both
-- took about their own history.
ALTER TABLE "Order" ADD COLUMN "cakeProductId" TEXT;
ALTER TABLE "Order" ADD COLUMN "cakeName"      TEXT;
ALTER TABLE "Order" ADD COLUMN "cakeImageUrl"  TEXT;

CREATE INDEX "Order_cakeProductId_idx" ON "Order"("cakeProductId");

-- ON DELETE SET NULL: deleting a cake must never delete or orphan an order.
-- The name and photograph frozen above are what keep that order readable
-- afterwards.
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_cakeProductId_fkey"
  FOREIGN KEY ("cakeProductId") REFERENCES "CakeProduct"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
