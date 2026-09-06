/**
 * TASK 3.7 — invitation state in the employees list.
 *
 * The roadmap asks to *"surface it in the employees list"*. What matters is not
 * that a column renders, but **what it says**: `invitedAt` records that an
 * invitation was *issued*, and the mail service reports provider acceptance at
 * best — in development it delivers nothing at all (**D-035**, **D-040**). So
 * group C exists to stop the wording drifting into "Emailed" or "Sent", which
 * would be a control reporting an outcome the system never achieved (**D-004**).
 *
 * Follows D-012 and the Task 2.4–3.6 files: `react-dom/client` + React 19's
 * `act`, no component-testing library, `vi.hoisted` for anything the mock
 * factories close over.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const base = {
    employeeCode: "EMP-1000",
    name: "Base",
    email: "base@risenext.com",
    phone: "9848011111",
    branch: "Hyderabad",
    status: "Active" as "Active" | "Inactive",
    joinedOn: "2024-04-01T00:00:00.000Z",
    target: 8_000_000,
    achieved: 3_250_000,
    avatarColor: "#1d4ed8",
    lastLoginAt: "2026-08-30T09:00:00.000Z",
    roleId: "1c4b2f90-77a1-4f0e-a0d2-6b9a1e3c5f22",
    roleKey: "executive",
    roleName: "Executive",
    roleLevel: 40,
    assignedBanks: [] as string[],
    invitedAt: null as string | null,
    inviteAcceptedAt: null as string | null,
  };

  return {
    ACCEPTED: {
      ...base,
      id: "11111111-1111-4111-8111-111111111111",
      employeeCode: "EMP-0001",
      name: "Anitha Rao",
      email: "anitha@risenext.com",
      invitedAt: "2026-08-01T09:00:00.000Z",
      inviteAcceptedAt: "2026-08-02T10:00:00.000Z",
    },
    INVITED: {
      ...base,
      id: "22222222-2222-4222-8222-222222222222",
      employeeCode: "EMP-0002",
      name: "Ravi Kumar",
      email: "ravi@risenext.com",
      invitedAt: "2026-08-03T09:00:00.000Z",
      inviteAcceptedAt: null,
    },
    NEVER: {
      ...base,
      id: "33333333-3333-4333-8333-333333333333",
      employeeCode: "EMP-0003",
      name: "Meera Iyer",
      email: "meera@risenext.com",
      invitedAt: null,
      inviteAcceptedAt: null,
    },
    refreshMock: vi.fn(),
    state: { permissions: [] as string[], employees: [] as Record<string, unknown>[] },
  };
});

const { ACCEPTED, INVITED, NEVER } = h;

vi.mock("@/components/charts/employee-target-chart", () => ({
  EmployeeTargetChart: () => null,
}));

vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string) => {
    const data = path === "/users" ? h.state.employees : [];
    return {
      data,
      total: data.length,
      loading: false,
      error: null,
      refresh: h.refreshMock,
      setData: vi.fn(),
    };
  },
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [],
    teams: [],
    employees: [],
    loading: false,
    refresh: vi.fn(),
    bankName: () => "Unassigned",
    bankById: () => undefined,
    bankShortName: () => "—",
    employeeById: () => undefined,
    employeeName: () => "Unassigned",
    teamName: () => "—",
  }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "admin-1",
      name: "Super Admin",
      email: "admin@risenext.com",
      role: { id: "sa", key: "super_admin", name: "Super Admin", level: 0 },
      permissions: h.state.permissions,
    },
    can: (permission: string) => h.state.permissions.includes(permission),
    signOut: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import EmployeesPage from "@/app/(app)/employees/page";

beforeEach(() => {
  h.state.permissions = ["users.view", "users.edit"];
  h.state.employees = [ACCEPTED, INVITED, NEVER];

  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  if (!window.matchMedia) {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));
  }
});

afterEach(() => vi.unstubAllGlobals());

async function mountPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(<EmployeesPage />);
  });
  return {
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/**
 * The invitation-state cell of a row.
 *
 * Asserted specifically rather than against the whole row: an earlier version of
 * this file matched on row text and a fixture named "Anitha Accepted" made the
 * assertion pass for the wrong reason. Reversion-testing caught it.
 */
function stateCell(code: string): string {
  const cells = Array.from(rowFor(code).querySelectorAll("td"));
  const cell = cells.find((td) =>
    ["Accepted", "Invited", "Not invited"].includes((td.textContent ?? "").trim()),
  );
  return (cell?.textContent ?? "").trim();
}

/** The table row for an employee, by their code. */
function rowFor(code: string): HTMLTableRowElement {
  const row = Array.from(document.querySelectorAll("tr")).find((tr) =>
    tr.textContent?.includes(code),
  );
  if (!row) throw new Error(`row ${code} not rendered`);
  return row as HTMLTableRowElement;
}

const bodyText = () => document.body.textContent ?? "";

/* ------------------------------------------------------------------ group A */

describe("A — the three states are distinguishable in the list", () => {
  it("1. an accepted employee reads Accepted", async () => {
    const page = await mountPage();
    expect(stateCell("EMP-0001")).toBe("Accepted");
    await page.unmount();
  });

  it("2. an invited-but-waiting employee reads Invited", async () => {
    const page = await mountPage();
    expect(stateCell("EMP-0002")).toBe("Invited");
    await page.unmount();
  });

  it("3. a never-invited employee reads Not invited", async () => {
    const page = await mountPage();
    expect(stateCell("EMP-0003")).toBe("Not invited");
    await page.unmount();
  });

  it("4. the three are genuinely different, not one label for all", async () => {
    const page = await mountPage();

    const states = [stateCell("EMP-0001"), stateCell("EMP-0002"), stateCell("EMP-0003")];
    expect(new Set(states).size).toBe(3);
    await page.unmount();
  });

  it("5. acceptance wins over issuance — a row with both reads Accepted", async () => {
    // Both timestamps are set on an accepted employee; the later state must win.
    h.state.employees = [ACCEPTED];
    const page = await mountPage();

    expect(stateCell("EMP-0001")).toBe("Accepted");
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — the detail view shows the dates", () => {
  it("6. an accepted employee shows when they accepted", async () => {
    const page = await mountPage();
    await click(rowFor("EMP-0001"));

    expect(bodyText()).toContain("Account setup");
    expect(bodyText()).toMatch(/Accepted \d/);
    await page.unmount();
  });

  it("7. a waiting employee shows when they were invited, and that it is pending", async () => {
    const page = await mountPage();
    await click(rowFor("EMP-0002"));

    expect(bodyText()).toMatch(/Invited \d/);
    expect(bodyText()).toContain("not yet accepted");
    await page.unmount();
  });

  it("8. a never-invited employee says so plainly", async () => {
    const page = await mountPage();
    await click(rowFor("EMP-0003"));

    expect(bodyText()).toContain("Never invited");
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — the wording never claims the email arrived", () => {
  it("9. nothing on the screen says Emailed, Sent or Delivered", async () => {
    /*
     * The load-bearing test. `invitedAt` records ISSUANCE — `sendEmail` reports
     * provider acceptance at best, and the console transport delivers nothing at
     * all. Any of these words would be a claim the system cannot support (D-004).
     */
    const page = await mountPage();
    const text = bodyText();

    expect(text).not.toMatch(/\bEmailed\b/i);
    expect(text).not.toMatch(/\bDelivered\b/i);
    expect(text).not.toMatch(/email sent|invitation sent/i);
    await page.unmount();
  });

  it("10. the detail view is equally careful", async () => {
    const page = await mountPage();
    await click(rowFor("EMP-0002"));
    const text = bodyText();

    expect(text).not.toMatch(/\bEmailed\b/i);
    expect(text).not.toMatch(/\bDelivered\b/i);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — nothing sensitive is surfaced", () => {
  it("11. no token or hash appears anywhere on the screen", async () => {
    const page = await mountPage();
    const text = bodyText();

    expect(text).not.toMatch(/token|tokenHash|passwordHash/i);
    await page.unmount();
  });

  it("12. the existing columns still render", async () => {
    /*
     * Adding a column must not displace what was already there.
     *
     * Deliberately not asserting the Role cell: it is declared `key: "role"`
     * with no `render`, and `Employee` carries `roleName`, so `DataTable` falls
     * back to `String(row["role"] ?? "—")` and every row shows "—". That is a
     * pre-existing defect found while writing this test, recorded in
     * NEXT_TASK.md rather than fixed here — it has nothing to do with 3.7.
     */
    const page = await mountPage();
    const row = rowFor("EMP-0001").textContent ?? "";

    expect(row).toContain("Anitha Rao");
    expect(row).toContain("anitha@risenext.com");
    expect(row).toContain("Hyderabad");
    await page.unmount();
  });
});
