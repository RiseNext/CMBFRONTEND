"use client";

import { MaintenanceSheet } from "@/components/maintenance/maintenance-sheet";
import { TRANSFER_FORMAT } from "@/lib/maintenance/formats";
import type { TransferRow } from "@/lib/maintenance/types";

/**
 * FORMAT B — Transfer / Disbursement. Task MM-1, D-095.
 *
 * The thirteen columns come from `TRANSFER_FORMAT`, which is also what the
 * export reads, so the screen and the downloaded sheet cannot drift.
 */
export default function MaintenanceTransferPage() {
  return (
    <MaintenanceSheet<TransferRow>
      format={TRANSFER_FORMAT}
      eyebrow="Maintenance"
      description="Every recorded transfer, in the tracking format management already uses."
      path="/maintenance/transfer"
    />
  );
}
