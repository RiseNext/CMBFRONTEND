/**
 * TASK 5.9 — honest load states on both loan-primary screens.
 *
 * Both screens read the same `/loans` collection through `useResource`, and
 * **both answered a failed request with an affirmative statement about the
 * business.**
 *
 *   - `/loans` destructured `{ data, loading, error, refresh }` and then
 *     referenced neither `loading` nor `error` anywhere in its render. Because
 *     `useResource` blanks `data` when the request rejects
 *     (`use-api.ts:62-67`), a 403 or a 500 fell through to DataTable's ordinary
 *     empty state — *"No records match these filters. Clear them to see
 *     everything again."* — which reports an empty loan book for a request that
 *     never completed **and blames the reader's filters for it**. The four stat
 *     cards, all derived from the same blanked `rows`, printed "0 Applications"
 *     beside it.
 *
 *   - `/my-work` did not destructure `error` at all (`my-work/page.tsx:56`), so
 *     the priority queue rendered *"Nothing waiting on you — Every file in your
 *     book has reached a decision."* That sentence is a claim about the user's
 *     entire book, produced by a request that failed.
 *
 * Both are D-004 with the failure pointed at the user rather than at the
 * system, and both are the defect Task 2.10 fixed on employees and Task 4.8 on
 * customers (D-031). The fix is the same three mutually exclusive states those
 * tasks established: loading, failed, genuinely empty.
 *
 * Follows D-012 and the Task 2.4-4.8 files: `react-dom/client` + React 19's
 * `act`, no component-testing library, `vi.hoisted` for anything the mock
 * factories close over.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const BANK = { id: "b1000000-0000-4000-8000-000000000001", name: "HDFC Bank", shortName: "HDFC", code: "HDFC" };

  const CUSTOMER = {
    id: "3f8b21c4-9d0e-4a77-b512-6ce4a8f01d93",
    code: "CUS-10001",
    bankId: BANK.id,
    name: "Priya Raman",
    bankReferenceId: "REF001",
    mobile: "9848011111",
    kyc: "Verified" as const,
    status: "Active" as const,
    city: "Hyderabad",
    createdAt: "2026-08-01T09:00:00.000Z",
  };

  const LOAN = {
    id: "9a1f77d2-0c33-4b8e-9f21-7e5c2a0b6d14",
    code: "LN-20001",
    applicationNo: "APP-77120",
    customerId: CUSTOMER.id,
    bankId: BANK.id,
    loanType: "Personal Loan",
    amountRequested: "500000",
    amountApproved: "450000",
    interestRate: "13.5",
    tenureMonths: 36,
    emi: "0",
    processingFee: "0",
    commission: "0",
    status: "Under Review" as const,
    priority: "High" as const,
    dueDate: null,
    assignedUserId: null,
    appliedOn: "2026-08-10T09:00:00.000Z",
    updatedAt: "2026-08-12T09:00:00.000Z",
  };

  return {
    BANK,
    CUSTOMER,
    LOAN,
    refreshMock: vi.fn(),
    createMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    state: {
      loans: [] as (typeof LOAN)[],
      loansLoading: false,
      loansError: null as string | null,
      customers: [] as (typeof CUSTOMER)[],
    },
  };
});

const { BANK, CUSTOMER, LOAN, refreshMock } = h;

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
 * Mirrors `useResource`, **including that it blanks `data` when a load fails**
 * — the behaviour that made a failure indistinguishable from an empty list.
 * Serving rows alongside an error would test a hook this repository does not
 * have.
 */
vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string) => {
    if (path === "/loans") {
      return {
        data: h.state.loansError ? [] : h.state.loans,
        total: h.state.loansError ? 0 : h.state.loans.length,
        loading: h.state.loansLoading,
        error: h.state.loansError,
        refresh: h.refreshMock,
        setData: vi.fn(),
      };
    }
    const data = path === "/customers" ? h.state.customers : [];
    return {
      data,
      total: data.length,
      loading: false,
      error: null,
      refresh: vi.fn(),
      setData: vi.fn(),
    };
  },
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [BANK],
    employees: [],
    teams: [],
    loading: false,
    refresh: vi.fn(),
    bankName: (id: string) => (id === BANK.id ? BANK.name : "Unassigned"),
    bankById: (id: string) => (id === BANK.id ? BANK : undefined),
    bankShortName: () => BANK.shortName,
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

import LoansPage from "@/app/(app)/loans/page";
import MyWorkPage from "@/app/(app)/my-work/page";

beforeEach(() => {
  refreshMock.mockClear();
  h.state.loans = [{ ...LOAN }];
  h.state.loansLoading = false;
  h.state.loansError = null;
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
});

afterEach(() => vi.unstubAllGlobals());

async function mount(Page: () => React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(<Page />);
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

const TABLE_EMPTY = "No records match these filters";
const MY_WORK_FALSE_CLAIM = "Every file in your book has reached a decision";

/* ------------------------------------------------------------------ group A */

describe("A — /loans: loading is visible, and is not mistaken for an answer", () => {
  it("1. shows a skeleton during the initial fetch", async () => {
    h.state.loansLoading = true;
    h.state.loans = [];

    const page = await mount(LoansPage);

    expect(document.querySelector('[data-testid="loans-loading"]')).toBeTruthy();
    await page.unmount();
  });

  it("2. does not claim the book is empty while the first load is in flight", async () => {
    h.state.loansLoading = true;
    h.state.loans = [];

    const page = await mount(LoansPage);

    expect(hasRow(LOAN.code)).toBe(false);
    expect(bodyText()).not.toContain(TABLE_EMPTY);
    await page.unmount();
  });

  it("3. shows the table once loading finishes", async () => {
    const page = await mount(LoansPage);

    expect(document.querySelector('[data-testid="loans-loading"]')).toBeNull();
    expect(hasRow(LOAN.code)).toBe(true);
    await page.unmount();
  });

  it("4. keeps showing rows during a background refresh", async () => {
    // `loading` goes true again on every `refresh()`. Blanking the table then
    // would be a regression, not a fix.
    h.state.loansLoading = true;

    const page = await mount(LoansPage);

    expect(hasRow(LOAN.code)).toBe(true);
    expect(document.querySelector('[data-testid="loans-loading"]')).toBeNull();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — /loans: a failed load looks like a failure, not an empty book", () => {
  it("5. surfaces the server's own message", async () => {
    h.state.loansError = "You do not have access to this bank";

    const page = await mount(LoansPage);

    expect(bodyText()).toContain("You do not have access to this bank");
    await page.unmount();
  });

  it("6. does NOT render the table's empty state — the defect this task fixes", async () => {
    h.state.loansError = "Could not load this list";

    const page = await mount(LoansPage);
    const text = bodyText();

    expect(text).not.toContain(TABLE_EMPTY);
    expect(text).toContain("not because there are");
    await page.unmount();
  });

  it("7. suppresses the table entirely on failure", async () => {
    h.state.loansError = "Could not load this list";
    h.state.loans = [{ ...LOAN }];

    const page = await mount(LoansPage);

    expect(hasRow(LOAN.code)).toBe(false);
    await page.unmount();
  });

  it("8. suppresses the stat cards — a failed load must not print '0 Applications'", async () => {
    h.state.loansError = "Could not load this list";

    const page = await mount(LoansPage);
    const text = bodyText();

    expect(text).not.toContain("Applications");
    expect(text).not.toContain("Approved value");
    expect(text).not.toContain("Commission booked");
    expect(text).not.toContain("Rejected files");
    await page.unmount();
  });

  it("9. offers a retry that calls refresh", async () => {
    h.state.loansError = "Could not load this list";

    const page = await mount(LoansPage);
    const retry = buttonByText("Try again");
    expect(retry).toBeTruthy();

    await click(retry!);

    expect(refreshMock).toHaveBeenCalled();
    await page.unmount();
  });

  it("10. renders the normal empty state when the book is genuinely empty", async () => {
    // The three states stay distinct: this must not be swallowed by the error
    // branch, or the fix would have replaced one wrong answer with another.
    h.state.loans = [];

    const page = await mount(LoansPage);

    expect(bodyText()).toContain(TABLE_EMPTY);
    expect(buttonByText("Try again")).toBeUndefined();
    await page.unmount();
  });

  it("11. shows the stat cards again when the load succeeds", async () => {
    const page = await mount(LoansPage);

    expect(bodyText()).toContain("Applications");
    expect(document.querySelector('[data-testid="loans-load-error"]')).toBeNull();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — /my-work: a failed load never becomes 'you are all caught up'", () => {
  it("12. does NOT claim every file has reached a decision after a failure", async () => {
    // The single assertion this half of the task exists for.
    h.state.loansError = "Could not load this list";

    const page = await mount(MyWorkPage);

    expect(bodyText()).not.toContain(MY_WORK_FALSE_CLAIM);
    await page.unmount();
  });

  it("13. does not show the 'Nothing waiting on you' heading either", async () => {
    h.state.loansError = "Could not load this list";

    const page = await mount(MyWorkPage);

    expect(bodyText()).not.toContain("Nothing waiting on you");
    await page.unmount();
  });

  it("14. surfaces the server's message instead", async () => {
    h.state.loansError = "You do not have access to this bank";

    const page = await mount(MyWorkPage);

    expect(document.querySelector('[data-testid="my-work-loans-error"]')).toBeTruthy();
    expect(bodyText()).toContain("You do not have access to this bank");
    await page.unmount();
  });

  it("15. says plainly that the files could not be loaded", async () => {
    h.state.loansError = "Could not load this list";

    const page = await mount(MyWorkPage);

    expect(bodyText()).toContain("could not be loaded");
    await page.unmount();
  });

  it("16. suppresses the queue table on failure", async () => {
    h.state.loansError = "Could not load this list";
    h.state.loans = [{ ...LOAN }];

    const page = await mount(MyWorkPage);

    expect(hasRow(LOAN.code)).toBe(false);
    await page.unmount();
  });

  it("17. does not render a green '0 open' badge for a request that failed", async () => {
    h.state.loansError = "Could not load this list";

    const page = await mount(MyWorkPage);

    expect(bodyText()).not.toContain("0 open");
    await page.unmount();
  });

  it("18. offers a retry that calls refresh", async () => {
    h.state.loansError = "Could not load this list";

    const page = await mount(MyWorkPage);
    const retry = buttonByText("Try again");
    expect(retry).toBeTruthy();

    await click(retry!);

    expect(refreshMock).toHaveBeenCalled();
    await page.unmount();
  });

  it("19. STILL shows the empty state when the book is genuinely empty", async () => {
    // The affirmative message is correct in exactly one case, and the fix must
    // not have deleted it. This is what separates 5.9 from removing a control.
    h.state.loans = [];

    const page = await mount(MyWorkPage);

    expect(bodyText()).toContain(MY_WORK_FALSE_CLAIM);
    expect(document.querySelector('[data-testid="my-work-loans-error"]')).toBeNull();
    await page.unmount();
  });

  it("20. shows the queue normally when the load succeeds", async () => {
    const page = await mount(MyWorkPage);

    expect(hasRow(LOAN.code)).toBe(true);
    expect(bodyText()).not.toContain(MY_WORK_FALSE_CLAIM);
    await page.unmount();
  });
});
