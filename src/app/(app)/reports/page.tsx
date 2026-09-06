"use client";

import * as React from "react";
import { FileSpreadsheet, FileText, Filter, RotateCcw, Table2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SectionCard } from "@/components/layout/section-card";
import { TrendChart } from "@/components/charts/trend-chart";
import { LoanStatusChart } from "@/components/charts/loan-status-chart";
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
import { formatCurrency, formatDate } from "@/lib/format";
import { exportCsv, exportTallyXml, downloadFile } from "@/lib/export";
import { toast } from "sonner";
import { useReference } from "@/hooks/use-reference";
import { useResource, useRecord, useStats } from "@/hooks/use-api";
import { useReport, type ReportRow } from "@/hooks/use-report";
import { api, errorMessage } from "@/lib/api";
import { num } from "@/lib/types";
import type { Bank, Customer, Employee, Loan } from "@/lib/types";

/**
 * `YYYY-MM-DD` in LOCAL time, which is what a `<input type="date">` produces.
 *
 * `toISOString().slice(0,10)` would be wrong here: it converts to UTC first, so
 * for a user in IST (+05:30) every loan created before 05:30 local would be
 * filed under the previous day. Off-by-one-day errors in a lender's report are
 * not cosmetic.
 */
function toDateKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value.slice(0, 10) : "";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export default function ReportsPage() {
  const { bankName, banks, employeeName, employees } = useReference();
  const { data: customersList } = useResource<Customer>("/customers", { pageSize: 500 });
  const customerName = (id: string | null) =>
    customersList.find((c) => c.id === id)?.name ?? "Unknown";
  /*
   * A RELATIVE WINDOW, DEFAULTING TO THIS FINANCIAL YEAR TO DATE — Task 11.2.
   *
   * The defaults were hardcoded `2024-01-05` → `2024-05-31`, so the report
   * opened on a window that excluded the current year entirely. Computed once
   * at mount, not per render, so the range does not shift under the user
   * mid-session.
   *
   * The Indian financial year starts 1 April, which is the window a DSA
   * actually reconciles against.
   */
  const [defaultFrom, defaultTo] = React.useMemo(() => {
    const now = new Date();
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return [`${fyStartYear}-04-01`, toDateKey(now)];
  }, []);

  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);
  const [bank, setBank] = React.useState("All");
  const [employee, setEmployee] = React.useState("All");
  const [status, setStatus] = React.useState("All");

  /*
   * THE SERVER COMPUTES THIS NOW — Task 11.3.
   *
   * Until this change the page fetched `/loans` capped at 500 and filtered in a
   * `useMemo`. Task 11.1 fixed that memo's missing dependency and 11.2 fixed its
   * date comparison, but neither could fix the cap: **loan 501 was invisible**,
   * and every total was a sum of a sample presented as a sum of the book.
   *
   * `summary` below is aggregated by the database over the WHOLE filtered set,
   * so the tiles no longer describe only what happened to be fetched.
   */
  /** Why a figure cannot be shown, or `undefined` when it can. D-004/D-049. */
  const bankId = bank === "All" ? undefined : banks.find((b) => b.name === bank)?.id;
  const assignedUserId =
    employee === "All" ? undefined : employees.find((e) => e.name === employee)?.id;

  const {
    rows,
    summary,
    meta,
    loading,
    error,
    forbidden,
    fetchAll,
  } = useReport({
    from,
    to,
    bankId,
    assignedUserId,
    status: status === "All" ? undefined : status,
    pageSize: 500,
  });

  /*
   * Honest state, not a blank report — D-004 / D-049.
   *
   * `/api/reports/loans` is gated on `reports.view`, which **Executive does not
   * hold**. Rendering zeroes for a refusal is the U-4 defect one screen over.
   */
  /*
   * THE TREND IS REAL — Task 11.5.
   *
   * `monthlyTrend` was a hardcoded `[]` and the chart rendered permanently
   * blank with no empty state, so it looked like a period with no business
   * rather than a feature that did not exist. `/api/reports/trend` buckets by
   * month in SQL.
   */
  const { data: trendRows } = useResource<{
    month: string;
    cases: number;
    disbursed: string;
    commission: string;
  }>("/reports/trend");

  const monthlyTrend = trendRows.map((r) => ({
    month: r.month,
    logins: r.cases,
    disbursed: num(r.disbursed),
    commission: num(r.commission),
  }));

  const loanStatusBreakdown = () =>
    rows.reduce<Record<string, number>>((acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    }, {});

  const unavailable = forbidden
    ? "Your role cannot view reports"
    : error
      ? "Could not load this report"
      : loading
        ? "Loading…"
        : undefined;

  const toExportRow = (loan: ReportRow, index: number) => ({
    "Sr No": index + 1,
    Customer: customerName(loan.customerId),
    Bank: bankName(loan.bankId),
    "Loan Type": loan.loanType,
    Amount: num(loan.amountApproved) || num(loan.amountRequested),
    Status: loan.status,
    Employee: employeeName(loan.assignedUserId),
    Commission: num(loan.commission),
    "Applied On": (loan.appliedOn ?? loan.createdAt),
  });

  /** The rows currently on screen — one page of the report. */
  const exportRows = rows.map(toExportRow);

  /*
   * EXPORTS FETCH THE WHOLE RESULT SET — Task 11.9.
   *
   * Every export used to write whatever the component happened to hold, which
   * in server-paged mode is one page. `DataTable`'s toast was honest about that
   * (D-051 constraint 6) but the capability was still missing: the file a user
   * took to their accountant was a page of a report, labelled as the report.
   *
   * `fetchAll()` asks the server for every matching row (`pageSize=0`). The
   * server refuses past its own ceiling rather than truncating, so a refusal
   * surfaces as an error toast instead of a short file — the D-004 direction.
   */
  const [exporting, setExporting] = React.useState(false);

  async function withAllRows(
    label: string,
    write: (all: ReturnType<typeof toExportRow>[]) => void,
  ) {
    setExporting(true);
    try {
      const all = await fetchAll();
      write(all.map(toExportRow));
      toast.success(`${label} downloaded`, {
        description: `${all.length.toLocaleString("en-IN")} rows — the complete report, not just this page.`,
      });
    } catch (err) {
      // No file is written on a failure. A partial export reported as complete
      // is the shape D-004 forbids.
      toast.error(`Could not export ${label.toLowerCase()}`, { description: errorMessage(err) });
    } finally {
      setExporting(false);
    }
  }

  /*
   * HONEST LABELLING, NOT A REAL WORKBOOK — Task 11.4, first half.
   *
   * This writes an **HTML table** and names it `.xls`. Excel opens it, which is
   * why it survived this long, but it is not a spreadsheet: no types, no
   * formulas, no sheets, and Excel shows a "the file format does not match"
   * warning. Calling the button "Excel" and toasting "Excel exported" was a
   * control claiming an outcome it did not achieve (D-004).
   *
   * The real `.xlsx` is Task 11.4's second half and belongs on the server —
   * `exceljs` is already a backend dependency, used by the importer. Until then
   * the button says what it does. Nothing about the OUTPUT changed here; only
   * the claim did.
   */
  function exportHtmlTable() {
    void withAllRows("Table", (allRows) => writeHtmlTable(allRows));
  }

  function writeHtmlTable(exportRows: ReturnType<typeof toExportRow>[]) {
    const header = Object.keys(exportRows[0] ?? { Report: "empty" });
    const body = exportRows
      .map((row) => header.map((key) => String((row as Record<string, unknown>)[key] ?? "")))
      .map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
      .join("");
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body><table border="1"><thead><tr>${header
      .map((cell) => `<th>${cell}</th>`)
      .join("")}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    // Still an HTML table named `.xls`, and still labelled as one — the real
    // `.xlsx` is Task 11.4's second half. What changed here is COMPLETENESS.
    downloadFile("risenext-loan-report.xls", html, "application/vnd.ms-excel");
  }

  /*
   * A PRINT VIEW, AND IT NOW SAYS SO — Task 11.4, first half.
   *
   * This opens a window and calls `window.print()`. It produces no PDF: what
   * the user gets depends entirely on what they choose in the browser's print
   * dialog, and they may cancel it. The old toast said **"PDF ready"** the
   * instant the dialog opened — a success claimed before, and independent of,
   * any outcome.
   */
  function openPrintView() {
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Popup blocked", { description: "Allow popups to generate the PDF." });
      return;
    }
    const header = Object.keys(exportRows[0] ?? { Report: "empty" });
    win.document.write(`<html><head><title>Rise Next loan report</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:28px;color:#0f1c30}
        h1{font-size:18px;margin:0 0 4px}
        p{font-size:12px;color:#5c7291;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th{background:#eef2f8;text-align:left;padding:6px;border:1px solid #dfe5ee}
        td{padding:6px;border:1px solid #dfe5ee}
      </style></head><body>
      <h1>Rise Next Banking Services — Loan report</h1>
      <p>${formatDate(from)} to ${formatDate(to)} · ${exportRows.length} records</p>
      <table><thead><tr>${header.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead>
      <tbody>${exportRows
        .map(
          (row) =>
            `<tr>${header
              .map((key) => `<td>${String((row as Record<string, unknown>)[key] ?? "")}</td>`)
              .join("")}</tr>`,
        )
        .join("")}</tbody></table></body></html>`);
    win.document.close();
    win.print();
    // Not `toast.success` — nothing has succeeded. The print dialog is open and
    // the user has not chosen anything yet.
    toast.info("Print view opened", {
      description: "Choose “Save as PDF” in the print dialog to keep a copy.",
    });
  }

  function reset() {
    setFrom(defaultFrom);
    setTo(defaultTo);
    setBank("All");
    setEmployee("All");
    setStatus("All");
    toast.info("Filters cleared");
  }

  /*
   * From the SERVER's aggregate, not from `rows` — Task 11.3.
   *
   * Summing the fetched page would reintroduce exactly the defect this task
   * removes: a total that describes the page rather than the book, with nothing
   * to distinguish the two.
   */
  const totalValue = num(summary.approvedValue) || num(summary.requestedValue);
  const totalCommission = num(summary.commission);
  const approvalRate = summary.count
    ? Math.round((summary.approvedCount / summary.count) * 100)
    : 0;

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Reports and export"
        description="Slice the book by period, lender, employee, or status — then download it as CSV, Tally XML, or an HTML table."
      />

      <SectionCard
        title="Report filters"
        description="Everything below reacts to these settings"
        contentClassName="grid gap-3 md:grid-cols-3 xl:grid-cols-6"
        action={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="r-from">From</Label>
          <Input id="r-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-to">To</Label>
          <Input id="r-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Bank</Label>
          <Select value={bank} onValueChange={setBank}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All banks</SelectItem>
              {banks.map((item) => (
                <SelectItem key={item.id} value={item.name}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Employee</Label>
          <Select value={employee} onValueChange={setEmployee}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All employees</SelectItem>
              {employees.map((item) => (
                <SelectItem key={item.id} value={item.name}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All statuses</SelectItem>
              {["Draft", "Submitted", "Under Review", "Approved", "Disbursed", "Rejected", "Closed"].map(
                (item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        {/*
          * The Apply button is GONE — Task 11.1, and the sweep in
          * `no-unbacked-success.test.tsx` is what named it.
          *
          * Before 11.1 it was the only thing that recomputed the filter memo,
          * because `loans` was missing from the dependency array. With that
          * fixed the memo tracks every input live, so the button had no work
          * left to do — it raised `toast.success("Filters applied")` for an
          * application that had already happened, which is a control claiming
          * an action it did not perform (D-004).
          *
          * The count it used to report is already on the "Records" tile and in
          * the table caption, both of which are live. Reset stays: clearing
          * five filters at once is real work.
          */}
        <div className="flex items-end">
          <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
            Filters apply as you change them.
          </p>
        </div>
      </SectionCard>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Records"
          value={summary.count.toLocaleString("en-IN")}
          icon={Table2}
          helper="in this report"
          unavailable={unavailable}
        />
        <StatCard
          label="Report value"
          value={formatCurrency(totalValue, { compact: true })}
          icon={FileSpreadsheet}
          accent="var(--success)"
          helper="sanctioned or requested"
          index={1}
          unavailable={unavailable}
        />
        <StatCard
          label="Commission"
          value={formatCurrency(totalCommission)}
          icon={FileText}
          accent="var(--info)"
          helper="gross for this slice"
          index={2}
        />
        <StatCard
          label="Approval rate"
          value={`${approvalRate}%`}
          icon={Filter}
          accent="var(--warning)"
          helper="of files in range"
          index={3}
          unavailable={unavailable}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Volume trend" description="Disbursals against commission" className="xl:col-span-2">
          <TrendChart rows={monthlyTrend} />
        </SectionCard>
        <SectionCard title="Status mix" description="Whole book, all periods">
          <LoanStatusChart data={loanStatusBreakdown()} />
        </SectionCard>
      </div>

      <SectionCard
        title="Loan report"
        description={
          unavailable ??
          `${summary.count.toLocaleString("en-IN")} records from ${formatDate(from)} to ${formatDate(to)}` +
            (meta && !meta.complete ? ` — showing the first ${rows.length}` : "")
        }
        contentClassName="px-0 pb-0"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="success"
              size="sm"
              disabled={exporting || Boolean(unavailable)}
              onClick={exportHtmlTable}
            >
              HTML table
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting || Boolean(unavailable)}
              onClick={() =>
                void withAllRows("CSV", (allRows) =>
                  exportCsv("risenext-loan-report", allRows),
                )
              }
            >
              CSV
            </Button>
            <Button variant="destructive" size="sm" onClick={openPrintView}>
              Print
            </Button>
            <Button
              variant="navy"
              size="sm"
              disabled={exporting || Boolean(unavailable)}
              onClick={() =>
                void withAllRows("Tally XML", (allRows) =>
                  exportTallyXml(
                    "risenext-loan-report-tally",
                    allRows.map((row) => ({
                      date: row["Applied On"],
                      narration: `${row.Customer} · ${row["Loan Type"]}`,
                      party: row.Bank,
                      amount: row.Commission,
                    })),
                  ),
                )
              }
            >
              Tally XML
            </Button>
          </div>
        }
      >
        <Table>
          <TableHeader className="bg-[color-mix(in_oklab,var(--secondary)_70%,transparent)]">
            <TableRow>
              <TableHead>Sr</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Bank</TableHead>
              <TableHead>Loan type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((loan, index) => (
              <TableRow key={loan.id}>
                <TableCell className="numeric text-[var(--muted-foreground)]">{index + 1}</TableCell>
                <TableCell className="font-medium">{customerName(loan.customerId)}</TableCell>
                <TableCell>{bankName(loan.bankId)}</TableCell>
                <TableCell>{loan.loanType}</TableCell>
                <TableCell className="numeric text-right">
                  {formatCurrency(num(loan.amountApproved) || num(loan.amountRequested))}
                </TableCell>
                <TableCell>
                  <StatusBadge status={loan.status} />
                </TableCell>
                <TableCell>{employeeName(loan.assignedUserId)}</TableCell>
                <TableCell className="numeric text-right">
                  {num(loan.commission) ? formatCurrency(num(loan.commission)) : "—"}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-[var(--muted-foreground)]">
                  Nothing matched this range. Widen the dates or clear a filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </SectionCard>
    </>
  );
}
