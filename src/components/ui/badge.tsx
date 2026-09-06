import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]",
        outline: "border-[var(--border)] text-[var(--muted-foreground)]",
        success: "border-transparent bg-[var(--success-soft)] text-[var(--success)]",
        warning: "border-transparent bg-[var(--warning-soft)] text-[var(--warning)]",
        danger: "border-transparent bg-[var(--danger-soft)] text-[var(--danger)]",
        info: "border-transparent bg-[var(--info-soft)] text-[var(--info)]",
        neutral: "border-transparent bg-[var(--muted)] text-[var(--muted-foreground)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
