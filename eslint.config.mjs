import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**",
    ".claude/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // A vendored reference implementation of the cake renderer, with its own
    // package.json and its own node_modules. It is gitignored, nothing in the
    // app imports it, and it is not written to this project's rules — linting
    // somebody else's example code produces findings nobody will ever act on.
    "_3d_cake_reference/**",
  ]),
]);

export default eslintConfig;
