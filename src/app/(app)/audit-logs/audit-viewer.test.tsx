/**
 * THE AUDIT-LOG VIEWER — Task 12.4.
 *
 * `GET /api/audit-logs` shipped with the first migration and had **zero frontend
 * callers**: the append-only trail was readable only with a REST client.
 *
 * ── GROUP B IS THE ONE WITH TEETH ───────────────────────────────────────────
 *
 * Every filter must reach the SERVER as a query parameter. A screen that
 * filtered the fifty rows it holds would show a page whose contents disagree
 * with the count beneath it, and would silently hide matches on later pages.
 * So each case asserts the query the hook was called with, not the rows on
 * screen — the rows are the server's answer and are rendered as given.
 *
 * ── AND GROUP C: THE PAGER MAY NOT GUESS ────────────────────────────────────
 *
 * The route answered `{ page, pageSize }` and no total until 12.4 added one.
 * Case 10 pins that the page count is derived from `meta.total`, and case 12
 * that Next is disabled on the last page rather than offering a click that
 * lands on nothing.
 *
 * Follows D-012.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BANK = "b1000000-0000-4000-8000-000000000001";
const ACTOR = "a1000000-0000-4000-8000-000000000002";

const h = vi.hoisted(() => ({
  /** Every query the page has asked the server for, in order. */
  queries: [] as Record<string, unknown>[],
  rows: [] as unknown[],
  total: 0,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
  permissionsOfUser: [] as string[],
}));

vi.mock("@/hooks/use-api", () => ({
  useResource: (_path: string, query?: Record<string, unknown>, enabled = true) => {
    h.queries.push(query ?? {});
    return {
      data: enabled ? h.rows : [],
      total: enabled ? h.total : 0,
      loading: h.loading,
      error: h.error,
      refresh: h.refresh,
      setData: vi.fn(),
    };
  },
  useRecord: () => ({ data: null, loading: false, error: null, refresh: vi.fn() }),
  useStats: () => ({ data: null, loading: false, forbidden: false, error: null, num: () => 0 }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      name: "Signed In",
      email: "me@risenext.test",
      role: { id: "r1", key: "admin", name: "Admin", level: 10 },
      permissions: h.permissionsOfUser,
      bankIds: null,
      unrestrictedBankAccess: true,
    },
    can: (key: string) => h.permissionsOfUser.includes(key),
    canAny: (...keys: string[]) => keys.some((k) => h.permissionsOfUser.includes(k)),
    signOut: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [{ id: BANK, name: "Test Bank", shortName: "TB" }],
    employees: [{ id: ACTOR, name: "Anita Rao", roleName: "Manager" }],
    teams: [],
    loading: false,
    refresh: vi.fn(),
    bankById: () => undefined,
    bankName: () => "Test Bank",
    bankShortName: () => "TB",
    employeeById: () => undefined,
    employeeName: () => "Anita Rao",
    teamName: () => "—",
  }),
}));

import AuditLogsPage from "./page";

const ENTRY = {
  id: 42,
  occurredAt: "2026-09-06T10:15:00.000Z",
  actorId: ACTOR,
  actorEmail: "anita@risenext.test",
  actorRoleKey: "manager",
  action: "updated",
  recordType: "customer",
  recordId: "c-1",
  bankId: BANK,
  summary: "Updated customer Priya Raman",
  changes: { pan: { from: "[redacted]", to: "[redacted]" }, city: { from: "Pune", to: "Mumbai" } },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.queries = [];
  h.rows = [ENTRY];
  h.total = 1;
  h.loading = false;
  h.error = null;
  h.refresh.mockReset();
  h.permissionsOfUser = ["audit_logs.view"];

  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => {
    root.render(<AuditLogsPage />);
  });
  await act(async () => {});
}

const scope = () => document.body;
const text = () => scope().textContent ?? "";
const buttons = () => Array.from(scope().querySelectorAll("button"));
const byLabel = (label: string) => buttons().find((b) => b.getAttribute("aria-label") === label);
const lastQuery = () => h.queries.at(-1)!;

async function click(el: Element | undefined | null) {
  expect(el, "control should exist").toBeTruthy();
  await act(async () => (el as HTMLElement).click());
  await act(async () => {});
}

/** Radix's Select is not keyboard-drivable in jsdom; drive the state directly. */
async function chooseFromSelect(triggerId: string, optionText: RegExp) {
  await click(scope().querySelector(`#${triggerId}`));
  const option = Array.from(scope().querySelectorAll('[role="option"]')).find((el) =>
    optionText.test(el.textContent ?? ""),
  );
  await click(option);
}

function setDate(id: string, value: string) {
  const input = scope().querySelector<HTMLInputElement>(`#${id}`)!;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/* ══ A — honest states ════════════════════════════════════════════════════ */

describe("A · the four states are distinguishable", () => {
  it("1. a role without audit_logs.view is refused, not shown an empty trail", async () => {
    h.permissionsOfUser = [];
    await render();
    expect(text()).toMatch(/cannot read the audit trail/i);
    expect(text()).toContain("audit_logs.view");
  });

  it("2. …and it does not even ask the server", async () => {
    // `useResource`'s `enabled` flag. Requesting a 403 on every render is noise
    // in the log and a wasted round trip.
    h.permissionsOfUser = [];
    await render();
    expect(scope().querySelectorAll("tbody tr")).toHaveLength(0);
  });

  it("3. loading is not rendered as an empty trail", async () => {
    h.loading = true;
    h.rows = [];
    h.total = 0;
    await render();
    expect(text()).not.toMatch(/trail is empty/i);
  });

  it("4. a failure says so and offers a retry", async () => {
    h.rows = [];
    h.error = "Network unreachable";
    await render();
    expect(text()).toMatch(/Could not load the audit trail/i);
    expect(text()).not.toMatch(/trail is empty/i);
    await click(buttons().find((b) => /^Try again$/.test(b.textContent ?? "")));
    expect(h.refresh).toHaveBeenCalled();
  });

  it("5. an empty trail and an over-narrow filter say DIFFERENT things", async () => {
    h.rows = [];
    h.total = 0;
    await render();
    expect(text()).toMatch(/trail is empty/i);

    await chooseFromSelect("filter-action", /^approved$/);
    expect(text()).toMatch(/Nothing matches these filters/i);
  });

  it("6. an entry renders the server's own summary and actor", async () => {
    await render();
    expect(text()).toContain("Updated customer Priya Raman");
    expect(text()).toContain("anita@risenext.test");
  });
});

/* ══ B — every filter is a server query ═══════════════════════════════════ */

describe("B · filtering happens on the server, never in the browser", () => {
  it("7. THE FINDING: the record-type filter is sent as a query parameter", async () => {
    await render();
    await chooseFromSelect("filter-record-type", /^loan$/);
    expect(lastQuery()).toMatchObject({ recordType: "loan" });
  });

  it("8. so are action, actor and bank", async () => {
    await render();

    await chooseFromSelect("filter-action", /^approved$/);
    expect(lastQuery()).toMatchObject({ action: "approved" });

    await chooseFromSelect("filter-actor", /Anita Rao/);
    expect(lastQuery()).toMatchObject({ actorId: ACTOR });

    await chooseFromSelect("filter-bank", /Test Bank/);
    expect(lastQuery()).toMatchObject({ bankId: BANK });
  });

  it("9. combined filters are all sent together, so the server ANDs them", async () => {
    await render();
    await chooseFromSelect("filter-record-type", /^loan$/);
    await chooseFromSelect("filter-action", /^approved$/);
    expect(lastQuery()).toMatchObject({ recordType: "loan", action: "approved" });
  });

  it("10. the date window is sent as from/to", async () => {
    await render();
    setDate("filter-from", "2026-01-01");
    await act(async () => {});
    setDate("filter-to", "2026-09-06");
    await act(async () => {});
    expect(lastQuery()).toMatchObject({ from: "2026-01-01", to: "2026-09-06" });
  });

  it("11. an unset filter is OMITTED rather than sent as the word All", async () => {
    await render();
    const query = lastQuery();
    expect(query).not.toHaveProperty("recordType");
    expect(query).not.toHaveProperty("actorId");
    expect(query).not.toHaveProperty("bankId");
  });

  it("12. clearing the filters removes them from the query", async () => {
    await render();
    await chooseFromSelect("filter-record-type", /^loan$/);
    expect(lastQuery()).toHaveProperty("recordType");

    await click(buttons().find((b) => /^Clear filters$/.test(b.textContent ?? "")));
    expect(lastQuery()).not.toHaveProperty("recordType");
  });

  it("13. narrowing returns to page 1 — page 7 of a smaller set is empty", async () => {
    h.total = 500;
    await render();
    await click(byLabel("Next page"));
    expect(lastQuery()).toMatchObject({ page: 2 });

    await chooseFromSelect("filter-record-type", /^loan$/);
    expect(lastQuery()).toMatchObject({ page: 1 });
  });
});

/* ══ C — the pager reports the server's numbers ═══════════════════════════ */

describe("C · pagination is truthful", () => {
  it("14. THE FINDING: the page count comes from meta.total, not from rows.length", async () => {
    // 120 entries at 50 a page is 3 pages. `rows` holds one fixture, so a page
    // count derived from what is in hand would say 1.
    h.total = 120;
    await render();
    expect(text()).toContain("Page 1 of 3");
    expect(text()).toContain("120 entries");
  });

  it("15. Next asks the server for the next page", async () => {
    h.total = 120;
    await render();
    await click(byLabel("Next page"));
    expect(lastQuery()).toMatchObject({ page: 2, pageSize: 50 });
  });

  it("16. Previous is disabled on page 1 and Next on the last page", async () => {
    h.total = 20;
    await render();
    expect((byLabel("Previous page") as HTMLButtonElement).disabled).toBe(true);
    // 20 entries is one page — offering a Next that lands on nothing is the
    // shape D-004 forbids.
    expect((byLabel("Next page") as HTMLButtonElement).disabled).toBe(true);
  });

  it("17. the page size sent matches the page size the count is divided by", async () => {
    h.total = 120;
    await render();
    expect(lastQuery().pageSize).toBe(50);
    expect(text()).toContain("Page 1 of 3");
  });

  it("18. no sortable column headers are offered", async () => {
    // The route orders by occurred_at desc and takes no sort parameter. A
    // clickable header would reorder 50 rows while implying it ordered the
    // trail — D-051 constraint 5.
    await render();
    expect(scope().querySelectorAll("thead button")).toHaveLength(0);
  });

  it("19. there is no CSV export of the trail", async () => {
    // `changes` names every field that changed on every record. A one-click
    // egress path for that is not something any roadmap row asks for.
    await render();
    expect(text()).not.toMatch(/export/i);
  });
});

/* ══ D — the detail view ══════════════════════════════════════════════════ */

describe("D · an entry can be inspected", () => {
  it("20. clicking a row opens its changes", async () => {
    await render();
    await click(scope().querySelector('[data-audit-row="42"]'));
    expect(text()).toContain("Pune");
    expect(text()).toContain("Mumbai");
  });

  it("21. a redacted field is LISTED with its placeholders, not dropped", async () => {
    // Task 13.8 keeps the key so "who changed the PAN, and when" stays
    // answerable. Hiding the row would answer "nothing happened".
    await render();
    await click(scope().querySelector('[data-audit-row="42"]'));
    expect(text()).toContain("pan");
    expect(text()).toContain("[redacted]");
  });

  it("22. an entry with no field changes says so rather than showing an empty box", async () => {
    h.rows = [{ ...ENTRY, changes: null, summary: "Signed out" }];
    await render();
    await click(scope().querySelector('[data-audit-row="42"]'));
    expect(text()).toMatch(/records no field-level changes/i);
  });
});
