"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  FileText,
  HandCoins,
  Plus,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/layout/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LoanStatusChart } from "@/components/charts/loan-status-chart";
import { BankPerformanceChart } from "@/components/charts/bank-performance-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { formatCurrency, formatDate, relativeTime } from "@/lib/format";
import { initials } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useReference } from "@/hooks/use-reference";
import { useResource, useRecord, useStats } from "@/hooks/use-api";
import { num } from "@/lib/types";
import type { ActivityItem, Bank, BankOrder, Customer, Loan, Settlement, Team } from "@/lib/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const { bankName, employees } = useReference();
  // Every figure below is computed by the database. An empty database renders
  // zeroes; the demo's hardcoded totals are gone.
  /*
   * `forbidden` and `error` are read, not discarded — audit U-4, D-004 / D-049.
   *
   * `/api/dashboard/stats` is gated on `reports.view`, which **Executive does
   * not hold**. This hook used to swallow the 403 and `num()` returned 0 for
   * every key, so an Executive saw a dashboard of zeroes indistinguishable
   * from a genuinely empty book — on customer counts, disbursed value and
   * commission. Every tile below now says it cannot show the figure instead of
   * inventing one.
   */
  const {
    num: stat,
    forbidden: statsForbidden,
    error: statsError,
    loading: statsLoading,
  } = useStats("/dashboard/stats");

  /** Why a tile cannot show its number, or `undefined` when it can. */
  const statsUnavailable = statsForbidden
    ? "Your role cannot view reporting figures"
    : statsError
      ? "Could not load this figure"
      : statsLoading
        ? "Loading…"
        : undefined;
  const { data: statusRows } = useResource<{ status: string; count: number }>(
    "/dashboard/loan-status",
  );
  const { data: perfRows } = useResource<{
    bankId: string;
    cases: number;
    volume: number;
    commission: number;
  }>("/dashboard/bank-performance");
  const { data: loans } = useResource<Loan>("/loans", { pageSize: 200 });
  const { data: bankOrders } = useResource<BankOrder>("/bank-orders", { pageSize: 100 });
  const { data: settlements } = useResource<Settlement>("/settlements", { pageSize: 100 });
  const { data: customersList } = useResource<Customer>("/customers", { pageSize: 500 });
  const customerName = (id: string | null) =>
    customersList.find((c) => c.id === id)?.name ?? "Unknown";
  const activity: ActivityItem[] = [];
  const monthlyTrend: { month: string; logins: number; disbursed: number; commission: number }[] =
    [];

  const statusData = React.useMemo(
    () => Object.fromEntries(statusRows.map((r) => [r.status, r.count])) as Record<string, number>,
    [statusRows],
  );
  const performance = React.useMemo(
    () => perfRows.map((r) => ({ ...r, bank: bankName(r.bankId) })),
    [perfRows, bankName],
  );
  const stats = {
    totalCustomers: stat("total_customers"),
    activeCustomers: stat("active_customers"),
    pendingLoans: stat("pending_loans"),
    pendingInPipeline: stat("pending_loans"),
    approvedLoans: stat("approved_loans"),
    approvedInView: stat("approved_loans"),
    todaysTransactions: stat("todays_transactions"),
    disbursedValue: stat("disbursed_value"),
    commissionEarned: stat("commission_earned"),
    pendingSettlement: stat("pending_settlement"),
    activeEmployees: employees.filter((e) => e.status === "Active").length,
    activeBanks: stat("active_banks"),
    unreadNotifications: 0,
    pendingDocuments: stat("pending_documents"),
    openOrders: stat("open_orders"),
    creditedDisbursements: stat("credited_disbursements"),
    ledgerBalance: 0,
    successfulTransactions: stat("successful_transactions"),
    recentActivity: activity,
  };
  const pipeline = loans.filter((loan) =>
    ["Submitted", "Under Review", "Approved"].includes(loan.status),
  );
  const topPerformers = [...employees]
    .filter((employee) => employee.target > 0)
    .sort((a, b) => b.achieved / b.target - a.achieved / a.target)
    .slice(0, 4);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Good morning, ${user?.name?.split(" ")[0] ?? "there"}`}
        description="Live position across every partner lender — pipeline, disbursals, and commission due."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/reports">
                View reports <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild>
              <Link href="/customers">
                <Plus className="size-4" /> New customer
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
  <StatCard
    unavailable={statsUnavailable}
    label="Total customers"
    value={stats.totalCustomers.toLocaleString("en-IN")}
    helper={`${stats.activeCustomers.toLocaleString("en-IN")} active customers`}
    icon={Users}
    href="/customers"
    index={0}
  />

  <StatCard
    unavailable={statsUnavailable}
    label="Pending loans"
    value={stats.pendingLoans.toLocaleString("en-IN")}
    helper={`${stats.pendingInPipeline.toLocaleString("en-IN")} currently in pipeline`}
    icon={Clock3}
    href="/loans"
    index={1}
    accent="var(--warning)"
  />

  <StatCard
    unavailable={statsUnavailable}
    label="Approved loans"
    value={stats.approvedLoans.toLocaleString("en-IN")}
    helper="Approved or disbursed"
    icon={CheckCircle2}
    href="/bank-orders"
    index={2}
    accent="var(--success)"
  />

  <StatCard
    unavailable={statsUnavailable}
    label="Today's transactions"
    value={stats.todaysTransactions.toLocaleString("en-IN")}
    helper={`${stats.activeBanks.toLocaleString("en-IN")} active lenders`}
    icon={Wallet}
    href="/transactions"
    index={3}
    accent="var(--info)"
  />
</div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Loan overview"
          description="Application status split for the current book"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/loans">Open</Link>
            </Button>
          }
        >
          <LoanStatusChart data={statusData} />
        </SectionCard>

        <SectionCard
          title="Bank wise performance"
          description="Disbursed volume against commission earned"
          className="xl:col-span-2"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/banks">Manage banks</Link>
            </Button>
          }
        >
          <BankPerformanceChart rows={performance} />
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Disbursal and commission trend"
          description="Rolling six months"
          className="xl:col-span-2"
        >
          <TrendChart rows={monthlyTrend} />
        </SectionCard>

        <SectionCard
          title="Recent activity"
          description="What your team did today"
          contentClassName="pt-0"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/notifications">All alerts</Link>
            </Button>
          }
        >
          <ul className="divide-y divide-[var(--border)]">
            {activity.slice(0, 6).map((item) => (
              <li key={item.id} className="flex gap-3 py-3">
                <span className="mt-1 size-2 shrink-0 rounded-full bg-[var(--primary)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{item.title}</p>
                  <p className="truncate text-xs text-[var(--muted-foreground)]">
                    {item.description}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                    {item.actor} · {relativeTime(item.at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Files awaiting bank action"
          description="Sorted by oldest submission"
          className="xl:col-span-2"
          contentClassName="pt-0"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/bank-orders">Open bank orders</Link>
            </Button>
          }
        >
          <ul className="divide-y divide-[var(--border)]">
            {bankOrders
              .filter((order) => order.status !== "Cleared")
              .slice(0, 5)
              .map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">
                      {customerName(order.customerId)}{" "}
                      <span className="numeric text-xs text-[var(--muted-foreground)]">
                        {order.loanId}
                      </span>
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {bankName(order.bankId)} · {order.stage} · SLA {formatDate(order.sla)}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                  <Button variant="ghost" size="icon-sm" asChild aria-label="Open file">
                    <Link href={`/customers/${order.customerId}`}>
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </li>
              ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Team performance"
          description="Target achievement this quarter"
          contentClassName="space-y-4"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/employees">Team</Link>
            </Button>
          }
        >
          {topPerformers.map((employee) => {
            const percent = Math.round((employee.achieved / employee.target) * 100);
            return (
              <div key={employee.id} className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-7">
                    <AvatarFallback style={{ background: `${(employee.avatarColor ?? "#1d4ed8")}1a`, color: (employee.avatarColor ?? "#1d4ed8") }}>
                      {initials(employee.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{employee.name}</p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">{employee.branch}</p>
                  </div>
                  <span className="numeric text-xs font-semibold">{percent}%</span>
                </div>
                <Progress
                  value={percent}
                  indicatorClassName={percent >= 100 ? "bg-[var(--success)]" : undefined}
                />
              </div>
            );
          })}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Commission due"
          description="Invoices raised, payment not received"
          contentClassName="space-y-3"
        >
          <p className="numeric text-2xl font-semibold">
            {statsUnavailable ? (
              <span className="text-[var(--muted-foreground)]" title={statsUnavailable}>
                —
              </span>
            ) : (
              formatCurrency(stats.pendingSettlement)
            )}
          </p>
          {statsUnavailable && (
            <p className="text-[11px] text-[var(--muted-foreground)]">{statsUnavailable}</p>
          )}
          <ul className="space-y-2">
            {settlements
              .filter((settlement) => settlement.status !== "Paid")
              .map((settlement) => (
                <li key={settlement.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{bankName(settlement.bankId)}</span>
                  <span className="flex items-center gap-2">
                    <span className="numeric text-xs">{formatCurrency(num(settlement.netPayable))}</span>
                    <StatusBadge status={settlement.status} />
                  </span>
                </li>
              ))}
          </ul>
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link href="/settlements">
              <HandCoins className="size-4" /> Reconcile settlements
            </Link>
          </Button>
        </SectionCard>

        <SectionCard
          title="Pipeline value"
          description="Approved and in-progress applications"
          contentClassName="space-y-3"
        >
          <p className="numeric text-2xl font-semibold">
            {formatCurrency(
              pipeline.reduce((total, loan) => total + (num(loan.amountApproved) || num(loan.amountRequested)), 0),
              { compact: true },
            )}
          </p>
          <div className="space-y-2">
            {pipeline.slice(0, 5).map((loan) => (
              <Link
                key={loan.id}
                href={`/customers/${loan.customerId}`}
                className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-sm hover:bg-[var(--secondary)]"
              >
                <span className="truncate">{customerName(loan.customerId)}</span>
                <span className="flex items-center gap-2">
                  <span className="numeric text-xs text-[var(--muted-foreground)]">
                    {formatCurrency(num(loan.amountApproved) || num(loan.amountRequested), { compact: true })}
                  </span>
                  <StatusBadge status={loan.status} />
                </span>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Quick actions"
          description="Everything the desk uses daily"
          contentClassName="grid grid-cols-2 gap-2"
        >
          {[
            { label: "Add customer", href: "/customers", icon: Users },
            { label: "Upload documents", href: "/documents", icon: FileText },
            { label: "Record disbursal", href: "/disbursement", icon: Banknote },
            { label: "Post to ledger", href: "/ledger", icon: Wallet },
          ].map((action) => (
            <Button key={action.href} variant="outline" className="h-auto justify-start py-3" asChild>
              <Link href={action.href}>
                <action.icon className="size-4 text-[var(--primary)]" />
                <span className="text-[13px]">{action.label}</span>
              </Link>
            </Button>
          ))}
          <div className="col-span-2 rounded-lg bg-[var(--secondary)] p-3">
            <p className="text-[11px] text-[var(--muted-foreground)]">Pending documents</p>
            <p className="flex items-center gap-2 text-sm font-semibold">
              {statsUnavailable ? (
                <span className="font-normal text-[var(--muted-foreground)]">
                  {statsUnavailable}
                </span>
              ) : (
                <>
                  {stats.pendingDocuments} files need verification
                  <Badge variant="warning">Action</Badge>
                </>
              )}
            </p>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
