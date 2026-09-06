"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, FileSpreadsheet, Plus, Scale } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { formatCurrency, formatDate } from "@/lib/format";
import { exportTallyXml } from "@/lib/export";
import { toast } from "sonner";
import { useReference } from "@/hooks/use-reference";
import { useResource, useRecord, useStats } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { num } from "@/lib/types";
import type { Bank, Disbursement, LedgerEntry } from "@/lib/types";

const categories: LedgerEntry["category"][] = [
  "Commission",
  "Disbursement",
  "Payout",
  "Expense",
  "Tax",
];

export default function LedgerPage() {
  const { data: rows, loading, error, refresh } = useResource<LedgerEntry>("/ledger");
  const [open, setOpen] = React.useState(false);
  const { banks } = useReference();
  const [form, setForm] = React.useState({
    bankId: "",
    particulars: "",
    party: "",
    category: "Commission" as LedgerEntry["category"],
    direction: "credit" as "credit" | "debit",
    amount: "",
    mode: "NEFT",
  });

  const [posting, setPosting] = React.useState(false);

  async function addEntry() {
    if (!form.particulars.trim()) {
      toast.error("Add a description for the voucher");
      return;
    }
    /*
     * The bank is REQUIRED — Task 11.6(b), OPEN-7 resolved by D-084.
     *
     * This dialog never sent one. For a SCOPED caller `assertBankAccess`
     * refused a falsy `bankId` outright (`access.ts:130`), so Manager and below
     * could not post at all; for an unscoped caller the entry was written with
     * `bank_id = NULL` and, because `bankScope` uses `inArray` which never
     * matches NULL, became **permanently invisible to every scoped user**.
     *
     * Migration `0015` makes the column NOT NULL, so an omission is now a 422
     * rather than a silent hole. Checking here first turns that into a sentence
     * the user can act on.
     *
     * A selector is correct here and does NOT violate D-059: that rule forbids
     * a free bank selector where the bank is DERIVABLE from a parent record. A
     * hand-created voucher has no parent to derive from — which is exactly what
     * OPEN-7 was about.
     */
    if (!form.bankId) {
      toast.error("Choose the bank this voucher belongs to", {
        description: "Every ledger entry belongs to exactly one lender.",
      });
      return;
    }

    /*
     * Parsed as a DECIMAL — Task 11.8, D-068's client half.
     *
     * The input used to strip every non-digit, so paise could not be entered at
     * all: a commission of 1,234.56 was posted as 123456. `money` on the server
     * is numeric; it was only the browser that could not express a fraction.
     */
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }

    setPosting(true);
    try {
      const created = await api.create<LedgerEntry>("/ledger", {
        bankId: form.bankId,
        particulars: form.particulars.trim(),
        party: form.party || null,
        category: form.category,
        debit: form.direction === "debit" ? amount : 0,
        credit: form.direction === "credit" ? amount : 0,
        mode: form.mode || null,
        entryDate: new Date().toISOString(),
      });
      setOpen(false);
      refresh();
      // D-026: the server's row is authoritative, so report ITS code.
      toast.success("Voucher posted", { description: created.data.code ?? undefined });
    } catch (err) {
      toast.error("Could not post voucher", { description: errorMessage(err) });
    } finally {
      setPosting(false);
    }
  }

  const columns: Column<LedgerEntry>[] = [
    {
      key: "date",
      header: "Date",
      sortValue: (row) => row.entryDate,
      render: (row) => formatDate(row.entryDate),
      exportValue: (row) => row.entryDate,
    },
    {
      key: "voucherNo",
      header: "Voucher",
      sortValue: (row) => row.voucherNo,
      render: (row) => <span className="numeric text-xs">{row.voucherNo ?? "—"}</span>,
    },
    {
      key: "particulars",
      header: "Particulars",
      render: (row) => (
        <div className="max-w-[280px]">
          <p className="truncate text-[13px] font-medium">{row.particulars}</p>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            {row.party ?? "—"} · {row.mode ?? "—"}
          </p>
        </div>
      ),
      exportValue: (row) => row.particulars,
    },
    {
      key: "category",
      header: "Category",
      sortValue: (row) => row.category,
      render: (row) => <Badge variant="outline">{row.category}</Badge>,
      exportValue: (row) => row.category,
    },
    {
      key: "debit",
      header: "Debit",
      align: "right",
      sortValue: (row) => num(row.debit),
      render: (row) =>
        num(row.debit) ? (
          <span className="numeric text-[var(--danger)]">{formatCurrency(num(row.debit))}</span>
        ) : (
          <span className="text-[var(--muted-foreground)]">—</span>
        ),
      exportValue: (row) => num(row.debit),
    },
    {
      key: "credit",
      header: "Credit",
      align: "right",
      sortValue: (row) => num(row.credit),
      render: (row) =>
        num(row.credit) ? (
          <span className="numeric text-[var(--success)]">{formatCurrency(num(row.credit))}</span>
        ) : (
          <span className="text-[var(--muted-foreground)]">—</span>
        ),
      exportValue: (row) => num(row.credit),
    },
    {
      // Real since Task 11.7 — see the tile above.
      key: "balance",
      header: "Balance",
      align: "right",
      sortValue: (row) => num(row.balance),
      render: (row) => (
        <span className="numeric font-medium">{formatCurrency(num(row.balance))}</span>
      ),
      exportValue: (row) => num(row.balance),
    },
  ];

  const totalCredit = rows.reduce((total, row) => total + num(row.credit), 0);
  const totalDebit = rows.reduce((total, row) => total + num(row.debit), 0);

  return (
    <>
      <PageHeader
        eyebrow="Bank operations"
        title="Ledger"
        description="Single book of receipts, payouts, expenses, and tax entries for the DSA business."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                exportTallyXml(
                  "risenext-ledger-tally",
                  rows.map((row) => ({
                    date: row.entryDate,
                    narration: row.particulars,
                    party: row.party,
                    amount: num(row.credit) || num(row.debit),
                  })),
                );
                toast.success("Tally XML exported");
              }}
            >
              <FileSpreadsheet className="size-4" /> Export to Tally
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New voucher
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/*
          * REAL AGAIN — Task 11.7 landed 2026-09-06.
          *
          * This tile said "not computed yet" through Wave 1 because `balance`
          * was written as 0 by every path and recomputed by none. The server
          * now derives it as SUM(credit) − SUM(debit) over the bank's live
          * entries, inside the insert transaction and without a row lock
          * (D-027). `rows[0]` is the newest voucher because the list is ordered
          * by `entryDate` descending, so its balance IS the closing balance.
          */}
        <StatCard
          label="Closing balance"
          value={formatCurrency(num(rows[0]?.balance), { compact: true })}
          icon={Scale}
          helper="as on the latest voucher"
        />
        <StatCard
          label="Total receipts"
          value={formatCurrency(totalCredit, { compact: true })}
          icon={ArrowDownLeft}
          accent="var(--success)"
          helper={`${rows.filter((row) => num(row.credit) > 0).length} credit entries`}
          index={1}
        />
        <StatCard
          label="Total payments"
          value={formatCurrency(totalDebit, { compact: true })}
          icon={ArrowUpRight}
          accent="var(--danger)"
          helper={`${rows.filter((row) => num(row.debit) > 0).length} debit entries`}
          index={2}
        />
        <StatCard
          label="Net movement"
          value={formatCurrency(totalCredit - totalDebit, { compact: true })}
          icon={Scale}
          accent="var(--info)"
          helper="receipts less payments"
          index={3}
        />
      </div>

      <SectionCard
        title="Category split"
        description="Where the money moved this period"
        contentClassName="grid gap-3 sm:grid-cols-3 xl:grid-cols-5"
      >
        {categories.map((category) => {
          const entries = rows.filter((row) => row.category === category);
          const value = entries.reduce((total, row) => total + num(row.credit) - num(row.debit), 0);
          return (
            <div key={category} className="rounded-lg border border-[var(--border)] p-3">
              <p className="text-[11px] text-[var(--muted-foreground)]">{category}</p>
              <p
                className="numeric text-lg font-semibold"
                style={{ color: value >= 0 ? "var(--success)" : "var(--danger)" }}
              >
                {formatCurrency(value, { compact: true })}
              </p>
              <p className="text-[11px] text-[var(--muted-foreground)]">{entries.length} entries</p>
            </div>
          );
        })}
      </SectionCard>

      <DataTable
        rows={rows}
        columns={columns}
        exportName="risenext-ledger"
        searchPlaceholder="Search narration, party, or voucher"
        searchText={(row) => `${row.voucherNo ?? "—"} ${row.particulars} ${row.party ?? "—"} ${row.category}`}
        filters={[
          { key: "category", label: "Category", options: categories, value: (row) => row.category },
          {
            key: "mode",
            label: "Mode",
            options: ["NEFT", "RTGS", "IMPS", "UPI", "Card", "Challan"],
            value: (row) => row.mode ?? "",
          },
        ]}
        pageSize={10}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New voucher</DialogTitle>
            <DialogDescription>
              Post a receipt or payment against a lender.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="v-narration">Narration</Label>
              <Input
                id="v-narration"
                value={form.particulars}
                onChange={(event) => setForm({ ...form, particulars: event.target.value })}
                placeholder="Commission received — Chola May cycle"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-party">Party</Label>
              <Input
                id="v-party"
                value={form.party}
                onChange={(event) => setForm({ ...form, party: event.target.value })}
                placeholder="Chola Finance"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-amount">Amount</Label>
              <Input
                id="v-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={form.amount}
                /*
                 * Task 11.8. This was `.replace(/\D/g, "")`, which deleted the
                 * decimal point as you typed — paise were unreachable. The
                 * filter now keeps digits and at most one separator, so the
                 * field still refuses letters without refusing fractions.
                 */
                onChange={(event) => {
                  const cleaned = event.target.value
                    .replace(/[^\d.]/g, "")
                    .replace(/(\..*)\./g, "$1");
                  setForm({ ...form, amount: cleaned });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bank</Label>
              <Select
                value={form.bankId}
                onValueChange={(value) => setForm({ ...form, bankId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a bank" />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((bank) => (
                    <SelectItem key={bank.id} value={bank.id}>
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Entry type</Label>
              <Select
                value={form.direction}
                onValueChange={(value) =>
                  setForm({ ...form, direction: value as "credit" | "debit" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Receipt (credit)</SelectItem>
                  <SelectItem value="debit">Payment (debit)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(value) =>
                  setForm({ ...form, category: value as LedgerEntry["category"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Mode</Label>
              <Select value={form.mode} onValueChange={(value) => setForm({ ...form, mode: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["NEFT", "RTGS", "IMPS", "UPI", "Card", "Challan"].map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addEntry} disabled={posting}>
              {posting ? "Posting…" : "Post voucher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
