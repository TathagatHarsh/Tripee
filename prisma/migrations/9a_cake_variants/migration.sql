-- Cake variants and a photo gallery.
--
-- ## Additive, and that is checked rather than claimed
--
-- Two CREATE TABLEs, one CREATE TYPE, and one INSERT ... SELECT that reads
-- "CakeProduct" and writes only into the table created three statements above
-- it. There is no ALTER, no DROP, no UPDATE and no DELETE anywhere below. Every
-- existing row in every existing table is left exactly as it is -- which is
-- what makes this safe to apply to a database holding live orders, and what
-- section 33 of the brief asks for.
--
-- In particular: "Order" is not touched. An order froze its price lines, its
-- cake's name and its cake's photograph when it was placed, and nothing here
-- can reach any of them.
--
-- ## Why the folder is named "9a"
--
-- Prisma applies migrations in lexical folder order, not numeric -- see the
-- note at the top of 9_cake_products, which works through the same trap. A
-- folder called "10_cake_variants" sorts between "0_init" and "1_enable_rls",
-- so `prisma migrate reset` would try to create these tables before
-- "CakeProduct" exists and fail on the foreign key. "9a" sorts immediately
-- after "9_cake_products" ('_' is 0x5F, 'a' is 0x61) and therefore last.

-- 1. Egg or eggless, as a type rather than a boolean on the product.
--
-- Lowercase labels, matching "CakeCategory" and "OrderStatus": an unquoted
-- identifier is folded to lowercase by Postgres anyway, and a label that needs
-- quoting needs it in every hand-written query forever.
CREATE TYPE "EggType" AS ENUM ('egg', 'eggless');

-- 2. What a customer actually buys.
CREATE TABLE "CakeVariant" (
    "id"          TEXT NOT NULL,
    "cakeId"      TEXT NOT NULL,
    "sizeBand"    TEXT NOT NULL,
    "eggType"     "EggType" NOT NULL,
    "pricePaise"  INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CakeVariant_pkey" PRIMARY KEY ("id")
);

-- One price per (cake, size, sponge). Without this a cake could carry two rows
-- for 1.5 kg eggless and "what does this cost" would depend on row order.
CREATE UNIQUE INDEX "CakeVariant_cakeId_sizeBand_eggType_key"
    ON "CakeVariant"("cakeId", "sizeBand", "eggType");

-- The only read: "this cake's variants, cheapest first".
CREATE INDEX "CakeVariant_cakeId_pricePaise_idx"
    ON "CakeVariant"("cakeId", "pricePaise");

ALTER TABLE "CakeVariant"
    ADD CONSTRAINT "CakeVariant_cakeId_fkey"
    FOREIGN KEY ("cakeId") REFERENCES "CakeProduct"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. The extra photographs. The primary one stays on "CakeProduct".
CREATE TABLE "CakeImage" (
    "id"        TEXT NOT NULL,
    "cakeId"    TEXT NOT NULL,
    "url"       TEXT NOT NULL,
    "alt"       TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CakeImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CakeImage_cakeId_sortOrder_idx" ON "CakeImage"("cakeId", "sortOrder");

ALTER TABLE "CakeImage"
    ADD CONSTRAINT "CakeImage_cakeId_fkey"
    FOREIGN KEY ("cakeId") REFERENCES "CakeProduct"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Row-level security, for the reason 1_enable_rls gives at length.
--
-- Supabase generates a PostgREST API over the public schema, so a table without
-- RLS is readable and writable by anyone holding the publishable anon key. No
-- policies are added: with none, the anon and authenticated roles get nothing,
-- and Prisma connects as the table owner, which bypasses RLS unless FORCE is
-- set. Cake prices are public information; cake *writes* are not.
ALTER TABLE "CakeVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CakeImage"   ENABLE ROW LEVEL SECURITY;

-- 5. Every cake that already exists gets the variant it already was.
--
-- This is the whole of the backward compatibility story and it is one
-- statement. A cake in the table today has a size, a sponge type and a price on
-- its own row; those three columns are exactly one variant. Copying them across
-- means every cake in the shop stays sellable at precisely the price it was
-- sellable at a minute ago, with no cake left unbuyable and nothing for an
-- owner to re-enter by hand.
--
-- `gen_random_uuid()` rather than a cuid, because this runs in SQL and the
-- column only has to be unique -- Prisma's `@default(cuid())` applies to rows
-- *it* creates, and a mixed-format id column is not a problem anything reads.
-- pgcrypto's function is built in from Postgres 13.
--
-- ON CONFLICT DO NOTHING so re-running against a database where somebody has
-- already added variants by hand is a no-op rather than a unique violation.
INSERT INTO "CakeVariant" ("id", "cakeId", "sizeBand", "eggType", "pricePaise", "isAvailable", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    p."id",
    p."sizeBand",
    CASE WHEN p."isEggless" THEN 'eggless'::"EggType" ELSE 'egg'::"EggType" END,
    p."pricePaise",
    -- The variant is on sale iff the cake is. A withdrawn cake's only variant
    -- staying "available" would be harmless (the cake is filtered out first)
    -- and would read as a lie in the admin's grid the day it is put back.
    p."isAvailable",
    now(),
    now()
FROM "CakeProduct" p
ON CONFLICT ("cakeId", "sizeBand", "eggType") DO NOTHING;
