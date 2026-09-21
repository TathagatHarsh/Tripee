import "dotenv/config";
import { createClerkClient } from "@clerk/backend";
import { UserRole } from "@prisma/client";
import { db, hasDatabase } from "../lib/db";

/**
 * Give somebody a role, or see who has one.
 *
 *     npm run role                              List everybody who is not a customer
 *     npm run role -- baker@shop.com KITCHEN
 *     npm run role -- owner@shop.com  ADMIN
 *     npm run role -- ex-baker@shop.com CUSTOMER   Take it away again
 *
 * ## Why this is a script and not a screen
 *
 * Because the one property that matters is that no request can do it. A page
 * that promotes people is a page with an endpoint behind it, and an endpoint
 * that can grant ADMIN is one bug away from anybody granting themselves ADMIN.
 * This needs DATABASE_URL and CLERK_SECRET_KEY, which live in an operator's
 * shell and a deployment secret and nowhere a browser can reach. A bakery
 * promotes a handful of people in its lifetime; the correct amount of machinery
 * for that is a command.
 *
 * ## Why this one needs a secret and the Supabase version did not
 *
 * Under Supabase, `auth.users` was a table in the same Postgres this app
 * already connected to, so turning an email into a user id was one SELECT and
 * no new credential. Clerk's users are not in this database — they are behind
 * Clerk's API — so the lookup needs CLERK_SECRET_KEY.
 *
 * That key is genuinely privileged: it can read, modify and impersonate every
 * account in the instance. It is server-only and never `NEXT_PUBLIC_*` — but,
 * unlike the Supabase arrangement this replaced, it is not confined to tooling:
 * `clerkMiddleware` needs it too, because session verification happens
 * server-side. So it is a deployment secret in the same tier as DATABASE_URL
 * rather than something only an operator's shell ever holds.
 *
 * ## The order of operations
 *
 * The person must sign in once first, at /sign-in. That is what creates their
 * Clerk account and, on their first authenticated request, their UserProfile.
 * Only then can they be named here. A row cannot be created for an email that
 * has never signed in, which is deliberate: this script can never invent an
 * account, only re-rank one a real sign-in already produced.
 */

/* Every role, including VENDOR — it is listed so the error below can name it
   and say where it is set instead, rather than reading as a typo. */
const ROLES = Object.values(UserRole);

function usage(message?: string): never {
  if (message) console.error(`\n${message}`);
  console.error(`
  npm run role                              List everybody who is not a customer
  npm run role -- <email> <ROLE>            Set a role

  ROLE is one of: ${ROLES.join(", ")}

  The person must have signed in at least once at /sign-in first — that is what
  creates the account this looks up.
`);
  process.exit(message ? 1 : 0);
}

function clerk() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    usage("CLERK_SECRET_KEY is not set, so there is no way to look an email up.");
  }
  return createClerkClient({ secretKey });
}

/** Everyone the bakery has given a job to. Customers are not a list worth printing. */
async function list(): Promise<void> {
  const staff = await db.userProfile.findMany({
    where: { role: { not: "CUSTOMER" } },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
  });

  if (staff.length === 0) {
    console.log("\nNobody has a staff role yet. /admin and /kitchen are shut to everybody.");
    console.log("Sign in once at /sign-in, then: npm run role -- you@example.com ADMIN\n");
    return;
  }

  // Addresses live at Clerk, not here — this database holds a role and a name.
  const { data } = await clerk().users.getUserList({ userId: staff.map((s) => s.id), limit: 100 });
  const emailOf = new Map(data.map((u) => [u.id, u.primaryEmailAddress?.emailAddress]));

  console.log("");
  for (const s of staff) {
    console.log(`  ${s.role.padEnd(9)} ${emailOf.get(s.id) ?? "(no longer a Clerk account)"}`);
  }
  console.log("");
}

async function main(): Promise<void> {
  if (!hasDatabase()) usage("DATABASE_URL is not set, so there is no database to write to.");

  const [emailArg, roleArg] = process.argv.slice(2);
  if (!emailArg) return list();
  if (emailArg === "--help" || emailArg === "-h") usage();

  const email = emailArg.trim().toLowerCase();
  const role = roleArg?.trim().toUpperCase() as UserRole | undefined;

  if (!role) usage(`Which role? One of: ${ROLES.join(", ")}`);
  if (!ROLES.includes(role)) usage(`"${roleArg}" is not a role. One of: ${ROLES.join(", ")}`);

  const { data: found } = await clerk().users.getUserList({ emailAddress: [email], limit: 2 });

  if (found.length === 0) {
    console.error(`\nNo account on ${email}.`);
    console.error("They need to sign in once at /sign-in first — that is what creates it.\n");
    process.exit(1);
  }
  if (found.length > 1) {
    // Clerk allows one address on several accounts in some configurations, and
    // guessing which one somebody meant to promote is not this script's job.
    console.error(`\n${email} matches ${found.length} accounts. Promote by Clerk user id instead.\n`);
    process.exit(1);
  }

  const id = found[0].id;
  const before = await db.userProfile.findUnique({ where: { id } });

  /*
   * VENDOR is the one role this command will not set, and that is the opposite
   * of the rule for every other one.
   *
   * A vendor role is only half an answer: it says somebody is a partner bakery
   * without saying which, and lib/auth's `requireVendor` refuses a profile whose
   * `vendorId` is null — correctly, since there is nothing to scope their orders
   * by. Setting it here would produce an account that signs in, is told it
   * cannot open the portal, and gives nobody a way to find out why.
   *
   * /admin/vendors does both halves in one write, against a bakery that already
   * exists, and is safe to be a screen precisely because VENDOR grants nothing
   * anybody could escalate with — see `linkVendorUser` in app/admin/actions.ts,
   * which explains at length why that one form may write a role when nothing
   * else on a request path may.
   */
  if (role === "VENDOR") {
    console.error("\nVENDOR is set from the admin portal, not here.");
    console.error("A vendor role also needs a bakery to belong to, and this command");
    console.error("has no way to name one. Open /admin/vendors, pick the bakery, and");
    console.error(`link ${email} there.\n`);
    process.exit(1);
  }

  await db.userProfile.upsert({
    where: { id },
    create: { id, role },
    /* `vendorId: null` alongside the role, for the case this command exists to
       cover: taking a role away. A profile demoted from VENDOR while still
       pointing at a bakery would keep a dangling association that means nothing
       and reads as though it might. */
    update: { role, vendorId: null },
  });

  console.log(`\n  ${email}\n  ${before?.role ?? "no profile"} → ${role}\n`);

  if (role === "ADMIN") {
    console.log("  That account can now change prices, the catalogue and the delivery map,");
    console.log("  and can open the kitchen board as well.\n");
  }
}

main()
  .catch((e) => {
    console.error("\nThat didn't work:", e instanceof Error ? e.message : e, "\n");
    process.exit(1);
  })
  .finally(() => db.$disconnect());
