"use client";

import * as React from "react";
import { Download, Printer } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useMaintenanceSheet } from "@/hooks/use-maintenance-sheet";
import {
  BLANK,
  EMPTY_DISPLAY,
  FVR_COMPANY_NAME,
  FVR_COMPANY_STRAPLINE,
  FVR_DOCUMENT_TITLE,
  FVR_PARTICULARS,
  FVR_SHEET_HEADERS,
  sheetDate,
} from "@/lib/maintenance/formats";
import { exportFvrCsv } from "@/lib/maintenance/export";
import type { FvrRow } from "@/lib/maintenance/types";

/**
 * FORMAT A — the FVR checklist. Task MM-1, D-095.
 *
 * ── THIS ONE IS A FORM, NOT A LIST ──────────────────────────────────────────
 *
 * The supplied FVR is a VERTICAL per-customer document: a `Sl No` /
 * `Particulars` / `Details` table with one row per particular, under the firm's
 * letterhead. The other three sheets are horizontal registers. Rendering this
 * as a wide table would have matched none of the screenshot, so the screen
 * reproduces the document — letterhead, title, `Date:` line and all thirteen
 * particulars in the order the form lists them.
 *
 * The particulars and their exact wording come from `FVR_PARTICULARS`, which is
 * also what the CSV export reads.
 */
export default function MaintenanceFvrPage() {
  const { can } = useAuth();
  const allowed = can("maintenance.view");
  const editable = can("maintenance.edit");

  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const query = React.useMemo(
    () => ({ search: search.trim() || undefined, page: 1, pageSize: 50 }),
    [search],
  );

  const { rows, loading, error, refresh } = useMaintenanceSheet<FvrRow>(
    "/maintenance/fvr",
    query,
    allowed,
  );

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;

  if (!allowed) {
    return (
      <>
        <PageHeader eyebrow="Maintenance" title="FVR" />
        <SectionCard title="Not available to your role" description="">
          <p className="text-sm text-[var(--muted-foreground)]">
            Your role cannot view the maintenance sheets. It needs{" "}
            <code className="text-[11px]">maintenance.view</code>.
          </p>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Maintenance"
        title="FVR"
        description="Field Verification Report checklist, one per verified file."
      />

      <SectionCard
        title="Verified files"
        description={loading ? "" : `${rows.length.toLocaleString("en-IN")} on this page`}
        action={
          <Input
            placeholder="Customer or loan code"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 w-56"
          />
        }
      >
        {loading ? (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">Loading…</p>
        ) : error ? (
          <p className="py-6 text-center text-sm text-[var(--destructive)]">{error}</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            No verified files match. An FVR exists once a loan has a verification record.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {rows.map((row) => (
              <Button
                key={row.id}
                variant={selected?.id === row.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedId(row.id)}
              >
                {row.loanCode ?? row.id.slice(0, 8)} · {row.customerName ?? EMPTY_DISPLAY}
              </Button>
            ))}
          </div>
        )}
      </SectionCard>

      {selected ? (
        <FvrChecklist key={selected.id} row={selected} editable={editable} refresh={refresh} />
      ) : null}
    </>
  );
}

/** The document itself, reproduced from the supplied form. */
function FvrChecklist({
  row,
  editable,
  refresh,
}: {
  row: FvrRow;
  editable: boolean;
  refresh: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [slNo, particulars, details] = FVR_SHEET_HEADERS;

  function handleExport() {
    exportFvrCsv(row);
    toast.success("FVR checklist downloaded");
  }

  /*
   * A print view, and it says so. `window.print()` produces no file on its own —
   * what the user gets depends on what they choose in the browser dialog, and
   * they may cancel it. `toast.info`, never `toast.success`: claiming a PDF the
   * instant the dialog opens is a success reported before any outcome (D-004),
   * which is the exact defect Task 11.4 removed from the reports screen.
   */
  function openPrintView() {
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Popup blocked", { description: "Allow popups to print this checklist." });
      return;
    }
    const body = FVR_PARTICULARS.map(
      (particular, index) => `<tr>
        <td class="n">${index + 1}</td>
        <td>${escapeHtml(particular.label)}${
          particular.note ? `<div class="note">${escapeHtml(particular.note)}</div>` : ""
        }</td>
        <td>${escapeHtml(particular.value(row))}</td>
      </tr>`,
    ).join("");

    win.document.write(`<html><head><title>${escapeHtml(FVR_DOCUMENT_TITLE)}</title>
      <style>
        body{font-family:"Times New Roman",Georgia,serif;padding:42px;color:#0f1c30}
        .company{text-align:center;font-size:19px;font-weight:700;color:#1f3864;text-decoration:underline}
        .strapline{text-align:center;font-size:12px;margin-top:2px}
        .title{text-align:center;font-size:15px;font-weight:700;color:#1f3864;text-decoration:underline;margin:26px 0 18px}
        .date{text-align:right;font-size:13px;margin-bottom:10px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #9db2cf;padding:7px 9px;vertical-align:top}
        th{background:#dce6f1;text-align:center;font-weight:700}
        td.n{width:52px;text-align:left}
        th:nth-child(3),td:nth-child(3){width:42%}
        .note{font-size:11px;color:#3d5170;margin-top:3px}
      </style></head><body>
      <div class="company">${escapeHtml(FVR_COMPANY_NAME)}</div>
      <div class="strapline">${escapeHtml(FVR_COMPANY_STRAPLINE)}</div>
      <div class="title">${escapeHtml(FVR_DOCUMENT_TITLE)}</div>
      <div class="date">Date: ${escapeHtml(sheetDate(row.fvrDate) || "____________")}</div>
      <table><thead><tr><th>${escapeHtml(slNo!)}</th><th>${escapeHtml(
        particulars!,
      )}</th><th>${escapeHtml(details!)}</th></tr></thead>
      <tbody>${body}</tbody></table></body></html>`);
    win.document.close();
    win.print();
    toast.info("Print view opened", {
      description: "Choose “Save as PDF” in the print dialog to keep a copy.",
    });
  }

  return (
    <SectionCard
      title="Field Verification Report"
      description={row.loanCode ? `Loan ${row.loanCode}` : ""}
      action={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="size-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={openPrintView}>
            <Printer className="size-3.5" /> Print
          </Button>
          {editable ? (
            <Button size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancel" : "Edit checklist"}
            </Button>
          ) : null}
        </div>
      }
    >
      {editing ? (
        <FvrEditor
          row={row}
          onDone={() => {
            setEditing(false);
            refresh();
          }}
        />
      ) : (
        <div className="mx-auto max-w-3xl">
          {/* The letterhead, reproduced from the supplied form. */}
          <p className="text-center text-lg font-bold text-[var(--primary)] underline">
            {FVR_COMPANY_NAME}
          </p>
          <p className="text-center text-xs">{FVR_COMPANY_STRAPLINE}</p>
          <p className="mt-5 text-center text-sm font-bold text-[var(--primary)] underline">
            {FVR_DOCUMENT_TITLE}
          </p>
          <p className="mb-2 mt-4 text-right text-xs">
            Date: {sheetDate(row.fvrDate) || "____________"}
          </p>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{slNo}</TableHead>
                <TableHead>{particulars}</TableHead>
                <TableHead className="w-[42%]">{details}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FVR_PARTICULARS.map((particular, index) => {
                const value = particular.value(row);
                return (
                  <TableRow key={particular.key}>
                    <TableCell className="align-top">{index + 1}</TableCell>
                    <TableCell className="align-top">
                      {particular.label}
                      {particular.note ? (
                        <span className="block pt-1 text-[11px] text-[var(--muted-foreground)]">
                          {particular.note}
                        </span>
                      ) : null}
                    </TableCell>
                    {/*
                      * A signature line renders the text somebody typed and
                      * nothing more — no tick, no badge, no "Signed". This
                      * product has no electronic-signature workflow and the UI
                      * must never imply one (instruction §11, D-004).
                      */}
                    <TableCell className="align-top">{value || EMPTY_DISPLAY}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only the maintenance particulars are editable. Customer name, loan amount
 *  and customer profile are authoritative CRM data and are edited where they
 *  live, not here (instruction §23, §26). */
function FvrEditor({ row, onDone }: { row: FvrRow; onDone: () => void }) {
  const { can } = useAuth();
  /** `Customer Profile` writes `customers.occupation` — the customer record, not
   *  this verification — so the control appears only for a role that may edit
   *  customers. The backend enforces the same rule; this only avoids offering a
   *  field that would be refused. */
  const canEditCustomer = can("customers.edit");

  const [form, setForm] = React.useState({
    customerProfile: row.customerProfile ?? BLANK,
    fvrDate: row.fvrDate ? row.fvrDate.slice(0, 10) : "",
    takeoverFromLender: row.takeoverFromLender ?? BLANK,
    fvrDoneByName: row.fvrDoneByName ?? BLANK,
    fvrDoneByDesignation: row.fvrDoneByDesignation ?? BLANK,
    houseConfirmation: row.houseConfirmation ?? "",
    annualIncome: row.annualIncome ?? BLANK,
    cholaRelationship: row.cholaRelationship ?? "",
    cholaOutstandingDetails: row.cholaOutstandingDetails ?? BLANK,
    newKycCustomer: row.newKycCustomer ?? "",
    remarks: row.remarks ?? BLANK,
    zensifyRmSignature: row.zensifyRmSignature ?? BLANK,
    sharvikaRmSignature: row.sharvikaRmSignature ?? BLANK,
    cholaSign: row.cholaSign ?? BLANK,
  });
  const [saving, setSaving] = React.useState(false);

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));
  /** An empty control means "not recorded", which is NULL — never an empty
   *  string masquerading as an answer. */
  const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

  async function save() {
    setSaving(true);
    try {
      await api.update(`/maintenance/fvr/${row.id}`, {
        // Omitted entirely when the role may not edit customers, so the request
        // carries no field the server would refuse.
        ...(canEditCustomer ? { customerProfile: orNull(form.customerProfile) } : {}),
        fvrDate: form.fvrDate ? new Date(form.fvrDate).toISOString() : null,
        takeoverFromLender: orNull(form.takeoverFromLender),
        fvrDoneByName: orNull(form.fvrDoneByName),
        fvrDoneByDesignation: orNull(form.fvrDoneByDesignation),
        houseConfirmation: orNull(form.houseConfirmation),
        annualIncome: form.annualIncome === "" ? null : Number(form.annualIncome),
        cholaRelationship: orNull(form.cholaRelationship),
        cholaOutstandingDetails: orNull(form.cholaOutstandingDetails),
        newKycCustomer: orNull(form.newKycCustomer),
        remarks: orNull(form.remarks),
        zensifyRmSignature: orNull(form.zensifyRmSignature),
        sharvikaRmSignature: orNull(form.sharvikaRmSignature),
        cholaSign: orNull(form.cholaSign),
      });
      toast.success("FVR checklist saved");
      onDone();
    } catch (err) {
      toast.error("Could not save the checklist", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  const YES_NO = ["Yes", "No"];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Date">
        <Input
          type="date"
          value={form.fvrDate}
          onChange={(event) => set({ fvrDate: event.target.value })}
        />
      </Field>
      <Field label="Takeover From (Existing Lender Name)">
        <Input
          value={form.takeoverFromLender}
          onChange={(event) => set({ takeoverFromLender: event.target.value })}
        />
      </Field>
      {canEditCustomer ? (
        <Field label="Customer Profile (Occupation / Business / Employment)">
          <Input
            value={form.customerProfile}
            onChange={(event) => set({ customerProfile: event.target.value })}
          />
          {/* Said plainly: this one edits the customer, not the checklist. */}
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Saved on the customer record, not on this checklist.
          </p>
        </Field>
      ) : null}
      <Field label="FVR Done By (Name)">
        <Input
          value={form.fvrDoneByName}
          onChange={(event) => set({ fvrDoneByName: event.target.value })}
        />
      </Field>
      <Field label="FVR Done By (Designation)">
        <Input
          value={form.fvrDoneByDesignation}
          onChange={(event) => set({ fvrDoneByDesignation: event.target.value })}
        />
      </Field>
      <Field label="House Confirmation (Owned / Rented)">
        <Choice
          value={form.houseConfirmation}
          options={["Owned", "Rented"]}
          onChange={(value) => set({ houseConfirmation: value })}
        />
      </Field>
      <Field label="Annual Income">
        <Input
          type="number"
          min={0}
          value={form.annualIncome}
          onChange={(event) => set({ annualIncome: event.target.value })}
        />
      </Field>
      <Field label="Any Existing Relationship with Chola (Yes / No)">
        <Choice
          value={form.cholaRelationship}
          options={YES_NO}
          onChange={(value) => set({ cholaRelationship: value })}
        />
      </Field>
      <Field label="If yes, specify details outstanding loan amount">
        <Input
          value={form.cholaOutstandingDetails}
          onChange={(event) => set({ cholaOutstandingDetails: event.target.value })}
        />
      </Field>
      <Field label="New KYC /Customer (Yes / No)">
        <Choice
          value={form.newKycCustomer}
          options={YES_NO}
          onChange={(value) => set({ newKycCustomer: value })}
        />
      </Field>
      <Field label="Remarks (if Any)">
        <Textarea
          value={form.remarks}
          onChange={(event) => set({ remarks: event.target.value })}
          rows={2}
        />
      </Field>

      <div className="md:col-span-2">
        <p className="eyebrow pb-1 text-[var(--muted-foreground)]">Signatures</p>
        <p className="pb-3 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          These record the names written on the sheet. This system has no electronic-signature
          workflow, so a name here is not a signature and authorises nothing.
        </p>
      </div>
      <Field label="Zensify RM Signature">
        <Input
          value={form.zensifyRmSignature}
          onChange={(event) => set({ zensifyRmSignature: event.target.value })}
        />
      </Field>
      <Field label="Sharvika RM Signature">
        <Input
          value={form.sharvikaRmSignature}
          onChange={(event) => set({ sharvikaRmSignature: event.target.value })}
        />
      </Field>
      <Field label="Chola RM/BM/ARBM Sign">
        <Input
          value={form.cholaSign}
          onChange={(event) => set({ cholaSign: event.target.value })}
        />
      </Field>

      <div className="md:col-span-2">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save checklist"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** A three-state control: the two answers, plus "not recorded" — because a
 *  blank on the manager's form means the question has not been answered, and
 *  defaulting it to either value would be an answer we invented. */
function Choice({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const UNSET = "__unset__";
  return (
    <Select value={value || UNSET} onValueChange={(next) => onChange(next === UNSET ? "" : next)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>Not recorded</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
