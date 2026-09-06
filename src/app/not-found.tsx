import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--background)] px-6">
      <div className="max-w-md space-y-3 text-center">
        <p className="eyebrow text-[var(--primary)]">404 · Page not found</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          That screen is not part of the workspace
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          The link may be outdated or the record was removed. Head back to the dashboard to pick up
          where you left off.
        </p>
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
