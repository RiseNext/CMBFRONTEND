/**
 * THE REPOSITORY-WIDE ZERO-FAKE SWEEP — Phase 16's automatable half.
 *
 * ── THE THREE GENERATIONS OF THIS CHECK ─────────────────────────────────────
 *
 * 1. `fake-controls.test.tsx` pins the **nine** BUG-002 controls **by name**.
 *    A named test can only fail for a control somebody thought to name, which
 *    is why it did not notice the next seventeen.
 * 2. `no-unbacked-success.test.tsx` (Wave 1) is the general form, and sweeps
 *    **two pages** — `/settings` and `/reports` — because those were where the
 *    audit had just found the problem.
 * 3. **This file sweeps every page in the application**, including the four
 *    Wave 4 added. It is the version that would have caught all twenty-six
 *    without anybody knowing where to look.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 *     A success claim must be accompanied by the thing it claims.
 *
 * `toast.success` may fire only if, in the same interaction, an API function
 * was called (the outcome happened on the server) or a file was produced
 * (`URL.createObjectURL` — the outcome happened locally, which is what the CSV
 * exports genuinely do). A toast with neither behind it is the D-004 shape,
 * whatever the control is called.
 *
 * ── WHY THE MOCKS ARE UNIFORM AND PERMISSIVE ────────────────────────────────
 *
 * One mock set for twenty pages, with **every permission granted**. Both
 * choices are deliberate and both make the sweep stricter:
 *
 *   · a page that needs a bespoke fixture to render a control is a page whose
 *     control this sweep would otherwise skip;
 *   · a permission-gated control that is hidden is a control that never gets
 *     clicked. Granting everything maximises the surface.
 *
 * Every list hook returns **one row**, so row-level controls exist to be
 * clicked. Dialog-opening controls are clicked too — Radix portals into
 * `document.body`, which the sweep searches — so a control inside a dialog is
 * reached on the pass after the one that opened it.
 *
 * ── WHAT IT CANNOT SEE, STATED RATHER THAN IMPLIED AWAY ─────────────────────
 *
 *   · a control that needs a **specific** fixture shape to appear at all;
 *   · a lie that is not a `toast.success` — copy that overstates what happened;
 *   · anything behind a `<select>`, which jsdom cannot drive.
 *
 * Follows D-012 — `react-dom/client` + React 19 `act`, `vi.hoisted` for
 * anything the mock factories close over.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    apiCalls: [] as string[],
    objectUrls: 0,
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    toastInfo: vi.fn(),
    track: (name: string) =>
      vi.fn(async () => {
        state.apiCalls.push(name);
        return { data: {} };
      }),
  };
  return state;
});

/** Everything a page might read. One row each, so row controls exist. */
const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "REC-1",
  name: "Sweep Record",
  status: "Active",
  bankId: "22222222-2222-4222-8222-222222222222",
  customerId: null,
  loanId: null,
  assignedUserId: null,
  createdAt: "2026-09-06T10:00:00.000Z",
  occurredAt: "2026-09-06T10:00:00.000Z",
  action: "updated",
  recordType: "customer",
  recordId: "rec-1",
  actorEmail: "someone@risenext.test",
  actorRoleKey: "admin",
  summary: "Something happened",
  changes: null,
  amountRequested: "100000",
  amountApproved: "90000",
  commission: "5000",
  balance: "0",
  loanType: "Personal Loan",
  level: 50,
  key: "swept_role",
  isSystem: false,
  isActive: true,
  permissions: [],
  members: [],
  leaderId: null,
  description: null,
  read: false,
  title: "A notification",
  message: "Body",
  severity: "info",
  fileName: "doc.pdf",
  docType: "PAN",
  label: "A binned record",
  deletedAt: "2026-09-06T09:00:00.000Z",

  /*
   * Below this line: fields added one at a time as the sweep hit a
   * `Cannot read properties of undefined` on a real page. Each is a field some
   * screen dereferences without a guard. They are FIXTURE gaps, not product
   * defects — a real API response carries them — but the list is worth keeping
   * visible, because a page that assumes an array is present is one bad payload
   * away from a blank screen.
   */
  productsOffered: [] as string[],
  assignedBanks: [] as { id: string; name: string }[],
  bankIds: [] as string[],
  commissionRate: "2.0",
  settlementCycle: "Monthly",
  spocName: "SPOC",
  spocPhone: "9848000000",
  vendorId: "VEN-1",
  portalUrl: null,
  onboardedOn: "2026-01-01T00:00:00.000Z",
  employeeCode: "EMP-0002",
  roleName: "Executive",
  roleId: "33333333-3333-4333-8333-333333333333",
  teamId: null,
  target: 0,
  achieved: 0,
  branch: "Head Office",
  joinedOn: "2026-01-01T00:00:00.000Z",
  invitedAt: null,
  inviteAcceptedAt: null,
  /** Doubles as a `Permission` row for `/roles/permissions`. */
  resource: "customers",
  linkHref: null,
  storageKey: "docs/x.pdf",
  uploadedBy: null,
  verifiedBy: null,
  checksum: null,
  stage: "Login",
  utr: null,
  netPayable: "0",
  grossAmount: "0",
  tds: "0",
  invoiceNo: "INV-1",
  reference: "REF-1",
  voucherNo: "V-1",
  credit: "0",
  debit: "0",
  entryDate: "2026-09-06T10:00:00.000Z",
  snapshot: {},
  purgeAfter: "2026-10-06T09:00:00.000Z",
  restoredAt: null,
  purgedAt: null,
};

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: h.track("apiRequest"),
    api: {
      ...actual.api,
      list: h.track("list"),
      get: h.track("get"),
      create: h.track("create"),
      update: h.track("update"),
      replace: h.track("replace"),
      remove: h.track("remove"),
      action: h.track("action"),
      upload: h.track("upload"),
      content: h.track("content"),
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: h.toastInfo, warning: vi.fn() },
}));

/** Every permission, so nothing is hidden from the sweep. */
const ALL_PERMISSIONS = [
  "customers.view", "customers.create", "customers.edit", "customers.delete",
  "customers.import", "customers.export",
  "banks.view", "banks.create", "banks.edit", "banks.delete", "banks.assign",
  "users.view", "users.create", "users.edit", "users.delete", "users.assign",
  "users.reset_password",
  "roles.view", "roles.create", "roles.edit", "roles.delete", "roles.assign_permissions",
  "teams.view", "teams.create", "teams.edit", "teams.delete", "teams.assign",
  "requests.view", "requests.create", "requests.edit", "requests.delete",
  "requests.assign", "requests.approve", "requests.import",
  "verification.view", "verification.create", "verification.edit", "verification.approve",
  "bank_orders.view", "bank_orders.create", "bank_orders.edit", "bank_orders.delete",
  "funding_sources.view", "service_providers.view",
  "disbursements.view", "disbursements.create", "disbursements.edit", "disbursements.approve",
  "settlements.view", "settlements.create", "settlements.edit", "settlements.approve",
  "transactions.view", "transactions.create", "transactions.edit",
  "ledger.view", "ledger.create", "ledger.edit",
  "documents.view", "documents.upload", "documents.verify", "documents.delete",
  "reports.view", "audit_logs.view",
  "recycle_bin.view", "recycle_bin.restore", "recycle_bin.permanent_delete",
  "settings.view", "settings.edit",
  "system.access_all_banks", "system.manage_any_user",
];

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      name: "Sweep Admin",
      email: "sweep@risenext.test",
      phone: "9848000000",
      role: { id: "r1", key: "super_admin", name: "Super Admin", level: 0 },
      permissions: ALL_PERMISSIONS,
      bankIds: null,
      unrestrictedBankAccess: true,
    },
    ready: true,
    can: () => true,
    canAny: () => true,
    signIn: vi.fn(),
    signOut: vi.fn(),
    updateUser: vi.fn(),
    exitDemoSession: () => false,
  }),
}));

vi.mock("@/hooks/use-api", () => ({
  useResource: () => ({
    data: [ROW],
    total: 1,
    loading: false,
    error: null,
    refresh: vi.fn(),
    setData: vi.fn(),
  }),
  useRecord: () => ({ data: ROW, loading: false, error: null, refresh: vi.fn() }),
  useStats: () => ({ data: {}, loading: false, forbidden: false, error: null, num: () => 0 }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [{ ...ROW, id: ROW.bankId, shortName: "SB", accentColor: "#1d4ed8", logoText: "SB" }],
    employees: [{ ...ROW, roleName: "Executive" }],
    teams: [ROW],
    loading: false,
    refresh: vi.fn(),
    bankById: () => ROW,
    bankName: () => "Sweep Bank",
    bankShortName: () => "SB",
    employeeById: () => ROW,
    employeeName: () => "Sweep Person",
    teamName: () => "Sweep Team",
  }),
  useTheme: () => ({ theme: "light", toggle: vi.fn() }),
}));

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => ({
    items: [ROW],
    unread: 1,
    loading: false,
    error: null,
    refresh: vi.fn(),
    markRead: h.track("markRead"),
    markAllRead: h.track("markAllRead"),
  }),
  NotificationsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/use-report", () => ({
  useReport: () => ({
    rows: [ROW],
    summary: { count: 1, approvedValue: "0", requestedValue: "0", commission: "0", approvedCount: 0 },
    meta: { page: 1, pageSize: 50, total: 1, totalPages: 1, complete: true, scoped: false },
    loading: false,
    error: null,
    forbidden: false,
    fetchAll: h.track("fetchAll"),
  }),
}));

const SWEPT_SETTINGS = {
  "organisation.legalName": "Sweep Ltd",
  "organisation.gstin": "",
  "organisation.pan": "",
  "organisation.address": "",
  "organisation.billingEmail": "",
  "organisation.billingPhone": "",
  "recycleBin.retentionDays": 30,
};

vi.mock("@/hooks/use-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-settings")>();
  return {
    ...actual,
    /*
     * `SWEPT_SETTINGS` is a module constant, NOT a literal built per call.
     *
     * The settings page re-seeds its draft during render when the server's
     * state object changes identity (Wave 4, D-026). A mock returning a fresh
     * literal every render therefore looks like "the server changed" on every
     * render and loops — which is exactly what this sweep hit on its first run.
     * The real hook holds it in `useState`, so it is stable; the mock has to be
     * too, or it tests the mock rather than the page.
     */
    useSettings: () => ({
      settings: SWEPT_SETTINGS,
      loading: false,
      error: null,
      forbidden: false,
      save: h.track("saveSettings"),
      reload: vi.fn(),
    }),
    useSessions: () => ({
      sessions: [
        {
          id: "s1",
          createdAt: "2026-09-06T09:00:00.000Z",
          expiresAt: "2026-10-06T09:00:00.000Z",
          userAgent: "vitest",
          ipAddress: "127.0.0.1",
          current: false,
        },
      ],
      loading: false,
      error: null,
      revoke: h.track("revokeSession"),
      reload: vi.fn(),
    }),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: ROW.id }),
}));

// Radix renders only the active tab panel. Stub so every panel mounts at once —
// a dishonest control on an inactive tab must not escape.
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Chart.js cannot measure a canvas in jsdom and throws. An environment limit,
// not a product defect, and this file sweeps CONTROLS.
//
// Each factory declares its own component. A shared `const Stub` would be a
// top-level variable referenced from a HOISTED factory, which throws
// "Cannot access 'Stub' before initialization" at collection time — the same
// hoisting rule `vi.hoisted` exists for, and the reason `h` above uses it.
vi.mock("@/components/charts/trend-chart", () => ({
  TrendChart: () => <div data-testid="chart" />,
}));
vi.mock("@/components/charts/loan-status-chart", () => ({
  LoanStatusChart: () => <div data-testid="chart" />,
}));
vi.mock("@/components/charts/bank-performance-chart", () => ({
  BankPerformanceChart: () => <div data-testid="chart" />,
}));
vi.mock("@/components/charts/employee-target-chart", () => ({
  EmployeeTargetChart: () => <div data-testid="chart" />,
}));

/* ── the pages ─────────────────────────────────────────────────────────────
 *
 * Static imports, deliberately: `vi.mock` is hoisted above them, and a dynamic
 * `import()` inside a case would resolve after the mocks were reset between
 * tests. Every page under `(app)` is here — adding one and forgetting this
 * list is the gap the sweep is meant to close, so case 22 counts them.
 */
import AuditLogsPage from "./audit-logs/page";
import BankOrdersPage from "./bank-orders/page";
import BanksPage from "./banks/page";
import ChangePasswordPage from "./change-password/page";
import CustomersPage from "./customers/page";
import DashboardPage from "./dashboard/page";
import DisbursementPage from "./disbursement/page";
import DocumentsPage from "./documents/page";
import EmployeesPage from "./employees/page";
import LedgerPage from "./ledger/page";
import LoansPage from "./loans/page";
import MyWorkPage from "./my-work/page";
import NotificationsPage from "./notifications/page";
import RecycleBinPage from "./recycle-bin/page";
import ReportsPage from "./reports/page";
import RolesPage from "./roles/page";
import SettingsPage from "./settings/page";
import SettlementsPage from "./settlements/page";
import TeamsPage from "./teams/page";
import TransactionsPage from "./transactions/page";

const PAGES: [string, () => React.JSX.Element][] = [
  ["/audit-logs", AuditLogsPage],
  ["/bank-orders", BankOrdersPage],
  ["/banks", BanksPage],
  ["/change-password", ChangePasswordPage],
  ["/customers", CustomersPage],
  ["/dashboard", DashboardPage],
  ["/disbursement", DisbursementPage],
  ["/documents", DocumentsPage],
  ["/employees", EmployeesPage],
  ["/ledger", LedgerPage],
  ["/loans", LoansPage],
  ["/my-work", MyWorkPage],
  ["/notifications", NotificationsPage],
  ["/recycle-bin", RecycleBinPage],
  ["/reports", ReportsPage],
  ["/roles", RolesPage],
  ["/settings", SettingsPage],
  ["/settlements", SettlementsPage],
  ["/teams", TeamsPage],
  ["/transactions", TransactionsPage],
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.apiCalls = [];
  h.objectUrls = 0;
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
  h.toastInfo.mockReset();

  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => {
      h.objectUrls += 1;
      return "blob:stub";
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal("print", vi.fn());
  vi.stubGlobal("open", vi.fn(() => ({ document: { write: vi.fn(), close: vi.fn() }, print: vi.fn() })));
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  if (!window.matchMedia) {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
  }

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function mount(Page: () => React.JSX.Element) {
  await act(async () => {
    root.render(<Page />);
  });
  await act(async () => {});
}

/** Radix portals into `document.body`, so the whole document is the scope. */
const controls = () =>
  Array.from(
    document.body.querySelectorAll<HTMLElement>('button, [role="switch"], [role="checkbox"]'),
  );

async function fire(el: HTMLElement) {
  h.apiCalls = [];
  h.objectUrls = 0;
  h.toastSuccess.mockClear();

  await act(async () => {
    el.click();
  });
  await act(async () => {});

  return {
    claimedSuccess: h.toastSuccess.mock.calls.length > 0,
    didSomething: h.apiCalls.length > 0 || h.objectUrls > 0,
    label:
      (el.textContent ?? "").trim().slice(0, 60) ||
      el.getAttribute("aria-label") ||
      "(unlabelled)",
  };
}

/** Clicks everything, twice over, so dialog contents are reached. */
async function sweep(Page: () => React.JSX.Element): Promise<string[]> {
  await mount(Page);
  const offenders: string[] = [];
  const clicked = new WeakSet<HTMLElement>();

  for (let pass = 0; pass < 2; pass += 1) {
    for (const el of controls()) {
      if ((el as HTMLButtonElement).disabled) continue;
      if (clicked.has(el)) continue;
      clicked.add(el);
      // A control removed from the DOM by an earlier click cannot be clicked.
      if (!el.isConnected) continue;
      const result = await fire(el);
      if (result.claimedSuccess && !result.didSomething) offenders.push(result.label);
    }
  }
  return offenders;
}

/* ══ A — every page ═══════════════════════════════════════════════════════ */

describe("A · no control on any screen claims a success it did not achieve", () => {
  for (const [route, Page] of PAGES) {
    it(`${route}`, async () => {
      const offenders = await sweep(Page);
      expect(
        offenders,
        `controls claiming an unbacked success on ${route}: ${offenders.join(" | ")}`,
      ).toEqual([]);
    });
  }
});

/* ══ B — the sweep itself stays honest ════════════════════════════════════ */

describe("B · the sweep covers what it claims to", () => {
  it("21. it can actually detect an offender", async () => {
    // Without this, a sweep that silently found no controls would pass forever.
    // A deliberate D-004 offender must be caught.
    function Offender() {
      return (
        <button
          type="button"
          onClick={() => {
            h.toastSuccess("Saved");
          }}
        >
          Fake save
        </button>
      );
    }
    const offenders = await sweep(Offender);
    expect(offenders).toContain("Fake save");
  });

  it("22. every page under (app) is in the list", async () => {
    // Adding a screen and forgetting to sweep it is the exact gap this file
    // exists to close, so the list is checked against the routes the nav knows
    // about rather than trusted.
    const { navSections } = await import("@/lib/nav");
    const swept = new Set(PAGES.map(([route]) => route));
    const missing = navSections
      .flatMap((section) => section.items.map((item) => item.href))
      .filter((href) => !swept.has(href));
    expect(missing, `navigable but never swept: ${missing.join(", ")}`).toEqual([]);
  });

  it("23. the sweep actually clicked a meaningful number of controls", async () => {
    // A mock that broke rendering would produce zero controls and a green run.
    let total = 0;
    for (const [, Page] of PAGES.slice(0, 6)) {
      await mount(Page);
      total += controls().length;
      await act(async () => root.unmount());
      root = createRoot(container);
    }
    expect(total).toBeGreaterThan(30);
  });
});
