/**
 * MANAGER MAINTENANCE — THE FORMAT DEFINITIONS. Task MM-1, D-095.
 *
 * ── THIS FILE IS THE SINGLE AUTHORITY FOR THE MANAGER-FACING SHEETS ─────────
 *
 * Every heading string, every heading ORDER and every cell's text comes from
 * here, and the screen and the export both read the same objects. That is the
 * whole point: before this, a screen column and an export column were two
 * hand-written lists that drifted the moment someone edited one of them.
 *
 * `maintenance-formats.test.ts` asserts the headings and their order verbatim
 * against the supplied screenshots, and asserts that the export builder and the
 * table renderer consume THESE objects rather than restating them.
 *
 * ── THE WORDING IS THE MANAGER'S, NOT OURS ──────────────────────────────────
 *
 * Transcribed from the four sheets exactly as they are written, including the
 * inconsistencies, because these are the words management reads:
 *
 *   · the Transfer and Payment sheets spell the serial column `SI.NO`;
 *     the FVR and APTS sheets spell it `Sl No`. Both spellings are kept.
 *   · the Transfer sheet is ALL CAPS except `Loan Disbursed YES/NO`.
 *   · APTS heads its last column `Fund Credited Customer`; Payment heads the
 *     same value `Fund Credited to Customer`. Both are kept.
 *   · APTS orders `Transfer Amount` before `Branch Name`; Payment reverses
 *     them. Both orders are kept.
 *
 * Do not "normalise" any of this. If management corrects a heading, change the
 * one string here and the screen, the export and the tests all follow.
 */

import type { AptsRow, FvrRow, PaymentRow, TransferRow } from "./types";

/* ── FORMATTERS ────────────────────────────────────────────────────────────── */

/**
 * Every formatter returns `""` for an absent value — never `0`, never a dash,
 * never a guess.
 *
 * `""` is what the EXPORT must contain, and it is what the manager's own
 * part-filled sheets contain. The screen turns it into the project's `—`
 * placeholder at the point of render (`cellText` below), so there is exactly
 * one text function per column and the two can never disagree.
 */
export const BLANK = "";

/** The project's on-screen placeholder for an absent value. */
export const EMPTY_DISPLAY = "—";

function parts(value: string, options: Intl.DateTimeFormatOptions) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const found = new Intl.DateTimeFormat("en-IN", options).formatToParts(date);
  return (type: Intl.DateTimeFormatPartTypes) => found.find((p) => p.type === type)?.value ?? "";
}

/**
 * `01-07-2026` — the Transfer and Payment sheets' date format.
 *
 * Assembled from `formatToParts` rather than by string-formatting the locale's
 * own output, because `en-IN` renders a numeric date with SLASHES (`01/07/2026`)
 * and the sheets use hyphens.
 */
export function sheetDate(value: string | null | undefined): string {
  if (!value) return BLANK;
  const at = parts(value, { day: "2-digit", month: "2-digit", year: "numeric" });
  if (!at) return BLANK;
  return `${at("day")}-${at("month")}-${at("year")}`;
}

/** `01-Aug-26` — the APTS sheet's date format. */
export function sheetDateShort(value: string | null | undefined): string {
  if (!value) return BLANK;
  const at = parts(value, { day: "2-digit", month: "short", year: "2-digit" });
  if (!at) return BLANK;
  return `${at("day")}-${at("month")}-${at("year")}`;
}

/** `10:50 AM` / `1:01 PM` — no leading zero on the hour, upper-case meridiem. */
export function sheetTime(value: string | null | undefined): string {
  if (!value) return BLANK;
  const at = parts(value, { hour: "numeric", minute: "2-digit", hour12: true });
  if (!at) return BLANK;
  return `${at("hour")}:${at("minute")} ${at("dayPeriod").toUpperCase().replace(/\./g, "")}`;
}

/** `01-08-2026 (10:50 AM)` — the APTS sheet's Fund Credited format. */
export function sheetDateTime(value: string | null | undefined): string {
  if (!value) return BLANK;
  const day = sheetDate(value);
  const time = sheetTime(value);
  return day && time ? `${day} (${time})` : BLANK;
}

/**
 * `3,00,000.00` — Indian lakh/crore grouping with exactly two decimals and NO
 * currency symbol, which is how every amount on the four sheets is written.
 *
 * `formatCurrency` in `lib/format.ts` cannot produce this: it prefixes `₹` and
 * pins `maximumFractionDigits: 0`, so it would render `₹3,00,000` and silently
 * drop the paise. That helper is unchanged and still used everywhere else.
 *
 * Money crosses the wire as a STRING (Postgres numeric, D-068). A non-finite or
 * absent value formats as blank rather than `0.00` — a zero we do not have is a
 * figure we invented.
 */
export function sheetAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return BLANK;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return BLANK;
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/* ── COLUMN SHAPE ──────────────────────────────────────────────────────────── */

export interface MaintenanceColumn<Row> {
  /** Stable identifier. Never displayed; used as a React key and by tests. */
  key: string;
  /** The manager's heading, VERBATIM. This is what the export writes. */
  header: string;
  /**
   * The cell's text, for BOTH the screen and the export. One function, so the
   * downloaded sheet and the screen can never show different values.
   *
   * `index` is the zero-based position in the returned ordering and exists only
   * for the serial-number column.
   */
  value: (row: Row, index: number) => string;
  align?: "left" | "right";
  /** Summed into the totals row. Only `Transfer Amount` is, on APTS and Payment. */
  total?: boolean;
  /**
   * Optional emphasis for the screen. Styling only — it never changes the text,
   * so it cannot affect the export.
   */
  tone?: (row: Row) => "danger" | undefined;
}

export interface MaintenanceFormat<Row> {
  /** Route segment and export file stem. */
  slug: string;
  /** The section label used in the UI. */
  title: string;
  columns: readonly MaintenanceColumn<Row>[];
  /** Whether the sheet ends in a totals row, as APTS and Payment do. */
  hasTotals: boolean;
}

/** The screen's rendering rule: blank becomes the project's em dash. */
export function cellText<Row>(
  column: MaintenanceColumn<Row>,
  row: Row,
  index: number,
): string {
  return column.value(row, index) || EMPTY_DISPLAY;
}

/** The serial number. Derived from the returned ordering — instruction §22
 *  forbids a database sequence for a presentation field. */
const serial = <Row,>(header: string): MaintenanceColumn<Row> => ({
  key: "slNo",
  header,
  value: (_row, index) => String(index + 1),
  align: "left",
});

/* ── FORMAT B — TRANSFER / DISBURSEMENT ───────────────────────────────────── */

export const TRANSFER_FORMAT: MaintenanceFormat<TransferRow> = {
  slug: "transfer",
  title: "Transfer / Disbursement",
  hasTotals: false,
  columns: [
    serial("SI.NO"),
    { key: "date", header: "DATE", value: (r) => sheetDate(r.date) },
    { key: "customerName", header: "CUSTOMER NAME", value: (r) => r.customerName ?? BLANK },
    { key: "customerMobile", header: "MOBILE NUMBER", value: (r) => r.customerMobile ?? BLANK },
    { key: "regionName", header: "REGION NAME", value: (r) => r.regionName ?? BLANK },
    { key: "areaName", header: "AREA NAME", value: (r) => r.areaName ?? BLANK },
    { key: "branchName", header: "BRANCH", value: (r) => r.branchName ?? BLANK },
    { key: "btLeadId", header: "BT LEAD ID", value: (r) => r.btLeadId ?? BLANK },
    { key: "managerName", header: "MANAGER NAME", value: (r) => r.managerName ?? BLANK },
    {
      key: "loanDisbursed",
      header: "Loan Disbursed YES/NO",
      /*
       * Derived from the LOAN's status, not the disbursement's.
       *
       * The manager's own sample row reads `YES` with a blank UTR, and in this
       * CRM a loan becomes `Disbursed` the moment a disbursement is recorded
       * while the UTR arrives later — so `loans.status` reproduces that row and
       * `disbursements.status = 'Credited'` would have printed `NO` for it.
       *
       * Blank when the loan status is unknown: `NO` is an assertion, and an
       * absent record is not one (D-004).
       */
      value: (r) => (r.loanStatus ? (r.loanStatus === "Disbursed" ? "YES" : "NO") : BLANK),
    },
    {
      key: "transferAmount",
      header: "TRANSFER AMOUNT",
      value: (r) => sheetAmount(r.transferAmount),
      align: "right",
    },
    { key: "utr", header: "UTR NUMBER", value: (r) => r.utr ?? BLANK },
    { key: "remark", header: "REMARK", value: (r) => r.remark ?? BLANK },
  ],
};

/* ── FORMAT C — APTS ──────────────────────────────────────────────────────── */

export const APTS_FORMAT: MaintenanceFormat<AptsRow> = {
  slug: "apts",
  title: "APTS",
  hasTotals: true,
  columns: [
    serial("Sl No"),
    { key: "date", header: "Date", value: (r) => sheetDateShort(r.date) },
    { key: "customerName", header: "Customer Name", value: (r) => r.customerName ?? BLANK },
    {
      key: "transferAmount",
      header: "Transfer Amount",
      value: (r) => sheetAmount(r.transferAmount),
      align: "right",
      total: true,
    },
    { key: "branchName", header: "Branch Name", value: (r) => r.branchName ?? BLANK },
    {
      key: "fundCreditedAt",
      /*
       * The APTS sheet heads this column WITHOUT the word "to". The Payment
       * sheet includes it. Both spellings are reproduced as written — see the
       * file header.
       */
      header: "Fund Credited Customer",
      /** Blank unless the money actually landed; the API nulls it otherwise. */
      value: (r) => sheetDateTime(r.fundCreditedAt),
    },
  ],
};

/* ── FORMAT D — PAYMENT ───────────────────────────────────────────────────── */

export const PAYMENT_FORMAT: MaintenanceFormat<PaymentRow> = {
  slug: "payment",
  title: "Payment",
  hasTotals: true,
  columns: [
    serial("SI.NO"),
    { key: "date", header: "Date", value: (r) => sheetDate(r.date) },
    { key: "customerName", header: "Customer Name", value: (r) => r.customerName ?? BLANK },
    { key: "branchName", header: "Branch Name", value: (r) => r.branchName ?? BLANK },
    {
      key: "transferAmount",
      header: "Transfer Amount",
      value: (r) => sheetAmount(r.transferAmount),
      align: "right",
      total: true,
    },
    {
      key: "fundCreditedAt",
      header: "Fund Credited to Customer",
      /** Time only on this sheet — the date is already its own column. */
      value: (r) => sheetTime(r.fundCreditedAt),
    },
    {
      key: "paymentStatus",
      header: "Payment Status",
      /** Blank until a manager records it. Never defaulted to either value. */
      value: (r) => r.paymentStatus ?? BLANK,
      // The sheet prints "Not Received" in red. Emphasis only — the text is
      // unchanged, so the export is unaffected.
      tone: (r) => (r.paymentStatus === "Not Received" ? "danger" : undefined),
    },
  ],
};

/* ── FORMAT A — FVR CHECKLIST ─────────────────────────────────────────────── */

/**
 * The FVR is the odd one out and deliberately so: it is a VERTICAL per-customer
 * form, not a list. The screenshot's table is three columns — `Sl No`,
 * `Particulars`, `Details` — with one row per particular.
 *
 * So its definition is a list of PARTICULARS rather than of columns, and the
 * export writes it the same way round.
 */
export const FVR_SHEET_HEADERS = ["Sl No", "Particulars", "Details"] as const;

/** Reproduced verbatim from the supplied form, including its own strapline. */
export const FVR_DOCUMENT_TITLE = "FIELD VERIFICATION REPORT (FVR) CHECKLIST";
export const FVR_COMPANY_NAME = "Sharvika Financial Services Pvt Ltd";
export const FVR_COMPANY_STRAPLINE = "We Belive You Belive";

export interface FvrParticular {
  key: string;
  /** The manager's wording, verbatim. */
  label: string;
  /** The form's own second line, where it has one. */
  note?: string;
  value: (row: FvrRow) => string;
  /** True for the three signature lines, which the UI must not style as a
   *  completed or approved state. */
  signature?: boolean;
}

export const FVR_PARTICULARS: readonly FvrParticular[] = [
  { key: "customerName", label: "Customer Name", value: (r) => r.customerName ?? BLANK },
  { key: "loanAmount", label: "Loan Amount", value: (r) => sheetAmount(r.loanAmount) },
  {
    key: "takeoverFromLender",
    // The screenshot parenthesises this; the written brief did not. The
    // screenshot is the manager-facing source of truth.
    label: "Takeover From (Existing Lender Name)",
    value: (r) => r.takeoverFromLender ?? BLANK,
  },
  {
    key: "fvrDoneBy",
    label: "FVR Done By (Name & Designation)",
    /** The form asks for one line; the CRM stores name and designation apart so
     *  either can be reported on. Joined only for display. */
    value: (r) =>
      [r.fvrDoneByName, r.fvrDoneByDesignation].filter(Boolean).join(" — ") || BLANK,
  },
  {
    key: "customerProfile",
    label: "Customer Profile (Occupation / Business / Employment)",
    value: (r) => r.customerProfile ?? BLANK,
  },
  {
    key: "houseConfirmation",
    label: "House Confirmation (Owned / Rented)",
    value: (r) => r.houseConfirmation ?? BLANK,
  },
  { key: "annualIncome", label: "Annual Income", value: (r) => sheetAmount(r.annualIncome) },
  {
    key: "cholaRelationship",
    label: "Any Existing Relationship with Chola (Yes / No)",
    note: "If yes, specify details outstanding loan amount",
    /** The answer and, when it is Yes, the details the form asks for. */
    value: (r) =>
      [r.cholaRelationship, r.cholaOutstandingDetails].filter(Boolean).join(" — ") || BLANK,
  },
  {
    key: "newKycCustomer",
    // Spaced exactly as the form spaces it.
    label: "New KYC /Customer (Yes / No)",
    value: (r) => r.newKycCustomer ?? BLANK,
  },
  { key: "remarks", label: "Remarks (if Any)", value: (r) => r.remarks ?? BLANK },
  /*
   * THE THREE SIGNATURE LINES.
   *
   * They render the text somebody typed and nothing else. There is no
   * electronic-signature workflow in this product, so the UI must never show a
   * tick, a "Signed" badge, or any styling that reads as an executed signature —
   * `signature: true` exists so the renderer can be sure not to.
   */
  {
    key: "zensifyRmSignature",
    label: "Zensify RM Signature",
    value: (r) => r.zensifyRmSignature ?? BLANK,
    signature: true,
  },
  {
    key: "sharvikaRmSignature",
    label: "Sharvika RM Signature",
    value: (r) => r.sharvikaRmSignature ?? BLANK,
    signature: true,
  },
  {
    key: "cholaSign",
    label: "Chola RM/BM/ARBM Sign",
    value: (r) => r.cholaSign ?? BLANK,
    signature: true,
  },
];

/** Every format, for the tests and the nav. */
export const MAINTENANCE_FORMATS = {
  transfer: TRANSFER_FORMAT,
  apts: APTS_FORMAT,
  payment: PAYMENT_FORMAT,
} as const;
