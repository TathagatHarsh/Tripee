/**
 * Screenshot the render lab. Every material or lighting pass gets captured so
 * there is a record of what was tried — you will forget otherwise.
 *
 *   npm run shoot -- pass3 "warmed the rim light, dropped ganache clearcoat"
 */
import { chromium } from "@playwright/test";
import { mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.LAB_URL ?? "http://localhost:3001";

async function main() {
  const pass = process.argv[2] ?? "pass1";
  const note = process.argv[3] ?? "";
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.resolve("docs/renders");
  mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=default",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 2 });

  page.on("console", (m) => {
    if (m.type() === "error") console.error("[page]", m.text());
  });

  const solo = process.argv.indexOf("--solo");
  const route = solo > -1 ? `/lab/${process.argv[solo + 1]}` : "/lab";
  // "networkidle" never settles against `next dev`: the HMR websocket keeps the
  // connection busy for as long as the page is open, so every capture died on
  // page.goto's 30s timeout. The 6s settle below is what actually waits for the
  // render anyway — it always was.
  await page.goto(`${BASE}${route}`, { waitUntil: "load" });
  await page.waitForSelector("canvas");

  if (process.argv.includes("--sliced")) {
    await page.getByLabel("Cut a slice").check();
  }
  // Let the environment cubemap render and the framing settle.
  await page.waitForTimeout(6000);

  const file = path.join(dir, `${day}-${pass}.png`);
  await page.screenshot({ path: file, fullPage: true });

  appendFileSync(
    path.join(dir, "LOG.md"),
    `- \`${day}-${pass}.png\` — ${note || "(no note)"}\n`,
  );

  console.log(`Wrote ${file}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
