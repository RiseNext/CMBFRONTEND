"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Download,
  XCircle,
  FileStack,
  FileText,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useReference } from "@/hooks/use-reference";
import { useResource, useRecord, useStats } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { num } from "@/lib/types";
import type { Bank, Customer, DocumentRecord } from "@/lib/types";

export default function DocumentsPage() {
  const { data: customers } = useResource<Customer>("/customers", { pageSize: 500 });
  const customerName = (id: string | null) =>
    customers.find((c) => c.id === id)?.name ?? "Unknown";
  const { data: rows, loading, error, refresh } = useResource<DocumentRecord>("/documents");
  const documentTypes = ["PAN Card", "Aadhaar", "Bank Statement", "Salary Slip", "ITR"];
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [customerId, setCustomerId] = React.useState("");
  const [uploading, setUploading] = React.useState(false);

  const [docType, setDocType] = React.useState(documentTypes[0] ?? "PAN Card");
  const [staged, setStaged] = React.useState<File[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  /*
   * Task 9.9 — double-submit guards are REFS, not state.
   *
   * `disabled` only takes effect after a re-render, so a fast double-click gets
   * through a state-only guard. These store KYC files and delete records, so
   * the window matters.
   */
  const uploadRef = React.useRef(false);
  const actionRef = React.useRef(false);
  const [acting, setActing] = React.useState<string | null>(null);

  const { can } = useAuth();
  const canUpload = can("documents.upload");
  // Task 9.7 / D-074 — a permission Admin and Super Admin hold and uploaders do
  // not, so an uploader cannot verify their own KYC document.
  const canVerify = can("documents.verify");
  const canDelete = can("documents.delete");

  function stage(files: FileList | null) {
    if (!files?.length) return;
    setStaged((prev) => [...prev, ...Array.from(files)]);
  }

  /*
   * Task 9.6 / 9.4 — the file is actually sent, DECISIONS.md D-073.
   *
   * This handler used to POST `{fileName, fileSize, mimeType}` as JSON and drop
   * the `File` on the floor (BUG-004). The register recorded that a file *was
   * named*, never that it exists — and `documents.storage_key` was a column
   * nothing wrote, so every row was a dangling pointer. For a KYC-driven
   * lending business that was, in the roadmap's own words, disqualifying.
   *
   * `api.upload()` posts multipart to `POST /api/documents/upload`, which
   * validates magic bytes, computes the checksum server-side, generates the
   * storage key and stores the object.
   *
   * ── Task 9.9 — the wrong-customer default is GONE ────────────────────────
   *
   * The old code read `customerId || customers[0]?.id`. With nothing selected
   * it filed a KYC document against **whichever customer happened to sort
   * first**, and then showed a green toast naming that wrong person. A customer
   * must now be chosen explicitly; there is no fallback.
   */
  async function upload() {
    if (!customerId) {
      toast.error("Choose a customer before uploading");
      return;
    }
    if (staged.length === 0) {
      toast.error("Choose at least one file");
      return;
    }
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) {
      toast.error("That customer is no longer available");
      return;
    }
    // Task 9.9 — a ref, because `disabled` only applies after a re-render and
    // a double-click would otherwise store the same KYC file twice.
    if (uploadRef.current) return;

    uploadRef.current = true;
    setUploading(true);
    setProgress(0);

    let stored = 0;
    try {
      for (const file of staged) {
        // Multipart, with the actual bytes. The server derives `storage_key`,
        // `checksum` and `mime_type` from what arrives — none of them is sent
        // by the client any more (SEC-024).
        const form = new FormData();
        form.append("file", file);
        form.append("bankId", customer.bankId);
        form.append("customerId", customer.id);
        form.append("docType", docType);

        await api.upload<DocumentRecord>("/documents/upload", form);
        stored += 1;
        // Real progress over the batch — the `progress` state was dead code
        // (`setProgress` was never called), which row 9.6 names explicitly.
        setProgress(Math.round((stored / staged.length) * 100));
      }
      setStaged([]);
      setOpen(false);
      refresh();
      toast.success("Documents uploaded", {
        description: `${stored} file(s) stored for ${customer.name}`,
      });
    } catch (err) {
      /*
       * Partial success is reported honestly. If three files were staged and
       * the second was refused, saying "upload failed" would be as wrong as
       * saying it succeeded — one file IS stored.
       */
      const message = errorMessage(err, "Upload failed");
      toast.error(stored > 0 ? `Stored ${stored} of ${staged.length}` : "Upload failed", {
        description: message,
      });
      refresh();
    } finally {
      uploadRef.current = false;
      setUploading(false);
      setProgress(0);
    }
  }

  /*
   * Task 9.7 — verify and reject become real.
   *
   * `setStatus` called `refresh()` and toasted; a document could be shown as
   * "Verified" in the UI while the row said `Pending` forever.
   *
   * The server requires `documents.verify` — a permission Admin and Super Admin
   * hold and uploaders do not — and refuses `→Verified` when `storage_key` is
   * null, so a document with no stored file cannot be verified into existence.
   */
  async function setStatus(row: DocumentRecord, status: DocumentRecord["status"]) {
    if (actionRef.current) return;
    if (!canVerify) return;

    actionRef.current = true;
    setActing(row.id);
    try {
      const saved = await api.update<DocumentRecord>(`/documents/${row.id}`, { status });
      const server = saved?.data;
      refresh();
      toast.success(`Marked ${(server?.status ?? status).toLowerCase()}`, {
        description: server?.fileName ?? row.fileName,
      });
    } catch (err) {
      toast.error("Status not changed", { description: errorMessage(err) });
    } finally {
      actionRef.current = false;
      setActing(null);
    }
  }

  /** Task 9.7 — a real delete. The object is removed when the bin is purged (9.8). */
  async function remove(row: DocumentRecord) {
    if (actionRef.current) return;
    if (!canDelete) return;

    actionRef.current = true;
    setActing(row.id);
    try {
      await api.remove(`/documents/${row.id}`);
      refresh();
      toast.success("Document removed", {
        description: `${row.fileName} · recoverable from the recycle bin`,
      });
    } catch (err) {
      toast.error("Could not remove that document", { description: errorMessage(err) });
    } finally {
      actionRef.current = false;
      setActing(null);
    }
  }

  /**
   * Task 9.6 — a real download.
   *
   * The old Preview and Download controls were toasts. This asks the
   * authorization-checked content route, which returns either a short-lived
   * signed URL or the bytes themselves — never a public bucket URL.
   */
  async function download(row: DocumentRecord) {
    if (!row.storageKey) {
      toast.error("That document has no stored file");
      return;
    }
    try {
      /*
       * The route answers one of two ways, and both are honest:
       *
       *   - a short-lived SIGNED URL, when the adapter can mint one, or
       *   - the bytes streamed through the backend, when it cannot.
       *
       * Never a public bucket URL (9.5). Either way the authorization check
       * happened server-side before anything was handed over — the expiry is
       * not the access control.
       */
      const res = await api.content(`/documents/${row.id}/content`);

      if (res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (!res.blob) throw new Error("No content was returned");

      const url = URL.createObjectURL(res.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = row.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Could not download that document", { description: errorMessage(err) });
    }
  }

  const columns: Column<DocumentRecord>[] = [
    {
      key: "docType",
      header: "Document type",
      sortValue: (row) => row.docType,
      render: (row) => (
        <div>
          <p className="text-[13px] font-medium">{row.docType}</p>
          <p className="numeric text-[11px] text-[var(--muted-foreground)]">{row.id}</p>
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
          className="font-medium text-[var(--primary)] hover:underline"
        >
          {customerName(row.customerId)}
        </Link>
      ),
      exportValue: (row) => customerName(row.customerId),
    },
    {
      key: "fileName",
      header: "File",
      render: (row) => (
        <span className="inline-flex items-center gap-1.5 text-[13px]">
          <FileText className="size-3.5 text-[var(--danger)]" />
          {row.fileName}
          <span className="text-[11px] text-[var(--muted-foreground)]">{row.fileSize}</span>
        </span>
      ),
      exportValue: (row) => row.fileName,
    },
    {
      key: "uploadedOn",
      header: "Uploaded",
      sortValue: (row) => row.createdAt,
      render: (row) => formatDate(row.createdAt),
      exportValue: (row) => row.createdAt,
    },
    { key: "uploadedBy", header: "By", sortValue: (row) => row.uploadedBy },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
      exportValue: (row) => row.status,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (row) => (
        <div className="flex justify-end gap-1">
          {/*
            Task 9.6 — Preview and Download were both toasts. They are one real
            control now: the content route decides whether to hand back a signed
            URL or the bytes, and a row with no stored file offers neither
            rather than pretending (D-004).
          */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Download"
            title={row.storageKey ? "Download" : "No file was stored for this record"}
            disabled={!row.storageKey}
            onClick={() => void download(row)}
          >
            <Download className="size-4" />
          </Button>
          {/*
            Task 9.7 — verify and reject need `documents.verify`, which an
            uploader does not hold. Disabled with a reason rather than hidden
            (D-049), and only ever offered on a Pending row: both other states
            are terminal.
          */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Verify"
            title={
              !canVerify
                ? "Verifying a document needs the document verification permission"
                : row.status !== "Pending"
                  ? `${row.status} is final`
                  : "Verify"
            }
            disabled={!canVerify || row.status !== "Pending" || acting === row.id}
            onClick={() => void setStatus(row, "Verified")}
          >
            <CheckCircle2 className="size-4 text-[var(--success)]" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reject"
            title={
              !canVerify
                ? "Rejecting a document needs the document verification permission"
                : row.status !== "Pending"
                  ? `${row.status} is final`
                  : "Reject"
            }
            disabled={!canVerify || row.status !== "Pending" || acting === row.id}
            onClick={() => void setStatus(row, "Rejected")}
          >
            <XCircle className="size-4 text-[var(--warning)]" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete"
            disabled={!canDelete || acting === row.id}
            onClick={() => void remove(row)}
          >
            <Trash2 className="size-4 text-[var(--danger)]" />
          </Button>
        </div>
      ),
      exportValue: () => "",
    },
  ];

  const verified = rows.filter((row) => row.status === "Verified");
  const pending = rows.filter((row) => row.status === "Pending");
  const rejected = rows.filter((row) => row.status === "Rejected");

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Document management"
        description="KYC and income documents for every file, stored against the borrower and audited on upload."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Upload className="size-4" /> Upload documents
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Documents stored" value={String(rows.length)} icon={FileStack} helper="across all customers" />
        <StatCard
          label="Verified"
          value={String(verified.length)}
          icon={CheckCircle2}
          accent="var(--success)"
          helper={`${Math.round((verified.length / rows.length) * 100)}% of the vault`}
          index={1}
        />
        <StatCard
          label="Pending checks"
          value={String(pending.length)}
          icon={FileText}
          accent="var(--warning)"
          helper="waiting on verification"
          index={2}
        />
        <StatCard
          label="Rejected"
          value={String(rejected.length)}
          icon={Trash2}
          accent="var(--danger)"
          helper="ask customer to re-submit"
          index={3}
        />
      </div>

      <SectionCard
        title="Required checklist"
        description="Standard file jacket for a salaried personal loan"
        contentClassName="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
      >
        {documentTypes.slice(0, 8).map((type) => {
          const count = rows.filter((row) => row.docType === type).length;
          return (
            <div
              key={type}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2.5"
            >
              <span className="text-[13px]">{type}</span>
              <span
                className={cn(
                  "numeric text-xs font-semibold",
                  count ? "text-[var(--success)]" : "text-[var(--muted-foreground)]",
                )}
              >
                {count}
              </span>
            </div>
          );
        })}
      </SectionCard>

      <DataTable
        rows={rows}
        columns={columns}
        exportName="risenext-documents"
        searchPlaceholder="Search file name, customer, or document type"
        searchText={(row) => `${row.fileName} ${row.docType} ${customerName(row.customerId)} ${row.uploadedBy}`}
        filters={[
          {
            key: "status",
            label: "Status",
            options: ["Verified", "Pending", "Rejected"],
            value: (row) => row.status,
          },
          { key: "type", label: "Type", options: documentTypes, value: (row) => row.docType },
        ]}
        pageSize={10}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload documents</DialogTitle>
            <DialogDescription>
              PDF, JPG, or PNG up to 10 MB each. Files attach to the selected customer.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              {/* Task 9.9 — no implicit default. An unchosen customer used to
                  fall back to `customers[0]`, filing KYC against the wrong
                  borrower and toasting their name as confirmation. */}
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name} · {customer.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              stage(event.dataTransfer.files);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
              dragging
                ? "border-[var(--primary)] bg-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--background)]",
            )}
          >
            <UploadCloud className="size-7 text-[var(--primary)]" />
            <p className="text-sm font-medium">Drop files here</p>
            <p className="text-xs text-[var(--muted-foreground)]">or pick them from your device</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => stage(event.target.files)}
            />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              Choose files
            </Button>
          </div>

          {staged.length > 0 && (
            <ul className="space-y-1.5">
              {staged.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between rounded-md bg-[var(--secondary)] px-3 py-2 text-[13px]"
                >
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setStaged((prev) => prev.filter((_, i) => i !== index))}
                    className="text-[var(--muted-foreground)] hover:text-[var(--danger)]"
                    aria-label={`Remove ${file.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {progress > 0 && <Progress value={progress} />}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void upload()}
              disabled={!canUpload || uploading || !customerId || staged.length === 0}
            >
              {uploading
                ? `Uploading… ${progress}%`
                : `Upload ${staged.length ? `${staged.length} file(s)` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
