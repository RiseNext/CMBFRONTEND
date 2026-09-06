"use client";

import * as React from "react";
import Link from "next/link";
import { Banknote, CircleAlert, Plus, RefreshCcw, Truck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailRow } from "@/components/shared/detail-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Bank, Customer, Disbursement, Loan } from "@/lib/types";

export default function DisbursementPage() {
  const { bankName, banks } = useReference();
  const { data: customersList } = useResource<Customer>("/customers", { pageSize: 500 });
  const customerName = (id: string | null) =>
    customersList.find((c) => c.id === id)?.name ?? "Unknown";
  const { data: loans } = useResource<Loan>("/loans", { pageSize: 500 });
  const { data: rows, loading, error, refresh } = useResource<Disbursement>("/disbursements");
  const [selected, setSelected] = React.useState<Disbursement | null>(null);
  const [open, setOpen] = React.useState(false);
  const disbursableLoans = loans.filter((loan) =>
    ["Approved", "Disbursed"].includes(loan.status),
  );
  /*
   * Task 7.4 — defaults are seeded from an EFFECT, not a `useState` initialiser.
   *
   * The initialiser ran on first render, when `loans` was still `[]` because
   * the request had not resolved. So `disbursableLoans[0]` was `undefined`,
   * `loanId` was permanently `""` and `amount` permanently `"0"` — and if the
   * operator did not notice, the create dialog offered a zero-rupee
   * disbursement as though it were a fact about the loan. D-055: **default
   * values must never be emitted as though they were customer facts.**
   *
   * `dirtyRef` is what keeps the fix from becoming a new bug: once the operator
   * touches the form, a late-arriving loan list must not overwrite what they
   * typed.
   */
  const [form, setForm] = React.useState({
    loanId: "",
    mode: "NEFT" as Disbursement["mode"],
    amount: "",
    utr: "",
  });
  const dirtyRef = React.useRef(false);
  const [busy, setBusy] = React.useState<"credit" | "create" | null>(null);
  const [dialogError, setDialogError] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);
  const { can } = useAuth();
  const canApprove = can("disbursements.approve");
  const canCreate = can("disbursements.create");

  const firstDisbursable = disbursableLoans[0];

  React.useEffect(() => {
    // Only seeds an untouched, empty form — never overwrites the operator.
    if (dirtyRef.current || !firstDisbursable) return;
    setForm((prev) =>
      prev.loanId
        ? prev
        : {
            ...prev,
            loanId: firstDisbursable.id,
            amount: String(num(firstDisbursable.amountApproved)),
          },
    );
  }, [firstDisbursable]);

  /** Every field edit goes through this, so the seeding effect stands down. */
  const setField = React.useCallback(
    (patch: Partial<typeof form>) => {
      dirtyRef.current = true;
      setForm((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  async function recordDisbursal() {
    const loan = loans.find((item) => item.id === form.loanId);
    if (!loan) {
      toast.error("Select a loan to disburse against");
      return;
    }
    // Double-submit guard is a ref, not state: `disabled` only applies after a
    // re-render, and this creates a financial record.
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy("create");
    setDialogError(null);

    try {
      await api.create<Disbursement>("/disbursements", {
        loanId: loan.id,
        customerId: loan.customerId,
        bankId: loan.bankId,
        amount: Number(form.amount) || num(loan.amountApproved),
        // A NULL UTR is a valid in-flight state (D-067) — the reference arrives
        // from the bank afterwards, and `→Credited` is what requires it.
        utr: form.utr.trim() || null,
        mode: form.mode,
        disbursedOn: new Date().toISOString(),
        // `In Transit` is the only status the server accepts on create
        // (`initialStatuses`, D-066). Sending anything else is a 422.
        status: "In Transit",
      });
      setOpen(false);
      dirtyRef.current = false;
      setForm({ loanId: "", mode: "NEFT", amount: "", utr: "" });
      refresh();
      toast.success("Disbursal recorded", { description: loan.code });
    } catch (err) {
      const message = errorMessage(err, "Could not record disbursal");
      setDialogError(message);
      toast.error("Could not record disbursal", { description: message });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  /*
   * Task 7.1 — "mark credited" becomes real, DECISIONS.md D-066.
   *
   * ⚠️ **This calls the APPROVE route, not PATCH**, and the roadmap row's own
   * text said PATCH. Following it literally would have reopened the privilege
   * bypass D-056 closed for loans: Manager holds `disbursements.edit` and NOT
   * `disbursements.approve`, and `patchSchema` keeps the create enum — so a
   * PATCH-based control would let a role that may not approve mark money as
   * received, leaving `approved_by` NULL and the audit row reading "updated".
   * The server now refuses `status` on PATCH outright, so this is the only
   * route that works.
   *
   * The old toast said *"{utr} confirmed in bank statement"* — an assertion
   * about an external fact this system cannot observe (D-040). What it can
   * honestly say is that the record was updated.
   */
  async function markCredited(row: Disbursement) {
    if (busyRef.current) return;
    if (!canApprove) return; // informational; the control is disabled without it

    busyRef.current = true;
    setBusy("credit");
    setDialogError(null);

    try {
      const saved = await api.action<Disbursement>(`/disbursements/${row.id}/approve`, {
        status: "Credited",
      });
      const server = saved?.data;
      // D-026 — adopt the stored row, not the requested state.
      if (server) setSelected((prev) => (prev && prev.id === server.id ? server : prev));
      refresh();
      toast.success("Marked as credited", {
        description: `${server?.code ?? row.code} · UTR ${server?.utr ?? row.utr ?? "—"}`,
      });
    } catch (err) {
      /*
       * The server enforces "→Credited requires a non-null UTR" and returns 422
       * naming `utr`. That sentence is shown rather than a generic failure,
       * because it tells the operator exactly what to do next.
       */
      const message = errorMessage(err, "Could not mark this disbursement credited.");
      setDialogError(message);
      toast.error("Not credited", { description: message });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  /*
   * Task 7.2 — "re-initiate" becomes real by becoming a CREATE.
   *
   * The old control claimed *"Transfer resubmitted with corrected
   * beneficiary."* Nothing was resubmitted, and nothing could be: the ratified
   * machine (BUSINESS_FLOW.md §3.3) makes `Failed` **terminal** —
   * *"a Failed row is never re-used; retry creates a new disbursement"*. A
   * failed payment is a fact about money that did not move, and rewriting it
   * would destroy the record of the attempt.
   *
   * So this opens the create dialog pre-filled from the failed row. The
   * operator supplies a new UTR, because the old one belongs to the attempt
   * that failed.
   */
  function retry(row: Disbursement) {
    const loan = loans.find((item) => item.id === row.loanId);
    setForm({
      loanId: row.loanId,
      mode: row.mode,
      amount: String(num(row.amount)),
      utr: "", // deliberately blank — a new attempt needs a new reference
    });
    setOpen(true);
    setSelected(null);
    toast.info("Starting a new disbursement", {
      description: `${loan?.code ?? row.code} · the failed attempt is kept as a record.`,
    });
  }

  const columns: Column<Disbursement>[] = [
    {
      key: "id",
      header: "Disbursal",
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
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (row) => num(row.amount),
      render: (row) => <span className="numeric font-medium">{formatCurrency(num(row.amount))}</span>,
      exportValue: (row) => num(row.amount),
    },
    { key: "mode", header: "Mode", sortValue: (row) => row.mode },
    {
      key: "utr",
      header: "UTR",
      render: (row) => <span className="numeric text-xs">{row.utr}</span>,
    },
    { key: "creditedTo", header: "Credited to" },
    {
      key: "disbursedOn",
      header: "Date",
      sortValue: (row) => row.disbursedOn,
      render: (row) => formatDate(row.disbursedOn),
      exportValue: (row) => row.disbursedOn,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
      exportValue: (row) => row.status,
    },
  ];

  const credited = rows.filter((row) => row.status === "Credited");
  const inTransit = rows.filter((row) => row.status === "In Transit");
  const failed = rows.filter((row) => row.status === "Failed");

  return (
    <>
      <PageHeader
        eyebrow="Bank operations"
        title="Disbursement"
        description="Money released by lenders against sanctioned files, matched to UTR references."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Record disbursal
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total disbursed"
          value={formatCurrency(credited.reduce((total, row) => total + num(row.amount), 0), { compact: true })}
          icon={Banknote}
          accent="var(--success)"
          helper={`${credited.length} credited`}
        />
        <StatCard
          label="In transit"
          value={formatCurrency(inTransit.reduce((total, row) => total + num(row.amount), 0), { compact: true })}
          icon={Truck}
          accent="var(--info)"
          helper={`${inTransit.length} awaiting credit`}
          index={1}
        />
        <StatCard
          label="Failed transfers"
          value={String(failed.length)}
          icon={CircleAlert}
          accent="var(--danger)"
          helper="fix beneficiary and retry"
          index={2}
        />
        <StatCard
          label="Average ticket"
          value={formatCurrency(
            Math.round(rows.reduce((total, row) => total + num(row.amount), 0) / rows.length),
            { compact: true },
          )}
          icon={Banknote}
          helper="across all lenders"
          index={3}
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        exportName="risenext-disbursements"
        searchPlaceholder="Search UTR, loan ID, or customer"
        searchText={(row) =>
          `${row.code} ${row.loanId} ${row.utr} ${customerName(row.customerId)} ${bankName(row.bankId)}`
        }
        filters={[
          {
            key: "status",
            label: "Status",
            options: ["Credited", "In Transit", "Failed"],
            value: (row) => row.status,
          },
          { key: "mode", label: "Mode", options: ["NEFT", "RTGS", "IMPS"], value: (row) => row.mode },
          {
            key: "bank",
            label: "Bank",
            options: banks.map((bank) => bank.name),
            value: (row) => bankName(row.bankId),
          },
        ]}
        onRowClick={(row) => setSelected(row)}
      />

      <Dialog open={Boolean(selected)} onOpenChange={(value) => !value && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.id}</DialogTitle>
                <DialogDescription>
                  {customerName(selected.customerId)} · {bankName(selected.bankId)}
                </DialogDescription>
              </DialogHeader>
              <div>
                <DetailRow label="Amount" value={formatCurrency(num(selected.amount))} mono />
                <DetailRow label="Mode" value={selected.mode} />
                <DetailRow label="UTR" value={selected.utr} mono />
                <DetailRow label="Credited to" value={selected.creditedTo} mono />
                <DetailRow label="Disbursed on" value={formatDate(selected.disbursedOn)} />
                <DetailRow label="Status" value={<StatusBadge status={selected.status} />} />
              </div>
              {/* The server's own sentence, in the dialog. A refused →Credited
                  names the missing UTR, and that is the whole of the answer. */}
              {dialogError && (
                <p role="alert" className="text-[12px] text-[var(--danger)]">
                  {dialogError}
                </p>
              )}
              {/* D-049 — an honest permission state, neither hidden nor a 403. */}
              {!canApprove && selected.status === "In Transit" && (
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Confirming a credit needs the disbursement approval permission.
                </p>
              )}
              <DialogFooter className="sm:justify-between">
                <Button variant="outline" asChild>
                  <Link href={`/customers/${selected.customerId}`}>Open customer</Link>
                </Button>
                {selected.status === "Failed" ? (
                  <Button onClick={() => retry(selected)} disabled={!canCreate}>
                    <RefreshCcw className="size-4" /> Start a new disbursement
                  </Button>
                ) : (
                  <Button
                    variant="success"
                    disabled={selected.status !== "In Transit" || !canApprove || busy === "credit"}
                    onClick={() => void markCredited(selected)}
                  >
                    {busy === "credit" ? "Saving…" : "Mark credited"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record disbursal</DialogTitle>
            <DialogDescription>
              Log the transfer the bank confirmed so the ledger and settlement stay in sync.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Sanctioned loan</Label>
              <Select
                value={form.loanId}
                onValueChange={(value) => {
                  const loan = loans.find((item) => item.id === value);
                  // `setField` marks the form dirty, so the 7.4 seeding effect
                  // stands down and a late loan list cannot overwrite this.
                  setField({ loanId: value, amount: String(num(loan?.amountApproved)) });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {disbursableLoans.map((loan) => (
                    <SelectItem key={loan.id} value={loan.id}>
                      {loan.id} · {customerName(loan.customerId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-amount">Amount</Label>
              <Input
                id="d-amount"
                value={num(form.amount)}
                onChange={(event) => setField({ amount: event.target.value.replace(/\D/g, "") })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select
                value={form.mode}
                onValueChange={(value) => setField({ mode: value as Disbursement["mode"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEFT">NEFT</SelectItem>
                  <SelectItem value="RTGS">RTGS</SelectItem>
                  <SelectItem value="IMPS">IMPS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="d-utr">UTR reference</Label>
              <Input
                id="d-utr"
                value={form.utr}
                onChange={(event) => setField({ utr: event.target.value })}
                placeholder="CHOLN2405260119"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void recordDisbursal()}
              disabled={busy === "create" || !canCreate || !form.loanId}
            >
              {busy === "create" ? "Saving…" : "Save disbursal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
