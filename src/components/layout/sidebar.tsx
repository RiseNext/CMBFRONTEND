"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { FlaskConical, LogOut, PanelLeftClose, PanelLeftOpen, ShieldCheck } from "lucide-react";
import { visibleNavSections } from "@/lib/nav";
import { useAuth } from "@/hooks/use-auth";
import { BrandMark } from "@/components/shared/brand-mark";
import { demoNavSections, isDemoMode } from "@/lib/demo";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  /*
   * TASK 12.10 — the menu follows the session's real permissions.
   *
   * The presentation account has navigated a permission-filtered menu since
   * Wave 1. Every other session got the FULL fourteen entries regardless of
   * role: an Executive holds no `reports.view`, `settlements.view` or
   * `recycle_bin.view` and was invited into all three.
   *
   * `visibleNavSections` applies the same rule to real sessions, from the same
   * permission list the backend issued at sign-in. This is a usability change
   * and not a security one — every route is enforced by the API and each screen
   * refuses honestly when reached by URL (see `lib/nav.ts`).
   */
  const demo = isDemoMode();
  const sections = demo ? demoNavSections : visibleNavSections(user?.permissions ?? []);
  const homeHref = demo ? (sections[0]?.items[0]?.href ?? "/dashboard") : "/dashboard";

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-[width,transform] duration-200",
          collapsed ? "w-[72px]" : "w-[248px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-16 items-center justify-between px-4">
          <Link href={homeHref} onClick={onCloseMobile} className="outline-none">
            <BrandMark compact={collapsed} />
          </Link>
          <button
            type="button"
            onClick={onToggle}
            className="hidden rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white lg:block"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
          {sections.map((section) => (
            <div key={section.title} className="mb-5">
              {!collapsed && (
                <p className="eyebrow px-2 pb-2 text-white/35">{section.title}</p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onCloseMobile}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors outline-none",
                          active
                            ? "bg-[var(--primary)] text-white"
                            : "text-white/70 hover:bg-white/8 hover:text-white",
                          collapsed && "justify-center px-0",
                        )}
                      >
                        {active && !collapsed && (
                          <motion.span
                            layoutId="nav-active"
                            className="absolute inset-0 -z-10 rounded-lg bg-[var(--primary)]"
                            transition={{ type: "spring", stiffness: 340, damping: 30 }}
                          />
                        )}
                        <Icon className="size-4 shrink-0" />
                        {!collapsed && <span className="flex-1">{item.label}</span>}
                        {!collapsed && item.badge && (
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                              active ? "bg-white/20 text-white" : "bg-white/10 text-white/70",
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          {!collapsed && (
            <div className="mb-3 rounded-lg bg-white/5 p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-white/80">
                <ShieldCheck className="size-3.5 text-[var(--success)]" />
                Role based access
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                Signed in as {user?.role.name ?? "—"}
              </p>
            </div>
          )}

          {/*
           * Deliberately OUTSIDE the `!collapsed` wrapper above. The demo
           * caption used to live inside that card, so collapsing the sidebar
           * removed the only on-screen sign that the data was fabricated. It
           * now shrinks to its icon instead of disappearing, and the tooltip
           * carries the wording the label loses.
           */}
          {demo && (
            <div
              data-demo-indicator="sidebar"
              title="Demo mode — every record on screen is sample data"
              className={cn(
                "mb-3 flex items-center gap-2 rounded-lg bg-[var(--warning)]/15 px-2.5 py-2 text-[11px] font-semibold text-[var(--warning)]",
                collapsed && "justify-center px-0",
              )}
            >
              <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
              {!collapsed && <span>Demo mode · sample data</span>}
              {collapsed && <span className="sr-only">Demo mode · sample data</span>}
            </div>
          )}
          <button
            type="button"
            onClick={signOut}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-white/60 transition-colors hover:bg-white/8 hover:text-white",
              collapsed && "justify-center px-0",
            )}
          >
            <LogOut className="size-4" />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>
    </>
  );
}
