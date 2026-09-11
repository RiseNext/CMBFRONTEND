"use client";

import * as React from "react";
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
import { DetailRow } from "@/components/shared/detail-row";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useResource } from "@/hooks/use-api";
import { sheetAmount, sheetDate } from "@/lib/maintenance/formats";
import type { Branch, SheetRow } from "@/lib/maintenance/types";
import type { Employee } from "@/lib/types";

/** Distinct from any real id, so "not recorded" is selectable and clears the field. */
const UNSET = "__unset__";

/**
 * The Transfer sheet's maintenance drawer. Task MM-1, D-095.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Four columns of the manager's own Transfer sheet — `BRANCH`, `BT LEAD ID`,
 * `MANAGER NAME` and `REMARK` — were readable and **not writable from anywhere
 * in the product**. `branch_id` and `bt_lead_id` had a route and no caller;
 * `assigned_user_id` and `notes` had existed since the first migration and were
 * written by nothing. Four permanently blank columns is not a maintenance
 * tracker, so this is the input that makes them maintainable.
 *
 * ── WHAT IT WRITES, AND WHAT IT REFUSES TO SHADOW ───────────────────────────
 *
 * `MANAGER NAME` writes `disbursements.assigned_user_id` and `REMARK` writes
 * `disbursements.notes` — the EXISTING authoritative columns, not maintenance
 * copies of them. A `maintenance_manager_name` text field would have been a
 * second answer to "who owns this payout", free to disagree with the first.
 *
 * The authoritative money fields — amount, UTR, status, credit time — are shown
 * here READ ONLY, beside the editable ones, precisely so the two are never
 * confused. Nothing in this drawer can move money, mark a disbursement Credited,
 * or touch the loan's own status.
 */
export function TransferMaintenance({ row, done }: { row: SheetRow; done: () => void }) {
  const { can } = useAuth();
  const editable = can("maintenance.edit");

  const { data: branches } = useResource<Branch>("/maintenance/branches", undefined, editable);
  const { data: employees } = useResource<Employee>(
    "/users",
    { pageSize: 200 },
    editable && can("users.view"),
  );

  /*
   * `null` means "the operator has not touched this control", in which case the
   * displayed value is DERIVED from the row. Deriving rather than syncing with
   * an effect is deliberate: `react-hooks/set-state-in-effect` is an error in
   * this repository, and a `setState` in an effect that watches an
   * asynchronously-loaded list would also clobber a selection the moment that
   * list resolved.
   *
   * The sheet carries NAMES, not ids, so the current branch and owner are
   * matched back by name. A name that no longer resolves leaves the control on
   * "Not recorded" rather than inventing a selection.
   */
  const [branchChoice, setBranchChoice] = React.useState<string | null>(null);
  const [managerChoice, setManagerChoice] = React.useState<string | null>(null);
  const [btLeadId, setBtLeadId] = React.useState(row.btLeadId ?? "");
  const [remark, setRemark] = React.useState(row.remark ?? "");
  const [saving, setSaving] = React.useState(false);

  const branchId =
    branchChoice ?? branches.find((b) => b.name === row.branchName)?.id ?? UNSET;
  const managerId =
    managerChoice ?? employees.find((e) => e.name === row.managerName)?.id ?? UNSET;

  const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

  async function save() {
    setSaving(true);
    try {
      /*
       * TWO records, because the manager's single row spans two: the branch and
       * the BT lead id belong to the FILE, the owner and the remark to the
       * PAYMENT. Each goes to the route that owns it, and each route re-checks
       * bank access on its own row.
       */
      await api.update(`/maintenance/loan/${row.loanId}`, {
        branchId: branchId === UNSET ? null : branchId,
        btLeadId: orNull(btLeadId),
      });
      await api.update(`/maintenance/disbursement/${row.id}`, {
        assignedUserId: managerId === UNSET ? null : managerId,
        notes: orNull(remark),
      });
      toast.success("Transfer record saved");
      done();
    } catch (err) {
      toast.error("Could not save this record", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-1">
        <p className="eyebrow pb-2 text-[var(--muted-foreground)]">
          From the disbursement record — read only
        </p>
        <DetailRow label="Customer Name" value={row.customerName} />
        <DetailRow label="Mobile Number" value={row.customerMobile} />
        <DetailRow label="Date" value={sheetDate(row.date)} mono />
        <DetailRow label="Transfer Amount" value={sheetAmount(row.transferAmount)} mono />
        <DetailRow label="UTR Number" value={row.utr} mono />
        <DetailRow label="Disbursement status" value={row.disbursementStatus} />
        <DetailRow label="Region Name" value={row.regionName} />
        <DetailRow label="Area Name" value={row.areaName} />
      </div>

      <div className="space-y-3">
        <p className="eyebrow pb-2 text-[var(--muted-foreground)]">Manager maintenance</p>

        <div className="space-y-1.5">
          <Label>Branch</Label>
          <Select value={branchId} onValueChange={setBranchChoice} disabled={!editable}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Not recorded</SelectItem>
              {branches
                .filter((b) => b.status === "Active")
                .map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} · {b.areaName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Region and Area follow from the branch — they are not entered separately.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bt-lead-id">BT Lead ID</Label>
          <Input
            id="bt-lead-id"
            value={btLeadId}
            placeholder="e.g. BTOMKA250626053704"
            onChange={(event) => setBtLeadId(event.target.value)}
            disabled={!editable}
          />
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Issued outside this system. Type it exactly as it was given — nothing generates one.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Manager Name</Label>
          <Select value={managerId} onValueChange={setManagerChoice} disabled={!editable}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Not recorded</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="transfer-remark">Remark</Label>
          <Input
            id="transfer-remark"
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            disabled={!editable}
          />
        </div>

        {editable ? (
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        ) : (
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Your role cannot edit maintenance fields. It needs{" "}
            <code className="text-[11px]">maintenance.edit</code>.
          </p>
        )}
      </div>
    </div>
  );
}
