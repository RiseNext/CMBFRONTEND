"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { reportBrowserError } from "@/lib/report-error";

/**
 * THE IN-APP ERROR BOUNDARY — Task 15.5.
 *
 * Catches a crash inside an authenticated screen while leaving the shell — the
 * sidebar, the topbar, the session — intact, so the user can navigate away
 * instead of reloading. `global-error.tsx` is the layer above this, for when
 * the root layout itself fails.
 *
 * ── THE COPY IS THE CAREFUL PART ────────────────────────────────────────────
 *
 * A screen that crashed mid-save is exactly where a user needs to know whether
 * their work went through, and it is exactly where the honest answer is **"we
 * cannot tell you"**. This boundary catches a *rendering* failure; the request
 * that preceded it may have succeeded on the server, or not. Saying "your
 * changes were not saved" would be a guess presented as fact, in the one place
 * that costs real money. So it says to reopen the record and check — which is
 * the action that actually resolves the uncertainty.
 *
 * It likewise does not claim anybody was notified unless a collector is
 * configured (D-004).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  React.useEffect(() => {
    // The pathname, never the query string: `?token=` and record ids live there.
    reportBrowserError(error, pathname ?? "");
  }, [error, pathname]);

  return (
    <>
      <PageHeader
        eyebrow="Error"
        title="This screen stopped working"
        description="The rest of the workspace is still running — you can move to another screen."
      />

      <SectionCard title="What happened" description="" contentClassName="space-y-4">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
          <div className="space-y-2 text-sm leading-relaxed">
            <p>
              Something failed while drawing this page. This is a fault in the application, not
              something you did.
            </p>
            <p className="text-[var(--muted-foreground)]">
              If you were part-way through saving,{" "}
              <strong className="text-[var(--foreground)]">reopen the record and check</strong>{" "}
              before trying again. The failure happened in the browser, so the server may or may
              not have accepted the change — and this page cannot tell which.
            </p>
          </div>
        </div>

        {error.digest && (
          <p className="numeric rounded-md bg-[var(--secondary)] px-3 py-2 text-[12px]">
            Reference: {error.digest}
          </p>
        )}

        {process.env.NODE_ENV !== "production" && (
          <pre className="numeric max-h-48 overflow-auto rounded-md bg-[var(--secondary)] px-3 py-2 text-[11px] whitespace-pre-wrap">
            {error.message}
          </pre>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={reset}>Try this screen again</Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Go to the dashboard</Link>
          </Button>
        </div>
      </SectionCard>
    </>
  );
}
