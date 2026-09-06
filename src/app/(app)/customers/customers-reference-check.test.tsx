/**
 * TASK 4.6 — `GET /customers/check/reference` wired into the create form.
 *
 * The endpoint existed, worked, and had **zero callers** despite its own
 * docstring claiming two. Three things make wiring it less obvious than it
 * looks, and each has a group here:
 *
 *   - **It does not use the `{ data }` envelope.** It answers `{ available:
 *     true }` or **409** with `details: { existingCustomerCode }`
 *     (`customers.routes.ts:336-370`), so `api.get` would hand back
 *     `{ data: undefined }`. The form uses the exported `apiRequest` primitive,
 *     as `customer-import-dialog.tsx:15` does.
 *
 *   - **It is advisory.** `customers_bank_reference_unique` is the authority.
 *     A failed, missing or unintelligible check must never stop a legitimate
 *     create — group C is the whole point of the task's "advisory only".
 *
 *   - **It disagrees with the index.** The route matches with `ilike`, the
 *     unique index is `upper()` equality, so `_` and `%` are wildcards to one
 *     and literals to the other. `ilike` is a superset of exact match, so the
 *     only possible error is a false *taken*; group D pins that the wording
 *     does not assert a duplicate the database has not refused.
 *
 * Demo mode is covered too: without a `check/reference` branch the path fell
 * through to the `:id` lookup and answered **404**, which must not be read as
 * "taken" (group C).
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => ({
  BANKS: [
    { id: "b1000000-0000-4000-8000-000000000001", name: "HDFC Bank", shortName: "HDFC", code: "HDFC" },
    { id: "b2000000-0000-4000-8000-000000000002", name: "ICICI Bank", shortName: "ICICI", code: "ICICI" },
  ],
  apiRequestMock: vi.fn(),
  createMock: vi.fn(),
  refreshMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const { apiRequestMock, createMock, toastSuccess } = h;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/customers",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: h.apiRequestMock,
    api: { ...actual.api, create: h.createMock, remove: vi.fn() },
  };
});

vi.mock("@/hooks/use-api", () => ({
  useResource: () => ({
    data: [],
    total: 0,
    loading: false,
    error: null,
    refresh: h.refreshMock,
    setData: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: h.BANKS,
    employees: [],
    teams: [],
    loading: false,
    refresh: vi.fn(),
    bankName: (id: string) => h.BANKS.find((bank) => bank.id === id)?.name ?? "Unassigned",
    bankById: (id: string) => h.BANKS.find((bank) => bank.id === id),
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
      permissions: ["*"],
    },
    can: () => true,
    signOut: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: vi.fn() },
}));

vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  const placeholderOf = (node: React.ReactNode): string | undefined => {
    let found: string | undefined;
    React.Children.forEach(node, (child) => {
      if (found || !React.isValidElement(child)) return;
      const props = child.props as { placeholder?: string; children?: React.ReactNode };
      if (typeof props.placeholder === "string") {
        found = props.placeholder;
        return;
      }
      if (props.children) found = placeholderOf(props.children);
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
          "aria-label": placeholderOf(children),
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

import CustomersPage from "@/app/(app)/customers/page";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ available: true });
  createMock.mockReset();
  createMock.mockResolvedValue({ data: { id: "new", name: "New Person", code: "CUS-10099" } });
  h.refreshMock.mockClear();
  toastSuccess.mockClear();
  h.toastError.mockClear();

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

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const buttonByText = (text: string): HTMLButtonElement | undefined =>
  Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined;

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

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

/** React listens for `focusout` at the root, so a non-bubbling `blur` is lost. */
async function blur(id: string) {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`#${id} not rendered`);
  await act(async () => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

async function choose(label: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!select) throw new Error(`${label} not rendered`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const checkLine = () =>
  document.querySelector('[data-testid="reference-check"]')?.textContent ?? "";

/**
 * "Add customer" labels three controls — the header, the empty state and the
 * dialog's own footer. Only the last one submits.
 */
const dialogButton = (text: string): HTMLButtonElement | undefined => {
  const dialog = document.querySelector('[role="dialog"]');
  return Array.from(dialog?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined;
};

async function openDialog() {
  await act(async () => {
    root.render(<CustomersPage />);
  });
  await click(buttonByText("Add customer")!);
}

/** Everything `addCustomer` refuses to submit without, minus the reference. */
async function fillRequired() {
  await type("c-name", "New Person");
  await type("c-mobile", "9848099999");
}

const conflict = (details?: unknown) =>
  new ApiError(
    409,
    "conflict",
    "This Bank Reference ID is already used for the selected bank",
    details,
  );

/* ------------------------------------------------------------------ group A */

describe("A — the check is issued against the real endpoint", () => {
  it("1. blurring the reference asks the API, with the bank and the reference", async () => {
    await openDialog();
    await type("c-bankref", "REF042");
    await blur("c-bankref");

    expect(apiRequestMock).toHaveBeenCalledWith("/customers/check/reference", {
      query: { bankId: h.BANKS[0].id, bankReferenceId: "REF042" },
    });
  });

  it("2. an available reference is reported as free", async () => {
    await openDialog();
    await type("c-bankref", "REF042");
    await blur("c-bankref");

    expect(checkLine()).toContain("Not used for this bank yet");
  });

  it("3. the reference is trimmed before it is sent", async () => {
    await openDialog();
    await type("c-bankref", "  REF042  ");
    await blur("c-bankref");

    expect(apiRequestMock.mock.calls[0][1].query.bankReferenceId).toBe("REF042");
  });

  it("4. an empty box issues no request at all", async () => {
    await openDialog();
    await blur("c-bankref");

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(checkLine()).toBe("");
  });

  it("5. the answer is dropped as soon as the reference is edited", async () => {
    await openDialog();
    await type("c-bankref", "REF042");
    await blur("c-bankref");
    expect(checkLine()).toContain("Not used");

    await type("c-bankref", "REF043");

    // A stale "free" beside different text would be a claim about the wrong
    // reference.
    expect(checkLine()).toBe("");
  });

  it("6. the answer is dropped when the bank changes, because it was per-bank", async () => {
    await openDialog();
    await type("c-bankref", "REF042");
    await blur("c-bankref");
    expect(checkLine()).toContain("Not used");

    await choose("Select bank", h.BANKS[1].id);

    expect(checkLine()).toBe("");
  });

  it("7. re-checking after a bank change sends the NEW bank", async () => {
    await openDialog();
    await type("c-bankref", "REF042");
    await blur("c-bankref");

    await choose("Select bank", h.BANKS[1].id);
    await blur("c-bankref");

    expect(apiRequestMock).toHaveBeenLastCalledWith("/customers/check/reference", {
      query: { bankId: h.BANKS[1].id, bankReferenceId: "REF042" },
    });
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — a taken reference names the customer already holding it", () => {
  it("8. surfaces the existing customer code from the 409's details", async () => {
    apiRequestMock.mockRejectedValue(conflict({ existingCustomerCode: "CUS-10007" }));

    await openDialog();
    await type("c-bankref", "REF001");
    await blur("c-bankref");

    expect(checkLine()).toContain("CUS-10007");
    expect(checkLine()).toMatch(/already used/i);
  });

  it("9. falls back to the server's own message when no code is carried", async () => {
    // Demo mode's `DemoHttpError` has no `details`; the message must survive.
    apiRequestMock.mockRejectedValue(conflict());

    await openDialog();
    await type("c-bankref", "REF001");
    await blur("c-bankref");

    expect(checkLine()).toContain("This Bank Reference ID is already used for the selected bank");
  });

  it("10. a details payload of the wrong shape does not become a fake code", async () => {
    // 409s elsewhere in this API carry `{ constraint }`. Reading that as a
    // customer code would put a constraint name on screen as a customer.
    apiRequestMock.mockRejectedValue(conflict({ constraint: "customers_bank_reference_unique" }));

    await openDialog();
    await type("c-bankref", "REF001");
    await blur("c-bankref");

    expect(checkLine()).not.toContain("customers_bank_reference_unique");
    expect(checkLine()).toContain("This Bank Reference ID is already used");
  });

  it("11. the warning says the database decides, not the check", async () => {
    apiRequestMock.mockRejectedValue(conflict({ existingCustomerCode: "CUS-10007" }));

    await openDialog();
    await type("c-bankref", "REF001");
    await blur("c-bankref");

    expect(checkLine()).toMatch(/database/i);
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — advisory only: nothing here can block a legitimate create", () => {
  async function submit() {
    await fillRequired();
    const save = dialogButton("Add customer");
    if (!save) throw new Error("the dialog's save button is not rendered");
    await click(save);
  }

  it("12. a network failure does not block the create", async () => {
    apiRequestMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await openDialog();
    await type("c-bankref", "REF042");
    await blur("c-bankref");
    expect(checkLine()).toContain("could not be checked");

    await submit();

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][1]).toMatchObject({ bankReferenceId: "REF042" });
  });

  it("13. a 404 is NOT read as taken — the demo-mode case", async () => {
    // Demo mode used to fall through to the `:id` lookup and answer 404. A
    // missing endpoint is not evidence that a reference is in use.
    apiRequestMock.mockRejectedValue(new ApiError(404, "not_found", "Customer not found"));

    await openDialog();
    await type("c-bankref", "REF042");
    await blur("c-bankref");

    expect(checkLine()).not.toMatch(/already used/i);
    expect(checkLine()).toContain("could not be checked");
  });

  it("14. a 500 is not read as taken either", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, "internal", "Something went wrong"));

    await openDialog();
    await type("c-bankref", "REF042");
    await blur("c-bankref");

    expect(checkLine()).not.toMatch(/already used/i);
    expect(checkLine()).toContain("could not be checked");
  });

  it("15. a malformed 200 body produces neither a false taken nor a false free", async () => {
    // `{ data: … }` is what the `:id` route answers. It is not an answer to
    // this question, and guessing either way would invent a result.
    apiRequestMock.mockResolvedValue({ data: { id: "someone" } });

    await openDialog();
    await type("c-bankref", "REF042");
    await blur("c-bankref");

    expect(checkLine()).not.toMatch(/already used/i);
    expect(checkLine()).not.toMatch(/not used for this bank/i);
    expect(checkLine()).toContain("could not be checked");
  });

  it("16. even a reported duplicate leaves the create available", async () => {
    // The DB constraint is the authority. If the check is wrong — and `ilike`
    // can make it wrong — refusing here would block a legitimate customer.
    apiRequestMock.mockRejectedValue(conflict({ existingCustomerCode: "CUS-10007" }));

    await openDialog();
    await type("c-bankref", "REF001");
    await blur("c-bankref");

    const save = dialogButton("Add customer")!;
    expect(save.disabled).toBe(false);

    await submit();

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("17. the create still reports the server's refusal if the database disagrees", async () => {
    apiRequestMock.mockResolvedValue({ available: true });
    createMock.mockRejectedValue(conflict({ constraint: "customers_bank_reference_unique" }));

    await openDialog();
    await type("c-bankref", "REF001");
    await blur("c-bankref");
    expect(checkLine()).toContain("Not used for this bank yet");

    await submit();

    // A "free" check followed by a database conflict must surface the refusal,
    // not the earlier optimism.
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalled();
  });

  it("18. a successful create clears the check for the next customer", async () => {
    await openDialog();
    await type("c-bankref", "REF042");
    await blur("c-bankref");
    await submit();

    expect(toastSuccess).toHaveBeenCalled();
    expect(checkLine()).toBe("");
  });
});

/* ------------------------------------------------------------------ group E */

/**
 * The demo layer, driven directly rather than through the page.
 *
 * `demoRequest` splits `/customers/check/reference` into resource `customers`
 * and id `check`, so without a branch it fell through to the record lookup and
 * answered **404** — the check silently never ran during a walkthrough. The
 * branch added with this task answers the real contract instead. Nothing here
 * touches the network: `lib/demo` is the whole API while demo mode is on.
 */
describe("E — demo mode answers the check instead of 404ing", () => {
  it("22. reports a free reference with the endpoint's own shape", async () => {
    const { demoRequest } = await import("@/lib/demo/api");
    const { getDemoData } = await import("@/lib/demo/store");
    const customer = getDemoData().customers[0];

    const body = await demoRequest<{ available: boolean }>("/customers/check/reference", {
      query: { bankId: customer.bankId, bankReferenceId: "REF-DEFINITELY-FREE" },
    });

    // `{ available: true }`, NOT the `{ data }` envelope.
    expect(body).toEqual({ available: true });
  });

  it("23. reports a duplicate as a 409 naming the existing customer", async () => {
    const { demoRequest } = await import("@/lib/demo/api");
    const { getDemoData } = await import("@/lib/demo/store");
    const customer = getDemoData().customers[0];

    await expect(
      demoRequest("/customers/check/reference", {
        query: { bankId: customer.bankId, bankReferenceId: customer.bankReferenceId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "conflict" });
  });

  it("24. matches case-insensitively, as the route's ilike does", async () => {
    const { demoRequest } = await import("@/lib/demo/api");
    const { getDemoData } = await import("@/lib/demo/store");
    const customer = getDemoData().customers[0];

    await expect(
      demoRequest("/customers/check/reference", {
        query: {
          bankId: customer.bankId,
          bankReferenceId: customer.bankReferenceId.toLowerCase(),
        },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("25. never answers 404 for this path — the defect the branch removes", async () => {
    const { demoRequest } = await import("@/lib/demo/api");
    const { getDemoData } = await import("@/lib/demo/store");
    const customer = getDemoData().customers[0];

    const body = await demoRequest("/customers/check/reference", {
      query: { bankId: customer.bankId, bankReferenceId: "REF-NOT-A-CUSTOMER-ID" },
    });

    expect(body).not.toBeUndefined();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — the ilike/upper() disagreement is stated, not hidden", () => {
  it("19. a wildcard reference is not asserted to be a duplicate", async () => {
    // `ilike` reads `_` as "any character", the unique index reads it as an
    // underscore. The check can therefore report a match the database would
    // accept — a false *taken*. (It cannot go the other way: `ilike` matches a
    // superset of exact equality.)
    apiRequestMock.mockRejectedValue(conflict({ existingCustomerCode: "CUS-10007" }));

    await openDialog();
    await type("c-bankref", "REF_01");
    await blur("c-bankref");

    expect(checkLine()).toContain("CUS-10007");
    expect(checkLine()).toMatch(/wildcard/i);
    expect(checkLine()).toMatch(/may not be an exact duplicate/i);
  });

  it("20. a percent sign gets the same treatment", async () => {
    apiRequestMock.mockRejectedValue(conflict({ existingCustomerCode: "CUS-10007" }));

    await openDialog();
    await type("c-bankref", "REF%01");
    await blur("c-bankref");

    expect(checkLine()).toMatch(/wildcard/i);
  });

  it("21. an ordinary reference is stated plainly, with no caveat", async () => {
    apiRequestMock.mockRejectedValue(conflict({ existingCustomerCode: "CUS-10007" }));

    await openDialog();
    await type("c-bankref", "REF001");
    await blur("c-bankref");

    expect(checkLine()).not.toMatch(/wildcard/i);
    expect(checkLine()).toContain("Already used by CUS-10007 for this bank");
  });
});
