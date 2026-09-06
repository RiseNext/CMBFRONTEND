/**
 * TASK 2.10 — loading, load failure, and per-field server details.
 *
 * Two independent problems, one screen:
 *
 *   - `useResource` returns `loading` and `error`, and the employees page took
 *     **neither** (`page.tsx` destructured only `data` and `refresh`). Because
 *     the hook also clears `data` when a request rejects, a failed fetch fell
 *     through to the table's "no employees" empty state — the page told the user
 *     the database was empty when in fact the request had failed. That is D-004
 *     with the failure pointing at the user rather than at the system.
 *
 *   - Validation failures return **422** with `details: {path, message}[]`
 *     (`error-handler.ts:46-55`), and the dialogs showed only the generic
 *     top-line "The submitted data is not valid". The field the server named was
 *     thrown away.
 *
 * `details` is NOT uniformly that shape — a 409 unique violation carries
 * `{ constraint }`, an object — so group C also pins that the other error paths
 * from Tasks 2.4-2.9 are unchanged.
 *
 * Follows D-012 and the Task 2.4/2.6/2.7/2.8 files: `react-dom/client` + React
 * 19's `act`, no component-testing library, `vi.hoisted` for anything the mock
 * factories close over, and the real `ApiError`/`errorMessage`.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => {
  const EMP = "8d1f0f5a-4c2e-4b7a-9f61-0f2c9a3b7d10";
  const ROLE = "1c4b2f90-77a1-4f0e-a0d2-6b9a1e3c5f22";

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
    roleId: ROLE,
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
    ROLE,
    EMPLOYEE,
    apiRequestMock: vi.fn(),
    removeMock: vi.fn(),
    replaceMock: vi.fn(),
    listMock: vi.fn(),
    createMock: vi.fn(),
    refreshMock: vi.fn(),
    toastSuccess: vi.fn(),
    state: {
      permissions: [] as string[],
      employees: [] as (typeof EMPLOYEE)[],
      loading: false,
      error: null as string | null,
    },
  };
});

const {
  EMP,
  ROLE,
  EMPLOYEE,
  apiRequestMock,
  createMock,
  refreshMock,
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
      create: h.createMock,
    },
  };
});

vi.mock("@/components/charts/employee-target-chart", () => ({
  EmployeeTargetChart: () => null,
}));

vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  const idOfTrigger = (children: React.ReactNode): string | undefined => {
    let found: string | undefined;
    React.Children.forEach(children, (child) => {
      if (React.isValidElement<{ id?: string }>(child) && child.props.id) found = child.props.id;
    });
    return found;
  };

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children?: React.ReactNode;
    }) =>
      React.createElement(
        "select",
        {
          id: idOfTrigger(children),
          value: value ?? "",
          onChange: (e: { target: { value: string } }) => onValueChange?.(e.target.value),
        },
        children,
      ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => children,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) =>
      React.createElement("option", { value }, children),
  };
});

/** Mirrors `useResource`, including that it blanks `data` when a load fails. */
vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string) => {
    const isUsers = path === "/users";
    const data = isUsers
      ? h.state.error
        ? []
        : h.state.employees
      : path === "/roles"
        ? [
            {
              id: h.ROLE,
              key: "executive",
              name: "Executive",
              description: "Field executive",
              level: 40,
              isSystem: false,
              permissions: [],
            },
          ]
        : [];
    return {
      data,
      total: data.length,
      loading: isUsers ? h.state.loading : false,
      error: isUsers ? h.state.error : null,
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
  createMock.mockReset();
  createMock.mockResolvedValue({ data: { id: EMP, name: "New", email: "new@risenext.com" } });
  h.removeMock.mockReset();
  h.replaceMock.mockReset();
  h.listMock.mockReset();
  h.listMock.mockResolvedValue({ data: [] });
  refreshMock.mockClear();
  toastSuccess.mockClear();

  h.state.permissions = [...ALL_PERMS];
  h.state.employees = [{ ...EMPLOYEE }];
  h.state.loading = false;
  h.state.error = null;

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

const bodyText = () => document.body.textContent ?? "";

const hasRow = (code: string) =>
  Array.from(document.querySelectorAll("tr")).some((tr) => tr.textContent?.includes(code));

async function openDetail() {
  const row = Array.from(document.querySelectorAll("tr")).find((tr) =>
    tr.textContent?.includes(EMPLOYEE.employeeCode),
  );
  if (!row) throw new Error("employee row not rendered");
  await click(row);
}

/** Types into a control by id, the way the existing dialogs are driven. */
async function type(id: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`#${id} not rendered`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function choose(id: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(`#${id}`);
  if (!select) throw new Error(`#${id} not rendered`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** The text of the control group containing `#id` — label, input and any error. */
function groupText(id: string): string {
  const el = document.querySelector(`#${id}`);
  if (!el) throw new Error(`#${id} not rendered`);
  return el.closest("div")?.parentElement?.textContent ?? el.parentElement?.textContent ?? "";
}

const validationError = (details: { path: string; message: string }[]) =>
  new ApiError(422, "validation_failed", "The submitted data is not valid", details);

/* ------------------------------------------------------------------ group A */

describe("A — loading is visible, and is not mistaken for an answer", () => {
  it("1. shows a loading state during the initial fetch", async () => {
    h.state.loading = true;
    h.state.employees = [];

    const page = await mountPage();

    expect(document.querySelector('[data-testid="employees-loading"]')).toBeTruthy();
    await page.unmount();
  });

  it("2. does not show the employee table while the first load is in flight", async () => {
    h.state.loading = true;
    h.state.employees = [];

    const page = await mountPage();

    expect(hasRow(EMPLOYEE.employeeCode)).toBe(false);
    // And it must not claim the list is empty either.
    expect(bodyText()).not.toMatch(/no employees/i);
    await page.unmount();
  });

  it("3. shows the table once loading finishes", async () => {
    const page = await mountPage();

    expect(document.querySelector('[data-testid="employees-loading"]')).toBeNull();
    expect(hasRow(EMPLOYEE.employeeCode)).toBe(true);
    await page.unmount();
  });

  it("4. keeps showing rows during a background refresh", async () => {
    // `loading` goes true again on a refresh. Blanking the table then would be a
    // regression, not a fix.
    h.state.loading = true;

    const page = await mountPage();

    expect(hasRow(EMPLOYEE.employeeCode)).toBe(true);
    expect(document.querySelector('[data-testid="employees-loading"]')).toBeNull();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — a failed load looks like a failure, not an empty database", () => {
  it("5. surfaces the server's message", async () => {
    h.state.error = "Could not load this list";

    const page = await mountPage();

    expect(bodyText()).toContain("Could not load this list");
    await page.unmount();
  });

  it("6. does NOT render the empty state — the bug this task exists to fix", async () => {
    h.state.error = "Could not load this list";

    const page = await mountPage();
    const text = bodyText();

    expect(text).not.toMatch(/no employees (yet|found)/i);
    expect(text).toContain("not because there are no employees");
    await page.unmount();
  });

  it("7. offers a retry that calls refresh", async () => {
    h.state.error = "Could not load this list";

    const page = await mountPage();
    const retry = buttonByText("Try again");
    expect(retry).toBeTruthy();

    await click(retry!);
    expect(refreshMock).toHaveBeenCalled();
    await page.unmount();
  });

  it("8. distinguishes failed from loading from empty", async () => {
    h.state.error = "Could not load this list";
    const failed = await mountPage();
    const failedText = bodyText();
    expect(document.querySelector('[data-testid="employees-loading"]')).toBeNull();
    await failed.unmount();

    h.state.error = null;
    h.state.loading = true;
    h.state.employees = [];
    const loadingPage = await mountPage();
    expect(document.querySelector('[data-testid="employees-loading"]')).toBeTruthy();
    expect(bodyText()).not.toBe(failedText);
    await loadingPage.unmount();
  });

  it("9. renders the normal empty state when the list is genuinely empty", async () => {
    h.state.employees = [];

    const page = await mountPage();

    expect(bodyText()).not.toContain("not because there are no employees");
    expect(buttonByText("Try again")).toBeUndefined();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — server field details reach the control they name", () => {
  async function openCreate() {
    const add = buttonByText("Add employee");
    if (!add) throw new Error("Add employee button not rendered");
    await click(add);
  }

  async function submitCreate() {
    // Fill the fields the client-side check requires so the request is issued.
    await type("emp-name", "New Person");
    await type("emp-email", "new.person@risenext.com");
    await type("emp-code", "EMP-2001");
    // `addEmployee` refuses without an explicit role (the Super-Admin-by-default
    // defect fixed in `583897f`), so the request would never be issued.
    await choose("emp-role", ROLE);
    const save = buttonByText("Create employee");
    if (!save) throw new Error("Create employee button not rendered");
    await click(save);
  }

  it("10. puts a 422 email message under the email control", async () => {
    apiRequestMock.mockRejectedValue(validationError([{ path: "email", message: "Invalid email" }]));

    const page = await mountPage();
    await openCreate();
    await submitCreate();

    expect(groupText("emp-email")).toContain("Invalid email");
    await page.unmount();
  });

  it("11. maps several details to several controls at once", async () => {
    apiRequestMock.mockRejectedValue(
      validationError([
        { path: "email", message: "Invalid email" },
        { path: "employeeCode", message: "Code already used" },
      ]),
    );

    const page = await mountPage();
    await openCreate();
    await submitCreate();

    expect(groupText("emp-email")).toContain("Invalid email");
    expect(groupText("emp-code")).toContain("Code already used");
    await page.unmount();
  });

  it("12. uses the server's wording, not a rephrasing", async () => {
    apiRequestMock.mockRejectedValue(
      validationError([{ path: "email", message: "String must contain at least 5 character(s)" }]),
    );

    const page = await mountPage();
    await openCreate();
    await submitCreate();

    expect(groupText("emp-email")).toContain("String must contain at least 5 character(s)");
    await page.unmount();
  });

  it("13. shows no success when the server refuses", async () => {
    apiRequestMock.mockRejectedValue(validationError([{ path: "email", message: "Invalid email" }]));

    const page = await mountPage();
    await openCreate();
    await submitCreate();

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(buttonByText("Create employee")).toBeTruthy();
    await page.unmount();
  });

  it("14. keeps an unmappable detail on the dialog line rather than dropping it", async () => {
    // `avatarColor` has no control in this form. The server's words must survive.
    apiRequestMock.mockRejectedValue(
      validationError([{ path: "avatarColor", message: "Too long" }]),
    );

    const page = await mountPage();
    await openCreate();
    await submitCreate();

    const text = bodyText();
    expect(text).toContain("avatarColor");
    expect(text).toContain("Too long");
    await page.unmount();
  });

  it("15. surfaces a 409 verbatim, unchanged from Task 2.4", async () => {
    // A 409 carries `details: { constraint }` — an object. Treating that as
    // field issues would crash or silently blank the message.
    apiRequestMock.mockRejectedValue(
      new ApiError(409, "conflict", "A user with this email already exists", {
        constraint: "users_email_unique",
      }),
    );

    const page = await mountPage();
    await openCreate();
    await submitCreate();

    expect(bodyText()).toContain("A user with this email already exists");
    await page.unmount();
  });

  it("16. surfaces a 403 verbatim, unchanged from Task 2.4", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(403, "forbidden", "You cannot manage a user at or above your own role level"),
    );

    const page = await mountPage();
    await openCreate();
    await submitCreate();

    expect(bodyText()).toContain("You cannot manage a user at or above your own role level");
    await page.unmount();
  });

  it("17. clears field errors when the dialog is reopened", async () => {
    apiRequestMock.mockRejectedValue(validationError([{ path: "email", message: "Invalid email" }]));

    const page = await mountPage();
    await openCreate();
    await submitCreate();
    expect(groupText("emp-email")).toContain("Invalid email");

    const cancel = buttonByText("Cancel");
    if (cancel) await click(cancel);
    await openCreate();

    expect(groupText("emp-email")).not.toContain("Invalid email");
    await page.unmount();
  });

  it("18. still runs client-side validation before any request", async () => {
    const page = await mountPage();
    await openCreate();

    // Submitting an empty form must not reach the server.
    const save = buttonByText("Create employee");
    await click(save!);

    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — the edit dialog gets the same treatment", () => {
  async function openEdit() {
    await openDetail();
    const edit = buttonByText("Edit");
    if (!edit) throw new Error("Edit button not rendered");
    await click(edit);
  }

  it("19. puts a 422 message under the edited control", async () => {
    apiRequestMock.mockRejectedValue(
      validationError([{ path: "email", message: "Invalid email" }]),
    );

    const page = await mountPage();
    await openEdit();
    // Client-side validation only checks for an "@", so this reaches the server —
    // which is the point: the server is the authority on what a valid address is.
    await type("edit-email", "taken@risenext.com");
    const save = buttonByText("Save changes");
    if (!save) throw new Error("Save changes button not rendered");
    await click(save);

    expect(groupText("edit-email")).toContain("Invalid email");
    expect(toastSuccess).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("19b. still applies client-side validation before reaching the server", async () => {
    // An address with no "@" is refused by `validateEmployeeForm` and never
    // becomes a request. Server details complement this check, not replace it.
    const page = await mountPage();
    await openEdit();
    await type("edit-email", "broken");
    const save = buttonByText("Save changes");
    await click(save!);

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(bodyText()).toContain("Enter a valid work email address.");
    await page.unmount();
  });

  it("20. still surfaces a 409 verbatim, unchanged from Task 2.4", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(409, "conflict", "The last active Super Admin cannot be removed"),
    );

    const page = await mountPage();
    await openEdit();
    await type("edit-name", "Renamed");
    const save = buttonByText("Save changes");
    await click(save!);

    expect(bodyText()).toContain("The last active Super Admin cannot be removed");
    await page.unmount();
  });

  it("21. a successful edit still succeeds", async () => {
    apiRequestMock.mockResolvedValue({ data: { id: EMP, roleId: ROLE } });

    const page = await mountPage();
    await openEdit();
    await type("edit-name", "Renamed Person");
    const save = buttonByText("Save changes");
    await click(save!);

    expect(toastSuccess).toHaveBeenCalled();
    await page.unmount();
  });
});
