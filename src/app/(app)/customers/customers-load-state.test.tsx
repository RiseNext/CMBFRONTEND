/**
 * TASK 4.8 — loading, load failure, and the delete permission gate.
 *
 * The customer list destructured `{ data, refresh }` and nothing else, while
 * `useResource` also returns `loading`, `error` and `total` (`use-api.ts:7-14`)
 * — and **blanks `data` when the request rejects** (`:62-67`). A failed load
 * therefore fell through to the table's own "No customers match this view"
 * empty state: the screen reported an empty database for an outcome the request
 * never achieved. That is D-004 with the failure pointing at the user rather
 * than at the system, and it is the same defect Task 2.10 fixed on the employee
 * screen (D-031), reproduced here.
 *
 * The second half is the row **Delete** button, which was rendered to every
 * role. `DELETE /api/customers/:id` is gated on `customers.delete`
 * (`customers.routes.ts:309`), which Team Leader and Executive do not hold, so
 * the button they were shown could only ever produce a 403. Hiding it matches
 * the enforcement exactly and widens nothing — the server remains the authority
 * (RULES §5, D-005).
 *
 * Follows D-012 and the Task 2.4-3.10 files: `react-dom/client` + React 19's
 * `act`, no component-testing library, `vi.hoisted` for anything the mock
 * factories close over.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const CUSTOMER = {
    id: "3f8b21c4-9d0e-4a77-b512-6ce4a8f01d93",
    code: "CUS-10001",
    bankId: "b1000000-0000-4000-8000-000000000001",
    bankReferenceId: "REF001",
    name: "Priya Raman",
    fatherName: null,
    motherName: null,
    dob: null,
    gender: null,
    maritalStatus: null,
    occupation: null,
    monthlyIncome: "62000",
    mobile: "9848011111",
    altMobile: null,
    email: "priya@example.com",
    address: null,
    city: "Hyderabad",
    state: "Telangana",
    pincode: null,
    pan: "ABCPK1234K",
    aadhaarLast4: null,
    kyc: "Verified" as const,
    cibil: 780,
    accountNo: null,
    ifsc: null,
    branch: null,
    assignedUserId: null,
    assignedTeamId: null,
    status: "Active" as const,
    createdAt: "2026-08-01T09:00:00.000Z",
  };

  return {
    CUSTOMER,
    removeMock: vi.fn(),
    createMock: vi.fn(),
    apiRequestMock: vi.fn(),
    refreshMock: vi.fn(),
    pushMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    state: {
      permissions: [] as string[],
      customers: [] as (typeof CUSTOMER)[],
      loading: false,
      error: null as string | null,
    },
  };
});

const { CUSTOMER, refreshMock, removeMock, toastSuccess } = h;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: h.pushMock,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/customers",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: h.apiRequestMock,
    api: { ...actual.api, remove: h.removeMock, create: h.createMock },
  };
});

/** Mirrors `useResource`, including that it blanks `data` when a load fails. */
vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string) => {
    const isCustomers = path === "/customers";
    const data = isCustomers ? (h.state.error ? [] : h.state.customers) : [];
    return {
      data,
      total: isCustomers && !h.state.error ? h.state.customers.length : 0,
      loading: isCustomers ? h.state.loading : false,
      error: isCustomers ? h.state.error : null,
      refresh: h.refreshMock,
      setData: vi.fn(),
    };
  },
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [{ id: CUSTOMER.bankId, name: "HDFC Bank", shortName: "HDFC", code: "HDFC" }],
    employees: [],
    teams: [],
    loading: false,
    refresh: vi.fn(),
    bankName: () => "HDFC Bank",
    bankById: () => undefined,
    bankShortName: () => "HDFC",
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

import CustomersPage from "@/app/(app)/customers/page";

beforeEach(() => {
  removeMock.mockReset();
  removeMock.mockResolvedValue(undefined);
  h.createMock.mockReset();
  h.apiRequestMock.mockReset();
  h.apiRequestMock.mockResolvedValue({ available: true });
  refreshMock.mockClear();
  toastSuccess.mockClear();
  h.pushMock.mockClear();

  h.state.permissions = ["customers.view", "customers.create", "customers.delete"];
  h.state.customers = [{ ...CUSTOMER }];
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
  vi.stubGlobal("confirm", () => true);
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
    root.render(<CustomersPage />);
  });
  return {
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const bodyText = () => document.body.textContent ?? "";

const buttonByText = (text: string): HTMLButtonElement | undefined =>
  Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.trim().includes(text),
  ) as HTMLButtonElement | undefined;

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const hasRow = (text: string) =>
  Array.from(document.querySelectorAll("tr")).some((tr) => tr.textContent?.includes(text));

/* ------------------------------------------------------------------ group A */

describe("A — loading is visible, and is not mistaken for an answer", () => {
  it("1. shows a loading state during the initial fetch", async () => {
    h.state.loading = true;
    h.state.customers = [];

    const page = await mountPage();

    expect(document.querySelector('[data-testid="customers-loading"]')).toBeTruthy();
    await page.unmount();
  });

  it("2. does not claim the list is empty while the first load is in flight", async () => {
    h.state.loading = true;
    h.state.customers = [];

    const page = await mountPage();

    expect(hasRow(CUSTOMER.name)).toBe(false);
    expect(bodyText()).not.toContain("No customers match this view");
    await page.unmount();
  });

  it("3. shows the table once loading finishes", async () => {
    const page = await mountPage();

    expect(document.querySelector('[data-testid="customers-loading"]')).toBeNull();
    expect(hasRow(CUSTOMER.name)).toBe(true);
    await page.unmount();
  });

  it("4. keeps showing rows during a background refresh", async () => {
    // `loading` goes true again on every refresh. Blanking the table then would
    // be a regression, not a fix.
    h.state.loading = true;

    const page = await mountPage();

    expect(hasRow(CUSTOMER.name)).toBe(true);
    expect(document.querySelector('[data-testid="customers-loading"]')).toBeNull();
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

    expect(text).not.toContain("No customers match this view");
    expect(text).toContain("not because there are");
    await page.unmount();
  });

  it("7. suppresses the table entirely on failure", async () => {
    h.state.error = "Could not load this list";
    h.state.customers = [{ ...CUSTOMER }];

    const page = await mountPage();

    expect(hasRow(CUSTOMER.name)).toBe(false);
    await page.unmount();
  });

  it("8. offers a retry that calls refresh", async () => {
    h.state.error = "Could not load this list";

    const page = await mountPage();
    const retry = buttonByText("Try again");
    expect(retry).toBeTruthy();

    await click(retry!);
    expect(refreshMock).toHaveBeenCalled();
    await page.unmount();
  });

  it("9. renders the normal empty state when the list is genuinely empty", async () => {
    h.state.customers = [];

    const page = await mountPage();

    expect(bodyText()).toContain("No customers match this view");
    expect(buttonByText("Try again")).toBeUndefined();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — Delete is offered only to a role that holds customers.delete", () => {
  const deleteButton = () =>
    Array.from(document.querySelectorAll("tr button")).find(
      (b) => b.textContent?.trim() === "Delete",
    );

  it("10. is shown when the permission is held", async () => {
    const page = await mountPage();

    expect(deleteButton()).toBeTruthy();
    await page.unmount();
  });

  it("11. is absent without it, while the rest of the row still renders", async () => {
    // Team Leader and Executive hold `customers.view` but not `customers.delete`.
    h.state.permissions = ["customers.view"];

    const page = await mountPage();

    expect(deleteButton()).toBeUndefined();
    expect(hasRow(CUSTOMER.name)).toBe(true);
    await page.unmount();
  });

  it("12. still issues the DELETE request when it is shown", async () => {
    const page = await mountPage();

    await click(deleteButton()!);

    expect(removeMock).toHaveBeenCalledWith(`/customers/${CUSTOMER.id}`);
    expect(refreshMock).toHaveBeenCalled();
    await page.unmount();
  });

  it("13. hiding the button is a UI gate only — the row is still visible", async () => {
    // The hidden button is not a security control (D-005). The record stays
    // listed; only the action the server would refuse is withheld.
    h.state.permissions = ["customers.view"];

    const page = await mountPage();

    expect(bodyText()).toContain(CUSTOMER.name);
    expect(removeMock).not.toHaveBeenCalled();
    await page.unmount();
  });
});
