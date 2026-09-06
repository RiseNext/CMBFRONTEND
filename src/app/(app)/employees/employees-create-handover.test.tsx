/**
 * TASK 3.9 — the on-screen credential hand-over, driven through the real page.
 *
 * *"Keep the on-screen credential hand-over as an explicit fallback for when
 * email is unavailable — do not remove it."*
 *
 * **Before this file there was no frontend test for the hand-over at all.** It
 * could have been deleted, or quietly gated on the email having succeeded, and
 * the suite would have stayed green — which is a poor guard for a roadmap row
 * whose entire content is *"do not remove it"*. Group A is that guard: the
 * password is on screen for **every** delivery outcome, including the outage.
 *
 * Group B is the half that needed a code change. The create flow discarded the
 * `invitation` field entirely, so a mail outage and a successful send produced
 * **identical screens** — the hand-over existed but was not an *explicit*
 * fallback, because nothing told the administrator which situation they were
 * in. The outcome is now threaded through and the copy follows it, with
 * `logged` grouped with `failed` rather than `sent`: the console transport
 * delivers nothing, so from the employee's side no email arrived (**D-035**).
 *
 * Follows D-012 and the Task 2.4–3.8 files: `react-dom/client` + React 19's
 * `act`, no component-testing library, `vi.hoisted` for anything the mock
 * factories close over, and `@/components/ui/select` stubbed as a native
 * `<select>` because Radix's is not driveable in jsdom.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => {
  const EXEC_ROLE = "1c4b2f90-77a1-4f0e-a0d2-6b9a1e3c5f22";
  const NEW_ID = "9f8e7d6c-5555-4555-8555-999999999999";

  return {
    EXEC_ROLE,
    NEW_ID,
    PASSWORD: "Tk7-Rm42-Qw9x",
    apiRequestMock: vi.fn(),
    refreshMock: vi.fn(),
    refreshReferenceMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    state: { permissions: [] as string[] },
  };
});

const { EXEC_ROLE, NEW_ID, PASSWORD, apiRequestMock, refreshMock, toastSuccess } = h;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: h.apiRequestMock,
    api: { ...actual.api, remove: vi.fn(), replace: vi.fn(), list: vi.fn() },
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

vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string) => {
    const data =
      path === "/roles"
        ? [{ id: h.EXEC_ROLE, key: "executive", name: "Executive", level: 40, permissions: [] }]
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
  toast: { success: h.toastSuccess, error: h.toastError, info: vi.fn() },
}));

import EmployeesPage from "@/app/(app)/employees/page";

const ALL_PERMS = ["users.view", "users.create", "users.edit", "users.reset_password"];

/** What `POST /users` really returns, parameterised by the mail outcome. */
const createResponse = (status: "sent" | "logged" | "failed" | null) => ({
  data: { id: NEW_ID, name: "Priya Nair", email: "priya.nair@risenext.com" },
  temporaryPassword: PASSWORD,
  ...(status ? { invitation: { status, expiresInHours: 72 } } : {}),
});

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue(createResponse("logged"));
  refreshMock.mockReset();
  toastSuccess.mockReset();
  h.state.permissions = [...ALL_PERMS];

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
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  // A failing case never reaches its own unmount, and Radix renders into
  // document.body — without this one failure cascades into all the rest.
  document.body.innerHTML = "";
});

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

const buttons = () => Array.from(document.querySelectorAll("button"));

const buttonByText = (text: string) =>
  buttons().find((b) => (b.textContent ?? "").includes(text));

async function setInput(id: string, value: string) {
  const field = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!field) throw new Error(`field ${id} not rendered`);
  const proto =
    field.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(field, value);
    field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}

const bodyText = () => document.body.textContent ?? "";

/** Opens Add employee, fills the minimum valid form, and submits it. */
async function createEmployee() {
  const page = await mountPage();

  const add = buttonByText("Add employee");
  if (!add) throw new Error("Add employee button not rendered");
  await click(add);

  await setInput("emp-name", "Priya Nair");
  await setInput("emp-email", "priya.nair@risenext.com");
  await setInput("emp-role", EXEC_ROLE);

  const submit = buttons().find((b) => (b.textContent ?? "").trim() === "Create employee");
  if (!submit) throw new Error("Create employee button not rendered");
  await click(submit);

  return page;
}

/* ------------------------------------------------------------------ group A */

describe("A — the hand-over survives every delivery outcome (do NOT remove it)", () => {
  it("1. the password is shown when the provider FAILED", async () => {
    apiRequestMock.mockResolvedValue(createResponse("failed"));
    const page = await createEmployee();

    expect(bodyText()).toContain(PASSWORD);
    await page.unmount();
  });

  it("2. the password is shown when email is not configured (`logged`)", async () => {
    apiRequestMock.mockResolvedValue(createResponse("logged"));
    const page = await createEmployee();

    expect(bodyText()).toContain(PASSWORD);
    await page.unmount();
  });

  it("3. the password is shown even when the provider ACCEPTED the message", async () => {
    // 3.9 says keep it, not "keep it only on failure".
    apiRequestMock.mockResolvedValue(createResponse("sent"));
    const page = await createEmployee();

    expect(bodyText()).toContain(PASSWORD);
    await page.unmount();
  });

  it("4. the password is shown when the response carries no outcome at all", async () => {
    apiRequestMock.mockResolvedValue(createResponse(null));
    const page = await createEmployee();

    expect(bodyText()).toContain(PASSWORD);
    await page.unmount();
  });

  it("5. the hand-over panel itself is rendered, not just the raw value", async () => {
    const page = await createEmployee();
    const text = bodyText();

    expect(text).toContain("Temporary password");
    expect(text).toContain("It will not be shown again");
    await page.unmount();
  });

  it("6. the employee's email is handed over alongside it", async () => {
    const page = await createEmployee();
    expect(bodyText()).toContain("priya.nair@risenext.com");
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — the fallback is EXPLICIT about whether email worked", () => {
  it("7. a provider failure says so plainly", async () => {
    apiRequestMock.mockResolvedValue(createResponse("failed"));
    const page = await createEmployee();

    expect(bodyText()).toMatch(/could not be sent/i);
    await page.unmount();
  });

  it("8. a provider failure never claims an email is on its way", async () => {
    /*
     * The load-bearing test of this group. Before 3.9 the create flow discarded
     * `invitation` entirely, so this screen was identical to the success case
     * and the administrator had no way to know delivery had failed (D-004).
     */
    apiRequestMock.mockResolvedValue(createResponse("failed"));
    const page = await createEmployee();
    const text = bodyText();

    expect(text).not.toMatch(/was emailed|link was sent|email was sent/i);
    await page.unmount();
  });

  it("9. a provider failure says the password is the only way in", async () => {
    apiRequestMock.mockResolvedValue(createResponse("failed"));
    const page = await createEmployee();

    expect(bodyText()).toMatch(/only way in/i);
    await page.unmount();
  });

  it("10. `logged` is treated as NOT delivered, because nothing left the machine", async () => {
    apiRequestMock.mockResolvedValue(createResponse("logged"));
    const page = await createEmployee();
    const text = bodyText();

    expect(text).toMatch(/nothing was delivered|not configured/i);
    expect(text).not.toMatch(/was emailed to/i);
    await page.unmount();
  });

  it("11. a successful send says a link went out and frames the password as the fallback", async () => {
    apiRequestMock.mockResolvedValue(createResponse("sent"));
    const page = await createEmployee();
    const text = bodyText();

    expect(text).toMatch(/emailed to/i);
    expect(text).toMatch(/fallback|does not arrive/i);
    await page.unmount();
  });

  it("12. the three outcomes produce genuinely different copy", async () => {
    const said: string[] = [];
    for (const status of ["sent", "logged", "failed"] as const) {
      apiRequestMock.mockResolvedValue(createResponse(status));
      const page = await createEmployee();
      said.push(bodyText());
      await page.unmount();
      document.body.innerHTML = "";
    }

    expect(new Set(said).size).toBe(3);
  });

  it("13. an absent outcome makes no claim about email either way", async () => {
    apiRequestMock.mockResolvedValue(createResponse(null));
    const page = await createEmployee();
    const text = bodyText();

    expect(text).not.toMatch(/was emailed|could not be sent/i);
    await page.unmount();
  });

  it("14. nothing anywhere claims the employee RECEIVED anything", async () => {
    apiRequestMock.mockResolvedValue(createResponse("sent"));
    const page = await createEmployee();
    const text = bodyText();

    expect(text).not.toMatch(/\bdelivered to\b|\breceived\b/i);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — the credential does not outlive the hand-over", () => {
  it("15. it is gone once the administrator confirms they saved it", async () => {
    const page = await createEmployee();
    expect(bodyText()).toContain(PASSWORD);

    const done = buttonByText("I have saved the password");
    if (!done) throw new Error("confirm button not rendered");
    await click(done);

    expect(bodyText()).not.toContain(PASSWORD);
    await page.unmount();
  });

  it("16. it never appears in the employees table", async () => {
    const page = await createEmployee();
    const table = document.querySelector("table");

    expect(table?.textContent ?? "").not.toContain(PASSWORD);
    await page.unmount();
  });

  it("17. a second creation does not resurrect the first credential", async () => {
    const page = await createEmployee();
    const done = buttonByText("I have saved the password");
    await click(done!);
    await page.unmount();

    document.body.innerHTML = "";
    apiRequestMock.mockResolvedValue({
      data: { id: NEW_ID, name: "Priya Nair", email: "priya.nair@risenext.com" },
      invitation: { status: "sent", expiresInHours: 72 },
    });
    const second = await createEmployee();

    expect(bodyText()).not.toContain(PASSWORD);
    await second.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — no hand-over where there is nothing to hand over", () => {
  it("18. no credential panel when the server returned no password", async () => {
    // The administrator supplied their own; they already know it.
    apiRequestMock.mockResolvedValue({
      data: { id: NEW_ID, name: "Priya Nair", email: "priya.nair@risenext.com" },
      invitation: { status: "sent", expiresInHours: 72 },
    });
    const page = await createEmployee();

    expect(bodyText()).not.toContain("Temporary password");
    expect(toastSuccess).toHaveBeenCalled();
    await page.unmount();
  });

  it("19. a failed creation shows no credential", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(409, "conflict", "Email already registered"));
    const page = await createEmployee();

    expect(bodyText()).not.toContain(PASSWORD);
    await page.unmount();
  });

  it("20. a failed creation does not claim an email went out", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(409, "conflict", "Email already registered"));
    const page = await createEmployee();

    expect(bodyText()).not.toMatch(/was emailed|invitation link/i);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — only an authorized creator reaches the hand-over", () => {
  it("21. without users.create there is no Add employee control", async () => {
    h.state.permissions = ["users.view"];
    const page = await mountPage();

    expect(buttonByText("Add employee")).toBeUndefined();
    await page.unmount();
  });

  it("22. and therefore no credential can be produced from the screen", async () => {
    h.state.permissions = ["users.view"];
    const page = await mountPage();

    expect(bodyText()).not.toContain(PASSWORD);
    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("23. the gate is users.create specifically, not users.edit", async () => {
    h.state.permissions = ["users.view", "users.edit"];
    const page = await mountPage();

    expect(buttonByText("Add employee")).toBeUndefined();
    await page.unmount();
  });
});
