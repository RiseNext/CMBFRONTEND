/**
 * TASK 4.5 — the DataTable regression suite, written BEFORE the component was
 * touched (D-051 constraint 2, and the roadmap's Phase 4 "tests required" note).
 *
 * `data-table.tsx` is a 317-line shared component with **eleven consumers** and
 * no test at all. Task 4.5 adds server-driven paging for the customer list;
 * every other consumer — bank-orders, disbursement, documents, employees,
 * ledger, loans, my-work, recycle-bin, settlements, transactions — must keep
 * its **client-side** behaviour byte for byte. The new props are optional and
 * this file pins what happens when none of them is supplied.
 *
 * It was run green against the unmodified component first, so a failure here
 * means the shared component regressed, not that the test was fitted to the
 * change.
 *
 * The one deliberate exception to "unchanged" is the pager: `:293` rendered
 * `Array.from({ length: totalPages }).slice(0, 6)`, so with real totals pages
 * 7+ had no button (roadmap Phase 4 box 2, D-051 constraint 3). Group A
 * therefore uses datasets of **six pages or fewer**, where the windowed pager
 * and the old cap produce exactly the same buttons; the 7+ case is asserted in
 * `data-table-server.test.tsx`, where it is new behaviour rather than a
 * regression.
 *
 * Follows D-012: `react-dom/client` + React 19's `act`, no component-testing
 * library. `@/components/ui/select` is stubbed down to a native `<select>` —
 * Radix's listbox is a portal driven by pointer events jsdom does not
 * implement, and the filters are the subject of group C.
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

/**
 * A native `<select>` labelled with the placeholder the real `SelectValue`
 * carries — which for a DataTable filter is `filter.label`, so each control is
 * findable by the name the user sees.
 */
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

import { DataTable, type Column } from "@/components/shared/data-table";

interface Row {
  id: string;
  name: string;
  city: string;
  score: number;
}

const ROWS: Row[] = Array.from({ length: 12 }, (_, index) => ({
  id: `id-${index + 1}`,
  // Zero-padded so "Row 1" cannot substring-match "Row 10".
  name: `Row ${String(index + 1).padStart(2, "0")}`,
  city: index % 2 === 0 ? "Hyderabad" : "Chennai",
  score: 100 - index,
}));

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "Name", sortValue: (row) => row.name },
  { key: "city", header: "City" },
  { key: "score", header: "Score", align: "right", sortValue: (row) => row.score },
];

let root: Root;
let container: HTMLDivElement;

async function render(node: React.ReactNode) {
  await act(async () => {
    root.render(node);
  });
}

/** The default client-side table used by all ten non-customer consumers. */
async function renderClientTable(overrides: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  await render(
    <DataTable
      rows={ROWS}
      columns={COLUMNS}
      pageSize={5}
      searchText={(row) => `${row.name} ${row.city}`}
      searchPlaceholder="Search rows"
      exportName="rows"
      {...overrides}
    />,
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
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

const CITY_FILTER = {
  key: "city",
  label: "City",
  options: ["Hyderabad", "Chennai"],
  value: (row: Row) => row.city,
};

/* ------------------------------------------------------------------ group A */

describe("A — rows are sliced client-side and every page is reachable", () => {
  it("1. renders only the first page of rows", async () => {
    await renderClientTable();

    expect(rowNames()).toEqual(["Row 01", "Row 02", "Row 03", "Row 04", "Row 05"]);
  });

  it("2. reports the page count from the rows it was given", async () => {
    await renderClientTable();

    expect(bodyText()).toContain("Page 1 of 3");
  });

  it("3. a numbered button moves to that slice", async () => {
    await renderClientTable();

    await click(buttonByText("2")!);

    expect(rowNames()).toEqual(["Row 06", "Row 07", "Row 08", "Row 09", "Row 10"]);
    expect(bodyText()).toContain("Page 2 of 3");
  });

  it("4. Next and Previous move one page at a time", async () => {
    await renderClientTable();

    await click(buttonByLabel("Next page")!);
    expect(rowNames()[0]).toBe("Row 06");

    await click(buttonByLabel("Previous page")!);
    expect(rowNames()[0]).toBe("Row 01");
  });

  it("5. Previous is disabled on the first page and Next on the last", async () => {
    await renderClientTable();

    expect(buttonByLabel("Previous page")!.disabled).toBe(true);
    expect(buttonByLabel("Next page")!.disabled).toBe(false);

    await click(buttonByText("3")!);

    expect(buttonByLabel("Next page")!.disabled).toBe(true);
    expect(buttonByLabel("Previous page")!.disabled).toBe(false);
  });

  it("6. the last partial page renders only the rows that exist", async () => {
    await renderClientTable();

    await click(buttonByText("3")!);

    expect(rowNames()).toEqual(["Row 11", "Row 12"]);
  });

  it("7. the count badge is filtered-of-total, both computed from the given rows", async () => {
    await renderClientTable();

    expect(bodyText()).toContain("12 of 12");
  });

  it("8. every page has a button when there are six pages or fewer", async () => {
    await renderClientTable({ pageSize: 2, rows: ROWS.slice(0, 12) });

    // 12 rows / 2 = 6 pages.
    expect(bodyText()).toContain("Page 1 of 6");
    for (const page of ["1", "2", "3", "4", "5", "6"]) {
      expect(buttonByText(page)).toBeTruthy();
    }
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — search filters the given rows in memory", () => {
  it("9. narrows the table to rows whose searchText matches", async () => {
    await renderClientTable();

    await type("Row 07");

    expect(rowNames()).toEqual(["Row 07"]);
    expect(bodyText()).toContain("1 of 12");
  });

  it("10. matches on any field the consumer put in searchText", async () => {
    await renderClientTable();

    await type("chennai");

    expect(rowNames()).toEqual(["Row 02", "Row 04", "Row 06", "Row 08", "Row 10"]);
  });

  it("11. is case-insensitive and trims the needle", async () => {
    await renderClientTable();

    await type("  ROW 03  ");

    expect(rowNames()).toEqual(["Row 03"]);
  });

  it("12. resets to page 1 so the results are not hidden behind the old offset", async () => {
    await renderClientTable();

    await click(buttonByText("3")!);
    await type("Hyderabad");

    expect(bodyText()).toContain("Page 1 of");
    expect(rowNames()[0]).toBe("Row 01");
  });

  it("13. clearing the box restores every row", async () => {
    await renderClientTable();

    await type("Row 07");
    await type("");

    expect(rowNames()).toEqual(["Row 01", "Row 02", "Row 03", "Row 04", "Row 05"]);
  });

  it("14. shows the empty state when nothing matches", async () => {
    await renderClientTable({ emptyState: <p>Nothing here</p> });

    await type("no such row");

    // The empty state occupies the single remaining body row, so the assertion
    // is that no data row survived rather than that the body is empty.
    expect(rowNames().filter((name) => name.startsWith("Row "))).toEqual([]);
    expect(bodyText()).toContain("Nothing here");
    expect(bodyText()).toContain("0 of 12");
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — filters select on the value function, client-side", () => {
  it("15. selecting an option narrows the rows", async () => {
    await renderClientTable({ filters: [CITY_FILTER] });

    await choose("City", "Chennai");

    expect(rowNames()).toEqual(["Row 02", "Row 04", "Row 06", "Row 08", "Row 10"]);
    expect(bodyText()).toContain("6 of 12");
  });

  it("16. All restores every row", async () => {
    await renderClientTable({ filters: [CITY_FILTER] });

    await choose("City", "Chennai");
    await choose("City", "All");

    expect(bodyText()).toContain("12 of 12");
  });

  it("17. a filter composes with the search box", async () => {
    await renderClientTable({ filters: [CITY_FILTER] });

    await choose("City", "Hyderabad");
    await type("Row 05");

    expect(rowNames()).toEqual(["Row 05"]);
  });

  it("18. Clear resets both the search and the filters", async () => {
    await renderClientTable({ filters: [CITY_FILTER] });

    await choose("City", "Chennai");
    await type("Row 02");
    expect(rowNames()).toEqual(["Row 02"]);

    await click(buttonByText("Clear")!);

    expect(rowNames()).toEqual(["Row 01", "Row 02", "Row 03", "Row 04", "Row 05"]);
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — sorting orders the whole client set, not just the page", () => {
  it("19. a sortable header renders a sort control", async () => {
    await renderClientTable();

    expect(buttonByText("Name")).toBeTruthy();
    expect(buttonByText("Score")).toBeTruthy();
  });

  it("20. a column without sortValue renders no control", async () => {
    await renderClientTable();

    // "City" is plain header text, not a button.
    expect(buttonByText("City")).toBeUndefined();
  });

  it("21. sorts ascending on the first click, across every row", async () => {
    await renderClientTable();

    await click(buttonByText("Score")!);

    // Ascending by score puts the LAST row first — proof the sort is applied
    // before the slice, not to the visible page.
    expect(rowNames()[0]).toBe("Row 12");
  });

  it("22. toggles to descending on the second click", async () => {
    await renderClientTable();

    await click(buttonByText("Score")!);
    await click(buttonByText("Score")!);

    expect(rowNames()[0]).toBe("Row 01");
  });

  it("23. switching column resets to ascending", async () => {
    await renderClientTable();

    await click(buttonByText("Score")!);
    await click(buttonByText("Score")!);
    await click(buttonByText("Name")!);

    expect(rowNames()[0]).toBe("Row 01");
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — export and row interaction", () => {
  it("24. exports every filtered row, not only the visible page", async () => {
    await renderClientTable();

    await click(buttonByText("Export CSV")!);

    expect(h.exportCsvMock).toHaveBeenCalledTimes(1);
    const [name, data] = h.exportCsvMock.mock.calls[0];
    expect(name).toBe("rows");
    expect(data).toHaveLength(12);
    expect(h.toastSuccess).toHaveBeenCalledWith(
      "Exported",
      expect.objectContaining({ description: expect.stringContaining("12 rows") }),
    );
  });

  it("25. exports the search result when one is active", async () => {
    await renderClientTable();

    await type("Chennai");
    await click(buttonByText("Export CSV")!);

    expect(h.exportCsvMock.mock.calls[0][1]).toHaveLength(6);
  });

  it("26. calls onRowClick with the row that was clicked", async () => {
    const onRowClick = vi.fn();
    await renderClientTable({ onRowClick });

    await click(container.querySelectorAll("tbody tr")[1]);

    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: "id-2" }));
  });

  it("27. renders the toolbar extra a consumer supplies", async () => {
    await renderClientTable({ toolbarExtra: <span>Extra control</span> });

    expect(bodyText()).toContain("Extra control");
  });
});
