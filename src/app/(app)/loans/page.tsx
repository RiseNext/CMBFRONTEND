"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleSlash,
  FileText,
  Pencil,
  Plus,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailRow } from "@/components/shared/detail-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { formLevelError, serverFieldErrors } from "@/lib/field-errors";
import {
  buildLoanPatch,
  formFromLoan,
  isEmptyPatch,
  LOAN_EDIT_FIELDS,
  LOAN_PRIORITIES,
  validateLoanForm,
  type LoanEditForm,
} from "@/lib/loan-patch";
import { toast } from "sonner";
import { useReference } from "@/hooks/use-reference";
import { useAuth } from "@/hooks/use-auth";
import { useResource, useRecord, useStats } from "@/hooks/use-api";
import { api, ApiError, errorMessage } from "@/lib/api";
import { num } from "@/lib/types";
import type {
  Bank,
  Customer,
  Loan,
  LoanStatus,
  ServiceProvider,
  Verification,
} from "@/lib/types";

const loanTypes: string[] = [
  "Personal Loan",
  "Business Loan",
  "Gold Loan",
  "Vehicle Loan",
  "Home Loan",
  "Loan Against Property",
];

/** Keeps a keystroke from becoming a request. Copied from `customers/page.tsx:52`. */
function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Rows per request AND per page. The two must agree: `DataTable` divides
 * `meta.total` by the `pageSize` it renders with, so a mismatch would draw a
 * pager for a page count the API never used.
 *
 * TASK 5.8 — this page had **neither** half. `useResource<Loan>("/loans")` was
 * called with no query at all, so the server applied its own default of 25 and
 * sent 25 rows; `DataTable` was passed no `pageSize`, so it fell back to 8 and
 * paged those 25 rows a second time into four client-side pages. The table
 * therefore drew a four-page pager over the first 25 loans in the book and
 * offered no way to reach the twenty-sixth. Both halves are now one constant.
 */
const PAGE_SIZE = 25;

/** The per-control message a 422 leaves on the field it names (D-031). */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] leading-relaxed text-[var(--danger)]">{message}</p>;
}

/**
 * The create dialog's initial values, hoisted to module scope so that the
 * reset on success (TASK 5.1 / BUG-015) restores exactly what the form was
 * first mounted with. Declaring the shape twice invites the two copies to
 * drift, and a "reset" that leaves a stale field behind is the same class of
 * defect as not resetting at all.
 */
/* -------------------------------------------------------------------------- */
/* TASK 5.6 — verification                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The create form's initial values. Hoisted for the same reason
 * `EMPTY_LOAN_FORM` is: the reset after a successful POST restores exactly what
 * the form was mounted with, and a second literal copy would drift.
 *
 * **Four fields, and only four.** `status`, `result`, `requestedAt`,
 * `completedAt` and `handledByBank` are all **derived by the route**
 * (`operations.routes.ts:228-245`) — `handledByBank` is parsed and then
 * immediately overwritten with `required ? false : true`, so a control for it
 * would be a switch whose position the server discards. That is precisely the
 * defect D-059 removed from the create dialog one screen up, and it is not
 * rebuilt here.
 */
const EMPTY_VERIFICATION_FORM = {
  /**
   * Defaults to a third-party request, because that is the path the provider
   * selector exists for. A role that cannot read the provider directory never
   * sees this field and is pinned to `false` — see `VerificationPanel`.
   */
  required: true,
  serviceProviderId: "",
  providerReference: "",
  notes: "",
};

/** The keys this form renders, for D-031's `details` → control mapping. */
const VERIFICATION_FIELDS = [
  "required",
  "serviceProviderId",
  "providerReference",
  "notes",
] as const;

/**
 * The 409 sentence, written here rather than taken from the response.
 *
 * The API answers **two different sentences for the identical situation**:
 * the route's own `conflict("This loan already has a verification record")`
 * (`operations.routes.ts:225`) when it loses the check-then-write race by a
 * wide margin, and the error handler's generic *"That record already exists"*
 * when two requests interleave and the `verifications_loan_unique` index fires
 * instead — that constraint is **absent from `CONSTRAINT_MESSAGES`**
 * (`error-handler.ts:12-21`), so no specific wording exists for it.
 *
 * Branching on the message would therefore work for one of the two paths and
 * silently fail for the other. The panel branches on **409** and states the
 * situation itself; the record it has just re-fetched is the real answer.
 */
const VERIFICATION_CONFLICT_COPY =
  "This loan already has a verification record, so nothing new was created. The record now shown above is the one that is stored.";

const EMPTY_LOAN_FORM = {
  customerId: "",
  // No `bankId`: TASK 5.11 removed the selector that wrote it and the
  // `resolvedBankId` that read it, and `createLoan` has always sent
  // `customer.bankId` instead. Keeping the field would leave a form value
  // nothing writes and nothing sends — the state of affairs that let the
  // discarded selection go unnoticed (D-059).
  loanType: "Personal Loan",
  amount: "500000",
  tenure: "36",
  rate: "13.5",
};

export default function LoansPage() {
  const { bankName, banks, employeeName } = useReference();

  /*
   * TASK 5.4 — the page imported no `useAuth` at all, because nothing on it was
   * gated. Approve and Reject are now, on the permission the route itself
   * enforces (`operations.routes.ts:115` → `PERMISSIONS.requests.approve`).
   * Team Leader and Executive hold `requests.edit` and `requests.create` but
   * NOT `requests.approve` (`lib/permissions.ts:276-279`, `:299-301`), so the
   * two buttons they were shown could only ever have produced a 403.
   *
   * This widens nothing and decides nothing: the guard that counts is still the
   * route's (RULES §5, D-005). Hiding the control matches the server so the
   * screen stops offering an action it knows will be refused.
   */
  const { can } = useAuth();
  const canApprove = can("requests.approve");
  const canEdit = can("requests.edit");
  const { data: customersList } = useResource<Customer>("/customers", { pageSize: 500 });
  const customerName = (id: string | null) =>
    customersList.find((c) => c.id === id)?.name ?? "Unknown";
  /*
   * TASK 5.8 / D-061 — the list is paged, searched and filtered by the API.
   *
   * `useResource<Loan>("/loans")` took no query argument, so **nothing** was
   * ever sent: the box below searched the loaded page in memory, the three
   * dropdowns filtered the loaded page in memory, and both reported their
   * result as though it described the loan book.
   *
   * Six parameters go out now — `page`, `pageSize`, `search`, `status`,
   * `loanType`, `bankId` — and `meta.total` comes back. `priority`,
   * `assignedUserId` and `assignedTeamId` are deliberately NOT sent even though
   * the route accepts them: no control on this screen chooses one, and D-061
   * refuses to invent a filter in order to use a capability.
   *
   * `page` is reset to 1 inside the change handlers, never in an effect —
   * `react-hooks/set-state-in-effect` is an error in this repo, and a filter
   * change that kept the offset would report "no records" for a page that the
   * new result set simply does not reach that far.
   */
  const [page, setPage] = React.useState(1);
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebounced(searchInput, 250);
  const [tableFilters, setTableFilters] = React.useState({
    status: "All",
    loanType: "All",
    bank: "All",
  });

  const chosen = (value: string) => (value === "All" ? undefined : value);

  // The Bank filter offers bank *names*, because that is what the column shows.
  // The API filters on `bankId`, so the choice is mapped back here — the same
  // translation `customers/page.tsx:134-140` makes.
  const bankFilterId = React.useMemo(
    () =>
      tableFilters.bank === "All"
        ? undefined
        : banks.find((bank) => bank.name === tableFilters.bank)?.id,
    [banks, tableFilters.bank],
  );

  const {
    data: rows,
    total,
    loading,
    error,
    refresh,
    setData,
  } = useResource<Loan>("/loans", {
    page,
    pageSize: PAGE_SIZE,
    search: search.trim() || undefined,
    status: chosen(tableFilters.status),
    loanType: chosen(tableFilters.loanType),
    bankId: bankFilterId,
  });

  const [selected, setSelected] = React.useState<Loan | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState({ ...EMPTY_LOAN_FORM });
  const [saving, setSaving] = React.useState(false);

  /*
   * TASK 5.1 / BUG-015 — the in-flight guard is a ref, not the `saving` state.
   *
   * `disabled` on the button and a `saving === false` check both only take
   * effect after a re-render, so two clicks dispatched inside a single React
   * batch would each read `saving === false` and each issue its own POST —
   * two identical loan files against the same customer, which is precisely the
   * impact BUG-015 records. `POST /api/loans` has no idempotency key and no
   * duplicate check, so nothing downstream would collapse them. A ref is
   * written synchronously and closes that window; the state exists only to
   * drive the disabled attribute and the button label.
   *
   * This is request serialization, not client-side duplicate suppression: the
   * second click is dropped because a request is already open, not because its
   * payload looks familiar.
   */
  const savingRef = React.useRef(false);

  const resolvedCustomerId = form.customerId || (customersList[0]?.id ?? "");

  /*
   * TASK 5.11 / D-059 — one lookup feeding both the submitted `bankId` and the
   * read-only Bank line in the dialog. The removed `resolvedBankId` was a
   * second, independent source (`form.bankId || banks[0]?.id`) that the request
   * ignored, which is exactly how the control came to display one bank while
   * the POST carried another.
   */
  const resolvedCustomer = customersList.find((c) => c.id === resolvedCustomerId);


  /* ------------------------------------------------------------------------ */
  /* TASK 5.4 — approve / reject                                              */
  /* ------------------------------------------------------------------------ */

  /**
   * Which decision is in flight, or `null`. Drives the disabled state and the
   * button labels; the guard against a double submit is the ref below.
   */
  const [deciding, setDeciding] = React.useState<"Approved" | "Rejected" | null>(null);
  const [decisionError, setDecisionError] = React.useState<string | null>(null);

  /*
   * The same reasoning as `savingRef` above: `disabled` and a state check both
   * only take effect after a re-render, so two clicks landing in one React
   * batch would each read `deciding === null` and each POST. `/approve` has no
   * idempotency key, and the second request would be answered 422 by the
   * transition machine (`Approved` has no self-loop) — an error raised by our
   * own duplicate, shown to a user who clicked once and got an approval that
   * says it failed.
   */
  const decidingRef = React.useRef(false);

  /**
   * Writes one loan into both places it is displayed — the table row and the
   * open dialog — so an optimistic status, the server's answer and a rollback
   * all land everywhere at once. Guarded on the id, because the dialog may have
   * moved on to another loan while a request was open.
   */
  const applyLoan = React.useCallback(
    (id: string, next: (row: Loan) => Loan) => {
      setData((current) => current.map((row) => (row.id === id ? next(row) : row)));
      setSelected((current) => (current && current.id === id ? next(current) : current));
    },
    [setData],
  );

  /**
   * TASK 5.4 — `POST /api/loans/:id/approve`, which is the **only** client-facing
   * writer of loan status (D-056).
   *
   * What this replaced issued no request whatsoever. It called `refresh()`,
   * set `selected.status` locally and fired *"Marked approved"* — a success
   * message for an approval that never happened, which the very next refresh
   * silently undid. D-004's definition of the defect, exactly.
   *
   * **Optimistic, with a real rollback.** The new status is written before the
   * await so the badge answers the click immediately; if the request fails, the
   * loan the dialog opened on is written back — not a guess at what it used to
   * be, the object itself.
   *
   * **The server's row wins (D-026).** On success the response body replaces the
   * optimistic guess rather than being discarded in favour of the status we
   * asked for. That matters because the two can differ: the route stamps
   * `approvedBy`/`approvedAt`, `updatedAt` and — via `notes` — more than the one
   * field this function set. Reading the answer instead of assuming it is the
   * same rule the team-roster save follows (D-026, and D-031's precedent).
   *
   * **The transition machine is not reimplemented here.** Whether Submitted may
   * go straight to Approved is `loanTransitions`' business
   * (`operations.routes.ts:79-87`); a client-side copy would drift from it and
   * would start refusing edges the server allows. A 422 comes back with the
   * server's own sentence and that sentence is what the user reads.
   *
   * `approvedBy`/`approvedAt` are never sent — the route writes them
   * (`scoped-resource.ts:653`) and a client-supplied approver is not an approval.
   */
  async function decide(loan: Loan, status: "Approved" | "Rejected") {
    if (decidingRef.current) return;
    // Informational, not authoritative. The button is hidden without the
    // permission; this stops a stale render from issuing a doomed request.
    if (!canApprove) return;

    const before = loan;

    decidingRef.current = true;
    setDeciding(status);
    setDecisionError(null);
    applyLoan(loan.id, (row) => ({ ...row, status }));

    try {
      const saved = await api.action<Loan>(`/loans/${loan.id}/approve`, { status });
      const server = saved?.data;

      // D-026 — adopt what was stored, not what was requested.
      if (server) applyLoan(loan.id, () => server);
      refresh();

      const settled: LoanStatus = server?.status ?? status;
      toast.success(`Marked ${settled.toLowerCase()}`, {
        description: `${server?.code ?? before.code} · ${customerName(
          server?.customerId ?? before.customerId,
        )}`,
      });
    } catch (err) {
      // Roll the optimistic write back before anything else, so the badge never
      // sits on a status the server refused.
      applyLoan(loan.id, () => before);

      /*
       * The dialog stays open and usable, and the server's own words are shown
       * in it rather than only in a toast that scrolls away — a 422 from the
       * transition machine explains which move was refused, and that is the
       * whole of the answer. No success is claimed (D-004).
       */
      const message = errorMessage(
        err,
        status === "Approved" ? "Could not approve this loan." : "Could not reject this loan.",
      );
      setDecisionError(message);
      toast.error(status === "Approved" ? "Could not approve" : "Could not reject", {
        description: message,
      });
    } finally {
      decidingRef.current = false;
      setDeciding(null);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* TASK 5.5 — edit a loan                                                   */
  /* ------------------------------------------------------------------------ */

  /**
   * The loan the edit dialog opened on. It is the **diff baseline** as well as
   * the open/closed flag, so the two can never disagree — `buildLoanPatch`
   * compares against exactly the record whose values seeded the boxes.
   */
  const [editing, setEditing] = React.useState<Loan | null>(null);
  const [editForm, setEditForm] = React.useState<LoanEditForm | null>(null);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editFields, setEditFields] = React.useState<Record<string, string>>({});
  const savingEditRef = React.useRef(false);

  /**
   * Seeds the controlled form from the record every time the dialog opens, so
   * an abandoned edit is never carried into the next one.
   *
   * The detail dialog closes as this one opens: they describe the same loan, and
   * stacking two modals leaves the reader unsure which one their Escape key
   * belongs to. A successful save reopens it, showing what was stored.
   */
  function openEdit(loan: Loan) {
    setEditing(loan);
    setEditForm(formFromLoan(loan));
    setEditError(null);
    setEditFields({});
    setSelected(null);
  }

  function closeEdit() {
    setEditing(null);
    setEditForm(null);
    setEditError(null);
    setEditFields({});
  }

  /**
   * TASK 5.5 — `PATCH /api/loans/:id`, with **only the changed fields**.
   *
   * `buildLoanPatch` diffs the form against the loan the dialog opened on, so an
   * untouched field is absent from the body and the server leaves it alone.
   * Sending the whole form back would be accepted and would quietly overwrite
   * whatever a colleague changed in the meantime (**D-052**) — and on this
   * resource it would be worse than on customers, because the numeric columns
   * arrive as strings (`"500000.00"`) and a string comparison would call every
   * one of them changed on every open.
   *
   * `status` and `amountApproved` are not merely omitted: `LoanPatch` cannot
   * express them (**D-056**), and the route answers 422 if anything ever does.
   */
  async function saveEdit() {
    if (!editing || !editForm || savingEditRef.current) return;

    const invalid = validateLoanForm(editForm);
    if (invalid) {
      setEditError(invalid);
      return;
    }

    const patch = buildLoanPatch(editing, editForm);
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
      const saved = await api.update<Loan>(`/loans/${editing.id}`, patch);
      const server = saved?.data;

      // D-026 — the stored row replaces the typed one everywhere it is shown,
      // and the detail dialog reopens on it rather than on the pre-edit values.
      if (server) {
        applyLoan(editing.id, () => server);
        setSelected(server);
      }
      refresh();
      toast.success("Loan updated", {
        description: `${server?.code ?? editing.code} saved.`,
      });
      closeEdit();
    } catch (err) {
      /*
       * The dialog stays open with the typed values intact and the server's own
       * words are shown: 422 issues land on the control that names them,
       * anything else — a 403 for scope, a 404, a dropped connection — on the
       * dialog line (**D-031**). No success is claimed for a request that
       * failed (**D-004**).
       */
      const fallback = errorMessage(err, "Could not save this loan.");
      setEditFields(serverFieldErrors(err, LOAN_EDIT_FIELDS).fields);
      setEditError(formLevelError(err, fallback, LOAN_EDIT_FIELDS));
    } finally {
      savingEditRef.current = false;
      setSavingEdit(false);
    }
  }

  async function createLoan() {
    // First line of the function, before any await: a second click that lands
    // in the same batch as the first sees `true` here and returns.
    if (savingRef.current) return;

    const customer = resolvedCustomer;
    if (!customer) {
      toast.error("Select a customer first");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const created = await api.create<Loan>("/loans", {
        customerId: customer.id,
        // The loan always belongs to the customer's bank; the backend rejects
        // a mismatch, so there is no point offering a free choice here.
        bankId: customer.bankId,
        loanType: form.loanType,
        amountRequested: Number(form.amount) || 0,
        interestRate: Number(form.rate) || 0,
        tenureMonths: Number(form.tenure) || 0,
        status: "Submitted",
        appliedOn: new Date().toISOString(),
      });
      /*
       * BUG-015 — this closed `open`, a second boolean that opened nothing,
       * while the dialog is bound to `createOpen` (`:316` at the time of the
       * report). The create therefore succeeded, the toast fired, and the
       * dialog stayed on screen fully populated — and the natural reaction to
       * a dialog that did not close is to submit again.
       */
      setCreateOpen(false);
      // Cleared so the next application starts from the defaults rather than
      // from the last one's customer, amount, tenure and rate — the other half
      // of the duplicate-submission trap BUG-015 describes.
      setForm({ ...EMPTY_LOAN_FORM });
      refresh();
      toast.success("Loan file created", { description: created.data.code });
    } catch (err) {
      // The dialog stays open and populated so the submission can be corrected
      // and retried, and the server's own message is the only explanation
      // there is. No success is claimed for a request that failed (D-004).
      toast.error("Could not create loan", { description: errorMessage(err) });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const columns: Column<Loan>[] = [
    {
      key: "id",
      header: "Loan",
      sortValue: (row) => row.code,
      render: (row) => (
        <div>
          <p className="numeric font-medium">{row.code}</p>
          <p className="text-[11px] text-[var(--muted-foreground)]">{row.applicationNo}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      sortValue: (row) => customerName(row.customerId),
      render: (row) => (
        <Link
          href={`/customers/${row.customerId}`}
          onClick={(event) => event.stopPropagation()}
          className="font-medium text-[var(--primary)] hover:underline"
        >
          {customerName(row.customerId)}
        </Link>
      ),
      exportValue: (row) => customerName(row.customerId),
    },
    {
      key: "bank",
      header: "Bank",
      sortValue: (row) => bankName(row.bankId),
      render: (row) => bankName(row.bankId),
      exportValue: (row) => bankName(row.bankId),
    },
    {
      // `key` is also DataTable's value fallback — `row[column.key] ?? "—"`
      // (data-table.tsx:377). It was "type"; the field is `loanType`, so every
      // row rendered an em dash. BUG-039. An explicit `render` makes the column
      // independent of the key entirely.
      key: "type",
      header: "Type",
      sortValue: (row) => row.loanType,
      render: (row) => row.loanType || "—",
      exportValue: (row) => row.loanType,
    },
    {
      key: "amountRequested",
      header: "Requested",
      align: "right",
      sortValue: (row) => num(row.amountRequested),
      render: (row) => <span className="numeric">{formatCurrency(num(row.amountRequested))}</span>,
      exportValue: (row) => num(row.amountRequested),
    },
    {
      key: "amountApproved",
      header: "Approved",
      align: "right",
      sortValue: (row) => num(row.amountApproved),
      render: (row) => (
        <span className="numeric font-medium">
          {num(row.amountApproved) ? formatCurrency(num(row.amountApproved)) : "—"}
        </span>
      ),
      exportValue: (row) => num(row.amountApproved),
    },
    {
      key: "interestRate",
      header: "Rate",
      align: "right",
      sortValue: (row) => num(row.interestRate),
      render: (row) => <span className="numeric">{num(row.interestRate)}%</span>,
      exportValue: (row) => num(row.interestRate),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
      exportValue: (row) => row.status,
    },
    {
      key: "appliedOn",
      header: "Applied",
      sortValue: (row) => row.appliedOn,
      render: (row) => formatDate(row.appliedOn),
      exportValue: (row) => row.appliedOn,
    },
  ];

  const approved = rows.filter((row) => ["Approved", "Disbursed"].includes(row.status));
  const rejected = rows.filter((row) => row.status === "Rejected");
  const bookValue = approved.reduce((total, row) => total + num(row.amountApproved), 0);

  return (
    <>
      <PageHeader
        eyebrow="Loan tracking"
        title="Loan applications"
        description="Every application across lenders with sanction amounts, pricing, and current stage."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/bank-orders">Bank orders</Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> New application
            </Button>
          </>
        }
      />

      {/*
        * TASK 5.9 — a failed load must look like a failure.
        *
        * `loading` and `error` were destructured at `:51` and then referenced
        * nowhere in the render. Because `useResource` blanks `data` when the
        * request rejects (`use-api.ts:62-67`), a 403 or a 500 fell straight
        * through to DataTable's ordinary empty state — "No records match these
        * filters" — which reports an empty loan book for a request that never
        * completed, and blames the reader's filters for it. That is D-004 with
        * the failure pointed at the user, and it is the same defect Task 2.10
        * fixed on employees and Task 4.8 on customers (D-031).
        *
        * Same shape as those two: the banner carries the server's own message
        * and a retry that re-issues the request.
        */}
      {error && (
        <div
          data-testid="loans-load-error"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={refresh}>
            Try again
          </Button>
        </div>
      )}

      {/*
        * The stat cards are suppressed on failure, not just the table.
        *
        * Every one of them is derived from `rows`, which the hook has just
        * emptied, so a failed load would otherwise render "0 Applications",
        * "₹0 approved value" and "0 rejected files" as though the book had been
        * read and found empty. A headline number is a stronger claim than an
        * empty grid, not a weaker one — this goes beyond the customers
        * precedent deliberately, because that screen's lead card is a
        * server-supplied `meta.total` and these four are not.
        */}
      {/*
        * TASK 5.8 — and the wording now says which population each number
        * describes (D-051 constraint 7, and the customers precedent at
        * `customers/page.tsx:756-793`).
        *
        * Server paging makes "the loaded rows" a much smaller slice than it used
        * to be, so `"in this book"` on a figure counted from 25 rows became an
        * outright false claim the moment the request started sending `page`.
        * Only the first card can speak for more than the page — it is `meta.total`
        * for the current search and filters, counted by the database. The other
        * three are page sums and say so. **No server aggregate is invented** to
        * make them book-wide; that needs an endpoint nobody has built.
        */}
      {!error && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Applications"
            value={String(total)}
            icon={FileText}
            helper="matching these filters"
          />
          <StatCard
            label="Approved value"
            value={formatCurrency(bookValue, { compact: true })}
            icon={TrendingUp}
            accent="var(--success)"
            helper={`${approved.length} sanctioned on this page`}
            index={1}
          />
          <StatCard
            label="Commission booked"
            value={formatCurrency(rows.reduce((sum, row) => sum + num(row.commission), 0))}
            icon={Wallet}
            accent="var(--info)"
            helper="gross before TDS, this page"
            index={2}
          />
          <StatCard
            label="Rejected files"
            value={String(rejected.length)}
            icon={CircleSlash}
            accent="var(--danger)"
            helper="on this page"
            index={3}
          />
        </div>
      )}

      {/*
        * Three mutually exclusive states, where the page previously had one.
        *
        * The loading branch is guarded on `rows.length === 0` so that a
        * background refresh — `loading` goes true again on every `refresh()` —
        * keeps the existing rows on screen instead of blanking them.
        */}
      {loading && rows.length === 0 ? (
        <div
          data-testid="loans-loading"
          className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 card-shadow"
        >
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 card-shadow">
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            Nothing is shown because the request failed — not because there are
            no loan applications.
          </p>
        </div>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          exportName="risenext-loans"
          /* The same 25 the request asked for. See `PAGE_SIZE`. */
          pageSize={PAGE_SIZE}
          total={total}
          page={page}
          onPageChange={setPage}
          onSearchChange={(value) => {
            setSearchInput(value);
            setPage(1);
          }}
          onFilterChange={(key, value) => {
            setTableFilters((previous) => ({ ...previous, [key]: value }));
            setPage(1);
          }}
          /*
           * TASK 5.8 / D-061 — the promise had to change, and it changes here
           * rather than quietly.
           *
           * The box said *"Search loan ID, application number, or customer"* and
           * matched code + applicationNo + customer name + bank name + loanType
           * in memory, over one loaded page. The server matches `code` and
           * `applicationNo` only (`operations.routes.ts:119`).
           *
           * D-053 puts preservation first, and for customers that was one line —
           * `pan` is a column on `customers`. **Here it is not.** `loans` carries
           * a `customerId` FK and nothing else; the customer's name lives on
           * another table, so keeping the promise would need a JOIN, which is a
           * new search architecture D-053 does not authorise. So the second
           * branch is taken: say what is actually matched.
           *
           * `searchText` is aligned to the identical corpus so the label and the
           * behaviour cannot drift apart again. Bank name and product are not
           * lost as ways to narrow the list — both are dropdown filters, and
           * both are now applied by the server across the whole book rather than
           * across one page.
           */
          searchPlaceholder="Search by loan code or application number"
          searchText={(row) => `${row.code} ${row.applicationNo ?? ""}`}
          filters={[
            {
              key: "status",
              label: "Status",
              options: ["Draft", "Submitted", "Under Review", "Approved", "Disbursed", "Rejected", "Closed"],
              value: (row) => row.status,
            },
            // The key IS the query parameter. `type` was renamed to `loanType`
            // so the dropdown, the state slot and the wire name are one word,
            // rather than a mapping table nobody remembers to update.
            { key: "loanType", label: "Product", options: loanTypes, value: (row) => row.loanType },
            {
              key: "bank",
              label: "Bank",
              options: banks.map((bank) => bank.name),
              value: (row) => bankName(row.bankId),
            },
          ]}
          onRowClick={(row) => setSelected(row)}
        />
      )}

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          // A decision in flight must not be dismissed out from under itself:
          // the POST is already on its way and its answer has to land somewhere.
          if (deciding) return;
          if (!open) {
            setSelected(null);
            setDecisionError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selected.id} · {customerName(selected.customerId)}
                </DialogTitle>
                <DialogDescription>
                  {selected.loanType} with {bankName(selected.bankId)} · application{" "}
                  {selected.applicationNo}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-x-6 sm:grid-cols-2">
                <div>
                  <DetailRow label="Requested" value={formatCurrency(num(selected.amountRequested))} mono />
                  <DetailRow
                    label="Approved"
                    value={num(selected.amountApproved) ? formatCurrency(num(selected.amountApproved)) : "—"}
                    mono
                  />
                  <DetailRow label="Interest rate" value={`${num(selected.interestRate)}%`} mono />
                  <DetailRow label="Tenure" value={`${selected.tenureMonths} months`} mono />
                </div>
                <div>
                  <DetailRow label="EMI" value={num(selected.emi) ? formatCurrency(num(selected.emi)) : "—"} mono />
                  <DetailRow label="Processing fee" value={formatCurrency(num(selected.processingFee))} mono />
                  <DetailRow label="Commission" value={formatCurrency(num(selected.commission))} mono />
                  <DetailRow label="Owner" value={employeeName(selected.assignedUserId)} />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-[var(--secondary)] px-3 py-2">
                <span className="text-xs text-[var(--muted-foreground)]">
                  Applied {formatDate(selected.appliedOn)} · updated {formatDate(selected.updatedAt)}
                </span>
                {/* Wrapped so the status this dialog is showing can be asserted
                    on its own — "Approved" also appears here as the label of the
                    sanctioned-amount row and on the Approve button (TASK 5.4). */}
                <span data-testid="loan-dialog-status">
                  <StatusBadge status={selected.status} />
                </span>
              </div>

              {/*
                * TASK 5.6 — the verification record for this loan.
                *
                * Keyed on the loan id so that opening a different loan mounts a
                * different panel rather than reusing this one's state: the form,
                * the in-flight guard and the fetched record all belong to one
                * loan and must not survive into the next.
                */}
              <VerificationPanel key={selected.id} loan={selected} />

              {decisionError && (
                <p
                  data-testid="loan-decision-error"
                  className="text-[13px] leading-relaxed text-[var(--danger)]"
                >
                  {decisionError}
                </p>
              )}

              <DialogFooter className="sm:justify-between">
                <Button variant="outline" asChild>
                  <Link href={`/customers/${selected.customerId}`}>Open customer</Link>
                </Button>
                {/*
                  * TASKS 5.4 and 5.5 — each control is hidden, not disabled,
                  * without the permission its route requires: `requests.edit`
                  * for Edit (`operations.routes.ts:113`) and `requests.approve`
                  * for the two decisions (`:115`). That is the shape the
                  * customers screen already uses for Delete
                  * (`customers/page.tsx:652`). Nothing is widened — the routes
                  * refuse regardless of what is drawn here (RULES §5) — and for
                  * an Executive, who holds neither, the footer is an honest
                  * read-only view rather than three buttons that all end in 403.
                  */}
                <div className="flex gap-2">
                  {canEdit && (
                    <Button variant="outline" onClick={() => openEdit(selected)}>
                      <Pencil className="size-4" /> Edit
                    </Button>
                  )}
                  {canApprove && (
                    <>
                      <Button
                        variant="destructive"
                        onClick={() => decide(selected, "Rejected")}
                        disabled={deciding !== null}
                      >
                        <CircleSlash className="size-4" />{" "}
                        {deciding === "Rejected" ? "Rejecting..." : "Reject"}
                      </Button>
                      <Button
                        variant="success"
                        onClick={() => decide(selected, "Approved")}
                        disabled={deciding !== null}
                      >
                        <CheckCircle2 className="size-4" />{" "}
                        {deciding === "Approved" ? "Approving..." : "Approve"}
                      </Button>
                    </>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* TASK 5.5 — edit dialog                                             */}
      {/* ------------------------------------------------------------------ */}

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          // A save in flight must not be dismissed out from under itself; the
          // PATCH is already on its way and the answer has to land somewhere.
          if (savingEdit) return;
          if (!open) closeEdit();
        }}
      >
        <DialogContent className="max-w-lg">
          {editing && editForm && (
            <>
              <DialogHeader>
                <DialogTitle>Edit {editing.code}</DialogTitle>
                {/*
                  * The sentence names the boundary rather than describing the
                  * form, because the boundary is the surprising part: `status`
                  * and `amountApproved` are refused by the route with a 422
                  * (D-056) and cannot even be expressed by `LoanPatch`. Saying
                  * "edit the loan" while silently dropping the two fields a user
                  * would most expect to find is how a control comes to look
                  * broken.
                  */}
                <DialogDescription>
                  Only the fields you change are saved. Status and the sanctioned
                  amount are decided by Approve or Reject, not here.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Product</Label>
                  <Select
                    value={editForm.loanType}
                    onValueChange={(value) => setEditForm({ ...editForm, loanType: value })}
                  >
                    <SelectTrigger aria-invalid={Boolean(editFields.loanType)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {loanTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={editFields.loanType} />
                </div>

                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select
                    value={editForm.priority}
                    onValueChange={(value) =>
                      setEditForm({
                        ...editForm,
                        priority: value as LoanEditForm["priority"],
                      })
                    }
                  >
                    <SelectTrigger aria-invalid={Boolean(editFields.priority)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOAN_PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={editFields.priority} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="e-amount">Requested amount</Label>
                  <Input
                    id="e-amount"
                    inputMode="numeric"
                    value={editForm.amountRequested}
                    aria-invalid={Boolean(editFields.amountRequested)}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        amountRequested: event.target.value.replace(/\D/g, ""),
                      })
                    }
                  />
                  <FieldError message={editFields.amountRequested} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="e-rate">Interest rate (%)</Label>
                  <Input
                    id="e-rate"
                    value={editForm.interestRate}
                    aria-invalid={Boolean(editFields.interestRate)}
                    onChange={(event) =>
                      setEditForm({ ...editForm, interestRate: event.target.value })
                    }
                  />
                  <FieldError message={editFields.interestRate} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="e-tenure">Tenure (months)</Label>
                  <Input
                    id="e-tenure"
                    inputMode="numeric"
                    value={editForm.tenureMonths}
                    aria-invalid={Boolean(editFields.tenureMonths)}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        tenureMonths: event.target.value.replace(/\D/g, ""),
                      })
                    }
                  />
                  <FieldError message={editFields.tenureMonths} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="e-due">Due date</Label>
                  <Input
                    id="e-due"
                    type="date"
                    value={editForm.dueDate}
                    aria-invalid={Boolean(editFields.dueDate)}
                    onChange={(event) => setEditForm({ ...editForm, dueDate: event.target.value })}
                  />
                  <FieldError message={editFields.dueDate} />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="e-notes">Notes</Label>
                  <Textarea
                    id="e-notes"
                    rows={3}
                    value={editForm.notes}
                    aria-invalid={Boolean(editFields.notes)}
                    onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
                  />
                  <FieldError message={editFields.notes} />
                </div>
              </div>

              {editError && (
                <p
                  data-testid="loan-edit-error"
                  className="text-[13px] leading-relaxed text-[var(--danger)]"
                >
                  {editError}
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeEdit} disabled={savingEdit}>
                  Cancel
                </Button>
                <Button onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit ? "Saving..." : "Save changes"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New loan application</DialogTitle>
            {/*
              * TASK 5.10 / D-058 — the previous sentence here read "EMI is
              * calculated on submit using the rate and tenure you enter." It
              * was false in every link of the chain: `createLoan` does not send
              * `emi`, the server applies `emi: money.default(0)`
              * (`operations.routes.ts:81`) and stores zero, and the detail
              * dialog above renders "—" forever (`:401`). No EMI is computed
              * anywhere in `backend/src`.
              *
              * It is replaced, not reworded into a promise — and deliberately
              * NOT implemented. An EMI needs an interest formula, a rounding
              * convention and a rate basis that nobody has specified; that is
              * new product arithmetic and belongs to a phase that owns loan
              * mathematics, exactly as D-054 refused disbursal locking.
              *
              * The element itself stays because Radix uses it for
              * `aria-describedby`; what it now says is checkable against
              * `createLoan`, which posts `status: "Submitted"`.
              */}
            <DialogDescription>
              Creates a loan file for the selected customer with status Submitted.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Customer</Label>
              <Select
                value={resolvedCustomerId}
                onValueChange={(value) => setForm({ ...form, customerId: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customersList.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name} · {customer.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/*
              * TASK 5.11 / D-059 — this was a Bank <Select> bound to
              * `resolvedBankId` and writing `form.bankId`. `createLoan` submits
              * `bankId: customer.bankId`, so the selection was discarded, and
              * because `resolvedBankId` fell back to `banks[0]?.id` the control
              * usually *displayed a different bank than the one actually used*.
              * Already graded MISSING at `INTEGRATION_MAP.md:310`.
              *
              * It is removed rather than wired. `assertSameBank`
              * (`operations.routes.ts:34-49`) enforces the customer↔bank
              * pairing, so a free choice could only ever produce a refusal —
              * making it live would be building a control whose every non-
              * default use is an error. No second bank-selection contract is
              * created and backend scoping is untouched.
              *
              * What replaces it is read-only context, driven by
              * `resolvedCustomer` — the same object `createLoan` reads
              * `bankId` from — so the label cannot drift from the payload the
              * way the old control did.
              */}
            <div className="space-y-1.5">
              <Label>Bank</Label>
              <p
                data-testid="loan-bank-readonly"
                className="flex h-9 w-full items-center rounded-md border border-[var(--border)] bg-[var(--secondary)] px-3 text-sm text-[var(--muted-foreground)]"
              >
                {resolvedCustomer ? bankName(resolvedCustomer.bankId) : "Select a customer first"}
              </p>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Set by the customer&rsquo;s bank.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select
                value={form.loanType}
                onValueChange={(value) => setForm({ ...form, loanType: value as string })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {loanTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-amount">Loan amount</Label>
              <Input
                id="l-amount"
                value={num(form.amount)}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value.replace(/\D/g, "") })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-tenure">Tenure (months)</Label>
              <Input
                id="l-tenure"
                value={form.tenure}
                onChange={(event) =>
                  setForm({ ...form, tenure: event.target.value.replace(/\D/g, "") })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-rate">Interest rate (%)</Label>
              <Input
                id="l-rate"
                value={form.rate}
                onChange={(event) => setForm({ ...form, rate: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            {/* Cancel is gated too: closing the dialog mid-flight would leave
                the POST in the air with nothing on screen to report its
                outcome. */}
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={createLoan} disabled={saving}>
              {saving ? "Submitting..." : "Submit to bank"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* TASK 5.6 — the verification panel                                          */
/* -------------------------------------------------------------------------- */

/**
 * The verification section of the loan detail dialog: reads
 * `GET /api/verifications?loanId=…` and, when none exists, creates one through
 * `POST /api/loans/:id/verification`.
 *
 * **It is a component, not a block inside `LoansPage`, and that is load-bearing.**
 * `useResource` initialises `loading` to its `enabled` argument
 * (`use-api.ts:26`) and never blanks `data` when `enabled` goes false. A
 * hook living in the page would therefore (a) start with `loading === false`
 * because no loan is selected at mount, flashing *"No verification recorded"*
 * for one paint before the request it has not issued yet, and (b) keep the
 * previous loan's verification in `data` while the next loan's request is in
 * flight — showing one loan's record under another loan's heading. Mounting
 * fresh per dialog open removes both without touching the shared hook.
 *
 * **`POST /api/verifications` is deliberately not used.** The factory route
 * exists (`operations.routes.ts:268`) and would accept a create, but it has no
 * `beforeWrite`, so it skips `assertSameBank` **and both business rules** — the
 * provider requirement and the one-per-loan check. The loan sub-route is the
 * only writer with the rules attached, so it is the only writer called.
 */
function VerificationPanel({ loan }: { loan: Loan }) {
  /*
   * D-057 / D-4 reconciliation, and the reason this panel is shaped the way it
   * is. The verified grants (`backend/src/lib/permissions.ts:210`, `:247`,
   * `:280-281`, `:305`):
   *
   *   Super Admin  verification.*  + service_providers.*
   *   Admin        verification.*  + service_providers.*
   *   Manager      verification.*  — NO service_providers.view
   *   Team Leader  verification.view + verification.create — NO service_providers.view
   *   Executive    verification.view only
   *
   * So Manager and Team Leader may create a verification but may **not list the
   * providers the server requires one of** when `required` is true. Widening
   * `service_providers.view` to close that gap is what RULES §5 forbids, and
   * inventing a provider-lookup endpoint is backend scope no row owns. The
   * D-049 answer applies unchanged: offer what the role can actually do, and
   * say plainly why the rest is missing.
   */
  const { can } = useAuth();
  const canViewVerification = can("verification.view");
  const canCreateVerification = can("verification.create");
  const canViewProviders = can("service_providers.view");

  /*
   * `loanId` is a real server-side filter — `filterable` on the factory route
   * includes it (`operations.routes.ts:278`) — so this is one loan's record,
   * not the whole table narrowed in the browser.
   */
  const {
    data: verificationRows,
    loading,
    error,
    refresh,
  } = useResource<Verification>("/verifications", { loanId: loan.id }, canViewVerification);

  /*
   * The provider directory. Global rather than bank-scoped, deliberately and
   * on the server's terms (`operations.routes.ts:589-593`): providers are not
   * bank-owned, so feeding a null bank column into the scope filter would hide
   * every row from scoped users.
   *
   * `enabled` is the permission. Without it no request is issued — an
   * affordance that spares the server a guaranteed 403, never the check: the
   * route is the authority (RULES §5, D-005), and the empty array below is
   * what a refusal would produce anyway.
   *
   * The response envelope is `{ data, meta: { count } }` with no `total`
   * (`:607-615`), which `useResource` already tolerates: it falls back to
   * `data.length` (`use-api.ts:60`). Nothing here reads `total`.
   */
  const { data: providerRows } = useResource<ServiceProvider>(
    "/service-providers",
    undefined,
    canViewProviders,
  );

  /**
   * Only Active providers may be chosen. `status` is a plain text column with
   * no route-level filter, so the narrowing is done here — an Inactive provider
   * would be accepted by the server, which is exactly why the list must not
   * offer one.
   */
  const activeProviders = providerRows.filter((provider) => provider.status === "Active");

  /**
   * Guarded on the id even though the component remounts per dialog: a row for
   * some other loan must never be rendered under this loan's heading, whatever
   * the hook hands back.
   */
  const verification = verificationRows.find((row) => row.loanId === loan.id) ?? null;

  const [form, setForm] = React.useState({ ...EMPTY_VERIFICATION_FORM });
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  /*
   * The same reasoning as `savingRef` and `decidingRef` above: `disabled` only
   * takes effect after a re-render, so two clicks inside one React batch would
   * both read `saving === false` and both POST. Here the second POST would come
   * back 409 from the one-verification-per-loan rule — an error raised by our
   * own duplicate, shown to someone who clicked once.
   */
  const savingRef = React.useRef(false);

  /**
   * What to call the provider on a stored record.
   *
   * The name is resolved from the directory when this role can read it. When it
   * cannot, the record's own `providerReference` is shown instead — the raw
   * uuid is not a name, and inventing one would be worse. If neither is
   * available the row says a provider is recorded but unnamed, which is the
   * truth rather than an implied absence.
   */
  function providerLabel(row: Verification): string {
    const match = providerRows.find((provider) => provider.id === row.serviceProviderId);
    if (match) return match.name;
    if (row.providerReference) return row.providerReference;
    if (row.serviceProviderId) return "Recorded — name not available to this role";
    return "—";
  }

  /**
   * TASK 5.6 — `POST /api/loans/:id/verification`.
   *
   * The body carries **four fields and no more**. Everything else on the row is
   * the route's: `status`, `result`, `requestedAt` and `completedAt` are derived
   * from `required`, `customerId`/`bankId` are copied off the loan, and
   * `handledByBank` is parsed and then overwritten (`operations.routes.ts:234`).
   * Sending any of them would be a value the server throws away.
   *
   * `required` is forced to `false` for a role that cannot read the provider
   * directory. That is not a hidden default — the form offers no other option
   * to that role and says why (see the copy below).
   */
  async function recordVerification() {
    // First line, before any await: a second click landing in the same batch
    // sees `true` and returns.
    if (savingRef.current) return;
    // Informational, not authoritative. The form is not rendered without the
    // permission; this stops a stale render from issuing a doomed request.
    if (!canCreateVerification) return;

    const required = canViewProviders ? form.required : false;

    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const created = await api.create<Verification>(`/loans/${loan.id}/verification`, {
        required,
        // Never sent on the bank-handled path: the route stamps
        // `handledByBank: true` there, and a provider on a row that says the
        // bank handled it claims a third party was engaged when none was.
        serviceProviderId: required ? form.serviceProviderId || null : null,
        providerReference: form.providerReference.trim() || null,
        notes: form.notes.trim() || null,
      });

      // Awaited, 2xx, and only then. The panel re-reads rather than trusting
      // the echoed body, so what is shown is what a fresh GET returns (D-026).
      refresh();
      setForm({ ...EMPTY_VERIFICATION_FORM });
      toast.success("Verification recorded", {
        description: created.data?.required
          ? `Third-party verification requested for ${loan.code}.`
          : `Recorded as handled by the bank for ${loan.code}.`,
      });
    } catch (err) {
      /*
       * **Branch on the status. Never on the message.**
       *
       * Only 409 means "one already exists", and the API has two different
       * sentences for it (see `VERIFICATION_CONFLICT_COPY`). Only 400 is the
       * missing-provider rule. A 500 or a dropped connection is neither, and
       * must not be reported as either — that is how an outage comes to be
       * shown to a user as a business rule they cannot satisfy.
       */
      const status = err instanceof ApiError ? err.status : 0;

      if (status === 409) {
        // Someone else got there first — or this tab did, and the answer was
        // lost. Either way the stored record is the interesting object, so it
        // is re-read and rendered. No success is claimed for a create that
        // created nothing (D-004).
        refresh();
        setFormError(VERIFICATION_CONFLICT_COPY);
        toast.error("Verification already recorded", {
          description: "The existing record is shown on the loan.",
        });
        return;
      }

      if (status === 400) {
        /*
         * The provider rule (`operations.routes.ts:216-218`). It is raised as
         * **400 `bad_request`, not 422**, so the response carries **no
         * `details` array** — `serverFieldErrors` would return nothing and the
         * message would be dropped on the floor if this went through the D-031
         * path. It is shown as a form-level line carrying the server's own
         * sentence instead.
         */
        const message = errorMessage(
          err,
          "A service provider is required when third-party verification is requested.",
        );
        setFormError(message);
        toast.error("Could not record verification", { description: message });
        return;
      }

      /*
       * Everything else, including a 422 from the schema — an over-long note, a
       * `serviceProviderId` that is not a uuid — which DOES carry `details` and
       * lands on the control that names it (D-031).
       */
      const fallback = errorMessage(err, "Could not record this verification.");
      setFieldErrors(serverFieldErrors(err, VERIFICATION_FIELDS).fields);
      setFormError(formLevelError(err, fallback, VERIFICATION_FIELDS));
      toast.error("Could not record verification", { description: fallback });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section
      data-testid="loan-verification"
      className="space-y-2 rounded-lg border border-[var(--border)] px-3 py-2.5"
    >
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[var(--muted-foreground)] uppercase">
        <ShieldCheck className="size-3.5" /> Verification
      </h3>

      {!canViewVerification ? (
        /*
         * D-049's shape. All five seeded roles hold `verification.view`, so this
         * branch is reached only by a custom role — but an empty section would
         * tell that role there is no verification on this loan, which nobody
         * here knows. It says what is actually true instead.
         */
        <p
          data-testid="loan-verification-forbidden"
          className="text-[13px] leading-relaxed text-[var(--muted-foreground)]"
        >
          Reading verification records needs the{" "}
          <span className="numeric">verification.view</span> permission, which this
          account does not hold. This is not an empty record — one may exist that is
          not shown here.
        </p>
      ) : loading ? (
        <p
          data-testid="loan-verification-loading"
          className="text-[13px] text-[var(--muted-foreground)]"
        >
          Loading the verification record…
        </p>
      ) : error ? (
        /*
         * A failed request is not an absent record. `useResource` blanks `data`
         * on rejection (`use-api.ts:62-67`), so without this branch a 403 or a
         * 500 would render as "No verification recorded" — the Task 2.10 / 4.8
         * / 5.9 defect, one panel down.
         */
        <div data-testid="loan-verification-error" className="space-y-1">
          <p className="text-[13px] font-medium text-[var(--danger)]">
            The verification record could not be loaded.
          </p>
          <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
            {error} Nothing is shown because the request failed — not because this
            loan has no verification.
          </p>
          <Button variant="outline" size="sm" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : verification ? (
        <div data-testid="loan-verification-record">
          <div className="flex items-center justify-between gap-4 border-b border-dashed border-[var(--border)] py-2">
            <span className="text-xs text-[var(--muted-foreground)]">Status</span>
            {/* Wrapped so this badge can be asserted apart from the loan's own
                status badge — both render the word "Verified"-adjacent text. */}
            <span data-testid="loan-verification-status">
              <StatusBadge status={verification.status} />
            </span>
          </div>
          <DetailRow
            label="Third-party verification"
            value={verification.required ? "Required" : "Not required"}
          />
          <DetailRow
            label="Handled by the bank"
            value={verification.handledByBank ? "Yes" : "No"}
          />
          <DetailRow label="Provider" value={providerLabel(verification)} />
          <DetailRow label="Provider reference" value={verification.providerReference ?? "—"} />
          <DetailRow label="Requested" value={formatDateTime(verification.requestedAt)} />
          <DetailRow label="Completed" value={formatDateTime(verification.completedAt)} />
          <DetailRow label="Result" value={verification.result ?? "—"} />
          <DetailRow label="Notes" value={verification.notes ?? "—"} />
          {/*
            * Shown only where it changes how the line above should be read: the
            * provider column holds an id this role cannot resolve, so the row
            * fell back to the reference. Without this the reader would take a
            * reference string for a company name.
            */}
          {!canViewProviders && verification.serviceProviderId && (
            <p className="pt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
              The provider is shown by its reference. Resolving it to a name needs the{" "}
              <span className="numeric">service_providers.view</span> permission, which
              this account does not hold.
            </p>
          )}
        </div>
      ) : (
        <p
          data-testid="loan-verification-empty"
          className="text-[13px] text-[var(--muted-foreground)]"
        >
          No verification recorded for this loan.
        </p>
      )}

      {/*
        * The create form. Gated on `verification.create`, which Executive does
        * not hold (`permissions.ts:305`) — for that role the panel above is the
        * whole of the feature, and an honest read-only view is the right
        * outcome rather than a form that ends in 403.
        *
        * Hidden once a record exists, because the route refuses a second one
        * with 409 and there is no update path on this screen: `PATCH
        * /api/verifications/:id` exists but needs `verification.edit`, which
        * Team Leader and Executive do not hold, and editing a verification is
        * claimed by no roadmap row.
        */}
      {canViewVerification && canCreateVerification && !verification && !loading && !error && (
        <div data-testid="loan-verification-form" className="space-y-3 pt-1">
          {canViewProviders ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="v-required">Third-party verification required</Label>
                  <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                    Off records the check as carried out by the requesting bank.
                  </p>
                </div>
                <Switch
                  id="v-required"
                  data-testid="verification-required"
                  checked={form.required}
                  onCheckedChange={(checked) => setForm({ ...form, required: checked })}
                />
              </div>

              {/*
                * Rendered only on the path that uses it. Leaving it on screen
                * while `required` is false would be a control whose choice the
                * request discards — the no-op Bank selector D-059 removed from
                * the create dialog, rebuilt two hundred lines away.
                */}
              {form.required && (
                <div className="space-y-1.5" data-testid="verification-provider-field">
                  <Label>Service provider</Label>
                  <Select
                    value={form.serviceProviderId}
                    onValueChange={(value) => setForm({ ...form, serviceProviderId: value })}
                  >
                    <SelectTrigger aria-invalid={Boolean(fieldErrors.serviceProviderId)}>
                      <SelectValue placeholder="Choose a provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeProviders.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name} · {provider.providerType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={fieldErrors.serviceProviderId} />
                  {activeProviders.length === 0 && (
                    /*
                      * A genuinely empty directory, and worded so it cannot be
                      * confused with the permission case below: this account CAN
                      * read the list and the list has no Active entry in it.
                      */
                    <p
                      data-testid="verification-no-providers"
                      className="text-[11px] leading-relaxed text-[var(--muted-foreground)]"
                    >
                      No active service providers are listed. A third-party request
                      cannot be sent without one — ask an administrator to add a
                      provider, or turn this off to record the check as handled by
                      the bank.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            /*
              * THE D-049 CASE, and the crux of this task.
              *
              * Manager and Team Leader hold `verification.create` but not
              * `service_providers.view`, and the server requires a provider
              * whenever `required` is true — so for them the third-party path is
              * closed by the permission model, not by anything on this screen.
              *
              * What must NOT happen here: widening the grant, inventing a
              * provider-lookup endpoint, or rendering an empty dropdown. The
              * last is the subtle one — an empty <Select> would say "there are
              * no providers", which is a claim about the directory that this
              * account is in no position to make.
              */
            <p
              data-testid="verification-no-provider-access"
              className="text-[13px] leading-relaxed text-[var(--muted-foreground)]"
            >
              This account cannot read the service-provider directory, so only the
              bank-handled option is offered here. Listing providers needs the{" "}
              <span className="numeric">service_providers.view</span> permission,
              which only Super Admin and Admin hold — that is a limit on this role,
              not a statement that no providers exist. Recording this verification
              will mark it as carried out by the requesting bank. Ask an
              administrator to raise a third-party request.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="v-reference">Provider reference</Label>
            <Input
              id="v-reference"
              value={form.providerReference}
              aria-invalid={Boolean(fieldErrors.providerReference)}
              onChange={(event) =>
                setForm({ ...form, providerReference: event.target.value })
              }
            />
            <FieldError message={fieldErrors.providerReference} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="v-notes">Notes</Label>
            <Textarea
              id="v-notes"
              rows={2}
              value={form.notes}
              aria-invalid={Boolean(fieldErrors.notes)}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
            <FieldError message={fieldErrors.notes} />
          </div>

          <Button size="sm" onClick={recordVerification} disabled={saving}>
            {saving ? "Recording..." : "Record verification"}
          </Button>
        </div>
      )}

      {formError && (
        <p
          data-testid="loan-verification-form-error"
          className="text-[13px] leading-relaxed text-[var(--danger)]"
        >
          {formError}
        </p>
      )}
    </section>
  );
}
