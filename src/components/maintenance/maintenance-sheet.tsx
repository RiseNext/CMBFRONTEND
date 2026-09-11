"use client";

import * as React from "react";
import { Download, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useMaintenanceSheet } from "@/hooks/use-maintenance-sheet";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  cellText,
  sheetAmount,
  sheetTitleBand,
  type MaintenanceFormat,
} from "@/lib/maintenance/formats";
import { exportSheetCsv, totalsRecord } from "@/lib/maintenance/export";
import type { Area, Branch, Region, SheetRow } from "@/lib/maintenance/types";
import type { Employee } from "@/lib/types";
import { useResource } from "@/hooks/use-api";

/**
 * The shared renderer for the three horizontal manager sheets. Task MM-1, D-095.
 *
 * ── THE MAIN TABLE IS THE MANAGER'S TABLE ───────────────────────────────────
 *
 * Its columns are `format.columns`, in that order, and NOTHING is inserted
 * between them — no id, no status chip, no action column (instruction §19).
 * Technical context lives in the row drawer, never in the sheet.
 *
 * `DataTable` is deliberately not used here; the reasons are recorded in
 * `lib/maintenance/export.ts`. Every existing screen keeps using it unchanged.
 */
export function MaintenanceSheet<Row extends SheetRow>({
  format,
  eyebrow,
  description,
  path,
  renderDrawer,
}: {
  format: MaintenanceFormat<Row>;
  eyebrow: string;
  description: string;
  path: string;
  renderDrawer?: (row: Row, refresh: () => void) => React.ReactNode;
}) {
  const { can } = useAuth();
  const allowed = can("maintenance.view");

  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [regionId, setRegionId] = React.useState("All");
  const [areaId, setAreaId] = React.useState("All");
  const [branchId, setBranchId] = React.useState("All");
  const [managerId, setManagerId] = React.useState("All");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [exporting, setExporting] = React.useState(false);
  const [selected, setSelected] = React.useState<Row | null>(null);

  const pageSize = 50;

  const query = React.useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      regionId: regionId === "All" ? undefined : regionId,
      areaId: areaId === "All" ? undefined : areaId,
      branchId: branchId === "All" ? undefined : branchId,
      assignedUserId: managerId === "All" ? undefined : managerId,
      search: search.trim() || undefined,
      page,
      pageSize,
    }),
    [from, to, regionId, areaId, branchId, managerId, search, page],
  );

  const { rows, summary, meta, loading, error, refresh, fetchAll } = useMaintenanceSheet<Row>(
    path,
    query,
    allowed,
  );

  // The filter dropdowns. Read-only master data, gated on the same permission.
  const { data: regions } = useResource<Region>("/maintenance/regions", undefined, allowed);
  const { data: areas } = useResource<Area>(
    "/maintenance/areas",
    regionId === "All" ? undefined : { regionId },
    allowed,
  );
  const { data: branches } = useResource<Branch>(
    "/maintenance/branches",
    areaId === "All" ? undefined : { areaId },
    allowed,
  );
  // The Manager filter — §25. Backed by `assignedUserId` on the API, which the
  // sheets already resolve MANAGER NAME through.
  const { data: employees } = useResource<Employee>(
    "/users",
    { pageSize: 200 },
    allowed && can("users.view"),
  );

  /*
   * Page is reset from the CHANGE HANDLERS, never from an effect watching the
   * filters — `react-hooks/set-state-in-effect` is an error in this repository
   * and the reports and loans screens document the same choice.
   */
  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  async function handleExport() {
    setExporting(true);
    try {
      // The COMPLETE filtered set, not the page on screen.
      const all = await fetchAll();
      exportSheetCsv(format, all);
      toast.success(`${format.title} sheet downloaded`, {
        description: `${all.length.toLocaleString("en-IN")} rows — the complete sheet, not just this page.`,
      });
    } catch (err) {
      // No file is written on a failure. A partial export reported as complete
      // is the shape D-004 forbids.
      toast.error("Could not export this sheet", { description: errorMessage(err) });
    } finally {
      setExporting(false);
    }
  }

  if (!allowed) {
    return (
      <>
        <PageHeader eyebrow={eyebrow} title={format.title} />
        <SectionCard title="Not available to your role" description="">
          <p className="text-sm text-[var(--muted-foreground)]">
            Your role cannot view the maintenance sheets. It needs{" "}
            <code className="text-[11px]">maintenance.view</code>.
          </p>
        </SectionCard>
      </>
    );
  }

  const totals = format.hasTotals ? totalsRecord(format, rows) : null;
  const totalPages = meta?.totalPages ?? 1;

  const band = sheetTitleBand({
    // The band's date is the range's start — the manager's sheets cover one day.
    date: from ? new Date(from).toISOString() : null,
    sheet: format.title,
    area: areaId === "All" ? null : (areas.find((a) => a.id === areaId)?.name ?? null),
    manager: managerId === "All" ? null : (employees.find((e) => e.id === managerId)?.name ?? null),
  });
  // `sheetTitleBand` always returns at least the sheet name; show it only once a
  // filter gives it something to say.
  const hasBandContext = Boolean(from) || areaId !== "All" || managerId !== "All";

  return (
    <>
      <PageHeader eyebrow={eyebrow} title={format.title} description={description} />

      <SectionCard
        title="Filters"
        description="Everything below reacts to these settings"
        contentClassName="grid gap-3 md:grid-cols-3 xl:grid-cols-6"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              changeFilter(() => {
                setFrom("");
                setTo("");
                setRegionId("All");
                setAreaId("All");
                setBranchId("All");
                setManagerId("All");
                setSearch("");
              })
            }
          >
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor={`${format.slug}-from`}>Date from</Label>
          <Input
            id={`${format.slug}-from`}
            type="date"
            value={from}
            onChange={(event) => changeFilter(() => setFrom(event.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${format.slug}-to`}>Date to</Label>
          <Input
            id={`${format.slug}-to`}
            type="date"
            value={to}
            onChange={(event) => changeFilter(() => setTo(event.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Region</Label>
          <Select
            value={regionId}
            onValueChange={(value) =>
              changeFilter(() => {
                setRegionId(value);
                setAreaId("All");
                setBranchId("All");
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All regions</SelectItem>
              {regions.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Area</Label>
          <Select
            value={areaId}
            onValueChange={(value) =>
              changeFilter(() => {
                setAreaId(value);
                setBranchId("All");
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All areas</SelectItem>
              {areas.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Branch</Label>
          <Select value={branchId} onValueChange={(value) => changeFilter(() => setBranchId(value))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All branches</SelectItem>
              {branches.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Manager</Label>
          <Select
            value={managerId}
            onValueChange={(value) => changeFilter(() => setManagerId(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All managers</SelectItem>
              {employees.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${format.slug}-search`}>Search</Label>
          <Input
            id={`${format.slug}-search`}
            placeholder="Customer, UTR, BT lead id"
            value={search}
            onChange={(event) => changeFilter(() => setSearch(event.target.value))}
          />
        </div>
      </SectionCard>

      <SectionCard
        title={format.title}
        description={
          meta
            ? `${meta.total.toLocaleString("en-IN")} rows${meta.scoped ? " in your banks" : ""}`
            : ""
        }
        action={
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || loading}>
            <Download className="size-3.5" /> {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
      >
        {/*
          * Three branches, never two. `rows` is blanked to [] on a failure, so
          * rendering the table straight through would show "No records" for a
          * 403 or a 500 and blame the reader for it (D-004 / U-4).
          */}
        {/*
          * THE TITLE BAND — reproduced from the Payment screenshot, which heads
          * its sheet `29-08-2026 (Saturday) / APTS /HYDERABAD ( RAMUDU )`.
          *
          * Built from the filters that are ACTUALLY SET. A band naming a date,
          * an area or a manager the operator never chose would be a caption
          * asserting something untrue, so each segment appears only when its
          * filter does, and the band is absent entirely when none is set.
          */}
        {hasBandContext && band ? (
          <p className="pb-3 text-center text-sm font-semibold text-[var(--primary)]">{band}</p>
        ) : null}

        {loading ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</p>
        ) : error ? (
          <p className="py-8 text-center text-sm text-[var(--destructive)]">{error}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {format.columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className={cn(
                        "whitespace-nowrap",
                        column.align === "right" && "text-right",
                      )}
                    >
                      {column.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={format.columns.length}
                      className="py-8 text-center text-sm text-[var(--muted-foreground)]"
                    >
                      No records match these filters
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, index) => (
                    <TableRow
                      key={row.id}
                      onClick={renderDrawer ? () => setSelected(row) : undefined}
                      className={renderDrawer ? "cursor-pointer" : undefined}
                    >
                      {format.columns.map((column) => {
                        const tone = column.tone?.(row);
                        return (
                          <TableCell
                            key={column.key}
                            className={cn(
                              "whitespace-nowrap",
                              column.align === "right" && "text-right tabular-nums",
                              tone === "danger" && "font-medium text-[var(--destructive)]",
                            )}
                          >
                            {/* The SAME `value()` the export writes. */}
                            {cellText(column, row, (page - 1) * pageSize + index)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}

                {/*
                  * The totals band, as the APTS and Payment sheets end.
                  *
                  * TWO figures are shown deliberately. The row total describes
                  * the page on screen; `summary.transferAmountTotal` is the
                  * server's aggregate over the WHOLE filtered set. Printing only
                  * the first under a header that says 2,68,04,900 would be the
                  * page-vs-book defect all over again, so the caption says which
                  * is which.
                  */}
                {totals && rows.length > 0 ? (
                  <TableRow className="bg-[color-mix(in_oklab,var(--success)_16%,transparent)] font-semibold">
                    {format.columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          "whitespace-nowrap",
                          column.align === "right" && "text-right tabular-nums",
                        )}
                      >
                        {totals[column.header] ?? ""}
                      </TableCell>
                    ))}
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}

        {totals && summary.transferAmountTotal && !loading && !error ? (
          <p className="pt-3 text-[11px] text-[var(--muted-foreground)]">
            Page total shown in the band above. Total across all{" "}
            {summary.count.toLocaleString("en-IN")} matching rows:{" "}
            <span className="font-medium tabular-nums">
              {sheetAmount(summary.transferAmountTotal)}
            </span>
          </p>
        ) : null}

        {totalPages > 1 && !loading && !error ? (
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-[var(--muted-foreground)]">
              Page {meta?.page ?? page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      {selected && renderDrawer ? (
        <SectionCard
          title={`Record ${selected.code}`}
          description="Detail and maintenance fields for the selected row"
          action={
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
          }
        >
          {renderDrawer(selected, () => {
            refresh();
            setSelected(null);
          })}
        </SectionCard>
      ) : null}
    </>
  );
}
