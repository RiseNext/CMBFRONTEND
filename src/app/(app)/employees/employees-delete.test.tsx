/**
 * TASK 2.8 — employee delete, driven through the real page.
 * **Group D updated by Task 2.9**, which made deleted employees restorable.
 *
 * `DELETE /api/users/:id` has carried both its guards since the first commit —
 * a self-delete refusal (400) and the last-active-Super-Admin invariant (409,
 * shared with PATCH since Task 2.1) — and had **zero callers**. An employee who
 * had left could be deactivated but never removed.
 *
 * Two things carry the weight here:
 *
 *   - group B, that deleting takes an explicit second step and that cancelling
 *     anywhere issues nothing. Delete is destructive, so a single stray click
 *     must not reach the server.
 *   - group D, that the confirmation copy is **true**. When this file was written
 *     `user` was absent from `BIN_REGISTRY` and the dialog said the deletion
 *     could not be undone; group D asserted exactly that. Task 2.9 added the
 *     registry entry and routed the delete through `softDelete`, so those
 *     assertions were **inverted, not removed** — the point is that the copy and
 *     the backend cannot drift apart in either direction (D-004).
 *
 * The route answers **204** with no body, so there is nothing to adopt — success
 * is a re-read, not a merge. That is the difference from Tasks 2.6 and 2.7.
 *
 * Follows D-012 and the Task 2.4/2.6/2.7 files: `react-dom/client` + React 19's
 * `act`, no component-testing library, `vi.hoisted` for anything the mock
 * factories close over, and the real `ApiError`/`errorMessage`.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => {
  const EMP = "8d1f0f5a-4c2e-4b7a-9f61-0f2c9a3b7d10";

  const EMPLOYEE = {
    id: EMP,
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
    assignedBanks: [] as string[],
    // Task 3.7 added these to Employee. The fixtures describe a fully set-up
    // employee, so both are populated; the invitation-state cases live in
    // employees-invite-state.test.tsx.
    invitedAt: '2026-08-01T09:00:00.000Z',
    inviteAcceptedAt: '2026-08-01T10:00:00.000Z',
  };

  return {
    EMP,
    EMPLOYEE,
    apiRequestMock: vi.fn(),
    removeMock: vi.fn(),
    replaceMock: vi.fn(),
    listMock: vi.fn(),
    refreshMock: vi.fn(),
    refreshReferenceMock: vi.fn(),
    toastSuccess: vi.fn(),
    state: {
      permissions: [] as string[],
      employees: [] as (typeof EMPLOYEE)[],
    },
  };
});

const {
  EMP,
  EMPLOYEE,
  apiRequestMock,
  removeMock,
  replaceMock,
  listMock,
  refreshMock,
  refreshReferenceMock,
  toastSuccess,
} = h;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: h.apiRequestMock,
    api: {
      ...actual.api,
      remove: h.removeMock,
      replace: h.replaceMock,
      list: h.listMock,
    },
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
    banks: [],
    teams: [],
    employees: [],
    loading: false,
    refresh: h.refreshReferenceMock,
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
  toast: { success: h.toastSuccess, error: vi.fn(), info: vi.fn() },
}));

import EmployeesPage from "@/app/(app)/employees/page";

const ALL_PERMS = [
  "users.view",
  "users.edit",
  "users.assign",
  "users.create",
  "users.reset_password",
  "users.delete",
  "teams.assign",
];

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ data: { id: EMP } });
  removeMock.mockReset();
  removeMock.mockResolvedValue(undefined); // 204, no body
  replaceMock.mockReset();
  listMock.mockReset();
  listMock.mockResolvedValue({ data: [] });
  refreshMock.mockClear();
  refreshReferenceMock.mockClear();
  toastSuccess.mockClear();

  h.state.permissions = [...ALL_PERMS];
  h.state.employees = [{ ...EMPLOYEE }];

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

async function openDetail() {
  const row = Array.from(document.querySelectorAll("tr")).find((tr) =>
    tr.textContent?.includes(EMPLOYEE.employeeCode),
  );
  if (!row) throw new Error("employee row not rendered");
  await click(row);
}

/** Opens the detail dialog and clicks Delete, landing on the confirmation. */
async function openDeleteConfirm() {
  await openDetail();
  const button = buttonByText("Delete");
  if (!button) throw new Error("Delete button not rendered");
  await click(button);
}

async function confirm() {
  const button = buttonByText("Delete employee");
  if (!button) throw new Error("confirm button not rendered");
  await click(button);
}

const bodyText = () => document.body.textContent ?? "";

const dialogText = (): string =>
  Array.from(document.querySelectorAll("p, h2"))
    .map((n) => n.textContent ?? "")
    .join(" ");

/* ------------------------------------------------------------------ group A */

describe("A — the control and its permission gate", () => {
  it("1. is offered when the user holds users.delete", async () => {
    const page = await mountPage();
    await openDetail();
    expect(buttonByText("Delete")).toBeTruthy();
    await page.unmount();
  });

  it("2. is absent without users.delete, even holding every other employee permission", async () => {
    // Delete is its own route and its own permission. Inferring it from
    // `users.edit`, or from the actor being a Super Admin, would be recreating
    // authorization in React.
    h.state.permissions = ALL_PERMS.filter((p) => p !== "users.delete");
    const page = await mountPage();
    await openDetail();

    expect(buttonByText("Delete")).toBeUndefined();
    expect(buttonByText("Edit")).toBeTruthy();
    expect(buttonByText("Revoke access")).toBeTruthy();
    expect(buttonByText("Bank access")).toBeTruthy();
    expect(buttonByText("Team")).toBeTruthy();
    await page.unmount();
  });

  it("3. holding only users.delete shows Delete and nothing else", async () => {
    h.state.permissions = ["users.view", "users.delete"];
    const page = await mountPage();
    await openDetail();

    expect(buttonByText("Delete")).toBeTruthy();
    expect(buttonByText("Edit")).toBeUndefined();
    expect(buttonByText("Revoke access")).toBeUndefined();
    expect(buttonByText("Bank access")).toBeUndefined();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — deleting takes an explicit second step", () => {
  it("4. clicking Delete issues no request on its own", async () => {
    // The dangerous shape would be a button that deletes on first click.
    const page = await mountPage();
    await openDeleteConfirm();
    expect(removeMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("5. opens a confirmation naming the employee", async () => {
    const page = await mountPage();
    await openDeleteConfirm();
    expect(dialogText()).toContain("Delete Anitha Rao?");
    await page.unmount();
  });

  it("6. cancelling issues no request", async () => {
    const page = await mountPage();
    await openDeleteConfirm();
    const cancel = buttonByText("Cancel");
    if (!cancel) throw new Error("Cancel not rendered");
    await click(cancel);

    expect(removeMock).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("7. confirming issues exactly one DELETE to the right path", async () => {
    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith(`/users/${EMP}`);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — a 204 is reconciled by re-reading, not by merging", () => {
  it("8. refreshes the list and the reference data on success", async () => {
    // There is no response body to adopt, so the server is re-read instead.
    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();

    expect(refreshMock).toHaveBeenCalled();
    expect(refreshReferenceMock).toHaveBeenCalled();
    await page.unmount();
  });

  it("9. confirms success to the user", async () => {
    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();

    expect(toastSuccess).toHaveBeenCalled();
    await page.unmount();
  });

  it("10. closes the detail dialog, which now shows a deleted record", async () => {
    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();

    expect(buttonByText("Delete employee")).toBeUndefined();
    expect(buttonByText("Reset password")).toBeUndefined();
    await page.unmount();
  });

  it("11. issues no PATCH — delete is not a disguised deactivation", async () => {
    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();

    const patched = apiRequestMock.mock.calls.filter(
      ([, options]) => (options as { method?: string } | undefined)?.method === "PATCH",
    );
    expect(patched).toHaveLength(0);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

/**
 * Group D pins the confirmation copy against the backend's actual behaviour.
 *
 * Until Task 2.9 these tests asserted the opposite — that the dialog said the
 * deletion **could not be undone** and did **not** mention the recycle bin —
 * because `user` was absent from `BIN_REGISTRY` and that was the truth. 2.9 added
 * it and routed the delete through `softDelete`, so the assertions were inverted
 * rather than dropped. They exist to stop the copy and the backend drifting apart
 * in either direction.
 */
describe("D — the confirmation tells the truth about what delete does", () => {
  it("12. says the employee goes to the recycle bin", async () => {
    // Backed by `user-recycle-bin.test.ts`, which asserts exactly one bin entry
    // is written by this route.
    const page = await mountPage();
    await openDeleteConfirm();

    expect(dialogText()).toContain("moves Anitha Rao to the recycle bin");
    await page.unmount();
  });

  it("13. no longer claims the deletion is irreversible", async () => {
    const page = await mountPage();
    await openDeleteConfirm();
    const text = dialogText();

    expect(text).toMatch(/restore the record/i);
    expect(text).not.toMatch(/cannot be undone|no restore screen|database restore/i);
    await page.unmount();
  });

  it("14. warns that a restored employee comes back deactivated", async () => {
    // The one part of the promise that could mislead: restoring the record is
    // not the same as re-granting access, and the backend asserts that too.
    const page = await mountPage();
    await openDeleteConfirm();
    const text = dialogText();

    expect(text).toContain("deactivated");
    expect(text).toMatch(/granted again/i);
    await page.unmount();
  });

  it("15. still points at Revoke access as the lighter alternative", async () => {
    const page = await mountPage();
    await openDeleteConfirm();
    const text = dialogText();

    expect(text).toContain("Revoke access");
    expect(text).toContain("leaves them in the employee list");
    await page.unmount();
  });

  it("16. says the employee's logged work is kept", async () => {
    const page = await mountPage();
    await openDeleteConfirm();

    expect(dialogText()).toContain("stays in the system");
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — the server stays the authority on refusals", () => {
  it("16. surfaces the 400 for deleting your own account, verbatim", async () => {
    removeMock.mockRejectedValue(
      new ApiError(400, "bad_request", "You cannot delete your own account"),
    );

    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();

    expect(bodyText()).toContain("You cannot delete your own account");
    expect(toastSuccess).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("17. surfaces the 409 for the last active Super Admin, verbatim", async () => {
    removeMock.mockRejectedValue(
      new ApiError(409, "conflict", "The last active Super Admin cannot be removed"),
    );

    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();

    expect(bodyText()).toContain("The last active Super Admin cannot be removed");
    await page.unmount();
  });

  it("18. surfaces the 403 for a target above the actor's role level", async () => {
    removeMock.mockRejectedValue(
      new ApiError(403, "forbidden", "You cannot manage a user at or above your own role level"),
    );

    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();

    expect(bodyText()).toContain("You cannot manage a user at or above your own role level");
    await page.unmount();
  });

  it("19. shows no success and does not refresh when the delete is refused", async () => {
    removeMock.mockRejectedValue(new ApiError(409, "conflict", "Refused"));

    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("20. leaves the confirmation open on refusal so the reason is readable", async () => {
    removeMock.mockRejectedValue(new ApiError(409, "conflict", "Refused"));

    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();

    expect(buttonByText("Delete employee")).toBeTruthy();
    await page.unmount();
  });

  it("21. allows a retry after a refusal", async () => {
    removeMock.mockRejectedValueOnce(new ApiError(409, "conflict", "Refused"));
    removeMock.mockResolvedValueOnce(undefined);

    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();
    await confirm();

    expect(removeMock).toHaveBeenCalledTimes(2);
    expect(toastSuccess).toHaveBeenCalled();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group F */

describe("F — no collateral requests", () => {
  it("22. touches no bank-access or team route", async () => {
    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();

    expect(replaceMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("23. deletes only the employee that was confirmed", async () => {
    const other = { ...EMPLOYEE, id: "other-id", employeeCode: "EMP-2000", name: "Someone Else" };
    h.state.employees = [{ ...EMPLOYEE }, other];

    const page = await mountPage();
    await openDeleteConfirm();
    await confirm();

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith(`/users/${EMP}`);
    await page.unmount();
  });
});
