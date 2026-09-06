/**
 * REGRESSION TEST — SEC-027 / BUG-033: the demo must be excluded on every bundler.
 *
 * The defect: `next.config.ts` aliased `@/lib/demo` away using
 * `turbopack.resolveAlias` only. That key is honoured by Turbopack and ignored
 * by webpack, so `next build --webpack` resolved the real module through
 * `tsconfig` paths and shipped the credential and every fabricated customer
 * record to the public bundle — while the build banner printed `EXCLUDED`.
 *
 * WHAT THIS FILE IS FOR, AND WHAT IT IS NOT.
 *
 * It cannot inspect a build; vitest never runs one. The decisive proof is
 * `npm run verify:demo-exclusion`, which builds on both bundlers into clean
 * output and searches the result. These tests are the fast guard that runs in
 * the ordinary suite: they assert the two mechanisms that make that build check
 * pass are still wired up, so deleting either fails in seconds rather than
 * surviving until someone remembers to run a build.
 *
 * Both are behavioural, not textual. The config is imported and evaluated under
 * each build environment, and the tripwire is exercised by importing the module
 * it protects.
 */

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Loads `next.config.ts` fresh under a specific build environment. */
async function loadNextConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  // The config logs a banner on import; keep the test output readable.
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    return (await import("../../next.config")).default;
  } finally {
    log.mockRestore();
  }
}

/** Minimal stand-in for the webpack config object Next hands the hook. */
function fakeWebpackConfig() {
  return { plugins: [] as unknown[], resolve: { alias: { "@": "/somewhere/src" } } };
}

/** Stand-in for the `webpack` module Next passes in the hook's context. */
class FakeReplacementPlugin {
  constructor(
    readonly resourceRegExp: RegExp,
    readonly newResource: string,
  ) {}
}
const fakeWebpackContext = {
  webpack: { NormalModuleReplacementPlugin: FakeReplacementPlugin },
};

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("A — the alias is configured for the bundler actually in use", () => {
  it("aliases @/lib/demo away on a Turbopack production build", async () => {
    const config = await loadNextConfig({
      NODE_ENV: "production",
      NEXT_PUBLIC_ENABLE_DEMO: undefined,
      TURBOPACK: "auto",
    });

    expect(config.turbopack?.resolveAlias?.["@/lib/demo"]).toBe(
      "./src/lib/demo-disabled.ts",
    );
  });

  it("aliases @/lib/demo away on a webpack production build", async () => {
    // THE REGRESSION. Before this fix there was no webpack entry at all, and
    // `next build --webpack` shipped the demo.
    const config = await loadNextConfig({
      NODE_ENV: "production",
      NEXT_PUBLIC_ENABLE_DEMO: undefined,
      TURBOPACK: undefined,
    });

    expect(typeof config.webpack).toBe("function");

    const result = config.webpack!(fakeWebpackConfig(), fakeWebpackContext as never) as {
      plugins: FakeReplacementPlugin[];
      resolve: { alias: Record<string, string> };
    };

    // The load-bearing part. `resolve.alias` alone does NOT work here: Next
    // registers JsConfigPathsPlugin in resolve.plugins to implement tsconfig
    // `paths`, and it resolves `@/lib/demo` to the real directory before the
    // alias is consulted. Only a request replacement, which runs before
    // resolution, actually keeps the demo out. Verified by build, not assumed —
    // dropping this plugin and keeping the alias makes `npm test` pass and
    // `npm run verify:demo-exclusion` fail.
    const replacement = result.plugins.find((p) => p instanceof FakeReplacementPlugin);
    expect(replacement, "NormalModuleReplacementPlugin must be registered").toBeDefined();
    expect(replacement!.resourceRegExp.test("@/lib/demo")).toBe(true);
    expect(replacement!.resourceRegExp.test("@/lib/demonstration")).toBe(false);
    expect(replacement!.newResource.replace(/\\/g, "/")).toMatch(
      /src\/lib\/demo-disabled\.ts$/,
    );

    // The alias is kept as a second line of defence for requests that never
    // reach the paths plugin.
    const aliased = result.resolve.alias["@/lib/demo$"];
    expect(aliased).toBeDefined();
    expect(aliased.replace(/\\/g, "/")).toMatch(/src\/lib\/demo-disabled\.ts$/);
    // Pre-existing aliases must survive, or the build breaks in other ways.
    expect(result.resolve.alias["@"]).toBe("/somewhere/src");
  });

  it("adds no alias at all when the demo is deliberately enabled", async () => {
    const config = await loadNextConfig({
      NODE_ENV: "production",
      NEXT_PUBLIC_ENABLE_DEMO: "true",
      TURBOPACK: "auto",
    });

    expect(config.turbopack?.resolveAlias).toBeUndefined();
    expect(config.webpack).toBeUndefined();
  });

  it("adds no alias in development, so `next dev` keeps the demo", async () => {
    const config = await loadNextConfig({
      NODE_ENV: "development",
      NEXT_PUBLIC_ENABLE_DEMO: undefined,
      TURBOPACK: "auto",
    });

    expect(config.turbopack?.resolveAlias).toBeUndefined();
    expect(config.webpack).toBeUndefined();
  });
});

describe("B — the tripwire fails the build if the alias ever misses", () => {
  it("refuses to load in a demo-disabled production build", async () => {
    // Bundler-agnostic backstop: whatever resolves the module, on whatever
    // bundler, being present in a demo-disabled production build is fatal.
    // `next build` prerenders on the server, so this throws during static
    // generation and fails the build rather than reaching a user.
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEMO", "");

    await expect(import("@/lib/demo/config")).rejects.toThrow(/SEC-027/);
  });

  it("loads normally in a demo-ENABLED production build", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEMO", "true");

    const mod = await import("@/lib/demo/config");
    expect(mod.DEMO_EMAIL).toBe("demo.employee@risenext.com");
  });

  it("loads normally in development", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEMO", "");

    const mod = await import("@/lib/demo/config");
    expect(mod.DEMO_HOME).toBe("/my-work");
  });

  it("guards the whole directory, because every demo file imports config", () => {
    // The alias matches `@/lib/demo` exactly, so a deep import of
    // `@/lib/demo/api` would walk straight past it. That hole is closed by
    // placement rather than by another alias: nothing under src/lib/demo/ can
    // be bundled without pulling config.ts — and its tripwire — along.
    const files = ["session", "store", "data", "api", "nav", "index"];
    for (const name of files) {
      const source = readFileSync(`src/lib/demo/${name}.ts`, "utf8");
      const reachesConfig =
        source.includes('from "./config"') ||
        // store.ts reaches it through data.ts and session.ts.
        source.includes('from "./data"') ||
        source.includes('from "./session"');
      expect(reachesConfig, `${name}.ts must transitively import ./config`).toBe(true);
    }
  });
});

describe("C — the build banner reports what happened, not what was asked for", () => {
  it("names the bundler and the mechanism actually applied", async () => {
    // BUG-033: the old banner printed EXCLUDED from the flag alone, so a
    // webpack build that shipped the entire demo still announced it had not.
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((m) => void lines.push(String(m)));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEMO", "");
    vi.stubEnv("TURBOPACK", "");
    try {
      await import("../../next.config");
    } finally {
      log.mockRestore();
    }

    const banner = lines.find((l) => l.includes("[next.config]")) ?? "";
    expect(banner).toContain("bundler=webpack");
    expect(banner).toContain("EXCLUDED via webpack alias");
  });
});
