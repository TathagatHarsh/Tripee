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
