import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Frontend test configuration.
 *
 * Deliberately minimal — vitest + jsdom and nothing else. React 19 exports
 * `act` directly, so components are mounted with `react-dom/client` and no
 * component-testing library is needed. See docs/DECISIONS.md D-012.
 *
 * `tsconfig.json` sets `jsx: "preserve"` for Next's compiler, which esbuild
 * would pass through untransformed, so the automatic runtime is selected here.
 */
export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    restoreMocks: true,
  },
});
