import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

const __dirname = dirname(fileURLToPath(import.meta.url));

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  prettierConfig,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      ".tmp-storage/**",
      ".zwork/**",
      "next-env.d.ts",
    ],
  },
  {
    settings: {
      next: {
        rootDir: __dirname,
      },
    },
  },
];

export default eslintConfig;
