/**
 * Row shapes returned by `/api/maintenance/*`. Task MM-1, D-095.
 *
 * These mirror the explicit projections in
 * `CMBBACKEND/src/modules/maintenance.routes.ts` — `sheetColumns` and
 * `fvrColumns`. Money arrives as a STRING (Postgres numeric, D-068) and every
 * value the CRM may not know is nullable, because a maintenance sheet shows a
 * blank rather than a guess.
 */

/** Postgres `numeric` over the wire. */
type Money = string | null;
/** ISO-8601 timestamp over the wire. */
type Timestamp = string | null;

/**
 * The Transfer, APTS and Payment sheets are three views of ONE projection —
 * they differ only in which columns they render and in what order. One row type
 * therefore backs all three, which is why a value can never mean two things
 * across the three sheets.
 */
export interface SheetRow {
  id: string;
  code: string;
  /** `coalesce(disbursed_on, created_at)` — the sheets' `DATE` / `Date`. */
  date: Timestamp;
  customerId: string;
  customerName: string | null;
  customerMobile: string | null;
  regionName: string | null;
  areaName: string | null;
  branchName: string | null;
  btLeadId: string | null;
  managerName: string | null;
  /** Drives `Loan Disbursed YES/NO`. The status itself, so the derivation stays
   *  visible rather than being baked into a string on the server. */
  loanStatus: string | null;
  transferAmount: Money;
  utr: string | null;
  remark: string | null;
  /** The disbursement's own financial state. Never shown as `Payment Status`. */
  disbursementStatus: string | null;
  /**
   * `Fund Credited to Customer` — when the money reached the customer.
   *
   * Non-null ONLY for a `Credited` disbursement; the server returns null
   * otherwise, including for a `Failed` one whose `approved_at` is stamped.
   */
  fundCreditedAt: Timestamp;
  /** Manager maintenance. Null until somebody records it. Never a default. */
  paymentStatus: string | null;
}

export type TransferRow = SheetRow;
export type AptsRow = SheetRow;
export type PaymentRow = SheetRow;

/** One FVR checklist — a `verifications` row joined to its loan and customer. */
export interface FvrRow {
  id: string;
  loanId: string;
  customerId: string;
  bankId: string;
  loanCode: string | null;
  customerName: string | null;
  customerMobile: string | null;
  /** `amount_approved` when sanctioned, else `amount_requested`. */
  loanAmount: Money;
  /** `customers.occupation`. */
  customerProfile: string | null;
  verificationStatus: string | null;
  providerName: string | null;

  /* The checklist particulars. All nullable, all blank until recorded. */
  fvrDate: Timestamp;
  takeoverFromLender: string | null;
  fvrDoneByName: string | null;
  fvrDoneByDesignation: string | null;
  houseConfirmation: string | null;
  annualIncome: Money;
  cholaRelationship: string | null;
  cholaOutstandingDetails: string | null;
  newKycCustomer: string | null;
  /** `verifications.notes`, shown as "Remarks (if Any)". */
  remarks: string | null;
  /** Free text. No signature workflow exists; these authorise nothing. */
  zensifyRmSignature: string | null;
  sharvikaRmSignature: string | null;
  cholaSign: string | null;
}

export interface MaintenanceMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  complete: boolean;
  scoped: boolean;
}

export interface SheetResponse<Row> {
  data: Row[];
  summary: { count: number; transferAmountTotal?: string };
  meta: MaintenanceMeta;
}

export interface Region {
  id: string;
  name: string;
  status: string;
}

export interface Area {
  id: string;
  regionId: string;
  regionName: string;
  name: string;
  status: string;
}

export interface Branch {
  id: string;
  areaId: string;
  areaName: string;
  regionId: string;
  regionName: string;
  bankId: string | null;
  bankName: string | null;
  name: string;
  status: string;
}
