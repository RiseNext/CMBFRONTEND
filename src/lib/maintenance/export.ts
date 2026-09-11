"use client";

import { downloadFile, toCsv } from "@/lib/export";
import {
  BLANK,
  FVR_PARTICULARS,
  FVR_SHEET_HEADERS,
  type FvrParticular,
  type MaintenanceColumn,
  type MaintenanceFormat,
} from "./formats";
import type { FvrRow } from "./types";

/**
 * MANAGER MAINTENANCE EXPORTS. Task MM-1, D-095.
 *
 * ── ONE DEFINITION DRIVES THE SCREEN AND THE FILE ───────────────────────────
 *
 * Nothing here restates a heading. Both builders below take the SAME
 * `MaintenanceFormat` / `FVR_PARTICULARS` objects the screens render from, so
 * the downloaded sheet's columns, their order and their text are the screen's
 * by construction rather than by careful copying (instruction §20).
 *
 * ── THE EXISTING SAFE EXPORT PATH IS REUSED, NOT REPLACED ───────────────────
 *
 * `toCsv` and `downloadFile` come from `lib/export.ts` unchanged, so CSV
 * formula-injection neutralisation still applies to every cell — and it matters
 * here as much as anywhere, because customer names, branch names and remarks
 * are all user-supplied text.
 *
 * ── WHY NOT `DataTable`'s BUILT-IN EXPORT ───────────────────────────────────
 *
 * Three reasons, each of which would corrupt a manager's sheet:
 *
 *   1. it keys its CSV records by `column.header`, so two columns sharing a
 *      heading silently collapse into one;
 *   2. it exports only the rows the component is holding — one page in server
 *      mode — and these sheets must export the whole filtered set;
 *   3. it cannot emit a totals row, which APTS and Payment both end with.
 *
 * `DataTable` is untouched and every existing screen keeps using it.
 */

/**
 * `toCsv` returns `""` for an empty array, which would write a zero-byte file
 * with no heading line at all. A manager who exports an empty month should get
 * the sheet's headings back, not an empty file, so the header row is emitted
 * directly in that case — joined exactly as `toCsv` joins its own header line.
 */
function csvWithHeaders(records: Record<string, string>[], headers: string[]): string {
  return records.length ? toCsv(records, headers) : headers.join(",");
}

/**
 * A horizontal sheet — Transfer, APTS or Payment.
 *
 * `rows` must be the COMPLETE filtered set (the caller fetches with
 * `pageSize=0`), never the page on screen. Exporting a page and labelling it the
 * sheet is the defect D-051 constraint 6 and Task 11.9 exist to prevent.
 */
export function buildSheetCsv<Row>(
  format: MaintenanceFormat<Row>,
  rows: Row[],
): string {
  const headers = format.columns.map((column) => column.header);
  const safe = Array.isArray(rows) ? rows : [];

  const records = safe.map((row, index) => {
    const record: Record<string, string> = {};
    for (const column of format.columns) {
      // The SAME `value()` the screen renders. Not a parallel export function.
      record[column.header] = column.value(row, index);
    }
    return record;
  });

  if (!format.hasTotals) return csvWithHeaders(records, headers);

  /*
   * The totals row, as the APTS and Payment sheets end.
   *
   * Every cell is blank except the totalled column, which is exactly how the
   * manager's sheets present it — the green band carries one figure under
   * `Transfer Amount` and nothing else.
   */
  const totals = totalsRecord(format, safe);
  /*
   * A totals band with nothing in it is noise, not fidelity.
   *
   * `sumColumn` returns blank when no row carried a figure, so an empty sheet —
   * or one whose every amount is null — would otherwise end in a row of bare
   * commas. The manager's sheets carry a total because they have rows to total.
   */
  if (!totals || !Object.values(totals).some((cell) => cell !== "")) {
    return csvWithHeaders(records, headers);
  }

  return csvWithHeaders([...records, totals], headers);
}

/**
 * The totals row as a header-keyed record, or `null` when the format has no
 * totalled column.
 *
 * Summed from the RAW row values rather than from the formatted strings —
 * re-parsing `3,00,000.00` would be a needless round trip through a locale.
 */
export function totalsRecord<Row>(
  format: MaintenanceFormat<Row>,
  rows: Row[],
): Record<string, string> | null {
  const totalled = format.columns.filter((column) => column.total);
  if (!totalled.length || !Array.isArray(rows)) return null;

  const record: Record<string, string> = {};
  for (const column of format.columns) record[column.header] = BLANK;
  for (const column of totalled) {
    record[column.header] = sumColumn(column, rows);
  }
  return record;
}

/**
 * Sums a totalled column by re-reading each row through the column's own
 * `value()` and parsing the grouped string back to a number.
 *
 * That sounds indirect, and it is deliberate: it guarantees the total is the sum
 * of EXACTLY WHAT THE SHEET SHOWS. A total computed from a field the column does
 * not display is how a footer comes to disagree with the rows above it.
 */
function sumColumn<Row>(column: MaintenanceColumn<Row>, rows: Row[]): string {
  let total = 0;
  let seen = 0;
  rows.forEach((row, index) => {
    const text = column.value(row, index);
    if (!text) return;
    const amount = Number(text.replace(/,/g, ""));
    if (!Number.isFinite(amount)) return;
    total += amount;
    seen += 1;
  });
  // No figures at all means no total — not `0.00`, which would assert that the
  // sheet's rows add up to nothing when in fact none carried an amount.
  if (!seen) return BLANK;
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(total);
}

export function exportSheetCsv<Row>(
  format: MaintenanceFormat<Row>,
  rows: Row[],
  filename = `risenext-${format.slug}`,
): void {
  downloadFile(`${filename}.csv`, buildSheetCsv(format, rows));
}

/* ── THE FVR CHECKLIST ─────────────────────────────────────────────────────── */

/**
 * The FVR exports VERTICALLY, because that is what the form is: three columns —
 * `Sl No`, `Particulars`, `Details` — and one row per particular.
 *
 * The serial numbers run 1..13. The supplied form numbers its last three rows
 * `11`, `11`, `12` — a typo in the source document. It is NOT reproduced: a
 * duplicate serial in a machine-generated file is a defect, not fidelity, and
 * `Sl No` is a presentation ordinal (§22).
 */
export function buildFvrCsv(row: FvrRow, particulars = FVR_PARTICULARS): string {
  const [slNo, label, details] = FVR_SHEET_HEADERS;
  const records = particulars.map((particular: FvrParticular, index) => ({
    [slNo]: String(index + 1),
    // The form's second line is part of the particular's wording, so it travels
    // with it rather than being dropped on export.
    [label]: particular.note ? `${particular.label} — ${particular.note}` : particular.label,
    [details]: particular.value(row),
  }));

  return toCsv(records, [...FVR_SHEET_HEADERS]);
}

export function exportFvrCsv(row: FvrRow, filename?: string): void {
  const stem = filename ?? `risenext-fvr-${row.loanCode ?? row.id}`;
  downloadFile(`${stem}.csv`, buildFvrCsv(row));
}
