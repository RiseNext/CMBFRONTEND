"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { StatCard } from "@/components/shared/stat-card";
import { CustomerImportDialog } from "@/components/shared/customer-import-dialog";

import { formatCurrency, formatDate } from "@/lib/format";
import { initials } from "@/lib/utils";
import { toast } from "sonner";
import { useReference } from "@/hooks/use-reference";
import { useAuth } from "@/hooks/use-auth";
import { useResource } from "@/hooks/use-api";
import { api, apiRequest, errorMessage } from "@/lib/api";
import { num } from "@/lib/types";
import type { Customer, Loan } from "@/lib/types";

/** Keeps a keystroke from becoming a request. Mirrors `layout/topbar.tsx`. */
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
 */
const PAGE_SIZE = 25;

/**
 * The result of the advisory Bank Reference ID check — Task 4.6.
 *
 * `unchecked` is a first-class state, not an error: the check is advisory, so a
 * 404, a 500 or a dropped connection means *we do not know*, and "we do not
 * know" must never be drawn as either answer (D-004).
 */
type ReferenceCheck =
  | { state: "idle" | "checking" | "available" | "unchecked" }
  | {
      state: "taken";
      message: string;
      customerCode: string | null;
      /** The reference contains `_` or `%`; see `checkBankReference`. */
      wildcard: boolean;
    };

/**
 * The `{ existingCustomerCode }` a 409 from `GET /customers/check/reference`
 * carries — read by SHAPE, never by status alone (D-031).
 *
 * `details` is `unknown` on `ApiError` and is a different shape on every branch
 * of the server's error handler; anything that is not a string here yields
 * `null` and the caller falls back to the server's own message.
 */
function existingCustomerCode(error: unknown): string | null {
  const details = (error as { details?: unknown } | null | undefined)?.details;
  if (typeof details !== "object" || details === null) return null;
  const code = (details as { existingCustomerCode?: unknown }).existingCustomerCode;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

export default function CustomersPage() {
  const router = useRouter();

  const { can } = useAuth();
  const { bankName, banks, employeeName, employees } = useReference();

  /*
   * TASK 4.5 — the list is paged, searched and filtered by the API.
   *
   * `search` used to be `React.useState("")` with **no setter** (`:58`), which
   * is why `?search=` was never sent however much was typed into the box; the
   * table then filtered the first 100 rows in memory and called it a search.
   * Everything below is sent to `GET /api/customers`, which already reads
   * `page`/`pageSize`/`search`/`bankId`/`status` and returns `meta.total`
   * (`customers.routes.ts:128-176`); `kyc` is the filter D-051 constraint 4
   * added alongside `status`.
   *
   * The page is reset to 1 in the change handlers rather than in an effect —
   * `react-hooks/set-state-in-effect` is an error in this repo, and a filter
   * change that kept the offset would show "no records" for a page that exists.
   */
  const [page, setPage] = React.useState(1);
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebounced(searchInput, 250);
  const [tableFilters, setTableFilters] = React.useState({
    kyc: "All",
    bank: "All",
    status: "All",
  });

  const selected = (value: string) => (value === "All" ? undefined : value);

  // The Bank filter offers bank *names*, because that is what the column shows.
  // The API filters on `bankId`, so the choice is mapped back here.
  const bankFilterId = React.useMemo(
    () =>
      tableFilters.bank === "All"
        ? undefined
        : banks.find((bank) => bank.name === tableFilters.bank)?.id,
    [banks, tableFilters.bank],
  );

  /*
   * TASK 4.8 — `loading` and `error` were never destructured.
   *
   * `useResource` blanks `data` when the request rejects (`use-api.ts:62-67`),
   * so a failed load fell straight through to the table's "No customers match
   * this view" empty state: the page reported an empty database for an outcome
   * the request never achieved (D-004). The three states are distinguished
   * below exactly as the employees screen distinguishes them (D-031).
   */
  const {
    data: rows,
    total,
    loading,
    error: loadError,
    refresh,
  } = useResource<Customer>("/customers", {
    page,
    pageSize: PAGE_SIZE,
    search: search.trim() || undefined,
    status: selected(tableFilters.status),
    bankId: bankFilterId,
    kyc: selected(tableFilters.kyc),
  });

  const { data: allLoans } = useResource<Loan>("/loans", {
    pageSize: 500,
  });

  const loansForCustomer = React.useCallback(
    (customerId: string) =>
      allLoans.filter((loan) => loan.customerId === customerId),
    [allLoans],
  );

  const [open, setOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [form, setForm] = React.useState({
    name: "",
    mobile: "",
    email: "",
    pan: "",
    city: "Hyderabad",
    bankId: "",
    bankReferenceId: "",
    assignedTo: "",
    monthlyIncome: "45000",
  });

  const resolvedBankId =
    form.bankId || banks[0]?.id || "";

  const resolvedAssignedTo =
    form.assignedTo || employees[0]?.id || "";

  /* -------------------------------------------------------------------------- */
  /* Bank Reference ID pre-flight check — Task 4.6                              */
  /* -------------------------------------------------------------------------- */

  const [referenceCheck, setReferenceCheck] =
    React.useState<ReferenceCheck>({ state: "idle" });

  // A late answer to an abandoned question must not overwrite a newer one — the
  // failure mode being a stale "already used" attached to a different reference.
  const referenceCheckId = React.useRef(0);

  /**
   * Asks `GET /api/customers/check/reference` whether this reference is free
   * for the selected bank. **Advisory only.** It never blocks a create, never
   * disables the save button, and a failure is reported as "not checked":
   * `customers_bank_reference_unique` is the authority and always was.
   *
   * `apiRequest` rather than `api.get`: this route answers `{ available: true }`
   * and **not** the `{ data }` envelope every other GET uses, so `api.get` would
   * hand back `{ data: undefined }` (`customers.routes.ts:336-370`). The import
   * dialog reaches for the same primitive for the same reason
   * (`customer-import-dialog.tsx:15`).
   *
   * Two disagreements with the database are handled rather than hidden:
   *
   *   - The route matches with `ilike(bankReferenceId, input)` while the unique
   *     index is `upper()` equality. `_` and `%` in the input are therefore
   *     **wildcards** to the check and literals to the index, so a reference
   *     containing either can be reported as taken when the index would accept
   *     it. `ilike` is a superset of exact match, so the error can only ever be
   *     a false *taken* — never a false *available* — and the message says so
   *     instead of asserting a duplicate the database has not refused.
   *
   *   - Demo mode answers this path from `lib/demo/api.ts`. Anything else that
   *     404s — a proxy, an older backend — lands in `unchecked`, because "the
   *     endpoint is not there" is not evidence that a reference is taken.
   */
  async function checkBankReference() {
    const reference = form.bankReferenceId.trim();
    const id = (referenceCheckId.current += 1);

    if (!reference || !resolvedBankId) {
      setReferenceCheck({ state: "idle" });
      return;
    }

    setReferenceCheck({ state: "checking" });

    try {
      const body = await apiRequest<{ available?: boolean }>(
        "/customers/check/reference",
        {
          query: {
            bankId: resolvedBankId,
            bankReferenceId: reference,
          },
        },
      );

      if (id !== referenceCheckId.current) return;

      // Only an explicit `available: true` is an answer. A body of another
      // shape is a response we do not understand, and guessing either way
      // would be inventing a result.
      setReferenceCheck(
        body?.available === true
          ? { state: "available" }
          : { state: "unchecked" },
      );
    } catch (error) {
      if (id !== referenceCheckId.current) return;

      const status = (error as { status?: number } | null | undefined)?.status;

      if (status === 409) {
        setReferenceCheck({
          state: "taken",
          message: errorMessage(
            error,
            "This Bank Reference ID is already used for the selected bank",
          ),
          customerCode: existingCustomerCode(error),
          wildcard: /[%_]/.test(reference),
        });

        return;
      }

      setReferenceCheck({ state: "unchecked" });
    }
  }

  /** Any edit invalidates the previous answer; a stale one would describe text
   *  that is no longer in the box. */
  function forgetReferenceCheck() {
    referenceCheckId.current += 1;
    setReferenceCheck({ state: "idle" });
  }

  /*
   * TASK 4.11 — the "Draft application" generator is gone (D-055).
   *
   * It built an HTML document out of the CREATE-DIALOG form state, which sits
   * at its initial values unless that dialog was opened. Clicked from the page
   * header it therefore emitted an applicant named "Customer"
   * (`form.name.trim() || "Customer"`), whichever bank happened to be first in
   * `banks[0]`, and a monthly income of the hardcoded default 45,000 — inside a
   * file whose own body read "Use this draft for manual verification and
   * re-upload the filled form when needed".
   *
   * The toast was true; a file really was produced. The defect was the
   * artefact: invented values presented as one customer's details, in a
   * document offered for verification and onboarding. Nothing replaces it —
   * the PRD specifies no draft application, and no document generation may be
   * built in Phase 4.
   */

  /*
   * TASK 4.4 — "Re-upload written form" is gone, with its handler and its
   * hidden file input.
   *
   * It read a File out of the input, discarded it, and reported *"<name> has
   * been queued for verification"*. There is no queue: no request was issued,
   * no `FormData` was built, and this repository has **no file storage at all**
   * — object storage is OPEN-2 and the document upload endpoints are Phase 9.
   * A control that reports an outcome the system cannot achieve is exactly what
   * D-004 and RULES §4 forbid, and building the upload here was explicitly out
   * of scope. Removed rather than disabled, so nothing is left implying a file
   * is being processed somewhere.
   */

  /* -------------------------------------------------------------------------- */
  /* Delete customer                                                            */
  /* -------------------------------------------------------------------------- */

  async function deleteCustomer(id: string) {
    if (
      !window.confirm(
        "Move this customer to the recycle bin?",
      )
    ) {
      return;
    }

    try {
      await api.remove(`/customers/${id}`);

      refresh();

      toast.success(
        "Customer moved to recycle bin",
      );
    } catch (err) {
      toast.error("Could not delete", {
        description: errorMessage(err),
      });
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Add customer                                                               */
  /* -------------------------------------------------------------------------- */

  async function addCustomer() {
    if (
      !form.name.trim() ||
      form.mobile.length < 10
    ) {
      toast.error("Missing details", {
        description:
          "Enter the full name and a 10 digit mobile number.",
      });

      return;
    }

    if (!resolvedBankId) {
      toast.error("Bank is required", {
        description:
          "Please configure at least one bank before adding a customer.",
      });

      return;
    }

    if (!form.bankReferenceId.trim()) {
      toast.error("Bank Reference ID is required", {
        description:
          "It must be unique within the selected bank.",
      });

      return;
    }

    setSaving(true);

    try {
      const created =
        await api.create<Customer>("/customers", {
          bankId: resolvedBankId,
          bankReferenceId:
            form.bankReferenceId.trim(),
          name: form.name.trim(),
          mobile: form.mobile.trim(),
          email: form.email || null,
          pan: form.pan.toUpperCase() || null,
          city: form.city || null,
          monthlyIncome:
            Number(num(form.monthlyIncome)) || 0,
          assignedUserId:
            resolvedAssignedTo || null,
          kyc: "Pending",
          status: "Active",
        });

      setOpen(false);

      setForm({
        name: "",
        mobile: "",
        email: "",
        pan: "",
        city: "Hyderabad",
        bankId: "",
        bankReferenceId: "",
        assignedTo: "",
        monthlyIncome: "45000",
      });

      forgetReferenceCheck();

      refresh();

      toast.success("Customer added", {
        description:
          `${created.data.name} created as ${created.data.code}`,
      });
    } catch (err) {
      toast.error("Could not add customer", {
        description: errorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Customer table columns                                                     */
  /* -------------------------------------------------------------------------- */

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback>
              {initials(row.name)}
            </AvatarFallback>
          </Avatar>

          <div>
            <p className="font-medium">
              {row.name}
            </p>

            <p className="numeric text-[11px] text-[var(--muted-foreground)]">
              {row.id}
            </p>
          </div>
        </div>
      ),
    },

    {
      key: "mobile",
      header: "Contact",
      render: (row) => (
        <div>
          <p className="numeric text-[13px]">
            {row.mobile}
          </p>

          <p className="text-[11px] text-[var(--muted-foreground)]">
            {row.city}
          </p>
        </div>
      ),
      exportValue: (row) => row.mobile,
    },

    {
      key: "bankId",
      header: "Bank",
      sortValue: (row) =>
        bankName(row.bankId),
      render: (row) =>
        bankName(row.bankId),
      exportValue: (row) =>
        bankName(row.bankId),
    },

    {
      key: "loans",
      header: "Loans",
      sortValue: (row) =>
        loansForCustomer(row.id).length,
      render: (row) => {
        const count =
          loansForCustomer(row.id).length;

        return (
          <Badge
            variant={
              count ? "info" : "neutral"
            }
          >
            {count} active
          </Badge>
        );
      },
      exportValue: (row) =>
        loansForCustomer(row.id).length,
    },

    {
      key: "monthlyIncome",
      header: "Income",
      align: "right",
      sortValue: (row) =>
        num(row.monthlyIncome),
      render: (row) => (
        <span className="numeric">
          {formatCurrency(
            num(row.monthlyIncome),
          )}
        </span>
      ),
      exportValue: (row) =>
        num(row.monthlyIncome),
    },

    {
      key: "cibil",
      header: "CIBIL",
      align: "right",
      sortValue: (row) =>
        row.cibil ?? 0,
      render: (row) => {
        const cibil = row.cibil ?? 0;

        return (
          <span
            className="numeric font-medium"
            style={{
              color:
                cibil >= 750
                  ? "var(--success)"
                  : cibil >= 680
                    ? "var(--warning)"
                    : "var(--danger)",
            }}
          >
            {cibil}
          </span>
        );
      },
      exportValue: (row) =>
        row.cibil ?? 0,
    },

    {
      key: "kyc",
      header: "KYC",
      render: (row) => (
        <StatusBadge status={row.kyc} />
      ),
      exportValue: (row) => row.kyc,
    },

    {
      key: "assignedTo",
      header: "Owner",
      sortValue: (row) =>
        employeeName(
          row.assignedUserId,
        ),
      render: (row) =>
        employeeName(
          row.assignedUserId,
        ),
      exportValue: (row) =>
        employeeName(
          row.assignedUserId,
        ),
    },

    {
      key: "createdAt",
      header: "Added",
      sortValue: (row) =>
        row.createdAt,
      render: (row) =>
        formatDate(row.createdAt),
      exportValue: (row) =>
        row.createdAt,
    },

    /* ---------------------------------------------------------------------- */
    /* Actions                                                                */
    /* ---------------------------------------------------------------------- */

    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              router.push(
                `/customers/${row.id}`,
              );
            }}
          >
            View
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();

              router.push(
                `/documents?customerId=${row.id}`,
              );
            }}
          >
            Upload Docs
          </Button>

          {/*
            * TASK 4.8 — Delete is gated on the permission the backend already
            * enforces (`customers.delete`, `customers.routes.ts:309`). Team
            * Leader and Executive do not hold it, so the button they were shown
            * could only ever produce a 403. This matches the server and widens
            * nothing: the guard that counts is still the route's
            * (RULES §5, D-005).
            */}
          {can("customers.delete") && (
            <Button
              size="sm"
              variant="destructive"
              onClick={(event) => {
                event.stopPropagation();
                deleteCustomer(row.id);
              }}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  /* -------------------------------------------------------------------------- */
  /* Statistics                                                                 */
  /*                                                                            */
  /* Every figure below except the first is computed over the LOADED PAGE, and  */
  /* server paging makes that a smaller slice than before — so the wording has  */
  /* to say which population each number describes (D-051 constraint 7). The    */
  /* old `% of book` was already computed over loaded rows only; under paging   */
  /* it would have become a page percentage still labelled as the whole book.   */
  /* The page set the honest precedent itself with "in this view".              */
  /* -------------------------------------------------------------------------- */

  const verified = rows.filter(
    (row) => row.kyc === "Verified",
  ).length;

  const followUps = rows.filter(
    (row) => row.status === "Follow Up",
  ).length;

  const totalIncome = rows.reduce(
    (total, row) =>
      total + num(row.monthlyIncome),
    0,
  );

  const averageIncome =
    rows.length > 0
      ? Math.round(
          totalIncome / rows.length,
        )
      : 0;

  const verifiedPercentage =
    rows.length > 0
      ? Math.round(
          (verified / rows.length) * 100,
        )
      : 0;

  /* -------------------------------------------------------------------------- */
  /* Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <>
      <PageHeader
        eyebrow="Customer management"
        title="Customers"
        description="Every lead and borrower on the desk, with KYC state, assigned owner, and lender mapping."
        actions={
          <>
            <Button
              variant="outline"
              asChild
            >
              <Link href="/documents">
                Documents
              </Link>
            </Button>

            {can("customers.import") && (
              <Button
                variant="outline"
                onClick={() =>
                  setImportOpen(true)
                }
              >
                <FileSpreadsheet className="size-4" />
                Import Excel
              </Button>
            )}

            <Button
              onClick={() => setOpen(true)}
            >
              <Plus className="size-4" />
              Add customer
            </Button>
          </>
        }
      />

      {/* -------------------------------------------------------------------- */}
      {/* Statistics                                                           */}
      {/* -------------------------------------------------------------------- */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* The only card that can speak for more than the loaded page: it is
            `meta.total` for the current search and filters, counted by the
            database rather than by the rows that happen to be on screen. */}
        <StatCard
          label="Total on desk"
          value={String(total)}
          icon={Users}
          helper="matching these filters"
        />

        <StatCard
          label="KYC verified"
          value={String(verified)}
          icon={Users}
          accent="var(--success)"
          helper={`${verifiedPercentage}% of this page`}
          index={1}
        />

        <StatCard
          label="Follow ups due"
          value={String(followUps)}
          icon={Users}
          accent="var(--warning)"
          helper="on this page"
          index={2}
        />

        <StatCard
          label="Avg. monthly income"
          value={formatCurrency(
            averageIncome,
          )}
          icon={Users}
          accent="var(--info)"
          helper="declared, this page"
          index={3}
        />
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Customer table                                                       */}
      {/* -------------------------------------------------------------------- */}

      {/*
        * TASK 4.8 — a failed load must look like a failure.
        *
        * Same shape as the employees screen (D-031): the banner carries the
        * server's own message and a retry that re-issues the request, and the
        * table below is suppressed entirely — an empty grid beside an error
        * banner still invites the reader to conclude there is no data.
        */}
      {loadError && (
        <div
          data-testid="customers-load-error"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={refresh}>
            Try again
          </Button>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div
          data-testid="customers-loading"
          className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 card-shadow"
        >
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 card-shadow">
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            Nothing is shown because the request failed — not because there are
            no customers.
          </p>
        </div>
      ) : (
      <DataTable
        rows={rows}
        columns={columns}
        exportName="risenext-customers"
        pageSize={PAGE_SIZE}
        total={total}
        page={page}
        onPageChange={setPage}
        onSearchChange={(value) => {
          setSearchInput(value);
          setPage(1);
        }}
        onFilterChange={(key, value) => {
          setTableFilters((previous) => ({
            ...previous,
            [key]: value,
          }));
          setPage(1);
        }}
        /*
         * TASK 4.5 / D-053 — the search promise had to change, and it changes
         * here rather than silently.
         *
         * The box promised "name, ID, mobile, or PAN" and matched
         * name+id+mobile+pan+city in memory, over the first 100 rows only.
         *
         * D-053 puts preservation first and honest redefinition second, so PAN
         * was **preserved**: Task 4.5 added one `ilike(customers.pan, needle)`
         * to the server's disjunction (`customers.routes.ts`), which is the
         * "modest backend extension consistent with the existing architecture"
         * the row allows. The server now matches `name`, `mobile`, `code`,
         * `bankReferenceId` and `pan` across every customer in scope, rather
         * than five fields across one loaded page.
         *
         * Two fields were dropped rather than preserved, and the placeholder no
         * longer claims either:
         *   - **`id`** — a `uuid` column. `ilike` needs a `::text` cast no index
         *     could serve, and `code`/`bankReferenceId` are the identifiers this
         *     business actually quotes.
         *   - **`city`** — never advertised in the placeholder to begin with.
         *
         * `searchText` mirrors the server corpus exactly so the two cannot drift
         * apart again; it still feeds the client-side path that the ten other
         * DataTable consumers use.
         */
        searchPlaceholder="Search by name, mobile, PAN, customer code, or bank reference"
        searchText={(row) =>
          `${row.name} ${row.mobile} ${row.pan ?? ""} ${row.code} ${row.bankReferenceId}`
        }
        filters={[
          {
            key: "kyc",
            label: "KYC",
            options: [
              "Verified",
              "Pending",
              "Rejected",
            ],
            value: (row) => row.kyc,
          },
          {
            key: "bank",
            label: "Bank",
            options: banks.map(
              (bank) => bank.name,
            ),
            value: (row) =>
              bankName(row.bankId),
          },
          {
            key: "status",
            label: "Status",
            options: [
              "Active",
              "Follow Up",
              "Closed",
            ],
            value: (row) =>
              row.status,
          },
        ]}
        onRowClick={(row) =>
          router.push(
            `/customers/${row.id}`,
          )
        }
        emptyState={
          <EmptyState
            icon={UserPlus}
            title="No customers match this view"
            description="Adjust the filters, or add the borrower you just spoke to."
            action={
              <Button
                size="sm"
                onClick={() =>
                  setOpen(true)
                }
              >
                Add customer
              </Button>
            }
          />
        }
      />
      )}

      {/* -------------------------------------------------------------------- */}
      {/* Add customer dialog                                                  */}
      {/* -------------------------------------------------------------------- */}

      <Dialog
        open={open}
        onOpenChange={setOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add customer
            </DialogTitle>

            <DialogDescription>
              Capture the basics now — KYC
              documents and loan details can
              follow.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-bankref">
                Bank Reference ID
              </Label>

              <Input
                id="c-bankref"
                value={
                  form.bankReferenceId
                }
                onChange={(event) => {
                  setForm({
                    ...form,
                    bankReferenceId:
                      event.target.value,
                  });

                  forgetReferenceCheck();
                }}
                onBlur={checkBankReference}
                placeholder="REF001"
              />

              <p className="text-[11px] text-[var(--muted-foreground)]">
                Must be unique for the
                selected bank. The same
                reference may be reused under
                a different bank.
              </p>

              {/*
                * TASK 4.6 — advisory only.
                *
                * Nothing here gates the save button. The check tells the user
                * what the server currently knows; the unique index is what
                * actually decides, and a create is refused by the database with
                * a 409 whether or not this ran.
                */}
              {referenceCheck.state === "checking" && (
                <p
                  data-testid="reference-check"
                  className="text-[11px] text-[var(--muted-foreground)]"
                >
                  Checking this reference…
                </p>
              )}

              {referenceCheck.state === "available" && (
                <p
                  data-testid="reference-check"
                  className="text-[11px] text-[var(--success)]"
                >
                  Not used for this bank yet.
                </p>
              )}

              {referenceCheck.state === "taken" && (
                <p
                  data-testid="reference-check"
                  className="text-[11px] text-[var(--warning)]"
                >
                  {referenceCheck.customerCode
                    ? `Already used by ${referenceCheck.customerCode} for this bank.`
                    : referenceCheck.message}{" "}
                  {referenceCheck.wildcard
                    ? "This check reads _ and % as wildcards, so it may not be an exact duplicate — the database decides."
                    : "You can still save; the database has the final say."}
                </p>
              )}

              {referenceCheck.state === "unchecked" && (
                <p
                  data-testid="reference-check"
                  className="text-[11px] text-[var(--muted-foreground)]"
                >
                  This reference could not be checked. Saving still works — the
                  database refuses a duplicate on its own.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-name">
                Full name
              </Label>

              <Input
                id="c-name"
                value={form.name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    name: event.target.value,
                  })
                }
                placeholder="As printed on PAN"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-mobile">
                Mobile
              </Label>

              <Input
                id="c-mobile"
                value={form.mobile}
                maxLength={10}
                inputMode="numeric"
                onChange={(event) =>
                  setForm({
                    ...form,
                    mobile:
                      event.target.value.replace(
                        /\D/g,
                        "",
                      ),
                  })
                }
                placeholder="10 digits"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-email">
                Email
              </Label>

              <Input
                id="c-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({
                    ...form,
                    email: event.target.value,
                  })
                }
                placeholder="optional"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-pan">
                PAN
              </Label>

              <Input
                id="c-pan"
                value={form.pan}
                maxLength={10}
                onChange={(event) =>
                  setForm({
                    ...form,
                    pan: event.target.value.toUpperCase(),
                  })
                }
                placeholder="ABCPK1234K"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-income">
                Monthly income
              </Label>

              <Input
                id="c-income"
                value={form.monthlyIncome}
                inputMode="numeric"
                onChange={(event) =>
                  setForm({
                    ...form,
                    monthlyIncome:
                      event.target.value.replace(
                        /\D/g,
                        "",
                      ),
                  })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Bank</Label>

              <Select
                value={resolvedBankId}
                onValueChange={(value) => {
                  setForm({
                    ...form,
                    bankId: value,
                  });

                  // The check is per (bank, reference); a different bank makes
                  // the previous answer meaningless rather than merely stale.
                  forgetReferenceCheck();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bank" />
                </SelectTrigger>

                <SelectContent>
                  {banks.map((bank) => (
                    <SelectItem
                      key={bank.id}
                      value={bank.id}
                    >
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Assign to</Label>

              <Select
                value={resolvedAssignedTo}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    assignedTo: value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>

                <SelectContent>
                  {employees.map(
                    (employee) => (
                      <SelectItem
                        key={employee.id}
                        value={employee.id}
                      >
                        {employee.name}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setOpen(false)
              }
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              onClick={addCustomer}
              disabled={saving}
            >
              {saving
                ? "Adding..."
                : "Add customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* Excel import dialog                                                  */}
      {/* -------------------------------------------------------------------- */}

      <CustomerImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={refresh}
      />
    </>
  );
}
