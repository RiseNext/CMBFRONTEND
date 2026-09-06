import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const stages = ["Login", "Credit Check", "Field Verification", "Sanction", "Disbursal Queue"];

export function PipelineRail({ current, className }: { current: string; className?: string }) {
  const activeIndex = Math.max(0, stages.indexOf(current));
  return (
    <ol className={cn("flex flex-col gap-0", className)}>
      {stages.map((stage, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li key={stage} className="relative flex gap-3 pb-5 last:pb-0">
            {index !== stages.length - 1 && (
              <span
                className={cn(
                  "absolute top-5 left-[9px] h-full w-px",
                  done ? "bg-[var(--success)]" : "bg-[var(--border)]",
                )}
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                "z-10 grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold",
                done && "border-[var(--success)] bg-[var(--success)] text-white",
                active && "border-[var(--primary)] bg-[var(--primary)] text-white",
                !done && !active && "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
              )}
            >
              {done ? <Check className="size-3" /> : index + 1}
            </span>
            <div className="-mt-0.5">
              <p
                className={cn(
                  "text-[13px] font-medium",
                  !done && !active && "text-[var(--muted-foreground)]",
                )}
              >
                {stage}
              </p>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {done ? "Cleared" : active ? "In progress with bank" : "Not started"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
