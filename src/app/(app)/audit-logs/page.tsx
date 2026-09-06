"use client";

import * as React from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ScrollText } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useAuth } from "@/hooks/use-auth";
import { useResource } from "@/hooks/use-api";
import { useReference } from "@/hooks/use-reference";
import { formatDateTime } from "@/lib/format";
import type { AuditLog } from "@/lib/types";

/**
 * THE AUDIT TRAIL — Task 12.4.
 *
 * `GET /api/audit-logs` has existed since the first migration with **zero
 * frontend callers**. The table is append-only and trigger-immutable, and until
 * now the only way to read it was a REST client or `psql`.
 *
 * ── PAGINATION IS TRUTHFUL, WHICH NEEDED A BACKEND CHANGE ───────────────────
 *
 * The route used to answer `{ page, pageSize }` and no total. From that a
 * paginator can only invent a page count or offer a Next that might land on
 * nothing — both D-004 failures. Task 12.4 added `meta.total` server-side, so
 * everything on the pager here is the server's number.
 *
 * `DataTable` is deliberately NOT used. Its server mode exists, but it also
 * carries a CSV export, and exporting the audit trail is a different thing
 * entirely: the rows carry `changes`, which after Task 13.8 holds redaction
 * placeholders for PII but still names every field that changed. A one-click
 * export of that is a data-egress path nobody has asked for and no roadmap row
 * owns. The table here is plain, and paging is the server's.
 *
 * ── SORTING IS NOT OFFERED, BECAUSE IT WOULD LIE ────────────────────────────
 *
 * The route orders by `occurred_at desc` and takes no sort parameter. A clickable
 * header would reorder the fifty rows in hand while presenting itself as ordering
 * the trail — D-051 constraint 5, the same reasoning that hid sorting in the
 * table component's server mode.
 *
 * ── THE ROWS ARE WHAT THE SERVER RETURNED ───────────────────────────────────
 *
 * No client-side filtering of any kind. Every filter is a query parameter, so
 * what is on screen and what `meta.total` counts are the same set. Before Task
 * 12.5 they were not: an operator-picked filter was silently dropped for the
 * in-scope half of a scoped caller's query.
 */

const PAGE_SIZE = 50;

/** The record types the trail actually uses, from `BIN_REGISTRY` and the routes. */
const RECORD_TYPES = [
  "customer",
  "loan",
  "bank",
  "bank_order",
  "verification",
  "disbursement",
  "settlement",
  "transaction",
  "ledger_entry",
  "document",
  "user",
  "role",
  "team",
  "setting",
  "session",
  "import_batch",
];

/** `auditActions` in `db/schema/governance.ts`. */
const ACTIONS = [
  "created",
  "updated",
  "deleted",
  "restored",
  "purged",
  "approved",
  "rejected",
  "assigned",
  "login",
  "login_failed",
  "logout",
  "password_changed",
  "permission_denied",
  "imported",
  "exported",
];

const ALL = "All";

export default function AuditLogsPage() {
  const { can } = useAuth();
  const { banks, employees, employeeName } = useReference();

  const [page, setPage] = React.useState(1);
  const [recordType, setRecordType] = React.useState(ALL);
  const [action, setAction] = React.useState(ALL);
  const [actorId, setActorId] = React.useState(ALL);
  const [bankId, setBankId] = React.useState(ALL);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [selected, setSelected] = React.useState<AuditLog | null>(null);

  const query = React.useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(recordType !== ALL ? { recordType } : {}),
      ...(action !== ALL ? { action } : {}),
      ...(actorId !== ALL ? { actorId } : {}),
      ...(bankId !== ALL ? { bankId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [page, recordType, action, actorId, bankId, from, to],
  );

  const { data: rows, total, loading, error, refresh } = useResource<AuditLog>(
    "/audit-logs",
    query,
    can("audit_logs.view"),
  );

  /** Any filter change returns to page 1 — page 7 of a narrower set is empty. */
  function narrow(apply: () => void) {
    apply();
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtersActive =
    recordType !== ALL || action !== ALL || actorId !== ALL || bankId !== ALL || from !== "" || to !== "";

  if (!can("audit_logs.view")) {
    return (
      <>
        <PageHeader eyebrow="Administration" title="Audit trail" />
        <SectionCard title="Not available to your role" description="">
          <p className="text-sm text-[var(--muted-foreground)]">
            Your role cannot read the audit trail. It needs{" "}
            <code className="text-[11px]">audit_logs.view</code>.
          </p>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Audit trail"
        description="Every recorded change, newest first. The trail is append-only — nothing here can be edited or deleted, including by an administrator."
      />

      <SectionCard title="Filters" description="Every filter is applied by the server">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="filter-record-type">Record type</Label>
            <Select
              value={recordType}
              onValueChange={(value) => narrow(() => setRecordType(value))}
            >
              <SelectTrigger id="filter-record-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {RECORD_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-action">Action</Label>
            <Select value={action} onValueChange={(value) => narrow(() => setAction(value))}>
              <SelectTrigger id="filter-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All actions</SelectItem>
                {ACTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-actor">Actor</Label>
            <Select value={actorId} onValueChange={(value) => narrow(() => setActorId(value))}>
              <SelectTrigger id="filter-actor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Anyone</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-bank">Bank</Label>
            <Select value={bankId} onValueChange={(value) => narrow(() => setBankId(value))}>
              <SelectTrigger id="filter-bank">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All banks</SelectItem>
                {banks.map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-from">From</Label>
            <Input
              id="filter-from"
              type="date"
              value={from}
              onChange={(event) => narrow(() => setFrom(event.target.value))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-to">To</Label>
            <Input
              id="filter-to"
              type="date"
              value={to}
              onChange={(event) => narrow(() => setTo(event.target.value))}
            />
          </div>
        </div>

        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() =>
              narrow(() => {
                setRecordType(ALL);
                setAction(ALL);
                setActorId(ALL);
                setBankId(ALL);
                setFrom("");
                setTo("");
              })
            }
          >
            Clear filters
          </Button>
        )}
      </SectionCard>

      {loading && <Skeleton className="h-72 w-full rounded-xl" />}

      {!loading && error && (
        <SectionCard title="Could not load the audit trail" description="Nothing is shown below">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
            <div className="space-y-2">
              <p className="text-sm">{error}</p>
              <Button variant="outline" size="sm" onClick={refresh}>
                Try again
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      {!loading && !error && rows.length === 0 && (
        <Card>
          <EmptyState
            icon={ScrollText}
            title={filtersActive ? "Nothing matches these filters" : "The trail is empty"}
            description={
              filtersActive
                ? "The server found no entries for this combination. Clear the filters to see everything you are allowed to."
                : "No changes have been recorded yet, or none that your account is allowed to see."
            }
          />
        </Card>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] card-shadow">
          <Table>
            <TableHeader className="bg-[color-mix(in_oklab,var(--secondary)_70%,transparent)]">
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-audit-row={row.id}
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => setSelected(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(row);
                    }
                  }}
                >
                  <TableCell className="numeric whitespace-nowrap text-xs">
                    {formatDateTime(row.occurredAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.actorEmail ?? employeeName(row.actorId) ?? "System"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.action.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{row.recordType.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-xs">{row.summary ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/*
           * Every number here is the server's. `total` is `meta.total`, which
           * Task 12.4 added — before it, a pager could only guess.
           */}
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2.5">
            <p className="text-xs text-[var(--muted-foreground)]">
              Page {page} of {totalPages} · {total} {total === 1 ? "entry" : "entries"}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next page"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.summary ?? "Audit entry"}</DialogTitle>
            <DialogDescription>
              {selected ? formatDateTime(selected.occurredAt) : ""} ·{" "}
              {selected?.actorEmail ?? "System"}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-3 text-[12px]">
              <div className="grid grid-cols-2 gap-2">
                <Detail label="Action" value={selected.action.replace(/_/g, " ")} />
                <Detail label="Record type" value={selected.recordType.replace(/_/g, " ")} />
                <Detail label="Record id" value={selected.recordId ?? "—"} />
                <Detail label="Actor role" value={selected.actorRoleKey ?? "—"} />
              </div>

              {selected.changes && Object.keys(selected.changes).length > 0 ? (
                <div className="space-y-1.5">
                  <p className="eyebrow">Changes</p>
                  {/*
                   * Task 13.8 lists a redacted field with `[redacted]` on both
                   * sides rather than dropping the key, so "who changed the
                   * account number and when" stays answerable. Rendering the
                   * placeholders as they arrived is the honest presentation of
                   * that — the alternative reads as "nothing happened".
                   */}
                  {Object.entries(selected.changes).map(([field, change]) => (
                    <div key={field} className="rounded-md bg-[var(--secondary)] px-2.5 py-1.5">
                      <p className="font-medium">{field}</p>
                      <p className="text-[var(--muted-foreground)]">
                        {String(change.from ?? "—")} → {String(change.to ?? "—")}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[var(--muted-foreground)]">
                  This entry records no field-level changes.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--muted-foreground)]">{label}</p>
      <p className="numeric break-all">{value}</p>
    </div>
  );
}
