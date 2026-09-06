/**
 * TASK 5.4 — Approve and Reject issue a real request.
 *
 * What was there before issued **none**:
 *
 * ```tsx
 * function updateStatus(loan: Loan, status: LoanStatus) {
 *   refresh();
 *   setSelected((prev) => (prev ? { ...prev, status } : prev));
 *   toast.success(`Marked ${status.toLowerCase()}`, ...);
 * }
 * ```
 *
 * — a success message for an approval that never happened, which the `refresh()`
 * one line above it then silently undid. That is D-004's definition of the
 * defect, on the two controls that decide whether a loan is sanctioned.
 *
 * Four properties are pinned here, and each has a group:
 *
 *   - **B** the request is actually made, to `/loans/:id/approve`, for both
 *     decisions, carrying only `{ status }`;
 *   - **C** the update is optimistic and the SERVER'S returned row wins on
 *     success (**D-026**) — the fixture deliberately answers with a status other
 *     than the one asked for, so a UI that echoed its own guess fails;
 *   - **D** a failure **rolls back** to the row the dialog opened on, shows the
 *     server's own sentence, and claims nothing;
 *   - **A** the controls are absent without `requests.approve`. Team Leader and
 *     Executive hold `requests.edit` but not `requests.approve`, so the buttons
 *     they used to see could only ever have produced a 403. Frontend gating is
 *     informational; the route is the authority (RULES §5).
 *
 * The transition state machine is deliberately NOT reimplemented on the client.
 * Group E pins that a 422 from the server's machine is surfaced verbatim rather
 * than pre-empted by a rule that would drift from `loanTransitions`.
 *
 * Follows D-012: `react-dom/client` + React 19's `act`, no component-testing
 * library.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { Loan } from "@/lib/types";

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

  return {
    BANKS,
    LOAN,
    CUSTOMER,
    actionMock: vi.fn(),
    refreshMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    state: {
      loans: [] as (typeof LOAN)[],
      customers: [] as (typeof CUSTOMER)[],
      /** Exactly the permission keys the signed-in role holds. */
      permissions: [] as string[],
    },
  };
});

const { LOAN, actionMock, refreshMock, toastSuccess, toastError } = h;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/loans",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, action: h.actionMock } };
});

/*
 * A stateful `useResource`, because 5.4's rollback is written through `setData`.
 * A mock that handed back a frozen array would let a broken rollback pass.
 */
vi.mock("@/hooks/use-api", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    useResource: (path: string) => {
      const seed = path === "/loans" ? h.state.loans : h.state.customers;
      const [data, setData] = React.useState<unknown[]>(seed);
      return {
        data,
        total: data.length,
        loading: false,
        error: null,
        refresh: h.refreshMock,
        setData,
      };
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

beforeEach(() => {
  actionMock.mockReset();
  actionMock.mockImplementation((_path: string, body: { status: string }) =>
    Promise.resolve({ data: { ...LOAN, status: body.status } }),
  );
  refreshMock.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  h.state.loans = [{ ...LOAN }];
  h.state.customers = [{ ...h.CUSTOMER }];
  // The permission under test. Every group but A holds it.
  h.state.permissions = ["requests.view", "requests.approve", "requests.edit"];

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

const dialogButton = (text: string): HTMLButtonElement | undefined =>
  Array.from(dialog()?.querySelectorAll("button") ?? []).find((b) =>
    b.textContent?.trim().startsWith(text),
  ) as HTMLButtonElement | undefined;

const dialogStatus = () =>
  document.querySelector('[data-testid="loan-dialog-status"]')?.textContent?.trim() ?? "";

const decisionError = () =>
  document.querySelector('[data-testid="loan-decision-error"]')?.textContent?.trim() ?? null;

/** The status cell of the first table row — the list behind the dialog. */
const rowStatus = () => {
  const cells = container.querySelectorAll("tbody tr:first-child td");
  return cells[7]?.textContent?.trim() ?? "";
};

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/* ------------------------------------------------------------------ group A */

describe("A — the controls follow the permission the route enforces", () => {
  it("1. with requests.approve, both buttons are offered", async () => {
    await openLoan();

    expect(dialogButton("Approve")).toBeTruthy();
    expect(dialogButton("Reject")).toBeTruthy();
  });

  it("2. without requests.approve, neither button is rendered", async () => {
    // A Team Leader's actual grant: edit and create, but not approve.
    h.state.permissions = ["requests.view", "requests.edit", "requests.create"];

    await openLoan();

    expect(dialog()).toBeTruthy();
    expect(dialogButton("Approve")).toBeUndefined();
    expect(dialogButton("Reject")).toBeUndefined();
  });

  it("3. the rest of the dialog is unaffected — it is a read-only view, not a refusal", async () => {
    h.state.permissions = ["requests.view"];

    await openLoan();

    expect(dialog()?.textContent).toContain("Open customer");
    expect(dialogStatus()).toBe("Under Review");
  });

  it("4. and no request can be provoked without the permission", async () => {
    h.state.permissions = ["requests.view"];

    await openLoan();

    expect(actionMock).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — a request is actually issued, for both decisions", () => {
  it("5. Approve POSTs to /loans/:id/approve with status Approved", async () => {
    await openLoan();
    await click(dialogButton("Approve")!);

    expect(actionMock).toHaveBeenCalledTimes(1);
    expect(actionMock).toHaveBeenCalledWith(`/loans/${LOAN.id}/approve`, { status: "Approved" });
  });

  it("6. Reject POSTs to the same route with status Rejected", async () => {
    await openLoan();
    await click(dialogButton("Reject")!);

    expect(actionMock).toHaveBeenCalledTimes(1);
    expect(actionMock).toHaveBeenCalledWith(`/loans/${LOAN.id}/approve`, { status: "Rejected" });
  });

  it("7. the body carries nothing but the status — approvedBy/approvedAt are the route's", async () => {
    await openLoan();
    await click(dialogButton("Approve")!);

    const [, body] = actionMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(body)).toEqual(["status"]);
    expect(body).not.toHaveProperty("approvedBy");
    expect(body).not.toHaveProperty("approvedAt");
  });

  it("8. the list is refreshed once the decision is stored", async () => {
    await openLoan();
    refreshMock.mockClear();
    await click(dialogButton("Approve")!);

    expect(refreshMock).toHaveBeenCalled();
  });

  it("9. two clicks in one React batch still issue exactly ONE request", async () => {
    const gate = deferred<{ data: Loan }>();
    actionMock.mockReturnValue(gate.promise);

    await openLoan();
    const approve = dialogButton("Approve")!;

    await act(async () => {
      approve.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      approve.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(actionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve({ data: { ...LOAN, status: "Approved" } as Loan });
    });
  });

  it("10. both buttons are disabled while a decision is in flight", async () => {
    const gate = deferred<{ data: Loan }>();
    actionMock.mockReturnValue(gate.promise);

    await openLoan();
    await click(dialogButton("Approve")!);

    expect(dialogButton("Approving")!.disabled).toBe(true);
    expect(dialogButton("Reject")!.disabled).toBe(true);

    await act(async () => {
      gate.resolve({ data: { ...LOAN, status: "Approved" } as Loan });
    });
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — optimistic, then the server's own row (D-026)", () => {
  it("11. the badge answers the click before the request settles", async () => {
    const gate = deferred<{ data: Loan }>();
    actionMock.mockReturnValue(gate.promise);

    await openLoan();
    expect(dialogStatus()).toBe("Under Review");

    await click(dialogButton("Approve")!);
    expect(dialogStatus()).toBe("Approved");

    await act(async () => {
      gate.resolve({ data: { ...LOAN, status: "Approved" } as Loan });
    });
  });

  it("12. the table row moves optimistically too, not just the dialog", async () => {
    const gate = deferred<{ data: Loan }>();
    actionMock.mockReturnValue(gate.promise);

    await openLoan();
    expect(rowStatus()).toBe("Under Review");

    await click(dialogButton("Approve")!);
    expect(rowStatus()).toBe("Approved");

    await act(async () => {
      gate.resolve({ data: { ...LOAN, status: "Approved" } as Loan });
    });
  });

  it("13. the SERVER'S status wins over the one that was requested", async () => {
    // The whole point of D-026. Approve is clicked, the server stores something
    // else, and the screen must show what was stored. A UI echoing its own
    // optimistic guess reads "Approved" here and fails.
    actionMock.mockResolvedValue({ data: { ...LOAN, status: "Disbursed" } });

    await openLoan();
    await click(dialogButton("Approve")!);

    expect(dialogStatus()).toBe("Disbursed");
  });

  it("14. the table row adopts the server's status as well", async () => {
    actionMock.mockResolvedValue({ data: { ...LOAN, status: "Disbursed" } });

    await openLoan();
    await click(dialogButton("Approve")!);

    expect(rowStatus()).toBe("Disbursed");
  });

  it("15. other fields the route wrote are adopted too, not only the status", async () => {
    // `/approve` stamps `approvedBy`/`approvedAt` and touches `updatedAt`; a
    // hand-patched `{...prev, status}` would keep the stale row around it.
    actionMock.mockResolvedValue({
      data: { ...LOAN, status: "Approved", amountApproved: "2400000.00" },
    });

    await openLoan();
    await click(dialogButton("Approve")!);

    expect(dialog()?.textContent).toContain("24,00,000");
  });

  it("16. the success toast reports the stored status, not the requested one", async () => {
    actionMock.mockResolvedValue({ data: { ...LOAN, status: "Disbursed" } });

    await openLoan();
    await click(dialogButton("Approve")!);

    expect(toastSuccess).toHaveBeenCalledWith(
      "Marked disbursed",
      expect.objectContaining({ description: expect.stringContaining("LN-11042") }),
    );
  });

  it("17. the toast names the loan by its code, never by its raw uuid", async () => {
    await openLoan();
    await click(dialogButton("Approve")!);

    const [, options] = toastSuccess.mock.calls[0] as [string, { description: string }];
    expect(options.description).not.toContain(LOAN.id);
    expect(options.description).toContain("LN-11042");
  });

  it("18. a rejection is reported as a rejection", async () => {
    await openLoan();
    await click(dialogButton("Reject")!);

    expect(toastSuccess).toHaveBeenCalledWith("Marked rejected", expect.anything());
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — a failure rolls back and says so", () => {
  it("19. the optimistic status is rolled back in the dialog", async () => {
    actionMock.mockRejectedValue(new ApiError(403, "forbidden", "You may not approve loans"));

    await openLoan();
    await click(dialogButton("Approve")!);

    expect(dialogStatus()).toBe("Under Review");
  });

  it("20. and in the table row behind it", async () => {
    actionMock.mockRejectedValue(new ApiError(403, "forbidden", "You may not approve loans"));

    await openLoan();
    await click(dialogButton("Approve")!);

    expect(rowStatus()).toBe("Under Review");
  });

  it("21. the rollback restores the whole row, not just the status", async () => {
    actionMock.mockRejectedValue(new ApiError(500, "internal", "Something went wrong"));

    await openLoan();
    const before = dialog()?.textContent ?? "";
    await click(dialogButton("Reject")!);

    // Everything except the newly-shown error line is as it was.
    expect(dialogStatus()).toBe("Under Review");
    expect(before).toContain("APP-4471");
    expect(dialog()?.textContent).toContain("APP-4471");
  });

  it("22. the server's own sentence is shown in the dialog", async () => {
    actionMock.mockRejectedValue(
      new ApiError(422, "validation_failed", "A loan cannot move from Under Review to Disbursed"),
    );

    await openLoan();
    await click(dialogButton("Approve")!);

    expect(decisionError()).toBe("A loan cannot move from Under Review to Disbursed");
  });

  it("23. it is in the toast as well, under an honest heading", async () => {
    actionMock.mockRejectedValue(new ApiError(403, "forbidden", "You may not approve loans"));

    await openLoan();
    await click(dialogButton("Approve")!);

    expect(toastError).toHaveBeenCalledWith(
      "Could not approve",
      expect.objectContaining({ description: "You may not approve loans" }),
    );
  });

  it("24. NO success is claimed for a request that failed (D-004)", async () => {
    actionMock.mockRejectedValue(new ApiError(403, "forbidden", "You may not approve loans"));

    await openLoan();
    refreshMock.mockClear();
    await click(dialogButton("Approve")!);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("25. the dialog stays open and usable so the decision can be retried", async () => {
    actionMock.mockRejectedValueOnce(new ApiError(500, "internal", "Something went wrong"));

    await openLoan();
    await click(dialogButton("Approve")!);

    expect(dialog()).toBeTruthy();
    expect(dialogButton("Approve")!.disabled).toBe(false);

    await click(dialogButton("Approve")!);
    expect(actionMock).toHaveBeenCalledTimes(2);
  });

  it("26. a stale error is cleared when the next decision starts", async () => {
    actionMock.mockRejectedValueOnce(new ApiError(500, "internal", "Something went wrong"));

    await openLoan();
    await click(dialogButton("Approve")!);
    expect(decisionError()).toBe("Something went wrong");

    await click(dialogButton("Reject")!);
    expect(decisionError()).toBeNull();
  });

  it("27. a rejection failure reports a rejection failure", async () => {
    actionMock.mockRejectedValue(new ApiError(422, "validation_failed", "Rejected is terminal"));

    await openLoan();
    await click(dialogButton("Reject")!);

    expect(toastError).toHaveBeenCalledWith(
      "Could not reject",
      expect.objectContaining({ description: "Rejected is terminal" }),
    );
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — the transition machine stays on the server", () => {
  it("28. a legal-looking edge is still sent; nothing is refused locally", async () => {
    // Under Review → Rejected is legal, and would be sent either way. The point
    // is that the client does not consult a table of its own before asking.
    await openLoan();
    await click(dialogButton("Reject")!);

    expect(actionMock).toHaveBeenCalledWith(`/loans/${LOAN.id}/approve`, { status: "Rejected" });
  });

  it("29. an already-terminal loan still asks the server rather than pre-empting it", async () => {
    // A client-side copy of `loanTransitions` would refuse this without asking
    // and would drift from the server's table the first time it changed.
    h.state.loans = [{ ...LOAN, status: "Rejected" as (typeof LOAN)["status"] }];
    actionMock.mockRejectedValue(
      new ApiError(422, "validation_failed", "A loan cannot move from Rejected to Approved"),
    );

    await openLoan();
    await click(dialogButton("Approve")!);

    expect(actionMock).toHaveBeenCalledTimes(1);
    expect(decisionError()).toBe("A loan cannot move from Rejected to Approved");
  });

  it("30. and the refusal leaves the loan exactly as the server has it", async () => {
    h.state.loans = [{ ...LOAN, status: "Rejected" as (typeof LOAN)["status"] }];
    actionMock.mockRejectedValue(
      new ApiError(422, "validation_failed", "A loan cannot move from Rejected to Approved"),
    );

    await openLoan();
    await click(dialogButton("Approve")!);

    expect(dialogStatus()).toBe("Rejected");
    expect(rowStatus()).toBe("Rejected");
  });
});
