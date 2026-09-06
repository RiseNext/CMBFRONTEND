import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  tone = "light",
  compact = false,
}: {
  className?: string;
  tone?: "light" | "dark";
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--primary)] text-white shadow-sm">
        <span className="text-[15px] font-bold leading-none">R</span>
        <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-[var(--card)] bg-[var(--warning)]" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span
            className={cn(
              "block text-[15px] font-bold tracking-tight",
              tone === "light" ? "text-white" : "text-[var(--foreground)]",
            )}
          >
            Rise Next
          </span>
          <span
            className={cn(
              "block text-[9px] font-semibold tracking-[0.22em] uppercase",
              tone === "light" ? "text-white/60" : "text-[var(--muted-foreground)]",
            )}
          >
            Banking Services
          </span>
        </span>
      )}
    </div>
  );
}
