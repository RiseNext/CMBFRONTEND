"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  FileStack,
  FileText,
  Landmark,
  Plus,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, relativeTime } from "@/lib/format";
import { useReference } from "@/hooks/use-reference";
import { useResource } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { num } from "@/lib/types";
import type {
  BankOrder,
  Customer,
  DocumentRecord,
  Loan,
  NotificationItem,
} from "@/lib/types";

/** Files still moving through the pipeline — the ones that need chasing. */
const OPEN_STATUSES = ["Draft", "Submitted", "Under Review"];

const severityTone: Record<NotificationItem["severity"], string> = {
  info: "var(--info)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

/**
 * The executive workspace: one screen answering "what do I have to do today?"
 * from the same endpoints the rest of the application already reads, so it is
 * scoped by the API to the banks and customers this user is entitled to.
 */
export default function MyWorkPage() {
  const { user } = useAuth();
  const { bankName, bankShortName } = useReference();

  /*
   * TASK 5.9 — `error` was not destructured here, and that omission produced a
   * false business claim one screen over from the /loans one.
   *
   * `useResource` blanks `data` when the request rejects
   * (`use-api.ts:62-67`), so a failed `/loans` load left `loans` empty,
   * `openFiles` empty, and the priority queue fell through to its EmptyState:
   * "Nothing waiting on you — Every file in your book has reached a decision."
   * That is an affirmative statement about the user's book, rendered because a
   * request **failed**. D-004 forbids exactly this: reporting an outcome the
   * system never achieved.
   */
  const { data: loans, loading, error: loansError, refresh: refreshLoans } =
    useResource<Loan>("/loans", { pageSize: 200 });
  const { data: customers } = useResource<Customer>("/customers", { pageSize: 500 });
  const { data: bankOrders } = useResource<BankOrder>("/bank-orders", { pageSize: 100 });
  const { data: documents } = useResource<DocumentRecord>("/documents", { pageSize: 100 });
  const { data: notifications } = useResource<NotificationItem>("/notifications");

  const customerName = React.useCallback(
    (id: string | null) => customers.find((row) => row.id === id)?.name ?? "Unknown",
    [customers],
  );

  const openFiles = loans.filter((loan) => OPEN_STATUSES.includes(loan.status));
  const sanctioned = loans.filter((loan) => ["Approved", "Disbursed"].includes(loan.status));
  const sanctionedValue = sanctioned.reduce((total, loan) => total + num(loan.amountApproved), 0);
  const pendingDocs = documents.filter((doc) => doc.status !== "Verified");
  const unread = notifications.filter((item) => !item.read);
  const kycPending = customers.filter((row) => row.kyc === "Pending");

  const columns: Column<Loan>[] = [
    {
      key: "code",
      header: "File",
      sortValue: (row) => row.code,
      render: (row) => (
        <div>
          <p className="numeric font-medium">{row.code}</p>
          <p className="text-[11px] text-[var(--muted-foreground)]">{row.loanType}</p>
        </div>
      ),
      exportValue: (row) => row.code,
    },
    {
      key: "customer",
      header: "Customer",
      sortValue: (row) => customerName(row.customerId),
      render: (row) => (
        <Link
          href={`/customers/${row.customerId}`}
          onClick={(event) => event.stopPropagation()}
          className="font-medium text-[var(--primary)] hover:underline"
        >
          {customerName(row.customerId)}
        </Link>
      ),
      exportValue: (row) => customerName(row.customerId),
    },
    {
      key: "bank",
      header: "Lender",
      sortValue: (row) => bankName(row.bankId),
      render: (row) => bankShortName(row.bankId),
      exportValue: (row) => bankName(row.bankId),
    },
    {
      key: "amountRequested",
      header: "Requested",
      align: "right",
      sortValue: (row) => num(row.amountRequested),
      render: (row) => <span className="numeric">{formatCurrency(num(row.amountRequested))}</span>,
      exportValue: (row) => num(row.amountRequested),
    },
    {
      key: "priority",
      header: "Priority",
      sortValue: (row) => row.priority,
      render: (row) => (
        <Badge
          variant={
            row.priority === "Urgent"
              ? "danger"
              : row.priority === "High"
                ? "warning"
                : "neutral"
          }
        >
          {row.priority}
        </Badge>
      ),
      exportValue: (row) => row.priority,
    },
    {
      key: "status",
      header: "Stage",
      sortValue: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
      exportValue: (row) => row.status,
    },
    {
      key: "dueDate",
      header: "Next action",
      sortValue: (row) => row.dueDate,
      render: (row) => (row.dueDate ? relativeTime(row.dueDate) : "—"),
      exportValue: (row) => row.dueDate,
    },
  ];

  const firstName = (user?.name ?? "").split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow="My workspace"
        title={firstName ? `Good to see you, ${firstName}` : "My work"}
        description="Your open files, lender queues, and the documents holding them up."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/customers">Customers</Link>
            </Button>
            <Button asChild>
              <Link href="/loans">
                <Plus className="size-4" /> New application
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open files"
          value={String(openFiles.length)}
          icon={ClipboardCheck}
          helper="in progress with lenders"
          href="/loans"
        />
        <StatCard
          label="Sanctioned value"
          value={formatCurrency(sanctionedValue, { compact: true })}
          icon={TrendingUp}
          accent="var(--success)"
          helper={`${sanctioned.length} approved or disbursed`}
          href="/loans"
          index={1}
        />
        <StatCard
          label="Documents pending"
          value={String(pendingDocs.length)}
          icon={FileStack}
          accent="var(--warning)"
          helper="awaiting upload or re-verification"
          href="/documents"
          index={2}
        />
        <StatCard
          label="KYC to complete"
          value={String(kycPending.length)}
          icon={AlertTriangle}
          accent="var(--info)"
          helper="customers not yet verified"
          href="/customers"
          index={3}
        />
      </div>

      <SectionCard
        title="Priority queue"
        description="Applications that have not reached a decision yet"
        contentClassName="pt-0"
        action={
          // The count is derived from `loans`, which a failed load has emptied,
          // so on error it would read a green "0 open" — the same false claim
          // as the empty state below, in a smaller font.
          loansError ? null : (
            <Badge variant={openFiles.length ? "warning" : "success"}>
              <FileText className="size-3" /> {openFiles.length} open
            </Badge>
          )
        }
      >
        {loading ? (
          <p className="px-1 py-10 text-center text-sm text-[var(--muted-foreground)]">
            Loading your files…
          </p>
        ) : loansError ? (
          /*
           * The failure is reported instead of the queue. The table is
           * suppressed entirely rather than rendered empty beside a banner —
           * an empty grid still invites the reader to conclude there is
           * nothing to do, which is the conclusion this task exists to
           * prevent (D-031).
           */
          <div
            data-testid="my-work-loans-error"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
          >
            <span>
              {loansError} Your open files could not be loaded, so none are shown here.
            </span>
            <Button variant="outline" size="sm" onClick={refreshLoans}>
              Try again
            </Button>
          </div>
        ) : (
          <DataTable
            rows={openFiles}
            columns={columns}
            pageSize={6}
            exportName="risenext-my-work"
            searchPlaceholder="Search file number, customer, or lender"
            searchText={(row) =>
              `${row.code} ${row.applicationNo ?? ""} ${customerName(row.customerId)} ${bankName(row.bankId)} ${row.loanType}`
            }
            filters={[
              {
                key: "status",
                label: "Stage",
                options: OPEN_STATUSES,
                value: (row) => row.status,
              },
              {
                key: "priority",
                label: "Priority",
                options: ["Urgent", "High", "Normal", "Low"],
                value: (row) => row.priority,
              },
            ]}
            emptyState={
              <EmptyState
                icon={CheckCircle2}
                title="Nothing waiting on you"
                description="Every file in your book has reached a decision. New applications appear here as soon as they are logged."
              />
            }
          />
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="With the lender"
          description="Files sitting in a bank queue"
          className="xl:col-span-2"
          contentClassName="pt-0"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/bank-orders">Open bank orders</Link>
            </Button>
          }
        >
          {bankOrders.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {bankOrders.slice(0, 5).map((order) => (
                <li key={order.id} className="flex items-center gap-3 py-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--secondary)] text-[var(--muted-foreground)]">
                    <Landmark className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">
                      {customerName(order.customerId)}{" "}
                      <span className="text-[var(--muted-foreground)]">
                        · {bankShortName(order.bankId)}
                      </span>
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {order.stage} · {order.officer ?? "Unassigned officer"}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      SLA {order.sla ? relativeTime(order.sla) : "—"}
                    </p>
                    <p className="numeric text-[11px] text-[var(--muted-foreground)]">
                      {order.code}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Landmark}
              title="No files with a lender"
              description="Applications appear here once they have been logged into a bank portal."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Alerts"
          description={`${unread.length} unread`}
          contentClassName="pt-0"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/notifications">All alerts</Link>
            </Button>
          }
        >
          {notifications.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {notifications.slice(0, 5).map((item) => (
                <li key={item.id} className="flex gap-3 py-3">
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full"
                    style={{ background: severityTone[item.severity] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{item.title}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{item.message}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                      {relativeTime(item.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Bell}
              title="No alerts"
              description="SLA warnings, lender queries, and disbursal updates land here."
            />
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Recently added customers"
        description="The newest names in your book"
        contentClassName="pt-0"
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/customers">View all</Link>
          </Button>
        }
      >
        {customers.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {customers.slice(0, 5).map((customer) => (
              <li key={customer.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="text-[13px] font-medium text-[var(--primary)] hover:underline"
                  >
                    {customer.name}
                  </Link>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {customer.code} · {bankShortName(customer.bankId)} ·{" "}
                    {customer.city ?? "—"}
                  </p>
                </div>
                <p className="hidden text-[11px] text-[var(--muted-foreground)] sm:block">
                  Added {formatDate(customer.createdAt)}
                </p>
                <StatusBadge status={customer.kyc} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={FileText}
            title="No customers yet"
            description="Customers you add or import appear here with their KYC status."
          />
        )}
      </SectionCard>
    </>
  );
}
