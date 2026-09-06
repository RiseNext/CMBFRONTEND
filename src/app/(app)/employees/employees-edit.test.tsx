/**
 * TASK 2.4 — the employee edit dialog, driven through the real page.
 *
 * `src/lib/employee-patch.test.ts` pins the diffing rules in isolation. This is
 * the other half: it mounts the real `EmployeesPage`, clicks the real row, the
 * real Edit button and the real Save button, and asserts what `apiRequest` was
 * actually handed. A control that renders but issues no request — the defect
 * that dominates this codebase, RULES §4 — cannot pass here.
 *
 * Follows D-012: `react-dom/client` + React 19's native `act`, no
 * component-testing library. `apiRequest` is the only thing replaced; the real
 * `ApiError` and `errorMessage` are kept so the error assertions exercise the
 * genuine surfacing path.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { Employee } from "@/lib/types";

/*
 * `vi.mock` factories are hoisted above every `const` in the module, so anything
 * they close over has to be created inside `vi.hoisted` — including the mutable
 * state the tests reassign between cases.
 */
const h = vi.hoisted(() => {
  const EXEC_ROLE = "1c4b2f90-77a1-4f0e-a0d2-6b9a1e3c5f22";
  const MANAGER_ROLE = "2d5c3f01-88b2-4a1f-b1e3-7cab2f4d6e33";

  const ACTIVE = {
    id: "8d1f0f5a-4c2e-4b7a-9f61-0f2c9a3b7d10",
    employeeCode: "EMP-1042",
    name: "Anitha Rao",
    email: "anitha.rao@risenext.com",
    phone: "9848011111",
    branch: "Hyderabad",
    status: "Active" as "Active" | "Inactive",
    joinedOn: "2024-04-01T00:00:00.000Z",
    target: 8_000_000,
    achieved: 3_250_000,
    avatarColor: "#1d4ed8",
    lastLoginAt: "2026-08-30T09:00:00.000Z",
    roleId: EXEC_ROLE,
    roleKey: "executive",
    roleName: "Executive",
    roleLevel: 40,
    assignedBanks: [] as string[],
    // Task 3.7 added these to Employee. The fixtures describe a fully set-up
    // employee, so both are populated; the invitation-state cases live in
    // employees-invite-state.test.tsx.
    invitedAt: '2026-08-01T09:00:00.000Z',
    inviteAcceptedAt: '2026-08-01T10:00:00.000Z',
  };

  const REVOKED = {
    ...ACTIVE,
    id: "9e2a1b6c-5d3f-4c88-a072-1e3daf4c8b21",
    employeeCode: "EMP-1043",
    name: "Ravi Kumar",
    email: "ravi.kumar@risenext.com",
    status: "Inactive" as "Active" | "Inactive",
  };

  return {
    EXEC_ROLE,
    MANAGER_ROLE,
    ACTIVE,
    REVOKED,
    apiRequestMock: vi.fn(),
    refreshMock: vi.fn(),
    toastSuccess: vi.fn(),
    state: {
      permissions: [] as string[],
      employees: [] as (typeof ACTIVE)[],
    },
  };
});

const { ACTIVE, REVOKED, apiRequestMock, refreshMock, toastSuccess } = h;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: h.apiRequestMock };
});

// Chart.js needs a canvas jsdom does not provide, and this test is about the
// dialog, not the bar chart.
vi.mock("@/components/charts/employee-target-chart", () => ({
  EmployeeTargetChart: () => null,
}));

vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string) => {
    const data =
      path === "/users"
        ? h.state.employees
        : path === "/roles"
          ? [
              { id: h.EXEC_ROLE, key: "executive", name: "Executive", description: null, level: 40, isSystem: false, permissions: [] },
              { id: h.MANAGER_ROLE, key: "manager", name: "Manager", description: null, level: 20, isSystem: false, permissions: [] },
            ]
          : [];
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
    bankShortName: () => "\u2014",
    employeeById: () => undefined,
    employeeName: () => "Unassigned",
    teamName: () => "\u2014",
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
  toast: { success: h.toastSuccess, error: vi.fn(), info: vi.fn() },
}));

import EmployeesPage from "@/app/(app)/employees/page";

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ data: { id: ACTIVE.id } });
  refreshMock.mockClear();
  toastSuccess.mockClear();
  h.state.permissions = ["users.view", "users.edit", "users.create", "users.reset_password"];
  h.state.employees = [ACTIVE];

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

const buttonByText = (text: string): HTMLButtonElement | undefined =>
  Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.trim().includes(text),
  ) as HTMLButtonElement | undefined;

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** Opens the detail dialog by clicking the employee's row in the real table. */
async function openDetail(employee: Employee) {
  const row = Array.from(document.querySelectorAll("tr")).find((tr) =>
    tr.textContent?.includes(employee.employeeCode),
  );
  if (!row) throw new Error(`row for ${employee.employeeCode} not rendered`);
  await click(row);
}

async function openEdit(employee: Employee) {
  await openDetail(employee);
  const edit = buttonByText("Edit");
  if (!edit) throw new Error("Edit button not rendered");
  await click(edit);
}

const field = (id: string): HTMLInputElement => {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (!input) throw new Error(`#${id} not rendered`);
  return input;
};

/** Types into a controlled React input the way a user would. */
async function type(id: string, value: string) {
  const input = field(id);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function save() {
  const button = buttonByText("Save changes");
  if (!button) throw new Error("Save changes button not rendered");
  await click(button);
}

/** The body of the single PATCH the page issued. */
function patchBody(): Record<string, unknown> {
  const call = apiRequestMock.mock.calls.find(
    ([, options]) => (options as { method?: string })?.method === "PATCH",
  );
  if (!call) throw new Error("no PATCH was issued");
  return (call[1] as { body: Record<string, unknown> }).body;
}

/* ------------------------------------------------------------------ group A */

describe("A — the Edit action and its permission gate", () => {
  it("1. is offered when the user holds users.edit", async () => {
    const page = await mountPage();
    await openDetail(ACTIVE);
    expect(buttonByText("Edit")).toBeTruthy();
    await page.unmount();
  });

  it("1b. is absent when the user does not hold users.edit", async () => {
    h.state.permissions = ["users.view", "users.reset_password"];
    const page = await mountPage();
    await openDetail(ACTIVE);

    expect(buttonByText("Edit")).toBeUndefined();
    // ...and so is revoke/restore, which shares the same gate. Reset password,
    // which has its own permission, is still offered.
    expect(buttonByText("Revoke access")).toBeUndefined();
    expect(buttonByText("Reset password")).toBeTruthy();

    await page.unmount();
  });

  it("2. opens populated with the employee's current values", async () => {
    const page = await mountPage();
    await openEdit(ACTIVE);

    expect(field("edit-name").value).toBe("Anitha Rao");
    expect(field("edit-email").value).toBe("anitha.rao@risenext.com");
    expect(field("edit-phone").value).toBe("9848011111");
    expect(field("edit-code").value).toBe("EMP-1042");
    expect(field("edit-branch").value).toBe("Hyderabad");
    expect(field("edit-target").value).toBe("8000000");
    expect(field("edit-achieved").value).toBe("3250000");

    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — the request carries only what changed", () => {
  it("3. changing only the name sends only the name", async () => {
    const page = await mountPage();
    await openEdit(ACTIVE);
    await type("edit-name", "Anitha R Rao");
    await save();

    const [path, options] = apiRequestMock.mock.calls[0] as [string, { method: string }];
    expect(path).toBe(`/users/${ACTIVE.id}`);
    expect(options.method).toBe("PATCH");
    expect(patchBody()).toEqual({ name: "Anitha R Rao" });

    await page.unmount();
  });

  it("4. changing only the phone sends only the phone", async () => {
    const page = await mountPage();
    await openEdit(ACTIVE);
    await type("edit-phone", "9000000000");
    await save();

    expect(patchBody()).toEqual({ phone: "9000000000" });
    await page.unmount();
  });

  it("7. changing the target to 0 sends target: 0, not an omission", async () => {
    const page = await mountPage();
    await openEdit(ACTIVE);
    await type("edit-target", "0");
    await save();

    const body = patchBody();
    expect(body).toEqual({ target: 0 });
    expect(body.target).toBe(0);
    expect("achieved" in body).toBe(false);

    await page.unmount();
  });

  it("8. changing achieved to 0 sends achieved: 0", async () => {
    const page = await mountPage();
    await openEdit(ACTIVE);
    await type("edit-achieved", "0");
    await save();

    expect(patchBody()).toEqual({ achieved: 0 });
    await page.unmount();
  });

  it("9. THE HEADLINE — editing a revoked employee does not reactivate them", async () => {
    h.state.employees = [REVOKED];
    const page = await mountPage();
    await openEdit(REVOKED);

    // Precondition: this really is the Inactive employee.
    expect(field("edit-name").value).toBe("Ravi Kumar");

    await type("edit-name", "Ravi Kumaran");
    await save();

    const body = patchBody();
    expect(body).toEqual({ name: "Ravi Kumaran" });
    expect("status" in body).toBe(false);
    expect(body.status).toBeUndefined();

    await page.unmount();
  });

  it("saving an untouched form issues no request at all", async () => {
    const page = await mountPage();
    await openEdit(ACTIVE);
    await save();

    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("14. no BUG-020 field is offered or sent", async () => {
    const page = await mountPage();
    await openEdit(ACTIVE);

    // The endpoint parses then discards these three; offering them would report
    // a success that never happened.
    expect(document.getElementById("edit-bankIds")).toBeNull();
    expect(document.getElementById("edit-teamId")).toBeNull();
    expect(document.getElementById("edit-joinedOn")).toBeNull();
    expect(document.getElementById("edit-password")).toBeNull();

    const dialogText = document.body.textContent ?? "";
    expect(dialogText).toContain("not editable here");

    await type("edit-name", "Anitha R Rao");
    await save();
    for (const key of ["bankIds", "teamId", "joinedOn", "password", "mustChangePassword"]) {
      expect(Object.keys(patchBody())).not.toContain(key);
    }

    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — the server stays the authority on refusals", () => {
  async function failWith(status: number, code: string, message: string) {
    apiRequestMock.mockRejectedValueOnce(new ApiError(status, code, message));
    const page = await mountPage();
    await openEdit(ACTIVE);
    await type("edit-name", "Anitha R Rao");
    await save();
    return page;
  }

  it("10. a 400 self-guard refusal is shown verbatim", async () => {
    const page = await failWith(400, "bad_request", "You cannot deactivate your own account");

    expect(document.body.textContent).toContain("You cannot deactivate your own account");
    // The dialog stays open so the administrator can correct the change.
    expect(document.getElementById("edit-name")).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();

    await page.unmount();
  });

  it("11. a 409 last-Super-Admin refusal is shown verbatim", async () => {
    const page = await failWith(409, "conflict", "The last active Super Admin cannot be removed");
    expect(document.body.textContent).toContain("The last active Super Admin cannot be removed");
    await page.unmount();
  });

  it("12. a 403 authorization refusal is shown verbatim", async () => {
    const page = await failWith(
      403,
      "forbidden",
      "You cannot manage a user at or above your own role level",
    );
    expect(document.body.textContent).toContain(
      "You cannot manage a user at or above your own role level",
    );
    await page.unmount();
  });

  it("a 422 validation refusal is shown verbatim", async () => {
    const page = await failWith(422, "validation_failed", "The submitted data is not valid");
    expect(document.body.textContent).toContain("The submitted data is not valid");
    await page.unmount();
  });

  it("a network failure falls back to the dialog's own message", async () => {
    apiRequestMock.mockRejectedValueOnce(new Error("Failed to fetch"));
    const page = await mountPage();
    await openEdit(ACTIVE);
    await type("edit-name", "Anitha R Rao");
    await save();

    expect(document.body.textContent).toContain("Failed to fetch");
    await page.unmount();
  });

  it("client-side validation refuses before any request", async () => {
    const page = await mountPage();
    await openEdit(ACTIVE);
    await type("edit-name", "A");
    await save();

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("full name");

    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — after a successful save", () => {
  it("13. refetches the list, confirms, and closes the dialog", async () => {
    const page = await mountPage();
    await openEdit(ACTIVE);
    await type("edit-name", "Anitha R Rao");
    await save();

    expect(refreshMock).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith(
      "Employee updated",
      expect.objectContaining({ description: "Anitha R Rao" }),
    );
    // The form is gone, so the dialog closed.
    expect(document.getElementById("edit-name")).toBeNull();

    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — the controls that already existed still work", () => {
  it("15a. revoke access still issues its own PATCH with only status", async () => {
    const page = await mountPage();
    await openDetail(ACTIVE);

    const revoke = buttonByText("Revoke access");
    expect(revoke).toBeTruthy();
    await click(revoke!);

    expect(patchBody()).toEqual({ status: "Inactive" });
    await page.unmount();
  });

  it("15b. restore access sends status: Active for a revoked employee", async () => {
    h.state.employees = [REVOKED];
    const page = await mountPage();
    await openDetail(REVOKED);

    const restore = buttonByText("Restore access");
    expect(restore).toBeTruthy();
    await click(restore!);

    expect(patchBody()).toEqual({ status: "Active" });
    await page.unmount();
  });

  it("15c. the read-only detail dialog and Add employee are untouched", async () => {
    const page = await mountPage();

    expect(buttonByText("Add employee")).toBeTruthy();

    await openDetail(ACTIVE);
    const text = document.body.textContent ?? "";
    expect(text).toContain("EMP-1042");
    expect(text).toContain("anitha.rao@risenext.com");
    expect(buttonByText("Reset password")).toBeTruthy();

    await page.unmount();
  });
});
