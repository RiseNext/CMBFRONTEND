/**
 * TASK 5.5 — the loan edit dialog.
 *
 * `PATCH /api/loans/:id` had **zero frontend callers** (D-056 verified it), so
 * the loan list could create and — after 5.4 — decide, but never correct. This
 * wires it, and the wiring has three obligations the groups below pin:
 *
 *   - **Diff-only (group C).** `patchSchema` means an omitted field keeps its
 *     stored value, so what the form sends *is* the contract. An untouched
 *     dialog issues no request at all; a one-field edit sends one field. Sending
 *     the whole form back would be accepted and would overwrite whatever a
 *     colleague changed in the meantime (**D-052**) — and because the money
 *     columns arrive as strings (`"2500000.00"` against a box holding
 *     `"2500000"`), a naive implementation sends three of them every time the
 *     dialog is opened and closed.
 *   - **`status` and `amountApproved` are unreachable (group D).** The route
 *     refuses both with 422 (**D-056**) because `PATCH {"status":"Approved"}`
 *     was a privilege bypass: Team Leader holds `requests.edit` and not
 *     `requests.approve`. `loan-patch.test.ts` proves the payload builder cannot
 *     express them; this proves the dialog cannot either, and that a refusal is
 *     surfaced rather than swallowed.
 *   - **The server's row is adopted (group E), and a failure is honest (group
 *     F).** D-026 and D-004/D-031, the same rules 5.4 follows one dialog over.
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
    /** Column scale, deliberately — the box holds "2500000". */
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
    dueDate: "2026-10-15T00:00:00.000Z",
    notes: "Awaiting salary slips",
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
    updateMock: vi.fn(),
    refreshMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    state: {
      loans: [] as (typeof LOAN)[],
      customers: [] as (typeof CUSTOMER)[],
      permissions: [] as string[],
    },
  };
});

const { LOAN, updateMock, refreshMock, toastSuccess, toastError } = h;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/loans",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, update: h.updateMock } };
});

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
  updateMock.mockReset();
  updateMock.mockImplementation((_path: string, patch: Record<string, unknown>) =>
    Promise.resolve({ data: { ...LOAN, ...patch } }),
  );
  refreshMock.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  h.state.loans = [{ ...LOAN }];
  h.state.customers = [{ ...h.CUSTOMER }];
  h.state.permissions = ["requests.view", "requests.edit"];

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

const editError = () =>
  document.querySelector('[data-testid="loan-edit-error"]')?.textContent?.trim() ?? null;

const valueOf = (id: string) =>
  document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)?.value ?? "";

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const setNativeValue = (
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) => {
  const proto =
    element instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
};

async function type(id: string, value: string) {
  const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  if (!field) throw new Error(`#${id} not rendered`);
  await act(async () => {
    setNativeValue(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The `<select>` inside the open dialog that offers `option`. */
async function choose(option: string) {
  const select = Array.from(dialog()?.querySelectorAll("select") ?? []).find((s) =>
    Array.from(s.options).some((o) => o.textContent?.trim() === option),
  );
  if (!select) throw new Error(`no select in the dialog offers "${option}"`);
  await act(async () => {
    setNativeValue(select, option);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Renders the page and opens the detail dialog on the only loan. */
async function openDetail() {
  await act(async () => {
    root.render(<LoansPage />);
  });
  const row = container.querySelector("tbody tr");
  if (!row) throw new Error("no loan row rendered");
  await click(row);
}

/** …and then the edit dialog. */
async function openEdit() {
  await openDetail();
  await click(dialogButton("Edit")!);
}

const savedPatch = () =>
  (updateMock.mock.calls[0] ?? [])[1] as Record<string, unknown> | undefined;

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

describe("A — the control follows the permission the route enforces", () => {
  it("1. with requests.edit, Edit is offered on the detail dialog", async () => {
    await openDetail();
    expect(dialogButton("Edit")).toBeTruthy();
  });

  it("2. without requests.edit, it is not rendered at all", async () => {
    h.state.permissions = ["requests.view"];
    await openDetail();

    expect(dialog()).toBeTruthy();
    expect(dialogButton("Edit")).toBeUndefined();
  });

  it("3. and no PATCH can be provoked without it", async () => {
    h.state.permissions = ["requests.view"];
    await openDetail();

    expect(updateMock).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — the dialog opens seeded from the record", () => {
  it("4. it names the loan it is editing", async () => {
    await openEdit();
    expect(dialog()?.textContent).toContain("Edit LN-11042");
  });

  it("5. every box carries the stored value", async () => {
    await openEdit();

    expect(valueOf("e-amount")).toBe("2500000");
    expect(valueOf("e-rate")).toBe("9.25");
    expect(valueOf("e-tenure")).toBe("240");
    expect(valueOf("e-due")).toBe("2026-10-15");
    expect(valueOf("e-notes")).toBe("Awaiting salary slips");
  });

  it("6. the money box shows what a person would type, not the column's scale", async () => {
    await openEdit();
    expect(valueOf("e-amount")).not.toBe("2500000.00");
  });

  it("7. it says which fields are NOT editable here, rather than dropping them silently", async () => {
    await openEdit();
    expect(dialog()?.textContent).toContain(
      "Status and the sanctioned amount are decided by Approve or Reject, not here.",
    );
  });

  it("8. it offers no control for status or the sanctioned amount", async () => {
    await openEdit();

    const inputs = Array.from(dialog()?.querySelectorAll("input, select, textarea") ?? []);
    expect(inputs.length).toBe(7);
    for (const select of dialog()?.querySelectorAll("select") ?? []) {
      const options = Array.from(select.options).map((o) => o.textContent?.trim());
      expect(options).not.toContain("Approved");
      expect(options).not.toContain("Rejected");
    }
  });

  it("9. an abandoned edit is not carried into the next one", async () => {
    await openEdit();
    await type("e-notes", "typed but never saved");
    await click(dialogButton("Cancel")!);

    expect(updateMock).not.toHaveBeenCalled();

    await click(container.querySelector("tbody tr")!);
    await click(dialogButton("Edit")!);
    expect(valueOf("e-notes")).toBe("Awaiting salary slips");
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — only what changed reaches the wire", () => {
  it("10. saving an UNTOUCHED form issues no request at all", async () => {
    // The numeric-string trap lives here: "2500000.00" stored against
    // "2500000" in the box. A string comparison sends three money fields for
    // an edit nobody made.
    await openEdit();
    await click(dialogButton("Save changes")!);

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("11. …and claims no success for the request it did not make", async () => {
    await openEdit();
    await click(dialogButton("Save changes")!);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("12. changing one field sends exactly one field", async () => {
    await openEdit();
    await type("e-notes", "Docs received");
    await click(dialogButton("Save changes")!);

    expect(updateMock).toHaveBeenCalledWith(`/loans/${LOAN.id}`, { notes: "Docs received" });
  });

  it("13. a numeric edit is sent as a number", async () => {
    await openEdit();
    await type("e-amount", "2400000");
    await click(dialogButton("Save changes")!);

    expect(savedPatch()).toEqual({ amountRequested: 2400000 });
    expect(typeof savedPatch()!.amountRequested).toBe("number");
  });

  it("14. the Product select sends loanType and nothing else", async () => {
    await openEdit();
    await choose("Gold Loan");
    await click(dialogButton("Save changes")!);

    expect(savedPatch()).toEqual({ loanType: "Gold Loan" });
  });

  it("15. the Priority select sends priority and nothing else", async () => {
    await openEdit();
    await choose("Urgent");
    await click(dialogButton("Save changes")!);

    expect(savedPatch()).toEqual({ priority: "Urgent" });
  });

  it("16. clearing the notes sends null, so the column is actually cleared", async () => {
    await openEdit();
    await type("e-notes", "");
    await click(dialogButton("Save changes")!);

    expect(savedPatch()).toEqual({ notes: null });
  });

  it("17. two edits send exactly those two", async () => {
    await openEdit();
    await type("e-tenure", "120");
    await choose("High");
    await click(dialogButton("Save changes")!);

    expect(savedPatch()).toEqual({ tenureMonths: 120, priority: "High" });
  });

  it("18. the request goes to PATCH /loans/:id, addressed by uuid", async () => {
    await openEdit();
    await type("e-rate", "9.5");
    await click(dialogButton("Save changes")!);

    expect(updateMock.mock.calls[0][0]).toBe(`/loans/${LOAN.id}`);
  });

  it("19. a client-side refusal stops the request and explains itself", async () => {
    await openEdit();
    await type("e-tenure", "601");
    await click(dialogButton("Save changes")!);

    expect(updateMock).not.toHaveBeenCalled();
    expect(editError()).toContain("between 0 and 600");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("20. two clicks in one React batch still issue ONE request", async () => {
    const gate = deferred<{ data: Loan }>();
    updateMock.mockReturnValue(gate.promise);

    await openEdit();
    await type("e-notes", "Docs received");
    const save = dialogButton("Save changes")!;

    await act(async () => {
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(updateMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve({ data: { ...LOAN, notes: "Docs received" } as Loan });
    });
  });

  it("21. Cancel is disabled while the PATCH is open", async () => {
    const gate = deferred<{ data: Loan }>();
    updateMock.mockReturnValue(gate.promise);

    await openEdit();
    await type("e-notes", "Docs received");
    await click(dialogButton("Save changes")!);

    expect(dialogButton("Cancel")!.disabled).toBe(true);
    expect(dialogButton("Saving")!.disabled).toBe(true);

    await act(async () => {
      gate.resolve({ data: { ...LOAN, notes: "Docs received" } as Loan });
    });
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — D-056: status and amountApproved never appear in a payload", () => {
  it("22. changing every editable field still sends only the seven", async () => {
    await openEdit();
    await choose("Vehicle Loan");
    await choose("Urgent");
    await type("e-amount", "900000");
    await type("e-rate", "11");
    await type("e-tenure", "24");
    await type("e-due", "2027-03-31");
    await type("e-notes", "Rework with a new lender");
    await click(dialogButton("Save changes")!);

    expect(Object.keys(savedPatch()!).sort()).toEqual([
      "amountRequested",
      "dueDate",
      "interestRate",
      "loanType",
      "notes",
      "priority",
      "tenureMonths",
    ]);
  });

  it("23. no payload the dialog can produce carries `status`", async () => {
    await openEdit();
    await choose("Vehicle Loan");
    await type("e-notes", "anything");
    await click(dialogButton("Save changes")!);

    expect(savedPatch()).not.toHaveProperty("status");
    expect(JSON.stringify(savedPatch())).not.toContain("status");
  });

  it("24. nor `amountApproved`", async () => {
    await openEdit();
    await type("e-amount", "900000");
    await click(dialogButton("Save changes")!);

    expect(savedPatch()).not.toHaveProperty("amountApproved");
    expect(JSON.stringify(savedPatch())).not.toContain("amountApproved");
  });

  it("25. editing an already-APPROVED loan is no different", async () => {
    h.state.loans = [
      { ...LOAN, status: "Approved" as (typeof LOAN)["status"], amountApproved: "2400000.00" },
    ];

    await openEdit();
    await type("e-notes", "post-sanction note");
    await click(dialogButton("Save changes")!);

    expect(savedPatch()).toEqual({ notes: "post-sanction note" });
  });

  it("26. if the route ever DID refuse one, the refusal is surfaced, not dropped", async () => {
    // `notOnThisRoute()` answers 422 with `path: "status"`. That names no field
    // this form renders, so `formLevelError` appends the server's own words
    // rather than discarding them (D-031).
    updateMock.mockRejectedValue(
      new ApiError(422, "validation_failed", "Invalid input", [
        {
          path: "status",
          message: "Loan status is not editable here. Use POST /api/loans/:id/approve instead.",
        },
      ]),
    );

    await openEdit();
    await type("e-notes", "anything");
    await click(dialogButton("Save changes")!);

    expect(editError()).toContain("Loan status is not editable here");
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — a successful save adopts the server's row (D-026)", () => {
  it("27. the toast fires only after the request resolved", async () => {
    const gate = deferred<{ data: Loan }>();
    updateMock.mockReturnValue(gate.promise);

    await openEdit();
    await type("e-notes", "Docs received");
    await click(dialogButton("Save changes")!);

    expect(toastSuccess).not.toHaveBeenCalled();

    await act(async () => {
      gate.resolve({ data: { ...LOAN, notes: "Docs received" } as Loan });
    });

    expect(toastSuccess).toHaveBeenCalledWith(
      "Loan updated",
      expect.objectContaining({ description: "LN-11042 saved." }),
    );
  });

  it("28. the list is refreshed", async () => {
    await openEdit();
    refreshMock.mockClear();
    await type("e-notes", "Docs received");
    await click(dialogButton("Save changes")!);

    expect(refreshMock).toHaveBeenCalled();
  });

  it("29. the SERVER'S value is shown, not the one that was typed", async () => {
    /*
     * The server normalises the product name. A dialog echoing its own form
     * state reads "Gold Loan" here and fails.
     *
     * Asserted on the reopened detail dialog rather than the table cell: the
     * Type column is declared `{ key: "type" }` with no `render`, while the
     * field is `loanType`, so `DataTable`'s fallback renders "—" for every row.
     * That is a pre-existing display defect of this table, unrelated to 5.5 and
     * not fixed here — it is noted so the next reader does not mistake it for
     * this task's doing.
     */
    updateMock.mockResolvedValue({ data: { ...LOAN, loanType: "Gold Loan (Retail)" } });

    await openEdit();
    await choose("Gold Loan");
    await click(dialogButton("Save changes")!);

    expect(dialog()?.textContent).toContain("Gold Loan (Retail)");
    expect(dialog()?.textContent).not.toContain("Home Loan");
  });

  it("30. the detail dialog reopens on the stored row", async () => {
    updateMock.mockResolvedValue({ data: { ...LOAN, notes: "normalised by the server" } });

    await openEdit();
    await type("e-notes", "typed");
    await click(dialogButton("Save changes")!);

    // The edit dialog is gone and the detail view is back.
    expect(document.querySelector("#e-notes")).toBeNull();
    expect(dialog()?.textContent).toContain("APP-4471");
  });

  it("31. the amount the server stored is what the table shows", async () => {
    updateMock.mockResolvedValue({ data: { ...LOAN, amountRequested: "2450000.00" } });

    await openEdit();
    await type("e-amount", "2400000");
    await click(dialogButton("Save changes")!);

    expect(container.querySelector("tbody tr")?.textContent).toContain("24,50,000");
  });
});

/* ------------------------------------------------------------------ group F */

describe("F — a failure keeps the dialog usable and claims nothing", () => {
  it("32. the dialog stays open with the typed values intact", async () => {
    updateMock.mockRejectedValue(new ApiError(500, "internal", "Something went wrong"));

    await openEdit();
    await type("e-notes", "Docs received");
    await click(dialogButton("Save changes")!);

    expect(document.querySelector("#e-notes")).toBeTruthy();
    expect(valueOf("e-notes")).toBe("Docs received");
  });

  it("33. the server's own sentence is shown", async () => {
    updateMock.mockRejectedValue(
      new ApiError(403, "forbidden", "You do not have access to this bank"),
    );

    await openEdit();
    await type("e-notes", "Docs received");
    await click(dialogButton("Save changes")!);

    expect(editError()).toBe("You do not have access to this bank");
  });

  it("34. a 422 lands on the control it names, not on a generic line (D-031)", async () => {
    updateMock.mockRejectedValue(
      new ApiError(422, "validation_failed", "Invalid input", [
        { path: "tenureMonths", message: "Tenure must be at most 600 months" },
      ]),
    );

    await openEdit();
    await type("e-tenure", "120");
    await click(dialogButton("Save changes")!);

    const tenureGroup = document.querySelector("#e-tenure")?.parentElement;
    expect(tenureGroup?.textContent).toContain("Tenure must be at most 600 months");
    // Every issue mapped, so the dialog-level line stays quiet.
    expect(editError()).toBeNull();
  });

  it("35. NO success is claimed for a request that failed (D-004)", async () => {
    updateMock.mockRejectedValue(new ApiError(500, "internal", "Something went wrong"));

    await openEdit();
    refreshMock.mockClear();
    await type("e-notes", "Docs received");
    await click(dialogButton("Save changes")!);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("36. the row is untouched — nothing optimistic is written by an edit", async () => {
    updateMock.mockRejectedValue(new ApiError(500, "internal", "Something went wrong"));

    await openEdit();
    await type("e-amount", "1");
    await click(dialogButton("Save changes")!);

    expect(container.querySelector("tbody tr")?.textContent).toContain("25,00,000");
  });

  it("37. the save is retryable, and a stale error is cleared", async () => {
    updateMock.mockRejectedValueOnce(new ApiError(500, "internal", "Something went wrong"));

    await openEdit();
    await type("e-notes", "Docs received");
    await click(dialogButton("Save changes")!);
    expect(editError()).toBe("Something went wrong");

    await click(dialogButton("Save changes")!);
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(toastSuccess).toHaveBeenCalled();
  });
});
