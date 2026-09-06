/**
 * TASK 5.6 — the verification panel in the loan detail dialog.
 *
 * `POST /api/loans/:id/verification` is a complete, permissioned,
 * business-rule-enforcing endpoint that had **zero callers**, and
 * `GET /api/verifications` and `GET /api/service-providers` had none either.
 * Nothing on any screen could create or read a verification. This wires all
 * three, and five properties are pinned here because each of them is a place
 * where the obvious implementation is wrong:
 *
 *   - **A — the read panel.** A real row renders as a row; an empty result reads
 *     as *"No verification recorded"*; a failed request reads as a failure.
 *     `useResource` blanks `data` on rejection (`use-api.ts:62-67`), so the
 *     naive version reports "no verification" for a 500 — the Task 2.10 / 4.8 /
 *     5.9 defect one panel down.
 *
 *   - **B — the create request actually happens**, is awaited, carries exactly
 *     four fields, and is guarded against a double submit. The route derives
 *     `status`, `result`, `requestedAt` and `completedAt`, and **parses
 *     `handledByBank` and then overwrites it** with `required ? false : true`
 *     (`operations.routes.ts:234`) — so a control for any of them would be a
 *     control the server discards, which is what D-059 removed from the create
 *     dialog on this same screen.
 *
 *   - **C — failures branch on the HTTP status, never on the message.** This is
 *     the group that matters most. The API answers **two different sentences for
 *     the identical 409**: the route's own *"This loan already has a
 *     verification record"*, and the error handler's generic *"That record
 *     already exists"* when the `verifications_loan_unique` index fires instead
 *     — that constraint is **absent from `CONSTRAINT_MESSAGES`**
 *     (`error-handler.ts:12-21`), so no specific wording exists for it. Test 17
 *     sends the second sentence and demands identical behaviour, which a
 *     message-matching implementation cannot give.
 *
 *   - **D — the permission split (D-049).** **Manager and Team Leader hold
 *     `verification.create` but NOT `service_providers.view`**
 *     (`backend/src/lib/permissions.ts:247`, `:280-281`), while the server
 *     *requires* a provider whenever `required` is true. The panel must not
 *     widen the grant, must not invent an endpoint, and must not render an empty
 *     dropdown — an empty `<Select>` says "there are no providers", which is a
 *     claim about a directory this account cannot see. It offers the
 *     bank-handled path and says why.
 *
 *   - **E — no control exists for a field the route owns.**
 *
 * Follows D-012: `react-dom/client` + React 19's `act`, no component-testing
 * library.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { ServiceProvider, Verification } from "@/lib/types";

const h = vi.hoisted(() => {
  const BANKS = [
    { id: "b1000000-0000-4000-8000-000000000001", name: "HDFC Bank", shortName: "HDFC", code: "HDFC" },
  ];

  const LOAN = {
    id: "7c4e1a90-2b6d-4f08-9a31-5e07b3c2d811",
    code: "LN-11042",
    applicationNo: "APP-4471",
    customerId: "3f8b21c4-9d0e-4a77-b512-6ce4a8f01d93",
    bankId: BANKS[0].id,
    loanType: "Home Loan",
    amountRequested: "2500000.00",
    amountApproved: "0.00",
    interestRate: "9.25",
    tenureMonths: 240,
    emi: "0.00",
    processingFee: "0.00",
    commission: "0.00",
    status: "Under Review" as const,
    appliedOn: "2026-08-02T09:00:00.000Z",
    verificationRequired: false,
    fundingSourceId: null,
    assignedUserId: null,
    assignedTeamId: null,
    priority: "Normal" as const,
    dueDate: null,
    notes: null,
    createdAt: "2026-08-02T09:00:00.000Z",
    updatedAt: "2026-08-02T09:00:00.000Z",
  };

  const CUSTOMER = {
    id: LOAN.customerId,
    code: "CUS-10001",
    bankId: BANKS[0].id,
    name: "Priya Raman",
    bankReferenceId: "REF001",
    mobile: "9848011111",
    kyc: "Verified" as const,
    status: "Active" as const,
    city: "Hyderabad",
    createdAt: "2026-08-01T09:00:00.000Z",
  };

  const PROVIDERS = [
    {
      id: "c48d1e70-9a55-4b21-8e07-2f61d3a09b01",
      name: "Sentinel Field Services",
      providerType: "Field Verification",
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      status: "Active" as const,
    },
    {
      id: "c48d1e70-9a55-4b21-8e07-2f61d3a09b02",
      name: "Meridian Legal & Valuation",
      providerType: "Legal Opinion",
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      status: "Active" as const,
    },
    {
      id: "c48d1e70-9a55-4b21-8e07-2f61d3a09b03",
      name: "Northline Verification",
      providerType: "Field Verification",
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      status: "Inactive" as const,
    },
  ];

  /** A stored third-party verification, as the loan sub-route writes one. */
  const VERIFICATION = {
    id: "e91b6d24-7c30-4f58-9a12-0d4e8b3f7a01",
    loanId: LOAN.id,
    customerId: LOAN.customerId,
    bankId: BANKS[0].id,
    required: true,
    handledByBank: false,
    serviceProviderId: PROVIDERS[0].id,
    providerReference: "SEN-FV-40917",
    status: "Requested" as const,
    result: null,
    requestedAt: "2026-08-14T09:00:00.000Z",
    completedAt: null,
    notes: "Residence visit scheduled.",
  };

  return {
    BANKS,
    LOAN,
    CUSTOMER,
    PROVIDERS,
    VERIFICATION,
    createMock: vi.fn(),
    refreshMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    /** Every `useResource(path, query, enabled)` the render tree asked for. */
    resourceCalls: [] as { path: string; query: unknown; enabled: boolean }[],
    state: {
      loans: [] as (typeof LOAN)[],
      customers: [] as (typeof CUSTOMER)[],
      verifications: [] as Verification[],
      verificationLoading: false,
      verificationError: null as string | null,
      providers: [] as ServiceProvider[],
      /** Exactly the permission keys the signed-in role holds. */
      permissions: [] as string[],
    },
  };
});

const { LOAN, PROVIDERS, VERIFICATION, createMock, refreshMock, toastSuccess, toastError } = h;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/loans",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, create: h.createMock } };
});

/**
 * `refresh()` has to actually re-read, because 5.6's 409 path is *"re-fetch and
 * show the existing row"*. A mock whose `refresh` was a bare spy would let an
 * implementation that never re-reads pass test 15.
 *
 * Each `useResource` call gets its own nonce, and the rows are read out of
 * `h.state` on every render — so a fixture the test swaps in mid-flight (which
 * is exactly what a lost create race looks like) appears the moment the panel
 * refreshes.
 */
vi.mock("@/hooks/use-api", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    useResource: (path: string, query?: unknown, enabled = true) => {
      const [, bump] = React.useState(0);
      const refresh = React.useCallback(() => {
        h.refreshMock(path);
        bump((n) => n + 1);
      }, [path]);
      h.resourceCalls.push({ path, query, enabled });

      if (path === "/verifications") {
        return {
          data: h.state.verificationError ? [] : h.state.verifications,
          total: h.state.verifications.length,
          loading: h.state.verificationLoading,
          error: h.state.verificationError,
          refresh,
          setData: vi.fn(),
        };
      }

      const data =
        path === "/loans"
          ? h.state.loans
          : path === "/customers"
            ? h.state.customers
            : path === "/service-providers"
              ? h.state.providers
              : [];

      return { data, total: data.length, loading: false, error: null, refresh, setData: vi.fn() };
    },
  };
});

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: h.BANKS,
    employees: [],
    teams: [],
    loading: false,
    refresh: vi.fn(),
    bankName: (id: string) => h.BANKS.find((b) => b.id === id)?.name ?? "Unassigned",
    bankById: (id: string) => h.BANKS.find((b) => b.id === id),
    bankShortName: () => "HDFC",
    employeeById: () => undefined,
    employeeName: () => "Unassigned",
    teamName: () => "—",
  }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      name: "Signed-in user",
      email: "user@risenext.com",
      role: { id: "r", key: "team_leader", name: "Team Leader", level: 3 },
      permissions: h.state.permissions,
    },
    can: (key: string) => h.state.permissions.includes(key),
    signOut: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: vi.fn() },
}));

vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
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

import LoansPage from "@/app/(app)/loans/page";

let container: HTMLDivElement;
let root: Root;

/** Manager and Team Leader: may create, may NOT list providers. */
const TEAM_LEADER = ["requests.view", "verification.view", "verification.create"];
/** Admin and Super Admin: both grants. */
const ADMIN = [...TEAM_LEADER, "service_providers.view"];
/** Executive: read only. */
const EXECUTIVE = ["requests.view", "verification.view"];

beforeEach(() => {
  createMock.mockReset();
  createMock.mockImplementation((_path: string, body: Record<string, unknown>) =>
    Promise.resolve({ data: { ...VERIFICATION, ...body } }),
  );
  refreshMock.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  h.resourceCalls.length = 0;

  h.state.loans = [{ ...LOAN }];
  h.state.customers = [{ ...h.CUSTOMER }];
  h.state.verifications = [];
  h.state.verificationLoading = false;
  h.state.verificationError = null;
  h.state.providers = [...PROVIDERS];
  h.state.permissions = [...ADMIN];

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

/* ------------------------------------------------------------------ helpers */

const dialog = () => document.querySelector('[role="dialog"]');
const panel = () => document.querySelector('[data-testid="loan-verification"]');
const testid = (id: string) => document.querySelector(`[data-testid="${id}"]`);
const panelText = () => panel()?.textContent ?? "";

const formError = () =>
  testid("loan-verification-form-error")?.textContent?.trim() ?? null;

const button = (text: string): HTMLButtonElement | undefined =>
  Array.from(panel()?.querySelectorAll("button") ?? []).find((b) =>
    b.textContent?.trim().startsWith(text),
  ) as HTMLButtonElement | undefined;

/** The provider dropdown, which the Select mock renders as a native select. */
const providerSelect = () =>
  testid("verification-provider-field")?.querySelector("select") as
    | HTMLSelectElement
    | undefined;

const requiredSwitch = () =>
  testid("verification-required") as HTMLButtonElement | null;

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const choose = async (select: HTMLSelectElement, value: string) => {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const type = async (id: string, value: string) => {
  const field = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!field) throw new Error(`no field ${id}`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

async function openLoan() {
  await act(async () => {
    root.render(<LoansPage />);
  });
  const row = container.querySelector("tbody tr");
  if (!row) throw new Error("no loan row rendered");
  await click(row);
}

/** Fills in enough for a valid third-party request and submits it. */
async function submitThirdParty(providerId = PROVIDERS[0].id) {
  await openLoan();
  await choose(providerSelect()!, providerId);
  await click(button("Record verification")!);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/* ------------------------------------------------------------------ group A */

describe("A — the read panel tells real rows, an empty result and a failure apart", () => {
  it("1. a stored verification renders its status, provider, reference and result", async () => {
    h.state.verifications = [
      { ...VERIFICATION, status: "Verified", result: "Address confirmed", completedAt: "2026-08-20T09:00:00.000Z" },
    ];

    await openLoan();

    expect(testid("loan-verification-record")).toBeTruthy();
    expect(testid("loan-verification-status")?.textContent).toContain("Verified");
    expect(panelText()).toContain("Sentinel Field Services");
    expect(panelText()).toContain("SEN-FV-40917");
    expect(panelText()).toContain("Address confirmed");
    expect(panelText()).toContain("Residence visit scheduled.");
  });

  it("2. `required` and `handled by the bank` are both shown, and read off the record", async () => {
    h.state.verifications = [
      {
        ...VERIFICATION,
        required: false,
        handledByBank: true,
        serviceProviderId: null,
        providerReference: null,
        status: "Verified",
        result: "Handled by the requesting bank",
      },
    ];

    await openLoan();

    expect(panelText()).toContain("Not required");
    expect(panelText()).toContain("Handled by the requesting bank");
  });

  it("3. an empty result reads as 'no verification recorded', not as an error", async () => {
    h.state.verifications = [];

    await openLoan();

    expect(testid("loan-verification-empty")?.textContent).toContain(
      "No verification recorded for this loan.",
    );
    expect(testid("loan-verification-error")).toBeNull();
  });

  it("4. a failed load reads as a failure, and says the record is not absent", async () => {
    h.state.verificationError = "Could not load this list";

    await openLoan();

    const failure = testid("loan-verification-error");
    expect(failure).toBeTruthy();
    expect(failure?.textContent).toContain("Could not load this list");
    expect(failure?.textContent).toContain("not because this loan has no verification");
    // The two states must never be reachable at once.
    expect(testid("loan-verification-empty")).toBeNull();
  });

  it("5. a load in flight is neither of the two", async () => {
    h.state.verificationLoading = true;

    await openLoan();

    expect(testid("loan-verification-loading")).toBeTruthy();
    expect(testid("loan-verification-empty")).toBeNull();
    expect(testid("loan-verification-error")).toBeNull();
  });

  it("6. a verification belonging to another loan is never shown under this one", async () => {
    h.state.verifications = [{ ...VERIFICATION, loanId: "00000000-0000-4000-8000-00000000dead" }];

    await openLoan();

    expect(testid("loan-verification-record")).toBeNull();
    expect(testid("loan-verification-empty")).toBeTruthy();
  });

  it("7. without verification.view the panel says so rather than showing an empty record", async () => {
    h.state.permissions = ["requests.view"];
    h.state.verifications = [{ ...VERIFICATION }];

    await openLoan();

    const forbidden = testid("loan-verification-forbidden");
    expect(forbidden?.textContent).toContain("verification.view");
    expect(forbidden?.textContent).toContain("This is not an empty record");
    expect(testid("loan-verification-record")).toBeNull();
    expect(testid("loan-verification-empty")).toBeNull();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — creating one issues a real, awaited request", () => {
  it("8. it POSTs to the loan sub-route, never to /verifications", async () => {
    await submitThirdParty();

    expect(createMock).toHaveBeenCalledTimes(1);
    const [path] = createMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe(`/loans/${LOAN.id}/verification`);
    // The factory route has no `beforeWrite`, so it skips `assertSameBank` AND
    // both business rules. It must never be the writer.
    expect(path).not.toBe("/verifications");
  });

  it("9. the third-party body carries required + the chosen provider", async () => {
    await submitThirdParty(PROVIDERS[1].id);

    const [, body] = createMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.required).toBe(true);
    expect(body.serviceProviderId).toBe(PROVIDERS[1].id);
  });

  it("10. turning `required` off sends the bank-handled body and no provider", async () => {
    await openLoan();
    await choose(providerSelect()!, PROVIDERS[0].id);
    await click(requiredSwitch()!);
    await click(button("Record verification")!);

    const [, body] = createMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.required).toBe(false);
    // Not merely absent from the form — actively not sent, because the route
    // stamps `handledByBank: true` on this path.
    expect(body.serviceProviderId).toBeNull();
  });

  it("11. reference and notes are sent when filled and null when blank", async () => {
    await openLoan();
    await choose(providerSelect()!, PROVIDERS[0].id);
    await type("v-reference", "SEN-FV-99001");
    await click(button("Record verification")!);

    const [, first] = createMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(first.providerReference).toBe("SEN-FV-99001");
    expect(first.notes).toBeNull();
  });

  it("12. success is toasted only after the request resolves", async () => {
    const gate = deferred<{ data: Verification }>();
    createMock.mockReturnValue(gate.promise);

    await submitThirdParty();
    expect(toastSuccess).not.toHaveBeenCalled();

    await act(async () => {
      gate.resolve({ data: { ...VERIFICATION } as Verification });
    });

    expect(toastSuccess).toHaveBeenCalledWith("Verification recorded", expect.anything());
    expect(refreshMock).toHaveBeenCalledWith("/verifications");
  });

  it("13. two clicks in one React batch still issue exactly ONE request", async () => {
    const gate = deferred<{ data: Verification }>();
    createMock.mockReturnValue(gate.promise);

    await openLoan();
    await choose(providerSelect()!, PROVIDERS[0].id);
    const record = button("Record verification")!;

    await act(async () => {
      record.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      record.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(createMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve({ data: { ...VERIFICATION } as Verification });
    });
  });

  it("14. the form is not offered once a record exists — the route refuses a second", async () => {
    h.state.verifications = [{ ...VERIFICATION }];

    await openLoan();

    expect(testid("loan-verification-form")).toBeNull();
    expect(button("Record verification")).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — failures branch on the status, never on the message", () => {
  it("15. a 409 re-fetches and shows the record that is actually stored", async () => {
    // The race, reproduced: the create loses, and by the time it is refused the
    // row exists. A panel that does not re-read shows an empty state next to a
    // conflict message.
    createMock.mockImplementation(() => {
      h.state.verifications = [{ ...VERIFICATION, providerReference: "SEN-FV-STORED" }];
      return Promise.reject(
        new ApiError(409, "conflict", "This loan already has a verification record"),
      );
    });

    await submitThirdParty();

    expect(refreshMock).toHaveBeenCalledWith("/verifications");
    expect(testid("loan-verification-record")).toBeTruthy();
    expect(panelText()).toContain("SEN-FV-STORED");
    expect(formError()).toContain("already has a verification record");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("16. no success is claimed for a create that created nothing", async () => {
    createMock.mockRejectedValue(
      new ApiError(409, "conflict", "This loan already has a verification record"),
    );

    await submitThirdParty();

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Verification already recorded", expect.anything());
  });

  it("17. a 409 carrying the OTHER server sentence behaves identically", async () => {
    /*
     * The concurrency path. `verifications_loan_unique` is absent from
     * `CONSTRAINT_MESSAGES` (`error-handler.ts:12-21`), so an interleaved write
     * comes back as the generic *"That record already exists"* for exactly the
     * same situation. An implementation that matched on the route's sentence
     * would treat this as an unknown failure and never re-read.
     */
    createMock.mockImplementation(() => {
      h.state.verifications = [{ ...VERIFICATION, providerReference: "SEN-FV-STORED" }];
      return Promise.reject(new ApiError(409, "conflict", "That record already exists"));
    });

    await submitThirdParty();

    expect(refreshMock).toHaveBeenCalledWith("/verifications");
    expect(testid("loan-verification-record")).toBeTruthy();
    expect(panelText()).toContain("SEN-FV-STORED");
    expect(formError()).toContain("already has a verification record");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("18. a 400 is shown as a form-level message carrying the server's own words", async () => {
    /*
     * The provider rule is raised with `badRequest`, so it is **400 and not
     * 422** — the response carries no `details` array at all and `field-errors`
     * yields nothing from it. It has to land on the form, not on a control.
     */
    createMock.mockRejectedValue(
      new ApiError(
        400,
        "bad_request",
        "A service provider is required when verification_required is true",
      ),
    );

    await submitThirdParty();

    expect(formError()).toBe(
      "A service provider is required when verification_required is true",
    );
    // Not mistaken for the conflict case.
    expect(formError()).not.toContain("already has a verification record");
    expect(testid("loan-verification-empty")).toBeTruthy();
  });

  it("19. a 500 is reported as neither a conflict nor a missing provider", async () => {
    createMock.mockRejectedValue(new ApiError(500, "internal", "Something went wrong"));

    await submitThirdParty();

    expect(formError()).toBe("Something went wrong");
    expect(formError()).not.toContain("already has a verification record");
    expect(formError()).not.toContain("service provider is required");
    // A 5xx must not be mistaken for "one exists" and re-read as though it did.
    expect(refreshMock).not.toHaveBeenCalledWith("/verifications");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("20. an offline failure — no ApiError at all — is handled the same way", async () => {
    createMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await submitThirdParty();

    expect(formError()).toBe("Failed to fetch");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("21. a 422 lands on the control it names (D-031)", async () => {
    createMock.mockRejectedValue(
      new ApiError(422, "validation_failed", "Validation failed", [
        { path: "providerReference", message: "Too long" },
      ]),
    );

    await submitThirdParty();

    const field = document.getElementById("v-reference");
    expect(field?.getAttribute("aria-invalid")).toBe("true");
    expect(testid("loan-verification-form")?.textContent).toContain("Too long");
  });

  it("22. the form stays open and populated so the submission can be retried", async () => {
    createMock.mockRejectedValueOnce(new ApiError(500, "internal", "Something went wrong"));

    await openLoan();
    await choose(providerSelect()!, PROVIDERS[0].id);
    await type("v-reference", "SEN-FV-RETRY");
    await click(button("Record verification")!);

    expect((document.getElementById("v-reference") as HTMLInputElement).value).toBe(
      "SEN-FV-RETRY",
    );
    await click(button("Record verification")!);
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — the provider directory follows service_providers.view (D-049)", () => {
  it("23. with the permission, the provider Select is rendered and populated", async () => {
    await openLoan();

    const select = providerSelect();
    expect(select).toBeTruthy();
    const options = Array.from(select?.options ?? []).map((o) => o.textContent?.trim());
    expect(options.join(" ")).toContain("Sentinel Field Services");
    expect(options.join(" ")).toContain("Meridian Legal & Valuation");
  });

  it("24. only Active providers are offered", async () => {
    await openLoan();

    const options = Array.from(providerSelect()?.options ?? []).map((o) => o.textContent?.trim());
    expect(options.join(" ")).not.toContain("Northline Verification");
  });

  it("25. WITHOUT the permission there is no provider Select at all", async () => {
    // A Team Leader's real grant: verification.create, no service_providers.view.
    h.state.permissions = [...TEAM_LEADER];
    h.state.providers = [];

    await openLoan();

    expect(testid("verification-provider-field")).toBeNull();
    expect(providerSelect()).toBeFalsy();
    // And no empty dropdown standing in for one.
    expect(testid("loan-verification-form")?.querySelectorAll("select").length).toBe(0);
  });

  it("26. the copy blames the permission, and does NOT claim providers do not exist", async () => {
    h.state.permissions = [...TEAM_LEADER];

    await openLoan();

    const copy = testid("verification-no-provider-access")?.textContent ?? "";
    expect(copy).toContain("cannot read the service-provider directory");
    expect(copy).toContain("service_providers.view");
    expect(copy).toContain("not a statement that no providers exist");
    expect(copy).not.toMatch(/no (service )?providers (are|have been) (available|configured|listed)/i);
  });

  it("27. that role is offered only the bank-handled path — no `required` toggle", async () => {
    h.state.permissions = [...TEAM_LEADER];

    await openLoan();

    expect(requiredSwitch()).toBeNull();
  });

  it("28. and its submission sends required:false, which the server accepts without a provider", async () => {
    h.state.permissions = [...TEAM_LEADER];

    await openLoan();
    await click(button("Record verification")!);

    const [path, body] = createMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe(`/loans/${LOAN.id}/verification`);
    expect(body.required).toBe(false);
    expect(body.serviceProviderId).toBeNull();
  });

  it("29. an empty-but-readable directory says something DIFFERENT from the refusal", async () => {
    // This account can read the list; the list has no Active entry. Conflating
    // the two is the mistake D-049 exists to prevent.
    h.state.providers = [];

    await openLoan();

    const copy = testid("verification-no-providers")?.textContent ?? "";
    expect(copy).toContain("No active service providers are listed");
    expect(testid("verification-no-provider-access")).toBeNull();
  });

  it("30. a stored provider is shown by reference when the name cannot be resolved", async () => {
    h.state.permissions = [...TEAM_LEADER];
    h.state.providers = [];
    h.state.verifications = [{ ...VERIFICATION }];

    await openLoan();

    expect(panelText()).toContain("SEN-FV-40917");
    // Never the raw uuid, and never an invented name.
    expect(panelText()).not.toContain(PROVIDERS[0].id);
    expect(panelText()).toContain("service_providers.view");
  });

  it("31. without service_providers.view no provider request is even attempted", async () => {
    h.state.permissions = [...TEAM_LEADER];

    await openLoan();

    /*
     * The hook is still *called* — hooks cannot be conditional — but every call
     * is made with `enabled: false`, so `useResource` issues nothing
     * (`use-api.ts:34-43`). That spares the server a guaranteed 403 and is an
     * affordance only; the route stays the authority (RULES §5, D-005).
     */
    const providerCalls = h.resourceCalls.filter((c) => c.path === "/service-providers");
    expect(providerCalls.length).toBeGreaterThan(0);
    expect(providerCalls.every((c) => c.enabled === false)).toBe(true);
  });

  it("32. with it, the request IS enabled — and asks for the whole directory", async () => {
    await openLoan();

    const providerCalls = h.resourceCalls.filter((c) => c.path === "/service-providers");
    expect(providerCalls.some((c) => c.enabled === true)).toBe(true);
  });

  it("33. the verification read is filtered by loanId on the server, not in the browser", async () => {
    await openLoan();

    const call = h.resourceCalls.find((c) => c.path === "/verifications");
    expect(call?.query).toEqual({ loanId: LOAN.id });
    expect(call?.enabled).toBe(true);
  });

  it("34. and it is not enabled without verification.view", async () => {
    h.state.permissions = ["requests.view"];

    await openLoan();

    const calls = h.resourceCalls.filter((c) => c.path === "/verifications");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.enabled === false)).toBe(true);
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — the create form is gated, and offers nothing the route owns", () => {
  it("35. without verification.create the form is absent — an Executive reads only", async () => {
    h.state.permissions = [...EXECUTIVE];
    h.state.verifications = [{ ...VERIFICATION }];

    await openLoan();

    expect(testid("loan-verification-record")).toBeTruthy();
    expect(testid("loan-verification-form")).toBeNull();
    expect(button("Record verification")).toBeUndefined();
  });

  it("36. and no request can be provoked without it", async () => {
    h.state.permissions = [...EXECUTIVE];

    await openLoan();

    expect(createMock).not.toHaveBeenCalled();
  });

  it("37. the form offers exactly four controls", async () => {
    await openLoan();

    const form = testid("loan-verification-form");
    const controls = Array.from(
      form?.querySelectorAll("input, select, textarea, [role='switch']") ?? [],
    );
    expect(controls.length).toBe(4);
  });

  it("38. there is no control for status, result or the timestamps", async () => {
    await openLoan();

    const form = testid("loan-verification-form");
    const labels = Array.from(form?.querySelectorAll("label") ?? []).map((l) =>
      l.textContent?.trim().toLowerCase(),
    );
    expect(labels).not.toContain("status");
    expect(labels).not.toContain("result");
    expect(labels).not.toContain("requested");
    expect(labels).not.toContain("completed");
    expect(form?.querySelectorAll('input[type="date"]').length).toBe(0);
  });

  it("39. and none for handledByBank, which the route parses and then overwrites", async () => {
    await openLoan();

    const form = testid("loan-verification-form");
    expect(form?.textContent?.toLowerCase()).not.toContain("handled by the bank");
    // Exactly one switch — `required`. A second would be the discarded one.
    expect(form?.querySelectorAll("[role='switch']").length).toBe(1);
  });

  it("40. the body never carries a field the route derives", async () => {
    await submitThirdParty();

    const [, body] = createMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(body).sort()).toEqual([
      "notes",
      "providerReference",
      "required",
      "serviceProviderId",
    ]);
    for (const key of ["handledByBank", "status", "result", "requestedAt", "completedAt", "bankId", "customerId"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it("41. the rest of the dialog is untouched by the panel", async () => {
    await openLoan();

    expect(dialog()?.textContent).toContain("Open customer");
    expect(document.querySelector('[data-testid="loan-dialog-status"]')?.textContent).toContain(
      "Under Review",
    );
  });
});
