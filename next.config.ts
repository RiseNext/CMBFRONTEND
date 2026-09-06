import path from "node:path";
import type { NextConfig } from "next";

/**
 * DEMO MODULE — BUILD-TIME INCLUSION SWITCH
 *
 * The client-presentation demo (`src/lib/demo/`) contains a hardcoded
 * credential, a persona and ~1,500 lines of fabricated customer data. None of
 * it may reach a production bundle, but all of it must still work when running
 * a demo for a client.
 *
 * The decision is made here, at resolve time, rather than in application code:
 * when the demo is off, `@/lib/demo` is aliased to `@/lib/demo-disabled`, an
 * inert module with the same export surface. The bundler then never resolves
 * `src/lib/demo/` at all, so the fixtures are absent from the output instead of
 * present-but-unreachable. A runtime `if (flag)` could not promise that — it
 * would still ship every fixture and depend on the minifier noticing they are
 * dead. See docs/DECISIONS.md D-014.
 *
 * ── THE ALIAS MUST BE SET ON EVERY BUNDLER (SEC-027) ────────────────────────
 *
 * Next supports two: Turbopack (the default) and webpack (`next build
 * --webpack`). They read *different* configuration keys, and each ignores the
 * other's. When only `turbopack.resolveAlias` was set, `next build --webpack`
 * resolved `@/lib/demo` through `tsconfig` paths to the real module and shipped
 * the credential and all fabricated PII — while this file's own banner printed
 * `EXCLUDED`.
 *
 * Both keys are now set, and two things stop that failure recurring:
 *
 *   1. `src/lib/demo/config.ts` carries a build-time tripwire. Every other file
 *      in that directory imports it, so if the demo module is reachable at all
 *      from a demo-disabled production build, static generation throws and the
 *      build fails. That is bundler-agnostic — it needs no key here, and covers
 *      a bundler Next has not shipped yet.
 *   2. The banner below reports the bundler it is actually running under and
 *      the mechanism it actually applied, not merely what was configured.
 *
 * Verified end to end by `npm run verify:demo-exclusion`, which builds on both
 * bundlers into clean output and searches the result.
 *
 * ── WHEN IS THE DEMO INCLUDED? ──────────────────────────────────────────────
 *
 *   NEXT_PUBLIC_ENABLE_DEMO unset  →  follows NODE_ENV:
 *                                     `next dev`   → included
 *                                     `next build` → EXCLUDED
 *   NEXT_PUBLIC_ENABLE_DEMO=true   →  included (this is how a client-facing
 *                                     demo build is produced)
 *   any other value                →  excluded
 *
 * The default is what matters: an ordinary `npm run build` — the one a deploy
 * pipeline runs — excludes the demo without anyone having to remember a flag.
 * Enabling it in a build is an explicit, visible act.
 *
 * The variable holds only "true"/"false" and is not a secret. It carries the
 * NEXT_PUBLIC_ prefix so its non-secret nature is obvious at a glance; nothing
 * in client code reads it.
 */
const demoFlag = process.env.NEXT_PUBLIC_ENABLE_DEMO;
const demoEnabled =
  demoFlag === undefined || demoFlag === ""
    ? process.env.NODE_ENV !== "production"
    : demoFlag === "true";

/** Next sets TURBOPACK when the Turbopack pipeline is driving the build. */
const bundler = process.env.TURBOPACK ? "turbopack" : "webpack";

/** The inert stand-in. Absolute, because webpack's resolver requires it. */
const DEMO_DISABLED = path.resolve(process.cwd(), "src/lib/demo-disabled.ts");

/**
 * Reports what this build actually did, not what it was configured to do.
 *
 * The distinction is the whole of BUG-033: the previous version printed
 * `EXCLUDED` from the flag alone, so a webpack build that shipped the entire
 * demo still announced that it had not.
 */
console.log(
  `[next.config] demo module: ${
    demoEnabled ? "INCLUDED" : `EXCLUDED via ${bundler} alias`
  } (bundler=${bundler}, NEXT_PUBLIC_ENABLE_DEMO=${demoFlag ?? "unset"}, ` +
    `NODE_ENV=${process.env.NODE_ENV ?? "unset"})`,
);

/**
 * SECURITY HEADERS ON THE FRONTEND ORIGIN — SEC-011, Task 13.5
 *
 * Before this, `next.config.ts` had no `headers()` and there was no
 * `middleware.ts`, so the Vercel origin emitted **no CSP, no HSTS, no
 * X-Frame-Options and no Referrer-Policy**. The API emits helmet's defaults
 * (minus CSP, disabled deliberately at `backend/src/app.ts:48` because an API
 * serves no documents) — but the API is not the origin a browser renders, and
 * clickjacking, mixed content and injected script all land here.
 *
 * ── WHY `'unsafe-inline'` IS PRESENT AND WHY THAT IS NOT A CLIMBDOWN ────────
 *
 * The roadmap row says *"the inline theme script needs a nonce"*. A nonce
 * cannot be delivered through `next.config.ts`: `headers()` is static
 * configuration, evaluated at build time, and a nonce must be fresh per
 * response. Emitting a fixed "nonce" would be worse than none — it would look
 * like a control and be a constant.
 *
 * The honest options were a `middleware.ts` minting a per-request nonce, or
 * `'unsafe-inline'` for scripts. Middleware is the correct end state and is
 * **recorded as follow-up**, not done here: Next injects its own inline
 * bootstrap and hydration scripts, and a nonce-based policy requires every one
 * of them to carry the nonce. Getting that wrong produces a blank page in
 * production and nothing anywhere else, which is precisely the failure mode
 * this project has been burned by (SEC-027).
 *
 * So this policy is deliberately **incomplete on script-src and real
 * everywhere else**: `object-src 'none'`, `frame-ancestors 'none'`,
 * `base-uri 'self'` and `form-action 'self'` are the directives that stop
 * clickjacking, base-tag hijacking and form exfiltration, and none of them is
 * weakened by the inline allowance. Recorded in DECISIONS.md D-082.
 *
 * `connect-src` must include the API origin or every request fails. It is read
 * from `NEXT_PUBLIC_API_URL`, the same variable the client uses, so the policy
 * cannot drift from the transport.
 */
const apiOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    // A malformed value must not silently produce a policy that blocks every
    // request with no explanation.
    console.warn(`[next.config] NEXT_PUBLIC_API_URL is not a valid URL: ${raw}`);
    return "";
  }
})();

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // See the note above: nonce-based script-src is follow-up work (D-082).
  "script-src 'self' 'unsafe-inline'",
  // Tailwind v4 and the theme variables are injected as inline style.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""}`,
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Two years, subdomains included. Vercel terminates TLS, so this is safe to
  // assert unconditionally; a browser ignores it over plain HTTP anyway.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Redundant with frame-ancestors for modern browsers, kept for older ones.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app uses none of these. Denying them shrinks the surface a compromised
  // dependency could reach.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /*
   * `images.remotePatterns` is GONE — SEC-012, Task 13.6.
   *
   * It was `[{ protocol: "https", hostname: "**" }]`, which turns
   * `/_next/image?url=…` into an **open fetch proxy**: any visitor could make
   * the Vercel function fetch an arbitrary https URL and return the bytes.
   * That is SSRF with the deployment's own network position and IP reputation.
   *
   * No remote image is used anywhere in the application — verified by grep for
   * `next/image` with an external `src`. Task 9.6 deliberately did **not** use
   * `next/image` for document previews for exactly this reason, which is what
   * kept this a one-line deletion rather than a redesign.
   *
   * If a remote image is ever genuinely needed, add the ONE hostname. Never
   * restore the wildcard.
   */
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  ...(demoEnabled
    ? {}
    : {
        // Turbopack. Exact-match key; deep imports are caught by the tripwire.
        turbopack: {
          resolveAlias: {
            "@/lib/demo": "./src/lib/demo-disabled.ts",
          },
        },

        // webpack. Set only when webpack is actually the bundler, so Turbopack
        // builds do not emit Next's "Webpack is configured while Turbopack is
        // not" warning.
        //
        // `resolve.alias` ALONE IS NOT ENOUGH HERE, and finding that out is
        // most of what this task cost. Next registers `JsConfigPathsPlugin` in
        // `resolve.plugins` to implement `tsconfig` `paths`; it resolves
        // `@/lib/demo` to the real directory before the alias is consulted, so
        // an alias-only fix compiles happily and still ships the demo. The
        // tripwire in `lib/demo/config.ts` caught it.
        //
        // `NormalModuleReplacementPlugin` rewrites the *request* before
        // resolution begins, so nothing downstream — paths plugin included —
        // gets the chance to resolve it to the real module. The alias is kept
        // alongside it as a second line for any request that never reaches the
        // paths plugin.
        ...(bundler === "webpack"
          ? {
              webpack(
                config: {
                  plugins: unknown[];
                  resolve?: { alias?: Record<string, string | false | string[]> };
                },
                context: { webpack: { NormalModuleReplacementPlugin: new (
                  resourceRegExp: RegExp,
                  newResource: string,
                ) => unknown } },
              ) {
                config.plugins.push(
                  new context.webpack.NormalModuleReplacementPlugin(
                    /^@\/lib\/demo$/,
                    DEMO_DISABLED,
                  ),
                );

                config.resolve ??= {};
                config.resolve.alias = {
                  ...config.resolve.alias,
                  "@/lib/demo$": DEMO_DISABLED,
                };

                return config;
              },
            }
          : {}),
      }),
};

export default nextConfig;
