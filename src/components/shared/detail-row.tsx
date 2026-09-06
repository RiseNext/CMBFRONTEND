import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function DetailRow({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-dashed border-[var(--border)] py-2 last:border-0",
        className,
      )}
    >
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      <span className={cn("text-right text-sm font-medium", mono && "numeric")}>{value}</span>
    </div>
  );
}
