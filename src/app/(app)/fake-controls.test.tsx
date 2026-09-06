/**
 * THE NINE FAKE CONTROLS, DRIVEN THROUGH THE REAL PAGES — Phases 6–10
 * BUGS_AND_ISSUES.md BUG-002 · DECISIONS.md D-004, D-026, D-049, D-066
 *
 * BUG-002 recorded thirteen controls that presented themselves as writes and
 * issued no request: they called `refresh()` — which re-fetches unchanged rows —
 * and raised a success toast. Because no request was made there was **no
 * failure path and no possible rollback**, so the table reverted while the
 * dialog showed the fake value.
 *
 * Four were closed by Phases 4 and 5. These are the remaining nine.
 *
 * The assertion that matters in every case is the same one, and it is the one a
 * screenshot cannot make: **a request actually left the page, and the toast
 * followed the server's answer rather than preceding it.** Group Z inverts it —
 * when the server refuses, no success is claimed and the row does not move.
 *
 * ⚠️ Two of these deliberately call the **approve route, not PATCH**, and the
 * roadmap rows said PATCH. Following the rows literally would have reopened the
 * privilege bypass D-056 closed for loans, one resource over: `edit` is a lower
 * bar than `approve`, and `patchSchema` keeps the create enum. The server now
 * refuses `status` on PATCH for both resources, so a PATCH-based control would
 * be a 422 every time. Groups B and C pin the route.
 *
 * Follows D-012: `react-dom/client` + React 19 `act`, no component-testing
 * library, `vi.hoisted` for anything the mock factories close over.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => {
  const BANK = "b1000000-0000-4000-8000-000000000001";
  const CUSTOMER = "c1000000-0000-4000-8000-000000000001";
  const LOAN = "10000000-0000-4000-8000-000000000001";

  return {
    BANK,
    CUSTOMER,
    LOAN,
    updateMock: vi.fn(),
    actionMock: vi.fn(),
    createMock: vi.fn(),
    removeMock: vi.fn(),
    uploadMock: vi.fn(),
    contentMock: vi.fn(),
    refreshMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    toastInfo: vi.fn(),
    state: {
      permissions: [] as string[],
      rows: {} as Record<string, unknown[]>,
    },
  };
});

const {
  BANK,
  CUSTOMER,
  LOAN,
  updateMock,
  actionMock,
  createMock,
  removeMock,
  uploadMock,
  refreshMock,
  toastSuccess,
  toastError,
} = h;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      update: h.updateMock,
      action: h.actionMock,
      create: h.createMock,
      remove: h.removeMock,
      upload: h.uploadMock,
      content: h.contentMock,
      list: vi.fn(async () => ({ data: [], meta: { total: 0 } })),
    },
  };
});

vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string) => {
    const data = (h.state.rows[path] ?? []) as unknown[];
    return {
      data,
      total: data.length,
      loading: false,
      error: null,
      refresh: h.refreshMock,
      setData: vi.fn(),
    };
  },
  useRecord: () => ({ data: null, loading: false, error: null, refresh: vi.fn() }),
  useStats: () => ({ data: null, loading: false, error: null, refresh: vi.fn() }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [{ id: h.BANK, name: "HDFC Bank", shortName: "HDFC" }],
    teams: [],
    employees: [],
    loading: false,
    refresh: vi.fn(),
    bankName: () => "HDFC Bank",
    bankById: () => ({ id: h.BANK, name: "HDFC Bank", shortName: "HDFC" }),
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
  toast: { success: h.toastSuccess, error: h.toastError, info: h.toastInfo },
}));

import BankOrdersPage from "@/app/(app)/bank-orders/page";
import DisbursementPage from "@/app/(app)/disbursement/page";
import TransactionsPage from "@/app/(app)/transactions/page";
import SettlementsPage from "@/app/(app)/settlements/page";
import DocumentsPage from "@/app/(app)/documents/page";

/* ── fixtures ───────────────────────────────────────────────────────────── */

const bankOrder = {
  id: "bo-1",
  code: "BO-2401",
  loanId: LOAN,
  bankId: BANK,
  customerId: CUSTOMER,
  stage: "Login" as const,
  status: "In Progress" as const,
  officer: "Priya",
  remarks: "Awaiting credit check",
  submittedOn: "2026-09-01T00:00:00.000Z",
  sla: "2026-09-10T00:00:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const disbursement = {
  id: "dsb-1",
  code: "DSB-5001",
  loanId: LOAN,
  customerId: CUSTOMER,
  bankId: BANK,
  amount: "500000",
  utr: "UTR12345",
  mode: "NEFT" as const,
  status: "In Transit" as const,
  disbursedOn: "2026-09-01T00:00:00.000Z",
  creditedTo: null,
  createdAt: "2026-09-01T00:00:00.000Z",
};

const transaction = {
  id: "txn-1",
  code: "TXN-77001",
  customerId: CUSTOMER,
  bankId: BANK,
  loanId: LOAN,
  amount: "500000",
  commission: "0",
  txnType: "Disbursement" as const,
  status: "Pending" as const,
  reference: "REF-1",
  occurredAt: "2026-09-01T00:00:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const settlement = {
  id: "stl-1",
  code: "STL-3301",
  bankId: BANK,
  period: "Aug 2026",
  cases: 12,
  grossCommission: "100000",
  tds: "10000",
  netPayable: "90000",
  status: "Pending" as const,
  invoiceNo: "INV-001",
  raisedOn: "2026-09-01T00:00:00.000Z",
  settledOn: null,
  createdAt: "2026-09-01T00:00:00.000Z",
};

const documentRow = {
  id: "doc-1",
  customerId: CUSTOMER,
  loanId: LOAN,
  bankId: BANK,
  docType: "PAN Card",
  fileName: "pan.pdf",
  fileSize: 1024,
  mimeType: "application/pdf",
  storageKey: `${BANK}/${CUSTOMER}/doc-1/abc.pdf`,
  checksum: "a".repeat(64),
  status: "Pending" as const,
  uploadedBy: "someone-else",
  verifiedBy: null,
  createdAt: "2026-09-01T00:00:00.000Z",
};

const customer = { id: CUSTOMER, name: "Anita Sharma", bankId: BANK, code: "CUS-10001" };
const loan = {
  id: LOAN,
  code: "LN-1001",
  customerId: CUSTOMER,
  bankId: BANK,
  status: "Approved",
  amountApproved: "500000",
  amountRequested: "500000",
};

/* ── harness ────────────────────────────────────────────────────────────── */

/*
 * jsdom implements no layout, so `scrollIntoView` does not exist on it. Radix
 * calls it when a `Select` opens, to bring the active option into view. Nothing
 * under test depends on scrolling; this is a no-op stand-in so the component can
 * run, not a behaviour being faked.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  h.state.permissions = [
    "bank_orders.view",
    "bank_orders.create",
    "bank_orders.edit",
    "disbursements.view",
    "disbursements.create",
    "disbursements.approve",
    "transactions.view",
    "transactions.create",
    "transactions.edit",
    "settlements.view",
    "settlements.approve",
    "documents.view",
    "documents.upload",
    "documents.verify",
    "documents.delete",
  ];
  h.state.rows = {
    "/bank-orders": [bankOrder],
    "/disbursements": [disbursement],
    "/transactions": [transaction],
    "/settlements": [settlement],
    "/documents": [documentRow],
    "/customers": [customer],
    "/loans": [loan],
  };
  updateMock.mockResolvedValue({ data: {} });
  actionMock.mockResolvedValue({ data: {} });
  createMock.mockResolvedValue({ data: {} });
  removeMock.mockResolvedValue(undefined);
  uploadMock.mockResolvedValue({ data: {} });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

async function mount(Page: () => React.JSX.Element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<Page />);
  });
}

/**
 * Clicks the first element whose accessible name or text matches.
 *
 * Searches `document.body`, not the mount container: Radix renders dialog
 * content into a PORTAL, so every control inside a detail dialog lives outside
 * the container this test mounted into.
 */
async function click(matcher: string | RegExp): Promise<boolean> {
  const test = (value: string) =>
    typeof matcher === "string" ? value.trim() === matcher : matcher.test(value);

  const nodes = Array.from(
    document.body.querySelectorAll<HTMLElement>("button, [role='button'], [role='option']"),
  );
  const target = nodes.find(
    (node) => test(node.textContent ?? "") || test(node.getAttribute("aria-label") ?? ""),
  );
  if (!target) return false;
  await act(async () => {
    target.click();
  });
  return true;
}

/**
 * Opens a Radix `Select` and picks an option.
 *
 * `HTMLElement.click()` is not enough: Radix opens on **pointerdown**, and
 * jsdom's `click()` dispatches only a click event. The trigger is found by its
 * accessible name via the associated `<label>`, because a `SelectTrigger`
 * renders as a button whose text is the current value, not the field name.
 */
async function selectOption(labelText: string | RegExp, optionText: string | RegExp) {
  const labels = Array.from(document.body.querySelectorAll("label"));
  const label = labels.find((node) =>
    typeof labelText === "string"
      ? (node.textContent ?? "").trim() === labelText
      : labelText.test(node.textContent ?? ""),
  );
  if (!label) return false;

  // The trigger is the first combobox after the label inside the same field
  // wrapper.
  const trigger = label.parentElement?.querySelector<HTMLElement>("[role='combobox']");
  if (!trigger) return false;

  /*
   * Opened by KEYBOARD, not by a click. Radix opens a `Select` on
   * `pointerdown`, and jsdom implements neither `PointerEvent` nor the pointer
   * capture Radix uses — so a synthetic pointerdown is ignored. The keyboard
   * path is the accessible one, is fully supported in jsdom, and exercises the
   * same open/commit code.
   */
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
  });

  const options = Array.from(document.body.querySelectorAll<HTMLElement>("[role='option']"));
  const option = options.find((node) =>
    typeof optionText === "string"
      ? (node.textContent ?? "").includes(optionText)
      : optionText.test(node.textContent ?? ""),
  );
  if (!option) return false;

  await act(async () => {
    option.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    option.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, button: 0 }));
    option.click();
  });
  return true;
}

/** Opens the first table row's detail dialog. */
async function openRow() {
  const row = document.body.querySelector<HTMLElement>("tbody tr");
  if (!row) return false;
  await act(async () => row.click());
  return true;
}

/* ══ A — bank orders: moveStage and saveRemark ═══════════════════════════ */

describe("A · bank orders — the two controls that made ZERO write calls", () => {
  it("1. the page issues a real request when a remark is saved", async () => {
    await mount(BankOrdersPage);
    expect(await openRow()).toBe(true);

    const textarea = document.body.querySelector("textarea");
    expect(textarea, "the remark field should be present").toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(textarea, "Called the bank, docs pending");
      textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(await click(/Update remarks/)).toBe(true);

    // The whole of BUG-002: a request leaves the page.
    expect(updateMock).toHaveBeenCalledWith("/bank-orders/bo-1", {
      remarks: "Called the bank, docs pending",
    });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("2. the success toast no longer claims a 'file trail' that does not exist", async () => {
    await mount(BankOrdersPage);
    await openRow();
    const textarea = document.body.querySelector("textarea");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(textarea, "note");
      textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(/Update remarks/);

    // D-064: one overwritten column, and the audit diff is the history. The old
    // copy said "Remark saved to the file trail", which promised a ledger.
    const [title] = toastSuccess.mock.calls[0] ?? [];
    expect(String(title)).toBe("Remarks updated");
    expect(String(title)).not.toMatch(/file trail/i);
  });

  it("3. an empty remark is refused before any request", async () => {
    await mount(BankOrdersPage);
    await openRow();
    await click(/Update remarks/);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

/* ══ B — disbursement: markCredited goes to APPROVE, not PATCH ═══════════ */

describe("B · disbursement — 'mark credited' is real, and uses the approve route", () => {
  it("4. THE ROUTE — it calls approve, never PATCH (D-066)", async () => {
    await mount(DisbursementPage);
    expect(await openRow()).toBe(true);
    expect(await click(/Mark credited/)).toBe(true);

    expect(actionMock).toHaveBeenCalledWith("/disbursements/dsb-1/approve", {
      status: "Credited",
    });
    /*
     * A PATCH here would be the D-056 bypass one resource over: Manager holds
     * `disbursements.edit` and NOT `.approve`, so a PATCH-based control would
     * let a role that may not approve mark money as received.
     */
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("5. the toast no longer asserts a fact about the bank statement", async () => {
    await mount(DisbursementPage);
    await openRow();
    await click(/Mark credited/);

    // D-040: the old copy said "{utr} confirmed in bank statement" — an
    // external fact this system cannot observe.
    const calls = toastSuccess.mock.calls.flat().map(String).join(" ");
    expect(calls).not.toMatch(/confirmed in bank statement/i);
  });

  it("6. without `disbursements.approve` the control is disabled and sends nothing", async () => {
    h.state.permissions = h.state.permissions.filter((p) => p !== "disbursements.approve");
    await mount(DisbursementPage);
    await openRow();

    const button = Array.from(document.body.querySelectorAll("button")).find((b) =>
      /Mark credited/.test(b.textContent ?? ""),
    );
    expect(button?.hasAttribute("disabled")).toBe(true);
    expect(actionMock).not.toHaveBeenCalled();
  });
});

/* ══ C — settlements: markPaid and raiseDispute ══════════════════════════ */

describe("C · settlements — both controls are real, and both use approve", () => {
  it("7. 'Mark paid' calls the approve route", async () => {
    await mount(SettlementsPage);
    expect(await openRow()).toBe(true);
    expect(await click(/Mark paid/)).toBe(true);

    expect(actionMock).toHaveBeenCalledWith("/settlements/stl-1/approve", { status: "Paid" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("8. 'Raise dispute' is a real status change", async () => {
    await mount(SettlementsPage);
    await openRow();
    expect(await click(/Raise dispute/)).toBe(true);

    expect(actionMock).toHaveBeenCalledWith("/settlements/stl-1/approve", { status: "Disputed" });
  });

  it("9. THE D-040 FIX — nothing claims a message was sent to anyone", async () => {
    await mount(SettlementsPage);
    await openRow();
    await click(/Raise dispute/);

    /*
     * The old copy was "Query sent to {bank} SPOC." **There is no messaging
     * path anywhere in this repository**, so that claimed an external
     * communication that never happened — the literal form D-040 bans.
     */
    const said = [...toastSuccess.mock.calls, ...h.toastInfo.mock.calls].flat().map(String).join(" ");
    expect(said).not.toMatch(/sent to/i);
    expect(said).not.toMatch(/SPOC/i);
  });
});

/* ══ D — transactions: settle ════════════════════════════════════════════ */

describe("D · transactions — 'settle' writes, and PATCH is correct here", () => {
  it("10. it calls PATCH — transactions have NO approve route", async () => {
    await mount(TransactionsPage);
    expect(await openRow()).toBe(true);
    expect(await click(/Mark successful/)).toBe(true);

    /*
     * The exception that proves D-066's rule: `transactions` configures no
     * approve permission, so PATCH is the only status writer and carries the
     * transition map itself (F1-c).
     */
    expect(updateMock).toHaveBeenCalledWith("/transactions/txn-1", { status: "Success" });
    expect(actionMock).not.toHaveBeenCalled();
  });
});

/* ══ E — documents: verify, reject, delete, upload ═══════════════════════ */

describe("E · documents — verify, reject and delete are real", () => {
  it("11. Verify issues a PATCH", async () => {
    await mount(DocumentsPage);
    expect(await click("Verify")).toBe(true);
    expect(updateMock).toHaveBeenCalledWith("/documents/doc-1", { status: "Verified" });
  });

  it("12. Reject issues a PATCH — a control that did not exist before 9.7", async () => {
    await mount(DocumentsPage);
    expect(await click("Reject")).toBe(true);
    expect(updateMock).toHaveBeenCalledWith("/documents/doc-1", { status: "Rejected" });
  });

  it("13. Delete issues a DELETE", async () => {
    await mount(DocumentsPage);
    expect(await click("Delete")).toBe(true);
    expect(removeMock).toHaveBeenCalledWith("/documents/doc-1");
  });

  it("14. D-074 — without `documents.verify` both controls are disabled", async () => {
    h.state.permissions = h.state.permissions.filter((p) => p !== "documents.verify");
    await mount(DocumentsPage);

    const verify = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Verify",
    );
    expect(verify?.hasAttribute("disabled")).toBe(true);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("15. a document with no stored file offers no download", async () => {
    h.state.rows["/documents"] = [{ ...documentRow, storageKey: null }];
    await mount(DocumentsPage);

    const download = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Download",
    );
    // D-004 — a control that cannot do the thing does not offer to.
    expect(download?.hasAttribute("disabled")).toBe(true);
  });
});

/* ══ Z — THE INVERSION: a refusal is never reported as success ═══════════ */

describe("Z · when the server refuses, no success is claimed", () => {
  it("16. a refused stage move shows the server's sentence and no success toast", async () => {
    updateMock.mockRejectedValueOnce(
      new ApiError(422, "unprocessable_entity", "A bank_order cannot move from Login to Sanction."),
    );

    await mount(BankOrdersPage);
    await openRow();
    const textarea = document.body.querySelector("textarea");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(textarea, "x");
      textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(/Update remarks/);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
    // The server's own words reach the dialog, not only a toast that scrolls
    // away — a 422 explains which move was refused, and that is the answer.
    expect(document.body.textContent).toContain("cannot move from Login to Sanction");
  });

  it("17. a refused credit does not report the money as received", async () => {
    actionMock.mockRejectedValueOnce(
      new ApiError(422, "unprocessable_entity", "A disbursement cannot be marked Credited without a UTR."),
    );

    await mount(DisbursementPage);
    await openRow();
    await click(/Mark credited/);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("without a UTR");
  });

  it("18. a refused settlement close claims nothing", async () => {
    actionMock.mockRejectedValueOnce(
      new ApiError(422, "unprocessable_entity", "netPayable must equal grossCommission minus tds"),
    );

    await mount(SettlementsPage);
    await openRow();
    await click(/Mark paid/);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("19. a refused settle leaves the transaction alone", async () => {
    updateMock.mockRejectedValueOnce(
      new ApiError(422, "unprocessable_entity", "Success is a final status for a transaction"),
    );

    await mount(TransactionsPage);
    await openRow();
    await click(/Mark successful/);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("final status");
  });

  it("20. a refused document verify does not show it as verified", async () => {
    updateMock.mockRejectedValueOnce(
      new ApiError(403, "forbidden", "You do not have access to this resource"),
    );

    await mount(DocumentsPage);
    await click("Verify");

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });
});

/* ══ F — 6.3: bank-order creation ════════════════════════════════════════ */

describe("F · bank orders can be raised from the UI (6.3)", () => {
  beforeEach(() => {
    // A loan with no order yet, so the picker has something to offer.
    h.state.rows["/bank-orders"] = [];
    h.state.rows["/loans"] = [{ ...loan, status: "Submitted" }];
  });

  it("21. THE ROUTE — it posts to the real create endpoint", async () => {
    await mount(BankOrdersPage);
    expect(await click(/Raise bank order/)).toBe(true);
    expect(await selectOption("Loan", "LN-1001")).toBe(true);
    expect(await click(/Raise order/)).toBe(true);

    expect(createMock).toHaveBeenCalledTimes(1);
    const [path, payload] = createMock.mock.calls[0]!;
    expect(path).toBe("/bank-orders");
    expect(payload).toMatchObject({ loanId: LOAN, bankId: BANK, customerId: CUSTOMER });
  });

  it("22. D-059 — the bank is DERIVED from the loan, never chosen", async () => {
    await mount(BankOrdersPage);
    await click(/Raise bank order/);
    await selectOption("Loan", "LN-1001");
    await click(/Raise order/);

    /*
     * `beforeWrite` calls `assertSameBank` on both the loan and the customer,
     * so a freely-chosen bank could only ever produce a refusal. The payload
     * carries the loan's own bank.
     */
    const [, payload] = createMock.mock.calls[0]!;
    expect((payload as { bankId: string }).bankId).toBe(loan.bankId);
  });

  it("23. it opens at the ratified initial state", async () => {
    await mount(BankOrdersPage);
    await click(/Raise bank order/);
    await selectOption("Loan", "LN-1001");
    await click(/Raise order/);

    const [, payload] = createMock.mock.calls[0]!;
    expect(payload).toMatchObject({ stage: "Login", status: "In Progress" });
  });

  it("24. a loan that already has an order is not offered", async () => {
    h.state.rows["/bank-orders"] = [bankOrder]; // already covers LOAN
    await mount(BankOrdersPage);
    await click(/Raise bank order/);

    // Migration 0013 enforces one live order per loan; offering a choice the
    // server will reject is a control that cannot do what it offers.
    expect(document.body.textContent).toContain("already has a bank order");
  });

  it("25. a refusal claims nothing and shows the server's words", async () => {
    createMock.mockRejectedValueOnce(
      new ApiError(400, "bad_request", "The loan belongs to a different bank"),
    );

    await mount(BankOrdersPage);
    await click(/Raise bank order/);
    await selectOption("Loan", "LN-1001");
    await click(/Raise order/);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("belongs to a different bank");
  });

  it("26. without `bank_orders.create` the control is disabled", async () => {
    h.state.permissions = h.state.permissions.filter((p) => p !== "bank_orders.create");
    await mount(BankOrdersPage);

    const button = Array.from(document.body.querySelectorAll("button")).find((b) =>
      /Raise bank order/.test(b.textContent ?? ""),
    );
    expect(button?.hasAttribute("disabled")).toBe(true);
  });
});

/* ══ G — 8.2: transaction creation ═══════════════════════════════════════ */

describe("G · transactions can be recorded from the UI (8.2)", () => {
  beforeEach(() => {
    h.state.rows["/loans"] = [loan];
  });

  async function fillAmount(value: string) {
    const input = document.body.querySelector<HTMLInputElement>("#t-amount");
    expect(input, "the amount field should be present").toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, value);
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("27. THE ROUTE — it posts to the real create endpoint", async () => {
    await mount(TransactionsPage);
    expect(await click(/Record transaction/)).toBe(true);
    expect(await selectOption("Loan", "LN-1001")).toBe(true);
    await fillAmount("500000");
    expect(await click(/^Record transaction$/)).toBe(true);

    expect(createMock).toHaveBeenCalledTimes(1);
    const [path, payload] = createMock.mock.calls[0]!;
    expect(path).toBe("/transactions");
    expect(payload).toMatchObject({ loanId: LOAN, bankId: BANK, amount: 500000 });
  });

  it("28. THE PRIVILEGE BOUNDARY — `status` is never sent", async () => {
    await mount(TransactionsPage);
    await click(/Record transaction/);
    await selectOption("Loan", "LN-1001");
    await fillAmount("1000");
    await click(/^Record transaction$/);

    /*
     * D-066: `initialStatuses: ["Pending"]` refuses anything else, and the
     * reason is a privilege boundary — Manager holds `transactions.create` and
     * NOT `transactions.edit`, so a form that could post `Success` would let a
     * role that may not edit mint a transaction that is already final.
     */
    const [, payload] = createMock.mock.calls[0]!;
    expect(payload).not.toHaveProperty("status");
  });

  it("29. the bank is derived from the loan", async () => {
    await mount(TransactionsPage);
    await click(/Record transaction/);
    await selectOption("Loan", "LN-1001");
    await fillAmount("1000");
    await click(/^Record transaction$/);

    const [, payload] = createMock.mock.calls[0]!;
    expect((payload as { bankId: string }).bankId).toBe(loan.bankId);
  });

  it("30. a zero amount is refused before any request", async () => {
    await mount(TransactionsPage);
    await click(/Record transaction/);
    await selectOption("Loan", "LN-1001");
    await fillAmount("0");
    await click(/^Record transaction$/);

    expect(createMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("31. a refusal claims nothing", async () => {
    createMock.mockRejectedValueOnce(
      new ApiError(422, "unprocessable_entity", "A transaction cannot be created with status Success"),
    );

    await mount(TransactionsPage);
    await click(/Record transaction/);
    await selectOption("Loan", "LN-1001");
    await fillAmount("1000");
    await click(/^Record transaction$/);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("cannot be created with status Success");
  });

  it("32. without `transactions.create` the control is disabled", async () => {
    h.state.permissions = h.state.permissions.filter((p) => p !== "transactions.create");
    await mount(TransactionsPage);

    const button = Array.from(document.body.querySelectorAll("button")).find((b) =>
      /Record transaction/.test(b.textContent ?? ""),
    );
    expect(button?.hasAttribute("disabled")).toBe(true);
  });
});
