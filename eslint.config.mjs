import { defineConfig } from "eslint/config";
import next from "eslint-config-next";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  next,
  nextCoreWebVitals,
  nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**"],
  },
]);
