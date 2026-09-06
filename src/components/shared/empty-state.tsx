import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)]">
        <Icon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mx-auto max-w-sm text-xs text-[var(--muted-foreground)]">{description}</p>
      </div>
      {action}
    </div>
  );
}
