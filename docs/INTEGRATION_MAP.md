> ## ⚠️ 2026-09-06 — THIS MAP IS STALE, and stale in a specific direction
>
> It was written to answer *"does this control reach the database?"* when the
> honest answer for many of them was **no**. **Waves 1–6 closed all 26 such
> controls.** Every row that says a control is fake, absent or unwired should be
> assumed out of date.
>
> **What replaces it as evidence:**
> `src/app/(app)/zero-fake-sweep.test.tsx` clicks **every enabled
> control on all twenty screens** and fails any success claim not accompanied by
> a request or a produced file — and proves it can detect a planted offender.
> That is a stronger guarantee than a document, because it cannot go stale.
>
> Kept for its per-screen structure and its record of what was found. Flagged
> rather than rewritten, for the reason in `FEATURE_STATUS.md`'s own banner.

> **Tasks 1.1 + 1.2 + 1.3 update (2026-09-01).** The demo layer can no longer divert authentication, and in a production build it is not present at all.
>
> - **Task 1.1** — `signIn` clears demo mode in its real branch before the request is built; `forceSignOut` and the login-page mount clear it too.
> - **Task 1.2** — `apiRequest` consults an allow-list: the demo may answer **only** `POST /auth/refresh` (demo session restore across a reload). `POST /auth/login`, `POST /auth/change-password`, `POST /auth/logout`, `GET /auth/me` and any future `/auth/*` route now always reach the real backend, regardless of the flag.
> - **Task 1.3** — the demo module is **excluded from production builds**. `next.config.ts` aliases `@/lib/demo` to the inert `lib/demo-disabled.ts` unless `NEXT_PUBLIC_ENABLE_DEMO=true`. **Task 1.10** extended this to every bundler — webpack via `NormalModuleReplacementPlugin`, plus a tripwire that fails the build if the demo is ever reachable from a demo-disabled production build (SEC-027 resolved).
> - **Task 1.4** — every screen below now carries a visible demo marker while the flag is set: a banner above the topbar, a badge inside the `sticky` topbar, and a sidebar marker that shrinks to its icon rather than disappearing when the sidebar collapses. Rendered by `AppShell` and `Topbar`, so it applies to all `(app)` routes without any page changing.
>
> **Read the demo branches below as describing `npm run dev` and demo builds only.** In a production build `isDemoMode()` is a compile-time `false`, so **every** path in this document — auth and non-auth alike — reaches the real backend, and no `sessionStorage` value can change that. In a demo-enabled build the non-auth paths (`/customers`, `/loans`, `/users` and the rest) are still demo-served exactly as documented.
>
> Line references to `lib/api.ts:118` below predate Task 1.2; the short-circuit is now at `lib/api.ts:174` and is guarded by `requiresRealBackend()`. See [BUGS_AND_ISSUES.md](https://github.com/RiseNext/CMBBACKEND/blob/main/docs/BUGS_AND_ISSUES.md) BUG-001, [SECURITY_AUDIT.md](https://github.com/RiseNext/CMBBACKEND/blob/main/docs/SECURITY_AUDIT.md) SEC-001, and [DECISIONS.md](https://github.com/RiseNext/CMBBACKEND/blob/main/docs/DECISIONS.md) D-013 / D-014.

> **Task 1.6 update (2026-09-02).** Every request below assumes an allowed `Origin`. A request from an origin outside `CORS_ORIGIN` is now refused with **403 `cors_origin_denied`** *before the route runs* — it was a 500 — so none of the chains below are reached. Requests with no `Origin` header (curl, server-to-server, health probes) are unaffected. See [SECURITY_AUDIT.md](https://github.com/RiseNext/CMBBACKEND/blob/main/docs/SECURITY_AUDIT.md) SEC-018 and [DECISIONS.md](https://github.com/RiseNext/CMBBACKEND/blob/main/docs/DECISIONS.md) D-018.

# INTEGRATION MAP

**Question this document answers:** for every screen and every control in the Rise Next Banking CRM, does the click actually reach the database?

Every claim below is traceable to a `file:line` citation. Anything that could not be verified from source is marked **UNVERIFIED**. Nothing here is aspirational — it records what the code does at the commit and working tree described immediately below.

---

## 0. Scope and provenance

| Item | Value |
|---|---|
| Repository | `c:/progromming/Risenext-Banking-CRM` |
| Commit | `7ef5da5` — "Add frontend-only employee demo" |
| Working tree | **DIRTY** — 8 modified files, 4 untracked files |
| Frontend | Next.js 16.2.12 App Router, React 19. Every page is `"use client"`. No `middleware.ts`. No `app/api/` route handlers. |
| Backend | Express 5.1, TypeScript ESM, PostgreSQL (Neon) via `node-postgres` Pool, Drizzle ORM 0.44 |
| Auth | argon2id + JWT HS256 access token (15 min, in-memory only) + rotating httpOnly refresh cookie (7 d) |
| Endpoints | 96 total = 52 hand-written + 44 emitted by `createScopedResource` |
| Route mounts | 22, in `backend/src/app.ts:78-99` |

### Working tree vs HEAD

Where the checked-out working tree differs from `HEAD`, **both are documented**. The delta implements employee creation, temporary-password issue, admin password reset, and a forced password change.

| File | State | What changed |
|---|---|---|
| `backend/src/lib/password.ts` | modified | +43 lines: `generateTemporaryPassword`, `passwordProblems` |
| `backend/src/modules/admin.routes.ts` | modified | +101 lines: `POST /users/:id/reset-password`, `mustChangePassword` on create/edit |
| `backend/src/modules/auth.routes.ts` | modified | +3 lines: `mustChangePassword` added to `profileOf()` (`auth.routes.ts:70`) |
| `backend/src/services/access.ts` | modified | +4 lines: `mustChangePassword` on `AuthContext` (`access.ts:19`, `:38`, `:82`) |
| `src/app/(app)/employees/page.tsx` | modified | 622 lines changed — three FAKE handlers replaced with real HTTP calls |
| `src/app/(app)/settings/page.tsx` | modified | +79 lines — password change made real |
| `src/components/layout/app-shell.tsx` | modified | +16 lines — client-side forced-password-change redirect |
| `src/hooks/use-auth.tsx` | modified | +7 lines — `mustChangePassword?: boolean` on `SessionUser` |
| `backend/src/tests/employee-lifecycle.test.ts` | untracked | 25 new runtime test cases |
| `src/app/(app)/change-password/page.tsx` | untracked | new page |
| `src/components/shared/credential-handover.tsx` | untracked | new component |
| `src/lib/password-policy.ts` | untracked | new client-side mirror of the server policy |

---

## 1. How to read this document

### Verdict vocabulary

| Verdict | Meaning |
|---|---|
| **WIRED** | The control issues an HTTP request that reaches a backend route which writes to or reads from PostgreSQL, and the UI reflects the real result. |
| **READ-ONLY** | The control only reads. No mutation is possible from here. |
| **FAKE** | The control shows a success toast and/or mutates local React state, but issues **no HTTP request**. Nothing is persisted. Reloading the page reverts it. |
| **BROKEN** | A request *is* issued, but it cannot succeed, or the response is discarded, or the UI never reflects it. |
| **MISSING** | The UI needs a capability the backend does not expose, or the backend exposes it and the UI has no control for it. |
| **LOCAL** | Purely client-side work (a CSV/XML/HTML file generated in the browser). Correct by design, listed for completeness. |

### The single request path

```
Page component
  └─ hooks/use-api.ts        useResource / useRecord / useStats
       └─ lib/api.ts:177     api.list | get | create | update | remove | action | upload
            └─ lib/api.ts:114  apiRequest()
                 ├─ lib/api.ts:118  if (isDemoMode()) → demoRequest(), NEVER leaves the browser
                 └─ fetch(`${API_BASE_URL}/api${path}`, { credentials: "include" })
                      └─ Express  backend/src/app.ts:78-99  (22 router mounts)
                           └─ requireAuth  → loadAuthContext (DB read, every request)
                                └─ requirePermission(...)
                                     └─ bankScope() / assertBankAccess()
                                          └─ Drizzle → PostgreSQL
                                               └─ recordAudit() → audit_logs
```

Two facts that colour every diagram below:

1. **`apiRequest` short-circuits in demo mode.** `lib/api.ts:118-127` returns a browser-local fixture response when `isDemoMode()` is true, before a URL is even constructed. The demo account (`lib/demo/config.ts:14-15`) therefore reaches **zero** database rows. Everything in this document describes a **real** session.
2. **Every write passes through `recordAudit`.** Every `WIRED` write in this document also inserts into `audit_logs` — via `scoped-resource.ts:191`, `:236`, `:304`, or a hand-written equivalent. This is not repeated in each diagram.

### The three data hooks and their failure behaviour

| Hook | File | On success | On error | On 403 |
|---|---|---|---|---|
| `useResource<T>` | `use-api.ts:22-81` | `data` = rows, `total` = `meta.total` | `error` set, `data` reset to `[]` (`use-api.ts:64-66`) | Indistinguishable from an empty table unless the page renders `error` |
| `useRecord<T>` | `use-api.ts:84-136` | `data` = row | `error` set, `data` = `null` (`use-api.ts:122-123`) | Renders as "record not found" |
| `useStats<T>` | `use-api.ts:139-176` | `data` = stats object | **swallowed silently** — `data` set to `null`, no `error` field exists (`use-api.ts:159-161`) | Every KPI renders `0` (`use-api.ts:171`) |

`useStats` has no `error` in its return type at all. A 403 and a genuinely empty database are byte-identical on screen. See §8.

---

## 2. Route inventory used by the diagrams

| Mount | Router | Source |
|---|---|---|
| `/api` | `healthRouter` | `health.routes.ts` |
| `/api/auth` | `authRouter` | `auth.routes.ts` |
| `/api/banks` | `banksRouter` | `banks.routes.ts` |
| `/api/customers` | `customersRouter` | `customers.routes.ts` |
| `/api/users`, `/api/roles`, `/api/teams`, `/api/recycle-bin`, `/api/audit-logs`, `/api/notifications` | admin routers | `admin.routes.ts` |
| `/api/loans`, `/api/verifications`, `/api/bank-orders`, `/api/disbursements`, `/api/settlements`, `/api/transactions`, `/api/ledger`, `/api/documents`, `/api/funding-sources`, `/api/service-providers`, `/api/dashboard` | operations routers | `operations.routes.ts` |
| `/api/imports` | `importsRouter` | `imports.routes.ts` |

Nine of those routers are produced by the factory `createScopedResource` (`scoped-resource.ts:74-322`), which emits:

| Method | Path | Guard | Emitted when |
|---|---|---|---|
| GET | `/` | `permissions.view` | always (`scoped-resource.ts:102`) |
| GET | `/:id` | `permissions.view` | always (`scoped-resource.ts:155`) |
| POST | `/` | `permissions.create` | always (`scoped-resource.ts:170`) |
| PATCH | `/:id` | `permissions.edit` | always (`scoped-resource.ts:205`) |
| DELETE | `/:id` | `permissions.delete` | only if `permissions.delete` is set (`scoped-resource.ts:251`) |
| POST | `/:id/approve` | `permissions.approve` | only if `permissions.approve` is set (`scoped-resource.ts:271`) |

Bank isolation is applied in exactly one place per read — `scopedWhere()` at `scoped-resource.ts:94-100`, which calls `bankScope()` at `access.ts:108-111`. A user with zero bank assignments gets the sentinel UUID `00000000-0000-0000-0000-000000000000` (`access.ts:114`) and therefore sees nothing — the scope fails **closed**.

---

## 3. Per-page integration map

### 3.1 `/dashboard` — `src/app/(app)/dashboard/page.tsx` (389 lines)

**(a) Chain**

```
DashboardPage
 ├─ useStats("/dashboard/stats")           dashboard/page.tsx:40
 │    → GET /api/dashboard/stats           operations.routes.ts:521
 │    → requirePermission(reports.view)    operations.routes.ts:521
 │    → raw SQL over customers, loans, settlements, bank_orders,
 │      disbursements, transactions, documents, banks  (operations.routes.ts:534-570)
 │    → { data: {...snake_case...}, meta.scoped }      operations.routes.ts:574
 │    → 12 StatCard values                             dashboard/page.tsx:69-86
 │
 ├─ useResource("/dashboard/loan-status")  dashboard/page.tsx:41
 │    → GET /api/dashboard/loan-status     operations.routes.ts:580  → loans (GROUP BY status)
 │    → <LoanStatusChart>                  dashboard/page.tsx:170
 │
 ├─ useResource("/dashboard/bank-performance")  dashboard/page.tsx:44
 │    → GET /api/dashboard/bank-performance operations.routes.ts:599 → loans (GROUP BY bank_id)
 │    → <BankPerformanceChart>             dashboard/page.tsx:183
 │
 ├─ useResource("/loans",{pageSize:200})   dashboard/page.tsx:50  → requests.view    → loans
 ├─ useResource("/bank-orders",{100})      dashboard/page.tsx:51  → bank_orders.view → bank_orders
 ├─ useResource("/settlements",{100})      dashboard/page.tsx:52  → settlements.view → settlements
 └─ useResource("/customers",{500})        dashboard/page.tsx:53  → customers.view   → customers
```

Two data sets on this page are **hardcoded empty arrays**, not fetched: `activity` (`dashboard/page.tsx:56`) and `monthlyTrend` (`dashboard/page.tsx:57`). `unreadNotifications` and `ledgerBalance` are literal `0` (`dashboard/page.tsx:81`, `:85`).

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "View reports" button | `dashboard/page.tsx:105-109` | no (navigation) | — | n/a | READ-ONLY |
| "New customer" button | `dashboard/page.tsx:110-114` | no (navigation to `/customers`) | — | n/a | READ-ONLY |
| 4 × StatCard | `dashboard/page.tsx:120-157` | via `useStats` | `GET /api/dashboard/stats` | reads | READ-ONLY |
| Loan overview chart | `dashboard/page.tsx:170` | via `useResource` | `GET /api/dashboard/loan-status` | reads | READ-ONLY |
| Bank-wise performance chart | `dashboard/page.tsx:183` | via `useResource` | `GET /api/dashboard/bank-performance` | reads | READ-ONLY |
| "Disbursal and commission trend" chart | `dashboard/page.tsx:193` | **no** — fed by `monthlyTrend = []` at `:57` | none exists | never | MISSING |
| "Recent activity" list | `dashboard/page.tsx:206-221` | **no** — fed by `activity = []` at `:56` | `GET /api/audit-logs` exists and is never called | never | MISSING |
| "Files awaiting bank action" list | `dashboard/page.tsx:237-262` | via `useResource` | `GET /api/bank-orders` | reads | READ-ONLY |
| "Team performance" bars | `dashboard/page.tsx:275-297` | via `useReference` | `GET /api/users` | reads | READ-ONLY |
| "Commission due" panel | `dashboard/page.tsx:302-328` | via `useResource` | `GET /api/settlements` | reads | READ-ONLY |
| "Pipeline value" panel | `dashboard/page.tsx:330-358` | via `useResource` | `GET /api/loans` | reads | READ-ONLY |
| 4 × Quick action buttons | `dashboard/page.tsx:365-377` | no (navigation) | — | n/a | READ-ONLY |

**Note.** `dashboard/page.tsx:248` renders `{order.loanId}` — a raw UUID — inside the file list, labelled as if it were a human-readable reference.

---

### 3.2 `/customers` — `src/app/(app)/customers/page.tsx` (1038 lines)

**(a) Chain**

```
CustomersPage
 ├─ useResource("/customers",{search,pageSize:100})   customers/page.tsx:63
 │    → GET /api/customers   customers.routes.ts:91   → customers.view
 │    → bankScope(customers.bankId)  customers.routes.ts:101
 │    → customers  → { data, meta:{page,pageSize,total,totalPages} } customers.routes.ts:131
 │    → rows → <DataTable>  customers/page.tsx:727
 │
 ├─ useResource("/loans",{pageSize:500})              customers/page.tsx:68
 │    → GET /api/loans → requests.view → loans → per-row "Loans" badge  customers/page.tsx:423
 │
 ├─ addCustomer()  customers/page.tsx:279
 │    → api.create("/customers", …)  customers/page.tsx:314
 │    → POST /api/customers  customers.routes.ts:166 → customers.create
 │    → assertBankAccess(payload.bankId)  customers.routes.ts:174
 │    → aadhaar peppered-hashed, never stored plain  customers.routes.ts:78-84, :194
 │    → INSERT customers + audit_logs  → 201 {data}
 │    → refresh() + toast  customers/page.tsx:345-350
 │
 └─ deleteCustomer(id)  customers/page.tsx:251
      → api.remove(`/customers/${id}`)  customers/page.tsx:261
      → DELETE /api/customers/:id  customers.routes.ts:266 → customers.delete
      → softDelete() → recycle_bin_entries + customers.deleted_at → 204
      → refresh() + toast  customers/page.tsx:263-267
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "Add customer" → dialog "Add customer" | `customers/page.tsx:279` → `:314` | **yes** `POST` | `POST /api/customers` (`customers.routes.ts:166`) | **yes** — `customers` + `audit_logs` | **WIRED** |
| Row "Delete" | `customers/page.tsx:251` → `:261` | **yes** `DELETE` | `DELETE /api/customers/:id` (`customers.routes.ts:266`) | **yes** — soft delete + `recycle_bin_entries` | **WIRED** |
| Row "View" | `customers/page.tsx:536-541` | no (router.push with `row.id`) | — | n/a | READ-ONLY |
| Row "Upload Docs" | `customers/page.tsx:549-555` | no | pushes `/documents?customerId=…` | **query string is never read** — `documents/page.tsx` has no `useSearchParams` | **BROKEN** |
| Row click | `customers/page.tsx:767-771` | no (navigation) | — | n/a | READ-ONLY |
| "Import Excel" | `customers/page.tsx:641-643` → `CustomerImportDialog` | **yes** (see §3.19) | `POST /api/imports/customers`, `POST /api/imports/:batchId/confirm` | **yes** | **WIRED** |
| ~~"Draft application"~~ | — | — | — | — | [OK] **REMOVED by Task 4.11 (2026-09-05).** It emitted create-dialog defaults — applicant *"Customer"*, `banks[0]`, INR 45,000 — as a named customer's facts (**D-055**). |
| ~~"Re-upload written form"~~ | — | — | — | — | [OK] **REMOVED by Task 4.4 (2026-09-05).** Control, handler and hidden input deleted together; no file storage exists, so there was nothing honest to wire. |
| DataTable "Export CSV" | `data-table.tsx:128-143` | no — client-side CSV | — | never | LOCAL |
| DataTable search / filters / sort / paging | `data-table.tsx:85-126` | no — filters the already-fetched page in memory | — | n/a | READ-ONLY |
| 4 × StatCard | `customers/page.tsx:686-720` | derived from `rows` | — | reads | READ-ONLY |

**Notes.** The `search` state at `customers/page.tsx:58` is declared with no setter (`const [search] = React.useState("")`) — it is permanently `""`, so the server-side `?search=` parameter is never used; all filtering is the in-memory `DataTable` filter. The "Customer" column renders `row.id` (a raw UUID) as the secondary line (`customers/page.tsx:382-384`).

---

### 3.3 `/customers/[id]` — `src/app/(app)/customers/[id]/page.tsx` (499 lines)

**(a) Chain**

```
CustomerProfilePage
 ├─ useRecord(`/customers/${id}`)   customers/[id]/page.tsx:59
 │    → GET /api/customers/:id      customers.routes.ts:145 → customers.view
 │    → bankScope  customers.routes.ts:149 ; 404 when out of scope OR absent (deliberate, customers.routes.ts:158)
 │    → data → whole page; null → notFound()  customers/[id]/page.tsx:88
 ├─ useResource("/loans",{customerId})        :62  → GET /api/loans?customerId=…   → loans
 ├─ useResource("/documents",{customerId})    :63  → GET /api/documents?customerId=… → documents
 ├─ useResource("/transactions",{customerId}) :68  → GET /api/transactions?customerId=… → transactions
 └─ useResource("/bank-orders")               :73  → GET /api/bank-orders (UNFILTERED, filtered client-side at :90)
```

`customerId`, `loanId` and `customerId` are in the `filterable` allow-lists at `operations.routes.ts:63`, `:390`, `:333`, so those query parameters do reach the SQL (`scoped-resource.ts:115-120`).

**This file issues ZERO write requests.** `api` and `errorMessage` are imported at `customers/[id]/page.tsx:51` and never used; `useStats` is imported at `:50` and never used.

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "Back" | `customers/[id]/page.tsx:112-116` | no | — | n/a | READ-ONLY |
| "Export" | `customers/[id]/page.tsx:119-133` | no — `exportCsv` in browser | — | never | LOCAL |
| "Edit profile" → dialog | `customers/[id]/page.tsx:137` opens; `:428-468` renders | no | — | n/a | — |
| Dialog **"Save changes"** | `customers/[id]/page.tsx` `saveEdit` -> `api.update` | **yes** `PATCH` | `PATCH /api/customers/:id` | **yes** — `customers` + `audit_logs` | [OK] **WIRED by Task 4.1 (2026-09-05).** Changed fields only; Aadhaar excluded by construction (**D-052**). |
| Edit-dialog inputs | `customers/[id]/page.tsx` — four controlled inputs bound to `editForm` | n/a | — | via Save | [OK] **CONTROLLED by Task 4.1.** |
| "Delete customer" → dialog | `customers/[id]/page.tsx:423` opens; `:470-496` renders | no | — | n/a | — |
| Dialog **"Delete"** | `customers/[id]/page.tsx` `confirmDelete` -> `api.remove` | **yes** `DELETE` | `DELETE /api/customers/:id` | **yes** — soft delete + `recycle_bin_entries` | [OK] **WIRED by Task 4.2 (2026-09-05).** Gated on `can("customers.delete")`; navigates on 204. |
| **"Print"** | `customers/[id]/page.tsx:182-188` — `toast.info("Sent to printer", "Profile sheet queued.")` at `:185` | **no** | none exists; no printing occurs | **never** | **FAKE** |
| "Documents" (card) | `customers/[id]/page.tsx:177-181` | no (navigation) | — | n/a | READ-ONLY |
| "Upload" (Documents tab) | `customers/[id]/page.tsx:316-320` | no (navigation) | — | n/a | READ-ONLY |
| Loans / Documents / Transactions tables | `:269-307`, `:324-358`, `:364-398` | via `useResource` | `GET /api/loans`, `/documents`, `/transactions` | reads | READ-ONLY |
| Timeline | `customers/[id]/page.tsx` `useCustomerTimeline` -> `api.list` | **yes** `GET` | `GET /api/audit-logs?recordType=customer&recordId=...` | reads | [OK] **WIRED by Task 4.3 (2026-09-05).** Field **names** only, never values (**SEC-017**); roles without `audit_logs.view` get an honest permission state, the grant was **not** widened (**D-049**). |

**Notes.**
- `customers/[id]/page.tsx:344` renders `doc.uploadedBy`, which is a `uuid` FK (`operations.ts:375`) and is **never written** — the documents `createSchema` (`operations.routes.ts:391-402`) has no `uploadedBy` field. The column is permanently blank.
- `customers/[id]/page.tsx:107` and `:153` display `customer.id` (a raw UUID) as the customer's visible identifier, not `customer.code`.

---

### 3.4 `/loans` — `src/app/(app)/loans/page.tsx` (415 lines)

**(a) Chain**

```
LoansPage
 ├─ useResource("/customers",{pageSize:500})  loans/page.tsx:48 → GET /api/customers → customers.view
 ├─ useResource("/loans")                     loans/page.tsx:51
 │    → GET /api/loans  scoped-resource.ts:102 (loansRouter, operations.routes.ts:50)
 │    → requests.view → bankScope(loans.bankId) → loans
 │    → { data, meta:{…,scoped} } → <DataTable>  loans/page.tsx:232
 └─ createLoan()  loans/page.tsx:76
      → api.create("/loans", …)  loans/page.tsx:83
      → POST /api/loans  scoped-resource.ts:170 → requests.create
      → assertBankAccess(parsed.bankId)  scoped-resource.ts:177
      → beforeWrite: assertSameBank(customer, bankId)  operations.routes.ts:96-99
      → code = "LN-<n>"  scoped-resource.ts:87-91
      → INSERT loans + audit_logs → 201 {data}
      → setOpen(false)  ← WRONG STATE VARIABLE (see below)
      → refresh() + toast  loans/page.tsx:96-97
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "New application" → dialog | `loans/page.tsx:197` sets `createOpen`; dialog at `:316` reads `createOpen` | no | — | n/a | — |
| Dialog "Submit to bank" | `loans/page.tsx:409` → `createLoan()` `:76` → `api.create` `:83` | **yes** `POST` | `POST /api/loans` (`scoped-resource.ts:170`) | **yes** — `loans` + `audit_logs` | **WIRED** (dialog fails to close — see below) |
| Dialog close-on-success | `loans/page.tsx:95` calls `setOpen(false)`; the dialog's `open` prop is `createOpen` (`:316`) | — | — | — | **BROKEN** — the loan is created, the dialog stays open, and a second click creates a duplicate |
| Row click → detail dialog | `loans/page.tsx:255` | no | — | n/a | READ-ONLY |
| Detail dialog **"Approve"** | `loans/page.tsx:306` → `updateStatus(selected,"Approved")` at `:68` — calls `refresh()`, mutates `selected` in state, toasts | **no** | `POST /api/loans/:id/approve` exists (`scoped-resource.ts:271`, guard `requests.approve`) and is **never called** | **never** | **FAKE** |
| Detail dialog **"Reject"** | `loans/page.tsx:303` → `updateStatus(selected,"Rejected")` at `:68` | **no** | same as above | **never** | **FAKE** |
| "Open customer" | `loans/page.tsx:299-301` | no (navigation) | — | n/a | READ-ONLY |
| "Bank orders" | `loans/page.tsx:194-196` | no (navigation) | — | n/a | READ-ONLY |
| Bank picker in create dialog | `loans/page.tsx:345` sets `form.bankId` | — | the payload sends `customer.bankId` (`loans/page.tsx:87`), not `form.bankId` | — | **MISSING** — the control has no effect on the request |
| DataTable export / search / filters | `data-table.tsx:128`, `:85` | no | — | n/a | LOCAL / READ-ONLY |

**Note.** `updateStatus` calls `refresh()` (`loans/page.tsx:69`), which re-fetches the list from the server. The optimistic local mutation on `selected` therefore survives only until the dialog is closed and reopened; the row in the table reverts to its true server status immediately.

---

### 3.5 `/bank-orders` — `src/app/(app)/bank-orders/page.tsx` (329 lines)

**(a) Chain**

```
BankOrdersPage
 ├─ useResource("/customers",{500})  bank-orders/page.tsx:49 → GET /api/customers → customers
 ├─ useResource("/loans",{500})      bank-orders/page.tsx:52 → GET /api/loans     → loans
 └─ useResource("/bank-orders")      bank-orders/page.tsx:54
      → GET /api/bank-orders  scoped-resource.ts:102 (bankOrdersRouter, operations.routes.ts:215)
      → bank_orders.view → bankScope(bank_orders.bank_id) → bank_orders
      → rows → stage board (:144) + <DataTable> (:229)

WRITE PATH: none. This file makes ZERO write calls.
`api` and `errorMessage` are imported at bank-orders/page.tsx:35 and never used.
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "Submit new file" | `bank-orders/page.tsx:156-160` | no (navigation to `/loans`) | — | n/a | READ-ONLY |
| Stage-board card click | `bank-orders/page.tsx:209` | no | — | n/a | READ-ONLY |
| Row click → dialog | `bank-orders/page.tsx:252` | no | — | n/a | READ-ONLY |
| Dialog **"Move to stage"** select | `bank-orders/page.tsx:302` → `moveStage()` at `:58` — `refresh()` + local `setSelected` + toast `"Stage updated"` | **no** | `PATCH /api/bank-orders/:id` exists (`scoped-resource.ts:205`, guard `bank_orders.edit`) and is **never called** | **never** | **FAKE** |
| Dialog **"Save remark"** | `bank-orders/page.tsx:321` → `saveRemark()` at `:64` — `refresh()` + local `setSelected` + toast `"Remark saved to the file trail"` | **no** | `PATCH /api/bank-orders/:id` — **never called** | **never** | **FAKE** |
| "Add remark" textarea | `bank-orders/page.tsx:290-295` | no | — | never | **FAKE** (feeds only the fake handler) |
| "Open customer" | `bank-orders/page.tsx:318-320` | no (navigation) | — | n/a | READ-ONLY |
| DataTable export / search / filters | `data-table.tsx` | no | — | n/a | LOCAL / READ-ONLY |

**Note.** Because both write handlers call `refresh()`, the toast fires and the board *re-renders with the unchanged server data*. The stage a user "moved" a file to snaps back the moment the dialog closes.

---

### 3.6 `/disbursement` — `src/app/(app)/disbursement/page.tsx` (356 lines)

**(a) Chain**

```
DisbursementPage
 ├─ useResource("/customers",{500})   disbursement/page.tsx:39
 ├─ useResource("/loans",{500})       disbursement/page.tsx:42
 ├─ useResource("/disbursements")     disbursement/page.tsx:43
 │    → GET /api/disbursements  scoped-resource.ts:102 (operations.routes.ts:248)
 │    → disbursements.view → bankScope → disbursements
 └─ recordDisbursal()  disbursement/page.tsx:56
      → api.create("/disbursements", …)  disbursement/page.tsx:63
      → POST /api/disbursements  scoped-resource.ts:170 → disbursements.create
      → assertBankAccess + beforeWrite assertSameBank(loan, customer)  operations.routes.ts:276-280
      → code = "DSB-<n>"  → INSERT disbursements + audit_logs → 201
      → setOpen(false); refresh(); toast   disbursement/page.tsx:73-75
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "Record disbursal" → dialog "Save disbursal" | `disbursement/page.tsx:350` → `recordDisbursal()` `:56` → `:63` | **yes** `POST` | `POST /api/disbursements` (`scoped-resource.ts:170`) | **yes** — `disbursements` + `audit_logs` | **WIRED** |
| Detail dialog **"Mark credited"** | `disbursement/page.tsx:267` → `markCredited()` at `:81` — `refresh()` + local state + toast `"Marked as credited"` | **no** | `POST /api/disbursements/:id/approve` exists (`scoped-resource.ts:271`, guard `disbursements.approve`) and `PATCH /api/disbursements/:id` exists — **neither is called** | **never** | **FAKE** |
| Detail dialog **"Re-initiate"** | `disbursement/page.tsx:260` → `retry()` at `:87` — `refresh()` + local state + toast `"Re-initiated · Transfer resubmitted with corrected beneficiary."` | **no** | same as above — **never called** | **never** | **FAKE** |
| Row click | `disbursement/page.tsx:234` | no | — | n/a | READ-ONLY |
| "Open customer" | `disbursement/page.tsx:256-258` | no | — | n/a | READ-ONLY |
| 4 × StatCard | `disbursement/page.tsx:176-208` | derived | — | reads | READ-ONLY |

**Note.** "Average ticket" (`disbursement/page.tsx:201-204`) divides by `rows.length`. On an empty result set this is `0/0 = NaN`, which is then passed to `formatCurrency`.

---

### 3.7 `/transactions` — `src/app/(app)/transactions/page.tsx` (231 lines)

**(a) Chain**

```
TransactionsPage
 ├─ useResource("/customers",{500})  transactions/page.tsx:30
 └─ useResource("/transactions")     transactions/page.tsx:33
      → GET /api/transactions  scoped-resource.ts:102 (operations.routes.ts:321)
      → transactions.view → bankScope → transactions, ORDER BY occurred_at DESC (operations.routes.ts:331)

WRITE PATH: none. `api` / `errorMessage` imported at transactions/page.tsx:24, never used.
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| Row click → dialog | `transactions/page.tsx:187` | no | — | n/a | READ-ONLY |
| Dialog **"Mark successful"** | `transactions/page.tsx:220` → `settle()` at `:36` — `refresh()` + local state + toast `"Transaction settled"` | **no** | `PATCH /api/transactions/:id` exists (`scoped-resource.ts:205`, guard `transactions.edit`) — **never called** | **never** | **FAKE** |
| "Open customer" | `transactions/page.tsx:214-216` | no | — | n/a | READ-ONLY |
| DataTable / StatCards | `data-table.tsx`, `transactions/page.tsx:127-156` | no / derived | — | n/a | LOCAL / READ-ONLY |
| Create a transaction | — | — | `POST /api/transactions` exists (`scoped-resource.ts:170`) | — | **MISSING** — no UI control anywhere in the app creates a transaction |

---

### 3.8 `/settlements` — `src/app/(app)/settlements/page.tsx` (285 lines)

**(a) Chain**

```
SettlementsPage
 └─ useResource("/settlements")  settlements/page.tsx:32
      → GET /api/settlements  scoped-resource.ts:102 (operations.routes.ts:283)
      → settlements.view → bankScope → settlements
      → rows → StatCards (:152-182), per-bank progress (:190-212), <DataTable> (:215)

WRITE PATH: none. `api` / `errorMessage` imported at settlements/page.tsx:26, never used.
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "Export to Tally" | `settlements/page.tsx:133-144` — `exportTallyXml` in browser | no | — | never | LOCAL |
| Row click → dialog | `settlements/page.tsx:241` | no | — | n/a | READ-ONLY |
| Dialog **"Mark paid"** | `settlements/page.tsx:274` → `markPaid()` at `:35` — computes `settledOn` locally, `refresh()`, local state, toast `"Settlement closed"` | **no** | `POST /api/settlements/:id/approve` exists (`scoped-resource.ts:271`, guard `settlements.approve`) — **never called** | **never** | **FAKE** |
| Dialog **"Raise dispute"** | `settlements/page.tsx:268` → `raiseDispute()` at `:44` — toast `"Dispute raised · Query sent to … SPOC."` | **no** | `PATCH /api/settlements/:id` / approve route — **never called**. No message is sent to anyone: there is no email or messaging subsystem in this repository. | **never** | **FAKE** |
| Create a settlement | — | — | `POST /api/settlements` exists (`scoped-resource.ts:170`) with the `gross − tds = net` guard at `operations.routes.ts:310-318` | — | **MISSING** — no UI raises an invoice |

**Note.** The "Period" filter offers the hardcoded literals `["May 2024","April 2024"]` (`settlements/page.tsx:237`), not the distinct periods present in the data.

---

### 3.9 `/ledger` — `src/app/(app)/ledger/page.tsx` (359 lines)

**(a) Chain**

```
LedgerPage
 ├─ useResource("/ledger")  ledger/page.tsx:46
 │    → GET /api/ledger  scoped-resource.ts:102 (operations.routes.ts:351)
 │    → ledger.view → bankScope(ledger_entries.bank_id) → ledger_entries, ORDER BY entry_date DESC
 └─ addEntry()  ledger/page.tsx:57
      → api.create("/ledger", …)  ledger/page.tsx:63
      → POST /api/ledger  scoped-resource.ts:170 → ledger.create
      → assertBankAccess(parsed.bankId)  scoped-resource.ts:177   ← payload has NO bankId
      → INSERT ledger_entries (bank_id NULL) + audit_logs → 201
      → setOpen(false); refresh(); toast  ledger/page.tsx:72-74
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "New voucher" → dialog "Post voucher" | `ledger/page.tsx:353` → `addEntry()` `:57` → `:63` | **yes** `POST` | `POST /api/ledger` (`scoped-resource.ts:170`) | **yes for an unscoped caller**; see below | **BROKEN** for every scoped caller |
| "Export to Tally" | `ledger/page.tsx:163-174` | no | — | never | LOCAL |
| DataTable / category split / StatCards | `ledger/page.tsx:80-148`, `:223-238`, `:186-215` | derived | — | reads | READ-ONLY |
| Edit a voucher | — | — | `PATCH /api/ledger/:id` exists (`scoped-resource.ts:205`) | — | **MISSING** |

**Why BROKEN — two independent failures on the same button:**

1. **403 for anyone below Admin.** `ledger.create` is granted only to `super_admin` (`permissions.ts:197`) and `admin` (`permissions.ts:217`, via `flat(PERMISSIONS.ledger)`). `manager` has `ledger.view` but **not** `ledger.create` (`permissions.ts:255`). `team_leader` and `executive` have neither. The "New voucher" button is rendered unconditionally at `ledger/page.tsx:178` with no `can()` gate, so a Manager sees the button, fills the form, and receives `403 Missing required permission: ledger.create` as a toast.
2. **Invisible-on-success for a scoped caller.** The payload at `ledger/page.tsx:63-71` contains no `bankId`. The `createSchema` makes it optional (`operations.routes.ts:366`), and `assertBankAccess(ctx, undefined)` returns early for an unscoped caller (`access.ts:122`). The row is inserted with `bank_id = NULL`. On the next read, `bankScope` renders `bank_id IN (…)` (`access.ts:110`), and `NULL IN (…)` is never true in SQL — so a bank-scoped user who somehow held `ledger.create` would post a voucher that vanishes from their own ledger. Only a holder of `system.access_all_banks` (`bankScope` returns `undefined`, `access.ts:109`) can see it.

---

### 3.10 `/documents` — `src/app/(app)/documents/page.tsx` (403 lines)

**(a) Chain**

```
DocumentsPage
 ├─ useResource("/customers",{500})  documents/page.tsx:49
 ├─ useResource("/documents")        documents/page.tsx:52
 │    → GET /api/documents  scoped-resource.ts:102 (operations.routes.ts:380)
 │    → documents.view → bankScope → documents
 └─ upload()  documents/page.tsx:70
      → for each staged File: api.create("/documents", {customerId,bankId,docType,
                                fileName,fileSize,mimeType,status})  documents/page.tsx:81-89
      → POST /api/documents  scoped-resource.ts:170 → documents.upload
      → INSERT documents + audit_logs → 201
      → setStaged([]); setOpen(false); refresh(); toast  documents/page.tsx:91-96
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "Upload documents" → dialog "Upload" | `documents/page.tsx:397` → `upload()` `:70` → `:81` | **yes** `POST` per file | `POST /api/documents` (`scoped-resource.ts:170`) | **metadata only** — `documents` row + `audit_logs` | **WIRED (metadata)** / **MISSING (bytes)** |
| File drop zone / "Choose files" | `documents/page.tsx:337-368` | no — files land in `staged` state | — | the `File` objects are read for `.name`, `.size`, `.type` at `:85-87` and then **discarded**; no multipart request is ever built | **MISSING** — there is no file-storage subsystem in this repository; `documents.storage_key` (`operations.ts:371`) is never written by any code path |
| Row **"Verify"** | `documents/page.tsx:193` → `setStatus(row,"Verified")` at `:104` — `refresh()` + toast | **no** | `PATCH /api/documents/:id` exists (`scoped-resource.ts:205`, guard `documents.upload`) — **never called** | **never** | **FAKE** |
| Row **"Delete"** | `documents/page.tsx:197` → `remove(row)` at `:109` — `refresh()` + toast `"Document removed"` | **no** | `DELETE /api/documents/:id` exists (`scoped-resource.ts:251`, guard `documents.delete`) — **never called** | **never** | **FAKE** |
| Row **"Preview"** | `documents/page.tsx:177` — `toast.info("Preview", "… opened in viewer.")` | **no** | none exists | **never** | **FAKE** |
| Row **"Download"** | `documents/page.tsx:185` — `toast.success("Download started")` | **no** | none exists; no bytes are stored to download | **never** | **FAKE** |
| `?customerId=` from `/customers` | — | — | the page never calls `useSearchParams` | — | **BROKEN** — the deep link from `customers/page.tsx:553` is silently ignored |
| "By" column | `documents/page.tsx:159` renders `row.uploadedBy` | — | `uploadedBy` is a `uuid` column (`operations.ts:375`) absent from the create schema (`operations.routes.ts:391-402`) | never written | **BROKEN** — permanently blank |
| `progress` bar | `documents/page.tsx:391` | — | `progress` is initialised `0` at `:57` and never set | never renders | dead code |

**Note.** "Verified %" (`documents/page.tsx:230`) divides by `rows.length`; on an empty vault this renders `NaN%`.

---

### 3.11 `/banks` — `src/app/(app)/banks/page.tsx` (342 lines)

**(a) Chain**

```
BanksPage
 ├─ useResource("/banks")             banks/page.tsx:35
 │    → GET /api/banks  banks.routes.ts:33 → banks.view → bankScope(banks.id) → banks
 ├─ useResource("/loans",{500})       banks/page.tsx:36
 ├─ useResource("/settlements",{500}) banks/page.tsx:37
 ├─ addBank()  banks/page.tsx:63
 │    → api.create("/banks", …)  banks/page.tsx:69
 │    → POST /api/banks  banks.routes.ts:73 → banks.create → INSERT banks + audit_logs → 201
 │    → refresh() + refreshReference() + toast  banks/page.tsx:86-88
 └─ toggleStatus(bank)  banks/page.tsx:94
      → api.update(`/banks/${id}`, {status})  banks/page.tsx:97
      → PATCH /api/banks/:id  banks.routes.ts:104 → banks.edit → assertBankAccess(id) banks.routes.ts:108
      → UPDATE banks + audit_logs with diff → 200
      → refresh() + refreshReference() + toast  banks/page.tsx:99-101
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "Onboard bank" → dialog "Onboard bank" | `banks/page.tsx:336` → `addBank()` `:63` → `:69` | **yes** `POST` | `POST /api/banks` (`banks.routes.ts:73`) | **yes** — `banks` + `audit_logs` | **WIRED** |
| Detail dialog "Pause lender" / "Resume lender" | `banks/page.tsx:258` → `toggleStatus()` `:94` → `:97` | **yes** `PATCH` | `PATCH /api/banks/:id` (`banks.routes.ts:104`) | **yes** — `banks.status` + `audit_logs` diff | **WIRED** |
| Card "Details" | `banks/page.tsx:205` | no | — | n/a | READ-ONLY |
| Card / dialog "Portal" link | `banks/page.tsx:209`, `:252` | no — external `<a href>` | — | n/a | LOCAL |
| "Full report" | `banks/page.tsx:223-225` | no (navigation) | — | n/a | READ-ONLY |
| Delete a bank | — | — | `DELETE /api/banks/:id` exists (`banks.routes.ts:145`, guard `banks.delete`) | — | **MISSING** — no UI control |
| Edit any field other than `status` | — | — | `PATCH /api/banks/:id` accepts the full `bankInput` (`banks.routes.ts:16-31`) | — | **MISSING** — only `status` is ever sent |

**Note.** "Average slab" (`banks/page.tsx:139`) divides by `rows.length`; with no banks it renders `NaN%`.

---

### 3.12 `/employees` — `src/app/(app)/employees/page.tsx` (691 lines, **working tree**)

This page differs substantially between `HEAD` and the working tree. **Both are documented.**

**(a) Chain — working tree**

```
EmployeesPage
 ├─ useResource("/users",{pageSize:200})  employees/page.tsx:91
 │    → GET /api/users  admin.routes.ts:85 → users.view
 │    → scoped by shared bank via EXISTS on user_bank_access  admin.routes.ts:101-108
 │    → users ⋈ roles, + assignedBanks[] from user_bank_access  admin.routes.ts:139-151
 │    → password_hash is never selected (admin.routes.ts:147)
 ├─ useResource("/customers",{500})       employees/page.tsx:92
 ├─ useResource("/loans",{500})           employees/page.tsx:93
 ├─ useResource("/roles")                 employees/page.tsx:94
 │    → GET /api/roles  admin.routes.ts:476 → roles.view → roles + role_permissions ⋈ permissions
 │    → assignableRoles filtered to level > user.role.level  employees/page.tsx:110-114
 │
 ├─ addEmployee()  employees/page.tsx:146
 │    → apiRequest("/users",{POST})  employees/page.tsx:158
 │    → POST /api/users  admin.routes.ts:159 → users.create
 │    → assertCanAssignRole (hierarchy)   admin.routes.ts:168 → access.ts:151-159
 │    → assertBankAccess per bankId       admin.routes.ts:171
 │    → assertPermission(teams.assign) if teamId  admin.routes.ts:177
 │    → generateTemporaryPassword() → argon2id hash  admin.routes.ts:186, :200
 │    → TX: INSERT users(mustChangePassword:true) + user_bank_access + team_members + audit_logs
 │    → 201 { data:{id,name,email}, temporaryPassword }  admin.routes.ts:241-245
 │    → setCredential(...) → <CredentialHandover>  employees/page.tsx:177-183, :520
 │
 ├─ resetPassword(employee)  employees/page.tsx:197
 │    → apiRequest(`/users/${id}/reset-password`,{POST})  employees/page.tsx:199
 │    → POST /api/users/:id/reset-password  admin.routes.ts:328 → users.reset_password
 │    → assertCanManageRoleLevel  admin.routes.ts:340
 │    → TX: UPDATE users(passwordHash, mustChangePassword:true, failedLoginAttempts:0,
 │          lockedUntil:null) + REVOKE all refresh_tokens + audit_logs  admin.routes.ts:344-371
 │    → 200 { data, temporaryPassword }  → <CredentialHandover>
 │
 └─ toggleStatus(employee)  employees/page.tsx:219
      → apiRequest(`/users/${id}`,{PATCH,body:{status}})  employees/page.tsx:222
      → PATCH /api/users/:id  admin.routes.ts:251 → users.edit
      → assertCanManageRoleLevel(target.roleLevel)  admin.routes.ts:261
      → UPDATE users.status + audit_logs diff → 200
```

**(b) Controls — working tree**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "Add employee" (gated on `can("users.create")`) | `employees/page.tsx:338-342` | no | — | n/a | — |
| Dialog "Create employee" | `employees/page.tsx:681` → `addEmployee()` `:146` → `:158` | **yes** `POST` | `POST /api/users` (`admin.routes.ts:159`) | **yes** — `users`, `user_bank_access`, `team_members`, `audit_logs`, all in one transaction (`admin.routes.ts:192`) | **WIRED** |
| Bank-access checkboxes | `employees/page.tsx:660-663` → `toggleBank()` `:137` | via the create payload `bankIds` (`:169`) | `INSERT user_bank_access` (`admin.routes.ts:214-218`) | **yes** | **WIRED** |
| Team select | `employees/page.tsx:614-629` | via the create payload `teamId` (`:170`) | `INSERT team_members` (`admin.routes.ts:220-224`) | **yes** | **WIRED** |
| Role select | `employees/page.tsx:589-603`; options filtered by `assignableRoles` `:110` | via the create payload `roleId` | `assertCanAssignRole` (`admin.routes.ts:168`) | **yes** | **WIRED** |
| Credential hand-over panel | `credential-handover.tsx:80-110`; copy at `:42-53` | no — reads the value already in the response | — | n/a | READ-ONLY (the plaintext exists only here — `admin.routes.ts:243-244`) |
| Detail dialog "Reset password" (gated on `can("users.reset_password")`) | `employees/page.tsx:485` → `resetPassword()` `:197` → `:199` | **yes** `POST` | `POST /api/users/:id/reset-password` (`admin.routes.ts:328`) | **yes** — new hash, `mustChangePassword`, lockout cleared, **all refresh tokens revoked** | **WIRED** |
| Detail dialog "Revoke / Restore access" (gated on `can("users.edit")`) | `employees/page.tsx:492-497` → `toggleStatus()` `:219` → `:222` | **yes** `PATCH` | `PATCH /api/users/:id` (`admin.routes.ts:251`) | **yes** — `users.status` + `audit_logs` | **WIRED** |
| "Roles" panel | `employees/page.tsx:399-411` | via `useResource("/roles")` | `GET /api/roles` | reads | READ-ONLY |
| Assign banks after creation | — | — | `PUT /api/users/:id/banks` exists (`admin.routes.ts:386`, guard `users.assign`) | — | **MISSING** — no UI |
| Delete an employee | — | — | `DELETE /api/users/:id` exists (`admin.routes.ts:434`, guard `users.delete`, with the last-super-admin guard at `:444-451`) | — | **MISSING** — no UI |
| Edit name / email / role / target after creation | — | — | `PATCH /api/users/:id` accepts the full `userInput` (`admin.routes.ts:41-57`) | — | **MISSING** — only `status` is ever sent |

**(b′) Controls — `HEAD` version of the same page (for the record)**

| Control | Handler at HEAD | Verdict at HEAD |
|---|---|---|
| Dialog "Add" | `api.create("/users", …)`, employee code generated as `EMP-${Date.now().slice(-6)}` (HEAD `employees/page.tsx:81-90`) | WIRED, but no bank/team assignment and no credential returned to the admin |
| "Revoke / Restore access" | `toggleStatus` at HEAD `employees/page.tsx:101` — `refresh()` + local state + toast, **no request** | **FAKE** |
| **"Send password reset"** | HEAD `employees/page.tsx:318` — `toast.info("Reset link sent", "Emailed to …")` | **FAKE** — and doubly so: **no email subsystem exists anywhere in this repository** (zero provider dependencies, zero transport code, zero templates, zero `EMAIL_`/`SMTP_`/`MAIL_` environment variables) |
| Permission switches | HEAD `employees/page.tsx:251-252` — `toast.success("Permission granted"/"Permission revoked")` | **FAKE** — `PUT /api/roles/:id/permissions` (`admin.routes.ts:614`) exists and is never called |

---

### 3.13 `/notifications` — `src/app/(app)/notifications/page.tsx` (158 lines)

**(a) Chain**

```
NotificationsPage
 └─ useResource("/notifications")  notifications/page.tsx:72
      → GET /api/notifications  admin.routes.ts:955  (requireAuth only, NO permission guard)
      → WHERE notifications.user_id = ctx.userId  admin.routes.ts:961
      → { data, meta:{total,unread} }  admin.routes.ts:965-968
      → rows  ─────X──→  const [items] = useState(rows)   notifications/page.tsx:74
                          ↑ the fetched rows never reach the UI (see below)
      → items → <AlertList>  notifications/page.tsx:127
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| Alert list | `notifications/page.tsx:127`, `:130`, `:133` — reads `items`, not `rows` | the GET happens; its result is thrown away | `GET /api/notifications` | reads | **BROKEN** — see below |
| **"Mark all read"** | `notifications/page.tsx:101` → `markAll()` `:76` — `setItems(prev => …read:true)` + toast `"All caught up"` | **no** | `POST /api/notifications/read-all` exists (`admin.routes.ts:974`) — **never called** | **never** | **FAKE** |
| **"Mark read" / "Mark unread"** per row | `notifications/page.tsx:62` → `toggle(id)` `:81` — local `setItems` | **no** | `POST /api/notifications/:id/read` exists (`admin.routes.ts:987`) — **never called** | **never** | **FAKE** |
| "Alert settings" | `notifications/page.tsx:98-100` | no (navigation) | — | n/a | READ-ONLY |
| "Team activity" panel | `notifications/page.tsx:143-153` — fed by `const activity: ActivityItem[] = []` at `:73` | **no** | `GET /api/audit-logs` exists (`admin.routes.ts:902`) — never called | never | **MISSING** |
| `refresh` | destructured at `:72`, never invoked anywhere in the file | — | — | — | dead |

**Why BROKEN.** `notifications/page.tsx:74` reads:

```ts
const [items, setItems] = React.useState<NotificationItem[]>(rows);
```

`useState` uses its argument **only on the first render**. On that render `rows` is `[]` (`use-api.ts:24`), because the fetch has not resolved. When it does resolve, `rows` updates but `items` does not — there is no `useEffect` synchronising them. The page therefore renders "Nothing to read here" (`notifications/page.tsx:36-42`) permanently, however many notification rows exist for the user.

**Compounding fact.** The page cannot be tested against real data anyway: `grep insert(notifications)` across `backend/src/` returns **zero** hits. Nothing in the system ever creates a notification row. The `notifications` table, its three endpoints, and this page are a complete but never-exercised loop. The unread badge in the topbar (`topbar.tsx:86`) is therefore always `0`.

---

### 3.14 `/recycle-bin` — `src/app/(app)/recycle-bin/page.tsx` (223 lines)

**(a) Chain**

```
RecycleBinPage
 ├─ useResource("/recycle-bin")  recycle-bin/page.tsx:43
 │    → GET /api/recycle-bin  admin.routes.ts:809 → recycle_bin.view
 │    → WHERE restored_at IS NULL AND purged_at IS NULL + bankScope  admin.routes.ts:812-816
 │    → recycle_bin_entries, snapshot stripped, daysRemaining computed  admin.routes.ts:826-834
 ├─ restore(entry)  recycle-bin/page.tsx:47
 │    → api.action(`/recycle-bin/${id}/restore`)  recycle-bin/page.tsx:50
 │    → POST /api/recycle-bin/:id/restore  admin.routes.ts:841 → recycle_bin.restore
 │    → assertBankAccess(entry.bankId)  admin.routes.ts:854
 │    → restore() → clears deleted_at on the target table + marks the entry restored
 └─ confirmPurge()  recycle-bin/page.tsx:65
      → api.action(`/recycle-bin/${id}/permanent-delete`, {confirm:true})  recycle-bin/page.tsx:69
      → POST /api/recycle-bin/:id/permanent-delete  admin.routes.ts:869 → recycle_bin.permanent_delete
      → z.literal(true) on `confirm`  admin.routes.ts:876
      → permanentDelete() → hard DELETE + entry marked purged
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| Row "Restore" (gated on `can("recycle_bin.restore")`) | `recycle-bin/page.tsx:138-141` → `restore()` `:47` → `:50` | **yes** `POST` | `POST /api/recycle-bin/:id/restore` (`admin.routes.ts:841`) | **yes** — target row un-deleted, entry marked restored, `audit_logs` | **WIRED** |
| Row "Delete" (gated on `can("recycle_bin.permanent_delete")`) | `recycle-bin/page.tsx:152-154` opens the confirm dialog | no | — | n/a | — |
| Confirm dialog "Yes" | `recycle-bin/page.tsx:213` → `confirmPurge()` `:65` → `:69` | **yes** `POST` | `POST /api/recycle-bin/:id/permanent-delete` (`admin.routes.ts:869`) | **yes** — irreversible hard delete | **WIRED** |
| Confirm dialog "No" | `recycle-bin/page.tsx:208` | no | — | n/a | READ-ONLY |
| Error banner | `recycle-bin/page.tsx:173-177` | — | — | — | **This is one of only two pages that render `error` at all** |
| Empty state | `recycle-bin/page.tsx:179-184` — gated on `!loading` | — | — | — | correct |

This is the **best-integrated page in the application**: both write paths are real, both are permission-gated in the UI *and* on the server, `loading` and `error` are both rendered, and the destructive action requires an explicit `confirm: true` flag on the wire.

---

### 3.15 `/reports` — `src/app/(app)/reports/page.tsx` (355 lines)

**(a) Chain**

```
ReportsPage
 ├─ useResource("/customers",{500})  reports/page.tsx:40 → GET /api/customers → customers
 ├─ useResource("/loans",{500})      reports/page.tsx:43 → GET /api/loans     → loans
 └─ rows = useMemo(() => loans.filter(…), [from,to,bank,employee,status,applied])  reports/page.tsx:58-67
                                              ↑ `loans` is NOT in the dependency array (:67)
      → rows → StatCards (:232-256), report table (:325-342), all four export buttons
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| From / To date inputs | `reports/page.tsx:162`, `:166` | no — client-side string comparison at `:60` | — | n/a | **BROKEN** (see below) |
| Bank / Employee / Status selects | `reports/page.tsx:170`, `:186`, `:202` | no — in-memory filter | — | n/a | READ-ONLY |
| "Apply" | `reports/page.tsx:219-227` — bumps `applied`, toasts `"${rows.length} records matched"` using the **pre-recompute** `rows` | no | — | n/a | **BROKEN** — the count in the toast is one render stale |
| "Reset" | `reports/page.tsx:126-134` — restores the hardcoded 2024 defaults | no | — | n/a | READ-ONLY |
| "Excel" | `reports/page.tsx:81-92` — builds an HTML `<table>` served as `application/vnd.ms-excel` | no | — | never | LOCAL |
| "CSV" | `reports/page.tsx:280-283` — `exportCsv` | no | — | never | LOCAL |
| "PDF" | `reports/page.tsx:94-124` — `window.open` + `win.print()` | no | — | never | LOCAL |
| "Tally XML" | `reports/page.tsx:292-303` — `exportTallyXml` | no | — | never | LOCAL |
| "Volume trend" chart | `reports/page.tsx:261` — fed by `monthlyTrend = []` at `:49` | **no** | none exists | never | **MISSING** |
| "Status mix" chart | `reports/page.tsx:264` → `loanStatusBreakdown()` `:44` over `loans` | via `useResource` | `GET /api/loans` | reads | READ-ONLY |
| Report table | `reports/page.tsx:325-342` | via `rows` | — | reads | **BROKEN** (see below) |

**Why BROKEN — three separate defects on the same table:**

1. **Stale `useMemo`.** `reports/page.tsx:58-67` filters `loans`, but `loans` is absent from the dependency array at `:67`, suppressed by an explicit `// eslint-disable-next-line react-hooks/exhaustive-deps` at `:66`. On first render `loans` is `[]`, so `rows` is `[]`. When `GET /api/loans` resolves, the memo does **not** recompute. The report renders "Nothing matched this range" until the user changes a filter, which is the only thing that invalidates the memo.
2. **Hardcoded 2024 date window.** The defaults are `from = "2024-01-05"` and `to = "2024-05-31"` (`reports/page.tsx:51-52`). Any record created after 2024-05-31 is filtered out on arrival. On a live database in 2026 the default report is empty even after the memo is forced to recompute.
3. **Off-by-one on the upper bound.** `reports/page.tsx:60` compares `loan.appliedOn ?? loan.createdAt` — a full ISO timestamp such as `"2024-05-31T10:00:00.000Z"` — against the date-only string `"2024-05-31"` with `<=`. Lexicographically `"2024-05-31T…" > "2024-05-31"`, so every record on the final day of the selected range is excluded.

---

### 3.16 `/settings` — `src/app/(app)/settings/page.tsx` (1048 lines, **working tree**)

**(a) Chain**

```
SettingsPage
 ├─ useReference().banks   settings/page.tsx:107 → GET /api/banks (already loaded by the provider)
 ├─ useAuth() user         settings/page.tsx:108 → the profile from POST /auth/refresh
 ├─ saveProfile()  settings/page.tsx:229
 │    → updateUser(nextUser)  settings/page.tsx:246  → use-auth.tsx:238
 │    → persistAuthUser → window.localStorage.setItem("risenext-auth-user", …)  use-auth.tsx:71-74
 │    → NO HTTP REQUEST
 └─ handlePasswordUpdate()  settings/page.tsx:278
      → passwordProblems(newPassword)  password-policy.ts:11  (client mirror)
      → apiRequest("/auth/change-password",{POST, skipAuthRetry:true})  settings/page.tsx:301
      → POST /api/auth/change-password  auth.routes.ts:221 (requireAuth, no permission)
      → verifyPassword(current)  auth.routes.ts:233
      → passwordProblems(new) server-side → 422 on failure  auth.routes.ts:237-238
      → UPDATE users(passwordHash, passwordChangedAt, mustChangePassword:false)  auth.routes.ts:240-248
      → REVOKE every refresh_token for the user  auth.routes.ts:251-254
      → recordAuthEvent("password_changed") → audit_logs  auth.routes.ts:256
      → clearCookie + 204
      → await signOut()  settings/page.tsx:315
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| **Security → "Update password"** | `settings/page.tsx:881` → `handlePasswordUpdate()` `:278` → `:301` | **yes** `POST` | `POST /api/auth/change-password` (`auth.routes.ts:221`) | **yes** — `users.password_hash`, `users.must_change_password`, every `refresh_tokens` row revoked, `audit_logs` | **WIRED** |
| Header **"Save changes"** | `settings/page.tsx:350` → `saveProfile()` `:229` | **no** | `PATCH /api/users/:id` exists (`admin.routes.ts:251`) and accepts `name`, `email`, `phone` — **never called** | **localStorage only** (`use-auth.tsx:71`); lost on sign-out (`use-auth.tsx:230`) | **FAKE** |
| Profile "Change photo" | `settings/page.tsx:405` → `handleAvatarChange()` `:147` | **no** — validates type/size, creates a `blob:` URL for preview | no avatar endpoint exists; `void avatarFile` at `settings/page.tsx:254` explicitly discards the file | **never** | **FAKE** |
| Profile "Remove" photo | `settings/page.tsx:414` → `handleRemoveAvatar()` `:196` | **no** | — | **never** | **FAKE** |
| "Default landing page" select | `settings/page.tsx:468` — `defaultValue`, no handler, never read | **no** | — | **never** | **FAKE** |
| Preferences switches ×3 | `settings/page.tsx:524` — `defaultChecked`, **no `onCheckedChange` at all** | **no** | — | **never** | **FAKE** |
| Company tab — all 7 fields | `settings/page.tsx:545-591`, `:603-614` — every input is `defaultValue`, uncontrolled, never read | **no** | no company/settings endpoint exists. The `app_settings` table exists in the schema but `grep appSettings` outside `db/schema` returns **zero** hits — it is a completely dead table. | **never** | **FAKE** |
| Invoice numbering / TDS rate | `settings/page.tsx:603`, `:611`, `:620` | **no** | same as above | **never** | **FAKE** |
| Bank access → "Logging enabled" switch | `settings/page.tsx:709-721`, handler at `:711` — `toast.success("Logging enabled"/"Logging paused")` | **no** | `PATCH /api/banks/:id` exists (`banks.routes.ts:104`) and *is* correctly used by `/banks` — but **not here** | **never** | **FAKE** |
| Alerts → 5 preference switches | `settings/page.tsx:756-766`, handler at `:758` | **no** | no endpoint exists | **never** | **FAKE** |
| Alerts → delivery-channel switches | `settings/page.tsx:815-819` — no handler | **no** | Email/SMS/WhatsApp channels do not exist anywhere in this repository | **never** | **FAKE** |
| Security → "Active sessions" table | `settings/page.tsx:85-104` — a module-level array of three hardcoded fictional devices | **no** | `refresh_tokens` rows carry `userAgent` and `ipAddress` (`auth.routes.ts:43-44`) but no endpoint exposes them | **never** | **FAKE** |
| Session "Sign out" button | `settings/page.tsx:937-948`, handler at `:941` — `toast.success("Session ended")` | **no** | no session-revocation endpoint exists | **never** | **FAKE** |
| 2FA switch | `settings/page.tsx:972-984`, handler at `:973` — `toast.success("2FA enabled"/"2FA disabled")` | **no** | there is no 2FA implementation anywhere in the codebase | **never** | **FAKE** |
| Danger zone "Request export" | `settings/page.tsx:1011-1018` → `handleExportRequest()` `:329` — `toast.success("Export queued", "You'll get an email when it's ready.")` | **no** | no export job, no queue, and **no email subsystem** | **never** | **FAKE** |
| Danger zone "Reset data" | `settings/page.tsx:1033-1040` → `handleResetData()` `:339` — `window.location.reload()` | **no** | — | **never** | **FAKE** |

**Working tree vs HEAD.** At `HEAD`, `handlePasswordUpdate` was `settings/page.tsx:266-270` — a bare `toast.success("Password updated")` with **no request at all**. The working tree replaces it with the real `POST /auth/change-password` flow, adds the three controlled password inputs (`:845-846`, `:858-859`, `:872-873`), and adds the client-side policy mirror `password-policy.ts`. This is the single largest FAKE→WIRED conversion in the working tree. Every other control on the page remains FAKE in both versions.

---

### 3.17 `/my-work` — `src/app/(app)/my-work/page.tsx` (392 lines)

**(a) Chain**

```
MyWorkPage
 ├─ useResource("/loans",{pageSize:200})       my-work/page.tsx:56 → requests.view    → loans
 ├─ useResource("/customers",{pageSize:500})   my-work/page.tsx:57 → customers.view   → customers
 ├─ useResource("/bank-orders",{pageSize:100}) my-work/page.tsx:58 → bank_orders.view → bank_orders
 ├─ useResource("/documents",{pageSize:100})   my-work/page.tsx:59 → documents.view   → documents
 └─ useResource("/notifications")              my-work/page.tsx:60 → (requireAuth)    → notifications
      All five are bank-scoped server-side. Everything on the page is derived
      in memory from these five lists (my-work/page.tsx:67-72).
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "Customers" / "New application" | `my-work/page.tsx:162-169` | no (navigation) | — | n/a | READ-ONLY |
| 4 × StatCard (each a link) | `my-work/page.tsx:175-208` | derived from the five reads | — | reads | READ-ONLY |
| "Priority queue" DataTable | `my-work/page.tsx:226-256` | via `useResource` | `GET /api/loans` | reads | READ-ONLY |
| Loading state | `my-work/page.tsx:221-224` — **renders `loading`** | — | — | — | correct (one of only two pages that do) |
| "With the lender" list | `my-work/page.tsx:272-308` | via `useResource` | `GET /api/bank-orders` | reads | READ-ONLY |
| "Alerts" list | `my-work/page.tsx:321-345` | via `useResource` | `GET /api/notifications` | reads — **always empty**, nothing ever inserts a notification | READ-ONLY / **MISSING** upstream |
| "Recently added customers" | `my-work/page.tsx:359-381` | via `useResource` | `GET /api/customers` | reads | READ-ONLY |
| Empty states ×3 | `my-work/page.tsx:249-255`, `:303-307`, `:340-344` | — | — | — | correct |

This page is **entirely read-only by design and correct**. It is also unreachable from the standard navigation: `lib/nav.ts:30-66` contains 15 items and `/my-work` is not among them. It is only reachable by URL, or as `DEMO_HOME` (`lib/demo/config.ts:22`) for the browser-only demo account.

---

### 3.18 `/change-password` — `src/app/(app)/change-password/page.tsx` (160 lines, **untracked — does not exist at HEAD**)

**(a) Chain**

```
app-shell.tsx:39-44   if (ready && user.mustChangePassword && pathname !== "/change-password")
                      → router.replace("/change-password")     ← the ONLY enforcement, client-side
ChangePasswordPage
 └─ submit(event)  change-password/page.tsx:37
      → passwordProblems(next)  change-password/page.tsx:35 → password-policy.ts:11
      → apiRequest("/auth/change-password",{POST, skipAuthRetry:true})  change-password/page.tsx:48
      → POST /api/auth/change-password  auth.routes.ts:221
      → verifyPassword(current) → 401 on mismatch  auth.routes.ts:233-235
      → passwordProblems(new) → 422  auth.routes.ts:237-238
      → UPDATE users(password_hash, password_changed_at, must_change_password:false)  auth.routes.ts:240-248
      → REVOKE all refresh_tokens  auth.routes.ts:251-254
      → audit_logs via recordAuthEvent  auth.routes.ts:256
      → 204 + clearCookie
      → signOut() → POST /auth/logout → router.replace("/login")  change-password/page.tsx:57-58
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "Update password" (form submit) | `change-password/page.tsx:132` → `submit()` `:37` → `:48` | **yes** `POST` | `POST /api/auth/change-password` (`auth.routes.ts:221`) | **yes** — `users`, `refresh_tokens`, `audit_logs` | **WIRED** |
| Live policy hint | `change-password/page.tsx:108-112` | no — `password-policy.ts:11-20`, a client mirror | — | n/a | READ-ONLY |
| Confirm-match check | `change-password/page.tsx:43` | no — client-side | — | n/a | READ-ONLY |
| "Not the same as current" check | `change-password/page.tsx:44` | no — client-side only; the server does **not** enforce password reuse | — | n/a | **MISSING** server-side |

**The forced-change guard is client-side only.** `mustChangePassword` is written by the server (`admin.routes.ts:208`, `:293`, `:350`), carried on the auth context (`access.ts:19`, `:38`, `:82`) and returned on the profile (`auth.routes.ts:70`). But `grep mustChangePassword backend/src/middleware/` returns **zero** hits, and no route asserts it. The only enforcement is the React redirect at `app-shell.tsx:39-48`. An account on a temporary password that talks to `/api` directly — with `curl`, or with the browser devtools console — has its **full permission set**. The redirect is a UX affordance, not a security control.

---

### 3.19 `/login` — `src/app/login/page.tsx` (200 lines)

**(a) Chain**

```
LoginPage
 └─ handleSubmit()  login/page.tsx:32
      → signIn(email, password)  login/page.tsx:49 → use-auth.tsx:167
           ├─ isDemoCredentials(email,password)?  use-auth.tsx:174 → demo/config.ts:81
           │    → enableDemoMode(); setUser(DEMO_SESSION_USER); RETURN — no request  use-auth.tsx:175-184
           └─ apiRequest("/auth/login",{POST, skipAuthRetry:true})  use-auth.tsx:187-197
                → POST /api/auth/login  auth.routes.ts:81
                → lockout check (8 attempts / 15 min)  auth.routes.ts:28-29, :103-106
                → argon2id verify, always run (timing equalisation)  auth.routes.ts:110-111
                → status/role-active checks  auth.routes.ts:131-132
                → issueSession(): INSERT refresh_tokens + Set-Cookie + sign HS256 access  auth.routes.ts:31-57
                → recordAuthEvent("login_succeeded") → audit_logs  auth.routes.ts:140
                → { accessToken, expiresIn, mustChangePassword, user: profileOf(ctx) }
      → setAccessToken (module variable, never localStorage)  use-auth.tsx:199 / api.ts:21
      → persistAuthUser → localStorage (profile only, no token)  use-auth.tsx:201
      → router.push("/dashboard")  login/page.tsx:53
```

**(b) Controls**

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "Sign in" | `login/page.tsx:187` → `handleSubmit()` `:32` → `use-auth.tsx:187` | **yes** `POST` | `POST /api/auth/login` (`auth.routes.ts:81`) | **yes** — `refresh_tokens`, `users.last_login_at`, `audit_logs` | **WIRED** |
| Email / password inputs | `login/page.tsx:126-134`, `:141-148` | via the submit | — | n/a | READ-ONLY |
| Show/hide password | `login/page.tsx:149-156` | no | — | n/a | LOCAL |
| **"Remember me"** | `login/page.tsx:162-165` — `remember` state is set and **never read again** anywhere in the file | **no** | — | **no effect** — the refresh cookie TTL is fixed at `REFRESH_TOKEN_TTL_DAYS` server-side (`auth.routes.ts:37`) | **FAKE** |
| **"Forgot password?"** | `login/page.tsx:168-178` — `toast.info("Password reset", "Contact your administrator to have your password reset.")` at `:170` | **no** | there is no self-service reset endpoint, and no email subsystem to deliver one. The copy is at least honest about the real recovery path (`POST /api/users/:id/reset-password`, admin-driven). | **never** | **FAKE (honest)** |
| Demo credentials | `use-auth.tsx:174-184`, matched against `demo/config.ts:14-15` | **no — deliberately** | none | never | by design (`api.ts:118`) |

**Note.** `disableDemoMode()` has exactly one call site: `use-auth.tsx:212`, inside the demo branch of `signOut`. The real branch of `signIn` (`use-auth.tsx:187-201`) never clears the flag. A user who signs into the demo account and then signs in with real credentials **without signing out first** would carry the `sessionStorage` demo flag into the real session, and `apiRequest` would keep short-circuiting to browser fixtures (`api.ts:118`).

---

### 3.20 Shared components

#### `components/layout/app-shell.tsx` (84 lines, modified)

| Control | Handler (file:line) | HTTP call? | Verdict |
|---|---|---|---|
| Unauthenticated redirect | `app-shell.tsx:20-22` | no | WIRED (`ready`/`user` come from `POST /auth/refresh`) |
| Demo out-of-scope redirect | `app-shell.tsx:28-32` | no | correct |
| **Forced password-change redirect** | `app-shell.tsx:39-44` (working tree only) | no | **client-side only** — see §3.18 |
| Loading gate | `app-shell.tsx:48-57` | no | correct — the page never mounts for a frame |
| Sidebar collapse / mobile drawer | `app-shell.tsx:63-65` | no | LOCAL, not persisted across reloads |

#### `components/layout/sidebar.tsx` (149 lines)

| Control | Handler (file:line) | HTTP call? | Verdict |
|---|---|---|---|
| 15 nav links | `sidebar.tsx:77-108`, from `lib/nav.ts:30-66` | no | READ-ONLY — **no permission gating whatsoever** for real sessions. An Executive sees "Employees", "Recycle bin" and "Ledger" in the menu and receives a 403 on arrival, rendered as an empty table (§8). Only the demo menu (`lib/demo/nav.ts`) filters by permission. |
| "Sign out" | `sidebar.tsx:136` → `use-auth.tsx:209` | **yes** `POST /api/auth/logout` (`auth.routes.ts:195`) | **WIRED** — revokes the refresh token row |

#### `components/layout/topbar.tsx` (227 lines)

| Control | Handler (file:line) | HTTP call? | Backend route | Verdict |
|---|---|---|---|---|
| Command palette customer search | `topbar.tsx:66-70` (debounced at `:43-50`, enabled only when the query is > 1 char) | **yes** `GET` | `GET /api/customers?search=…&pageSize=5` (`customers.routes.ts:91`, ILIKE over `name`, `mobile`, `code`, `bank_reference_id` at `:110-118`) | **WIRED** |
| **Clicking a customer result** | `topbar.tsx:203` — `go(\`/customers/${customer.id}\`)` | navigates | `/customers/[id]` → `GET /api/customers/<uuid>` → 200 | **WIRED** — fixed by Task 1.9 (BUG-017). Linking by `code` now returns 422, not 500 |
| Notification bell + unread badge | `topbar.tsx:71`, `:86`, `:131-135` | **yes** `GET /api/notifications` | reads | READ-ONLY — always `0` (nothing inserts notifications) |
| Theme toggle | `topbar.tsx:122` → `use-reference.tsx:150-159` | no | LOCAL — `localStorage` only |
| "My profile" / "Workspace settings" | `topbar.tsx:156-161` | no (both navigate to `/settings`) | — | READ-ONLY |
| "Sign out" | `topbar.tsx:163` → `use-auth.tsx:209` | **yes** `POST /api/auth/logout` | **WIRED** |
| Page-name search | `topbar.tsx:85`, `:206-215` | no — filters `flatNav` in memory | — | LOCAL |

#### `components/shared/data-table.tsx` (317 lines)

| Control | Handler (file:line) | HTTP call? | Verdict |
|---|---|---|---|
| Search box | `data-table.tsx:157-166` | **no** — filters only the rows already in memory (`:88`) | READ-ONLY. Because the pages request one large page (`pageSize: 100`–`500`) and never re-query, searching past the first page of server results is impossible. |
| Filter selects | `data-table.tsx:168-189` | no — in-memory (`:89-92`) | READ-ONLY |
| Column sort | `data-table.tsx:119-126`, `:96-110` | no — in-memory | READ-ONLY |
| Pagination | `data-table.tsx:284-311` | **no** — slices the in-memory array (`:116`). `page`/`pageSize` are never sent to the API. | READ-ONLY. The server's `meta.totalPages` (`scoped-resource.ts:146`) is fetched and discarded on every page. |
| "Export CSV" | `data-table.tsx:128-143` | no | LOCAL — exports the filtered in-memory rows only, never the full server-side result set |

#### `components/shared/customer-import-dialog.tsx` (236 lines)

```
CustomerImportDialog
 ├─ downloadTemplate()  customer-import-dialog.tsx:45
 │    → raw fetch `${API_BASE_URL}/api/imports/template/customers`  :47
 │    → GET  imports.routes.ts:112 → customers.import → ExcelJS workbook streamed  :143
 ├─ validate()  customer-import-dialog.tsx:64
 │    → api.upload("/imports/customers", FormData)  :70
 │    → POST  imports.routes.ts:155 → customers.import → multer memoryStorage  :27-29
 │    → per-row zod validation, bank-code resolution, assertBankAccess, duplicate detection
 │    → TX: INSERT import_batches + import_rows  imports.routes.ts:289-317
 │    → 201 {batchId, counts, preview}   NOTHING lands in `customers` yet
 └─ confirmImport()  customer-import-dialog.tsx:82
      → apiRequest(`/imports/${batchId}/confirm`,{POST})  :86
      → POST  imports.routes.ts:361 → customers.import AND customers.create  :363
      → ownership + expiry + already-imported guards  imports.routes.ts:375-378
      → TX: INSERT only rows with status='valid'  imports.routes.ts:395-434
      → assertBankAccess re-checked at confirm time  imports.routes.ts:400
      → UPDATE import_batches + audit_logs  imports.routes.ts:436-456
```

| Control | Handler (file:line) | HTTP call? | Backend route | Persists? | Verdict |
|---|---|---|---|---|---|
| "Download template" | `customer-import-dialog.tsx:124` → `:45` | **yes** `GET` | `GET /api/imports/template/customers` (`imports.routes.ts:112`) | reads | **WIRED** |
| File picker | `customer-import-dialog.tsx:136-141` | no | — | n/a | LOCAL |
| "Validate" | `customer-import-dialog.tsx:218` → `:64` → `:70` | **yes** `POST` multipart | `POST /api/imports/customers` (`imports.routes.ts:155`) | **yes** — `import_batches`, `import_rows` (staging only) | **WIRED** |
| "Import N customer(s)" | `customer-import-dialog.tsx:227` → `:82` → `:86` | **yes** `POST` | `POST /api/imports/:batchId/confirm` (`imports.routes.ts:361`) | **yes** — `customers` + `import_rows` + `import_batches` + `audit_logs`, one transaction | **WIRED** |
| "Choose another file" | `customer-import-dialog.tsx:224` → `reset()` `:39` | no | the previous `import_batches` row is orphaned until its 24 h `expiresAt` (`imports.routes.ts:302`); there is no purge job | n/a | LOCAL |
| Review a staged batch later | — | — | `GET /api/imports/:batchId` exists (`imports.routes.ts:334`) | — | **MISSING** — no UI resumes an interrupted import |

**This is the only place in the application where a real file is uploaded to the server**, and even here the file buffer is parsed by ExcelJS (`imports.routes.ts:167`) and then discarded. `multer` appears nowhere else in the codebase.

#### `hooks/use-reference.tsx` (173 lines)

```
ReferenceProvider  use-reference.tsx:34
 └─ Promise.all([                                use-reference.tsx:66-70
      api.list("/banks"),                        → GET /api/banks    → banks.view → banks
      api.list("/users",{pageSize:200}),         → GET /api/users    → users.view → users ⋈ roles
      api.list("/teams"),                        → GET /api/teams    → teams.view → teams + members
    ])
    each wrapped in settle() → .catch(() => [])  use-reference.tsx:63-64
```

`settle()` (`use-reference.tsx:63-64`) swallows every rejection and substitutes `[]`. An Executive holds `banks.view` but **not** `users.view` or `teams.view` (`permissions.ts:298-311`), so `/users` and `/teams` return 403 and are silently replaced by empty arrays. The visible consequence: `employeeName(id)` returns `"Unassigned"` (`use-reference.tsx:102`) for every record on every screen, indistinguishable from a genuinely unassigned record.

---

## 4. FAKE ACTION REGISTER

Every handler in the application that presents success to the user without issuing any HTTP request. Ordered by severity: **Tier 1** falsifies the state of a financial record; **Tier 2** falsifies a configuration or account change; **Tier 3** falsifies a side effect that has no backend at all.

### Tier 1 — falsifies the state of a financial or operational record

| # | Action | File:line | What it claims | What it actually does | The backend route that exists and is never called |
|---|---|---|---|---|---|
| 1 | Loan **Approve** / **Reject** | `loans/page.tsx:68` (`updateStatus`), buttons at `:303`, `:306` | `"Marked approved"` / `"Marked rejected"` on a named customer's file | `refresh()`, mutates the `selected` object in React state, toasts | `POST /api/loans/:id/approve` — `scoped-resource.ts:271`, guard `requests.approve` |
| 2 | Bank order **Move to stage** | `bank-orders/page.tsx:58` (`moveStage`), select at `:302` | `"Stage updated · <order> moved to <stage>"` | `refresh()` + local state + toast | `PATCH /api/bank-orders/:id` — `scoped-resource.ts:205`, guard `bank_orders.edit` |
| 3 | Bank order **Save remark** | `bank-orders/page.tsx:64` (`saveRemark`), button at `:321` | `"Remark saved to the file trail"` | validates non-empty, `refresh()`, clears the textarea, toasts | `PATCH /api/bank-orders/:id` — `scoped-resource.ts:205` |
| 4 | Disbursement **Mark credited** | `disbursement/page.tsx:81` (`markCredited`), button at `:267` | `"Marked as credited · <UTR> confirmed in bank statement"` | `refresh()` + local state + toast | `POST /api/disbursements/:id/approve` — `scoped-resource.ts:271`, guard `disbursements.approve` |
| 5 | Disbursement **Re-initiate** | `disbursement/page.tsx:87` (`retry`), button at `:260` | `"Re-initiated · Transfer resubmitted with corrected beneficiary."` | `refresh()` + local state + toast. **No transfer is resubmitted; no payment integration exists.** | `PATCH /api/disbursements/:id` — `scoped-resource.ts:205` |
| 6 | Settlement **Mark paid** | `settlements/page.tsx:35` (`markPaid`), button at `:274` | `"Settlement closed · <invoice> marked paid for <bank>"` | computes `settledOn` locally, `refresh()`, local state, toast | `POST /api/settlements/:id/approve` — `scoped-resource.ts:271`, guard `settlements.approve` |
| 7 | Settlement **Raise dispute** | `settlements/page.tsx:44` (`raiseDispute`), button at `:268` | `"Dispute raised · Query sent to <bank> SPOC."` | `refresh()` + local state + toast. **No query is sent to anybody.** | `PATCH /api/settlements/:id` — `scoped-resource.ts:205` |
| 8 | Transaction **Mark successful** | `transactions/page.tsx:36` (`settle`), button at `:220` | `"Transaction settled"` | `refresh()` + local state + toast | `PATCH /api/transactions/:id` — `scoped-resource.ts:205`, guard `transactions.edit` |
| 9 | Document **Verify** | `documents/page.tsx:104` (`setStatus`), button at `:193` | `"Marked verified"` on a named file | `refresh()` + toast (no local state change at all) | `PATCH /api/documents/:id` — `scoped-resource.ts:205`, guard `documents.upload` |
| 10 | Document **Delete** | `documents/page.tsx:109` (`remove`), button at `:197` | `"Document removed"` | `refresh()` + toast | `DELETE /api/documents/:id` — `scoped-resource.ts:251`, guard `documents.delete` |
| 11 | Customer detail **Save changes** | `customers/[id]/page.tsx:458-465` | `"Profile updated · <name> saved."` | closes the dialog. The four edit inputs (`:439`,`:443`,`:447`,`:451`) are uncontrolled `defaultValue` and are never read. | `PATCH /api/customers/:id` — `customers.routes.ts:214`, guard `customers.edit` |
| 12 | Customer detail **Delete** | `customers/[id]/page.tsx:483-493` | `"Customer archived · <name> moved to archived records."` | closes the dialog | `DELETE /api/customers/:id` — `customers.routes.ts:266`, guard `customers.delete` (and the same call *is* correctly wired on the list page at `customers/page.tsx:261`) |
| 13 | Customers **Re-upload written form** | `customers/page.tsx:232` (`handleManualFormUpload`), trigger at `:653` | `"Written form uploaded · <filename> has been queued for verification."` | reads `event.target.files[0]`, **discards it**, clears the input | `POST /api/documents` — `scoped-resource.ts:170`, guard `documents.upload`. There is no file-storage subsystem in this repository at all. |
| 14 | Notifications **Mark all read** | `notifications/page.tsx:76` (`markAll`), button at `:101` | `"All caught up · Every alert marked as read."` | `setItems(prev => …)` on an array that is permanently empty (§3.13) | `POST /api/notifications/read-all` — `admin.routes.ts:974` |
| 15 | Notifications **Mark read / unread** | `notifications/page.tsx:81` (`toggle`), button at `:62` | flips the row label | local `setItems` | `POST /api/notifications/:id/read` — `admin.routes.ts:987` |
| 16 | Customer detail **timeline** | `customers/[id]/page.tsx:92-102` | a chronological audit trail with timestamps | concatenates the literals `"T10:20:00"`, `"T11:00:00"`, `"T12:30:00"`, `"T15:20:00"`, `"T17:10:00"` onto `customer.createdAt` | `GET /api/audit-logs` — `admin.routes.ts:902`, guard `audit_logs.view` |

### Tier 2 — falsifies a configuration or account change

| # | Action | File:line | What it claims | What it actually does | Route that exists and is never called |
|---|---|---|---|---|---|
| 17 | Settings **Save changes** (profile) | `settings/page.tsx:229` (`saveProfile`), button at `:350` | `"Settings saved · Your profile changes are now stored for this session and after reload."` | `updateUser()` → `window.localStorage` only (`use-auth.tsx:71-74`). Cleared by `signOut` (`use-auth.tsx:230`) and overwritten by the next `POST /auth/refresh` (`use-auth.tsx:129-130`). | `PATCH /api/users/:id` — `admin.routes.ts:251` |
| 18 | Settings **Change photo** / **Remove** | `settings/page.tsx:147` / `:196`, buttons at `:405` / `:414` | `"Photo selected · Click Save changes to apply it."` | creates a `blob:` preview URL; `settings/page.tsx:254` reads `void avatarFile` — an explicit discard | none exists |
| 19 | Settings → Bank access **Logging enabled** switch | `settings/page.tsx:711`, control at `:709` | `"Logging enabled"` / `"Logging paused"` for a named bank | toast only | `PATCH /api/banks/:id` — `banks.routes.ts:104` (correctly used by `/banks` at `banks/page.tsx:97`, but not here) |
| 20 | Settings → Company tab, all 9 fields | `settings/page.tsx:545`, `:553`, `:561`, `:571`, `:579`, `:587`, `:603`, `:611`, `:620` | an editable company record used on invoices | every field is an uncontrolled `defaultValue`; nothing reads them; there is no save button for this tab | none exists. The `app_settings` table is present in the schema and referenced **nowhere** outside `db/schema` — a completely dead table. |
| 21 | Settings → Preferences switches ×3 | `settings/page.tsx:524` | three workspace preferences | `defaultChecked` with **no `onCheckedChange` handler at all** | none exists |
| 22 | Settings → **Default landing page** select | `settings/page.tsx:468` | choose where you land after sign-in | `defaultValue`, no handler, never read | none exists |
| 23 | Employees **Revoke / Restore access** *(HEAD only)* | HEAD `employees/page.tsx:101` | `"Access revoked"` / `"Access restored"` | `refresh()` + local state + toast | `PATCH /api/users/:id` — `admin.routes.ts:251`. **Fixed in the working tree** at `employees/page.tsx:222`. |
| 24 | Employees **Permission switches** *(HEAD only)* | HEAD `employees/page.tsx:251-252` | `"Permission granted"` / `"Permission revoked"` | toast only | `PUT /api/roles/:id/permissions` — `admin.routes.ts:614`, guard `roles.assign_permissions`. **Removed in the working tree** (replaced by a read-only "Roles" summary at `employees/page.tsx:394-416`). |
| 25 | Login **Remember me** | `login/page.tsx:162-165` | a longer-lived session | `remember` is set at `:24` and never read again | none — the refresh cookie TTL is fixed server-side (`auth.routes.ts:37`) |

### Tier 3 — falsifies a side effect for which no backend subsystem exists at all

| # | Action | File:line | What it claims | Reality |
|---|---|---|---|---|
| 26 | Employees **Send password reset** *(HEAD only)* | HEAD `employees/page.tsx:318` | `"Reset link sent · Emailed to <address>"` | **No email subsystem exists.** Zero provider dependencies, zero transport code, zero templates, zero `EMAIL_`/`SMTP_`/`MAIL_` env vars. **Replaced in the working tree** by the real `POST /users/:id/reset-password` + in-person credential hand-over (`employees/page.tsx:197`, `credential-handover.tsx:80`). |
| 27 | Settings **Request export** | `settings/page.tsx:329`, button at `:1011` | `"Export queued · You'll get an email when it's ready."` | no export job, no queue, no email |
| 28 | Settings **Session "Sign out"** (other devices) | `settings/page.tsx:941` | `"Session ended · <device>"` | the three listed devices are a hardcoded fixture array at `settings/page.tsx:85-104`. No endpoint exposes or revokes individual sessions. |
| 29 | Settings **2FA** switch | `settings/page.tsx:973` | `"2FA enabled"` / `"2FA disabled"` | there is no 2FA implementation anywhere in the codebase |
| 30 | Settings → Alerts, 5 preference switches | `settings/page.tsx:758` | `"Alert on"` / `"Alert off"` | no alert-preference storage exists; nothing ever creates a notification row anyway |
| 31 | Settings → Alerts, delivery channels | `settings/page.tsx:815-819` | Email / SMS / WhatsApp toggles | no handler on the switch, and none of these three channels exists in the codebase |
| 32 | Settings **Reset data** | `settings/page.tsx:339`, button at `:1033` | `"Restores the sample customers, loans, and ledger entries"` | `window.location.reload()` |
| 33 | Documents **Preview** | `documents/page.tsx:177` | `"Preview · <file> opened in viewer."` | nothing opens; no bytes are stored to preview |
| 34 | Documents **Download** | `documents/page.tsx:185` | `"Download started · <file>"` | nothing downloads; `documents.storage_key` (`operations.ts:371`) is never written by any code path |
| 35 | Customer detail **Print** | `customers/[id]/page.tsx:185` | `"Sent to printer · Profile sheet queued."` | no print dialog is opened and no print job exists (contrast `reports/page.tsx:122`, which does call `win.print()`) |
| 36 | Login **Forgot password?** | `login/page.tsx:170` | `"Contact your administrator to have your password reset."` | honest — this correctly describes the only real recovery path (`POST /api/users/:id/reset-password`), but it is still a toast with no action behind it |

**Total: 36 fake handlers**, of which 16 falsify the state of a financial or operational record.

---

## 5. BROKEN PATH REGISTER

A request *is* issued, or a control *is* rendered as functional, but the outcome cannot be what the user is shown.

### B1 — Notifications: fetched rows never reach the UI

| Field | Detail |
|---|---|
| Location | `notifications/page.tsx:74` |
| Code | `const [items, setItems] = React.useState<NotificationItem[]>(rows);` |
| Mechanism | `useState` reads its argument **only on the first render**, when `rows` is `[]` (`use-api.ts:24`). No `useEffect` ever synchronises `items` with `rows`. |
| Symptom | The page permanently renders the "Nothing to read here" empty state (`notifications/page.tsx:36-42`) and the count `"0 unread of 0"` (`:111`), regardless of what `GET /api/notifications` returned. |
| Blast radius | The whole page. The Alerts / Unread / Critical tabs all read `items`. |
| Compounding | Currently unobservable because nothing inserts notification rows (`grep insert(notifications)` over `backend/src` → zero hits). The bug will surface the day the first notification is written. |
| Fix shape | `React.useEffect(() => setItems(rows), [rows]);` — or drop `items` and read `rows` directly, moving the read/unread toggles onto `POST /api/notifications/:id/read`. |

### B2 — Reports: stale `useMemo`, plus a 2024-locked date window

| Field | Detail |
|---|---|
| Location | `reports/page.tsx:58-67` |
| Mechanism 1 | The memo filters `loans` but omits `loans` from its dependency array (`:67`), with the warning explicitly suppressed at `:66`. First render → `loans` is `[]` → `rows` is `[]`. When `GET /api/loans` resolves, the memo does not recompute. |
| Mechanism 2 | Defaults are `from = "2024-01-05"`, `to = "2024-05-31"` (`:51-52`). Every record newer than 2024-05-31 is filtered out even after a recompute. |
| Mechanism 3 | `:60` compares a full ISO timestamp against a date-only string with `<=`; `"2024-05-31T10:00:00Z" > "2024-05-31"`, so the last day of any range is always excluded. |
| Symptom | The loan report table renders "Nothing matched this range" on load. Touching any filter forces a recompute — which then produces an empty result anyway on a post-2024 database. All four export buttons export the same empty set. The "Apply" toast at `:223` reports `rows.length` **before** the recompute, so it is one render stale on top of everything else. |
| Blast radius | The entire `/reports` page: 4 StatCards, the status-mix chart, the table, and the Excel/CSV/PDF/Tally exports. |

### B3 — Ledger: 403 for the roles that reach for it, invisible rows for the roles that don't

| Field | Detail |
|---|---|
| Location | `ledger/page.tsx:63-71` (payload), `ledger/page.tsx:178` (ungated button) |
| Mechanism A — 403 | `ledger.create` is held only by `super_admin` (`permissions.ts:197`) and `admin` (`permissions.ts:217`). `manager` holds `ledger.view` but **not** `ledger.create` (`permissions.ts:255`); `team_leader` and `executive` hold neither. The "New voucher" button at `ledger/page.tsx:178` has no `can()` gate, so a Manager sees it, fills the dialog, and gets `403 Missing required permission: ledger.create` as a toast (`ledger/page.tsx:76`). |
| Mechanism B — null `bankId` | The payload sends no `bankId`. `createSchema` allows it (`operations.routes.ts:366`), `assertBankAccess(ctx, undefined)` returns early for an unscoped caller (`access.ts:122`), and the row is inserted with `bank_id = NULL`. On the next read, `bankScope` produces `bank_id IN (…)` (`access.ts:110`), and `NULL IN (…)` is never true — the voucher is invisible to any bank-scoped user. |
| Symptom | For a Manager: an unexplained 403 on a button the UI offered. For a scoped user who somehow held the permission: `"Voucher posted"` followed by a ledger that does not contain it. |
| Additional | `team_leader` and `executive` lack `ledger.view` entirely, so for them the *whole page* 403s on load and renders as an empty ledger with zero KPIs — see §8. |

### B4 — ~~Global customer search: sends `code`, the route expects a UUID~~ — ✅ **FIXED (Task 1.9, 2026-09-02)**

> **Resolved.** `topbar.tsx:203` navigates by `customer.id`, and the three customer `:id` handlers validate the segment, so a `code` now returns **422 `validation_failed`** naming `id` rather than a 500. `error-handler.ts` was deliberately not changed — see [DECISIONS.md](https://github.com/RiseNext/CMBBACKEND/blob/main/docs/DECISIONS.md) D-021. The analysis below is retained as the historical record; the line reference `topbar.tsx:191-193` was stale even when written (the call was at `:198`).
>
> **One correction to the row below:** the sibling `useResource` calls did **not** return 422. Measured: they returned **500**, through the unvalidated `filterable` loop at `scoped-resource.ts:115-120`. One palette click therefore cost **four** 500s. Now tracked as **BUG-035**.

| Field | Detail |
|---|---|
| Location | `topbar.tsx:203` — *cited as `:191-193` originally and `:198` after Task 1.9; both stale. The call sits at `:203` at HEAD, below the explanatory comment Task 1.9 added.* |
| Code | `onClick={() => go(\`/customers/${customer.code}\`)}` |
| Mechanism | `customer.code` is the human-readable `"CUS-10001"` (generated at `customers.routes.ts:86-89`). The destination page passes the path segment straight through: `useRecord(\`/customers/${customerId}\`)` (`customers/[id]/page.tsx:57-61`). The route runs `eq(customers.id, req.params.id)` (`customers.routes.ts:148`) against a `uuid` column. PostgreSQL raises `22P02 invalid input syntax for type uuid`. |
| Why 500, not 404 | `error-handler.ts:65-82` special-cases only `23505` (unique) and `23503` (FK). `22P02` falls through to the catch-all at `:84-87` → `500 { error: { code: "internal_error" } }`. |
| Symptom | Clicking any customer in the ⌘K palette produces a 500. `useRecord` catches it (`use-api.ts:120-124`), sets `data` to `null`, and `customers/[id]/page.tsx:88` calls Next's `notFound()` — so the user sees a 404 page for a customer that plainly exists and was just displayed to them. |
| Contrast | Every other navigation to this page passes `row.id` correctly: `customers/page.tsx:539`, `:769`; `loans/page.tsx:121`; `disbursement/page.tsx:111`; `transactions/page.tsx:60`; `documents/page.tsx:132`; `my-work/page.tsx:93`, `:365`; `dashboard/page.tsx:256`, `:345`. The topbar is the sole offender. |

### B5 — Loans: create dialog closes the wrong dialog

| Field | Detail |
|---|---|
| Location | `loans/page.tsx:95` vs `loans/page.tsx:316` |
| Mechanism | Two independent booleans exist: `createOpen` (`:53`) and `open` (`:54`). The dialog is bound to `createOpen` (`:316`) and opened by `setCreateOpen(true)` (`:197`). On success `createLoan` calls `setOpen(false)` (`:95`) — a state variable no dialog is bound to. |
| Symptom | `POST /api/loans` succeeds, `"Loan file created"` toasts, the list refreshes behind the dialog — and the dialog stays open with the form still populated. A second click on "Submit to bank" creates a **second identical loan**, which the backend accepts (there is no idempotency key and no uniqueness constraint on loan content). |
| Related | `open`/`setOpen` are declared at `:54` and referenced nowhere else in the file; it is orphaned state. |

### B6 — Dashboard: a 403 renders as a wall of zeroes for an Executive

| Field | Detail |
|---|---|
| Location | `dashboard/page.tsx:40` → `use-api.ts:139-176` |
| Mechanism | All three dashboard endpoints require `reports.view` (`operations.routes.ts:521`, `:580`, `:599`). The `executive` role does not hold it (`permissions.ts:298-311`). `useStats` catches every rejection and sets `data` to `null` **without any error field in its return type** (`use-api.ts:159-161`); `num()` then coerces `null` to `0` (`use-api.ts:171`). |
| Symptom | An Executive who opens `/dashboard` — reachable, because `lib/nav.ts:34` links it with no permission gate — sees "Total customers 0", "Pending loans 0", "Approved loans 0", "Today's transactions 0", "Commission due ₹0", empty charts, and no error of any kind. The screen is byte-identical to a correctly functioning dashboard over an empty database. |
| Aggravating | `login/page.tsx:53` sends **every** role to `/dashboard` after sign-in, including Executives. The comment at `login/page.tsx:51-52` claims "An Executive lands in their own workspace" — the code does not implement that; `/my-work` is only reached in demo mode (`isDemoMode() ? DEMO_HOME : "/dashboard"`). |
| Same class | `team_leader` holds `reports.view` (`permissions.ts:289`) but not `ledger.view`, `settlements.*` beyond view, or `users.create`, so `/ledger` and parts of `/employees` fail the same way. |

### B7 — `/documents?customerId=` deep link is silently ignored

| Field | Detail |
|---|---|
| Location | `customers/page.tsx:552-554` pushes `/documents?customerId=${row.id}` |
| Mechanism | `documents/page.tsx` never calls `useSearchParams` or reads `window.location.search`. It always issues an unfiltered `GET /api/documents` (`documents/page.tsx:52`). |
| Symptom | "Upload Docs" on a customer row lands on the full, unfiltered document vault with no indication of which customer was intended. The upload dialog then defaults to `customers[0]` (`documents/page.tsx:75`) — a different customer entirely. |
| Note | The backend *does* support the filter: `customerId` is in the documents `filterable` list (`operations.routes.ts:390`) and `customers/[id]/page.tsx:63-67` uses it correctly. |

### B8 — Documents "By" column can never be populated

| Field | Detail |
|---|---|
| Location | `documents/page.tsx:159`, `customers/[id]/page.tsx:344` |
| Mechanism | `documents.uploaded_by` is a `uuid` FK (`operations.ts:375`) but is absent from the documents `createSchema` (`operations.routes.ts:391-402`), so `POST /api/documents` never sets it, and `scoped-resource.ts:186-187` only injects `createdBy`/`updatedBy`. |
| Symptom | The "By" column always renders the `DataTable` null fallback `"—"` (`data-table.tsx:260`). The search text at `documents/page.tsx:282` includes `row.uploadedBy`, so searching by uploader never matches anything. |

### B9 — Divide-by-zero KPIs on an empty database

| Location | Expression | Renders when the list is empty |
|---|---|---|
| `disbursement/page.tsx:201-204` | `Math.round(sum / rows.length)` | `formatCurrency(NaN)` |
| `documents/page.tsx:230` | `Math.round((verified.length / rows.length) * 100)` | `NaN%` |
| `banks/page.tsx:139` | `(sum / rows.length).toFixed(2)` | `NaN%` |

A fresh installation — precisely the state in which a new operator first opens the app — shows `NaN` in three KPI tiles.

---

## 6. DEAD ENDPOINT REGISTER

Endpoints the backend implements, tests, and guards, for which **no frontend code path issues a request**. Verified by exhaustive grep of every `api.*`, `apiRequest`, `useResource`, `useRecord`, `useStats`, and raw `fetch` call site under `src` (excluding `src/lib/demo`, which never reaches the network).

**Totals: 96 endpoints; 38 reached (40%); 58 dead (60%).**

> **Correction to the working baseline.** The brief supplied to this document stated "Frontend calls 27 distinct METHOD+path pairs; 69 of 96 endpoints (72%) have ZERO frontend callers." That is not what the code shows. **27 is the count of *hand-written* endpoints reached (27 of 52)**; a further **11 factory-generated endpoints** are also reached, giving **38 reached** and **58 dead**. The full derivation is in §6.7.

### 6.1 Dead — identity and access (16)

| Method | Path | Source | Guard | Note |
|---|---|---|---|---|
| GET | `/api/auth/me` | `auth.routes.ts:212` | `requireAuth` | Superseded by `POST /auth/refresh`, which returns the same `profileOf()` payload plus a token (`auth.routes.ts:189`). |
| GET | `/api/users/:id` | — | — | Never emitted; the users router is hand-written and has no by-id read. |
| PUT | `/api/users/:id/banks` | `admin.routes.ts:386` | `users.assign` | Bank access can only be set at creation time (`employees/page.tsx:169`); it can never be changed afterwards from the UI. |
| DELETE | `/api/users/:id` | `admin.routes.ts:434` | `users.delete` | Includes the last-active-super-admin guard (`:444-451`). No UI. |
| GET | `/api/roles/permissions` | `admin.routes.ts:500` | `roles.view` | The full permission catalogue. No UI consumes it. |
| POST | `/api/roles` | `admin.routes.ts:524` | `roles.create` | Custom roles cannot be created from the UI. |
| PATCH | `/api/roles/:id` | `admin.routes.ts:575` | `roles.edit` | |
| PUT | `/api/roles/:id/permissions` | `admin.routes.ts:614` | `roles.assign_permissions` | The escalation guard `assertCanGrantPermissions` (`access.ts:166`) is unreachable from the UI. The `HEAD` employees page pretended to call this (Fake #24). |
| DELETE | `/api/roles/:id` | `admin.routes.ts:663` | `roles.delete` | |
| POST | `/api/teams` | `admin.routes.ts:728` | `teams.create` | Teams can be *assigned* at employee creation but never *created*. |
| PUT | `/api/teams/:id/members` | `admin.routes.ts:749` | `teams.assign` | |
| DELETE | `/api/teams/:id` | `admin.routes.ts:784` | `teams.delete` | |
| GET | `/api/audit-logs` | `admin.routes.ts:902` | `audit_logs.view` | **The most consequential dead endpoint.** Every write in the system records to `audit_logs`, and no screen ever displays it. Three separate UI surfaces fabricate an activity trail instead: `dashboard/page.tsx:56`, `notifications/page.tsx:73`, `customers/[id]/page.tsx:92`. |
| POST | `/api/notifications/read-all` | `admin.routes.ts:974` | `requireAuth` | Faked at `notifications/page.tsx:76`. |
| POST | `/api/notifications/:id/read` | `admin.routes.ts:987` | `requireAuth` | Faked at `notifications/page.tsx:81`. |
| GET | `/api/banks/:id` | `banks.routes.ts:52` | `banks.view` | The banks page holds the full list in memory and never fetches one bank. |

### 6.2 Dead — customers and imports (3)

| Method | Path | Source | Guard | Note |
|---|---|---|---|---|
| PATCH | `/api/customers/:id` | `customers.routes.ts:214` | `customers.edit` | **No screen can edit a customer.** The only edit form (`customers/[id]/page.tsx:428-468`) is Fake #11. Every role from Executive upward holds `customers.edit` (`permissions.ts:301`). |
| GET | `/api/customers/check/reference` | `customers.routes.ts:293` | `customers.view` | Pre-flight uniqueness check documented as "used by the create form" (`customers.routes.ts:289-292`). The create form does not call it (`customers/page.tsx:279-358`); duplicates surface as a `409` from the unique constraint via `error-handler.ts:66-76`. |
| GET | `/api/imports/:batchId` | `imports.routes.ts:334` | `customers.import` | Full preview for a staged batch. The dialog holds its preview in React state (`customer-import-dialog.tsx:36`); closing it strands the batch until the 24 h expiry. |

### 6.3 Dead — banks and operations, hand-written (4)

| Method | Path | Source | Guard | Note |
|---|---|---|---|---|
| DELETE | `/api/banks/:id` | `banks.routes.ts:145` | `banks.delete` | |
| POST | `/api/loans/:id/verification` | `operations.routes.ts:107` | `verification.create` | The most elaborate hand-written business rule in the codebase — enforces "if verification is required a provider is mandatory" (`:133-135`), guards against duplicates (`:137-142`), writes the verification row and flips `loans.verificationRequired` (`:144-167`). **No UI reaches it.** |
| GET | `/api/health` | `health.routes.ts:8` | none | Infrastructure. Not expected to have a frontend caller. |
| GET | `/api/health/ready` | `health.routes.ts:13` | none | Infrastructure. Not expected to have a frontend caller. |

### 6.4 Dead — service providers (3)

| Method | Path | Source | Guard |
|---|---|---|---|
| GET | `/api/service-providers` | `operations.routes.ts:450` | `service_providers.view` |
| POST | `/api/service-providers` | `operations.routes.ts:463` | `service_providers.create` |
| PATCH | `/api/service-providers/:id` | `operations.routes.ts:489` | `service_providers.edit` |

The whole `service_providers` resource — table, three endpoints, four permissions, and its deliberate exclusion from the scoped factory (`operations.routes.ts:432-436`) — has no UI whatsoever.

### 6.5 Dead — factory-generated (33)

| Resource | Dead endpoints | Reached | Notes |
|---|---|---|---|
| **loans** (`operations.routes.ts:50`) | `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/approve` | `GET /`, `POST /` | The approve route is faked at `loans/page.tsx:68`. |
| **verifications** (`operations.routes.ts:185`) | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/approve` | **none** | The entire resource is dead. No page anywhere mentions verifications; `src/lib/types.ts:159` defines the type and nothing imports it for a request. |
| **bank-orders** (`operations.routes.ts:215`) | `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` | `GET /` | `PATCH` is faked twice (`bank-orders/page.tsx:58`, `:64`). **Nothing in the application can create a bank order** — the page's only "create" affordance links to `/loans` (`bank-orders/page.tsx:156`). |
| **disbursements** (`operations.routes.ts:248`) | `GET /:id`, `PATCH /:id`, `POST /:id/approve` | `GET /`, `POST /` | Approve is faked at `disbursement/page.tsx:81`. |
| **settlements** (`operations.routes.ts:283`) | `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/approve` | `GET /` | **Nothing can raise a settlement invoice.** The `gross − tds = net` arithmetic guard (`operations.routes.ts:310-318`) is unreachable. |
| **transactions** (`operations.routes.ts:321`) | `GET /:id`, `POST /`, `PATCH /:id` | `GET /` | **Nothing can create a transaction.** `dashboard/stats.todays_transactions` (`operations.routes.ts:559-564`) can therefore only ever be non-zero via direct SQL or the seed script. |
| **ledger** (`operations.routes.ts:351`) | `GET /:id`, `PATCH /:id` | `GET /`, `POST /` | The `POST` is BROKEN — see §5 B3. |
| **documents** (`operations.routes.ts:380`) | `GET /:id`, `PATCH /:id`, `DELETE /:id` | `GET /`, `POST /` | `PATCH` and `DELETE` are both faked (`documents/page.tsx:104`, `:109`). |
| **funding-sources** (`operations.routes.ts:405`) | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` | **none** | The entire resource is dead, including the "a bank funding source must reference a bank" rule (`operations.routes.ts:424-428`). `loans.fundingSourceId` and `disbursements.fundingSourceId` can therefore never be set from the UI. |

Subtotal: 4 + 5 + 4 + 3 + 4 + 3 + 2 + 3 + 5 = **33 dead factory endpoints**.

### 6.6 Dead by area — summary

| Area | Total | Reached | Dead | Dead % |
|---|---|---|---|---|
| Health | 2 | 0 | 2 | 100% |
| Auth | 5 | 4 | 1 | 20% |
| Banks | 5 | 3 | 2 | 40% |
| Customers | 6 | 4 | 2 | 33% |
| Users | 6 | 4 | 2 | 33% |
| Roles | 6 | 1 | 5 | 83% |
| Teams | 4 | 1 | 3 | 75% |
| Recycle bin | 3 | 3 | 0 | **0%** |
| Audit logs | 1 | 0 | 1 | 100% |
| Notifications | 3 | 1 | 2 | 67% |
| Imports | 4 | 3 | 1 | 25% |
| Dashboard | 3 | 3 | 0 | **0%** |
| Service providers | 3 | 0 | 3 | 100% |
| Loans (incl. verification sub-route) | 7 | 2 | 5 | 71% |
| Verifications | 5 | 0 | 5 | 100% |
| Bank orders | 5 | 1 | 4 | 80% |
| Disbursements | 5 | 2 | 3 | 60% |
| Settlements | 5 | 1 | 4 | 80% |
| Transactions | 4 | 1 | 3 | 75% |
| Ledger | 4 | 2 | 2 | 50% |
| Documents | 5 | 2 | 3 | 60% |
| Funding sources | 5 | 0 | 5 | 100% |
| **Total** | **96** | **38** | **58** | **60%** |

### 6.7 The 38 endpoints the frontend does reach

| # | Method + path | Called from |
|---|---|---|
| 1 | `POST /api/auth/login` | `use-auth.tsx:187` |
| 2 | `POST /api/auth/refresh` | `use-auth.tsx:118`; `api.ts:87` (401 retry) |
| 3 | `POST /api/auth/logout` | `use-auth.tsx:223` |
| 4 | `POST /api/auth/change-password` | `change-password/page.tsx:48`; `settings/page.tsx:301` |
| 5 | `GET /api/banks` | `use-reference.tsx:67`; `banks/page.tsx:35` |
| 6 | `POST /api/banks` | `banks/page.tsx:69` |
| 7 | `PATCH /api/banks/:id` | `banks/page.tsx:97` |
| 8 | `GET /api/customers` | 10 call sites incl. `customers/page.tsx:63`, `topbar.tsx:66` |
| 9 | `GET /api/customers/:id` | `customers/[id]/page.tsx:59` |
| 10 | `POST /api/customers` | `customers/page.tsx:314` |
| 11 | `DELETE /api/customers/:id` | `customers/page.tsx:261` |
| 12 | `GET /api/users` | `use-reference.tsx:68`; `employees/page.tsx:91` |
| 13 | `POST /api/users` | `employees/page.tsx:158` |
| 14 | `PATCH /api/users/:id` | `employees/page.tsx:222` *(working tree only)* |
| 15 | `POST /api/users/:id/reset-password` | `employees/page.tsx:199` *(working tree only)* |
| 16 | `GET /api/roles` | `employees/page.tsx:94` |
| 17 | `GET /api/teams` | `use-reference.tsx:69` |
| 18 | `GET /api/loans` | 8 call sites incl. `loans/page.tsx:51` |
| 19 | `POST /api/loans` | `loans/page.tsx:83` |
| 20 | `GET /api/bank-orders` | `bank-orders/page.tsx:54`; `dashboard/page.tsx:51`; `my-work/page.tsx:58`; `customers/[id]/page.tsx:73` |
| 21 | `GET /api/disbursements` | `disbursement/page.tsx:43` |
| 22 | `POST /api/disbursements` | `disbursement/page.tsx:63` |
| 23 | `GET /api/settlements` | `settlements/page.tsx:32`; `dashboard/page.tsx:52`; `banks/page.tsx:37` |
| 24 | `GET /api/transactions` | `transactions/page.tsx:33`; `customers/[id]/page.tsx:68` |
| 25 | `GET /api/ledger` | `ledger/page.tsx:46` |
| 26 | `POST /api/ledger` | `ledger/page.tsx:63` *(BROKEN — §5 B3)* |
| 27 | `GET /api/documents` | `documents/page.tsx:52`; `my-work/page.tsx:59`; `customers/[id]/page.tsx:63` |
| 28 | `POST /api/documents` | `documents/page.tsx:81` |
| 29 | `GET /api/notifications` | `notifications/page.tsx:72` *(result discarded — §5 B1)*; `topbar.tsx:71`; `my-work/page.tsx:60` |
| 30 | `GET /api/recycle-bin` | `recycle-bin/page.tsx:43` |
| 31 | `POST /api/recycle-bin/:id/restore` | `recycle-bin/page.tsx:50` |
| 32 | `POST /api/recycle-bin/:id/permanent-delete` | `recycle-bin/page.tsx:69` |
| 33 | `GET /api/dashboard/stats` | `dashboard/page.tsx:40` |
| 34 | `GET /api/dashboard/loan-status` | `dashboard/page.tsx:41` |
| 35 | `GET /api/dashboard/bank-performance` | `dashboard/page.tsx:44` |
| 36 | `GET /api/imports/template/customers` | `customer-import-dialog.tsx:47` (raw `fetch`) |
| 37 | `POST /api/imports/customers` | `customer-import-dialog.tsx:70` |
| 38 | `POST /api/imports/:batchId/confirm` | `customer-import-dialog.tsx:86` |

At `HEAD` (before the working-tree changes), #14 and #15 are not called, and #4 is called only from `change-password/page.tsx` — which does not exist at `HEAD` either. **At `HEAD` the frontend reaches 35 endpoints.**

---

## 7. WRITE-PATH SUMMARY

Every control in the application that actually mutates PostgreSQL, in one table.

| # | Control | File:line | Endpoint | Tables written |
|---|---|---|---|---|
| 1 | Sign in | `use-auth.tsx:187` | `POST /api/auth/login` | `refresh_tokens`, `users.last_login_at`, `users.failed_login_attempts`, `audit_logs` |
| 2 | Sign out | `use-auth.tsx:223` | `POST /api/auth/logout` | `refresh_tokens.revoked_at` |
| 3 | Session refresh (automatic) | `use-auth.tsx:118`, `api.ts:87` | `POST /api/auth/refresh` | `refresh_tokens` (rotate: revoke old, insert new) |
| 4 | Change password | `change-password/page.tsx:48`; `settings/page.tsx:301` | `POST /api/auth/change-password` | `users.password_hash`, `users.must_change_password`, all `refresh_tokens`, `audit_logs` |
| 5 | Add customer | `customers/page.tsx:314` | `POST /api/customers` | `customers`, `audit_logs` |
| 6 | Delete customer (list page only) | `customers/page.tsx:261` | `DELETE /api/customers/:id` | `customers.deleted_at`, `recycle_bin_entries`, `audit_logs` |
| 7 | Import customers — stage | `customer-import-dialog.tsx:70` | `POST /api/imports/customers` | `import_batches`, `import_rows` |
| 8 | Import customers — confirm | `customer-import-dialog.tsx:86` | `POST /api/imports/:batchId/confirm` | `customers`, `import_rows`, `import_batches`, `audit_logs` |
| 9 | Create loan | `loans/page.tsx:83` | `POST /api/loans` | `loans`, `audit_logs` |
| 10 | Record disbursal | `disbursement/page.tsx:63` | `POST /api/disbursements` | `disbursements`, `audit_logs` |
| 11 | Post ledger voucher | `ledger/page.tsx:63` | `POST /api/ledger` | `ledger_entries` (with `bank_id` NULL), `audit_logs` — **BROKEN, §5 B3** |
| 12 | Record document metadata | `documents/page.tsx:81` | `POST /api/documents` | `documents`, `audit_logs` — metadata only, no bytes |
| 13 | Onboard bank | `banks/page.tsx:69` | `POST /api/banks` | `banks`, `audit_logs` |
| 14 | Pause / resume bank | `banks/page.tsx:97` | `PATCH /api/banks/:id` | `banks.status`, `audit_logs` |
| 15 | Create employee | `employees/page.tsx:158` *(working tree)* | `POST /api/users` | `users`, `user_bank_access`, `team_members`, `audit_logs` |
| 16 | Reset employee password | `employees/page.tsx:199` *(working tree)* | `POST /api/users/:id/reset-password` | `users`, `refresh_tokens` (all revoked), `audit_logs` |
| 17 | Revoke / restore employee access | `employees/page.tsx:222` *(working tree)* | `PATCH /api/users/:id` | `users.status`, `audit_logs` |
| 18 | Restore from recycle bin | `recycle-bin/page.tsx:50` | `POST /api/recycle-bin/:id/restore` | target table `deleted_at`, `recycle_bin_entries.restored_at`, `audit_logs` |
| 19 | Permanent delete | `recycle-bin/page.tsx:69` | `POST /api/recycle-bin/:id/permanent-delete` | hard `DELETE` on the target table, `recycle_bin_entries.purged_at`, `audit_logs` |

**19 real write paths across 19 screens and components.** Against them stand 36 fake handlers (§4). Of the 27 database tables, the frontend can write to 11: `users`, `user_bank_access`, `team_members`, `refresh_tokens`, `customers`, `loans`, `disbursements`, `ledger_entries`, `documents`, `banks`, `import_batches`/`import_rows`, plus `audit_logs` and `recycle_bin_entries` indirectly. **No frontend path writes to** `verifications`, `bank_orders`, `settlements`, `transactions`, `funding_sources`, `service_providers`, `roles`, `role_permissions`, `permissions`, `teams` (creation), `notifications`, or `app_settings`.

---

## 8. SILENT FAILURE: `loading` and `error` are destructured and never rendered

`useResource` returns `{ data, total, loading, error, refresh, setData }` (`use-api.ts:7-14`) and, on any failure, sets `error` and resets `data` to `[]` (`use-api.ts:64-66`). **Nine pages destructure `loading` and `error` and then render neither.** The consequence is that a 403, a network outage, an expired session, and a genuinely empty database are all rendered identically: an empty table with `0` in every KPI tile.

### Pages that destructure `loading` and `error` and render neither

| Page | Destructured at | `loading` rendered? | `error` rendered? |
|---|---|---|---|
| `src/app/(app)/bank-orders/page.tsx` | `:54` | no | no |
| `src/app/(app)/banks/page.tsx` | `:35` | no | no |
| `src/app/(app)/disbursement/page.tsx` | `:43` | no | no |
| `src/app/(app)/documents/page.tsx` | `:52` | no | no |
| `src/app/(app)/ledger/page.tsx` | `:46` | no | no |
| `src/app/(app)/loans/page.tsx` | `:51` | no | no |
| `src/app/(app)/notifications/page.tsx` | `:72` | no | no (`refresh` is also never called) |
| `src/app/(app)/settlements/page.tsx` | `:32` | no | no |
| `src/app/(app)/transactions/page.tsx` | `:33` | no | no |

(The only `toast.error` calls in these files are in write handlers — e.g. `banks/page.tsx:90`, `ledger/page.tsx:76` — never for the read that populates the page.)

### Pages that never obtain `loading` or `error` at all

| Page | Reads | Note |
|---|---|---|
| `src/app/(app)/customers/page.tsx` | `:63` destructures only `{ data: rows, refresh }` | A `customers.view` 403 renders as "No customers match this view" (`:772-788`) |
| `src/app/(app)/employees/page.tsx` *(working tree)* | `:91`, `:92`, `:93`, `:94` destructure only `{ data }` / `{ data, refresh }` | A `users.view` or `roles.view` 403 renders as an empty team with a "Team size 0" KPI. At `HEAD` this page did destructure `loading, error` (HEAD `:54`) and still rendered neither. |
| `src/app/(app)/reports/page.tsx` | `:40`, `:43` destructure only `{ data }` | A `requests.view` 403 is indistinguishable from the stale-memo bug (§5 B2) |
| `src/app/(app)/dashboard/page.tsx` | `:40-53`; `useStats` has **no `error` field in its return type** (`use-api.ts:139-176`) | §5 B6 |
| `src/components/layout/topbar.tsx` | `:66`, `:71` destructure only `{ data }` | A failed search renders "Nothing matches that." |
| `src/hooks/use-reference.tsx` | `:63-64` — `settle()` catches every rejection and substitutes `[]` | Every `employeeName()` / `bankName()` / `teamName()` silently degrades to `"Unassigned"` / `"—"` |

### Pages that do it correctly

| Page | Evidence |
|---|---|
| `src/app/(app)/recycle-bin/page.tsx` | Renders `error` in a banner at `:173-177`; gates the empty state on `!loading` at `:179` |
| `src/app/(app)/my-work/page.tsx` | Renders a loading placeholder at `:221-224`; three distinct empty states at `:249`, `:303`, `:340` (does not surface `error`) |
| `src/app/(app)/customers/[id]/page.tsx` | Renders a loading state at `:81-87` before deciding `notFound()` at `:88` |

**Two of nineteen screens surface a read failure.** Combined with the complete absence of permission gating in the sidebar (`lib/nav.ts:30-66` has no `permission` field; contrast `lib/demo/nav.ts:41`, which does), the practical effect for a scoped role is: every menu item is clickable, roughly half of them 403, and every one of those looks like a working screen over an empty database.

---

## 9. CROSS-CUTTING GAPS

| Capability | Status | Evidence |
|---|---|---|
| **Email** | **Does not exist.** | Zero provider dependencies, zero transport code, zero templates, zero `EMAIL_`/`SMTP_`/`MAIL_` environment variables. Three UI surfaces claim to send email: `settings/page.tsx:331`, `settings/page.tsx:783`, and HEAD `employees/page.tsx:318`. |
| **File storage** | **Does not exist.** | `multer` appears only in `imports.routes.ts:27-29` (memoryStorage; the buffer is parsed by ExcelJS at `:167` and discarded). `/api/documents` is JSON CRUD. `documents.storage_key` (`operations.ts:371`) is accepted by the create schema (`operations.routes.ts:399`) and never written by anything. |
| **Notifications** | **Table and endpoints exist; nothing populates them.** | `grep insert(notifications)` over `backend/src` → zero hits. Consequence: the topbar badge (`topbar.tsx:86`) is always 0, `/notifications` is always empty (independently of §5 B1), and the my-work Alerts panel (`my-work/page.tsx:321`) always shows its empty state. |
| **`app_settings` table** | **Completely dead.** | `grep appSettings` outside `db/schema` → zero hits. The entire Settings → Company tab (`settings/page.tsx:535-644`) has nowhere to persist to. |
| **Rate limiting** | **None.** | The only throttle is a per-account lockout: 8 failed attempts / 15 minutes (`auth.routes.ts:28-29`, applied at `:103-106` and `:117-125`). No IP-based or global limiter exists on any route. |
| **`mustChangePassword` enforcement** | **Client-side only.** | Written (`admin.routes.ts:208`, `:293`, `:350`), carried (`access.ts:19`, `:38`, `:82`), returned (`auth.routes.ts:70`) — and asserted **nowhere** in `backend/src/middleware/` or any route. The sole guard is the React redirect at `app-shell.tsx:39-48`. |
| **Server-side pagination** | **Implemented but unused.** | `scoped-resource.ts:140-149` returns `meta.page/pageSize/total/totalPages`; `data-table.tsx:284-311` paginates in memory and never sends `page`. Pages request 100–500 rows and paginate that slab. |
| **Server-side search** | **Implemented, used in exactly one place.** | ILIKE search exists on every scoped resource (`scoped-resource.ts:122-128`) and on customers (`customers.routes.ts:109-118`). The only caller is the topbar palette (`topbar.tsx:66-70`). Every `DataTable` search box filters in memory (`data-table.tsx:88`). `customers/page.tsx:58` even declares its `search` state without a setter, permanently `""`. |
| **CI** | **None.** | No `.github` directory, zero `.yml` files in the repository, no `Dockerfile`, no `vercel.json`, no `railway.*`, no `Procfile`. |
| **Frontend tests** | **Narrow.** | **242 backend cases across 11 files** (frontend-contract 34, partial-update 27, authorization 26, super-admin-lockout 26, employee-lifecycle 25, workflow 22, customer-lookup 20, forced-password-change 18, cookie-config 17, cors 16, session-invalidation 11) and **56 frontend cases across 5 files**, all added in Phase 1 and confined to the demo/auth boundary plus the command-palette link target. Every business screen is untested; **zero E2E**. *(This row previously read "None" / "107 … employee-lifecycle (untracked)"; that file was committed in `583897f`. Corrected 2026-09-02.)* |
| **What the contract test does and does not cover** | | `frontend-contract.test.ts:62-88` replays 25 **GET** calls the pages make and asserts `200` + a `data` property. It covers no write path, and it cannot detect any of the 36 fake handlers or the 6 broken paths in §5 — every one of those is a client-side defect that the server never sees. |

---

## 10. APPENDIX — Verification method

Every claim above was derived from source, not from documentation or comments.

1. **Call-site enumeration.** Every occurrence of `api.list|get|create|update|replace|remove|action|upload`, `apiRequest`, `useResource`, `useRecord`, `useStats`, and raw `fetch` under `src`, excluding `src/lib/demo` (which never reaches the network — `api.ts:118`) and the hook/lib definitions themselves. 78 call sites, reduced to 38 distinct METHOD+path pairs.
2. **Route enumeration.** Every `Router.get|post|patch|put|delete` in `backend/src/modules/`, plus the six conditional emissions of `createScopedResource` (`scoped-resource.ts:102`, `:155`, `:170`, `:205`, `:251`, `:271`) resolved against each of the nine resource configs. 52 hand-written + 44 generated = 96.
3. **Fake-handler identification.** Every `onClick` / `onCheckedChange` / `onValueChange` / `onSubmit` in the 19 pages and 3 shared components was traced to its handler body, and each body checked for an outbound call. A handler containing only `toast.*`, `set*` React state, `refresh()`, or `window.*` is FAKE.
4. **Permission mapping.** Every `requirePermission(...)` argument resolved through `PERMISSIONS` (`permissions.ts:11-134`) and cross-referenced against `DEFAULT_ROLES` (`permissions.ts:190-313`) to determine which roles a control 403s for.
5. **Working-tree delta.** `git diff --stat`, plus `git show HEAD:<path>` for each of the 8 modified files, to document both states.

**Unverified in this document:** nothing. Every statement carries a `file:line`. The one place this document **contradicts its own brief** is §6 — the dead-endpoint count is **58, not 69**, and the "27 distinct calls" figure is the count of hand-written endpoints reached, not the total. The derivation is shown in full in §6.7.
