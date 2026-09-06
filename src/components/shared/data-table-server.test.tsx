/**
 * TASK 4.5 — the DataTable's new, optional server-driven mode.
 *
 * `data-table.test.tsx` pins the client behaviour every other consumer keeps.
 * This file pins what the customer list opted into: `total` + `page` +
 * `onPageChange` switch the component from "filter and slice this array" to
 * "render this page and tell me when the user wants another one".
 *
 * Three of these groups exist because moving paging to the server makes
 * previously-true statements false (D-051 constraints 3, 5 and 6):
 *
 *   - the pager showed the FIRST six pages, so page 7+ had no button;
 *   - a sort header would reorder 25 rows while looking table-wide, and there
 *     is no `sortBy` parameter to send;
 *   - the export writes the rows in hand, which is now one page.
 *
 * Follows D-012: `react-dom/client` + React 19's `act`, no component-testing
 * library, `@/components/ui/select` stubbed to a native control.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  exportCsvMock: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/export", () => ({ exportCsv: h.exportCsvMock }));

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

import { DataTable, pageWindow, type Column } from "@/components/shared/data-table";

interface Row {
  id: string;
  name: string;
  city: string;
  score: number;
}

/** One server page: ten rows the API already selected. */
const PAGE_ROWS: Row[] = Array.from({ length: 10 }, (_, index) => ({
  id: `id-${index + 1}`,
  name: `Row ${String(index + 1).padStart(2, "0")}`,
  city: index % 2 === 0 ? "Hyderabad" : "Chennai",
  score: 100 - index,
}));

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "Name", sortValue: (row) => row.name },
  { key: "city", header: "City" },
  { key: "score", header: "Score", align: "right", sortValue: (row) => row.score },
];

const CITY_FILTER = {
  key: "city",
  label: "City",
  options: ["Hyderabad", "Chennai"],
  value: (row: Row) => row.city,
};

let root: Root;
let container: HTMLDivElement;
const onPageChange = vi.fn();
const onSearchChange = vi.fn();
const onFilterChange = vi.fn();

async function renderServerTable(
  overrides: Partial<React.ComponentProps<typeof DataTable<Row>>> = {},
) {
  await act(async () => {
    root.render(
      <DataTable
        rows={PAGE_ROWS}
        columns={COLUMNS}
        pageSize={10}
        total={95}
        page={1}
        onPageChange={onPageChange}
        onSearchChange={onSearchChange}
        onFilterChange={onFilterChange}
        filters={[CITY_FILTER]}
        searchText={(row) => `${row.name} ${row.city}`}
        searchPlaceholder="Search rows"
        exportName="rows"
        {...overrides}
      />,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onPageChange.mockClear();
  onSearchChange.mockClear();
  onFilterChange.mockClear();
  h.exportCsvMock.mockClear();
  h.toastSuccess.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const bodyText = () => document.body.textContent ?? "";

const rowNames = (): string[] =>
  Array.from(container.querySelectorAll("tbody tr")).map(
    (tr) => tr.querySelector("td")?.textContent?.trim() ?? "",
  );

const buttonByText = (text: string): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined;

const buttonByLabel = (label: string): HTMLButtonElement | null =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

const pageButtons = (): number[] =>
  Array.from(container.querySelectorAll('button[aria-label^="Page "]')).map((b) =>
    Number(b.textContent?.trim()),
  );

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const type = async (value: string) => {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Search rows"]');
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

/* ------------------------------------------------------------------ group F */

describe("F — the given rows are the page, and `total` drives the pager", () => {
  it("1. renders every row it was given, unsliced", async () => {
    // pageSize is 10 and ten rows were supplied; in client mode a 5-row page
    // size would have shown five. Nothing is dropped or re-selected here.
    await renderServerTable({ pageSize: 5 });

    expect(rowNames()).toHaveLength(10);
    expect(rowNames()[9]).toBe("Row 10");
  });

  it("2. takes the page count from total, not from the rows in hand", async () => {
    await renderServerTable();

    // 95 rows at 10 per page.
    expect(bodyText()).toContain("Page 1 of 10");
  });

  it("3. the count badge reads this page of the whole result set", async () => {
    await renderServerTable();

    expect(bodyText()).toContain("10 of 95");
  });

  it("4. a numbered button asks the consumer for that page", async () => {
    await renderServerTable();

    await click(buttonByText("3")!);

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("5. Next and Previous ask for the neighbouring page", async () => {
    await renderServerTable({ page: 4 });

    await click(buttonByLabel("Next page")!);
    expect(onPageChange).toHaveBeenCalledWith(5);

    await click(buttonByLabel("Previous page")!);
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("6. the pager does not move on its own — the consumer owns the page", async () => {
    await renderServerTable();

    await click(buttonByText("3")!);

    // `page` is still 1 because the parent has not re-rendered with a new one.
    expect(bodyText()).toContain("Page 1 of 10");
  });

  it("7. Previous is disabled on page 1 and Next on the last page", async () => {
    await renderServerTable();
    expect(buttonByLabel("Previous page")!.disabled).toBe(true);
    expect(buttonByLabel("Next page")!.disabled).toBe(false);

    await renderServerTable({ page: 10 });
    expect(buttonByLabel("Next page")!.disabled).toBe(true);
    expect(buttonByLabel("Previous page")!.disabled).toBe(false);
  });

  it("8. an empty page still reports the real total and shows the empty state", async () => {
    await renderServerTable({ rows: [], total: 0, emptyState: <p>Nothing here</p> });

    expect(bodyText()).toContain("Nothing here");
    expect(bodyText()).toContain("0 of 0");
    expect(bodyText()).toContain("Page 1 of 1");
  });
});

/* ------------------------------------------------------------------ group G */

describe("G — pages beyond the sixth are reachable, which was DoD box 2", () => {
  it("9. the last page has a button from page 1", async () => {
    await renderServerTable();

    // The old pager rendered exactly [1,2,3,4,5,6] and page 10 could only be
    // reached by clicking Next four times.
    expect(pageButtons()).toContain(10);

    await click(buttonByText("10")!);
    expect(onPageChange).toHaveBeenCalledWith(10);
  });

  it("10. page 7 is directly clickable, and shows as current once loaded", async () => {
    await renderServerTable();
    expect(pageButtons()).toContain(1);

    await renderServerTable({ page: 7 });

    expect(pageButtons()).toContain(7);
    expect(buttonByText("7")!.className).toContain("bg-[var(--primary)]");
  });

  it("11. the window slides with the current page but keeps both ends", async () => {
    await renderServerTable({ page: 7 });

    const buttons = pageButtons();
    expect(buttons[0]).toBe(1);
    expect(buttons[buttons.length - 1]).toBe(10);
    expect(buttons).toContain(7);
  });

  it("12. six pages or fewer renders exactly 1…N, as the old cap did", async () => {
    await renderServerTable({ total: 55, page: 1 });

    expect(pageButtons()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("13. pageWindow never hides a page: every page is on some window, ends always shown", () => {
    for (let totalPages = 1; totalPages <= 25; totalPages += 1) {
      const seen = new Set<number>();
      for (let current = 1; current <= totalPages; current += 1) {
        const window = pageWindow(current, totalPages);
        expect(window[0]).toBe(1);
        expect(window[window.length - 1]).toBe(totalPages);
        expect(window).toContain(current);
        // Strictly increasing — no duplicate or out-of-order button.
        window.forEach((value, index) => {
          if (index > 0) expect(value).toBeGreaterThan(window[index - 1]);
        });
        window.forEach((value) => seen.add(value));
      }
      expect(seen.size).toBe(totalPages);
    }
  });
});

/* ------------------------------------------------------------------ group H */

describe("H — search and filters are reported, never applied locally", () => {
  it("14. every keystroke reaches onSearchChange", async () => {
    await renderServerTable();

    await type("pri");

    expect(onSearchChange).toHaveBeenCalledWith("pri");
  });

  it("15. the rows are NOT filtered in memory — the server already answered", async () => {
    // The decisive case: a needle that matches none of the rendered rows. If the
    // component still filtered locally, a server match on a field outside
    // `searchText` (`code`, `bankReferenceId`) would vanish while the pager kept
    // claiming the total.
    await renderServerTable();

    await type("no such row anywhere");

    expect(rowNames()).toHaveLength(10);
    expect(bodyText()).toContain("10 of 95");
  });

  it("16. a filter is reported with its key and the chosen option", async () => {
    await renderServerTable();

    await choose("City", "Chennai");

    expect(onFilterChange).toHaveBeenCalledWith("city", "Chennai");
    // …and still renders the page it was given.
    expect(rowNames()).toHaveLength(10);
  });

  it("17. choosing All reports All rather than silently doing nothing", async () => {
    await renderServerTable();

    await choose("City", "Chennai");
    await choose("City", "All");

    expect(onFilterChange).toHaveBeenLastCalledWith("city", "All");
  });

  it("18. Clear reports the cleared search and every cleared filter", async () => {
    await renderServerTable();

    await type("something");
    onSearchChange.mockClear();

    await click(buttonByText("Clear")!);

    expect(onSearchChange).toHaveBeenCalledWith("");
    expect(onFilterChange).toHaveBeenCalledWith("city", "All");
  });
});

/* ------------------------------------------------------------------ group I */

describe("I — the toolbar makes no claim the server mode cannot honour", () => {
  it("19. no sort affordance is rendered — there is no sortBy to send", async () => {
    await renderServerTable();

    expect(buttonByText("Name")).toBeUndefined();
    expect(buttonByText("Score")).toBeUndefined();
    // The headers are still there, as plain text.
    expect(bodyText()).toContain("Name");
    expect(bodyText()).toContain("Score");
  });

  it("20. the client-side table keeps its sort headers", async () => {
    // The same columns, without the server props: the ten other consumers are
    // untouched.
    await act(async () => {
      root.render(
        <DataTable
          rows={PAGE_ROWS}
          columns={COLUMNS}
          pageSize={5}
          searchText={(row) => row.name}
          searchPlaceholder="Search rows"
        />,
      );
    });

    expect(buttonByText("Name")).toBeTruthy();
  });

  it("21. the export names its scope: the current page", async () => {
    await renderServerTable();

    await click(buttonByText("Export page")!);

    expect(h.exportCsvMock.mock.calls[0][1]).toHaveLength(10);
    expect(h.toastSuccess).toHaveBeenCalledWith(
      "Exported",
      expect.objectContaining({
        description: expect.stringContaining("from the current page"),
      }),
    );
  });

  it("22. it does not claim to have exported the whole result set", async () => {
    await renderServerTable();

    await click(buttonByText("Export page")!);

    const description = h.toastSuccess.mock.calls[0][1].description as string;
    expect(description).not.toContain("95");
    expect(description).toContain("10 rows");
  });

  it("23. the client-side export keeps its original wording", async () => {
    await act(async () => {
      root.render(
        <DataTable
          rows={PAGE_ROWS}
          columns={COLUMNS}
          pageSize={5}
          searchText={(row) => row.name}
          exportName="rows"
        />,
      );
    });

    await click(buttonByText("Export CSV")!);

    expect(h.toastSuccess).toHaveBeenCalledWith("Exported", {
      description: "10 rows saved as rows.csv",
    });
  });
});
