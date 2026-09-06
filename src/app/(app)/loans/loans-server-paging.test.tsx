/**
 * TASK 5.8 / D-061 — the loans list is paged, searched and filtered by the API.
 *
 * Before this task `useResource<Loan>("/loans")` was called with **no query
 * argument at all**, so not one parameter was ever sent. Two consequences, both
 * pinned below:
 *
 *   - **Double pagination.** The server applied its own default `pageSize` of 25
 *     and returned 25 rows; `DataTable` was passed no `pageSize`, defaulted to
 *     **8**, and paged those 25 rows again into four client-side pages. The
 *     twenty-sixth loan in the book was unreachable by any click.
 *   - **A search and three filters that only ever saw one page.** Typing in the
 *     box filtered 25 rows in memory and reported the result as though it
 *     described the loan book.
 *
 * D-061 settles the query contract: `page`, `pageSize`, `search`, `status`,
 * `loanType`, `bankId` — and **not** `priority`, `assignedUserId` or
 * `assignedTeamId`, for which no control exists. Group F asserts the absence,
 * because "we did not send it" is exactly the kind of claim that rots.
 *
 * D-061 also redefines the search promise. The server matches `code` and
 * `applicationNo`; `loans` carries only a `customerId` FK, so preserving the
 * old "or customer" promise would need a JOIN, which D-053 does not authorise.
 * Group D pins the reworded placeholder and that `searchText` matches the same
 * corpus.
 *
 * Follows D-012: `react-dom/client` + React 19's `act`, no component-testing
 * library, `vi.hoisted` for anything the mock factories close over.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Query = Record<string, unknown> | undefined;

const h = vi.hoisted(() => {
  const BANKS = [
    { id: "b1000000-0000-4000-8000-000000000001", name: "HDFC Bank", shortName: "HDFC", code: "HDFC" },
    { id: "b2000000-0000-4000-8000-000000000002", name: "ICICI Bank", shortName: "ICICI", code: "ICICI" },
  ];

  /** One page's worth of loans, codes numbered from `from`. */
  const loanPage = (from: number, count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `loan-${from + index}`,
      code: `LN-${1000 + from + index}`,
      applicationNo: `APP-${from + index}`,
      customerId: "3f8b21c4-9d0e-4a77-b512-6ce4a8f01d93",
      bankId: BANKS[0].id,
      loanType: "Personal Loan",
      amountRequested: "500000.00",
      amountApproved: "0.00",
      interestRate: "13.50",
      tenureMonths: 36,
      emi: "0.00",
      processingFee: "0.00",
      commission: "0.00",
      status: "Submitted" as const,
      appliedOn: "2026-08-01T09:00:00.000Z",
      verificationRequired: false,
      fundingSourceId: null,
      assignedUserId: null,
      assignedTeamId: null,
      priority: "Normal" as const,
      dueDate: null,
      notes: null,
      createdAt: "2026-08-01T09:00:00.000Z",
      updatedAt: "2026-08-01T09:00:00.000Z",
    }));

  return {
    BANKS,
    loanPage,
    calls: [] as { path: string; query: Query }[],
    refreshMock: vi.fn(),
    /** page number → the rows the API answers with. */
    state: {
      pages: {} as Record<number, ReturnType<typeof loanPage>>,
      total: 0,
    },
  };
});

const { BANKS, loanPage } = h;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/loans",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string, query?: Query) => {
    h.calls.push({ path, query });
    if (path !== "/loans") {
      return {
        data: [],
        total: 0,
        loading: false,
        error: null,
        refresh: h.refreshMock,
        setData: vi.fn(),
      };
    }
    const page = Number((query as { page?: number } | undefined)?.page ?? 1);
    const data = h.state.pages[page] ?? [];
    return {
      data,
      total: h.state.total,
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
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

/** Radix Select needs pointer APIs jsdom lacks; a native `<select>` keeps the
 *  value contract identical and testable. */
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
  h.calls.length = 0;
  h.refreshMock.mockClear();
  h.state.pages = { 1: loanPage(1, 25), 2: loanPage(26, 25), 3: loanPage(51, 10) };
  h.state.total = 60;

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

async function render() {
  await act(async () => {
    root.render(<LoansPage />);
  });
}

/** The query the most recent `/loans` request was built with. */
const loansQuery = (): Record<string, unknown> => {
  const call = [...h.calls].reverse().find((c) => c.path === "/loans");
  if (!call) throw new Error("no /loans request was issued");
  return (call.query ?? {}) as Record<string, unknown>;
};

const searchBox = () =>
  container.querySelector<HTMLInputElement>('input[placeholder^="Search"]');

/** The toolbar `<select>` that offers `option`. */
const selectOffering = (option: string): HTMLSelectElement => {
  const found = Array.from(container.querySelectorAll("select")).find((select) =>
    Array.from(select.options).some((o) => o.textContent?.trim() === option),
  );
  if (!found) throw new Error(`no select offers "${option}"`);
  return found;
};

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const setNativeValue = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto =
    element instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
};

/** Types into the search box and waits out the 250 ms debounce. */
async function search(text: string) {
  const box = searchBox()!;
  await act(async () => {
    setNativeValue(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320));
  });
}

async function chooseFilter(option: string) {
  const select = selectOffering(option);
  await act(async () => {
    setNativeValue(select, option);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const pageButton = (n: number) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="Page ${n}"]`);

const bodyRowCodes = () =>
  Array.from(container.querySelectorAll("tbody tr")).map(
    (tr) => tr.querySelector("td p")?.textContent?.trim() ?? "",
  );

/* ------------------------------------------------------------------ group A */

describe("A — the request carries the whole D-061 parameter set", () => {
  it("1. a /loans request is issued at all", async () => {
    await render();
    expect(h.calls.some((c) => c.path === "/loans")).toBe(true);
  });

  it("2. page and pageSize are sent on the very first load", async () => {
    await render();
    expect(loansQuery()).toMatchObject({ page: 1, pageSize: 25 });
  });

  it("3. the search term is sent, trimmed, after the debounce", async () => {
    await render();
    await search("  LN-1007  ");
    expect(loansQuery().search).toBe("LN-1007");
  });

  it("4. an empty box sends no search rather than an empty one", async () => {
    await render();
    expect(loansQuery().search).toBeUndefined();
  });

  it("5. the Status dropdown becomes ?status", async () => {
    await render();
    await chooseFilter("Under Review");
    expect(loansQuery().status).toBe("Under Review");
  });

  it("6. the Product dropdown becomes ?loanType — not ?type", async () => {
    await render();
    await chooseFilter("Gold Loan");
    expect(loansQuery().loanType).toBe("Gold Loan");
    expect(loansQuery()).not.toHaveProperty("type");
  });

  it("7. the Bank dropdown is mapped from the chosen NAME back to a bankId", async () => {
    // The column shows names, the API filters on ids. A name on the wire would
    // silently match nothing and the screen would read "no loans".
    await render();
    await chooseFilter("ICICI Bank");
    expect(loansQuery().bankId).toBe(BANKS[1].id);
    expect(loansQuery().bankId).not.toBe("ICICI Bank");
  });

  it("8. all six parameters travel together once each control is used", async () => {
    await render();
    await search("APP-3");
    await chooseFilter("Under Review");
    await chooseFilter("Gold Loan");
    await chooseFilter("ICICI Bank");

    expect(loansQuery()).toMatchObject({
      page: 1,
      pageSize: 25,
      search: "APP-3",
      status: "Under Review",
      loanType: "Gold Loan",
      bankId: BANKS[1].id,
    });
  });

  it("9. clearing a filter back to All stops sending it", async () => {
    await render();
    await chooseFilter("Under Review");
    expect(loansQuery().status).toBe("Under Review");

    const select = selectOffering("Under Review");
    await act(async () => {
      setNativeValue(select, "All");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(loansQuery().status).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — page 2 is a server round trip, not a slice of what is already loaded", () => {
  it("10. clicking Page 2 sends page=2", async () => {
    await render();
    await click(pageButton(2)!);
    expect(loansQuery().page).toBe(2);
  });

  it("11. page 2 renders DIFFERENT rows — the ones the server answered with", async () => {
    await render();
    const first = bodyRowCodes();
    expect(first[0]).toBe("LN-1001");

    await click(pageButton(2)!);

    const second = bodyRowCodes();
    expect(second[0]).toBe("LN-1026");
    expect(second).not.toEqual(first);
  });

  it("12. the last page renders the short final batch the server sent", async () => {
    await render();
    await click(pageButton(3)!);

    expect(loansQuery().page).toBe(3);
    expect(bodyRowCodes().length).toBe(10);
    expect(bodyRowCodes()[0]).toBe("LN-1051");
  });

  it("13. changing the search resets to page 1 — no offset into a shorter result", async () => {
    await render();
    await click(pageButton(3)!);
    expect(loansQuery().page).toBe(3);

    await search("LN-10");
    expect(loansQuery().page).toBe(1);
  });

  it("14. changing a filter resets to page 1 too", async () => {
    await render();
    await click(pageButton(2)!);
    expect(loansQuery().page).toBe(2);

    await chooseFilter("Gold Loan");
    expect(loansQuery().page).toBe(1);
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — one page size, and meta.total drives the pager", () => {
  it("15. the pageSize sent equals the pageSize DataTable renders with", async () => {
    // The defect this pins: 25 asked for, 8 rendered, so the table paged the
    // server's page a second time and hid seventeen rows behind three fake
    // page buttons.
    await render();
    expect(loansQuery().pageSize).toBe(25);
    expect(bodyRowCodes().length).toBe(25);
  });

  it("16. all 25 server rows are on screen — no client-side re-slice at 8", async () => {
    await render();
    expect(bodyRowCodes()).toContain("LN-1025");
  });

  it("17. the pager is drawn from meta.total, not from the rows in hand", async () => {
    // 60 total ÷ 25 per page = 3 pages. From 25 loaded rows alone the table
    // could only ever have concluded "1 page".
    await render();
    expect(bodyText()).toContain("Page 1 of 3");
    expect(pageButton(3)).toBeTruthy();
    expect(pageButton(4)).toBeNull();
  });

  it("18. a larger total grows the pager without any more rows being loaded", async () => {
    h.state.total = 260;
    await render();
    expect(bodyText()).toContain("Page 1 of 11");
  });

  it("19. the count badge reports the page against the server total", async () => {
    await render();
    expect(bodyText()).toContain("25 of 60");
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — D-061: the search box promises only what the server matches", () => {
  it("20. the placeholder no longer promises customer search", async () => {
    await render();
    expect(searchBox()!.placeholder).not.toContain("customer");
    expect(searchBox()!.placeholder).not.toContain("Customer");
  });

  it("21. the old sentence is gone from the page entirely", async () => {
    await render();
    expect(bodyText()).not.toContain("Search loan ID, application number, or customer");
  });

  it("22. it names the two fields the server actually searches", async () => {
    await render();
    expect(searchBox()!.placeholder).toBe("Search by loan code or application number");
  });

  it("23. no JOIN-backed customer search was smuggled in as a query parameter", async () => {
    await render();
    await search("Priya");
    const query = loansQuery();
    expect(query).not.toHaveProperty("customerName");
    expect(query).not.toHaveProperty("customer");
    expect(query.search).toBe("Priya");
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — the stat cards say which population they describe", () => {
  it("24. the lead card is meta.total, so it can speak for the whole result set", async () => {
    await render();
    // 60 is the server total; only 25 rows are loaded.
    expect(bodyText()).toContain("60");
    expect(bodyText()).toContain("matching these filters");
  });

  it("25. it follows meta.total rather than the loaded row count", async () => {
    h.state.total = 137;
    await render();
    expect(bodyText()).toContain("137");
  });

  it("26. the false 'in this book' claim is gone", async () => {
    await render();
    expect(bodyText()).not.toContain("in this book");
  });

  it("27. the three page-derived cards say 'this page'", async () => {
    await render();
    expect(bodyText()).toContain("sanctioned on this page");
    expect(bodyText()).toContain("gross before TDS, this page");
    expect(bodyText()).toContain("on this page");
  });

  it("28. no card claims a book-wide total the server never computed", async () => {
    await render();
    expect(bodyText()).not.toContain("reworkable with new lender");
  });
});

/* ------------------------------------------------------------------ group F */

describe("F — what is deliberately NOT sent, and what is not shown", () => {
  it("29. priority is never sent — no control chooses one (D-061)", async () => {
    await render();
    await chooseFilter("Gold Loan");
    expect(loansQuery()).not.toHaveProperty("priority");
  });

  it("30. assignedUserId and assignedTeamId are never sent", async () => {
    await render();
    expect(loansQuery()).not.toHaveProperty("assignedUserId");
    expect(loansQuery()).not.toHaveProperty("assignedTeamId");
  });

  it("31. customerId is not sent from the primary list — that belongs to the detail page", async () => {
    await render();
    expect(loansQuery()).not.toHaveProperty("customerId");
  });

  it("32. sort affordances are hidden: a header that sorted would only reorder one page", async () => {
    // D-051 constraint 5. `DataTable` does this on its own in server mode; this
    // asserts the loans table actually is in server mode.
    await render();
    const headerButtons = container.querySelectorAll("thead button");
    expect(headerButtons.length).toBe(0);
  });

  it("33. the export names the page it wrote, not the book", async () => {
    await render();
    const exportButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Export"),
    );
    expect(exportButton?.textContent).toContain("Export page");
  });
});
