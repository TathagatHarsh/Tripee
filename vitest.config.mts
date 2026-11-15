import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    // DB integration files share one scratch DB and a global advisory lock, so they run one file at a time.
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/**/*.test.ts"], exclude: ["tests/**/*.integration.test.ts", "**/node_modules/**"] } },
      { extends: true, test: { name: "integration", include: ["tests/**/*.integration.test.ts"], fileParallelism: false } },
    ],
  },
});
