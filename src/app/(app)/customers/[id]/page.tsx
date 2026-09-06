"use client";

import * as React from "react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Printer,
  Trash2,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailRow } from "@/components/shared/detail-row";
import { PipelineRail } from "@/components/shared/pipeline-rail";
import { Button } from "@/components/ui/button";
// `Badge` was imported for the "Record locked for audit after disbursal" claim
// Task 4.10 removed (D-054). Nothing else on this page renders one.
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate, formatDateTime, maskAccount } from "@/lib/format";
import { initials } from "@/lib/utils";
import { exportCsv } from "@/lib/export";
import { toast } from "sonner";
import { useReference } from "@/hooks/use-reference";
import { useResource, useRecord, useStats } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formLevelError, serverFieldErrors } from "@/lib/field-errors";
import {
  buildCustomerPatch,
  CUSTOMER_EDIT_FIELDS,
  formFromCustomer,
  isEmptyPatch,
  validateCustomerForm,
  type CustomerEditForm,
} from "@/lib/customer-patch";
import { num } from "@/lib/types";
import type {
  AuditLog,
  Bank,
  BankOrder,
  Customer,
  DocumentRecord,
  Loan,
  Transaction,
} from "@/lib/types";

/**
 * The server's message for one field, rendered under its control.
 *
 * Deliberately a local copy of the employees page's four-line component rather
 * than a shared export: this is presentational markup, and the part that must
 * not be duplicated — deciding which issue belongs to which control — already
 * lives in `lib/field-errors.ts` and is imported, per **D-031**.
 */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] leading-relaxed text-[var(--danger)]">{message}</p>;
}

/* ------------------------------------------------------------ audit trail */

/**
 * TASK 4.3 — what the timeline is allowed to say, governed by **D-049**.
 *
 * `audit_logs.changes` is an unredacted column diff. `REDACTED_FIELDS`
 * (`backend/src/services/audit.ts:18-27`) covers Aadhaar and credential
 * material and **nothing else**, so the payload carries `pan`, `mobile`,
 * `email`, `dob`, `address`, `accountNo`, `ifsc`, `cibil` and `monthlyIncome`
 * in the clear (**SEC-017**, P2, still OPEN). Dumping a diff would therefore
 * print an unmasked bank account number on the very page that renders
 * `maskAccount(customer.accountNo)` two tabs away.
 *
 * So the timeline renders **field names only** — never a `from` or a `to`. This
 * map exists to turn a column name into a label; an unmapped key falls through
 * as the key itself, which is still a name and never a value.
 */
const AUDIT_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  fatherName: "Father name",
  motherName: "Mother name",
  dob: "Date of birth",
  gender: "Gender",
  maritalStatus: "Marital status",
  occupation: "Occupation",
  monthlyIncome: "Monthly income",
  mobile: "Mobile",
  altMobile: "Alternate mobile",
  email: "Email",
  address: "Address",
  city: "City",
  state: "State",
  pincode: "Pincode",
  pan: "PAN",
  aadhaarLast4: "Aadhaar",
  kyc: "KYC status",
  cibil: "CIBIL score",
  accountNo: "Account number",
  ifsc: "IFSC",
  branch: "Branch",
  bankId: "Partner bank",
  bankReferenceId: "Bank reference",
  assignedUserId: "Assigned employee",
  assignedTeamId: "Assigned team",
  status: "Status",
  code: "Customer code",
  deletedAt: "Deletion",
};

/** Bookkeeping columns every write touches; listing them tells nobody anything. */
const AUDIT_NOISE_FIELDS = new Set(["id", "createdAt", "createdBy", "updatedAt", "updatedBy"]);

/** The NAMES of the fields an entry touched. Values are never read. */
function changedFieldLabels(entry: AuditLog): string[] {
  const changes = entry.changes;
  if (!changes || typeof changes !== "object") return [];
  return Object.keys(changes)
    .filter((key) => !AUDIT_NOISE_FIELDS.has(key))
    .map((key) => AUDIT_FIELD_LABELS[key] ?? key);
}

/** `"created"` → `"Created"`, `"bulk_imported"` → `"Bulk imported"`. */
function actionLabel(action: string): string {
  const spaced = action.replace(/_/g, " ").trim();
  if (!spaced) return "Recorded";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface TimelineState {
  entries: AuditLog[];
  loading: boolean;
  /**
   * The caller may not read audit logs. Kept as its own flag rather than folded
   * into `error`, because "you are not allowed to see this" and "there is
   * nothing to see" are different facts and D-049 forbids showing the second
   * when the first is true.
   */
  forbidden: boolean;
  /** Any other failure, surfaced with the server's own words. */
  error: string | null;
}

/**
 * Loads the customer's real audit trail.
 *
 * `useResource` is not used here on purpose: it reduces a rejection to a
 * message string, which loses the status, and a 403 would then be
 * indistinguishable from a network failure — the one distinction this tab has
 * to make. It is read, not edited (it has ten other callers), and this hook
 * copies its microtask-deferred `setState` so the effect body stays free of the
 * synchronous updates `react-hooks/set-state-in-effect` rejects.
 */
function useCustomerTimeline(customerId: string, enabled: boolean, permitted: boolean): TimelineState {
  const [state, setState] = React.useState<TimelineState>({
    entries: [],
    loading: enabled && permitted,
    forbidden: false,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;

    if (!enabled || !customerId) {
      void Promise.resolve().then(() => {
        if (!cancelled) setState({ entries: [], loading: false, forbidden: false, error: null });
      });
      return () => {
        cancelled = true;
      };
    }

    /*
     * Three of the five seeded roles hold `customers.view` but not
     * `audit_logs.view` (`permissions.ts:227`), so for them this request is a
     * guaranteed 403. Skipping it spares the server a refusal per page view —
     * but it is an affordance, never the check: the server's own 403 lands in
     * the same state below, so a stale permission list cannot turn a refusal
     * into an apparently empty history. RULES §5 / D-005.
     */
    if (!permitted) {
      void Promise.resolve().then(() => {
        if (!cancelled) setState({ entries: [], loading: false, forbidden: true, error: null });
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.resolve().then(() => {
      if (!cancelled) setState((prev) => ({ ...prev, loading: true, error: null }));
    });

    api
      .list<AuditLog>("/audit-logs", {
        recordType: "customer",
        recordId: customerId,
        pageSize: 50,
      })
      .then((body) => {
        if (cancelled) return;
        setState({ entries: body.data ?? [], loading: false, forbidden: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const forbidden = err instanceof ApiError && err.status === 403;
        setState({
          entries: [],
          loading: false,
          forbidden,
          error: forbidden ? null : errorMessage(err, "Could not load the audit trail."),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, enabled, permitted]);

  return state;
}

export default function CustomerProfilePage() {
  const { bankName, employeeName } = useReference();
  const { user, can } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const customerId = params?.id ?? "";
  const {
    data: customer,
    loading: customerLoading,
    refresh: refreshCustomer,
  } = useRecord<Customer>(customerId ? `/customers/${customerId}` : null);
  const { data: customerLoans } = useResource<Loan>("/loans", { customerId }, Boolean(customerId));
  const { data: customerDocs } = useResource<DocumentRecord>(
    "/documents",
    { customerId },
    Boolean(customerId),
  );
  const { data: customerTxns } = useResource<Transaction>(
    "/transactions",
    { customerId },
    Boolean(customerId),
  );
  const { data: customerOrders } = useResource<BankOrder>(
    "/bank-orders",
    undefined,
    Boolean(customerId),
  );
  const canViewAudit = can("audit_logs.view");
  const timeline = useCustomerTimeline(
    customerId,
    Boolean(customerId) && Boolean(user),
    canViewAudit,
  );

  /* --------------------------------------------------------- edit dialog */

  const [editOpen, setEditOpen] = React.useState(false);
  const [editForm, setEditForm] = React.useState<CustomerEditForm | null>(null);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editFields, setEditFields] = React.useState<Record<string, string>>({});

  /* ------------------------------------------------------- delete dialog */

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  /*
   * The in-flight guards are refs, not the `savingEdit`/`deleting` state.
   *
   * `disabled` on the button and a state check both only take effect after a
   * re-render, so two clicks dispatched inside one React batch would each read
   * `savingEdit === false` and issue their own request — two PATCHes, or two
   * DELETEs where the second answers 404. A ref is written synchronously and
   * closes that window.
   */
  const savingEditRef = React.useRef(false);
  const deletingRef = React.useRef(false);

  /** Seeds the controlled form from the record every time the dialog opens, so
   *  an abandoned edit is never carried into the next one. */
  function openEdit() {
    if (!customer) return;
    setEditForm(formFromCustomer(customer));
    setEditError(null);
    setEditFields({});
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditForm(null);
    setEditError(null);
    setEditFields({});
  }

  /**
   * TASK 4.1 — saves only what changed, to `PATCH /api/customers/:id`.
   *
   * `buildCustomerPatch` diffs the form against the record the dialog opened
   * on, so an untouched field is absent from the body and the server leaves it
   * alone. Re-sending the whole form would be accepted and would quietly
   * overwrite whatever a colleague changed in the meantime (**D-052**).
   */
  async function saveEdit() {
    if (!customer || !editForm || savingEditRef.current) return;

    const invalid = validateCustomerForm(editForm);
    if (invalid) {
      setEditError(invalid);
      return;
    }

    const patch = buildCustomerPatch(customer, editForm);
    if (isEmptyPatch(patch)) {
      // Nothing to save, so nothing is claimed: no request, no success toast.
      closeEdit();
      return;
    }

    setEditError(null);
    setEditFields({});
    savingEditRef.current = true;
    setSavingEdit(true);
    try {
      const saved = await api.update<Customer>(`/customers/${customer.id}`, patch);
      // Reconcile from the server rather than trusting the form: `useRecord`
      // re-fetches the record this page is drawn from, so every tab shows what
      // was actually stored.
      refreshCustomer();
      toast.success("Customer updated", {
        description: `${saved?.data?.name ?? editForm.name.trim()} saved.`,
      });
      closeEdit();
    } catch (err) {
      /*
       * The dialog stays open with the typed values intact, and the server's
       * own words are shown: 422 issues land on the control that names them,
       * anything else — 403 scope, 404, a dropped connection — on the dialog
       * line (**D-031**). No success is claimed for a request that failed
       * (**D-004**).
       */
      const fallback = errorMessage(err, "Could not save this customer.");
      setEditFields(serverFieldErrors(err, CUSTOMER_EDIT_FIELDS).fields);
      setEditError(formLevelError(err, fallback, CUSTOMER_EDIT_FIELDS));
    } finally {
      savingEditRef.current = false;
      setSavingEdit(false);
    }
  }

  function openDelete() {
    setDeleteError(null);
    setDeleteOpen(true);
  }

  /**
   * TASK 4.2 — `DELETE /api/customers/:id`, which soft-deletes into the
   * recycle bin.
   *
   * On 204 the record this page is drawn from no longer exists, so the page
   * leaves rather than refetching: `useRecord` would answer 404, `data` would
   * be null and the component would call `notFound()` on a deletion that
   * actually succeeded.
   */
  async function confirmDelete() {
    if (!customer || deletingRef.current) return;

    setDeleteError(null);
    deletingRef.current = true;
    setDeleting(true);
    try {
      await api.remove(`/customers/${customer.id}`);
      toast.success("Customer moved to recycle bin", {
        description: `${customer.name} is no longer in active lists.`,
      });
      setDeleteOpen(false);
      router.push("/customers");
    } catch (err) {
      // The dialog stays open and usable so the deletion can be retried or
      // abandoned; the server's message is the only explanation there is.
      setDeleteError(errorMessage(err, "Could not delete this customer."));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  if (customerLoading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-[var(--muted-foreground)]">
        Loading customer…
      </div>
    );
  }
  if (!customer) notFound();

  const order = customerOrders.find((item) => item.customerId === customer.id);

  /*
   * TASK 4.3 — the fabricated timeline that stood here is gone.
   *
   * It built three to five events by concatenating `"T10:20:00"` onto values
   * that were already full ISO timestamps, so every date it produced was
   * malformed, and it asserted that documents had been uploaded and a loan
   * submitted to a bank on evidence it never had. The replacement is
   * `timeline`, loaded from `GET /api/audit-logs` above, and it is rendered in
   * the Timeline tab.
   */

  return (
    <>
      <PageHeader
        eyebrow={`Customers / ${customer.id}`}
        title={customer.name}
        description={`${customer.occupation} · ${customer.city}, ${customer.state} · Owned by ${employeeName(customer.assignedUserId)}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/customers">
                <ArrowLeft className="size-4" /> Back
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                exportCsv(`${customer.id}-profile`, [
                  {
                    ID: customer.id,
                    Name: customer.name,
                    Mobile: customer.mobile,
                    Email: customer.email,
                    PAN: customer.pan,
                    Bank: bankName(customer.bankId),
                    KYC: customer.kyc,
                    CIBIL: customer.cibil,
                  },
                ]);
                toast.success("Profile exported");
              }}
            >
              <Download className="size-4" /> Export
            </Button>
            <Button onClick={openEdit}>
              <Pencil className="size-4" /> Edit profile
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <SectionCard title="Profile" description={`Created on ${formatDate(customer.createdAt)}`}>
            <div className="flex items-center gap-3 pb-4">
              <Avatar className="size-12">
                <AvatarFallback className="text-sm">{initials(customer.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-semibold">{customer.name}</p>
                <p className="numeric text-xs text-[var(--muted-foreground)]">{customer.id}</p>
                <div className="mt-1 flex gap-1.5">
                  <StatusBadge status={customer.kyc} />
                  <StatusBadge status={customer.status} />
                </div>
              </div>
            </div>
            <div className="space-y-2 border-t border-[var(--border)] pt-3 text-sm">
              <p className="flex items-center gap-2">
                <Phone className="size-3.5 text-[var(--muted-foreground)]" />
                <span className="numeric">{customer.mobile}</span>
              </p>
              <p className="flex items-center gap-2 truncate">
                <Mail className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
                <span className="truncate">{customer.email}</span>
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--muted-foreground)]" />
                <span className="text-[13px] leading-relaxed">
                  {customer.address}, {customer.city}, {customer.state} — {customer.pincode}
                </span>
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/documents">
                  <Upload className="size-3.5" /> Documents
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info("Sent to printer", { description: "Profile sheet queued." })}
              >
                <Printer className="size-3.5" /> Print
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Credit snapshot" description="Bureau and income position">
            <DetailRow label="CIBIL score" value={customer.cibil} mono />
            <DetailRow label="Monthly income" value={formatCurrency(num(customer.monthlyIncome))} mono />
            <DetailRow label="Occupation" value={customer.occupation} />
            <DetailRow label="Existing loans" value={customerLoans.length} mono />
            <DetailRow
              label="Total exposure"
              value={formatCurrency(
                customerLoans.reduce((total, loan) => total + num(loan.amountApproved), 0),
              )}
              mono
            />
          </SectionCard>

          {order && (
            <SectionCard title="Bank file stage" description={`${bankName(order.bankId)} · ${order.officer}`}>
              <PipelineRail current={order.stage} />
            </SectionCard>
          )}
        </div>

        <Tabs defaultValue="personal">
          <TabsList className="flex-wrap">
            <TabsTrigger value="personal">Personal details</TabsTrigger>
            <TabsTrigger value="banking">Banking details</TabsTrigger>
            <TabsTrigger value="loans">Loan details</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="personal">
            <SectionCard title="Personal details" description="KYC identity captured at onboarding">
              <div className="grid gap-x-8 sm:grid-cols-2">
                <div>
                  <DetailRow label="Full name" value={customer.name} />
                  <DetailRow label="Father name" value={customer.fatherName} />
                  <DetailRow label="Mother name" value={customer.motherName} />
                  <DetailRow label="Date of birth" value={formatDate(customer.dob)} />
                  <DetailRow label="Gender" value={customer.gender} />
                  <DetailRow label="Marital status" value={customer.maritalStatus} />
                </div>
                <div>
                  <DetailRow label="PAN" value={customer.pan} mono />
                  <DetailRow label="Aadhaar" value={customer.aadhaarLast4 ? `•••• •••• ${customer.aadhaarLast4}` : "—"} mono />
                  <DetailRow label="Mobile" value={customer.mobile} mono />
                  <DetailRow label="Alternate mobile" value={customer.altMobile} mono />
                  <DetailRow label="Email" value={customer.email} />
                  <DetailRow label="Assigned employee" value={employeeName(customer.assignedUserId)} />
                </div>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="banking">
            <SectionCard title="Banking details" description="Where disbursals land">
              <div className="grid gap-x-8 sm:grid-cols-2">
                <div>
                  <DetailRow label="Partner bank" value={bankName(customer.bankId)} />
                  <DetailRow label="Account number" value={maskAccount(customer.accountNo)} mono />
                  <DetailRow label="IFSC" value={customer.ifsc} mono />
                </div>
                <div>
                  <DetailRow label="Branch" value={customer.branch} />
                  <DetailRow label="City" value={customer.city} />
                  <DetailRow label="Pincode" value={customer.pincode} mono />
                </div>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="loans">
            <SectionCard
              title="Loan details"
              description={`${customerLoans.length} applications on record`}
              contentClassName="px-0 pb-0"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loan ID</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead className="text-right">EMI</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerLoans.map((loan) => (
                    <TableRow key={loan.id}>
                      <TableCell className="numeric">{loan.id}</TableCell>
                      <TableCell>{bankName(loan.bankId)}</TableCell>
                      <TableCell>{loan.loanType}</TableCell>
                      <TableCell className="numeric text-right">
                        {formatCurrency(num(loan.amountApproved))}
                      </TableCell>
                      <TableCell className="numeric text-right">
                        {num(loan.emi) ? formatCurrency(num(loan.emi)) : "—"}
                      </TableCell>
                      <TableCell className="numeric text-right">{num(loan.interestRate)}%</TableCell>
                      <TableCell>
                        <StatusBadge status={loan.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {!customerLoans.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                        No loan applications yet. Start one from the loans screen.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </SectionCard>
          </TabsContent>

          <TabsContent value="documents">
            <SectionCard
              title="Documents"
              description={`${customerDocs.length} files on the file jacket`}
              action={
                <Button size="sm" variant="outline" asChild>
                  <Link href="/documents">
                    <Upload className="size-3.5" /> Upload
                  </Link>
                </Button>
              }
              contentClassName="px-0 pb-0"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document type</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Uploaded on</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerDocs.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>{doc.docType}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-[var(--primary)]">
                          <FileText className="size-3.5" /> {doc.fileName}
                        </span>
                      </TableCell>
                      <TableCell>{formatDate(doc.createdAt)}</TableCell>
                      <TableCell>{doc.uploadedBy}</TableCell>
                      <TableCell>
                        <StatusBadge status={doc.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {!customerDocs.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                        No documents uploaded for this customer yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </SectionCard>
          </TabsContent>

          <TabsContent value="transactions">
            <SectionCard title="Transactions" description="Money movement tied to this borrower" contentClassName="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerTxns.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell className="numeric text-xs">{txn.reference}</TableCell>
                      <TableCell>{txn.txnType}</TableCell>
                      <TableCell className="numeric text-right">{formatCurrency(num(txn.amount))}</TableCell>
                      <TableCell className="numeric text-right">
                        {num(txn.commission) ? formatCurrency(num(txn.commission)) : "—"}
                      </TableCell>
                      <TableCell>{formatDateTime(txn.occurredAt)}</TableCell>
                      <TableCell>
                        <StatusBadge status={txn.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {!customerTxns.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                        No transactions recorded against this customer.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </SectionCard>
          </TabsContent>

          <TabsContent value="timeline">
            <SectionCard
              title="Audit trail"
              description="Changes recorded against this customer record"
            >
              {timeline.loading ? (
                <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                  Loading the audit trail…
                </p>
              ) : timeline.forbidden ? (
                /*
                 * D-049: `audit_logs.view` is held only by Super Admin and
                 * Admin, while Manager, Team Leader and Executive all hold
                 * `customers.view` and can reach this page. Widening the grant
                 * to fill the tab is what RULES §5 forbids, and rendering an
                 * empty list would say "nothing has happened to this customer",
                 * which nobody here knows. So the tab says what is actually
                 * true: the trail exists and this account may not read it.
                 */
                <div className="space-y-1.5 py-6 text-center">
                  <p className="text-sm font-medium">
                    You do not have permission to view this customer&rsquo;s audit trail.
                  </p>
                  <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                    Reading audit history needs the <span className="numeric">audit_logs.view</span>{" "}
                    permission, which only Super Admin and Admin hold. This is not an empty
                    history — entries may exist that are not shown here. Ask an administrator if
                    you need the trail for this customer.
                  </p>
                </div>
              ) : timeline.error ? (
                <div className="space-y-1.5 py-6 text-center">
                  <p className="text-sm font-medium text-[var(--danger)]">
                    The audit trail could not be loaded.
                  </p>
                  <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                    {timeline.error}
                  </p>
                </div>
              ) : timeline.entries.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                  No audit entries have been recorded against this customer record.
                </p>
              ) : (
                <>
                  <ol className="relative space-y-5 pl-5">
                    <span className="absolute top-1 bottom-1 left-[5px] w-px bg-[var(--border)]" />
                    {timeline.entries.map((entry) => {
                      const fields = changedFieldLabels(entry);
                      return (
                        <li key={entry.id} className="relative">
                          <span className="absolute top-1 -left-5 size-2.5 rounded-full border-2 border-[var(--card)] bg-[var(--primary)]" />
                          <p className="text-[13px] font-medium">{actionLabel(entry.action)}</p>
                          <p className="text-[11px] text-[var(--muted-foreground)]">
                            {formatDateTime(entry.occurredAt)} ·{" "}
                            {entry.actorEmail ?? entry.actorRoleKey ?? "System"}
                          </p>
                          {/*
                           * Field NAMES only — never a `from` or a `to`. The
                           * `changes` payload is an unredacted column diff
                           * carrying PAN, mobile, email, account number and
                           * IFSC (SEC-017, OPEN), and this page masks the
                           * account number two tabs away.
                           */}
                          {fields.length > 0 && (
                            <p className="text-[11px] text-[var(--muted-foreground)]">
                              Fields changed: {fields.join(", ")}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <p className="mt-5 border-t border-[var(--border)] pt-3 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                    Entries recorded directly against this customer record. Loan, document and
                    transaction activity is audited under its own record and is not listed here.
                    Changed values are deliberately withheld.
                  </p>
                </>
              )}
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>

      {/*
        * TASK 4.10 — the "Record locked for audit after disbursal" badge that
        * stood here has been removed (**D-054**). It was false: `PATCH /:id`
        * and `DELETE /:id` (`customers.routes.ts:252-330`) carry
        * `requirePermission`, `idParam.parse`, `isNull(deletedAt)` and
        * `bankScope` and nothing else — no loan-status check exists anywhere in
        * that file, so a disbursed customer is fully editable and fully
        * deletable. No lock is claimed here because none is enforced, and
        * inventing disbursal locking would be a new business rule, not a fix.
        */}
      {can("customers.delete") && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="destructive" size="sm" onClick={openDelete}>
            <Trash2 className="size-3.5" /> Delete customer
          </Button>
        </div>
      )}

      <Dialog
        open={editOpen}
        onOpenChange={(value) => {
          // A save in flight must not be dismissed out from under itself; the
          // request is already on its way and the answer has to land somewhere.
          if (savingEdit) return;
          if (!value) closeEdit();
        }}
      >
        <DialogContent>
          {editForm && (
            <>
              <DialogHeader>
                <DialogTitle>Edit profile</DialogTitle>
                <DialogDescription>
                  Only the fields you change are saved to the customer record. Clearing a box
                  removes the stored value. Aadhaar, bank and assignment are not editable here.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="e-name">Full name</Label>
                  <Input
                    id="e-name"
                    value={editForm.name}
                    aria-invalid={Boolean(editFields.name)}
                    onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                  />
                  <FieldError message={editFields.name} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-mobile">Mobile</Label>
                  <Input
                    id="e-mobile"
                    value={editForm.mobile}
                    aria-invalid={Boolean(editFields.mobile)}
                    onChange={(event) => setEditForm({ ...editForm, mobile: event.target.value })}
                  />
                  <FieldError message={editFields.mobile} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-email">Email</Label>
                  <Input
                    id="e-email"
                    value={editForm.email}
                    aria-invalid={Boolean(editFields.email)}
                    onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                  />
                  <FieldError message={editFields.email} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="e-address">Address</Label>
                  <Input
                    id="e-address"
                    value={editForm.address}
                    aria-invalid={Boolean(editFields.address)}
                    onChange={(event) => setEditForm({ ...editForm, address: event.target.value })}
                  />
                  <FieldError message={editFields.address} />
                </div>
              </div>
              {editError && (
                <p className="text-[13px] leading-relaxed text-[var(--danger)]">{editError}</p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={closeEdit} disabled={savingEdit}>
                  Cancel
                </Button>
                <Button onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(value) => {
          if (deleting) return;
          if (!value) setDeleteOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this customer?</DialogTitle>
            <DialogDescription>
              {customer.name} has {customerLoans.length} linked applications. The profile moves to
              the recycle bin and leaves active lists; ledger entries stay for audit.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-[13px] leading-relaxed text-[var(--danger)]">{deleteError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Keep customer
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
