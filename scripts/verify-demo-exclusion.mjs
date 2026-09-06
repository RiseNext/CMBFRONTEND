#!/usr/bin/env node
/**
 * SEC-027 / BUG-033 — build-output regression check.
 *
 * SEC-001 was closed on a build-output search performed once, by hand. Nothing
 * re-ran it, so when `turbopack.resolveAlias` turned out to be honoured only by
 * Turbopack, `next build --webpack` shipped the demo credential and every
 * fabricated customer record to the public bundle and no test noticed. This is
 * the check that should have existed.
 *
 * It builds the application on **every bundler Next supports**, with the demo
 * disabled, and fails if any demo-exclusive string reaches the client output.
 *
 *   npm run verify:demo-exclusion
 *
 * Three builds, each into a clean output directory:
 *
 *   1. turbopack, demo disabled  → the deploy default. Must be clean.
 *   2. webpack,   demo disabled  → `next build --webpack`. Must be clean.
 *   3. turbopack, demo ENABLED   → must contain the demo.
 *
 * The third matters as much as the other two. Without it, a build that silently
 * stopped producing client JavaScript at all would pass 1 and 2 and this script
 * would report success while proving nothing.
 *
 * Search terms are not hand-picked. They are derived from the source at run
 * time: every string literal that occurs in `src/lib/demo/` and nowhere else in
 * the application. Hand-picked terms only ever prove the terms you thought of.
 *
 * Exits non-zero on any failure, so CI can gate on it.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const NEXT_DIR = path.join(ROOT, ".next");
const STATIC_DIR = path.join(NEXT_DIR, "static");
const MIN_LITERAL = 8;

/**
 * Always searched, regardless of what the literal extraction finds. These are
 * the strings whose presence is the finding, so they are named explicitly and
 * do not depend on the extractor's regex being right.
 */
const CRITICAL = [
  "Demo@12345",
  "demo.employee@risenext.com",
  "risenext.demo.session",
  "risenext.demo.data",
];

/**
 * Keeps the systematic sweep precise enough to be worth running.
 *
 * The extractor is a regex over source text, not a JS tokenizer, so it produces
 * two kinds of junk that would fail every build and train people to ignore this
 * script:
 *
 *   - code fragments caught between two unrelated quotes, e.g. `")[0].split("`
 *     out of `path.split("?")[0].split("/")`;
 *   - ordinary lowercase words that happen to be unique to the demo in *our*
 *     source but are everywhere in the framework's, e.g. the error code
 *     `"forbidden"`, which is also a Next App Router boundary prop.
 *
 * So the sweep looks for **data-shaped** literals: no code punctuation, and at
 * least one capital, digit, space or `@` — which is what fabricated names,
 * emails, PANs, IFSC codes, UUIDs and phone numbers all have and what bare
 * identifiers and keywords do not. Anything this filter would drop that still
 * matters is named in CRITICAL above and searched unconditionally.
 */
const CODE_PUNCTUATION = /[()[\]{};<>\\]/;
const LOOKS_LIKE_DATA = /[A-Z0-9 @]/;

function isDataShaped(literal) {
  return !CODE_PUNCTUATION.test(literal) && LOOKS_LIKE_DATA.test(literal);
}

/* ------------------------------------------------------------------ helpers */

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Literals exclusive to `src/lib/demo/` — the systematic half of the search. */
function demoExclusiveLiterals() {
  const src = walk(path.join(ROOT, "src"));
  const isDemo = (f) => f.replace(/\\/g, "/").includes("/src/lib/demo/");

  const found = new Set();
  for (const file of src.filter(isDemo)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/"([^"\\\n]{2,})"|'([^'\\\n]{2,})'|`([^`\\\n$]{2,})`/g)) {
      const value = m[1] ?? m[2] ?? m[3];
      if (value && value.length >= MIN_LITERAL) found.add(value);
    }
  }

  // Anything the rest of the app also contains is shared vocabulary, not a leak.
  const rest = src
    .filter((f) => !isDemo(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  return [...found].filter((v) => isDataShaped(v) && !rest.includes(v));
}

function build({ webpack, demo }) {
  rmSync(NEXT_DIR, { recursive: true, force: true });

  const env = { ...process.env, NODE_ENV: "production" };
  if (demo) env.NEXT_PUBLIC_ENABLE_DEMO = "true";
  else delete env.NEXT_PUBLIC_ENABLE_DEMO;

  // Invoke Next's bin directly rather than through `npx` + a shell: no
  // argument-escaping surface, and no dependence on PATH resolution.
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const log = execFileSync(
    process.execPath,
    [nextBin, "build", ...(webpack ? ["--webpack"] : [])],
    { cwd: ROOT, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  if (!existsSync(STATIC_DIR)) {
    throw new Error("build produced no .next/static — nothing to verify");
  }

  const files = walk(STATIC_DIR);
  return {
    buildId: readFileSync(path.join(NEXT_DIR, "BUILD_ID"), "utf8").trim(),
    banner: (log.match(/^\[next\.config\].*$/m) ?? ["(no banner)"])[0],
    files,
    // latin1 keeps byte offsets stable and never throws on odd bytes.
    blob: files.map((f) => readFileSync(f, "latin1")).join("\n"),
  };
}

function scan(blob, terms) {
  return terms.filter((t) => blob.includes(t));
}

/* --------------------------------------------------------------------- run */

const literals = demoExclusiveLiterals();
console.log(`Derived ${literals.length} string literals exclusive to src/lib/demo/.`);
console.log(`Plus ${CRITICAL.length} explicitly named critical strings.\n`);

const VARIANTS = [
  { name: "turbopack · demo DISABLED", webpack: false, demo: false, expect: "absent" },
  { name: "webpack   · demo DISABLED", webpack: true, demo: false, expect: "absent" },
  { name: "turbopack · demo ENABLED", webpack: false, demo: true, expect: "present" },
];

let failed = 0;

for (const variant of VARIANTS) {
  console.log(`─── ${variant.name} ${"─".repeat(Math.max(0, 46 - variant.name.length))}`);

  let result;
  try {
    result = build(variant);
  } catch (error) {
    // A demo-disabled build that fails is the tripwire in lib/demo/config.ts
    // doing its job — the alias did not apply. Report it as the failure it is.
    console.log(`  BUILD FAILED\n${String(error.stdout ?? "")}${String(error.stderr ?? error.message)}`);
    console.log(`  ✗ ${variant.name}: build did not complete\n`);
    failed += 1;
    continue;
  }

  console.log(`  BUILD_ID     ${result.buildId}`);
  console.log(`  banner       ${result.banner.trim()}`);
  console.log(`  client files ${result.files.length} under .next/static`);

  const critHits = scan(result.blob, CRITICAL);
  const litHits = scan(result.blob, literals);

  if (variant.expect === "absent") {
    console.log(`  credentials  ${critHits.length === 0 ? "absent ✓" : `PRESENT ✗ ${JSON.stringify(critHits)}`}`);
    console.log(`  fixtures     ${litHits.length === 0 ? "absent ✓" : `${litHits.length} of ${literals.length} PRESENT ✗`}`);
    if (critHits.length || litHits.length) {
      failed += 1;
      console.log(`  ✗ ${variant.name}: demo content reached the client bundle`);
      for (const hit of [...critHits, ...litHits].slice(0, 12)) {
        const where = result.files.find((f) => readFileSync(f, "latin1").includes(hit));
        console.log(`      ${JSON.stringify(hit)} → ${path.relative(ROOT, where ?? "?")}`);
      }
    } else {
      console.log(`  ✓ ${variant.name}: clean`);
    }
  } else {
    // Anti-vacuity: if the demo cannot be found even when it is switched ON,
    // the two checks above are not measuring anything.
    const ok = critHits.length === CRITICAL.length;
    console.log(`  demo present ${ok ? "yes ✓" : `NO ✗ (found ${critHits.length}/${CRITICAL.length})`}`);
    if (!ok) {
      failed += 1;
      console.log(`  ✗ ${variant.name}: the demo build does not contain the demo — the`);
      console.log(`    checks above prove nothing. Investigate before trusting this script.`);
    } else {
      console.log(`  ✓ ${variant.name}: demo intact when explicitly enabled`);
    }
  }
  console.log();
}

rmSync(NEXT_DIR, { recursive: true, force: true });

if (failed) {
  console.error(`FAILED — ${failed} of ${VARIANTS.length} variants. See SEC-027 / BUG-033.`);
  process.exit(1);
}

console.log(`PASSED — the demo is excluded from every production build path, and`);
console.log(`still present when explicitly enabled. (.next removed; rebuild as needed.)`);
