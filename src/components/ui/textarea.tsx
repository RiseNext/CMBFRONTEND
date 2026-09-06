import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-20 w-full rounded-md border border-[var(--input)] bg-[var(--card)] px-3 py-2 text-sm shadow-xs outline-none",
        "placeholder:text-[var(--muted-foreground)] focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--ring)_25%,transparent)]",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
