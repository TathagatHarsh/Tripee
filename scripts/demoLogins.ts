import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { UserRole } from "@prisma/client";
import { db, hasDatabase } from "../lib/db";

/**
 * Make (or reset) two demo logins for showing the shop to a client:
 *
 *     npm run demo:logins
 *
 * An ADMIN, and a VENDOR linked to a "Demo Bakery" vendor created here if
 * missing. Re-running issues fresh passwords. Unlike scripts/role.ts this
 * invents accounts, which is the point — they are throwaway, and named so.
 */

const ADMIN_EMAIL = "demo-admin+clerk_test@example.com";
const VENDOR_EMAIL = "demo-vendor+clerk_test@example.com";
const DEMO_BAKERY = "Demo Bakery";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

/** Clerk user for this email with a new password; created if absent. */
async function account(email: string, firstName: string) {
  const password = `Demo-${randomBytes(6).toString("base64url")}`;
  const { data } = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
  const user = data[0]
    ? await clerk.users.updateUser(data[0].id, { password, skipPasswordChecks: true })
    : await clerk.users.createUser({ emailAddress: [email], password, firstName, skipPasswordChecks: true });
  return { id: user.id, email, password };
}

async function main() {
  if (!hasDatabase()) throw new Error("DATABASE_URL is not set.");
  if (!process.env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY is not set.");

  const vendor =
    (await db.vendor.findFirst({ where: { name: DEMO_BAKERY } })) ??
    (await db.vendor.create({ data: { name: DEMO_BAKERY, email: VENDOR_EMAIL } }));

  const admin = await account(ADMIN_EMAIL, "Demo Admin");
  const vend = await account(VENDOR_EMAIL, "Demo Vendor");

  const set = (id: string, role: UserRole, vendorId: string | null) =>
    db.userProfile.upsert({ where: { id }, create: { id, role, vendorId }, update: { role, vendorId } });
  await set(admin.id, "ADMIN", null);
  await set(vend.id, "VENDOR", vendor.id);

  console.log(`\n  ADMIN   ${admin.email}   ${admin.password}   → /admin`);
  console.log(`  VENDOR  ${vend.email}  ${vend.password}   → /vendor  (${DEMO_BAKERY})\n`);
}

main()
  .catch((e) => {
    console.error("\nThat didn't work:", e instanceof Error ? e.message : e, (e as { errors?: unknown }).errors ?? "", "\n");
    process.exit(1);
  })
  .finally(() => db.$disconnect());
