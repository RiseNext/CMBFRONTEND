# Frontend analysis — `rise-next-banking-crm`

Read-only analysis. **No frontend file was modified.**

## 1. Stack

| | |
|---|---|
| Framework | Next.js **16.2.12**, App Router |
| React | **19.2.0** |
| Language | TypeScript 5.8, `strict: true`, path alias `@/* → ./src/*` |
| Styling | Tailwind **v4** (`@tailwindcss/postcss`), CSS custom properties |
| UI kit | shadcn-style primitives over Radix (18 components in `src/components/ui`) |
| Charts | chart.js 4 + react-chartjs-2 |
| Other | framer-motion, sonner (toasts), lucide-react |
| Package manager | npm (`package-lock.json` present) |
| Size | 9,178 lines of TS/TSX, 17 routes |
| Git | **No `.git` directory in the ZIP** — there is no history to preserve |

Scripts already present: `dev`, `build`, `start`, `lint`, `typecheck`.

## 2. Routes

```
/                       redirect shim
/login                  demo auth
/(app)/dashboard        KPIs, 3 charts, pipeline, top performers
/(app)/customers        table + create dialog + delete
/(app)/customers/[id]   customer detail
/(app)/loans            table + detail drawer
/(app)/bank-orders      table + detail drawer
/(app)/disbursement     table
/(app)/settlements      table
/(app)/ledger           table
/(app)/transactions     table
/(app)/documents        table
/(app)/reports          export actions
/(app)/banks            table + detail drawer
/(app)/employees        table + detail drawer
/(app)/notifications    list
/(app)/settings         workspace settings
```

Navigation lives in `src/lib/nav.ts` as four sections. **There is no existing UI for:**
teams, verification, service providers, funding sources, recycle bin, audit log,
role/permission management, or Excel import. Those are new screens in Step 3, not
rewiring jobs.

## 3. Data layer — how bad the demo coupling is

- **Zero `fetch` calls. Zero `process.env` reads.** Nothing in the app talks to a network.
- Every page is `"use client"` and imports static arrays directly at module scope
  from `src/lib/data/*`.
- Five pages hold `useState` seeded from those arrays (`loans`, `employees`,
  `customers`, `bank-orders`, `banks`) and mutate local state — the "fake CRUD".
- `customers/page.tsx` additionally persists to `localStorage` under key `customers`.
- `topbar.tsx` imports `customers` and `notifications` directly for the ⌘K palette
  and the unread badge.
- `login/page.tsx` imports `banks` and `employees` for the marketing panel counts.

Consequence: the demo data cannot be deleted file-by-file. Every page needs a data
hook swapped in. The UI markup itself is untouched by that change.

Two defects noted in passing (both disappear when the backend takes over):
`customers/page.tsx` generates ids as `CUS-${10037 + rows.length - seedCustomers.length}`,
which collides after any delete; and `deleteCustomer` uses `window.confirm`.

## 4. Authentication — there is none

`src/hooks/use-auth.tsx` writes a JSON blob to `localStorage["risenext.session"]`.
`src/app/login/page.tsx`:

- accepts **any** email containing `@` and **any** password of 6+ characters;
- has a **role dropdown** — the user selects Super Admin, Admin, Manager or Employee;
- prints the demo credentials on screen.

The role dropdown is the one piece of existing UI that **must** be removed in Step 3.
Letting a client assert its own role is the vulnerability, not a styling choice.

## 5. Theming — better than the brief assumes

`src/app/globals.css` already contains:

- `@custom-variant dark (&:is(.dark *))`
- a complete `:root` token set **and** a complete `.dark` override block
- `@theme inline` mapping every token to a Tailwind colour

`topbar.tsx` already renders a Sun/Moon toggle that flips `documentElement.classList`.
What is missing is only: persistence, a pre-hydration script to stop the flash, and
an audit of the ~45 hardcoded colour utilities that bypass tokens (18 of them in
`sidebar.tsx`, which is intentionally always-navy, plus `bank.accentColor` values
and the chart palettes).

Dark mode is a much smaller job than the brief implies.

## 6. Entity mapping — frontend interface → backend table

| Frontend `src/lib/types.ts` | Backend table | Notes |
|---|---|---|
| `Bank` | `banks` | all 14 fields preserved; `id` → `code`, real UUID PK added |
| `Employee` | `users` | `assignedBanks[]` → `user_bank_access` M2M; `role` string → `role_id` FK; `+ password_hash` |
| `Role` (union of 4 strings) | `roles` + `permissions` + `role_permissions` | union replaced by data-driven roles |
| `Customer` | `customers` | all 28 fields preserved; **`bank_reference_id` added (required)**; `aadhaar` changed (§7) |
| `Loan` | *deferred* | see §8 |
| `BankOrder` | *deferred* | |
| `Disbursement` | *deferred* | |
| `Settlement` | *deferred* | |
| `LedgerEntry` | *deferred* | |
| `Transaction` | *deferred* | |
| `DocumentRecord` | *deferred* | needs a blob store decision |
| `ActivityItem` | `audit_logs` | derived, not stored separately |
| `NotificationItem` | *deferred* | |

Built this step: 15 tables — `roles`, `permissions`, `role_permissions`, `users`,
`refresh_tokens`, `teams`, `team_members`, `banks`, `user_bank_access`, `customers`,
`audit_logs`, `recycle_bin_entries`, `app_settings`, `import_batches`, `import_rows`.

## 7. Two deliberate deviations from "preserve the frontend fields"

**Aadhaar.** The mock data stores full 12-digit Aadhaar numbers as plain strings
(`"1234 5678 9012"`). The backend stores a peppered SHA-256 hash plus the last four
digits. Duplicate detection and display both still work; the raw number does not sit
in Neon. The brief's security checklist bans raw card numbers and CVV but does not
mention Aadhaar, which under the Aadhaar Act s.29 and the DPDP Act 2023 carries
heavier obligations than a card PAN. The customer detail screen will render
`•••• •••• 1123`. **Say the word and I will revert this** — it is a business decision,
not a technical one.

**Bank Reference ID.** Absent from the frontend entirely; the brief requires it and
requires it to be unique per bank. Added as `NOT NULL`, enforced by a partial unique
index on `(bank_id, upper(bank_reference_id)) WHERE deleted_at IS NULL`. Any existing
customer create form will need this field added in Step 3 — a new input in an existing
dialog, not a redesign.

## 8. The gap that needs your decision

**The frontend and the brief describe two different businesses.**

The frontend is a **loan DSA / channel-partner CRM**: `Loan` carries
`interestRate`, `tenureMonths`, `emi`, `processingFee`, `commission`, `applicationNo`.
`Settlement` is a monthly *commission invoice* per bank (`grossCommission`, `tds`,
`netPayable`, `invoiceNo`). `Transaction.type` includes `"EMI Collection"`.
`BankOrder.stage` runs Login → Credit Check → Field Verification → Sanction →
Disbursal Queue. That is a business that introduces borrowers to lenders and earns
commission.

The brief describes a **money-lending intermediary**: funding/LOC requests, conditional
third-party verification, funding sources (own funds / another bank), paying the
requesting bank or the customer directly. `Settlement` there is a transfer between a
source and a destination against a disbursement — a different table with different
columns and a different meaning.

These are not reconcilable by "using the frontend fields wherever possible". Whichever
I model, roughly ten tables and every screen bound to them follow from the answer, so
I have not guessed. Options:

- **(A) Frontend wins.** Model the DSA/commission business exactly as the existing
  screens describe. Step 3 becomes mechanical rewiring. Verification, funding sources
  and service providers get added as new optional tables and new screens.
- **(B) Brief wins.** Model the funding/LOC intermediary. The Loans, Settlements,
  Ledger and Transactions screens then show fields that no longer exist and must be
  reworked — which conflicts with "preserve the existing UI".
- **(C) Both.** `requests` supersets both shapes with a discriminator. More tables,
  more nullable columns, and the UI still has to choose what to show.

I recommend **(A)** unless the Vercel app is a prototype the client has already
outgrown. Tell me which and Step 2 builds it.
