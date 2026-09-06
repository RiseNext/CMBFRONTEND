"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  delta?: number;
  helper?: string;
  icon: LucideIcon;
  href?: string;
  index?: number;
  accent?: string;
  /**
   * Why this figure cannot be shown — audit U-4, D-004 / D-049.
   *
   * When set, the card renders an em dash and this explanation **instead of**
   * `value`, `delta` and `helper`. It exists because the dashboard used to
   * render `₹0` whenever `/api/dashboard/stats` was refused, and an Executive
   * (who does not hold `reports.view`) therefore saw a book of zeroes
   * indistinguishable from a real one. A number nobody is allowed to see is not
   * zero, and a component that cannot express the difference will always be
   * asked to lie.
   */
  unavailable?: string;
}

export function StatCard({
  label,
  value,
  delta,
  helper,
  icon: Icon,
  href,
  index = 0,
  accent = "var(--primary)",
  unavailable,
}: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  const body = (
    <Card className="group relative h-full overflow-hidden p-5 transition-shadow hover:shadow-md">
      <span
        className="absolute top-0 left-0 h-full w-[3px]"
        style={{ background: unavailable ? "var(--muted-foreground)" : accent }}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="eyebrow text-[var(--muted-foreground)]">{label}</p>
          {unavailable ? (
            <p
              className="numeric text-2xl font-semibold tracking-tight text-[var(--muted-foreground)]"
              title={unavailable}
            >
              —
            </p>
          ) : (
            <p className="numeric text-2xl font-semibold tracking-tight">{value}</p>
          )}
        </div>
        <span
          className="grid size-9 place-items-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${accent} 12%, transparent)`, color: accent }}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs">
        {unavailable && <span className="text-[var(--muted-foreground)]">{unavailable}</span>}
        {!unavailable && delta !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
              positive
                ? "bg-[var(--success-soft)] text-[var(--success)]"
                : "bg-[var(--danger-soft)] text-[var(--danger)]",
            )}
          >
            {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta)}%
          </span>
        )}
        {!unavailable && helper && (
          <span className="text-[var(--muted-foreground)]">{helper}</span>
        )}
      </div>
    </Card>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      {href ? (
        <Link href={href} className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
          {body}
        </Link>
      ) : (
        body
      )}
    </motion.div>
  );
}
