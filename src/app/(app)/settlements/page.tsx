"use client";

import * as React from "react";
import { CircleAlert, FileSpreadsheet, HandCoins, ReceiptText, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailRow } from "@/components/shared/detail-row";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { exportTallyXml } from "@/lib/export";
import { toast } from "sonner";
import { useReference } from "@/hooks/use-reference";
import { useAuth } from "@/hooks/use-auth";
import { useResource, useRecord, useStats } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { num } from "@/lib/types";
import type { Bank, Settlement } from "@/lib/types";

export default function SettlementsPage() {
  const { bankById, bankName, banks } = useReference();
  const { data: rows, loading, error, refresh } = useResource<Settlement>("/settlements");
  const [selected, setSelected] = React.useState<Settlement | null>(null);

  const { can } = useAuth();
  const canApprove = can("settlements.approve");
  const [busy, setBusy] = React.useState<"paid" | "dispute" | null>(null);
  const [dialogError, setDialogError] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);

  /**
   * One code path for both decisions — Tasks 8.3 and 8.4.
   *
   * ⚠️ **Both call the APPROVE route, not PATCH.** Row 8.3's own text said
   * `PATCH /api/settlements/:id`; following it would have reopened the D-056
   * bypass one resource over, because `patchSchema` keeps the create enum and
   * `settlements.edit` is a lower bar than `settlements.approve`. The server
   * now refuses `status` on PATCH, so this is the only route that works.
   *
   * Marking Paid also fires the **8.8 chain** server-side — a Commission
   * transaction and its ledger entry, in the same database transaction as the
   * status change. Nothing about that is simulated here; if the chain fails,
   * the approval fails and this shows the server's refusal.
   */
  async function decide(row: Settlement, status: "Paid" | "Disputed") {
    if (busyRef.current) return;
    if (!canApprove) return;

    busyRef.current = true;
    setBusy(status === "Paid" ? "paid" : "dispute");
    setDialogError(null);

    try {
      const saved = await api.action<Settlement>(`/settlements/${row.id}/approve`, { status });
      const server = saved?.data;
      // D-026 — adopt the stored row.
      if (server) setSelected((prev) => (prev && prev.id === server.id ? server : prev));
      refresh();

      if (status === "Paid") {
        toast.success("Settlement closed", {
          description: `${server?.code ?? row.code} · ${bankName(row.bankId)}`,
        });
      } else {
        /*
         * Task 8.4 — the old copy said *"Query sent to {bank} SPOC."*
         *
         * **There is no messaging path anywhere in this repository**, so that
         * sentence claimed an external communication that never happened —
         * the literal form D-040 bans ("Nothing user-facing may say 'Emailed',
         * 'Sent' or 'Delivered'"). The dispute is now a real, audited status
         * change, and the wording says only what the system actually did.
         */
        toast.success("Marked as disputed", {
          description: `${server?.code ?? row.code} · recorded against ${bankName(row.bankId)}`,
        });
      }
    } catch (err) {
      const message = errorMessage(
        err,
        status === "Paid" ? "Could not close this settlement." : "Could not raise this dispute.",
      );
      setDialogError(message);
      toast.error(status === "Paid" ? "Not closed" : "Dispute not raised", {
        description: message,
      });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  const markPaid = (row: Settlement) => decide(row, "Paid");
  const raiseDispute = (row: Settlement) => decide(row, "Disputed");

  /**
   * Task 8.5 — the period filter's options come from the settlements that
   * actually exist. Newest first, so the current month is the first choice.
   */
  const periodOptions = React.useMemo(
    () => [...new Set(rows.map((row) => row.period).filter(Boolean))].sort().reverse(),
    [rows],
  );

  const columns: Column<Settlement>[] = [
    {
      key: "invoiceNo",
      header: "Invoice",
      sortValue: (row) => row.invoiceNo,
      render: (row) => (
        <div>
          <p className="numeric font-medium">{row.invoiceNo}</p>
          <p className="text-[11px] text-[var(--muted-foreground)]">{row.period}</p>
        </div>
      ),
    },
    {
      key: "bank",
      header: "Bank",
      sortValue: (row) => bankName(row.bankId),
      render: (row) => bankName(row.bankId),
      exportValue: (row) => bankName(row.bankId),
    },
    {
      key: "cases",
      header: "Cases",
      align: "right",
      sortValue: (row) => row.cases,
      render: (row) => <span className="numeric">{row.cases}</span>,
    },
    {
      key: "grossCommission",
      header: "Gross",
      align: "right",
      sortValue: (row) => num(row.grossCommission),
      render: (row) => <span className="numeric">{formatCurrency(num(row.grossCommission))}</span>,
      exportValue: (row) => num(row.grossCommission),
    },
    {
      key: "tds",
      header: "TDS",
      align: "right",
      sortValue: (row) => num(row.tds),
      render: (row) => <span className="numeric text-[var(--muted-foreground)]">{formatCurrency(num(row.tds))}</span>,
      exportValue: (row) => num(row.tds),
    },
    {
      key: "netPayable",
      header: "Net payable",
      align: "right",
      sortValue: (row) => num(row.netPayable),
      render: (row) => <span className="numeric font-semibold">{formatCurrency(num(row.netPayable))}</span>,
      exportValue: (row) => num(row.netPayable),
    },
    {
      key: "raisedOn",
      header: "Raised",
      sortValue: (row) => row.raisedOn,
      render: (row) => formatDate(row.raisedOn),
      exportValue: (row) => row.raisedOn,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
      exportValue: (row) => row.status,
    },
  ];

  const paid = rows.filter((row) => row.status === "Paid");
  const pending = rows.filter((row) => row.status === "Pending");
  const disputed = rows.filter((row) => row.status === "Disputed");
  const collected = paid.reduce((total, row) => total + num(row.netPayable), 0);
  const outstanding = rows
    .filter((row) => row.status !== "Paid")
    .reduce((total, row) => total + num(row.netPayable), 0);

  return (
    <>
      <PageHeader
        eyebrow="Bank operations"
        title="Settlements"
        description="Commission invoices raised on lenders, TDS deducted, and what is still to be collected."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              exportTallyXml(
                "risenext-settlements-tally",
                rows.map((row) => ({
                  date: row.raisedOn,
                  narration: `${row.invoiceNo} · ${row.period} commission`,
                  party: bankName(row.bankId),
                  amount: num(row.netPayable),
                })),
              );
              toast.success("Tally XML exported");
            }}
          >
            <FileSpreadsheet className="size-4" /> Export to Tally
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Collected"
          value={formatCurrency(collected, { compact: true })}
          icon={Wallet}
          accent="var(--success)"
          helper={`${paid.length} invoices closed`}
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(outstanding, { compact: true })}
          icon={HandCoins}
          accent="var(--warning)"
          helper={`${pending.length + disputed.length} invoices open`}
          index={1}
        />
        <StatCard
          label="Disputed"
          value={String(disputed.length)}
          icon={CircleAlert}
          accent="var(--danger)"
          helper="query raised with lender"
          index={2}
        />
        <StatCard
          label="TDS deducted"
          value={formatCurrency(rows.reduce((total, row) => total + num(row.tds), 0))}
          icon={ReceiptText}
          accent="var(--info)"
          helper="claimable in filing"
          index={3}
        />
      </div>

      <SectionCard
        title="Collection by lender"
        description="Share of net payable already received"
        contentClassName="space-y-4"
      >
        {banks.map((bank) => {
          const bankRows = rows.filter((row) => row.bankId === bank.id);
          if (!bankRows.length) return null;
          const total = bankRows.reduce((sum, row) => sum + num(row.netPayable), 0);
          const received = bankRows
            .filter((row) => row.status === "Paid")
            .reduce((sum, row) => sum + num(row.netPayable), 0);
          const percent = total ? Math.round((received / total) * 100) : 0;
          return (
            <div key={bank.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{bank.name}</span>
                <span className="numeric text-xs text-[var(--muted-foreground)]">
                  {formatCurrency(received)} of {formatCurrency(total)}
                </span>
              </div>
              <Progress
                value={percent}
                indicatorClassName={percent === 100 ? "bg-[var(--success)]" : undefined}
              />
            </div>
          );
        })}
      </SectionCard>

      <DataTable
        rows={rows}
        columns={columns}
        exportName="risenext-settlements"
        searchPlaceholder="Search invoice, bank, or period"
        searchText={(row) => `${row.invoiceNo} ${bankName(row.bankId)} ${row.period} ${row.status}`}
        filters={[
          {
            key: "status",
            label: "Status",
            options: ["Paid", "Pending", "Disputed"],
            value: (row) => row.status,
          },
          {
            key: "bank",
            label: "Bank",
            options: banks.map((bank) => bank.name),
            value: (row) => bankName(row.bankId),
          },
          {
            key: "period",
            label: "Period",
            /*
             * Task 8.5 — derived from the data, not hardcoded.
             *
             * This was `["May 2024", "April 2024"]`: two literals that were
             * already stale when they were written. A filter offering periods
             * that do not exist, and hiding every period that does, is worse
             * than no filter — it makes the book look empty for any real month.
             */
            options: periodOptions,
            value: (row) => row.period,
          },
        ]}
        onRowClick={(row) => setSelected(row)}
      />

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.invoiceNo}</DialogTitle>
                <DialogDescription>
                  {bankName(selected.bankId)} · {selected.period} · SPOC{" "}
                  {bankById(selected.bankId)?.spocName}
                </DialogDescription>
              </DialogHeader>
              <div>
                <DetailRow label="Cases billed" value={selected.cases} mono />
                <DetailRow label="Gross commission" value={formatCurrency(num(selected.grossCommission))} mono />
                <DetailRow label="TDS (5%)" value={formatCurrency(num(selected.tds))} mono />
                <DetailRow label="Net payable" value={formatCurrency(num(selected.netPayable))} mono />
                <DetailRow label="Raised on" value={formatDate(selected.raisedOn)} />
                <DetailRow
                  label="Settled on"
                  value={selected.settledOn ? formatDate(selected.settledOn) : "Not settled"}
                />
                <DetailRow label="Status" value={<StatusBadge status={selected.status} />} />
              </div>
              {dialogError && (
                <p role="alert" className="text-[12px] text-[var(--danger)]">
                  {dialogError}
                </p>
              )}
              {selected.status === "Paid" && (
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Paid is final. A correction is recorded as a compensating Refund transaction,
                  never by editing this settlement.
                </p>
              )}
              {!canApprove && selected.status !== "Paid" && (
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Closing or disputing a settlement needs the settlement approval permission.
                </p>
              )}
              <DialogFooter className="sm:justify-between">
                <Button
                  variant="outline"
                  // Only `Pending` may be disputed; `Disputed → Disputed` is not
                  // an edge and `Paid` is terminal.
                  disabled={selected.status !== "Pending" || !canApprove || busy !== null}
                  onClick={() => void raiseDispute(selected)}
                >
                  {busy === "dispute" ? "Saving…" : "Raise dispute"}
                </Button>
                <Button
                  variant="success"
                  disabled={selected.status === "Paid" || !canApprove || busy !== null}
                  onClick={() => void markPaid(selected)}
                >
                  {busy === "paid" ? "Saving…" : "Mark paid"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
