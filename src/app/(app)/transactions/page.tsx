"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, CheckCircle2, CircleAlert, Clock3, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailRow } from "@/components/shared/detail-row";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { useReference } from "@/hooks/use-reference";
import { useAuth } from "@/hooks/use-auth";
import { useResource, useRecord, useStats } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { num } from "@/lib/types";
import type { Bank, Customer, Disbursement, Loan, Transaction } from "@/lib/types";

export default function TransactionsPage() {
  const { bankName, banks } = useReference();
  const { data: customersList } = useResource<Customer>("/customers", { pageSize: 500 });
  const customerName = (id: string | null) =>
    customersList.find((c) => c.id === id)?.name ?? "Unknown";
  const { data: rows, loading, error, refresh } = useResource<Transaction>("/transactions");
  const [selected, setSelected] = React.useState<Transaction | null>(null);

  const { can } = useAuth();
  const canEdit = can("transactions.edit");
  const canCreate = can("transactions.create");
  const [busy, setBusy] = React.useState(false);
  const [dialogError, setDialogError] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);

  const { data: loansList } = useResource<Loan>("/loans", { pageSize: 500 });

  /*
   * Task 8.2 — transaction creation, DECISIONS.md D-059, D-066.
   *
   * "Nothing in the UI can create a transaction; nothing in the backend
   * auto-creates one either." The second half stopped being true with 8.8 (a
   * settlement approval now posts one); this is the first half.
   *
   * ⚠️ **There is no status field in this form**, and that is the point.
   * `initialStatuses: ["Pending"]` means the server refuses anything else, and
   * the reason is a privilege boundary rather than a style rule: Manager holds
   * `transactions.create` and NOT `transactions.edit`, so a form that could
   * post `Success` would let a role that may not edit a transaction mint one
   * that is already final. The status moves afterwards, through the guarded
   * PATCH above.
   *
   * The bank is derived from the loan when one is chosen, for the same reason
   * the disbursement and bank-order forms do it (D-059).
   */
  const [createOpen, setCreateOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const createRef = React.useRef(false);
  const [form, setForm] = React.useState({
    loanId: "",
    amount: "",
    txnType: "Disbursement" as Transaction["txnType"],
    reference: "",
  });

  async function createTransaction() {
    const loan = loansList.find((item) => item.id === form.loanId);
    if (!loan) {
      toast.error("Choose a loan to record this against");
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    if (createRef.current) return;
    if (!canCreate) return;

    createRef.current = true;
    setCreating(true);
    setCreateError(null);

    try {
      const saved = await api.create<Transaction>("/transactions", {
        loanId: loan.id,
        customerId: loan.customerId,
        // Derived from the loan — a free bank choice could only produce a
        // refusal, since the loan already names its bank.
        bankId: loan.bankId,
        amount,
        txnType: form.txnType,
        reference: form.reference.trim() || null,
        occurredAt: new Date().toISOString(),
        // `status` is deliberately NOT sent. The server defaults it to
        // `Pending`, which is the only initial status it accepts.
      });
      const server = saved?.data;

      setCreateOpen(false);
      setForm({ loanId: "", amount: "", txnType: "Disbursement", reference: "" });
      refresh();
      // D-026 — report the stored row.
      toast.success("Transaction recorded", {
        description: `${server?.code ?? "New transaction"} · ${server?.status ?? "Pending"}`,
      });
    } catch (err) {
      const message = errorMessage(err, "Could not record this transaction.");
      setCreateError(message);
      toast.error("Transaction not recorded", { description: message });
    } finally {
      createRef.current = false;
      setCreating(false);
    }
  }

  /*
   * Task 8.1 — a real status change, DECISIONS.md D-066, D-069.
   *
   * `settle` declared a financial-ledger row "settled" in component state and
   * toasted. Nothing was written.
   *
   * **This uses PATCH, and that is correct here** — unlike disbursements and
   * settlements, `transactions` has NO approve route and no
   * `transactions.approve` permission, so PATCH is the only status writer there
   * is. The server carries the transition map on it (F1-c's
   * `transitionColumn`), so `Pending → Success` is checked server-side and
   * `Success` is terminal: a settled transaction cannot be un-settled, and a
   * correction is a NEW Refund transaction (D-069).
   */
  async function settle(row: Transaction) {
    if (busyRef.current) return;
    if (!canEdit) return;

    busyRef.current = true;
    setBusy(true);
    setDialogError(null);

    try {
      const saved = await api.update<Transaction>(`/transactions/${row.id}`, {
        status: "Success",
      });
      const server = saved?.data;
      // D-026 — the stored row wins.
      if (server) setSelected((prev) => (prev && prev.id === server.id ? server : prev));
      refresh();
      toast.success("Transaction settled", {
        description: server?.code ?? row.code,
      });
    } catch (err) {
      const message = errorMessage(err, "Could not settle this transaction.");
      setDialogError(message);
      toast.error("Not settled", { description: message });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const columns: Column<Transaction>[] = [
    {
      key: "id",
      header: "Transaction",
      sortValue: (row) => row.code,
      render: (row) => (
        <div>
          <p className="numeric font-medium">{row.code}</p>
          <p className="numeric text-[11px] text-[var(--muted-foreground)]">{row.reference}</p>
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
    { key: "type", header: "Type", sortValue: (row) => row.txnType },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (row) => num(row.amount),
      render: (row) => <span className="numeric font-medium">{formatCurrency(num(row.amount))}</span>,
      exportValue: (row) => num(row.amount),
    },
    {
      key: "commission",
      header: "Commission",
      align: "right",
      sortValue: (row) => num(row.commission),
      render: (row) =>
        num(row.commission) ? (
          <span className="numeric">{formatCurrency(num(row.commission))}</span>
        ) : (
          <span className="text-[var(--muted-foreground)]">—</span>
        ),
      exportValue: (row) => num(row.commission),
    },
    {
      key: "createdAt",
      header: "Timestamp",
      sortValue: (row) => row.occurredAt,
      render: (row) => formatDateTime(row.occurredAt),
      exportValue: (row) => row.occurredAt,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
      exportValue: (row) => row.status,
    },
  ];

  const success = rows.filter((row) => row.status === "Success");
  const pending = rows.filter((row) => row.status === "Pending");
  const failed = rows.filter((row) => row.status === "Failed");

  return (
    <>
      <PageHeader
        eyebrow="Bank operations"
        title="Transactions"
        description="Every rupee that moved — disbursals, EMI collections, commission credits, and refunds."
        actions={
          <Button onClick={() => setCreateOpen(true)} disabled={!canCreate}>
            <Plus className="size-4" /> Record transaction
          </Button>
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a transaction</DialogTitle>
            <DialogDescription>
              Opens as Pending. Confirming it is a separate, permission-gated step.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Loan</Label>
              <Select
                value={form.loanId}
                onValueChange={(value) => setForm({ ...form, loanId: value })}
                disabled={creating}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a loan" />
                </SelectTrigger>
                <SelectContent>
                  {loansList.map((loan) => (
                    <SelectItem key={loan.id} value={loan.id}>
                      {loan.code} · {customerName(loan.customerId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.loanId && (
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Bank: {bankName(loansList.find((l) => l.id === form.loanId)?.bankId ?? null)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-amount">Amount</Label>
              <Input
                id="t-amount"
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value.replace(/[^\d.]/g, "") })
                }
                placeholder="500000"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.txnType}
                onValueChange={(value) =>
                  setForm({ ...form, txnType: value as Transaction["txnType"] })
                }
                disabled={creating}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Disbursement">Disbursement</SelectItem>
                  <SelectItem value="EMI Collection">EMI Collection</SelectItem>
                  <SelectItem value="Commission">Commission</SelectItem>
                  {/* D-069 — a correction to a terminal record is a NEW Refund
                      transaction, never an edit of the original. */}
                  <SelectItem value="Refund">Refund</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="t-reference">Reference</Label>
              <Input
                id="t-reference"
                value={form.reference}
                onChange={(event) => setForm({ ...form, reference: event.target.value })}
                placeholder="Bank reference or UTR"
              />
            </div>
          </div>

          {/*
            There is no status control, deliberately — the server admits only
            `Pending` on create (D-066). Saying so is better than leaving an
            operator to wonder where it went.
          */}
          <p className="text-[11px] text-[var(--muted-foreground)]">
            New transactions open as <strong>Pending</strong>. Marking one successful is a separate
            step and needs the transaction edit permission.
          </p>

          {createError && (
            <p role="alert" className="text-[12px] text-[var(--danger)]">
              {createError}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void createTransaction()}
              disabled={!canCreate || creating || !form.loanId || !form.amount}
            >
              {creating ? "Recording…" : "Record transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Processed value"
          value={formatCurrency(success.reduce((total, row) => total + num(row.amount), 0), { compact: true })}
          icon={ArrowLeftRight}
          helper={`${success.length} successful`}
        />
        <StatCard
          label="Commission credited"
          value={formatCurrency(rows.reduce((total, row) => total + num(row.commission), 0))}
          icon={CheckCircle2}
          accent="var(--success)"
          helper="booked against files"
          index={1}
        />
        <StatCard
          label="Pending"
          value={String(pending.length)}
          icon={Clock3}
          accent="var(--warning)"
          helper="awaiting bank confirmation"
          index={2}
        />
        <StatCard
          label="Failed"
          value={String(failed.length)}
          icon={CircleAlert}
          accent="var(--danger)"
          helper="needs re-initiation"
          index={3}
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        exportName="risenext-transactions"
        searchPlaceholder="Search reference, customer, or transaction ID"
        searchText={(row) =>
          `${row.code} ${row.reference} ${customerName(row.customerId)} ${bankName(row.bankId)} ${row.txnType}`
        }
        filters={[
          {
            key: "status",
            label: "Status",
            options: ["Success", "Pending", "Failed"],
            value: (row) => row.status,
          },
          {
            key: "type",
            label: "Type",
            options: ["Disbursement", "EMI Collection", "Commission", "Refund"],
            value: (row) => row.txnType,
          },
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
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.id}</DialogTitle>
                <DialogDescription>
                  {selected.txnType} · {bankName(selected.bankId)}
                </DialogDescription>
              </DialogHeader>
              <div>
                <DetailRow label="Customer" value={customerName(selected.customerId)} />
                <DetailRow label="Loan" value={selected.loanId} mono />
                <DetailRow label="Amount" value={formatCurrency(num(selected.amount))} mono />
                <DetailRow
                  label="Commission"
                  value={num(selected.commission) ? formatCurrency(num(selected.commission)) : "—"}
                  mono
                />
                <DetailRow label="Reference" value={selected.reference} mono />
                <DetailRow label="Timestamp" value={formatDateTime(selected.occurredAt)} />
                <DetailRow label="Status" value={<StatusBadge status={selected.status} />} />
              </div>
              {dialogError && (
                <p role="alert" className="text-[12px] text-[var(--danger)]">
                  {dialogError}
                </p>
              )}
              {selected.status !== "Pending" && (
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  {selected.status} is final. A correction is recorded as a new Refund transaction,
                  never by editing this one.
                </p>
              )}
              {!canEdit && selected.status === "Pending" && (
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  You do not have permission to settle a transaction.
                </p>
              )}
              <DialogFooter className="sm:justify-between">
                <Button variant="outline" asChild>
                  <Link href={`/customers/${selected.customerId}`}>Open customer</Link>
                </Button>
                <Button
                  variant="success"
                  // `Pending` is the only state anything may leave — both
                  // terminals are immutable (D-069).
                  disabled={selected.status !== "Pending" || !canEdit || busy}
                  onClick={() => void settle(selected)}
                >
                  {busy ? "Saving…" : "Mark successful"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
