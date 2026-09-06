# CMBFRONTEND — Rise Next Banking CRM

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4. The browser
client for a multi-bank DSA / lending operation.

```
src/app/        routes — (app)/ is authenticated, login/ accept-invite/
                forgot-password/ reset-password/ are public
src/components/ ui/ primitives, layout/, shared/, charts/
src/hooks/      auth, api, reference data, notifications, settings, reports
src/lib/        api client, demo module, export, format, nav, types
scripts/        verify-demo-exclusion.mjs, ci-local.sh
docs/           frontend-owned documentation
```

> ## THIS REPOSITORY IS ONE HALF OF A SPLIT
>
> | | |
> |---|---|
> | **Frontend (here)** | <https://github.com/RiseNext/CMBFRONTEND> |
> | **Backend** | <https://github.com/RiseNext/CMBBACKEND> |
>
> The two were a single monorepo until the production split. **CMBBACKEND is the
> operations home** — deployment, secrets, migrations, bootstrap, the runbook,
> the security audit and the decision records (`D-xxx`) all live in its `docs/`.
> Where a document here refers to `src/services/...`, `drizzle/...` or
> `.env.example` **in a backend context**, it means that path inside CMBBACKEND.

> ## PROJECT STATUS
>
> Frontend **1143/1143 tests across 52 files** · typecheck clean ·
> `next build` exit 0 · demo exclusion verified on **both** bundlers ·
> lint at its documented baseline of **58** (57 warnings + 1 pre-existing error
> in `use-auth.tsx`).
>
> **Not deployed.** Do not treat this README as a completeness claim; see
> [`docs/INTEGRATION_MAP.md`](docs/INTEGRATION_MAP.md) for the screen-by-screen
> truth about which controls actually reach the database.

---

## Architecture

```
Vercel (Next.js)  ──HTTPS──>  Railway (Express API)  ──TLS──>  Neon (PostgreSQL)
  access token in memory        argon2id + JWT
  refresh token httpOnly        permission checks
```

**The backend is the only authority.** Anything enforced only in React is not
enforced. Navigation is permission-aware (D-089) as a usability measure, not a
security control — every route the sidebar hides is still refused by the API.

---

## Setup

```bash
npm install
cp .env.example .env.local     # set NEXT_PUBLIC_API_URL to the backend origin
npm run dev
```

Open <http://localhost:3000>. You land on the login screen.

With the backend running locally on its default port, the only value you need is:

```
NEXT_PUBLIC_API_URL="http://localhost:8080"
```

Origin **only** — `src/lib/api.ts` appends `/api` itself.

### ⚠️ Regenerating `package-lock.json` — read this first

**Generate it with the same npm the CI runner uses: npm 10.9.x, on Linux.**

`.github/workflows/ci.yml` pins `node-version: 22`, and `actions/setup-node@v4`
ships **npm 10.9.4** with it. A lockfile written by a *newer* npm on Windows is
not interchangeable, and the failure is not obvious:

    npm error `npm ci` can only install packages when your package.json and
    npm error package-lock.json are in sync.
    npm error Missing: @emnapi/runtime@1.11.3 from lock file
    npm error Missing: @emnapi/core@1.11.3 from lock file

Nothing is actually out of sync. `@emnapi/*` are dependencies of the
`*-wasm32-wasi` optional packages of `@tailwindcss/oxide` and `@unrs/resolver`,
and the two disagree on purpose — oxide wants `^1.11.1`, the resolver pins
`1.10.0`. npm **skips the subtree of an optional dependency whose `cpu` does not
match the host**, so on an x64 machine it can decline to resolve the wasm32
branch and simply never record `@emnapi/core@1.11.3`. Whether it does depends on
the npm version, so the lockfile a Windows npm 11 writes is missing entries the
runner's npm 10.9 demands. `npm ci` passes locally and fails in CI.

This is not theoretical: it is exactly how CI run #1 failed, and it is the whole
reason `npm ci` is a gate rather than `npm install`.

If you have Docker or WSL:

```bash
# generate against the runner's platform and npm
docker run --rm -v "$PWD":/w -w /w node:22-alpine npm install --package-lock-only
```

Then commit the lockfile and let CI confirm it. **Do not "fix" a red `npm ci` by
relaxing the step to `npm install`** — that removes the only check that the
lockfile is installable at all.

### npm scripts

| Script | Does |
|---|---|
| `npm run dev` | `next dev` |
| `npm run build` | `next build` — **excludes the demo module by default** |
| `npm start` | `next start` |
| `npm run typecheck` / `lint` / `test` | the gates |
| `npm run verify:demo-exclusion` | builds on **both** bundlers and searches the output for demo strings |

---

## Environment variables

> ⚠️ **Every variable here is PUBLIC.** `NEXT_PUBLIC_*` is substituted into the
> JavaScript bundle at build time and is readable by anyone who loads the page.
> **Nothing secret may ever go in this file or in the Vercel environment as a
> `NEXT_PUBLIC_` variable.** Secrets belong to the backend, which the browser
> never sees.
>
> Because they are baked in at **build** time, changing one in Vercel requires a
> **redeploy** — restarting achieves nothing.

**[`.env.example`](.env.example) is the authoritative template**, and
`src/lib/env-template.test.ts` **fails the build** if it drifts from what the
source actually reads.

| Name | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **yes in prod** | Backend origin, no trailing slash, no `/api` |
| `NEXT_PUBLIC_ENABLE_DEMO` | **DEV ONLY** | Leave **unset** for any real deployment. `true` ships the demo credential and ~1,500 lines of fabricated customer PII (SEC-001 / SEC-027) |
| `NEXT_PUBLIC_ERROR_TRACKING_URL` | no | Public, so there is deliberately **no token**. The collector must accept unauthenticated posts and rate-limit itself |
| `NEXT_PUBLIC_RELEASE_SHA` | no | On Vercel, set to `$VERCEL_GIT_COMMIT_SHA` |

Two things must agree with `NEXT_PUBLIC_API_URL` or authentication breaks in a
way that looks like a bug rather than a misconfiguration:

- the backend's `CORS_ORIGIN` must name **this** app's origin exactly, and
- the backend's `NODE_ENV` must be `production`, or the refresh cookie is issued
  `SameSite=Lax` and the browser will never send it across the Vercel↔Railway
  boundary. **Sign-in appears to work and every reload signs the user out.**

---

## How auth works in the browser

The access token lives in a module variable and is gone on refresh. The refresh
token is an httpOnly cookie the browser sends automatically and JavaScript
cannot read, so an XSS bug cannot exfiltrate a long-lived credential. On boot
the app calls `POST /api/auth/refresh` to restore the session.

Because Vercel and Railway are different sites, the refresh cookie is
`SameSite=None; Secure` in production. That requires the backend's
`CORS_ORIGIN` to name the exact Vercel origin — a wildcard will not work with
credentials.

---

## Demo mode — client presentations only

A **self-contained demo account** used to walk a client through the workspace
without a backend or a database. It is a presentation aid, not a feature of the
product.

**Demo credentials** — a fictional demo account, not a real user:

| | |
|---|---|
| Email | `demo.employee@risenext.com` |
| Password | `Demo@12345` |

> **These credentials only work in a build that includes the demo.** A default
> `npm run build` — the one a deploy pipeline runs — leaves the demo module out
> of the bundle entirely, and the address above is then rejected by the API like
> any other unknown account.

### Where the demo is available

Inclusion is decided at **build time**, by `next.config.ts`, from
`NEXT_PUBLIC_ENABLE_DEMO`:

| How you run it | `NEXT_PUBLIC_ENABLE_DEMO` | Demo module |
|---|---|---|
| `npm run dev` | unset | **included** — nothing to configure |
| `npm run build` | unset | **excluded** ← the deployment default |
| `npm run build` | `true` | included — a deployable client-demo build |
| anything | any other value | excluded |

Every build prints which variant it produced:

```
[next.config] demo module: EXCLUDED (NEXT_PUBLIC_ENABLE_DEMO=unset, NODE_ENV=production)
```

**Never set it on the production deployment.**

### Why the production build is safe

When the demo is excluded, `@/lib/demo` is **aliased by the bundler** to
`src/lib/demo-disabled.ts`, an inert module with the same exports and no data.
The real module is therefore never resolved and never enters the module graph —
the credential and the fixtures are **absent from the shipped JavaScript**, not
merely unreachable inside it. `isDemoMode()` is a compile-time `false`, so
setting the demo session flag by hand in devtools on a deployed site activates
nothing.

**Both bundlers are covered.** Next can build with Turbopack (the default) or
with `next build --webpack`, and they read different configuration. Both are
set, and if the exclusion ever fails to apply the build **fails** rather than
shipping — `src/lib/demo/config.ts` carries a tripwire that throws during static
generation. Check it yourself at any time:

```bash
npm run verify:demo-exclusion   # builds on both bundlers, searches the output, exits non-zero on a leak
```

### How you can tell you are in the demo

A demo session is labelled on screen at all times, in three places — a banner
across every screen, a badge in the top bar that survives scrolling, and a
sidebar marker that shrinks to its icon rather than disappearing when the
sidebar is collapsed. None can be switched off from the UI, and none appears for
a real user.

The demo presents as an **Executive** — the most restricted role — scoped to two
fictional banks. Administrative screens are absent from its navigation and
unreachable by URL. It is matched entirely in the browser, in `signIn`, *before
any network request is built*: the credentials are never transmitted to the
backend, and no access token is issued.

---

## Light / dark mode

`src/components/theme-script.tsx` runs before hydration and sets the theme class
on `<html>` from `localStorage`, falling back to the OS preference, so there is
no flash of the wrong theme. Dark mode reuses the same layout, spacing and
component structure; only the tokens in the `.dark` block of `globals.css`
differ, plus lightened status colours (the light-mode greens and ambers fail
contrast on the dark canvas) and a hairline card ring in place of shadows that
are invisible on dark.

---

## Testing

```bash
npm run typecheck && npm test && npm run build && npm run verify:demo-exclusion
bash scripts/ci-local.sh    # the whole CI pipeline, locally
```

**1,143 test cases across 52 files** — vitest + jsdom, no component-testing
library (see `DECISIONS.md` D-012 in CMBBACKEND).

Two files are worth knowing about:

- **`src/app/(app)/zero-fake-sweep.test.tsx`** clicks every control on all
  twenty screens and **fails any success claim not backed by a request or a
  produced file** — and it proves it can detect an offender.
- **`src/lib/env-template.test.ts`** fails the build if `.env.example` drifts
  from what the source reads, and refuses variable names that indicate a secret
  has been parked in a file that compiles into the bundle.

> **There are no end-to-end tests.** jsdom is not a browser. Stated rather than
> implied away.

---

## Vercel deployment

1. New project from **this** repository. Root directory is the repository root —
   there is no `frontend/` subdirectory any more.
2. `vercel.json` sets the framework, `npm ci`, `npm run build`, region `bom1`
   (Mumbai).
3. Set `NEXT_PUBLIC_API_URL` to the Railway origin for Production and Preview.
4. **Leave `NEXT_PUBLIC_ENABLE_DEMO` unset.**
5. Deploy, then set the backend's `CORS_ORIGIN` to the Vercel origin.

Order matters: **Railway before Vercel** (Vercel needs the API URL), and
**`CORS_ORIGIN` after Vercel** (the backend needs the Vercel URL). Until the
last step, every browser request fails — and a rejected origin currently
surfaces as a **500** (BUG-022), so it looks like the API is broken rather than
misconfigured.

---

## Documentation

| Document | For |
|---|---|
| [`docs/INTEGRATION_MAP.md`](docs/INTEGRATION_MAP.md) | **Screen by screen: does this control reach the database?** |
| [`docs/API_OVERVIEW.md`](docs/API_OVERVIEW.md) | The contract this client consumes — all 96 endpoints |
| [`docs/ROLES_AND_PERMISSIONS.md`](docs/ROLES_AND_PERMISSIONS.md) | The 5 roles, 76 permissions, per-role capability matrix |
| [`docs/FRONTEND_ANALYSIS.md`](docs/FRONTEND_ANALYSIS.md) | Pre-backend reconnaissance. **Superseded**, kept for its §2 missing-UI list |
| [`docs/LEGACY_README.md`](docs/LEGACY_README.md) | The original standalone-mock README. **Historical, and known false** — retained only because it records what the app used to claim |

Everything operational — deployment, secrets, the runbook, the security audit,
the decision log, the roadmap — lives in **CMBBACKEND `docs/`**.
