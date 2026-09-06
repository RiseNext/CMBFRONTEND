/**
 * DEMO MODULE — PRODUCTION SUBSTITUTE
 *
 * This file is what `@/lib/demo` resolves to in a build with the demo turned
 * off. The swap is made by the bundler in `next.config.ts`
 * (`turbopack.resolveAlias`), so `src/lib/demo/` is never resolved, never
 * parsed, and never enters the module graph: the demo credential, the 838
 * lines of fabricated customer data and the 651-line fixture router are absent
 * from the output rather than present-but-unreachable inside it.
 *
 * That distinction is the whole point. A runtime `if (flag)` around the demo
 * would still ship every fixture to every visitor and rely on the minifier
 * noticing they are dead. Module replacement is decided by the bundler's
 * resolver, so nothing is left to a heuristic — see docs/DECISIONS.md D-014.
 *
 * The file therefore has one hard rule: **no fixture data, no credential, and
 * no import that reaches `./demo` at runtime.** The type-only import below is
 * erased by the compiler and emits nothing.
 *
 * Behaviour in a demo-disabled build:
 *
 *   - `isDemoMode()` is `false` unconditionally, so a hand-planted
 *     `sessionStorage` demo flag activates nothing;
 *   - `isDemoCredentials()` is `false`, so the demo address falls through to
 *     the real login request like any other unknown account;
 *   - `demoRequest()` throws rather than answering, because it is structurally
 *     unreachable and a silent success would be the exact defect this task
 *     exists to remove.
 *
 * Every export of `./demo/index.ts` must have a counterpart here or the
 * substituted build fails to resolve a symbol. Each one is typed as
 * `typeof DemoEnabled.<name>`, so a signature can never drift; the assignment
 * at the bottom catches a missing or spare name; `demo-disabled.test.ts`
 * asserts the same parity at runtime.
 */

import type * as DemoEnabled from "@/lib/demo";

/* ------------------------------------------------------------------ config */

/**
 * Present for export parity only — the demo account does not exist in this
 * build. Deliberately typed as `string` rather than mirroring the real
 * module's string-literal type, because satisfying that literal would mean
 * writing the demo's own address back into the production bundle.
 */
export const DEMO_EMAIL: string = "";

/** Never navigated to: nothing in this build can enter a demo session. */
export const DEMO_HOME: string = "/";

export const DEMO_PERMISSIONS: typeof DemoEnabled.DEMO_PERMISSIONS = [];

/**
 * Always false. The demo address is not special here — it reaches
 * `POST /api/auth/login` and is rejected by the server like any other unknown
 * account, which is precisely the required production behaviour.
 */
export const isDemoCredentials: typeof DemoEnabled.isDemoCredentials = () => false;

export const isDemoRoute: typeof DemoEnabled.isDemoRoute = () => false;

/* ----------------------------------------------------------------- session */

/**
 * Always false, and deliberately not derived from storage.
 *
 * This is the single line that makes the production requirement true: setting
 * the demo session key by hand in devtools on a deployed build cannot reach a
 * fake backend, because there is no fake backend in the bundle to reach.
 */
export const isDemoMode: typeof DemoEnabled.isDemoMode = () => false;

/** No-op: reachable only from the dead demo branch of `signIn`. */
export const enableDemoMode: typeof DemoEnabled.enableDemoMode = () => {};

/**
 * No-op. It intentionally does not clear the storage keys either — naming them
 * here would put the demo's identifiers back into the production bundle for no
 * behavioural gain, since nothing in this build reads them.
 */
export const disableDemoMode: typeof DemoEnabled.disableDemoMode = () => {};

/* ------------------------------------------------------------------- store */

export const resetDemoData: typeof DemoEnabled.resetDemoData = () => {};

/* --------------------------------------------------------------- transport */

/** Kept so `lib/api`'s `instanceof` narrowing still compiles and behaves. */
export class DemoHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "DemoHttpError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Unreachable: `apiRequest` calls this only when `isDemoMode()` is true, and
 * here it never is. It throws rather than returning empty data — a fixture
 * layer quietly answering a production request is the failure mode this whole
 * task removes, so if it is ever reached it must be loud.
 */
export const demoRequest: typeof DemoEnabled.demoRequest = async () => {
  throw new Error(
    "Demo mode is not available in this build. This request must go to the API.",
  );
};

/**
 * The signed-in demo persona. Empty here; `signIn` reads it only inside the
 * `isDemoCredentials()` branch, which is dead in this build.
 */
export const DEMO_SESSION_USER: typeof DemoEnabled.DEMO_SESSION_USER = {
  id: "",
  name: "",
  email: "",
  phone: "",
  avatarUrl: null,
  role: { id: "", key: "", name: "", level: 0 },
  permissions: [],
  bankIds: [],
  unrestrictedBankAccess: false,
};

/* --------------------------------------------------------------------- nav */

export const demoNavSections: typeof DemoEnabled.demoNavSections = [];

/* ------------------------------------------------------------ parity check */

/**
 * Compile-time proof that this module can stand in for `@/lib/demo`.
 *
 * `tsc` and `next build` resolve `@/lib/demo` through `tsconfig.json` paths, so
 * every consumer is type-checked against the real module and never against
 * this one. This assignment is the only place the substitution itself is
 * checked: a missing export, a spare export, or an incompatible type fails
 * `npm run typecheck`. It has already earned its keep — it caught a
 * `phone: null` here against a `phone: string` there.
 *
 * String constants are compared by kind rather than by value, for the reason
 * given on `DEMO_EMAIL` above.
 */
type Substitute = {
  [K in keyof typeof DemoEnabled]: (typeof DemoEnabled)[K] extends string
    ? string
    : (typeof DemoEnabled)[K];
};

const _substitutable: Substitute = {
  DEMO_EMAIL,
  DEMO_HOME,
  DEMO_PERMISSIONS,
  DEMO_SESSION_USER,
  DemoHttpError,
  demoNavSections,
  demoRequest,
  disableDemoMode,
  enableDemoMode,
  isDemoCredentials,
  isDemoMode,
  isDemoRoute,
  resetDemoData,
};
void _substitutable;
