/**
 * TASK 4.2 — the customer detail delete, driven through the real page.
 *
 * Before this task the confirm button closed the dialog and toasted "Customer
 * archived · moved to archived records" without issuing a request, and without
 * there being any archive to move to. It now calls
 * `DELETE /api/customers/:id`, which soft-deletes into the recycle bin.
 *
 * Two things this suite pins that are easy to get wrong:
 *   - the page must **not** refetch the record after a successful delete. The
 *     component calls `notFound()` on null data, so a refetch would replace a
 *     successful deletion with a 404 screen; the mocked `notFound` throws so
 *     that mistake fails loudly here.
 *   - the button is gated on `customers.delete`, the same permission
 *     `customersRouter.delete` requires — matching the backend, not widening it.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => {
  const CUSTOMER = {
    id: "6b1f2c48-9a30-4d17-8e52-3f0c7b9d1a44",
    code: "CUS-10007",
    bankId: "0d2a7e91-4c66-4b0f-9d31-8a5e2c7f6b10",
    bankReferenceId: "HDFC/2026/00841",
    name: "Meera Nair",
    fatherName: "Raghavan Nair",
    motherName: "Latha Nair",
    dob: "1988-02-11T00:00:00.000Z",
    gender: "Female" as const,
    maritalStatus: "Married" as const,
    occupation: "Pharmacist",
    monthlyIncome: "72000",
    mobile: "9848022222",
    altMobile: null,
    email: "meera.nair@example.com",
    address: "12/4 Nallakunta",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500044",
    pan: "AWKPN1234C",
    aadhaarLast4: "7781",
    kyc: "Verified" as const,
    cibil: 762,
    accountNo: "50100234567891",
    ifsc: "HDFC0000123",
    branch: "Nallakunta",
    assignedUserId: null,
    assignedTeamId: null,
    status: "Active" as const,
    createdAt: "2026-01-14T06:30:00.000Z",
  };

  return {
    CUSTOMER,
    apiRequestMock: vi.fn(),
    listMock: vi.fn(),
    refreshMock: vi.fn(),
    pushMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    state: { permissions: [] as string[] },
  };
});

const { CUSTOMER, apiRequestMock, listMock, refreshMock, pushMock, toastSuccess } = h;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: h.apiRequestMock,
    api: {
      ...actual.api,
      update: (path: string, body: unknown) =>
        h.apiRequestMock(path, { method: "PATCH", body }),
      remove: (path: string) => h.apiRequestMock(path, { method: "DELETE" }),
      list: h.listMock,
    },
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: h.CUSTOMER.id }),
  useRouter: () => ({
    push: h.pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  notFound: () => {
    throw new Error("notFound() was called — the page discarded a live record");
  },
}));

vi.mock("@/hooks/use-api", () => ({
  useRecord: () => ({
    data: h.CUSTOMER,
    loading: false,
    error: null,
    refresh: h.refreshMock,
  }),
  useResource: () => ({
    data: [],
    total: 0,
    loading: false,
    error: null,
    refresh: vi.fn(),
    setData: vi.fn(),
  }),
  useStats: () => ({ data: null, loading: false, num: () => 0 }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [],
    teams: [],
    employees: [],
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
      bankIds: null,
      unrestrictedBankAccess: true,
    },
    can: (permission: string) => h.state.permissions.includes(permission),
    canAny: (...permissions: string[]) =>
      permissions.some((p) => h.state.permissions.includes(p)),
    signOut: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: vi.fn() },
}));

import CustomerProfilePage from "@/app/(app)/customers/[id]/page";

beforeEach(() => {
  apiRequestMock.mockReset();
  // `apiRequest` returns `undefined` for a 204, which is what DELETE answers.
  apiRequestMock.mockResolvedValue(undefined);
  listMock.mockReset();
  listMock.mockResolvedValue({ data: [] });
  refreshMock.mockClear();
  pushMock.mockClear();
  toastSuccess.mockClear();
  h.toastError.mockClear();
  h.state.permissions = ["customers.view", "customers.edit", "customers.delete"];

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
    root.render(<CustomerProfilePage />);
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

async function openDeleteDialog() {
  const trigger = buttonByText("Delete customer");
  if (!trigger) throw new Error("Delete customer button not rendered");
  await click(trigger);
}

/** The confirm button inside the dialog, which reads just "Delete". */
function confirmButton(): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Delete" || b.textContent?.trim() === "Deleting…",
  ) as HTMLButtonElement | undefined;
  if (!button) throw new Error("confirm Delete button not rendered");
  return button;
}

const callsWithMethod = (method: string) =>
  apiRequestMock.mock.calls.filter(
    ([, options]) => (options as { method?: string } | undefined)?.method === method,
  );

/* ------------------------------------------------------------------ group A */

describe("A — the permission gate", () => {
  it("1. the Delete button is offered when the user holds customers.delete", async () => {
    const page = await mountPage();
    expect(buttonByText("Delete customer")).toBeTruthy();
    await page.unmount();
  });

  it("2. the Delete button is absent without customers.delete", async () => {
    h.state.permissions = ["customers.view", "customers.edit"];
    const page = await mountPage();

    expect(buttonByText("Delete customer")).toBeUndefined();
    // The rest of the page is untouched — this gates one control, not the page.
    expect(document.body.textContent).toContain("Meera Nair");
    expect(buttonByText("Edit profile")).toBeTruthy();

    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — the request", () => {
  it("3. THE HEADLINE — confirming issues a real DELETE to /customers/:id", async () => {
    const page = await mountPage();
    await openDeleteDialog();
    await click(confirmButton());

    const deletes = callsWithMethod("DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0][0]).toBe(`/customers/${CUSTOMER.id}`);

    await page.unmount();
  });

  it("4. no window.confirm stands between the button and the request", async () => {
    // The list page's own delete uses `window.confirm`; the detail page has a
    // real Dialog and must not grow a second, uglier confirmation on top of it.
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);

    const page = await mountPage();
    await openDeleteDialog();
    await click(confirmButton());

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(callsWithMethod("DELETE")).toHaveLength(1);

    await page.unmount();
  });

  it("5. a second click while the delete is in flight issues no second DELETE", async () => {
    let release: () => void = () => {};
    apiRequestMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve();
        }),
    );

    const page = await mountPage();
    await openDeleteDialog();

    const button = confirmButton();
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(callsWithMethod("DELETE")).toHaveLength(1);
    expect(document.body.textContent).toContain("Deleting");

    await act(async () => release());
    expect(callsWithMethod("DELETE")).toHaveLength(1);

    await page.unmount();
  });

  it("6. opening the dialog on its own issues nothing", async () => {
    const page = await mountPage();
    await openDeleteDialog();

    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — after a 204", () => {
  it("7. navigates back to the customer list", async () => {
    const page = await mountPage();
    await openDeleteDialog();
    await click(confirmButton());

    expect(pushMock).toHaveBeenCalledWith("/customers");
    await page.unmount();
  });

  it("8. confirms truthfully — the recycle bin, not an invented archive", async () => {
    const page = await mountPage();
    await openDeleteDialog();
    await click(confirmButton());

    expect(toastSuccess).toHaveBeenCalledWith(
      "Customer moved to recycle bin",
      expect.objectContaining({ description: expect.stringContaining("Meera Nair") }),
    );
    const [title] = toastSuccess.mock.calls[0] as [string];
    expect(title).not.toContain("archived");

    await page.unmount();
  });

  it("9. does NOT refetch the record it just deleted", async () => {
    // `useRecord` would answer 404, `data` would be null and the component
    // would call `notFound()` on a deletion that actually succeeded.
    const page = await mountPage();
    await openDeleteDialog();
    await click(confirmButton());

    expect(refreshMock).not.toHaveBeenCalled();
    expect(callsWithMethod("GET")).toHaveLength(0);

    await page.unmount();
  });

  it("10. the toast is raised after the request resolves, never before", async () => {
    let release: () => void = () => {};
    apiRequestMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve();
        }),
    );

    const page = await mountPage();
    await openDeleteDialog();
    await click(confirmButton());

    expect(callsWithMethod("DELETE")).toHaveLength(1);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();

    await act(async () => release());

    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/customers");

    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — when the server refuses", () => {
  async function failWith(error: unknown) {
    const page = await mountPage();
    await openDeleteDialog();
    apiRequestMock.mockRejectedValueOnce(error);
    await click(confirmButton());
    return page;
  }

  it("11. shows the server's message and claims nothing", async () => {
    const page = await failWith(
      new ApiError(409, "conflict", "That record is still referenced by other records"),
    );

    expect(document.body.textContent).toContain(
      "That record is still referenced by other records",
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();

    await page.unmount();
  });

  it("12. a 403 is shown verbatim", async () => {
    const page = await failWith(new ApiError(403, "forbidden", "Customer not in your bank scope"));
    expect(document.body.textContent).toContain("Customer not in your bank scope");
    await page.unmount();
  });

  it("13. a network failure falls back to the dialog's own message", async () => {
    const page = await failWith(new Error("Failed to fetch"));
    expect(document.body.textContent).toContain("Failed to fetch");
    await page.unmount();
  });

  it("14. the dialog stays open and usable, and the delete can be retried", async () => {
    const page = await failWith(new ApiError(500, "internal", "Something broke"));

    // Both controls are still there and enabled.
    const confirm = confirmButton();
    expect(confirm.disabled).toBe(false);
    expect(buttonByText("Keep customer")?.disabled).toBe(false);

    await click(confirm);
    expect(callsWithMethod("DELETE")).toHaveLength(2);
    expect(pushMock).toHaveBeenCalledWith("/customers");

    await page.unmount();
  });

  it("15. reopening the dialog clears the previous failure message", async () => {
    const page = await failWith(new ApiError(500, "internal", "Something broke"));

    await click(buttonByText("Keep customer")!);
    await openDeleteDialog();

    expect(document.body.textContent).not.toContain("Something broke");
    await page.unmount();
  });
});
