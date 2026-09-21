-- A photograph on every catalogue option, and a record of every price change.
--
-- Both exist for the same reason the admin portal exists at all: a bakery has to
-- be able to change what it sells without a deploy. Until now it could change
-- the name, the blurb, the price and whether an option was on today -- but the
-- picker showed a colour swatch and a line of text, and a cake business chooses
-- pistachio by looking at pistachio. And repricing overwrote the only record
-- that the old price had ever existed.
--
-- Additive and reversible in effect. No existing column changes type, gains a
-- NOT NULL or loses a default; every existing row is untouched. All 96 option
-- rows start with no photograph and no history, which is the honest state --
-- see the note on the table below about why nothing is backfilled.
--
-- Specifically NOT touched, and the reason this migration is safe to run on a
-- live shop: "OrderItem". Those rows froze their amounts when each order was
-- placed and nothing here joins to them. A price changed after this migration
-- lands changes what the next customer is quoted and nothing about any order
-- that already exists.

-- AlterTable
-- Both nullable with no default. NULL means "nobody has uploaded one", which is
-- a real and permanent state for most of these rows -- a coverage or a placement
-- has nothing to photograph. An empty string would mean the same thing in a
-- second way, which is one `if` away from a bug, so the application writes NULL
-- and never "".
ALTER TABLE "CatalogOption" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "CatalogOption" ADD COLUMN "imageAlt" TEXT;

-- CreateTable
-- "fromPaise" and "toPaise" are both stored rather than one being derived from
-- the row before it: a gap in this table -- a row deleted, a price moved at a
-- psql prompt -- must not silently rewrite the delta of the change after it.
--
-- "actorId" is nullable because a change may be recorded for an account since
-- revoked, exactly as migration 6 reasons about "OrderEvent"."actorId".
--
-- Nothing is backfilled. Every option shipped with a price and no history, and
-- inventing the increases that were never recorded would make this a story
-- rather than a record.
CREATE TABLE "CatalogPriceChange" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "fromPaise" INTEGER NOT NULL,
    "toPaise" INTEGER NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogPriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Every read is "this option's changes, newest first" -- the price history panel
-- on the option's own editor. Nothing queries these rows any other way.
CREATE INDEX "CatalogPriceChange_optionId_createdAt_idx"
    ON "CatalogPriceChange"("optionId", "createdAt");

-- AddForeignKey
-- CASCADE, for the reason migration 6 gives about an order's events: the history
-- of a price is part of the option rather than a fact beside it. If the option
-- row is ever removed there is nothing left for its history to be the history
-- of. (Options are withdrawn rather than deleted -- see "isAvailable" -- so this
-- is a constraint that should never fire.)
ALTER TABLE "CatalogPriceChange" ADD CONSTRAINT "CatalogPriceChange_optionId_fkey"
    FOREIGN KEY ("optionId") REFERENCES "CatalogOption"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL, for migration 6's reason: revoking somebody's account must not erase
-- the fact that they moved a price. The row survives having lost the name.
ALTER TABLE "CatalogPriceChange" ADD CONSTRAINT "CatalogPriceChange_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "UserProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security, for the reason migration 1 gives: Supabase publishes a
-- PostgREST API over the public schema and the anon key is publishable. These
-- rows name a staff member against a commercial decision, so they get the same
-- policy-less RLS every other table here has -- anon and authenticated get
-- nothing at all through PostgREST, while Prisma connects as the table owner
-- and is unaffected.
ALTER TABLE "CatalogPriceChange" ENABLE ROW LEVEL SECURITY;
