-- These tables were created after 1_enable_rls without the RLS line every
-- other table has (see 1_enable_rls for why), so the anon key -- which is
-- public -- could read WhatsApp commands and payment/refund records, and write
-- to them. "_prisma_migrations" is Prisma's own bookkeeping table; with RLS off
-- anyone could insert rows into it and confuse `prisma migrate deploy`.
--
-- No policies, on purpose: the anon and authenticated roles get nothing;
-- Prisma connects as the table owner and is unaffected. Idempotent, so it is
-- safe on a database where the same statements were already run by hand.
ALTER TABLE "WhatsAppCommand"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentRecovery"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefundOperation"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
