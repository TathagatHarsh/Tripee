-- 9e_vendor_inventory and 9f_binary_cake_availability created these tables
-- without the RLS line every other table has (see 1_enable_rls for why).
-- Supabase's Advisor flagged them as "RLS Disabled in Public". No policies, on
-- purpose: the anon and authenticated roles get nothing; Prisma connects as the
-- table owner and is unaffected. Idempotent, so it is safe on a database where
-- the same statements were already run by hand.
ALTER TABLE "VendorInventory"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryTransaction"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryReservation"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryAvailabilityChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortalNotification"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationRead"            ENABLE ROW LEVEL SECURITY;
