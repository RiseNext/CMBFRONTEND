"use client";

import * as React from "react";
import { MaintenanceSheet } from "@/components/maintenance/maintenance-sheet";
import { Button } from "@/components/ui/button";
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
import { PAYMENT_FORMAT, sheetAmount, sheetDateTime } from "@/lib/maintenance/formats";
import type { PaymentRow } from "@/lib/maintenance/types";

/** Only `Not Received` is attested in the supplied sheet; `Received` is the
 *  other half of the binary that wording implies. One list, one place to
 *  correct it if management's vocabulary turns out to be longer. */
const PAYMENT_STATUS_OPTIONS = ["Received", "Not Received"] as const;
/** Distinct from every real value, so "not recorded" is selectable. */
const UNRECORDED = "__unrecorded__";

/**
 * FORMAT D — Payment. Task MM-1, D-095.
 *
 * APTS plus `Payment Status`, with `Branch Name` and `Transfer Amount`
 * transposed relative to the APTS sheet. Both orders are the manager's and both
 * are reproduced exactly.
 */
export default function MaintenancePaymentPage() {
  return (
    <MaintenanceSheet<PaymentRow>
      format={PAYMENT_FORMAT}
      eyebrow="Maintenance"
      description="Transfers with the manager's receipt status. Select a row to record it."
      path="/maintenance/payment"
      renderDrawer={(row, done) => <PaymentMaintenance row={row} done={done} />}
    />
  );
}

/**
 * The one editable field on this sheet.
 *
 * ── WHAT THIS CONTROL CANNOT DO ─────────────────────────────────────────────
 *
 * It writes `payment_status` through `PATCH /api/maintenance/payment/:id` and
 * nothing else. It does not, and cannot, mark a disbursement Credited, set a
 * UTR, move an amount, or post to the ledger — that remains
 * `POST /api/disbursements/:id/approve`, with its own permission and its own
 * UTR precondition. The authoritative financial state is shown here read-only,
 * beside the maintenance field, precisely so the two are never confused.
 */
function PaymentMaintenance({ row, done }: { row: PaymentRow; done: () => void }) {
  const { can } = useAuth();
  const editable = can("maintenance.edit");
  const [value, setValue] = React.useState(row.paymentStatus ?? UNRECORDED);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.update(`/maintenance/payment/${row.id}`, {
        paymentStatus: value === UNRECORDED ? null : value,
      });
      toast.success("Payment status saved");
      done();
    } catch (err) {
      toast.error("Could not save the payment status", { description: errorMessage(err) });
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
        <DetailRow label="Customer" value={row.customerName} />
        <DetailRow label="Branch Name" value={row.branchName} />
        <DetailRow label="Transfer Amount" value={sheetAmount(row.transferAmount)} mono />
        <DetailRow label="UTR" value={row.utr} mono />
        {/* The financial state, named as what it is so it is never read as the
            manager's receipt flag below. */}
        <DetailRow label="Disbursement status" value={row.disbursementStatus} />
        <DetailRow
          label="Fund credited to customer"
          value={sheetDateTime(row.fundCreditedAt)}
          mono
        />
      </div>

      <div className="space-y-3">
        <p className="eyebrow pb-2 text-[var(--muted-foreground)]">Manager maintenance</p>
        <div className="space-y-1.5">
          <Label htmlFor="payment-status">Payment Status</Label>
          <Select value={value} onValueChange={setValue} disabled={!editable}>
            <SelectTrigger id="payment-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNRECORDED}>Not recorded</SelectItem>
              {PAYMENT_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          This is the manager&rsquo;s tracking status. It records whether the payment has been
          received and changes nothing about the disbursement itself.
        </p>
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
