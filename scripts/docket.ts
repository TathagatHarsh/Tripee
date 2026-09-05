/**
 * Print an order docket for a cake config, from the terminal.
 *
 *   npm run docket -- fixtures/two-tier.json
 *   npm run docket -- --preset classic-truffle
 *   echo '{"version":1,...}' | npm run docket
 *
 * This exists so pricing and rules can be exercised without a browser.
 */
import { readFileSync } from "node:fs";
import { DEFAULT_SNAPSHOT } from "../lib/catalogDefaults";
import { renderSpecSheet } from "../lib/docket";
import { PRESETS, presetBySlug } from "../lib/presets";
import { validateCake } from "../lib/rules";
import { DEFAULT_CAKE, migrateConfig } from "../lib/schema";

function readStdin(): string | null {
  try {
    return readFileSync(0, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function main() {
  const argv = process.argv.slice(2);
  let raw: unknown;

  if (argv[0] === "--preset") {
    const p = presetBySlug(argv[1] ?? "");
    if (!p) {
      console.error(`Unknown preset. Available: ${PRESETS.map(x => x.slug).join(", ")}`);
      process.exit(1);
    }
    raw = p.config;
  } else if (argv[0] === "--default") {
    raw = DEFAULT_CAKE;
  } else if (argv[0]) {
    raw = JSON.parse(readFileSync(argv[0], "utf8"));
  } else {
    const stdin = readStdin();
    if (!stdin) {
      console.error("Usage: npm run docket -- <config.json | --preset <slug> | --default>");
      process.exit(1);
    }
    raw = JSON.parse(stdin);
  }

  const config = migrateConfig(raw);
  if (!config) {
    console.error("That is not a valid cake configuration.");
    process.exit(2);
  }

  const violations = validateCake(config);
  console.log(renderSpecSheet(config, DEFAULT_SNAPSHOT));

  if (violations.length) {
    console.log("");
    console.log("NOTES");
    for (const v of violations) {
      console.log(`  [${v.severity.toUpperCase()}] ${v.message}`);
      if (v.fix) console.log(`          → ${v.fix.label}`);
    }
  }

  if (violations.some(v => v.severity === "block")) process.exit(3);
}

main();
