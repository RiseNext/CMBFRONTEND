"use client";

/**
 * DEMO MODE INDICATOR
 *
 * Whenever the presentation account is signed in, the user must be able to see
 * that the data on screen is fabricated. Everything the demo shows —
 * structurally valid PANs, real-prefix mobile numbers, IFSC codes, loan
 * amounts — looks exactly like a live pipeline, and in a lending business an
 * unlabelled screenful of that is a claim about real customers.
 *
 * Before this, the only signal was a caption in the sidebar's footer card,
 * nested inside its `{!collapsed && …}` wrapper — so collapsing the sidebar,
 * or simply being on mobile with the drawer shut, removed every trace of it.
 *
 * Two surfaces, because they fail in different places:
 *
 *   - `DemoModeBanner` sits at the top of the content column in `AppShell`,
 *     above the topbar and OUTSIDE the sidebar subtree. It cannot be hidden by
 *     collapsing the sidebar because it is not rendered by the sidebar, and it
 *     re-renders on every navigation because `AppShell` wraps every `(app)`
 *     route.
 *   - `DemoModeBadge` sits inside the topbar, which is `sticky top-0`, so the
 *     signal survives scrolling down a long customer table — the one case the
 *     banner alone would miss.
 *
 * Neither takes a `collapsed` prop, or any prop that could suppress it. That
 * is deliberate: the previous defect was a visibility signal wired to an
 * unrelated piece of layout state.
 *
 * In a production build `isDemoMode()` is a compile-time `false`
 * (`lib/demo-disabled.ts`, see docs/DECISIONS.md D-014), so both render `null`
 * and no real user can ever see either one.
 */

import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isDemoMode } from "@/lib/demo";
import { cn } from "@/lib/utils";

/**
 * Marks both surfaces for tests, so assertions do not depend on wording or
 * styling that is expected to change.
 */
export const DEMO_INDICATOR_ATTRIBUTE = "data-demo-indicator";

/** Said plainly. "Preview workspace" did not tell anyone the data was invented. */
const HEADLINE = "Demo mode";
const DETAIL = "Every record on screen is sample data. Nothing is real and nothing is saved.";

/**
 * The full-width notice. Rendered by `AppShell` above the topbar, so it is the
 * first thing on every demo screen and is unaffected by the sidebar.
 */
export function DemoModeBanner({ className }: { className?: string }) {
  if (!isDemoMode()) return null;

  return (
    <div
      role="status"
      {...{ [DEMO_INDICATOR_ATTRIBUTE]: "banner" }}
      className={cn(
        "flex items-center justify-center gap-2 border-b px-4 py-1.5 text-center text-[11px] leading-tight",
        "border-[var(--warning)]/25 bg-[var(--warning-soft)] text-[var(--warning)]",
        className,
      )}
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold">{HEADLINE}</span>
        <span className="mx-1.5 opacity-40">·</span>
        <span className="opacity-90">{DETAIL}</span>
      </span>
    </div>
  );
}

/**
 * The compact form, for the sticky topbar. Carries the same meaning in the
 * space available; the label collapses to the icon on the narrowest screens,
 * where the banner above is still doing the explaining.
 */
export function DemoModeBadge({ className }: { className?: string }) {
  if (!isDemoMode()) return null;

  return (
    <Badge
      variant="warning"
      title={DETAIL}
      aria-label={`${HEADLINE}. ${DETAIL}`}
      {...{ [DEMO_INDICATOR_ATTRIBUTE]: "badge" }}
      className={cn("shrink-0 gap-1.5 px-2 py-1", className)}
    >
      <FlaskConical className="size-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{HEADLINE}</span>
    </Badge>
  );
}
