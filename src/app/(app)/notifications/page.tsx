"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, BellOff, CheckCheck, ShieldOff } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { useResource } from "@/hooks/use-api";
import type { AuditLog, NotificationItem } from "@/lib/types";

/**
 * NOTIFICATIONS — Tasks 10.1, 10.2, 10.4, 10.5, 10.6, 10.9
 * DECISIONS.md D-004, D-026, D-049, D-077, D-078
 *
 * Three layers were broken independently and this page owned two of them:
 *
 *   10.1  `useState(rows)` copied the fetched array ONCE, with no syncing
 *         effect, so the page showed "Nothing to read here" no matter what the
 *         API returned — while `topbar.tsx` read the same endpoint directly and
 *         showed a badge. The bell worked and the page it linked to was blank.
 *   10.2  "Mark all read" and the per-row toggle mutated local state and
 *         toasted. `POST /notifications/:id/read` and `/read-all` both existed
 *         and had zero callers.
 *   10.9  Even fixed, the two would have disagreed: separate fetches.
 *
 * All three are now one thing — `useNotifications()`, the shared provider. The
 * page renders the canonical array; it does not copy it. That is 10.1's fix in
 * its entirety, and it is why there is no effect here to lint against
 * (`react-hooks/set-state-in-effect` is an ERROR in this repo, so the
 * "sync via effect" option the row offered was never available).
 */

const tone: Record<NotificationItem["severity"], string> = {
  info: "var(--info)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

function AlertList({
  rows,
  onRead,
  busyId,
}: {
  rows: NotificationItem[];
  onRead: (item: NotificationItem) => void;
  busyId: string | null;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={BellOff}
        title="Nothing to read here"
        description="New alerts about SLAs, settlements, and KYC land in this list."
      />
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((item) => {
        /*
         * Task 10.4 — a notification navigates to its record, or it does not
         * offer to. `link_href` is populated by the producer service; when it
         * is absent the title is plain text rather than a link to nowhere.
         */
        const title = item.linkHref ? (
          <Link href={item.linkHref} className="hover:underline">
            {item.title}
          </Link>
        ) : (
          item.title
        );

        return (
          <li key={item.id} className="flex gap-3 py-3.5">
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full"
              style={{ background: tone[item.severity] }}
            />
            <div className="min-w-0 flex-1">
              <p className={cn("text-[13px]", item.read ? "font-medium" : "font-semibold")}>
                {title}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">{item.message}</p>
              <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                {formatDateTime(item.createdAt)} · {relativeTime(item.createdAt)}
              </p>
            </div>
            {/*
              Task 10.2 — one way only. The control used to offer "Mark unread",
              for which there is NO endpoint on the real or the demo API.
              Building one to justify a button is the annexation D-043 forbids;
              leaving it was the false claim D-004 forbids. So it is gone, and a
              read row simply shows that it is read.
            */}
            {item.read ? (
              <span className="self-start text-[11px] text-[var(--muted-foreground)]">Read</span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRead(item)}
                disabled={busyId === item.id}
              >
                {busyId === item.id ? "Saving…" : "Mark read"}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Task 10.6 — real audit rows, and an honest state for everyone else.
 *
 * `audit_logs.view` is held by Super Admin and Admin only. **D-049 forbids
 * widening it to make this panel work**, and equally forbids showing an empty
 * list that implies nothing happened. So the panel is rendered for holders and
 * omitted entirely for everyone else — which row 10.6's own text permits
 * ("...or remove the panel").
 */
function TeamActivity() {
  const { can } = useAuth();
  const allowed = can("audit_logs.view");

  // `enabled` is the third positional argument — a non-holder never issues the
  // request at all, so the 403 the server would return is never provoked.
  const { data, loading, error } = useResource<AuditLog>("/audit-logs", { pageSize: 8 }, allowed);

  if (!allowed) return null;

  return (
    <SectionCard
      title="Team activity"
      description="Recent actions across the workspace"
      contentClassName="pt-0"
    >
      {loading ? (
        <div className="space-y-3 py-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={ShieldOff}
          title="Could not load activity"
          description="The audit log did not answer. Nothing is implied about what did or did not happen."
        />
      ) : !data.length ? (
        <EmptyState
          icon={BellOff}
          title="No recorded activity yet"
          description="Actions across the workspace appear here as they are audited."
        />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {data.map((item) => (
            <li key={item.id} className="py-3">
              <p className="text-[13px] font-medium">{item.summary ?? item.action}</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {item.recordType}
                {item.recordId ? ` · ${item.recordId.slice(0, 8)}` : ""}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                {item.actorEmail ?? "System"} · {relativeTime(item.occurredAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export default function NotificationsPage() {
  // Task 10.1 / 10.9 — the canonical array, rendered directly. Not copied.
  const { items, unread: unreadCount, loading, error, markRead, markAllRead } =
    useNotifications();

  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [markingAll, setMarkingAll] = React.useState(false);

  const unread = items.filter((item) => !item.read);
  const critical = items.filter(
    (item) => item.severity === "danger" || item.severity === "warning",
  );

  /*
   * Task 10.2. Every toast below follows an AWAITED result, and a refusal
   * produces an error toast — never a success one. The provider rolls its
   * optimistic write back on failure, so the row returns to unread rather than
   * sitting on a state the server declined (D-026).
   */
  async function handleRead(item: NotificationItem) {
    if (busyId) return;
    setBusyId(item.id);
    const ok = await markRead(item.id);
    setBusyId(null);
    if (!ok) toast.error("Could not mark that as read", { description: item.title });
  }

  async function handleMarkAll() {
    if (markingAll || !unread.length) return;
    setMarkingAll(true);
    const ok = await markAllRead();
    setMarkingAll(false);
    if (ok) {
      toast.success("All caught up", { description: "Every alert marked as read." });
    } else {
      toast.error("Could not mark everything as read");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description="Alerts raised by lenders, the system, and your own team."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/settings">Alert settings</Link>
            </Button>
            <Button onClick={handleMarkAll} disabled={!unread.length || markingAll}>
              <CheckCheck className="size-4" />
              {markingAll ? "Saving…" : "Mark all read"}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Alerts"
          description={
            loading
              ? "Loading…"
              : error
                ? "Could not load alerts"
                : `${unreadCount} unread of ${items.length}`
          }
          className="xl:col-span-2"
          contentClassName="pt-0"
          action={
            error ? (
              <Badge variant="danger">Unavailable</Badge>
            ) : (
              <Badge variant={unreadCount ? "warning" : "success"}>
                <Bell className="size-3" /> {unreadCount ? "Action needed" : "Clear"}
              </Badge>
            )
          }
        >
          {/*
            Task 10.5 / 7.5's class — three distinct states. A failed load is
            NOT rendered as an empty list: "we could not ask" and "you have
            nothing" are different facts and the operator needs to tell them
            apart.
          */}
          {loading ? (
            <div className="space-y-3 py-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon={ShieldOff}
              title="Could not load your alerts"
              description={error}
            />
          ) : (
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unread">Unread</TabsTrigger>
                <TabsTrigger value="critical">Critical</TabsTrigger>
              </TabsList>
              <TabsContent value="all">
                <AlertList rows={items} onRead={handleRead} busyId={busyId} />
              </TabsContent>
              <TabsContent value="unread">
                <AlertList rows={unread} onRead={handleRead} busyId={busyId} />
              </TabsContent>
              <TabsContent value="critical">
                <AlertList rows={critical} onRead={handleRead} busyId={busyId} />
              </TabsContent>
            </Tabs>
          )}
        </SectionCard>

        <TeamActivity />
      </div>
    </>
  );
}
