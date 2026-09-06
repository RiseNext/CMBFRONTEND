"use client";

import * as React from "react";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportCsv } from "@/lib/export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  exportValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right";
  className?: string;
}

export interface TableFilter<T> {
  key: string;
  label: string;
  options: string[];
  value: (row: T) => string;
}

/** How many numbered page buttons the pager draws. Six, as it always has. */
const PAGE_BUTTONS = 6;

/**
 * The numbered buttons for `current` — Task 4.5, D-051 constraint 3.
 *
 * The pager used to render `Array.from({ length: totalPages }).slice(0, 6)`:
 * always the FIRST six pages. That was invisible while every table sliced at
 * most a hundred client-side rows, but under real totals a customer on page 9
 * had no button, and pages 7+ were reachable only by clicking Next repeatedly —
 * roadmap Phase 4 Definition-of-Done box 2.
 *
 * The window slides with the current page and is pinned at both ends, so page 1
 * and the last page always have a button and no page is ever unreachable. With
 * six pages or fewer the output is `1…totalPages`, identical to the old cap,
 * which is why the ten client-side consumers are unaffected.
 */
export function pageWindow(current: number, totalPages: number): number[] {
  const size = Math.min(PAGE_BUTTONS, Math.max(1, totalPages));
  const start = Math.min(
    Math.max(1, current - Math.floor((size - 1) / 2)),
    Math.max(1, totalPages - size + 1),
  );
  const window = Array.from({ length: size }, (_, index) => start + index);

  if (window[0] !== 1) window[0] = 1;
  if (window[window.length - 1] !== totalPages) window[window.length - 1] = totalPages;
  return window;
}

interface DataTableProps<T extends { id: string }> {
  rows: T[];
  columns: Column<T>[];
  searchText: (row: T) => string;
  searchPlaceholder?: string;
  filters?: TableFilter<T>[];
  onRowClick?: (row: T) => void;
  exportName?: string;
  pageSize?: number;
  toolbarExtra?: React.ReactNode;
  emptyState?: React.ReactNode;
  dense?: boolean;

  /* ------------------------------------------------------------------------ */
  /* Server-driven mode — Task 4.5, D-051 constraint 1                        */
  /*                                                                          */
  /* Every prop below is OPTIONAL and every one of them is inert unless the    */
  /* three paging props are supplied together. With none of them the component */
  /* behaves exactly as it always has: it filters, sorts, searches and slices  */
  /* the array it was handed. That is what the ten non-customer consumers      */
  /* (bank-orders, disbursement, documents, employees, ledger, loans, my-work, */
  /* recycle-bin, settlements, transactions) rely on, and it is pinned by      */
  /* `data-table.test.tsx`.                                                    */
  /*                                                                          */
  /* Supplying `total` + `page` + `onPageChange` switches the table to server  */
  /* mode: `rows` is then ONE PAGE already selected by the API, so it is       */
  /* rendered as given — no second, in-memory filter pass, which would hide    */
  /* rows the server matched on a field the client corpus does not contain and */
  /* leave the pager claiming a total the body contradicts.                    */
  /*                                                                          */
  /* A server-mode consumer must send the SAME `pageSize` it renders with, and */
  /* should supply `onSearchChange`/`onFilterChange` — otherwise the toolbar   */
  /* controls change nothing, because nothing is filtered locally any more.    */
  /* ------------------------------------------------------------------------ */

  /** Row count for the whole result set, from the API's `meta.total`. */
  total?: number;
  /** 1-based page number the consumer currently has loaded. */
  page?: number;
  onPageChange?: (page: number) => void;
  /** Fired on every keystroke; the consumer owns the debounce. */
  onSearchChange?: (value: string) => void;
  /** Fired with the filter's `key` and the chosen option, or `"All"`. */
  onFilterChange?: (key: string, value: string) => void;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  searchText,
  searchPlaceholder = "Search records",
  filters = [],
  onRowClick,
  exportName = "export",
  pageSize = 8,
  toolbarExtra,
  emptyState,
  dense = false,
  total: serverTotal,
  page: serverPage,
  onPageChange,
  onSearchChange,
  onFilterChange,
}: DataTableProps<T>) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState<Record<string, string>>({});
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(1);

  const serverPaged =
    serverTotal !== undefined && serverPage !== undefined && onPageChange !== undefined;

  const filtered = React.useMemo(() => {
    // Server mode: these rows ARE the answer to the query. Filtering them again
    // here would drop rows the API matched on a field `searchText` does not
    // include, and would make the row count disagree with `meta.total`.
    if (serverPaged) return rows;

    const needle = query.trim().toLowerCase();
    let result = rows.filter((row) => {
      const matchesQuery = !needle || searchText(row).toLowerCase().includes(needle);
      const matchesFilters = filters.every((filter) => {
        const selected = active[filter.key];
        return !selected || selected === "All" || filter.value(row) === selected;
      });
      return matchesQuery && matchesFilters;
    });

    if (sortKey) {
      const column = columns.find((col) => col.key === sortKey);
      if (column?.sortValue) {
        result = [...result].sort((a, b) => {
          const left = column.sortValue!(a) ?? "";
          const right = column.sortValue!(b) ?? "";
          if (typeof left === "number" && typeof right === "number") {
            return sortDir === "asc" ? left - right : right - left;
          }
          return sortDir === "asc"
            ? String(left).localeCompare(String(right))
            : String(right).localeCompare(String(left));
        });
      }
    }
    return result;
  }, [serverPaged, rows, query, active, filters, sortKey, sortDir, columns, searchText]);

  const totalPages = Math.max(
    1,
    Math.ceil((serverPaged ? (serverTotal ?? 0) : filtered.length) / pageSize),
  );
  const currentPage = serverPaged
    ? Math.min(Math.max(1, serverPage ?? 1), totalPages)
    : Math.min(page, totalPages);
  const pageRows = serverPaged
    ? filtered
    : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeFilterCount = Object.values(active).filter((v) => v && v !== "All").length;

  /*
   * Sorting is a client-side reorder of the rows in hand. In server mode those
   * rows are one page of a `desc(createdAt)` result the API chose, and there is
   * no `sortBy` parameter to send — so a header that sorted here would reorder
   * 25 rows while presenting itself as ordering the whole table. The affordance
   * is hidden rather than shipped wrong (D-051 constraint 5); real server-side
   * sorting is a follow-up with its own backend change.
   */
  const sortable = !serverPaged;

  function goToPage(next: number) {
    const clamped = Math.min(Math.max(1, next), totalPages);
    if (serverPaged) onPageChange?.(clamped);
    else setPage(clamped);
  }

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  function handleExport() {
    const data = filtered.map((row) => {
      const record: Record<string, string | number> = {};
      columns.forEach((column) => {
        const value = column.exportValue
          ? column.exportValue(row)
          : column.sortValue
            ? (column.sortValue(row) ?? "")
            : String((row as Record<string, unknown>)[column.key] ?? "");
        record[column.header] = value ?? "";
      });
      return record;
    });
    exportCsv(exportName, data);
    /*
     * The export has always written `filtered` — every row the component holds.
     * In server mode that is one page, so the toast says so instead of implying
     * the whole book was written (D-051 constraint 6). A global export needs the
     * server to produce the file and is owned by roadmap 11.9; claiming one here
     * would be the same class of defect this task removes.
     */
    toast.success("Exported", {
      description: serverPaged
        ? `${data.length} rows from the current page saved as ${exportName}.csv`
        : `${data.length} rows saved as ${exportName}.csv`,
    });
  }

  function clearFilters() {
    setActive({});
    setQuery("");
    setPage(1);
    // In server mode the toolbar state lives with the consumer, so clearing has
    // to be reported or the request would keep the abandoned query.
    if (serverPaged) {
      onSearchChange?.("");
      filters.forEach((filter) => onFilterChange?.(filter.key, "All"));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
                onSearchChange?.(event.target.value);
              }}
              placeholder={searchPlaceholder}
              className="pl-9"
              aria-label={searchPlaceholder}
            />
          </div>
          {filters.map((filter) => (
            <Select
              key={filter.key}
              value={active[filter.key] ?? "All"}
              onValueChange={(value) => {
                setActive((prev) => ({ ...prev, [filter.key]: value }));
                setPage(1);
                onFilterChange?.(filter.key, value);
              }}
            >
              <SelectTrigger className="h-9 w-[165px]">
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{filter.label}: All</SelectItem>
                {filter.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          {(activeFilterCount > 0 || query) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="size-3.5" /> Clear
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {toolbarExtra}
          <Badge variant="outline" className="gap-1.5">
            <SlidersHorizontal className="size-3" />
            {filtered.length} of {serverPaged ? serverTotal : rows.length}
          </Badge>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="size-3.5" /> {serverPaged ? "Export page" : "Export CSV"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] card-shadow">
        <Table>
          <TableHeader className="bg-[color-mix(in_oklab,var(--secondary)_70%,transparent)]">
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(column.align === "right" && "text-right", column.className)}
                >
                  {sortable && column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={cn(
                        "inline-flex items-center gap-1 uppercase transition-colors hover:text-[var(--foreground)]",
                        sortKey === column.key && "text-[var(--primary)]",
                      )}
                    >
                      {column.header}
                      <ArrowUpDown className="size-3" />
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => onRowClick?.(row)}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={(event) => {
                  if (onRowClick && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onRowClick(row);
                  }
                }}
                className={cn(
                  onRowClick && "cursor-pointer focus:bg-[var(--secondary)] focus:outline-none",
                  dense && "[&_td]:py-2",
                )}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(column.align === "right" && "text-right", column.className)}
                  >
                    {column.render
                      ? column.render(row)
                      : String((row as Record<string, unknown>)[column.key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!pageRows.length && (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  {emptyState ?? (
                    <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">
                      No records match these filters. Clear them to see everything again.
                    </p>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2.5">
          <p className="text-xs text-[var(--muted-foreground)]">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            {pageWindow(currentPage, totalPages).map((number) => (
              <Button
                key={number}
                variant={currentPage === number ? "default" : "outline"}
                size="icon-sm"
                onClick={() => goToPage(number)}
                aria-label={`Page ${number}`}
              >
                {number}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
