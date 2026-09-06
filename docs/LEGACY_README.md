> # ⚠️ HISTORICAL / LEGACY DOCUMENTATION
>
> **This file describes the frontend as it existed BEFORE the backend was built, when it was
> a standalone mock application. It is retained for historical context only and is NOT
> authoritative. Several statements below are now false.**
>
> **For current documentation, see:**
> - [`../README.md`](../README.md) — setup, environment, demo mode
> - [`../docs/README.md`](../docs/README.md) — the documentation index and source of truth
> - [`../docs/CURRENT_STATE.md`](https://github.com/RiseNext/CMBBACKEND/blob/main/docs/CURRENT_STATE.md) — what actually works today
> - [`../docs/INTEGRATION_MAP.md`](../docs/INTEGRATION_MAP.md) — which screens reach the database
>
> **Known-false statements in this file, verified against the code:**
>
> | Claim below | Reality |
> |---|---|
> | *"Demo credentials (any of the four roles works; password is pre-filled)"* | The table has a header row and **zero data rows**. No password is pre-filled, and the role dropdown was removed — the role comes from the server. There is exactly one demo account; see [`../README.md`](../README.md#demo-mode--client-presentations-only) |
> | *"Session is stored in `localStorage` under `risenext.session`"* | No such key exists. Auth is an in-memory access token plus an httpOnly refresh cookie |
> | *"`lib/data/` seeded dummy data"* | `src/lib/data/` does not exist. Fixtures live in `src/lib/demo/` and are used **only** in demo mode |
> | *"All data is in-memory … a refresh restores the seed data"* | False for real sessions — pages call the API and data persists in PostgreSQL. True **only** in demo mode |
> | *"approve/reject"*, *"mark credited, re-initiate"*, *"verify/reject/delete"*, *"stage moves, remarks trail"*, *"dispute handling"* | These controls exist but **do not yet reach the API** — see [`../docs/INTEGRATION_MAP.md`](../docs/INTEGRATION_MAP.md) |
> | *"export Excel, CSV, PDF, Tally XML"* | CSV and Tally XML are real. "Excel" is an HTML table saved as `.xls`; "PDF" opens the browser print dialog |
> | *"role permissions"* on `/employees` | The permissions panel was a non-functional mock and has been removed |

---

# Rise Next Banking Services — Loan Tracking & Management CRM

*(Historical — see the notice above.)*

Enterprise CRM for a multi-bank DSA operation: capture customers, log files with partner
lenders, track them from login to disbursal, reconcile commission settlements, and export
everything to Excel, CSV, PDF, or Tally.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, ShadCN-style UI
primitives on Radix, Framer Motion, and Chart.js.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you land on the login screen.

**Demo credentials** (any of the four roles works; password is pre-filled):

| Role        | Email                        | Password        |
| ----------- | ---------------------------- | --------------- |

Session is stored in `localStorage` under `risenext.session`. Sign out from the sidebar or the
avatar menu.

## Modules

| Route            | What it does                                                                  |
| ---------------- | ----------------------------------------------------------------------------- |
| `/login`         | Role-based sign in with validation and demo credentials                        |
| `/dashboard`     | KPI cards, loan status doughnut, bank performance bars, trend lines, activity  |
| `/customers`     | Searchable customer book, add-customer dialog, KYC and CIBIL columns            |
| `/customers/[id]`| Full profile: personal, banking, loans, documents, transactions, timeline       |
| `/loans`         | Application register, new application with EMI calculation, approve/reject      |
| `/bank-orders`   | Stage board plus table, SLA tracking, stage moves, remarks trail                |
| `/disbursement`  | Record disbursals with UTR, mark credited, re-initiate failed transfers         |
| `/settlements`   | Commission invoices, TDS, collection progress per lender, dispute handling      |
| `/ledger`        | Receipts and payments book with voucher entry and running balance               |
| `/transactions`  | Every money movement with reference, commission, and status                     |
| `/documents`     | Drag-and-drop upload, checklist, verify/reject/delete, per-customer filing      |
| `/employees`     | Team roster, target vs achieved chart, role permissions, access revoke          |
| `/banks`         | Lender cards, vendor IDs, commission slabs, SPOC details, pause/resume          |
| `/reports`       | Filter by date, bank, employee, status; export Excel, CSV, PDF, Tally XML       |
| `/notifications` | Alert inbox with unread and critical views                                      |
| `/settings`      | Profile, company record, bank access, alert channels, security, danger zone     |

## Structure

```
src/
  app/
    (app)/            authenticated routes, wrapped by AppShell
    login/            public sign-in screen
    layout.tsx        fonts, auth provider, toaster
    globals.css       design tokens and Tailwind v4 theme
  components/
    ui/               ShadCN-style primitives (button, card, dialog, select, …)
    layout/           sidebar, topbar, app shell, section card
    shared/           data table, stat card, status badge, pipeline rail, …
    charts/           Chart.js wrappers (doughnut, bar, line, horizontal bar)
  hooks/              auth context, mobile breakpoint
  lib/
    data/             seeded dummy data (banks, customers, loans, ledger, …)
    export.ts         CSV, JSON, and Tally XML writers
    format.ts         INR currency, dates, relative time, account masking
    nav.ts            sidebar sections
    types.ts          domain types
```

## Notes

- All data is in-memory. Adding a customer, posting a voucher, or approving a loan updates
  the current session only; a refresh restores the seed data.
- `Cmd/Ctrl + K` opens search from anywhere in the app.
- The theme toggle in the top bar switches the dark palette on.
- Every table supports search, column sort, filters, pagination, and CSV export.
