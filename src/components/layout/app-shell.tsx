"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { DemoModeBanner } from "@/components/layout/demo-mode-indicator";
import { useAuth } from "@/hooks/use-auth";
import { DEMO_HOME, isDemoMode, isDemoRoute } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { NotificationsProvider } from "@/hooks/use-notifications";

const CHANGE_PASSWORD_ROUTE = "/change-password";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  /*
   * The presentation account is an Executive, so the administrative screens are
   * out of reach by URL as well as by navigation.
   */
  const outOfScope = ready && Boolean(user) && isDemoMode() && !isDemoRoute(pathname);

  React.useEffect(() => {
    if (outOfScope) router.replace(DEMO_HOME);
  }, [outOfScope, router]);

  /*
   * An account still on an administrator-issued temporary password does its
   * work in one place only: replacing it. Separate from the demo guard above —
   * the demo session is never flagged, so the two never interact.
   */
  const mustChangePassword =
    ready && Boolean(user?.mustChangePassword) && pathname !== CHANGE_PASSWORD_ROUTE;

  React.useEffect(() => {
    if (mustChangePassword) router.replace(CHANGE_PASSWORD_ROUTE);
  }, [mustChangePassword, router]);

  // Held on the loading state rather than mounting the page, so a screen the
  // account cannot reach never renders even for a frame.
  if (!ready || !user || outOfScope || mustChangePassword) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--background)]">
        <div className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]">
          <span className="size-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
          Loading workspace
        </div>
      </div>
    );
  }

  /*
   * Task 10.9 / D-078 — the notification state lives HERE, not in the root
   * layout, because it wraps exactly the two consumers that must agree: the
   * `Topbar` badge and the `/notifications` page rendered into `children`.
   * Scoping it to the authenticated shell also keeps it off `/login` and the
   * invite/reset pages, which have no session to fetch for.
   */
  return (
    <NotificationsProvider>
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200",
          collapsed ? "lg:pl-[72px]" : "lg:pl-[248px]",
        )}
      >
        {/* Outside <Sidebar>, so collapsing the sidebar cannot hide it. */}
        <DemoModeBanner />
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1 space-y-6 px-4 py-6 md:px-6 lg:px-8">{children}</main>
        <footer className="border-t border-[var(--border)] px-4 py-4 text-xs text-[var(--muted-foreground)] md:px-6 lg:px-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>© 2024 Rise Next Banking Services. Loan tracking and management system.</span>
            <span className="numeric">Build 1.0.0 · Multi-bank DSA workspace</span>
          </div>
        </footer>
      </div>
    </div>
    </NotificationsProvider>
  );
}
