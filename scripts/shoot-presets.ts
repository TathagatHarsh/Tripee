/**
 * Photograph every preset.
 *
 * The catalogue cards used to be twenty live WebGL canvases. They are twenty
 * WebP files now, and this is what makes them — one pass of `app/shoot/[slug]`
 * per preset, at a quality no card could afford while it was being drawn in a
 * browser tab: shadows on, 128 radial segments, 2x device pixels, and as long as
 * it takes per frame.
 *
 * The cakes are the *same* cakes. This reads `PRESETS` and photographs the route
 * that reads `PRESETS`, so a photograph cannot drift away from the config that
 * "Make it mine" hands the builder. Add a preset, rerun this, get a card.
 *
 *   npm run dev            # or any server; SHOOT_URL points elsewhere
 *   npm run shoot:presets
 *   npm run shoot:presets -- --only lotus-biscoff
 *
 * SwiftShader draws this on the CPU, same as the e2e baselines, so it works on a
 * machine with no GPU available to a headless browser — and takes its time.
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PRESETS } from "../lib/presets";

const BASE = process.env.SHOOT_URL ?? "http://localhost:3000";
const OUT = path.resolve("public/presets");

/**
 * "Loaded" is not a thing this scene announces, and a fixed wait is a guess that
 * is either wrong or slow — the e2e baselines wait six seconds per shot because
 * six was enough on the machine that wrote them.
 *
 * So: settled means two consecutive frames are byte-identical. Under
 * `reducedMotion: "reduce"` nothing in the scene moves on its own, which makes
 * "stopped changing" exactly "the environment cubemap, the shadow pass and the
 * camera have all arrived". If it never settles something *is* moving, and that
 * is a bug worth failing on rather than photographing.
 */
const SETTLE_MIN_MS = 1500;
const SETTLE_MAX_MS = 60_000;
const SETTLE_GAP_MS = 400;

/** Per-channel difference from the empty backdrop that counts as cake. */
const INK = 8;

/**
 * The band the cake's silhouette is meant to land in, as a fraction of the frame
 * height. The brief is "about 70%"; this is that with room for a two-tier cake
 * being taller than a single one, which is what a two-tier cake is supposed to
 * look like. Outside it, the shot's `fill` wants recalibrating — see ShootStage.
 */
const TARGET = { min: 0.6, max: 0.82 };

/** 82 lands a 1440x1080 cake-on-a-sweep around 100kB. Above ~88 the file doubles
    to encode a gradient nobody can see the banding in. */
const WEBP = { quality: 82, effort: 6 } as const;

interface Frame {
  png: Buffer;
  settled: boolean;
}

async function shoot(stage: Locator, page: Page): Promise<Frame> {
  const deadline = Date.now() + SETTLE_MAX_MS;
  await page.waitForTimeout(SETTLE_MIN_MS);

  let prev = await stage.screenshot({ type: "png", animations: "disabled" });
  while (Date.now() < deadline) {
    await page.waitForTimeout(SETTLE_GAP_MS);
    const next = await stage.screenshot({ type: "png", animations: "disabled" });
    if (next.equals(prev)) return { png: next, settled: true };
    prev = next;
  }
  return { png: prev, settled: false };
}

/**
 * Where the cake actually landed in the frame.
 *
 * The backdrop is a radial gradient, so "not the corner colour" flags most of
 * the frame — this diffs against a reference shot of the *same* stage with the
 * canvas hidden instead, which isolates cake, board and contact shadow exactly.
 * Everything the shot's `fill` and `offsetY` were calibrated against is measured
 * here rather than reasoned about, which is the only way those two numbers are
 * ever right.
 */
async function silhouette(png: Buffer, backdrop: Buffer) {
  const raw = (b: Buffer) => sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [shot, empty] = await Promise.all([raw(png), raw(backdrop)]);

  const { width, height, channels } = shot.info;
  if (empty.info.width !== width || empty.info.height !== height) {
    throw new Error("backdrop reference is a different size to the shot");
  }

  let top = height, bottom = -1, left = width, right = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (
        Math.abs(shot.data[i] - empty.data[i]) <= INK &&
        Math.abs(shot.data[i + 1] - empty.data[i + 1]) <= INK &&
        Math.abs(shot.data[i + 2] - empty.data[i + 2]) <= INK
      ) continue;

      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }

  if (bottom < 0) return null;

  return {
    heightFrac: (bottom - top + 1) / height,
    widthFrac: (right - left + 1) / width,
    /* Positive means the cake sits below the middle of the frame. Feeds
       `Shot.offsetY`, which is the knob that moves it. */
    drop: (top + bottom) / 2 / height - 0.5,
  };
}

async function main() {
  /* Comma-separated, because the usual reason to reshoot is that two or three
     configs changed and the other nineteen have not — and reshooting an unchanged
     cake is not free: SwiftShader's anti-aliasing is not bit-exact between runs,
     so every file it touches becomes a diff whether the cake moved or not. */
  const only = process.argv.includes("--only")
    ? process.argv[process.argv.indexOf("--only") + 1].split(",").map(s => s.trim())
    : null;

  const presets = only ? PRESETS.filter(p => only.includes(p.slug)) : PRESETS;
  if (only) {
    const missing = only.filter(slug => !PRESETS.some(p => p.slug === slug));
    if (missing.length) throw new Error(`no preset with slug: ${missing.join(", ")}`);
  }
  if (!presets.length) throw new Error("no presets to shoot");

  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=default",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  });

  /* `reducedMotion` is load-bearing, not politeness: it snaps `Framing`'s camera
     instead of easing it and stops `OrbitControls` from turning the cake, which
     is what lets "two identical frames" mean "settled". */
  const context = await browser.newContext({
    viewport: { width: 860, height: 700 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  page.on("console", m => {
    if (m.type() === "error") console.error("  [page]", m.text());
  });

  /* One reference for the whole run: the backdrop is the same CSS gradient at the
     same size on every one of these pages. */
  let backdrop: Buffer | null = null;
  const problems: string[] = [];

  for (const preset of presets) {
    const url = `${BASE}/shoot/${preset.slug}`;
    await page.goto(url, { waitUntil: "load" });

    const stage = page.locator("[data-shoot-stage]");
    await stage.waitFor();
    await stage.locator("canvas").waitFor();

    if (!await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      throw new Error("reduced motion is not in effect — the cake will be mid-turn");
    }

    if (!backdrop) {
      /* Hide the canvas rather than adding an "empty" route: the backdrop is CSS,
         the canvas is transparent, and `visibility` does not touch the GL
         context — so this is the same pixels the cake is about to sit on. */
      await page.addStyleTag({ content: "[data-shoot-stage] canvas { visibility: hidden }" });
      backdrop = await stage.screenshot({ type: "png" });
      await page.reload({ waitUntil: "load" });
      await stage.locator("canvas").waitFor();
    }

    const { png, settled } = await shoot(stage, page);
    const webp = await sharp(png).webp(WEBP).toBuffer();
    const file = path.join(OUT, `${preset.slug}.webp`);
    writeFileSync(file, webp);

    const box = await silhouette(png, backdrop);
    const kb = Math.round(statSync(file).size / 1024);
    const geometry = box
      ? `h ${(box.heightFrac * 100).toFixed(0)}%  w ${(box.widthFrac * 100).toFixed(0)}%  drop ${(box.drop * 100).toFixed(1)}%`
      : "EMPTY FRAME";

    console.log(`${preset.slug.padEnd(24)} ${String(kb).padStart(4)}kB  ${geometry}`);

    if (!settled) problems.push(`${preset.slug}: never settled — something in the scene is still moving`);
    if (!box) problems.push(`${preset.slug}: nothing but backdrop — the cake did not render`);
    else if (box.heightFrac < TARGET.min || box.heightFrac > TARGET.max) {
      problems.push(
        `${preset.slug}: ${(box.heightFrac * 100).toFixed(0)}% of frame height, ` +
        `outside ${TARGET.min * 100}-${TARGET.max * 100}% — recalibrate Shot.fill`,
      );
    }
  }

  await browser.close();

  console.log(`\nWrote ${presets.length} file(s) to ${path.relative(process.cwd(), OUT)}`);

  /* Only on a full run: after `--only` the other files are supposed to be there.
     A preset deleted from lib/presets leaves its photograph behind, and nothing
     else in the build notices — the card is gone, so the 404 never happens. */
  if (!only) {
    const live = new Set(PRESETS.map(p => `${p.slug}.webp`));
    const orphans = readdirSync(OUT).filter(f => f.endsWith(".webp") && !live.has(f));
    orphans.forEach(f => problems.push(`${f}: no preset owns this any more — delete it`));
  }

  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    problems.forEach(p => console.error(`  - ${p}`));
    process.exit(1);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
