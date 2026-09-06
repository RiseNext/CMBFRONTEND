import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-[var(--input)] bg-[var(--card)] px-3 py-1 text-sm shadow-xs transition-colors outline-none",
        "placeholder:text-[var(--muted-foreground)] focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--ring)_25%,transparent)]",
        "disabled:cursor-not-allowed disabled:opacity-60 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
