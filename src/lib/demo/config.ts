/**
 * DEMO MODE — PRESENTATION ACCOUNT
 *
 * A self-contained Executive experience used to walk a client through the
 * workspace without a backend or a database. Everything under `lib/demo` is
 * additive and isolated: the only touch points in the rest of the app are one
 * short-circuit at the top of `apiRequest`, a credential check in `signIn`
 * before any network call, and permission-aware navigation in the shell.
 *
 * The account below is fictional and grants nothing on the server. It is
 * matched entirely in the browser, so these credentials are never transmitted.
 */

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * BUILD-TIME TRIPWIRE — SEC-027. Do not remove or soften.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `next.config.ts` keeps this module out of demo-disabled production builds by
 * aliasing `@/lib/demo` to the inert `lib/demo-disabled.ts`. That alias has to
 * be configured **per bundler**, and when it was configured for Turbopack only,
 * `next build --webpack` silently shipped the credential and every fabricated
 * customer record to the public bundle — while the build log said `EXCLUDED`.
 *
 * This guard makes that class of failure impossible rather than unlikely. It is
 * bundler-agnostic by construction: whatever resolves this file, whatever flag
 * was passed, whatever future bundler Next adopts, if this module is reachable
 * from a demo-disabled production build the build **fails** instead of
 * shipping. `next build` prerenders every page on the server, so the throw
 * fires during static generation, not in front of a user.
 *
 * It also closes the deep-import hole the alias cannot: `@/lib/demo` is matched
 * exactly, so `@/lib/demo/config` would slip past it — but every other file in
 * this directory imports this one, so nothing here can be bundled without
 * dragging this check along.
 *
 * Deliberately not active in development or under test: the condition requires
 * `NODE_ENV === "production"`, and a demo-enabled production build sets
 * `NEXT_PUBLIC_ENABLE_DEMO=true`, which is exactly when this module is meant to
 * be here.
 *
 * See docs/SECURITY_AUDIT.md SEC-027 and docs/DECISIONS.md D-017.
 */
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_ENABLE_DEMO !== "true"
) {
  throw new Error(
    "SEC-027: the demo module was bundled into a production build that is " +
      'supposed to exclude it. The "@/lib/demo" alias did not apply on this ' +
      "bundler. Check the turbopack.resolveAlias and webpack resolve.alias " +
      "entries in next.config.ts, and check for a deep import of " +
      "@/lib/demo/* in application code. This build has been failed on " +
      "purpose — see docs/SECURITY_AUDIT.md SEC-027.",
  );
}

export const DEMO_EMAIL = "demo.employee@risenext.com";
export const DEMO_PASSWORD = "Demo@12345";

/** sessionStorage — deliberately not localStorage, so the demo ends with the tab. */
export const DEMO_SESSION_KEY = "risenext.demo.session";
export const DEMO_DATA_KEY = "risenext.demo.data";

/** Where the demo employee lands after signing in. */
export const DEMO_HOME = "/my-work";

/**
 * The exact permission set the seeded `executive` role carries in
 * `backend/src/lib/permissions.ts`. Kept as a literal because the demo must
 * work with no backend reachable — it is a mirror, never a source of truth.
 */
export const DEMO_PERMISSIONS: string[] = [
  "customers.view",
  "customers.create",
  "customers.edit",
  "banks.view",
  "requests.view",
  "requests.create",
  "verification.view",
  "bank_orders.view",
  "disbursements.view",
  "transactions.view",
  "documents.view",
  "documents.upload",
];

export const DEMO_USER_ID = "9f2c1d40-6b31-4c2a-9d55-11a0f4c7b301";

/** Bank ids the demo executive is scoped to. Mirrors a real assigned-banks list. */
export const DEMO_BANK_IDS = [
  "2c9a7f10-4d33-4b8e-9a21-5f0c8e6d1a01",
  "2c9a7f10-4d33-4b8e-9a21-5f0c8e6d1a02",
];

/**
 * Routes the demo employee may open. Anything else is bounced back to the
 * workspace, so the administrative screens are unreachable even by typing the
 * URL directly.
 */
export const DEMO_ROUTES: string[] = [
  DEMO_HOME,
  "/customers",
  "/loans",
  "/bank-orders",
  "/disbursement",
  "/transactions",
  "/documents",
  "/banks",
  "/notifications",
  "/settings",
];

export function isDemoRoute(pathname: string): boolean {
  return DEMO_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * The one place the credentials are compared. The email is normalised the same
 * way the API normalises it; the password must match exactly, so a typo falls
 * straight through to the real login request.
 */
export function isDemoCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}
