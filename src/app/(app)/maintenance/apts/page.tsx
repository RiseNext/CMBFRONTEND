"use client";

import { MaintenanceSheet } from "@/components/maintenance/maintenance-sheet";
import { APTS_FORMAT } from "@/lib/maintenance/formats";
import type { AptsRow } from "@/lib/maintenance/types";

/**
 * FORMAT C — APTS. Task MM-1, D-095.
 *
 * The same underlying projection as the Transfer sheet, rendered in the six
 * columns and the column ORDER the APTS sheet uses — `Transfer Amount` before
 * `Branch Name`, which is the reverse of the Payment sheet. Ends in a totals
 * band, as the supplied sheet does.
 *
 * What "APTS" stands for is not established anywhere in this repository or in
 * the material supplied, so nothing here interprets it: no APTS-specific
 * workflow, status or table was invented. It is the manager's own name for this
 * view, and it is used as a label only.
 */
export default function MaintenanceAptsPage() {
  return (
    <MaintenanceSheet<AptsRow>
      format={APTS_FORMAT}
      eyebrow="Maintenance"
      description="Transfers in the APTS tracking format, with the day's total."
      path="/maintenance/apts"
    />
  );
}
