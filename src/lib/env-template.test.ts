import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE FRONTEND ENVIRONMENT TEMPLATE MATCHES THE CODE — Task 15.15.
 *
 * The backend has `env.ts` and a zod schema that refuses to boot on a bad
 * configuration. **The frontend has neither.** `process.env.NEXT_PUBLIC_X` is
 * substituted at build time and evaluates to `undefined` when unset, silently.
 * There is no boot-time validation to lean on and there cannot be one, so the
 * template is the only place a deployer learns what to set — and its accuracy
 * is worth a test for exactly that reason.
 *
 * ── AND ONE THING THE BACKEND DOES NOT NEED ─────────────────────────────────
 *
 * Group B. Every value here is **compiled into JavaScript that anyone can
 * read**. The most expensive mistake available in this file is a variable
 * called something plausible that carries a secret, and it would look
 * completely normal in a Vercel dashboard. Case 4 refuses the names that
 * indicate one.
 */

const FRONTEND = path.resolve(__dirname, "..", "..");
const TEMPLATE = readFileSync(path.join(FRONTEND, ".env.example"), "utf8");

/** Every `process.env.NEXT_PUBLIC_*` read anywhere the bundler can see. */
function readsInSource(): string[] {
  const found = new Set<string>();

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry === "coverage") continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js)$/.test(entry)) continue;
      // The template itself and this test would otherwise self-satisfy.
      if (entry === "env-template.test.ts") continue;
      for (const match of readFileSync(full, "utf8").matchAll(
        /process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g,
      )) {
        found.add(match[1]!);
      }
    }
  };

  walk(path.join(FRONTEND, "src"));
  walk(path.join(FRONTEND, "scripts"));
  for (const file of ["next.config.ts"]) {
    for (const match of readFileSync(path.join(FRONTEND, file), "utf8").matchAll(
      /process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g,
    )) {
      found.add(match[1]!);
    }
  }
  return [...found].sort();
}

/** Keys the template documents, live or commented out. */
function templateKeys(): string[] {
  const keys = new Set<string>();
  for (const match of TEMPLATE.matchAll(/^#?\s?(NEXT_PUBLIC_[A-Z0-9_]+)=/gm)) {
    keys.add(match[1]!);
  }
  return [...keys].sort();
}

/* ══ A — the list is right in both directions ═════════════════════════════ */

describe("A · .env.example matches what the frontend actually reads", () => {
  it("1. every variable the code reads is documented", async () => {
    const missing = readsInSource().filter((key) => !templateKeys().includes(key));
    expect(missing, `undocumented: ${missing.join(", ")}`).toEqual([]);
  });

  it("2. THE OTHER DIRECTION: nothing is documented that the code does not read", async () => {
    // This is the half that caught real drift. The template carried
    // `NEXT_PUBLIC_APP_NAME` and `NEXT_PUBLIC_APP_ENV`, which **no file reads**
    // — so a deployer would dutifully set two variables that do nothing, and
    // would reasonably conclude the rest of the file was equally load-bearing.
    const documented = templateKeys();
    const read = readsInSource();
    const stray = documented.filter((key) => !read.includes(key));
    expect(stray, `documented but never read: ${stray.join(", ")}`).toEqual([]);
  });

  it("3. the API base URL is present and has no trailing slash", async () => {
    // `lib/api.ts` appends `/api` itself. A trailing slash produces `//api`,
    // which some proxies normalise and some 404 — a difference between local
    // and production that is very hard to see.
    const match = /^NEXT_PUBLIC_API_URL="([^"]*)"/m.exec(TEMPLATE);
    expect(match, "NEXT_PUBLIC_API_URL must be documented with a value").not.toBeNull();
    expect(match![1]).not.toMatch(/\/$/);
    expect(match![1]).not.toMatch(/\/api$/);
  });
});

/* ══ B — nothing secret can live here ═════════════════════════════════════ */

describe("B · everything here is public, and the file must stay that way", () => {
  it("4. no variable is named like a secret", async () => {
    // The expensive mistake is a plausible-looking name carrying a credential.
    // It would look entirely normal in a Vercel dashboard and would be readable
    // by anyone who opened the page source.
    const forbidden = /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PASSWORD|TOKEN|PRIVATE|PEPPER|CREDENTIAL)/;
    for (const key of [...templateKeys(), ...readsInSource()]) {
      expect(key, `${key} is a public build-time variable and must not be secret-shaped`).not.toMatch(
        forbidden,
      );
    }
  });

  it("5. the template states plainly that these values are public", async () => {
    // A deployer who does not know this will eventually put something here.
    expect(TEMPLATE).toMatch(/EVERY VARIABLE HERE IS PUBLIC/);
  });

  it("6. no backend-only variable has leaked into the frontend template", async () => {
    for (const key of [
      "DATABASE_URL",
      "JWT_ACCESS_SECRET",
      "JWT_REFRESH_SECRET",
      "AADHAAR_PEPPER",
      "EMAIL_API_KEY",
      "STORAGE_SECRET_ACCESS_KEY",
    ]) {
      expect(TEMPLATE, `${key} is a backend secret and must not appear here`).not.toMatch(
        new RegExp(`^\\s*#?\\s?${key}=`, "m"),
      );
    }
  });
});
