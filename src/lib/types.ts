/**
 * API record shapes. These replace the demo interfaces and mirror what the
 * backend returns: UUID `id` for relationships, human-readable `code` for
 * display, camelCase keys, and money as strings (Postgres numeric) so no
 * precision is lost in transit.
 */

/** Role names are display labels now — never a fixed union. */
export type RoleName = string;

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  level: number;
  isSystem: boolean;
  isActive: boolean;
  permissions?: string[];
}

export interface Permission {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string | null;
}

export type LoanStatus =
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Approved"
  | "Disbursed"
  | "Rejected"
  | "Closed";

export type LoanType =
  | "Personal Loan"
  | "Business Loan"
  | "Gold Loan"
  | "Vehicle Loan"
  | "Home Loan"
  | "Loan Against Property";

export type KycStatus = "Verified" | "Pending" | "Rejected";

/** Postgres numeric arrives as a string. Use this at every display site. */
export const num = (value: string | number | null | undefined): number => Number(value ?? 0);

export interface Bank {
  id: string;
  code: string;
  name: string;
  shortName: string;
  vendorId: string | null;
  portalUrl: string | null;
  logoText: string | null;
  accentColor: string | null;
  status: "Active" | "Paused";
  commissionRate: string;
  settlementCycle: string | null;
  spocName: string | null;
  spocPhone: string | null;
  productsOffered: string[];
  onboardedOn: string | null;
  createdAt: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  phone: string | null;
  branch: string | null;
  status: "Active" | "Inactive";
  joinedOn: string | null;
  target: number;
  achieved: number;
  avatarColor: string | null;
  lastLoginAt: string | null;
  /**
   * When an invitation was last **issued** — not when mail was delivered.
   * `null` means never invited. See D-040.
   */
  invitedAt: string | null;
  /** When the employee set their own password through the link. */
  inviteAcceptedAt: string | null;
  roleId: string;
  roleKey: string;
  roleName: string;
  roleLevel: number;
  assignedBanks: string[];
}

export interface Customer {
  id: string;
  code: string;
  bankId: string;
  bankReferenceId: string;
  name: string;
  fatherName: string | null;
  motherName: string | null;
  dob: string | null;
  gender: "Male" | "Female" | "Other" | null;
  maritalStatus: "Single" | "Married" | null;
  occupation: string | null;
  monthlyIncome: string;
  mobile: string;
  altMobile: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  pan: string | null;
  /** Aadhaar is stored hashed. Only the last four digits are ever returned. */
  aadhaarLast4: string | null;
  kyc: KycStatus;
  cibil: number | null;
  accountNo: string | null;
  ifsc: string | null;
  branch: string | null;
  assignedUserId: string | null;
  assignedTeamId: string | null;
  status: "Active" | "Follow Up" | "Closed";
  createdAt: string;
}

export interface Loan {
  id: string;
  code: string;
  applicationNo: string | null;
  customerId: string;
  bankId: string;
  loanType: LoanType | string;
  amountRequested: string;
  amountApproved: string;
  interestRate: string;
  tenureMonths: number;
  emi: string;
  processingFee: string;
  commission: string;
  status: LoanStatus;
  appliedOn: string | null;
  verificationRequired: boolean;
  fundingSourceId: string | null;
  assignedUserId: string | null;
  assignedTeamId: string | null;
  priority: "Low" | "Normal" | "High" | "Urgent";
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Verification {
  id: string;
  loanId: string;
  customerId: string | null;
  bankId: string;
  required: boolean;
  handledByBank: boolean;
  serviceProviderId: string | null;
  providerReference: string | null;
  status: "Pending" | "Requested" | "In Progress" | "Verified" | "Rejected" | "Failed" | "Expired";
  result: string | null;
  requestedAt: string | null;
  completedAt: string | null;
  notes: string | null;
}

export interface ServiceProvider {
  id: string;
  name: string;
  providerType: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: "Active" | "Inactive";
}

export interface FundingSource {
  id: string;
  name: string;
  sourceType: "own_funds" | "bank" | "external";
  bankId: string | null;
  accountRef: string | null;
  status: "Active" | "Inactive";
}

export interface BankOrder {
  id: string;
  code: string;
  loanId: string;
  bankId: string;
  customerId: string;
  submittedOn: string | null;
  sla: string | null;
  stage: "Login" | "Credit Check" | "Field Verification" | "Sanction" | "Disbursal Queue";
  status: "In Progress" | "On Hold" | "Cleared" | "Returned";
  officer: string | null;
  remarks: string | null;
}

export interface Disbursement {
  id: string;
  code: string;
  loanId: string;
  customerId: string;
  bankId: string;
  fundingSourceId: string | null;
  amount: string;
  utr: string | null;
  mode: "NEFT" | "RTGS" | "IMPS";
  disbursedOn: string | null;
  status: "Credited" | "In Transit" | "Failed";
  creditedTo: string | null;
  notes: string | null;
}

export interface Settlement {
  id: string;
  code: string;
  bankId: string;
  period: string;
  cases: number;
  grossCommission: string;
  tds: string;
  netPayable: string;
  status: "Paid" | "Pending" | "Disputed";
  invoiceNo: string | null;
  raisedOn: string | null;
  settledOn: string | null;
}

export interface LedgerEntry {
  id: string;
  code: string;
  entryDate: string;
  voucherNo: string | null;
  particulars: string;
  party: string | null;
  category: "Commission" | "Disbursement" | "Payout" | "Expense" | "Tax";
  bankId: string | null;
  debit: string;
  credit: string;
  balance: string;
  mode: string | null;
}

export interface Transaction {
  id: string;
  code: string;
  customerId: string | null;
  bankId: string;
  loanId: string | null;
  amount: string;
  commission: string;
  txnType: "Disbursement" | "EMI Collection" | "Commission" | "Refund";
  status: "Success" | "Pending" | "Failed";
  reference: string | null;
  occurredAt: string;
}

export interface DocumentRecord {
  id: string;
  customerId: string | null;
  loanId: string | null;
  bankId: string;
  docType: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  /*
   * Task 9.4 — server-generated, never sent by the client (SEC-024).
   *
   * `null` means the row has metadata but no stored file: rows created before
   * Phase 9, or through the JSON create route. The UI uses it to decide whether
   * a download is offered at all, and the server refuses to VERIFY such a row —
   * a document with no file proves nothing.
   */
  storageKey: string | null;
  checksum: string | null;
  status: "Verified" | "Pending" | "Rejected";
  uploadedBy: string | null;
  verifiedBy: string | null;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  leaderId: string | null;
  status: "Active" | "Inactive";
  members?: { teamId: string; userId: string; name: string }[];
}

export interface AuditLog {
  id: number;
  occurredAt: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRoleKey: string | null;
  action: string;
  recordType: string;
  recordId: string | null;
  bankId: string | null;
  summary: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
}

export interface RecycleBinEntry {
  id: string;
  recordType: string;
  recordId: string;
  bankId: string | null;
  label: string;
  deletedAt: string;
  deletedBy: string | null;
  purgeAfter: string;
  daysRemaining: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "danger";
  read: boolean;
  createdAt: string;
  linkHref: string | null;
}

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  actor: string;
  at: string;
  kind: "customer" | "loan" | "document" | "payment" | "system";
}

export interface ImportRowResult {
  rowNumber: number;
  raw: Record<string, string>;
  status: "valid" | "invalid" | "duplicate" | "imported" | "skipped";
  errors: { field: string; message: string }[] | null;
}

export interface ImportPreview {
  batchId: string;
  fileName: string;
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
  preview: ImportRowResult[];
}
