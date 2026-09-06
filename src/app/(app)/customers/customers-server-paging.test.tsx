/**
 * TASK 4.5 — the customer list is searched, filtered and paged by the API.
 *
 * Before this, the page asked for `pageSize: 100` and let `DataTable` slice the
 * result in memory, so customer 101 was **unreachable** (roadmap Phase 4
 * Definition-of-Done box 2) and the search box was inert: `search` was
 * `React.useState("")` with no setter, so `?search=` was never sent whatever
 * was typed.
 *
 * `useResource` is mocked with a stand-in for the real route: it reads
 * `page`/`pageSize`/`search`/`status`/`bankId`/`kyc` exactly as
 * `customers.routes.ts:128-176` does and answers with one page plus a
 * `meta.total`. That makes "page 2 renders different rows" a claim about the
 * request the page issued, not about a fixture handed straight back.
 *
 * Groups D-F cover the three statements moving to the server would otherwise
 * have made false (D-051 constraints 5-7 and D-053): a page-scoped sort
 * presented as table-wide, an export toast counting a page as the book, and
 * `% of book` computed over 25 rows.
 *
 * Follows D-012: `react-dom/client` + React 19's `act`, no component-testing
 * library, `@/components/ui/select` stubbed to a native control.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Query = Record<string, string | number | boolean | undefined | null>;

const h = vi.hoisted(() => {
  const BANKS = [
    { id: "b1000000-0000-4000-8000-000000000001", name: "HDFC Bank", shortName: "HDFC", code: "HDFC" },
    { id: "b2000000-0000-4000-8000-000000000002", name: "ICICI Bank", shortName: "ICICI", code: "ICICI" },
  ];

  /** 200 customers, so the pager has to reach far past its old six-button cap. */
  const CUSTOMERS = Array.from({ length: 200 }, (_, index) => ({
    id: `c${String(index + 1).padStart(4, "0")}0000-0000-4000-8000-000000000000`,
    code: `CUS-${10001 + index}`,
    bankId: BANKS[index % 2].id,
    bankReferenceId: `REF${String(index + 1).padStart(3, "0")}`,
    name: `Customer ${String(index + 1).padStart(3, "0")}`,
    fatherName: null,
    motherName: null,
    dob: null,
    gender: null,
    maritalStatus: null,
    occupation: null,
    monthlyIncome: String(40000 + index),
    mobile: `98480${String(10000 + index)}`,
    altMobile: null,
    email: null,
    address: null,
    city: "Hyderabad",
    state: "Telangana",
    pincode: null,
    pan: `ABCPK${String(1000 + index)}K`,
    aadhaarLast4: null,
    kyc: (["Verified", "Pending", "Rejected"] as const)[index % 3],
    cibil: 700 + (index % 90),
    accountNo: null,
    ifsc: null,
    branch: null,
    assignedUserId: null,
    assignedTeamId: null,
    status: (["Active", "Follow Up", "Closed"] as const)[index % 3],
    createdAt: "2026-08-01T09:00:00.000Z",
  }));

  return {
    BANKS,
    CUSTOMERS,
    queries: [] as Query[],
    exportCsvMock: vi.fn(),
    toastSuccess: vi.fn(),
    refreshMock: vi.fn(),
    pushMock: vi.fn(),
  };
});

const { BANKS } = h;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: h.pushMock,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/customers",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: vi.fn().mockResolvedValue({ available: true }),
    api: { ...actual.api, remove: vi.fn(), create: vi.fn() },
  };
});

vi.mock("@/lib/export", () => ({ exportCsv: h.exportCsvMock }));

/**
 * Stands in for `GET /api/customers`: the same filters, the same ordering
 * contract, the same `meta.total`. Anything the page fails to send simply does
 * not narrow the result, which is what makes the assertions below meaningful.
 */
vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string, query?: Query) => {
    if (path !== "/customers") {
      return { data: [], total: 0, loading: false, error: null, refresh: vi.fn(), setData: vi.fn() };
    }
    h.queries.push({ ...(query ?? {}) });

    const page = Number(query?.page ?? 1);
    const pageSize = Number(query?.pageSize ?? 25);
    const needle = String(query?.search ?? "").trim().toLowerCase();

    const matched = h.CUSTOMERS.filter((row) => {
      if (query?.status && row.status !== query.status) return false;
      if (query?.kyc && row.kyc !== query.kyc) return false;
      if (query?.bankId && row.bankId !== query.bankId) return false;
      if (!needle) return true;
      // The server corpus, verbatim: name, mobile, code, bankReferenceId.
      return `${row.name} ${row.mobile} ${row.code} ${row.bankReferenceId}`
        .toLowerCase()
        .includes(needle);
    });

    return {
      data: matched.slice((page - 1) * pageSize, page * pageSize),
      total: matched.length,
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
  toast: { success: h.toastSuccess, error: vi.fn(), info: vi.fn() },
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

/** `DataTable` mirrors `searchPlaceholder` into `aria-label` (`data-table.tsx:281`). */
const SEARCH_LABEL = "Search by name, mobile, PAN, customer code, or bank reference";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.queries.length = 0;
  h.exportCsvMock.mockClear();
  h.toastSuccess.mockClear();
  h.refreshMock.mockClear();

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

async function mountPage() {
  await act(async () => {
    root.render(<CustomersPage />);
  });
}

const bodyText = () => document.body.textContent ?? "";

const lastQuery = (): Query => h.queries[h.queries.length - 1] ?? {};

const rowNames = (): string[] =>
  Array.from(container.querySelectorAll("tbody tr"))
    .map((tr) => tr.textContent ?? "")
    .map((text) => text.match(/Customer \d{3}/)?.[0] ?? "")
    .filter(Boolean);

const buttonByText = (text: string): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined;

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const type = async (value: string) => {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${SEARCH_LABEL}"]`);
  if (!input) throw new Error("search box not rendered");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const choose = async (label: string, value: string) => {
  const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!select) throw new Error(`filter "${label}" not rendered`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

/** The search is debounced (250ms), so the request lands after the keystrokes. */
const settleDebounce = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320));
  });
};

/* ------------------------------------------------------------------ group A */

describe("A — paging is a request, and page 2 is a different page", () => {
  it("1. asks for page 1 with the page size it renders", async () => {
    await mountPage();

    expect(lastQuery().page).toBe(1);
    expect(lastQuery().pageSize).toBe(25);
  });

  it("2. renders the page the API returned, not a client slice of everything", async () => {
    await mountPage();

    expect(rowNames()).toHaveLength(25);
    expect(rowNames()[0]).toBe("Customer 001");
    expect(rowNames()[24]).toBe("Customer 025");
  });

  it("3. clicking page 2 issues page=2 and shows different rows", async () => {
    await mountPage();
    const firstPage = rowNames();

    await click(buttonByText("2")!);

    expect(lastQuery().page).toBe(2);
    expect(rowNames()[0]).toBe("Customer 026");
    expect(rowNames()).not.toEqual(firstPage);
  });

  it("4. meta.total drives the pager, so customer 200 is reachable", async () => {
    await mountPage();

    // 200 customers at 25 a page. The old table saw 100 rows and drew 4 pages.
    expect(bodyText()).toContain("Page 1 of 8");
    expect(buttonByText("8")).toBeTruthy();

    await click(buttonByText("8")!);

    expect(lastQuery().page).toBe(8);
    expect(rowNames()[24]).toBe("Customer 200");
  });

  it("5. pages past the sixth are reachable without walking Next — DoD box 2", async () => {
    await mountPage();

    // The old pager rendered `[1..6]` and nothing else, so 7 and 8 had no button
    // at all. The last page is now always pinned…
    await click(buttonByText("8")!);
    expect(lastQuery().page).toBe(8);

    // …and the window follows the current page, so its neighbours come with it.
    await click(buttonByText("7")!);
    expect(lastQuery().page).toBe(7);
    expect(rowNames()[0]).toBe("Customer 151");
  });

  it("6. the count badge reports this page of the real total", async () => {
    await mountPage();

    expect(bodyText()).toContain("25 of 200");
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — the search box reaches the server", () => {
  it("7. sends ?search= once the typing settles", async () => {
    await mountPage();

    await type("Customer 137");
    await settleDebounce();

    expect(lastQuery().search).toBe("Customer 137");
    expect(rowNames()).toEqual(["Customer 137"]);
  });

  it("8. is debounced — the keystroke alone does not change the request", async () => {
    await mountPage();
    const before = lastQuery().search;

    await type("Cus");

    expect(lastQuery().search).toBe(before);
  });

  it("9. searches the whole book, not the loaded page", async () => {
    await mountPage();

    // Customer 199 is on page 8; it was unreachable by the old in-memory search.
    await type("Customer 199");
    await settleDebounce();

    expect(rowNames()).toEqual(["Customer 199"]);
    expect(bodyText()).toContain("1 of 1");
  });

  it("10. matches the customer code, which the placeholder now names", async () => {
    await mountPage();

    await type("CUS-10150");
    await settleDebounce();

    expect(rowNames()).toEqual(["Customer 150"]);
  });

  it("11. matches the bank reference id, which the placeholder also names", async () => {
    await mountPage();

    await type("REF175");
    await settleDebounce();

    expect(rowNames()).toEqual(["Customer 175"]);
  });

  it("12. returns to page 1 so a search cannot land on an empty offset", async () => {
    await mountPage();

    await click(buttonByText("4")!);
    expect(lastQuery().page).toBe(4);

    await type("Customer");
    await settleDebounce();

    expect(lastQuery().page).toBe(1);
  });

  it("13. clearing the box drops the parameter rather than sending an empty one", async () => {
    await mountPage();

    await type("Customer 137");
    await settleDebounce();
    await type("");
    await settleDebounce();

    expect(lastQuery().search).toBeUndefined();
    expect(bodyText()).toContain("25 of 200");
  });

  it("14. the placeholder names exactly the fields the server matches (D-053)", async () => {
    await mountPage();

    const input = container.querySelector<HTMLInputElement>(`input[aria-label="${SEARCH_LABEL}"]`);
    expect(input).toBeTruthy();

    // Every field named here IS in the server's `or(...)`
    // (`customers.routes.ts`), so the box cannot promise a match the API will
    // not make. `pan` is in that list because D-053 puts preservation first and
    // Task 4.5 took the one-line backend extension rather than dropping a
    // capability users had.
    expect(input!.placeholder).toMatch(/name/i);
    expect(input!.placeholder).toMatch(/mobile/i);
    expect(input!.placeholder).toMatch(/PAN/i);
    expect(input!.placeholder).toMatch(/code/i);
    expect(input!.placeholder).toMatch(/reference/i);

    // The one promise it must NOT keep making. `customers.id` is a uuid column;
    // `ilike` cannot take it without a `::text` cast, so it is not searchable
    // and naming it would be a claim the API cannot honour.
    expect(input!.placeholder).not.toMatch(/\bID\b/);
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — every filter becomes a query parameter", () => {
  it("15. Status sends ?status=", async () => {
    await mountPage();

    await choose("Status", "Follow Up");

    expect(lastQuery().status).toBe("Follow Up");
    expect(rowNames()[0]).toBe("Customer 002");
  });

  it("16. KYC sends ?kyc= — the filter D-051 added to the route", async () => {
    await mountPage();

    await choose("KYC", "Rejected");

    expect(lastQuery().kyc).toBe("Rejected");
    // Rejected customers used to sit unreachable behind a client-side filter
    // over the first hundred rows; the count is now the whole book's.
    expect(bodyText()).toContain("of 66");
  });

  it("17. Bank sends the bank's id, not the name shown in the control", async () => {
    await mountPage();

    await choose("Bank", "ICICI Bank");

    expect(lastQuery().bankId).toBe(BANKS[1].id);
  });

  it("18. filters compose, and each one is sent", async () => {
    await mountPage();

    await choose("Status", "Active");
    await choose("KYC", "Verified");

    expect(lastQuery().status).toBe("Active");
    expect(lastQuery().kyc).toBe("Verified");
  });

  it("19. All removes the parameter instead of sending the word All", async () => {
    await mountPage();

    await choose("Status", "Closed");
    expect(lastQuery().status).toBe("Closed");

    await choose("Status", "All");
    expect(lastQuery().status).toBeUndefined();
  });

  it("20. a filter returns to page 1", async () => {
    await mountPage();

    await click(buttonByText("5")!);
    await choose("KYC", "Pending");

    expect(lastQuery().page).toBe(1);
  });

  it("21. the empty state is only reached when the server returned nothing", async () => {
    await mountPage();

    await type("no such customer");
    await settleDebounce();

    expect(bodyText()).toContain("No customers match this view");
    expect(bodyText()).toContain("0 of 0");
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — nothing on the toolbar claims more than one page (D-051 5-7)", () => {
  it("22. no sort control is offered, because there is no sortBy to send", async () => {
    await mountPage();

    for (const header of ["Customer", "Bank", "Income", "CIBIL", "Added"]) {
      expect(buttonByText(header)).toBeUndefined();
    }
    // The headers themselves are still rendered.
    expect(container.querySelector("thead")?.textContent).toContain("CIBIL");
  });

  it("23. the export names its scope and counts the page, not the book", async () => {
    await mountPage();

    await click(buttonByText("Export page")!);

    expect(h.exportCsvMock.mock.calls[0][1]).toHaveLength(25);
    const description = h.toastSuccess.mock.calls[0][1].description as string;
    expect(description).toContain("current page");
    expect(description).toContain("25 rows");
    expect(description).not.toContain("200");
  });

  it("24. the stat cards say which population each number describes", async () => {
    await mountPage();

    const text = bodyText();
    // "% of book" was computed over the loaded rows and is now a page.
    expect(text).not.toContain("of book");
    expect(text).toContain("% of this page");
    expect(text).toContain("on this page");
    expect(text).toContain("declared, this page");
  });

  it("25. the one book-wide figure is the server's total, and it follows the filters", async () => {
    await mountPage();

    expect(bodyText()).toContain("matching these filters");
    // 200 is `meta.total`, not `rows.length` — the page holds 25.
    expect(container.textContent).toContain("200");

    await choose("KYC", "Verified");

    expect(bodyText()).toContain("67");
  });
});
