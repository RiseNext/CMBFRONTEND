"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, ListChecks, Send, TimerReset } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailRow } from "@/components/shared/detail-row";
import { PipelineRail } from "@/components/shared/pipeline-rail";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { useReference } from "@/hooks/use-reference";
import { useAuth } from "@/hooks/use-auth";
import { useResource, useRecord, useStats } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { num } from "@/lib/types";
import type { Bank, BankOrder, Customer, Loan, Verification } from "@/lib/types";

const stages: BankOrder["stage"][] = [
  "Login",
  "Credit Check",
  "Field Verification",
  "Sanction",
  "Disbursal Queue",
];

export default function BankOrdersPage() {
  const { bankName, banks } = useReference();
  const { data: customersList } = useResource<Customer>("/customers", { pageSize: 500 });
  const customerName = (id: string | null) =>
    customersList.find((c) => c.id === id)?.name ?? "Unknown";
  const { data: loansList } = useResource<Loan>("/loans", { pageSize: 500 });
  const loanById = (id: string | null) => loansList.find((l) => l.id === id);
  /*
   * Task 6.6 — the board must show the whole book, not one page.
   *
   * The Kanban derives every column from `rows`, so at the 25-row default a
   * card could be invisible and therefore **unadvanceable** — which touches the
   * DoD's "advanced ... from the UI" directly. 500 is the documented maximum
   * (`listQuery` in `scoped-resource.ts`), and `meta.total` is surfaced below
   * so the page states plainly when there is more than it is showing.
   *
   * Server pagination is NOT adopted here (D-065): there is no `sortBy`
   * parameter, so paging would force hiding the SLA sort this screen exists
   * for — D-051 constraint 5. That belongs to Phase 11.
   */
  const {
    data: rows,
    total,
    loading,
    error,
    refresh,
  } = useResource<BankOrder>("/bank-orders", { pageSize: 500 });
  const { can } = useAuth();
  const [selected, setSelected] = React.useState<BankOrder | null>(null);
  const [remark, setRemark] = React.useState("");
  const [savingStage, setSavingStage] = React.useState(false);
  const [savingRemark, setSavingRemark] = React.useState(false);
  const [dialogError, setDialogError] = React.useState<string | null>(null);
  // Refs, not state: `disabled` only takes effect after a re-render, so a fast
  // double-click gets through a state-only guard.
  const stageRef = React.useRef(false);
  const remarkRef = React.useRef(false);

  const canEdit = can("bank_orders.edit");
  const canCreate = can("bank_orders.create");

  /*
   * Task 6.3 — bank-order creation, DECISIONS.md D-059.
   *
   * `POST /api/bank-orders` had **zero callers**: orders could only appear by a
   * direct database insert, so the Kanban board tracked a pipeline nothing
   * could enter from the product.
   *
   * ⚠️ **There is no bank selector, and that is deliberate.** The server's
   * `beforeWrite` calls `assertSameBank` on BOTH the loan and the customer, so
   * a freely-chosen bank can only ever produce a refusal — D-059 settled
   * exactly this shape for the disbursement form. The bank and customer are
   * derived from the loan the operator picks, which is the only combination the
   * server will accept.
   *
   * Loans that already have an order are excluded from the picker: migration
   * `0013` enforces one live order per loan, and offering a choice the server
   * will reject is a control that cannot do what it offers.
   */
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newLoanId, setNewLoanId] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const createRef = React.useRef(false);

  const orderedLoanIds = React.useMemo(
    () => new Set(rows.map((row) => row.loanId)),
    [rows],
  );
  const eligibleLoans = React.useMemo(
    () =>
      loansList.filter(
        (loan) => !orderedLoanIds.has(loan.id) && loan.status !== "Draft" && loan.status !== "Closed",
      ),
    [loansList, orderedLoanIds],
  );

  async function createOrder() {
    const loan = loansList.find((item) => item.id === newLoanId);
    if (!loan) {
      toast.error("Choose a loan to raise the order against");
      return;
    }
    // A ref, because `disabled` only applies after a re-render.
    if (createRef.current) return;
    if (!canCreate) return;

    createRef.current = true;
    setCreating(true);
    setCreateError(null);

    try {
      const saved = await api.create<BankOrder>("/bank-orders", {
        loanId: loan.id,
        // Derived, never chosen — see above.
        bankId: loan.bankId,
        customerId: loan.customerId,
        submittedOn: new Date().toISOString(),
        // The ratified initial state (BUSINESS_FLOW.md §3.3). `initialStatuses`
        // and the stage machine refuse anything else, so sending a different
        // one would be a guaranteed 422.
        stage: "Login",
        status: "In Progress",
      });
      const server = saved?.data;

      setCreateOpen(false);
      setNewLoanId("");
      refresh();
      // D-026 — the server's row is what is reported, not what was requested.
      toast.success("Bank order raised", {
        description: `${server?.code ?? "New order"} · ${customerName(loan.customerId)}`,
      });
    } catch (err) {
      const message = errorMessage(err, "Could not raise this bank order.");
      setCreateError(message);
      toast.error("Bank order not raised", { description: message });
    } finally {
      createRef.current = false;
      setCreating(false);
    }
  }

  /** Replaces a row everywhere it is rendered, from the server's own copy. */
  const adopt = React.useCallback((server: BankOrder) => {
    setSelected((prev) => (prev && prev.id === server.id ? server : prev));
  }, []);

  /*
   * Task 6.1 — a real stage move.
   *
   * `moveStage` used to call `refresh()`, set local state and toast. The card
   * visibly did not move while the toast claimed it had, because the board is
   * derived from fetched rows.
   *
   * **The transition map is not reimplemented here.** Whether Login may jump to
   * Sanction is the server's business (`operations.routes.ts`,
   * `allowedTransitions` reached through F1-c's `transitionColumn`); a client
   * copy would drift and start refusing edges the server allows. A 422 comes
   * back with the server's own sentence and that sentence is what is shown.
   */
  async function moveStage(order: BankOrder, stage: BankOrder["stage"]) {
    if (stageRef.current || stage === order.stage) return;
    if (!canEdit) return; // informational; the control is disabled without it

    stageRef.current = true;
    setSavingStage(true);
    setDialogError(null);

    try {
      const saved = await api.update<BankOrder>(`/bank-orders/${order.id}`, { stage });
      const server = saved?.data;
      // D-026 — adopt what was stored, never what was requested.
      if (server) adopt(server);
      refresh();
      toast.success("Stage updated", {
        description: `${server?.code ?? order.code} → ${server?.stage ?? stage}`,
      });
    } catch (err) {
      const message = errorMessage(err, "Could not move this order.");
      setDialogError(message);
      toast.error("Stage not changed", { description: message });
    } finally {
      stageRef.current = false;
      setSavingStage(false);
    }
  }

  /*
   * Task 6.2 — a real remark, DECISIONS.md D-064.
   *
   * The remark OVERWRITES the single `remarks` column. An append-only history
   * table was considered and declined: PRD R6.2 asks only that an operator
   * "record a remark against the file trail", `DATA_MODEL.md` lists one `text`
   * column, and no requirement anywhere asks for history. Building one would be
   * a migration and a new API surface for a requirement no document states.
   *
   * **The audit log IS the file trail.** `diff()` records `remarks` before and
   * after on every PATCH, so the history lives where this system already keeps
   * history — which is why the copy below says "Remarks updated" and no longer
   * claims a ledger that does not exist (D-004).
   */
  async function saveRemark(order: BankOrder) {
    const text = remark.trim();
    if (!text) {
      toast.error("Add a remark before saving");
      return;
    }
    if (remarkRef.current) return;
    if (!canEdit) return;

    remarkRef.current = true;
    setSavingRemark(true);
    setDialogError(null);

    try {
      const saved = await api.update<BankOrder>(`/bank-orders/${order.id}`, { remarks: text });
      const server = saved?.data;
      if (server) adopt(server);
      refresh();
      setRemark("");
      toast.success("Remarks updated", { description: server?.code ?? order.code });
    } catch (err) {
      const message = errorMessage(err, "Could not save that remark.");
      setDialogError(message);
      toast.error("Remark not saved", { description: message });
    } finally {
      remarkRef.current = false;
      setSavingRemark(false);
    }
  }

  const columns: Column<BankOrder>[] = [
    {
      key: "id",
      header: "Order",
      sortValue: (row) => row.code,
      render: (row) => (
        <div>
          <p className="numeric font-medium">{row.code}</p>
          <p className="numeric text-[11px] text-[var(--muted-foreground)]">{row.loanId}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      sortValue: (row) => customerName(row.customerId),
      render: (row) => customerName(row.customerId),
      exportValue: (row) => customerName(row.customerId),
    },
    {
      key: "bank",
      header: "Bank",
      sortValue: (row) => bankName(row.bankId),
      render: (row) => bankName(row.bankId),
      exportValue: (row) => bankName(row.bankId),
    },
    { key: "officer", header: "Bank officer" },
    {
      key: "stage",
      header: "Stage",
      sortValue: (row) => stages.indexOf(row.stage),
      render: (row) => <span className="text-[13px] font-medium">{row.stage}</span>,
      exportValue: (row) => row.stage,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (row) => loanById(row.loanId)?.amountRequested ?? 0,
      render: (row) => (
        <span className="numeric">
          {formatCurrency(loanById(row.loanId)?.amountRequested ?? 0, { compact: true })}
        </span>
      ),
      exportValue: (row) => loanById(row.loanId)?.amountRequested ?? 0,
    },
    {
      key: "sla",
      header: "SLA",
      sortValue: (row) => row.sla,
      render: (row) => {
        const overdue = Boolean(row.sla) && new Date(row.sla as string) < new Date() && row.status !== "Cleared";
        return (
          <span className={overdue ? "font-medium text-[var(--danger)]" : ""}>
            {formatDate(row.sla)}
          </span>
        );
      },
      exportValue: (row) => row.sla,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
      exportValue: (row) => row.status,
    },
  ];

  const board = stages.map((stage) => ({
    stage,
    items: rows.filter((row) => row.stage === stage),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Bank operations"
        title="Bank orders"
        description="Files sitting with partner lenders — track the stage, the officer handling it, and the SLA clock."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/loans">
                <Send className="size-4" /> Submit new file
              </Link>
            </Button>
            {/*
              Task 6.3. Most orders now open themselves — submitting a loan
              creates one (6.4) — so this is the manual path for a file that was
              submitted before that existed, or whose order was removed.
            */}
            <Button onClick={() => setCreateOpen(true)} disabled={!canCreate}>
              <ArrowRight className="size-4" /> Raise bank order
            </Button>
          </>
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise a bank order</DialogTitle>
            <DialogDescription>
              The bank and customer are taken from the loan — a bank order belongs to the lender
              the file was submitted to.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>Loan</Label>
            <Select value={newLoanId} onValueChange={setNewLoanId} disabled={creating}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a submitted loan" />
              </SelectTrigger>
              <SelectContent>
                {eligibleLoans.map((loan) => (
                  <SelectItem key={loan.id} value={loan.id}>
                    {loan.code} · {customerName(loan.customerId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/*
              An empty picker is explained rather than left blank: "there is
              nothing to choose" and "everything already has one" are different
              facts, and only one of them is a problem.
            */}
            {eligibleLoans.length === 0 && (
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Every submitted loan already has a bank order. One order per loan.
              </p>
            )}
            {newLoanId && (
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Bank: {bankName(loansList.find((l) => l.id === newLoanId)?.bankId ?? null)} · opens
                at stage Login
              </p>
            )}
          </div>

          {createError && (
            <p role="alert" className="text-[12px] text-[var(--danger)]">
              {createError}
            </p>
          )}
          {!canCreate && (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              You do not have permission to raise a bank order.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void createOrder()}
              disabled={!canCreate || creating || !newLoanId}
            >
              {creating ? "Raising…" : "Raise order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Task 6.6 — three distinct states, and a load failure is NOT rendered as
        an empty board. "We could not ask" and "there is nothing" are different
        facts about the book, and an operator acting on the wrong one is exactly
        what this phase exists to stop.
      */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-4 py-3 text-[13px]"
        >
          <p className="font-medium">Could not load bank orders</p>
          <p className="text-[var(--muted-foreground)]">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={refresh}>
            Try again
          </Button>
        </div>
      )}

      {/*
        D-065 — the board is capped at the API maximum. Above it, say so rather
        than silently showing a subset of the pipeline as though it were all of
        it.
      */}
      {!loading && !error && total > rows.length && (
        <p className="text-[12px] text-[var(--muted-foreground)]">
          Showing the {rows.length} most recent of {total} bank orders. Figures below describe
          the loaded set.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open orders"
          value={loading ? "…" : String(rows.filter((r) => r.status !== "Cleared").length)}
          icon={ListChecks}
          helper="awaiting bank action"
        />
        <StatCard
          label="Cleared"
          value={String(rows.filter((r) => r.status === "Cleared").length)}
          icon={ClipboardCheck}
          accent="var(--success)"
          helper="ready for disbursal"
          index={1}
        />
        <StatCard
          label="On hold"
          value={String(rows.filter((r) => r.status === "On Hold").length)}
          icon={TimerReset}
          accent="var(--warning)"
          helper="needs customer input"
          index={2}
        />
        <StatCard
          label="Returned"
          value={String(rows.filter((r) => r.status === "Returned").length)}
          icon={ArrowRight}
          accent="var(--danger)"
          helper="rework with another lender"
          index={3}
        />
      </div>

      <SectionCard
        title="Stage board"
        description="Where each file sits in the lender workflow"
        contentClassName="grid gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        {board.map((column) => (
          <div key={column.stage} className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
            <div className="flex items-center justify-between pb-2">
              <p className="text-[11px] font-semibold">{column.stage}</p>
              <span className="numeric text-[11px] text-[var(--muted-foreground)]">
                {column.items.length}
              </span>
            </div>
            <div className="space-y-2">
              {column.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] p-2.5 text-left transition-shadow hover:shadow-sm"
                >
                  <p className="truncate text-[13px] font-medium">{customerName(item.customerId)}</p>
                  <p className="text-[11px] text-[var(--muted-foreground)]">{bankName(item.bankId)}</p>
                  <div className="mt-1.5">
                    <StatusBadge status={item.status} />
                  </div>
                </button>
              ))}
              {!column.items.length && (
                <p className="py-4 text-center text-[11px] text-[var(--muted-foreground)]">
                  Nothing here
                </p>
              )}
            </div>
          </div>
        ))}
      </SectionCard>

      <DataTable
        rows={rows}
        columns={columns}
        exportName="risenext-bank-orders"
        searchPlaceholder="Search order ID, loan ID, customer, or officer"
        searchText={(row) =>
          `${row.code} ${row.loanId} ${customerName(row.customerId)} ${bankName(row.bankId)} ${row.officer}`
        }
        filters={[
          {
            key: "status",
            label: "Status",
            options: ["In Progress", "On Hold", "Cleared", "Returned"],
            value: (row) => row.status,
          },
          { key: "stage", label: "Stage", options: stages, value: (row) => row.stage },
          {
            key: "bank",
            label: "Bank",
            options: banks.map((bank) => bank.name),
            value: (row) => bankName(row.bankId),
          },
        ]}
        onRowClick={(row) => setSelected(row)}
      />

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selected.id} · {customerName(selected.customerId)}
                </DialogTitle>
                <DialogDescription>
                  {bankName(selected.bankId)} · handled by {selected.officer}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <DetailRow label="Loan" value={selected.loanId} mono />
                  <DetailRow
                    label="Amount"
                    value={formatCurrency(loanById(selected.loanId)?.amountRequested ?? 0)}
                    mono
                  />
                  <DetailRow label="Submitted" value={formatDate(selected.submittedOn)} />
                  <DetailRow label="SLA" value={formatDate(selected.sla)} />
                  <DetailRow label="Status" value={<StatusBadge status={selected.status} />} />
                </div>
                <PipelineRail current={selected.stage} />
              </div>

              <div className="space-y-2 rounded-lg bg-[var(--secondary)] p-3">
                <p className="text-[11px] font-semibold">Latest remark</p>
                <p className="text-[13px]">{selected.remarks}</p>
              </div>

              <div className="space-y-2">
                {/* D-064 — one current remark, overwritten. The audit diff is
                    the trail, so the label no longer promises a ledger. */}
                <Label htmlFor="remark">Update remarks</Label>
                <Textarea
                  id="remark"
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                  placeholder="Call summary, pending item, or bank feedback"
                  disabled={!canEdit || savingRemark}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Move to stage</Label>
                <Select
                  value={selected.stage}
                  disabled={!canEdit || savingStage}
                  onValueChange={(value) => void moveStage(selected, value as BankOrder["stage"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/*
                  D-049 — an honest permission state. The control is disabled
                  and says why, rather than being hidden (which would leave the
                  operator wondering) or failing with a 403 toast (which would
                  make them try again).
                */}
                {!canEdit && (
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    You do not have permission to change a bank order.
                  </p>
                )}
              </div>

              {/*
                The server's own words, in the dialog rather than only in a
                toast that scrolls away. An illegal stage move explains which
                move was refused, and that is the whole of the answer.
              */}
              {dialogError && (
                <p role="alert" className="text-[12px] text-[var(--danger)]">
                  {dialogError}
                </p>
              )}

              <DialogFooter className="sm:justify-between">
                <Button variant="outline" asChild>
                  <Link href={`/customers/${selected.customerId}`}>Open customer</Link>
                </Button>
                <Button
                  onClick={() => void saveRemark(selected)}
                  disabled={!canEdit || savingRemark || !remark.trim()}
                >
                  {savingRemark ? "Saving…" : "Update remarks"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
