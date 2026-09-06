/**
 * THE REPORTS SCREEN — Tasks 11.1, 11.2 and 11.3.
 *
 * ── WHAT THIS FILE ASSERTED BEFORE, AND WHY IT MOVED ────────────────────────
 *
 * Written for Wave 1, when the page filtered `useResource("/loans")` in a
 * `useMemo`. It pinned three things: that the page renders on load (11.1, the
 * memo omitted `loans` behind an eslint suppression and the table said "Nothing
 * matched" over a full book), that the default window is not the hardcoded 2024
 * range (11.2), and that a loan timestamped late on the `to` day is included
 * (11.2, the ISO-timestamp-vs-date string comparison).
 *
 * **Task 11.3 moved the filtering into SQL.** The page no longer owns the date
 * comparison, the row set or the totals — `/api/reports/loans` does. So the
 * boundary cases moved with the behaviour, to `backend/src/tests/reports.test.ts`
 * group C, where they are asserted against the layer that now performs them.
 * Duplicating them here against a mock would assert only that the mock works.
 *
 * What remains here is what the PAGE still owns:
 *   · the window it opens on, and that it is relative rather than hardcoded;
 *   · that filters reach the server as query parameters at all;
 *   · that the tiles report the SERVER's aggregate and never a sum of the page;
 *   · honest loading / error / permission state (D-004, D-049).
 *
 * Follows D-012.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BANK = "b1000000-0000-4000-8000-000000000001";
const TODAY = new Date();
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const h = vi.hoisted(() => ({
  /** Every filter set the page has asked the server for, in order. */
  calls: [] as Record<string, unknown>[],
  state: {
    rows: [] as unknown[],
    summary: {
      count: 0,
      approvedValue: "0",
      requestedValue: "0",
      commission: "0",
      approvedCount: 0,
    },
    meta: { page: 1, pageSize: 50, total: 0, totalPages: 0, complete: true, scoped: false },
    loading: false,
    error: null as string | null,
    forbidden: false,
  },
  fetchAll: vi.fn(async () => [] as unknown[]),
}));

vi.mock("@/hooks/use-report", () => ({
  useReport: (filters: Record<string, unknown>) => {
    h.calls.push(filters);
    return { ...h.state, fetchAll: h.fetchAll };
  },
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

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [{ id: BANK, name: "Test Bank" }],
    employees: [],
    teams: [],
    loading: false,
    refresh: vi.fn(),
    bankById: () => undefined,
    bankName: () => "Test Bank",
    bankShortName: () => "TB",
    employeeById: () => undefined,
    employeeName: () => "Unassigned",
    teamName: () => "—",
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/charts/trend-chart", () => ({ TrendChart: () => <div /> }));
vi.mock("@/components/charts/loan-status-chart", () => ({ LoanStatusChart: () => <div /> }));

import ReportsPage from "./page";

let container: HTMLDivElement;
let root: Root;

function row(over: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    code: "LN-1",
    bankId: BANK,
    customerId: null,
    assignedUserId: null,
    loanType: "Personal Loan",
    status: "Approved",
    amountRequested: "100000",
    amountApproved: "90000",
    commission: "5000",
    appliedOn: null,
    createdAt: TODAY.toISOString(),
    ...over,
  };
}

beforeEach(() => {
  h.calls = [];
  h.state.rows = [];
  h.state.summary = {
    count: 0,
    approvedValue: "0",
    requestedValue: "0",
    commission: "0",
    approvedCount: 0,
  };
  h.state.meta = { page: 1, pageSize: 50, total: 0, totalPages: 0, complete: true, scoped: false };
  h.state.loading = false;
  h.state.error = null;
  h.state.forbidden = false;
  h.fetchAll.mockReset().mockResolvedValue([]);

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => {
    root.render(<ReportsPage />);
  });
  await act(async () => {});
}

const text = () => container.textContent ?? "";
const buttons = () => Array.from(container.querySelectorAll("button"));

/* ══ A — 11.1 / 11.2: the window the page opens on ════════════════════════ */

describe("A · the report is requested on load, over a relative window", () => {
  it("1. THE FINDING (11.1): the page asks the server immediately, without an Apply", async () => {
    await render();
    // Pre-11.1 the memo ran once against `[]` and nothing was requested until
    // the Apply button was pressed.
    expect(h.calls.length).toBeGreaterThan(0);
  });

  it("2. (11.2) the default window is not the hardcoded 2024 range", async () => {
    await render();
    const inputs = [...container.querySelectorAll("input[type=date]")] as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(inputs[0]!.value).not.toBe("2024-01-05");
    expect(inputs[1]!.value).not.toBe("2024-05-31");
    expect(inputs[1]!.value).toBe(key(TODAY));
  });

  it("3. the window is what it sends to the server", async () => {
    await render();
    const last = h.calls.at(-1)!;
    expect(last.to).toBe(key(TODAY));
    expect(String(last.from)).toMatch(/^\d{4}-04-01$/); // the Indian FY start
  });
});

/* ══ B — 11.3: the tiles report the SERVER's aggregate ════════════════════ */

describe("B · the totals describe the book, not the page", () => {
  it("4. THE FINDING (11.3): the record count comes from the summary, not `rows.length`", async () => {
    // 520 in the book, 50 on this page — the exact shape the old 500-row cap
    // could not express.
    h.state.rows = [row(), row()];
    h.state.summary = {
      count: 520,
      approvedValue: "1000000",
      requestedValue: "1200000",
      commission: "52000",
      approvedCount: 400,
    };
    h.state.meta = { page: 1, pageSize: 50, total: 520, totalPages: 11, complete: false, scoped: false };

    await render();
    expect(text()).toContain("520");
    // 2 is `rows.length`. If it appears as the record count the page has
    // regressed to summing what it fetched.
    expect(text()).not.toMatch(/\b2\s*records\b/);
  });

  it("5. it says when it is showing only part of the set", async () => {
    h.state.rows = [row()];
    h.state.summary = { ...h.state.summary, count: 520 };
    h.state.meta = { page: 1, pageSize: 50, total: 520, totalPages: 11, complete: false, scoped: false };

    await render();
    expect(text()).toMatch(/showing the first/i);
  });
});

/* ══ C — honest state ═════════════════════════════════════════════════════ */

describe("C · loading, failure and permission are distinguishable", () => {
  it("6. a 403 says the role cannot see reports — it does not render zeroes", async () => {
    // D-049, and the same defect U-4 fixed on the dashboard. Executive holds no
    // `reports.view`.
    h.state.forbidden = true;
    await render();
    expect(text()).toMatch(/role cannot view reports/i);
  });

  it("7. a failure says so rather than reporting an empty book", async () => {
    h.state.error = "Network unreachable";
    await render();
    expect(text()).toMatch(/could not load this report/i);
  });

  it("8. loading is not presented as a result", async () => {
    h.state.loading = true;
    await render();
    expect(text()).toMatch(/loading/i);
  });

  it("9. exports are disabled while the report cannot be shown", async () => {
    h.state.forbidden = true;
    await render();
    const csv = buttons().find((b) => /^CSV$/i.test((b.textContent ?? "").trim()));
    expect(csv?.disabled).toBe(true);
  });
});

/* ══ D — 11.9: exports fetch the whole set ════════════════════════════════ */

describe("D · an export is the whole report, not the page on screen", () => {
  it("10. THE FINDING (11.9): CSV calls fetchAll, not the rows it already holds", async () => {
    h.state.rows = [row(), row()];
    h.state.summary = { ...h.state.summary, count: 520 };
    await render();

    const csv = buttons().find((b) => /^CSV$/i.test((b.textContent ?? "").trim()))!;
    await act(async () => csv.click());
    await act(async () => {});

    expect(h.fetchAll).toHaveBeenCalledTimes(1);
  });

  it("11. so does the Tally export", async () => {
    h.state.rows = [row()];
    await render();

    const tally = buttons().find((b) => /tally/i.test(b.textContent ?? ""))!;
    await act(async () => tally.click());
    await act(async () => {});

    expect(h.fetchAll).toHaveBeenCalledTimes(1);
  });

  it("12. a failed export writes no file and claims nothing", async () => {
    const { toast } = await import("sonner");
    h.fetchAll.mockRejectedValueOnce(new Error("too many rows"));
    h.state.rows = [row()];
    await render();

    const csv = buttons().find((b) => /^CSV$/i.test((b.textContent ?? "").trim()))!;
    await act(async () => csv.click());
    await act(async () => {});

    // A partial export reported as complete is the shape D-004 forbids.
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});
