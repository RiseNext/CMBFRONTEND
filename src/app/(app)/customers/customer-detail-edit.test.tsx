/**
 * TASK 4.1 — the customer edit dialog, driven through the real page.
 *
 * `customer-patch.test.ts` pins the diffing rules in isolation. This is the
 * other half: it mounts the real `CustomerProfilePage`, clicks the real "Edit
 * profile" button, types into the real controls and clicks the real Save
 * button, then asserts what the API layer was actually handed. Before this task
 * the Save button closed the dialog and toasted "Profile updated" without
 * issuing any request at all — the defect RULES §4 names — and that cannot pass
 * here.
 *
 * Follows D-012: `react-dom/client` + React 19's native `act`, no
 * component-testing library. `apiRequest` is the only thing replaced (with
 * `api.update`/`api.remove` re-pointed at it so the HTTP **method** is still
 * asserted rather than a helper name); the real `ApiError`, `errorMessage` and
 * `lib/field-errors` are kept so the D-031 surfacing path is genuinely
 * exercised.
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
    state: {
      permissions: [] as string[],
      customer: CUSTOMER as typeof CUSTOMER | null,
    },
  };
});

const { CUSTOMER, apiRequestMock, listMock, refreshMock, toastSuccess } = h;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: h.apiRequestMock,
    api: {
      ...actual.api,
      // Re-pointed at the same mock the employees suite asserts on, so a test
      // can still read the method off the request rather than trusting that
      // "update was called" means a PATCH went out.
      update: (path: string, body: unknown) =>
        h.apiRequestMock(path, { method: "PATCH", body }),
      remove: (path: string) => h.apiRequestMock(path, { method: "DELETE" }),
      // The audit trail has its own mock so a `mockRejectedValueOnce` aimed at
      // the PATCH cannot be swallowed by the timeline's mount-time fetch.
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
    data: h.state.customer,
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
  apiRequestMock.mockResolvedValue({ data: { ...CUSTOMER } });
  listMock.mockReset();
  listMock.mockResolvedValue({ data: [] });
  refreshMock.mockClear();
  toastSuccess.mockClear();
  h.toastError.mockClear();
  h.pushMock.mockClear();
  h.state.permissions = ["customers.view", "customers.edit", "customers.delete"];
  h.state.customer = CUSTOMER;

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

async function openEdit() {
  const edit = buttonByText("Edit profile");
  if (!edit) throw new Error("Edit profile button not rendered");
  await click(edit);
}

async function save() {
  const button = buttonByText("Save changes");
  if (!button) throw new Error("Save changes button not rendered");
  await click(button);
}

/** Every request the page issued with the given method. */
const callsWithMethod = (method: string) =>
  apiRequestMock.mock.calls.filter(
    ([, options]) => (options as { method?: string } | undefined)?.method === method,
  );

/** The body of the single PATCH the page issued. */
function patchBody(): Record<string, unknown> {
  const call = callsWithMethod("PATCH")[0];
  if (!call) throw new Error("no PATCH was issued");
  return (call[1] as { body: Record<string, unknown> }).body;
}

/* ------------------------------------------------------------------ group A */

describe("A — the dialog is controlled and seeded from the record", () => {
  it("1. opens populated with the customer's stored values", async () => {
    const page = await mountPage();
    await openEdit();

    expect(field("e-name").value).toBe("Meera Nair");
    expect(field("e-mobile").value).toBe("9848022222");
    expect(field("e-email").value).toBe("meera.nair@example.com");
    expect(field("e-address").value).toBe("12/4 Nallakunta");

    await page.unmount();
  });

  it("2. typing changes the control's value — it is controlled, not defaultValue", async () => {
    const page = await mountPage();
    await openEdit();
    await type("e-name", "Meera R Nair");

    expect(field("e-name").value).toBe("Meera R Nair");
    await page.unmount();
  });

  it("3. reopening after an abandoned edit shows the stored values again", async () => {
    const page = await mountPage();
    await openEdit();
    await type("e-name", "Discarded Name");
    await click(buttonByText("Cancel")!);

    await openEdit();
    expect(field("e-name").value).toBe("Meera Nair");
    expect(apiRequestMock).not.toHaveBeenCalled();

    await page.unmount();
  });

  it("4. every control keeps its label association", async () => {
    const page = await mountPage();
    await openEdit();

    for (const id of ["e-name", "e-mobile", "e-email", "e-address"]) {
      const label = document.querySelector(`label[for="${id}"]`);
      expect(label, `no <label for="${id}">`).toBeTruthy();
      expect(label!.textContent?.trim().length).toBeGreaterThan(0);
    }

    await page.unmount();
  });

  it("5. the D-052 excluded fields are not offered", async () => {
    const page = await mountPage();
    await openEdit();

    // Aadhaar is destructive and not round-trippable; bank and assignment are
    // owned by other rows.
    for (const id of ["e-aadhaar", "e-bankId", "e-assignedUserId", "e-assignedTeamId", "e-kyc"]) {
      expect(document.getElementById(id), `#${id} must not be rendered`).toBeNull();
    }
    expect(document.body.textContent).not.toContain("working copy in this session");

    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — a PATCH is actually issued, carrying only what changed", () => {
  it("6. THE HEADLINE — saving issues a real PATCH to /customers/:id", async () => {
    const page = await mountPage();
    await openEdit();
    await type("e-name", "Meera R Nair");
    await save();

    const patches = callsWithMethod("PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0][0]).toBe(`/customers/${CUSTOMER.id}`);

    await page.unmount();
  });

  it("7. changing only the name sends only the name", async () => {
    const page = await mountPage();
    await openEdit();
    await type("e-name", "Meera R Nair");
    await save();

    expect(patchBody()).toEqual({ name: "Meera R Nair" });
    await page.unmount();
  });

  it("8. changing only the mobile sends only the mobile", async () => {
    const page = await mountPage();
    await openEdit();
    await type("e-mobile", "9000000000");
    await save();

    expect(patchBody()).toEqual({ mobile: "9000000000" });
    await page.unmount();
  });

  it("9. clearing the email sends null, not an empty string", async () => {
    // PATCH spreads `...rest` raw (customers.routes.ts:285), so an empty string
    // would be written into the column; only POST normalises it away.
    const page = await mountPage();
    await openEdit();
    await type("e-email", "");
    await save();

    const body = patchBody();
    expect(body).toEqual({ email: null });
    expect(body.email).toBeNull();
    expect(body.email).not.toBe("");

    await page.unmount();
  });

  it("10. an untouched form issues no request at all", async () => {
    const page = await mountPage();
    await openEdit();
    await save();

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    // ...and the dialog closed, because there was nothing to do.
    expect(document.getElementById("e-name")).toBeNull();

    await page.unmount();
  });

  it("11. no field the user did not touch ever rides along", async () => {
    const page = await mountPage();
    await openEdit();
    await type("e-address", "7 Banjara Hills");
    await save();

    const keys = Object.keys(patchBody());
    expect(keys).toEqual(["address"]);
    for (const forbidden of [
      "aadhaar",
      "aadhaarLast4",
      "bankId",
      "assignedUserId",
      "assignedTeamId",
      "kyc",
      "status",
      "monthlyIncome",
      "pan",
      "accountNo",
    ]) {
      expect(keys).not.toContain(forbidden);
    }

    await page.unmount();
  });

  it("12. a second click while the first save is in flight issues no second PATCH", async () => {
    let release: (value: { data: typeof CUSTOMER }) => void = () => {};
    apiRequestMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const page = await mountPage();
    await openEdit();
    await type("e-name", "Meera R Nair");

    const button = buttonByText("Save changes")!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(callsWithMethod("PATCH")).toHaveLength(1);
    // The control also reports that it is busy.
    expect(buttonByText("Saving")).toBeTruthy();

    await act(async () => {
      release({ data: { ...CUSTOMER, name: "Meera R Nair" } });
    });
    expect(callsWithMethod("PATCH")).toHaveLength(1);

    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — the server stays the authority on refusals", () => {
  async function failWith(error: unknown) {
    const page = await mountPage();
    await openEdit();
    apiRequestMock.mockRejectedValueOnce(error);
    await type("e-name", "Meera R Nair");
    await save();
    return page;
  }

  it("13. a 422 field issue lands on the control that names it", async () => {
    const page = await failWith(
      new ApiError(422, "validation_failed", "The submitted data is not valid", [
        { path: "mobile", message: "Mobile must be 10 digits" },
      ]),
    );

    const mobile = field("e-mobile");
    const message = mobile.parentElement?.textContent ?? "";
    expect(message).toContain("Mobile must be 10 digits");
    expect(mobile.getAttribute("aria-invalid")).toBe("true");
    // Every issue found a control, so the generic line is cleared (D-031).
    expect(document.body.textContent).not.toContain("The submitted data is not valid");

    await page.unmount();
  });

  it("14. an issue naming a field this form does not render is appended, not dropped", async () => {
    const page = await failWith(
      new ApiError(422, "validation_failed", "The submitted data is not valid", [
        { path: "pincode", message: "Pincode must be 6 digits" },
      ]),
    );

    expect(document.body.textContent).toContain("Pincode must be 6 digits");
    await page.unmount();
  });

  it("15. a 409 whose details are an object does not break the error path", async () => {
    // The 23505 branch puts `{ constraint }` — an object — in the same field.
    // D-031 discriminates on shape, so this must fall through to the top line.
    const page = await failWith(
      new ApiError(409, "conflict", "That reference id already exists for this bank", {
        constraint: "customers_bank_reference_unique",
      }),
    );

    expect(document.body.textContent).toContain(
      "That reference id already exists for this bank",
    );
    await page.unmount();
  });

  it("16. a 403 scope refusal is shown verbatim", async () => {
    const page = await failWith(new ApiError(403, "forbidden", "Customer not in your bank scope"));
    expect(document.body.textContent).toContain("Customer not in your bank scope");
    await page.unmount();
  });

  it("17. a network failure falls back to the dialog's own message", async () => {
    const page = await failWith(new Error("Failed to fetch"));
    expect(document.body.textContent).toContain("Failed to fetch");
    await page.unmount();
  });

  it("18. NO success toast is shown when the request failed", async () => {
    const page = await failWith(new ApiError(500, "internal", "Something broke"));

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();

    await page.unmount();
  });

  it("19. the dialog stays open with the typed values intact after a failure", async () => {
    const page = await mountPage();
    await openEdit();
    apiRequestMock.mockRejectedValueOnce(new ApiError(500, "internal", "Something broke"));
    await type("e-name", "Meera R Nair");
    await type("e-address", "7 Banjara Hills");
    await save();

    expect(field("e-name").value).toBe("Meera R Nair");
    expect(field("e-address").value).toBe("7 Banjara Hills");
    // Still submittable — a retry must be possible.
    expect(buttonByText("Save changes")?.disabled).toBe(false);

    await page.unmount();
  });

  it("20. a failed save can be retried and the retry sends the same diff", async () => {
    const page = await mountPage();
    await openEdit();
    apiRequestMock.mockRejectedValueOnce(new ApiError(500, "internal", "Something broke"));
    await type("e-name", "Meera R Nair");
    await save();
    await save();

    const patches = callsWithMethod("PATCH");
    expect(patches).toHaveLength(2);
    expect((patches[1][1] as { body: unknown }).body).toEqual({ name: "Meera R Nair" });
    expect(toastSuccess).toHaveBeenCalledTimes(1);

    await page.unmount();
  });

  it("21. client validation refuses before any request", async () => {
    const page = await mountPage();
    await openEdit();
    await type("e-mobile", "98480");
    await save();

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("10 digits");
    expect(field("e-mobile").value).toBe("98480");

    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — after an awaited 2xx", () => {
  it("22. reconciles from the server, confirms, and closes the dialog", async () => {
    const page = await mountPage();
    await openEdit();
    await type("e-name", "Meera R Nair");
    await save();

    expect(refreshMock).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith(
      "Customer updated",
      expect.objectContaining({ description: expect.stringContaining("Meera") }),
    );
    expect(document.getElementById("e-name")).toBeNull();

    await page.unmount();
  });

  it("23. the toast is raised after the request resolves, never before", async () => {
    let release: (value: { data: typeof CUSTOMER }) => void = () => {};
    apiRequestMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const page = await mountPage();
    await openEdit();
    await type("e-name", "Meera R Nair");
    await save();

    // In flight: the request is out, nothing has been claimed.
    expect(callsWithMethod("PATCH")).toHaveLength(1);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();

    await act(async () => {
      release({ data: { ...CUSTOMER, name: "Meera R Nair" } });
    });

    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await page.unmount();
  });
});
