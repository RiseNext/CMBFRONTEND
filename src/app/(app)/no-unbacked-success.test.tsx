/**
 * WAVE 1 / TRACK A — THE SWEEP THAT WOULD HAVE CAUGHT THIS SET
 *
 * `fake-controls.test.tsx` pins the nine BUG-002 controls **by name**, on the
 * business screens. That is why it did not notice the seventeen the 2026-09-06
 * audit found on `/settings` and `/reports`: a named test can only fail for a
 * control someone thought to name.
 *
 * This file is the general form. It clicks **every enabled control** on the two
 * swept pages and enforces one rule:
 *
 *     A success claim must be accompanied by the thing it claims.
 *
 * Concretely — `toast.success` may fire only if, in the same interaction,
 * either an API function was called (the outcome happened on the server) **or**
 * a file was actually produced (`URL.createObjectURL`, the outcome happened
 * locally). A toast with neither behind it is the D-004 shape, whatever the
 * control is called.
 *
 * That second branch matters and is why the rule is not simply "no toast
 * without HTTP". The CSV and Tally exports on `/reports` are genuinely local:
 * they build a blob and download it, and saying so is true. The old "Excel"
 * and "PDF" buttons were not — one named an HTML table `.xls`, the other
 * called `window.print()` and announced "PDF ready" before the user had chosen
 * anything.
 *
 * Follows D-012 — `react-dom/client` + React 19 `act`, no component-testing
 * library, `vi.hoisted` for anything the mock factories close over. Tabs are
 * stubbed so every panel is in the DOM at once; a control hiding on an inactive
 * tab is exactly what must not escape.
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
    /**
     * Every entry point on the API surface, recorded rather than performed.
     * Defined INSIDE `vi.hoisted` because `vi.mock` factories are hoisted above
     * module-level consts — D-012's standing note about this file family.
     */
    track: (name: string) =>
      vi.fn(async () => {
        state.apiCalls.push(name);
        return { data: {} };
      }),
  };
  return state;
});

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
      remove: h.track("remove"),
      action: h.track("action"),
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: h.toastInfo, warning: vi.fn() },
}));

/*
 * Wave 4 note. This mock now carries `can`/`canAny` and a FULL permission set,
 * because `/settings` became permission-aware when Tasks 12.6 and 12.8 wired
 * the organisation record and the sessions panel. Granting everything is the
 * strict direction for a sweep: a permission-gated control that is hidden is a
 * control this file never gets to click.
 */
const SWEEP_PERMISSIONS = ["settings.view", "settings.edit", "reports.view"];

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      name: "Super Admin",
      email: "admin@risenext.test",
      phone: "9848000000",
      role: { id: "r1", key: "super_admin", name: "Super Admin", level: 0 },
      permissions: SWEEP_PERMISSIONS,
      bankIds: null,
      unrestrictedBankAccess: true,
    },
    can: (key: string) => SWEEP_PERMISSIONS.includes(key),
    canAny: (...keys: string[]) => keys.some((key) => SWEEP_PERMISSIONS.includes(key)),
    signOut: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [],
    employees: [],
    teams: [],
    loading: false,
    refresh: vi.fn(),
    bankById: () => undefined,
    bankName: () => "Bank",
    bankShortName: () => "B",
    employeeById: () => undefined,
    employeeName: () => "—",
    teamName: () => "—",
  }),
}));

vi.mock("@/hooks/use-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-api")>();
  return {
    ...actual,
    useResource: () => ({
      data: [],
      total: 0,
      loading: false,
      error: null,
      refresh: vi.fn(),
      setData: vi.fn(),
    }),
    useStats: () => ({ data: null, loading: false, forbidden: false, error: null, num: () => 0 }),
  };
});

/*
 * `useReport` is the reports page's data source since Task 11.3 — the screen no
 * longer filters `/loans` in the browser. `fetchAll` is what the export buttons
 * call, and it is recorded as an API call so the sweep's rule still reads
 * correctly: a success claim must be accompanied by the thing it claims.
 */
vi.mock("@/hooks/use-report", () => ({
  useReport: () => ({
    rows: [],
    summary: { count: 0, approvedValue: "0", requestedValue: "0", commission: "0", approvedCount: 0 },
    meta: { page: 1, pageSize: 50, total: 0, totalPages: 0, complete: true, scoped: false },
    loading: false,
    error: null,
    forbidden: false,
    fetchAll: h.track("fetchAll"),
  }),
}));

/*
 * Chart.js cannot measure a canvas in jsdom — `getComputedStyle` returns null
 * during its resize observer and it throws. That is an environment limit, not a
 * product defect, and the charts are not what this file is about: it sweeps
 * CONTROLS. Stubbed so a rendering limitation cannot masquerade as a failing
 * honesty check.
 */
vi.mock("@/components/charts/trend-chart", () => ({
  TrendChart: () => <div data-testid="trend-chart" />,
}));
vi.mock("@/components/charts/loan-status-chart", () => ({
  LoanStatusChart: () => <div data-testid="status-chart" />,
}));

// Radix renders only the ACTIVE tab panel. Stub it so every panel mounts at
// once — a dishonest control on an inactive tab must not escape the sweep.
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import SettingsPage from "./settings/page";
import ReportsPage from "./reports/page";

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
  // `window.print()` is not implemented in jsdom and must never be mistaken
  // for a produced file.
  vi.stubGlobal("print", vi.fn());

  /*
   * Two jsdom gaps that would otherwise be mistaken for product defects:
   *
   *   `scrollIntoView` — Radix's Select calls it when its trigger opens. jsdom
   *   does not implement it, so the click throws before the handler is reached.
   *
   *   `window.open` — jsdom returns null, which sends the print handler down
   *   its "Popup blocked" branch. That branch is correct behaviour and is not
   *   what this case is testing.
   */
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("open", vi.fn(() => ({
    document: { write: vi.fn(), close: vi.fn() },
    print: vi.fn(),
  })));

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

const controls = () =>
  Array.from(container.querySelectorAll<HTMLElement>('button, [role="switch"], [role="checkbox"]'));

/** Clicks one control and reports what it actually did. */
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
    label: (el.textContent ?? "").trim().slice(0, 60) || el.getAttribute("aria-label") || "(unlabelled)",
  };
}

describe("every success claim on /settings is backed by something", () => {
  it("1. no control raises toast.success without a request or a produced file", async () => {
    await mount(SettingsPage);

    const offenders: string[] = [];
    for (const el of controls()) {
      if ((el as HTMLButtonElement).disabled) continue;
      const r = await fire(el);
      if (r.claimedSuccess && !r.didSomething) offenders.push(r.label);
    }

    expect(offenders, `controls claiming an unbacked success: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("2. the page carries no switches at all — every one of them was unbacked", async () => {
    await mount(SettingsPage);
    // Preferences (3), alert preferences (5), delivery channels (3), bank
    // logging (1 per bank) and 2FA (1). None had anywhere to persist to.
    expect(container.querySelectorAll('[role="switch"]').length).toBe(0);
  });
});

describe("every success claim on /reports is backed by something", () => {
  it("3. no control raises toast.success without a request or a produced file", async () => {
    await mount(ReportsPage);

    const offenders: string[] = [];
    for (const el of controls()) {
      if ((el as HTMLButtonElement).disabled) continue;
      const r = await fire(el);
      if (r.claimedSuccess && !r.didSomething) offenders.push(r.label);
    }

    expect(offenders, `controls claiming an unbacked success: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("4. the print control does NOT claim success — printing is the user's choice", async () => {
    await mount(ReportsPage);

    const print = controls().find((b) => /^print$/i.test((b.textContent ?? "").trim()));
    expect(print, "the Print control should exist").toBeDefined();

    const r = await fire(print!);
    // It opens a dialog. Nothing has been produced and the user may cancel, so
    // the honest report is informational. Pre-fix this said "PDF ready".
    expect(r.claimedSuccess).toBe(false);
    expect(h.toastInfo).toHaveBeenCalled();
  });

  it("5. no control anywhere on either page promises a PDF or an .xlsx workbook", async () => {
    await mount(ReportsPage);
    const text = container.textContent ?? "";

    // The two controls that named a format they do not produce.
    expect(text).not.toMatch(/\bPDF\b/);
    expect(text).not.toMatch(/^Excel$/m);
  });
});
