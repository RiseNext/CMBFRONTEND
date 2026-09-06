"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, ExternalLink, Percent, Plus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailRow } from "@/components/shared/detail-row";
import { SectionCard } from "@/components/layout/section-card";
import { BankPerformanceChart } from "@/components/charts/bank-performance-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { useReference } from "@/hooks/use-reference";
import { useResource, useRecord, useStats } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { num } from "@/lib/types";
import type { Bank, Loan, Settlement } from "@/lib/types";

export default function BanksPage() {
  const { refresh: refreshReference } = useReference();
  const { data: rows, loading, error, refresh } = useResource<Bank>("/banks");
  const { data: loans } = useResource<Loan>("/loans", { pageSize: 500 });
  const { data: settlements } = useResource<Settlement>("/settlements", { pageSize: 500 });
  const [selected, setSelected] = React.useState<Bank | null>(null);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    vendorId: "",
    portalUrl: "",
    commissionRate: "2.0",
    spocName: "",
    spocPhone: "",
  });
  // Derived from live loans rather than a fixture generator.
  const performance = React.useMemo(
    () =>
      rows.map((bank) => {
        const mine = loans.filter((l) => l.bankId === bank.id);
        return {
          bank: bank.shortName,
          cases: mine.length,
          volume: mine.reduce((t, l) => t + num(l.amountApproved), 0),
          commission: mine.reduce((t, l) => t + num(l.commission), 0),
        };
      }),
    [rows, loans],
  );

  async function addBank() {
    if (!form.name.trim() || !form.vendorId.trim()) {
      toast.error("Missing details", { description: "Bank name and vendor ID are required." });
      return;
    }
    try {
      const created = await api.create<Bank>("/banks", {
        code: form.vendorId.trim().toUpperCase().slice(0, 20),
        name: form.name.trim(),
        shortName: form.name.trim().split(" ")[0],
        vendorId: form.vendorId.trim().toUpperCase(),
        portalUrl: form.portalUrl || null,
        logoText: form.name.slice(0, 2).toUpperCase(),
        accentColor: "#1d4ed8",
        status: "Active",
        commissionRate: Number(form.commissionRate) || 0,
        settlementCycle: "Monthly",
        spocName: form.spocName || null,
        spocPhone: form.spocPhone || null,
        productsOffered: [],
      });
      setOpen(false);
      setForm({ ...form, name: "", vendorId: "", portalUrl: "", spocName: "", spocPhone: "" });
      refresh();
      refreshReference();
      toast.success("Bank onboarded", { description: created.data.name });
    } catch (err) {
      toast.error("Could not add bank", { description: errorMessage(err) });
    }
  }

  async function toggleStatus(bank: Bank) {
    const status = bank.status === "Active" ? "Paused" : "Active";
    try {
      await api.update(`/banks/${bank.id}`, { status });
      setSelected((prev) => (prev ? { ...prev, status } : prev));
      refresh();
      refreshReference();
      toast.success(`${bank.name} ${status === "Active" ? "resumed" : "paused"}`);
    } catch (err) {
      toast.error("Could not update bank", { description: errorMessage(err) });
    }
  }

  const totalCommission = loans.reduce((total, loan) => total + num(loan.commission), 0);

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Bank management"
        description="Partner lenders, vendor codes, commission slabs, and the SPOC to call when a file is stuck."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Onboard bank
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Partner lenders"
          value={String(rows.length)}
          icon={Building2}
          helper={`${rows.filter((row) => row.status === "Active").length} active`}
        />
        <StatCard
          label="Commission booked"
          value={formatCurrency(totalCommission, { compact: true })}
          icon={Wallet}
          accent="var(--success)"
          helper="across all lenders"
          index={1}
        />
        <StatCard
          label="Average slab"
          value={`${(rows.reduce((total, row) => total + num(row.commissionRate), 0) / rows.length).toFixed(2)}%`}
          icon={Percent}
          accent="var(--info)"
          helper="of disbursed amount"
          index={2}
        />
        <StatCard
          label="Open invoices"
          value={String(settlements.filter((row) => row.status !== "Paid").length)}
          icon={Wallet}
          accent="var(--warning)"
          helper="awaiting settlement"
          index={3}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((bank) => {
          const bankLoans = loans.filter((loan) => loan.bankId === bank.id);
          const volume = bankLoans.reduce((total, loan) => total + num(loan.amountApproved), 0);
          return (
            <Card key={bank.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="grid size-10 place-items-center rounded-lg text-sm font-bold text-white"
                    style={{ background: bank.accentColor ?? "#1d4ed8" }}
                  >
                    {bank.logoText}
                  </span>
                  <div>
                    <p className="font-semibold">{bank.name}</p>
                    <p className="numeric text-[11px] text-[var(--muted-foreground)]">
                      {bank.vendorId}
                    </p>
                  </div>
                </div>
                <StatusBadge status={bank.status} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-y border-[var(--border)] py-3">
                <div>
                  <p className="text-[11px] text-[var(--muted-foreground)]">Files</p>
                  <p className="numeric text-sm font-semibold">{bankLoans.length}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--muted-foreground)]">Volume</p>
                  <p className="numeric text-sm font-semibold">
                    {formatCurrency(volume, { compact: true })}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--muted-foreground)]">Slab</p>
                  <p className="numeric text-sm font-semibold">{num(bank.commissionRate)}%</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {bank.productsOffered.map((product) => (
                  <Badge key={product} variant="outline">
                    {product}
                  </Badge>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setSelected(bank)}>
                  Details
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href={bank.portalUrl ?? "#"} target="_blank" rel="noreferrer">
                    Portal <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <SectionCard
        title="Volume and commission by lender"
        description="Where the book is concentrated"
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/reports">Full report</Link>
          </Button>
        }
      >
        <BankPerformanceChart rows={performance} />
      </SectionCard>

      <Dialog open={Boolean(selected)} onOpenChange={(value) => !value && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>
                  Onboarded {formatDate(selected.onboardedOn)} · {selected.settlementCycle}
                </DialogDescription>
              </DialogHeader>
              <div>
                <DetailRow label="Vendor ID" value={selected.vendorId} mono />
                <DetailRow label="Commission slab" value={`${num(selected.commissionRate)}%`} mono />
                <DetailRow label="Settlement cycle" value={selected.settlementCycle} />
                <DetailRow label="SPOC" value={selected.spocName} />
                <DetailRow label="SPOC phone" value={selected.spocPhone} mono />
                <DetailRow label="Products" value={selected.productsOffered.join(", ")} />
                <DetailRow label="Status" value={<StatusBadge status={selected.status} />} />
              </div>
              <DialogFooter className="sm:justify-between">
                <Button variant="outline" asChild>
                  <a href={selected.portalUrl ?? "#"} target="_blank" rel="noreferrer">
                    Open partner portal <ExternalLink className="size-3.5" />
                  </a>
                </Button>
                <Button
                  variant={selected.status === "Active" ? "destructive" : "success"}
                  onClick={() => toggleStatus(selected)}
                >
                  {selected.status === "Active" ? "Pause lender" : "Resume lender"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Onboard a bank</DialogTitle>
            <DialogDescription>
              Add the DSA code and commission slab agreed in the sourcing agreement.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="b-name">Bank name</Label>
              <Input
                id="b-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Bajaj Finserv"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-vendor">Vendor ID</Label>
              <Input
                id="b-vendor"
                value={form.vendorId}
                onChange={(event) => setForm({ ...form, vendorId: event.target.value })}
                placeholder="RN-BAJAJ-0001"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-rate">Commission slab (%)</Label>
              <Input
                id="b-rate"
                value={num(form.commissionRate)}
                onChange={(event) => setForm({ ...form, commissionRate: event.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="b-portal">Partner portal URL</Label>
              <Input
                id="b-portal"
                value={form.portalUrl}
                onChange={(event) => setForm({ ...form, portalUrl: event.target.value })}
                placeholder="https://partner.bank.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-spoc">SPOC name</Label>
              <Input
                id="b-spoc"
                value={form.spocName}
                onChange={(event) => setForm({ ...form, spocName: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-phone">SPOC phone</Label>
              <Input
                id="b-phone"
                value={form.spocPhone}
                maxLength={10}
                onChange={(event) =>
                  setForm({ ...form, spocPhone: event.target.value.replace(/\D/g, "") })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addBank}>Onboard bank</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
