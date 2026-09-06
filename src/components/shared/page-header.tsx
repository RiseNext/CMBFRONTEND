import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1.5">
        <p className="eyebrow text-[var(--primary)]">{eyebrow}</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm text-[var(--muted-foreground)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
