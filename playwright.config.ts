// .env is still read here because DATABASE_URL decides whether the pages under
// test have any data in them. Playwright does not read .env on its own.
//
// There are no `httpCredentials` any more: the staff areas were behind HTTP
// Basic, which a browser could be handed at the config level, and they are now
// behind a Supabase session, which cannot be. The e2e suite therefore tests
// them the way an outsider meets them — /kitchen and /admin redirect to /login
// — and the signed-in half is exercised by the unit tests over lib/roles plus
// the guards those rules are wired into.
import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * The suite writes. e2e/checkout.spec.ts places a real order — that is the only
 * way to prove a double submit leaves one row — and e2e/happy-path.spec.ts
 * walks a customer through to a confirmation. Both go through /api/orders and
 * land in whatever database `DATABASE_URL` names.
 *
 * The `dotenv/config` line above is what makes that dangerous rather than
 * theoretical: it loads the developer's own .env, and in this project .env holds
 * the *production* Supabase connection string, because that is the one Prisma
 * and `npm run role` need locally. So `npm run e2e` on a laptop, with no flag
 * and no warning, would put synthetic orders on the live board and ring the
 * kitchen about cakes nobody wants.
 *
 * Hence a doorman rather than a note in a README. A connection to a host on this
 * machine is a scratch database and runs freely; anything else stops the run
 * before a browser starts. The override exists because "a Supabase branch" and
 * "a throwaway project" are both legitimate and neither is local — but it has to
 * be typed out on purpose, on the command that is about to write.
 */
function assertScratchDatabase(): void {
  const url = process.env.DATABASE_URL;
  if (!url) return; // No database at all: the suite's unconfigured path. Safe.
  if (process.env.E2E_ALLOW_DESTRUCTIVE_DB === "yes-this-is-a-scratch-database") return;

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // Unparseable, so unprovable. A test suite that writes does not get the
    // benefit of the doubt.
    host = "(unreadable)";
  }

  const local = ["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"];
  if (local.includes(host)) return;

  throw new Error(
    `Refusing to run end-to-end tests against ${host}.\n\n`
    + "These tests place real orders. DATABASE_URL points somewhere that is not\n"
    + "this machine, which on this project usually means production Supabase —\n"
    + "playwright.config.ts loads .env, and .env holds the live connection\n"
    + "string.\n\n"
    + "Point DATABASE_URL at a scratch database first. A container is enough:\n"
    + "  docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres postgres:17\n"
    + "  export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres\n"
    + "  npm run db:deploy && npm run db:seed && npm run e2e\n\n"
    + "If the target really is a scratch project or a Supabase branch, say so:\n"
    + "  E2E_ALLOW_DESTRUCTIVE_DB=yes-this-is-a-scratch-database npm run e2e\n",
  );
}

assertScratchDatabase();

export default defineConfig({
  testDir: "./e2e",
  // A shared CI runner draws this cake through SwiftShader on two cores, which
  // is far slower than any developer machine. The assertions are the same; they
  // just need longer to become true. Raising the ceiling rather than adding
  // retries is deliberate -- retries would hide a real regression later.
  timeout: process.env.CI ? 180_000 : 90_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],

  // Baselines live beside the specs and are committed; a diff is a failure.
  snapshotPathTemplate: "{testDir}/snapshots/{arg}{ext}",

  expect: {
    timeout: process.env.CI ? 30_000 : 15_000,
    toHaveScreenshot: {
      // Anti-aliasing on a software GL stack is never bit-exact.
      maxDiffPixelRatio: 0.02,
      threshold: 0.08,
      animations: "disabled",
    },
  },

  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    // SwiftShader, so WebGL works on a machine with no GPU available to the
    // headless browser. The builder is unusable without it.
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader"],
    },
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
