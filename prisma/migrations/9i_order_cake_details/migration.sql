-- Expand only: old orders and writers remain valid; retain config for rollback.
ALTER TABLE "OrderCake" ADD COLUMN "sizeBand" TEXT, ADD COLUMN "eggType" "EggType", ADD COLUMN "message" TEXT;
UPDATE "OrderCake" SET
  "sizeBand" = COALESCE(config->>'size', CASE WHEN "variantLabel" ~ ' · (Eggless|With egg)$' THEN split_part("variantLabel", ' · ', 1) END),
  "eggType" = CASE WHEN config->>'eggless' = 'true' THEN 'eggless'::"EggType" WHEN config->>'eggless' = 'false' THEN 'egg'::"EggType" WHEN "variantLabel" LIKE '% · Eggless' THEN 'eggless'::"EggType" WHEN "variantLabel" LIKE '% · With egg' THEN 'egg'::"EggType" END,
  "message" = NULLIF(config->>'message', '');
