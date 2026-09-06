/**
 * TASK 2.6 — employee bank access, driven through the real page.
 *
 * `PUT /api/users/:id/banks` has existed since the first commit — transactional,
 * audited, guarded by `assertCanManageRoleLevel` on the target and
 * `assertBankAccess` per granted bank — and had **zero callers**. Bank access
 * could be set at creation and never changed from the product again.
 *
 * Task 2.5 closed the workaround: `PATCH /api/users/:id` now refuses `bankIds`
 * with a 422 that names this route. So these tests pin two things at once —
 * that the new control really calls the assignment route, and that it never
 * smuggles `bankIds` into a PATCH.
 *
 * Follows D-012 and the Task 2.4 test file: `react-dom/client` + React 19's
 * `act`, no component-testing library, `vi.hoisted` for anything the mock
 * factories close over, and the real `ApiError`/`errorMessage` kept so the
 * error assertions exercise the genuine surfacing path.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { Employee } from "@/lib/types";

const h = vi.hoisted(() => {
  const BANK_A = "aa11bbcc-1111-4111-8111-aaaaaaaaaaaa";
  const BANK_B = "bb22ccdd-2222-4222-8222-bbbbbbbbbbbb";
  const BANK_C = "cc33ddee-3333-4333-8333-cccccccccccc";

  const EMPLOYEE = {
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
    roleId: "1c4b2f90-77a1-4f0e-a0d2-6b9a1e3c5f22",
    roleKey: "executive",
    roleName: "Executive",
    roleLevel: 40,
    assignedBanks: [BANK_A] as string[],
    // Task 3.7 added these to Employee. The fixtures describe a fully set-up
    // employee, so both are populated; the invitation-state cases live in
    // employees-invite-state.test.tsx.
    invitedAt: '2026-08-01T09:00:00.000Z',
    inviteAcceptedAt: '2026-08-01T10:00:00.000Z',
  };

  return {
    BANK_A,
    BANK_B,
    BANK_C,
    EMPLOYEE,
    apiRequestMock: vi.fn(),
    replaceMock: vi.fn(),
    refreshMock: vi.fn(),
    toastSuccess: vi.fn(),
    state: {
      permissions: [] as string[],
      employees: [] as (typeof EMPLOYEE)[],
    },
  };
});

const { BANK_A, BANK_B, BANK_C, EMPLOYEE, apiRequestMock, replaceMock, refreshMock, toastSuccess } = h;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: h.apiRequestMock,
    api: { ...actual.api, replace: h.replaceMock },
  };
});

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
    banks: [
      { id: h.BANK_A, name: "HDFC Bank", shortName: "HDFC", status: "Active" },
      { id: h.BANK_B, name: "ICICI Bank", shortName: "ICICI", status: "Active" },
      { id: h.BANK_C, name: "Axis Bank", shortName: "AXIS", status: "Active" },
    ],
    teams: [],
    employees: [],
    loading: false,
    refresh: vi.fn(),
    bankName: (id?: string) =>
      id === h.BANK_A ? "HDFC Bank" : id === h.BANK_B ? "ICICI Bank" : id === h.BANK_C ? "Axis Bank" : "Unassigned",
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
  toast: { success: h.toastSuccess, error: vi.fn(), info: vi.fn() },
}));

import EmployeesPage from "@/app/(app)/employees/page";

const ALL_PERMS = ["users.view", "users.edit", "users.assign", "users.create", "users.reset_password"];

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ data: { id: EMPLOYEE.id } });
  replaceMock.mockReset();
  replaceMock.mockResolvedValue({ data: { userId: EMPLOYEE.id, bankIds: [BANK_A] } });
  refreshMock.mockClear();
  toastSuccess.mockClear();
  h.state.permissions = [...ALL_PERMS];
  h.state.employees = [{ ...EMPLOYEE, assignedBanks: [BANK_A] }];

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

async function openDetail(employee: Employee) {
  const row = Array.from(document.querySelectorAll("tr")).find((tr) =>
    tr.textContent?.includes(employee.employeeCode),
  );
  if (!row) throw new Error(`row for ${employee.employeeCode} not rendered`);
  await click(row);
}

async function openBankAccess() {
  await openDetail(EMPLOYEE as Employee);
  const button = buttonByText("Bank access");
  if (!button) throw new Error("Bank access button not rendered");
  await click(button);
}

/** The checkbox row for a bank, found by its visible label. */
function bankRow(name: string): HTMLElement {
  const label = Array.from(document.querySelectorAll("label")).find((l) =>
    l.textContent?.includes(name),
  );
  if (!label) throw new Error(`bank row "${name}" not rendered`);
  return label;
}

const isChecked = (name: string): boolean => {
  const box = bankRow(name).querySelector("button, input");
  if (!box) throw new Error(`no control inside the "${name}" row`);
  return (
    box.getAttribute("data-state") === "checked" ||
    (box as HTMLInputElement).checked === true ||
    box.getAttribute("aria-checked") === "true"
  );
};

async function toggleBank(name: string) {
  const box = bankRow(name).querySelector("button, input");
  if (!box) throw new Error(`no control inside the "${name}" row`);
  await click(box);
}

async function save() {
  const button = buttonByText("Save bank access");
  if (!button) throw new Error("Save bank access button not rendered");
  await click(button);
}

/** The single PUT the page issued: [path, body]. */
function putCall(): [string, { bankIds: string[] }] {
  expect(replaceMock).toHaveBeenCalledTimes(1);
  return replaceMock.mock.calls[0] as [string, { bankIds: string[] }];
}

/* ------------------------------------------------------------------ group A */

describe("A — the control and its permission gate", () => {
  it("1. is offered when the user holds users.assign", async () => {
    const page = await mountPage();
    await openDetail(EMPLOYEE as Employee);
    expect(buttonByText("Bank access")).toBeTruthy();
    await page.unmount();
  });

  it("13. is absent without users.assign, even with users.edit", async () => {
    // The route requires `users.assign`, NOT `users.edit`. A holder of only
    // `users.edit` would be 403'd, so the control must not be offered.
    h.state.permissions = ["users.view", "users.edit"];
    const page = await mountPage();
    await openDetail(EMPLOYEE as Employee);

    expect(buttonByText("Bank access")).toBeUndefined();
    // ...while the Task 2.4 controls, gated on users.edit, are still there.
    expect(buttonByText("Edit")).toBeTruthy();
    expect(buttonByText("Revoke access")).toBeTruthy();

    await page.unmount();
  });

  it("13b. is offered with users.assign even without users.edit", async () => {
    h.state.permissions = ["users.view", "users.assign"];
    const page = await mountPage();
    await openDetail(EMPLOYEE as Employee);

    expect(buttonByText("Bank access")).toBeTruthy();
    expect(buttonByText("Edit")).toBeUndefined();
    expect(buttonByText("Revoke access")).toBeUndefined();

    await page.unmount();
  });

  it("2. opens showing exactly the banks currently assigned", async () => {
    const page = await mountPage();
    await openBankAccess();

    expect(isChecked("HDFC Bank")).toBe(true);
    expect(isChecked("ICICI Bank")).toBe(false);
    expect(isChecked("Axis Bank")).toBe(false);
    expect(document.body.textContent).toContain("1 of 3 bank(s) selected");

    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — the request is the complete desired set", () => {
  it("3. adding a bank sends both", async () => {
    replaceMock.mockResolvedValueOnce({ data: { userId: EMPLOYEE.id, bankIds: [BANK_A, BANK_B] } });
    const page = await mountPage();
    await openBankAccess();
    await toggleBank("ICICI Bank");
    await save();

    const [path, body] = putCall();
    expect(path).toBe(`/users/${EMPLOYEE.id}/banks`);
    expect(body.bankIds.sort()).toEqual([BANK_A, BANK_B].sort());

    await page.unmount();
  });

  it("4. removing a bank sends the remaining set, not a delta", async () => {
    h.state.employees = [{ ...EMPLOYEE, assignedBanks: [BANK_A, BANK_B] }];
    replaceMock.mockResolvedValueOnce({ data: { userId: EMPLOYEE.id, bankIds: [BANK_B] } });
    const page = await mountPage();
    await openBankAccess();
    expect(isChecked("HDFC Bank")).toBe(true);
    expect(isChecked("ICICI Bank")).toBe(true);

    await toggleBank("HDFC Bank");
    await save();

    // The route is a whole-list replace, so the body must be the survivors.
    expect(putCall()[1]).toEqual({ bankIds: [BANK_B] });

    await page.unmount();
  });

  it("adding several banks sends all of them — many-to-many, not one", async () => {
    replaceMock.mockResolvedValueOnce({
      data: { userId: EMPLOYEE.id, bankIds: [BANK_A, BANK_B, BANK_C] },
    });
    const page = await mountPage();
    await openBankAccess();
    await toggleBank("ICICI Bank");
    await toggleBank("Axis Bank");
    await save();

    expect(putCall()[1].bankIds.sort()).toEqual([BANK_A, BANK_B, BANK_C].sort());
    await page.unmount();
  });

  it("5. clearing every bank sends an explicit empty array, and warns first", async () => {
    replaceMock.mockResolvedValueOnce({ data: { userId: EMPLOYEE.id, bankIds: [] } });
    const page = await mountPage();
    await openBankAccess();
    await toggleBank("HDFC Bank");

    // An empty selection is permitted, but the consequence is spelled out.
    expect(document.body.textContent).toContain("workspace");

    await save();
    expect(putCall()[1]).toEqual({ bankIds: [] });

    await page.unmount();
  });

  it("11. the bank set never rides on a PATCH", async () => {
    replaceMock.mockResolvedValueOnce({ data: { userId: EMPLOYEE.id, bankIds: [BANK_A, BANK_B] } });
    const page = await mountPage();
    await openBankAccess();
    await toggleBank("ICICI Bank");
    await save();

    // Task 2.5 made PATCH refuse `bankIds` with a 422. Nothing here may send it.
    for (const [, options] of apiRequestMock.mock.calls as [string, { body?: unknown }][]) {
      expect(JSON.stringify(options?.body ?? {})).not.toContain("bankIds");
    }
    await page.unmount();
  });

  /*
   * Written when BUG-038 was open and the team route was deliberately unwired.
   * Task 2.7 wired it, from its own dialog — so what this pins now is narrower
   * and still worth pinning: saving BANK ACCESS must not touch team membership.
   * Every assertion is unchanged; only the claim in the title moved.
   */
  it("12. the bank access dialog calls no team endpoint", async () => {
    replaceMock.mockResolvedValueOnce({ data: { userId: EMPLOYEE.id, bankIds: [BANK_B] } });
    const page = await mountPage();
    await openBankAccess();
    await toggleBank("ICICI Bank");
    await save();

    for (const [path] of replaceMock.mock.calls as [string][]) {
      expect(path).not.toContain("/teams");
      expect(path).not.toContain("/members");
    }
    for (const [path] of apiRequestMock.mock.calls as [string][]) {
      expect(path).not.toContain("/members");
    }
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — cancel, and the server's answer", () => {
  it("6. cancel issues no request at all", async () => {
    const page = await mountPage();
    await openBankAccess();
    await toggleBank("ICICI Bank");
    await toggleBank("Axis Bank");

    const cancel = buttonByText("Cancel");
    expect(cancel).toBeTruthy();
    await click(cancel!);

    expect(replaceMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("6b. reopening after cancel shows the stored set again, not the abandoned edit", async () => {
    const page = await mountPage();
    await openBankAccess();
    await toggleBank("ICICI Bank");
    await click(buttonByText("Cancel")!);

    await openBankAccess();
    expect(isChecked("HDFC Bank")).toBe(true);
    expect(isChecked("ICICI Bank")).toBe(false);

    await page.unmount();
  });

  it("7. a successful save reflects the SERVER's list and refetches", async () => {
    // The server is the authority: it answers with what it stored. Here it
    // returns something different from what was sent, and the UI must follow it.
    replaceMock.mockResolvedValueOnce({ data: { userId: EMPLOYEE.id, bankIds: [BANK_C] } });
    const page = await mountPage();
    await openBankAccess();
    await toggleBank("ICICI Bank");
    await save();

    expect(refreshMock).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith(
      "Bank access updated",
      expect.objectContaining({ description: expect.stringContaining("1 bank(s)") }),
    );
    // The dialog closed.
    expect(buttonByText("Save bank access")).toBeUndefined();

    // The detail dialog now shows the server's answer — Axis, not ICICI.
    expect(document.body.textContent).toContain("Axis Bank");

    await page.unmount();
  });

  it("7b. an empty result is described honestly", async () => {
    replaceMock.mockResolvedValueOnce({ data: { userId: EMPLOYEE.id, bankIds: [] } });
    const page = await mountPage();
    await openBankAccess();
    await toggleBank("HDFC Bank");
    await save();

    expect(toastSuccess).toHaveBeenCalledWith(
      "Bank access updated",
      expect.objectContaining({ description: expect.stringContaining("no bank access") }),
    );
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — the server stays the authority on refusals", () => {
  async function failWith(status: number, code: string, message: string) {
    replaceMock.mockRejectedValueOnce(new ApiError(status, code, message));
    const page = await mountPage();
    await openBankAccess();
    await toggleBank("ICICI Bank");
    await save();
    return page;
  }

  it("8. a 403 is shown verbatim and the dialog stays open", async () => {
    const page = await failWith(403, "forbidden", "You do not have access to this resource");

    expect(document.body.textContent).toContain("You do not have access to this resource");
    expect(buttonByText("Save bank access")).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();

    await page.unmount();
  });

  it("8b. a 403 for a target above the actor's role level is shown verbatim", async () => {
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

  it("9. a 400 for a bank that does not exist is shown verbatim", async () => {
    const page = await failWith(400, "bad_request", "One or more banks do not exist");
    expect(document.body.textContent).toContain("One or more banks do not exist");
    await page.unmount();
  });

  it("9b. a 422 validation refusal is shown verbatim", async () => {
    const page = await failWith(422, "validation_failed", "The submitted data is not valid");
    expect(document.body.textContent).toContain("The submitted data is not valid");
    await page.unmount();
  });

  it("a network failure falls back to the dialog's own message", async () => {
    replaceMock.mockRejectedValueOnce(new Error("Failed to fetch"));
    const page = await mountPage();
    await openBankAccess();
    await toggleBank("ICICI Bank");
    await save();

    expect(document.body.textContent).toContain("Failed to fetch");
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — Task 2.4 and the existing controls are untouched", () => {
  it("10. the edit dialog still sends only changed fields, via PATCH", async () => {
    const page = await mountPage();
    await openDetail(EMPLOYEE as Employee);
    await click(buttonByText("Edit")!);

    const name = document.getElementById("edit-name") as HTMLInputElement;
    expect(name).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(name, "Anitha R Rao");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(buttonByText("Save changes")!);

    const patch = apiRequestMock.mock.calls.find(
      ([, options]) => (options as { method?: string })?.method === "PATCH",
    );
    expect(patch).toBeTruthy();
    expect((patch![1] as { body: unknown }).body).toEqual({ name: "Anitha R Rao" });
    // ...and it did not become a bank-assignment request.
    expect(replaceMock).not.toHaveBeenCalled();

    await page.unmount();
  });

  it("revoke access still issues its own PATCH with only status", async () => {
    const page = await mountPage();
    await openDetail(EMPLOYEE as Employee);
    await click(buttonByText("Revoke access")!);

    const patch = apiRequestMock.mock.calls.find(
      ([, options]) => (options as { method?: string })?.method === "PATCH",
    );
    expect((patch![1] as { body: unknown }).body).toEqual({ status: "Inactive" });
    expect(replaceMock).not.toHaveBeenCalled();

    await page.unmount();
  });

  it("the read-only detail dialog and Add employee are unchanged", async () => {
    const page = await mountPage();
    expect(buttonByText("Add employee")).toBeTruthy();

    await openDetail(EMPLOYEE as Employee);
    expect(document.body.textContent).toContain("EMP-1042");
    expect(document.body.textContent).toContain("anitha.rao@risenext.com");
    expect(buttonByText("Reset password")).toBeTruthy();

    await page.unmount();
  });
});
