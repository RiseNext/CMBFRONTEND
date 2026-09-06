"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { NotificationItem } from "@/lib/types";

/**
 * ONE SOURCE OF NOTIFICATION STATE — Task 10.9, DECISIONS.md D-078
 *
 * Phase 10's third DoD box reads *"The bell badge and the page agree."* Before
 * this, `topbar.tsx` and `notifications/page.tsx` each ran their own
 * `useResource("/notifications")`, so **10.1 and 10.2 could both pass with the
 * box still failing**: marking something read on the page left the badge
 * counting it, until something else happened to refetch.
 *
 * The two are not in a parent/child relationship, so lifting state was not
 * available. A refetch-on-navigation would fix navigation and not mark-read,
 * which is the case the box actually names.
 *
 * So: a context provider in the app shell, which is the **existing house
 * pattern** — `use-auth.tsx` and `use-reference.tsx` are both providers over
 * fetched data. **D-006 is satisfied by reusing a pattern, not by an
 * exception**; no data-fetching or state library is added.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 *
 * No polling, no websocket, no cross-tab sync. There is no realtime transport
 * in this system and inventing one is not row 10.9's job. Two tabs can disagree
 * until one of them acts; that is a known limit, not a claim.
 */
interface NotificationsValue {
  items: NotificationItem[];
  unread: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Resolves `false` when the server refused — the caller must not claim success. */
  markRead: (id: string) => Promise<boolean>;
  markAllRead: () => Promise<boolean>;
}

const NotificationsContext = React.createContext<NotificationsValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    if (!user) {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setItems([]);
          setError(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });

    api
      .list<NotificationItem>("/notifications", { pageSize: 50 })
      .then((res) => {
        if (!cancelled) setItems(res.data ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        /*
         * A failed load is recorded, not swallowed. The badge hides itself when
         * `error` is set rather than showing 0 — an unread count of zero that
         * is really "we could not ask" is a false statement about the user's
         * work (D-004).
         */
        setError(err instanceof Error ? err.message : "Could not load notifications");
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  const value = React.useMemo<NotificationsValue>(() => {
    /**
     * Optimistic, then reconciled against the server — D-026.
     *
     * The row is flipped locally so the list responds immediately, the request
     * is awaited, and the local write is ROLLED BACK if the server refused.
     * Nothing here reports success the backend did not perform.
     */
    const mutate = async (
      apply: (rows: NotificationItem[]) => NotificationItem[],
      call: () => Promise<unknown>,
    ): Promise<boolean> => {
      const before = items;
      setItems(apply);
      try {
        await call();
        return true;
      } catch {
        setItems(before);
        return false;
      }
    };

    return {
      items,
      // An errored load has no honest count, so it contributes none.
      unread: error ? 0 : items.filter((item) => !item.read).length,
      loading,
      error,
      refresh: () => setNonce((n) => n + 1),
      markRead: (id) =>
        mutate(
          (rows) =>
            rows.map((row) =>
              row.id === id ? { ...row, read: true, readAt: new Date().toISOString() } : row,
            ),
          () => api.action(`/notifications/${id}/read`, {}),
        ),
      markAllRead: () =>
        mutate(
          (rows) =>
            rows.map((row) =>
              row.read ? row : { ...row, read: true, readAt: new Date().toISOString() },
            ),
          () => api.action("/notifications/read-all", {}),
        ),
    };
  }, [items, loading, error]);

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsValue {
  const value = React.useContext(NotificationsContext);
  if (!value) {
    throw new Error("useNotifications must be used inside a NotificationsProvider");
  }
  return value;
}
