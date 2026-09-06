"use client";

import * as React from "react";
import { RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useResource } from "@/hooks/use-api";
import { useReference } from "@/hooks/use-reference";
import { useAuth } from "@/hooks/use-auth";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { RecycleBinEntry } from "@/lib/types";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, string> = {
  customer: "Customer",
  bank: "Bank",
  loan: "Loan",
  bank_order: "Bank order",
  verification: "Verification",
  disbursement: "Disbursement",
  settlement: "Settlement",
  transaction: "Transaction",
  ledger_entry: "Ledger entry",
  document: "Document",
  funding_source: "Funding source",
  service_provider: "Service provider",
  user: "Employee",
};

export default function RecycleBinPage() {
  const { can } = useAuth();
  const { bankName } = useReference();
  const { data: rows, loading, error, refresh } = useResource<RecycleBinEntry>("/recycle-bin");
  const [pendingPurge, setPendingPurge] = React.useState<RecycleBinEntry | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function restore(entry: RecycleBinEntry) {
    setBusy(true);
    try {
      await api.action(`/recycle-bin/${entry.id}/restore`);
      refresh();
      toast.success("Record restored", { description: entry.label });
    } catch (err) {
      toast.error("Could not restore", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  /**
   * The confirmation is a plain No/Yes dialog, per the brief — no typing
   * "DELETE". The API still requires an explicit `confirm: true` so a stray
   * request can never purge anything.
   */
  async function confirmPurge() {
    if (!pendingPurge) return;
    setBusy(true);
    try {
      await api.action(`/recycle-bin/${pendingPurge.id}/permanent-delete`, { confirm: true });
      setPendingPurge(null);
      refresh();
      toast.success("Record permanently deleted");
    } catch (err) {
      toast.error("Could not delete", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<RecycleBinEntry>[] = [
    {
      key: "label",
      header: "Record",
      sortValue: (row) => row.label,
      render: (row) => (
        <div>
          <p className="font-medium">{row.label}</p>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            {TYPE_LABELS[row.recordType] ?? row.recordType}
          </p>
        </div>
      ),
    },
    {
      key: "bank",
      header: "Bank",
      sortValue: (row) => (row.bankId ? bankName(row.bankId) : "—"),
      render: (row) => (
        <span className="text-[13px]">{row.bankId ? bankName(row.bankId) : "—"}</span>
      ),
    },
    {
      key: "deletedAt",
      header: "Deleted",
      sortValue: (row) => row.deletedAt,
      render: (row) => (
        <span className="numeric text-[13px]">{formatDateTime(row.deletedAt)}</span>
      ),
    },
    {
      key: "daysRemaining",
      header: "Auto-purge in",
      align: "right",
      sortValue: (row) => row.daysRemaining,
      render: (row) => (
        <span
          className={
            row.daysRemaining <= 3
              ? "numeric text-[13px] font-medium text-[var(--danger)]"
              : "numeric text-[13px]"
          }
        >
          {row.daysRemaining} day{row.daysRemaining === 1 ? "" : "s"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex justify-end gap-2">
          {can("recycle_bin.restore") && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                void restore(row);
              }}
            >
              <RotateCcw className="size-3.5" /> Restore
            </Button>
          )}
          {can("recycle_bin.permanent_delete") && (
            <Button
              variant="outline"
              size="sm"
              className="text-[var(--danger)]"
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                setPendingPurge(row);
              }}
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Recycle bin"
        description="Deleted records are held here before they are permanently removed. Restoring a record puts it back exactly as it was."
      />

      {error && (
        <div className="rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="The recycle bin is empty"
          description="Records you delete will appear here, and can be restored until their retention period ends."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          searchText={(row) => `${row.label} ${row.recordType}`}
          searchPlaceholder="Search deleted records"
          exportName="recycle-bin"
        />
      )}

      <Dialog open={Boolean(pendingPurge)} onOpenChange={(open) => !open && setPendingPurge(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-[var(--danger)]" />
              Are you sure you want to permanently delete this record?
            </DialogTitle>
            <DialogDescription>
              {pendingPurge?.label} will be removed for good. The audit history of who created,
              edited and deleted it is retained.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingPurge(null)} disabled={busy}>
              No
            </Button>
            <Button
              className="bg-[var(--danger)] text-white hover:opacity-90"
              onClick={() => void confirmPurge()}
              disabled={busy}
            >
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
