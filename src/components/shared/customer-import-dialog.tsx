"use client";

import * as React from "react";
import { CheckCircle2, CircleAlert, Copy, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, API_BASE_URL, apiRequest, errorMessage, getAccessToken } from "@/lib/api";
import type { ImportPreview } from "@/lib/types";
import { toast } from "sonner";

/**
 * Upload → validate → preview → confirm → import.
 *
 * Uploading only *stages* the file: nothing reaches the customers table until
 * the user confirms, and only rows the server marked `valid` are inserted.
 * Rows for a bank the user is not assigned to come back as invalid.
 */
export function CustomerImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [busy, setBusy] = React.useState(false);

  function reset() {
    setFile(null);
    setPreview(null);
    setBusy(false);
  }

  async function downloadTemplate() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/imports/template/customers`, {
        headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
        credentials: "include",
      });
      if (!response.ok) throw new Error("Template download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "customer-import-template.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Could not download template", { description: errorMessage(err) });
    }
  }

  async function validate() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api.upload<ImportPreview>("/imports/customers", form);
      setPreview(result.data);
      toast.success("File validated", {
        description: `${result.data.valid} of ${result.data.total} rows are ready to import`,
      });
    } catch (err) {
      toast.error("Validation failed", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await apiRequest<{ data: { imported: number; skipped: number } }>(
        `/imports/${preview.batchId}/confirm`,
        { method: "POST", body: {} },
      );
      toast.success(`Imported ${result.data.imported} customer(s)`, {
        description:
          result.data.skipped > 0 ? `${result.data.skipped} row(s) were skipped` : undefined,
      });
      onImported();
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error("Import failed", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const badRows = preview?.preview.filter((r) => r.status !== "valid") ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import customers from Excel</DialogTitle>
          <DialogDescription>
            Download the template, fill it in, then upload. Nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-4">
            <Button variant="outline" onClick={() => void downloadTemplate()} className="w-full">
              <Download className="size-4" /> Download template
            </Button>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-6 py-10 text-center transition-colors hover:border-[var(--ring)]">
              <FileSpreadsheet className="size-6 text-[var(--muted-foreground)]" />
              <span className="text-sm font-medium">
                {file ? file.name : "Choose an .xlsx file"}
              </span>
              <span className="text-[11px] text-[var(--muted-foreground)]">
                Bank Code, Bank Reference ID, Customer Name and Mobile are required
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Total", value: preview.total, tone: "" },
                { label: "Valid", value: preview.valid, tone: "text-[var(--success)]" },
                { label: "Invalid", value: preview.invalid, tone: "text-[var(--danger)]" },
                { label: "Duplicates", value: preview.duplicate, tone: "text-[var(--warning)]" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
                >
                  <p className={`numeric text-lg font-semibold ${stat.tone}`}>{stat.value}</p>
                  <p className="text-[11px] text-[var(--muted-foreground)]">{stat.label}</p>
                </div>
              ))}
            </div>

            {badRows.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead>Problem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {badRows.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell className="numeric">{row.rowNumber}</TableCell>
                        <TableCell>
                          <span
                            className={
                              row.status === "duplicate"
                                ? "text-[var(--warning)]"
                                : "text-[var(--danger)]"
                            }
                          >
                            {row.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {(row.errors ?? [])
                            .map((e) => `${e.field}: ${e.message}`)
                            .join(" · ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <p className="flex items-start gap-2 text-xs text-[var(--muted-foreground)]">
              {preview.valid > 0 ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]" />
              ) : (
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--danger)]" />
              )}
              Only the {preview.valid} valid row(s) will be imported. Invalid and duplicate rows are
              skipped and left untouched.
            </p>
          </div>
        )}

        <DialogFooter>
          {!preview ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => void validate()} disabled={!file || busy}>
                <Upload className="size-4" /> {busy ? "Validating…" : "Validate"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={reset} disabled={busy}>
                <Copy className="size-4" /> Choose another file
              </Button>
              <Button onClick={() => void confirmImport()} disabled={busy || preview.valid === 0}>
                {busy ? "Importing…" : `Import ${preview.valid} customer(s)`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
