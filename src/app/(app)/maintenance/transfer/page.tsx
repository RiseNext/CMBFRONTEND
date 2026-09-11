"use client";

import { LocationsPanel } from "@/components/maintenance/locations-panel";
import { MaintenanceSheet } from "@/components/maintenance/maintenance-sheet";
import { TransferMaintenance } from "@/components/maintenance/transfer-maintenance";
import { TRANSFER_FORMAT } from "@/lib/maintenance/formats";
import type { TransferRow } from "@/lib/maintenance/types";

/**
 * FORMAT B — Transfer / Disbursement. Task MM-1, D-095.
 *
 * The thirteen columns come from `TRANSFER_FORMAT`, which is also what the
 * export reads, so the screen and the downloaded sheet cannot drift.
 *
 * Four of those columns — `BRANCH`, `BT LEAD ID`, `MANAGER NAME` and `REMARK` —
 * are maintained from the row drawer. The `LocationsPanel` above it is the
 * master data the Region, Area and Branch columns resolve through; it renders
 * only for `maintenance.manage_locations`.
 */
export default function MaintenanceTransferPage() {
  return (
    <>
      <LocationsPanel />
      <MaintenanceSheet<TransferRow>
        format={TRANSFER_FORMAT}
        eyebrow="Maintenance"
        description="Every recorded transfer, in the tracking format management already uses. Select a row to maintain it."
        path="/maintenance/transfer"
        renderDrawer={(row, done) => (
          <TransferMaintenance key={row.id} row={row} done={done} />
        )}
      />
    </>
  );
}
