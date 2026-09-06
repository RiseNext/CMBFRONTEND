/**
 * TASKS 5.1 (BUG-015), 5.10 (D-058) and 5.11 (D-059) — the loan create dialog.
 *
 * **5.1 / BUG-015.** The page held two booleans. `createOpen` drove the dialog
 * (`:316` at the time of the report); `open` was declared, opened nothing, and
 * was the one `createLoan` closed on success. So a successful create fired its
 * toast and left the dialog on screen with the same customer, amount, tenure
 * and rate still populated — and the natural reaction to a dialog that did not
 * close is to submit again. The form was never cleared and the submit button
 * was never disabled, so each further click created another identical loan
 * file. `POST /api/loans` has no idempotency key and no duplicate check.
 *
 * The fix is four things, and this file has a test for each: close the right
 * dialog, delete the dead `open` state, reset the form, and serialize the
 * request. **The serialization is a ref, not the `saving` state** — `disabled`
 * and a state check both only take effect after a re-render, so two clicks
 * landing in one React batch would each read `saving === false` and each issue
 * a POST. Group A dispatches exactly that.
 *
 * Note what is *not* done: there is no client-side duplicate suppression. The
 * second click is dropped because a request is already open, never because its
 * payload looks familiar — a user who genuinely wants two identical files can
 * still create them, one after the other.
 *
 * **5.10 / D-058.** The dialog told the user *"EMI is calculated on submit
 * using the rate and tenure you enter."* `createLoan` does not send `emi`, the
 * server applies `emi: money.default(0)` and stores zero, and the detail dialog
 * renders "—" forever. Group D pins the sentence gone — and no EMI arithmetic
 * put in its place.
 *
 * **5.11 / D-059.** A Bank `<Select>` wrote `form.bankId` while `createLoan`
 * submitted `bankId: customer.bankId`, so the choice was discarded — and since
 * `resolvedBankId` fell back to `banks[0]`, the control usually displayed a
 * *different* bank than the one used. The fixture here is built to catch
 * exactly that: the customer belongs to the **second** bank, so anything still
 * defaulting to `banks[0]` shows the wrong one (group E).
 *
 * Follows D-012: `react-dom/client` + React 19's `act`, no component-testing
 * library, `vi.hoisted` for anything the mock factories close over.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => {
  const BANKS = [
    { id: "b1000000-0000-4000-8000-000000000001", name: "HDFC Bank", shortName: "HDFC", code: "HDFC" },
    { id: "b2000000-0000-4000-8000-000000000002", name: "ICICI Bank", shortName: "ICICI", code: "ICICI" },
  ];

  /** Deliberately on `BANKS[1]`, so a control defaulting to `banks[0]` is wrong. */
  const CUSTOMER = {
    id: "3f8b21c4-9d0e-4a77-b512-6ce4a8f01d93",
    code: "CUS-10001",
    bankId: BANKS[1].id,
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
    CUSTOMER,
    createMock: vi.fn(),
    refreshMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    state: { customers: [] as (typeof CUSTOMER)[] },
  };
});

const { BANKS, CUSTOMER, createMock, refreshMock, toastSuccess, toastError } = h;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/loans",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, create: h.createMock } };
});

vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string) => {
    const data = path === "/customers" ? h.state.customers : [];
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

/** Radix Select renders through a portal and needs pointer APIs jsdom lacks;
 *  a native `<select>` keeps the value contract identical and testable. */
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
  createMock.mockReset();
  createMock.mockResolvedValue({ data: { id: "new-loan", code: "LN-20099" } });
  refreshMock.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  h.state.customers = [{ ...CUSTOMER }];

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

const bodyText = () => document.body.textContent ?? "";

const dialog = () => document.querySelector('[role="dialog"]');

const buttonByText = (text: string): HTMLButtonElement | undefined =>
  Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined;

/** The dialog's own footer button, not the header trigger of the same name. */
const dialogButton = (text: string): HTMLButtonElement | undefined =>
  Array.from(dialog()?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined;

const submitButton = () =>
  Array.from(dialog()?.querySelectorAll("button") ?? []).find((b) =>
    b.textContent?.trim().startsWith("Submit"),
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

const valueOf = (id: string) =>
  document.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "";

/** The `space-y-1.5` wrapper whose own child `<label>` reads `labelText`. */
function fieldGroup(labelText: string): Element | undefined {
  return Array.from(dialog()?.querySelectorAll("div") ?? []).find(
    (div) => div.querySelector(":scope > label")?.textContent?.trim() === labelText,
  );
}

async function openCreateDialog() {
  await act(async () => {
    root.render(<LoansPage />);
  });
  await click(buttonByText("New application")!);
}

/** A promise the test holds open, so "in flight" is an observable state. */
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

describe("A — one click, one request; two clicks, still one request", () => {
  it("1. two clicks dispatched in a single act issue exactly ONE POST", async () => {
    // The regression guard for BUG-015's impact. Both clicks are dispatched
    // before React can re-render, so `disabled` cannot have taken effect yet —
    // only the synchronously-written ref can stop the second one.
    const gate = deferred<{ data: { id: string; code: string } }>();
    createMock.mockReturnValue(gate.promise);

    await openCreateDialog();
    const submit = submitButton()!;

    await act(async () => {
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(createMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve({ data: { id: "new-loan", code: "LN-20099" } });
    });
  });

  it("2. three clicks in one act still issue exactly ONE POST", async () => {
    const gate = deferred<{ data: { id: string; code: string } }>();
    createMock.mockReturnValue(gate.promise);

    await openCreateDialog();
    const submit = submitButton()!;

    await act(async () => {
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(createMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve({ data: { id: "new-loan", code: "LN-20099" } });
    });
  });

  it("3. a click while a request is still open is dropped", async () => {
    const gate = deferred<{ data: { id: string; code: string } }>();
    createMock.mockReturnValue(gate.promise);

    await openCreateDialog();

    await click(submitButton()!);
    expect(createMock).toHaveBeenCalledTimes(1);

    // Separate turn, request still open.
    await click(submitButton()!);
    expect(createMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve({ data: { id: "new-loan", code: "LN-20099" } });
    });
  });

  it("4. the guard is released, so a deliberate second application still works", async () => {
    // Serialization, not duplicate suppression: an identical second file is
    // the user's call to make, and nothing here refuses it.
    await openCreateDialog();

    await click(submitButton()!);
    expect(createMock).toHaveBeenCalledTimes(1);

    await click(buttonByText("New application")!);
    await click(submitButton()!);

    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("5. the request carries the values the form was filled with", async () => {
    await openCreateDialog();
    await type("l-amount", "750000");
    await type("l-tenure", "48");
    await type("l-rate", "11.25");

    await click(submitButton()!);

    expect(createMock).toHaveBeenCalledWith(
      "/loans",
      expect.objectContaining({
        customerId: CUSTOMER.id,
        amountRequested: 750000,
        tenureMonths: 48,
        interestRate: 11.25,
        status: "Submitted",
      }),
    );
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — a successful create closes the dialog and clears the form", () => {
  it("6. the dialog closes — BUG-015's headline defect", async () => {
    await openCreateDialog();
    expect(dialog()).toBeTruthy();

    await click(submitButton()!);

    expect(dialog()).toBeNull();
  });

  it("7. the toast carries the server-returned code, not a locally invented one", async () => {
    createMock.mockResolvedValue({ data: { id: "new-loan", code: "LN-30777" } });

    await openCreateDialog();
    await click(submitButton()!);

    expect(toastSuccess).toHaveBeenCalledWith(
      "Loan file created",
      expect.objectContaining({ description: "LN-30777" }),
    );
  });

  it("8. the list is refreshed so the new file appears", async () => {
    await openCreateDialog();
    await click(submitButton()!);

    expect(refreshMock).toHaveBeenCalled();
  });

  it("9. the form is reset — reopening shows the defaults, not the last submission", async () => {
    await openCreateDialog();
    await type("l-amount", "750000");
    await type("l-tenure", "48");
    await type("l-rate", "11.25");

    await click(submitButton()!);
    await click(buttonByText("New application")!);

    expect(valueOf("l-amount")).toBe("500000");
    expect(valueOf("l-tenure")).toBe("36");
    expect(valueOf("l-rate")).toBe("13.5");
  });

  it("10. a second submission after a reset sends the defaults, not stale values", async () => {
    // Proves the reset reached the state the request reads, not just the DOM.
    await openCreateDialog();
    await type("l-amount", "750000");
    await click(submitButton()!);

    await click(buttonByText("New application")!);
    await click(submitButton()!);

    expect(createMock).toHaveBeenLastCalledWith(
      "/loans",
      expect.objectContaining({ amountRequested: 500000 }),
    );
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — the in-flight state, and what a failure leaves behind", () => {
  it("11. submit is disabled while the request is open", async () => {
    const gate = deferred<{ data: { id: string; code: string } }>();
    createMock.mockReturnValue(gate.promise);

    await openCreateDialog();
    await click(submitButton()!);

    expect(submitButton()!.disabled).toBe(true);

    await act(async () => {
      gate.resolve({ data: { id: "new-loan", code: "LN-20099" } });
    });
  });

  it("12. it says so while it is working", async () => {
    const gate = deferred<{ data: { id: string; code: string } }>();
    createMock.mockReturnValue(gate.promise);

    await openCreateDialog();
    await click(submitButton()!);

    expect(bodyText()).toContain("Submitting...");

    await act(async () => {
      gate.resolve({ data: { id: "new-loan", code: "LN-20099" } });
    });
  });

  it("13. Cancel is disabled too — the dialog cannot be closed out from under the POST", async () => {
    const gate = deferred<{ data: { id: string; code: string } }>();
    createMock.mockReturnValue(gate.promise);

    await openCreateDialog();
    await click(submitButton()!);

    expect(dialogButton("Cancel")!.disabled).toBe(true);

    await act(async () => {
      gate.resolve({ data: { id: "new-loan", code: "LN-20099" } });
    });
  });

  it("14. a failure keeps the dialog open and usable", async () => {
    createMock.mockRejectedValue(new ApiError(422, "validation_failed", "Tenure must be at least 6 months"));

    await openCreateDialog();
    await click(submitButton()!);

    expect(dialog()).toBeTruthy();
    expect(submitButton()!.disabled).toBe(false);
    expect(dialogButton("Cancel")!.disabled).toBe(false);
  });

  it("15. the server's own message is surfaced, not a generic one", async () => {
    createMock.mockRejectedValue(new ApiError(422, "validation_failed", "Tenure must be at least 6 months"));

    await openCreateDialog();
    await click(submitButton()!);

    expect(toastError).toHaveBeenCalledWith(
      "Could not create loan",
      expect.objectContaining({ description: "Tenure must be at least 6 months" }),
    );
  });

  it("16. no success is claimed for a request that failed (D-004)", async () => {
    createMock.mockRejectedValue(new ApiError(403, "forbidden", "You do not have access to this bank"));

    await openCreateDialog();
    await click(submitButton()!);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("17. the form is NOT cleared by a failure — the submission can be corrected", async () => {
    createMock.mockRejectedValue(new ApiError(422, "validation_failed", "Tenure must be at least 6 months"));

    await openCreateDialog();
    await type("l-amount", "750000");
    await click(submitButton()!);

    expect(valueOf("l-amount")).toBe("750000");
  });

  it("18. a failed attempt is retryable — the guard is released either way", async () => {
    createMock.mockRejectedValueOnce(new ApiError(500, "internal", "Something went wrong"));

    await openCreateDialog();
    await click(submitButton()!);
    expect(createMock).toHaveBeenCalledTimes(1);

    await click(submitButton()!);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("19. no request is issued, and nothing is claimed, when there is no customer", async () => {
    h.state.customers = [];

    await openCreateDialog();
    await click(submitButton()!);

    expect(createMock).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Select a customer first");
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — 5.10 / D-058: the EMI claim is gone, and nothing computes an EMI", () => {
  it("20. the sentence is absent", async () => {
    await openCreateDialog();

    expect(bodyText()).not.toContain(
      "EMI is calculated on submit using the rate and tenure you enter.",
    );
  });

  it("21. no weakened variant of the claim survives", async () => {
    await openCreateDialog();

    expect(bodyText()).not.toContain("EMI is calculated");
    expect(bodyText()).not.toContain("calculated on submit");
  });

  it("22. the create dialog does not mention EMI at all", async () => {
    await openCreateDialog();

    expect(dialog()?.textContent ?? "").not.toContain("EMI");
  });

  it("23. and no `emi` is sent — the claim was removed rather than made true", async () => {
    // D-058 explicitly refuses to build the calculator. If a later change adds
    // one it must come with its own decision, and this test is where it lands.
    await openCreateDialog();
    await click(submitButton()!);

    const [, payload] = createMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty("emi");
  });

  it("24. the dialog still describes itself truthfully", async () => {
    await openCreateDialog();

    expect(bodyText()).toContain("Creates a loan file for the selected customer with status Submitted.");
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — 5.11 / D-059: the no-op Bank selector is gone, the real bank is shown", () => {
  it("25. there is no user-selectable Bank control in the create dialog", async () => {
    await openCreateDialog();

    expect(fieldGroup("Bank")?.querySelector("select")).toBeFalsy();
  });

  it("26. no control anywhere in the dialog offers a bank to choose", async () => {
    await openCreateDialog();

    const options = Array.from(dialog()?.querySelectorAll("option") ?? []);
    const bankIds = BANKS.map((bank) => bank.id);
    expect(options.some((o) => bankIds.includes(o.getAttribute("value") ?? ""))).toBe(false);
    expect(options.some((o) => o.textContent?.trim() === "HDFC Bank")).toBe(false);
    expect(options.some((o) => o.textContent?.trim() === "ICICI Bank")).toBe(false);
  });

  it("27. exactly two selects remain: Customer and Product", async () => {
    await openCreateDialog();

    expect(dialog()?.querySelectorAll("select").length).toBe(2);
    expect(fieldGroup("Customer")?.querySelector("select")).toBeTruthy();
    expect(fieldGroup("Product")?.querySelector("select")).toBeTruthy();
  });

  it("28. the customer's bank is shown read-only for context", async () => {
    await openCreateDialog();

    const readonly = document.querySelector('[data-testid="loan-bank-readonly"]');
    expect(readonly).toBeTruthy();
    expect(readonly?.textContent?.trim()).toBe("ICICI Bank");
  });

  it("29. it shows the customer's bank, NOT banks[0] — the exact defect D-059 records", async () => {
    // The customer is on BANKS[1]. The removed control defaulted to
    // `banks[0]?.id`, so it would have displayed "HDFC Bank" here while the
    // POST carried ICICI's id.
    await openCreateDialog();

    const readonly = document.querySelector('[data-testid="loan-bank-readonly"]');
    expect(readonly?.textContent).not.toContain("HDFC");
    expect(readonly?.textContent).toContain("ICICI");
  });

  it("30. the bank displayed is the bank submitted — they cannot drift apart", async () => {
    await openCreateDialog();
    const shown = document.querySelector('[data-testid="loan-bank-readonly"]')?.textContent?.trim();

    await click(submitButton()!);

    const [, payload] = createMock.mock.calls[0] as [string, { bankId: string }];
    expect(payload.bankId).toBe(CUSTOMER.bankId);
    expect(BANKS.find((b) => b.id === payload.bankId)?.name).toBe(shown);
  });

  it("31. what createLoan submits is unchanged — still the customer's bank", async () => {
    await openCreateDialog();
    await click(submitButton()!);

    expect(createMock).toHaveBeenCalledWith(
      "/loans",
      expect.objectContaining({ customerId: CUSTOMER.id, bankId: CUSTOMER.bankId }),
    );
  });

  it("32. with no customer loaded, the line says so rather than naming a bank", async () => {
    h.state.customers = [];

    await openCreateDialog();

    const readonly = document.querySelector('[data-testid="loan-bank-readonly"]');
    expect(readonly?.textContent?.trim()).toBe("Select a customer first");
    expect(readonly?.textContent).not.toContain("Bank");
  });
});
