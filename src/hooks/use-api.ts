"use client";

import * as React from "react";
import { api, ApiError, errorMessage, type Paginated } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

export interface ResourceState<T> {
  data: T[];
  total: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  setData: React.Dispatch<React.SetStateAction<T[]>>;
}

type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * Loads a collection from the API. Returns an empty array (never fixtures)
 * while loading or on error, so a failure can't be mistaken for real data.
 */
export function useResource<T>(path: string, query?: Query, enabled = true): ResourceState<T> {
  const { user } = useAuth();
  const [data, setData] = React.useState<T[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(enabled);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  const queryKey = JSON.stringify(query ?? {});

  React.useEffect(() => {
    let disabled = false;
    if (!enabled || !user) {
      disabled = true;
      void Promise.resolve().then(() => {
        if (!disabled) return;
        setLoading(false);
      });
      return () => {
        disabled = false;
      };
    }
    const controller = new AbortController();
    let cancelled = false;

    // Kicked off in a microtask so the state updates happen in the async
    // continuation rather than synchronously inside the effect body.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });

    api
      .list<T>(path, JSON.parse(queryKey) as Query)
      .then((body: Paginated<T>) => {
        if (cancelled) return;
        setData(body.data ?? []);
        setTotal(body.meta?.total ?? body.data?.length ?? 0);
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError(errorMessage(err, "Could not load this list"));
        setData([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path, queryKey, nonce, enabled, user]);

  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);

  return { data, total, loading, error, refresh, setData };
}

/** Single record by id. */
export function useRecord<T>(path: string | null): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { user } = useAuth();
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(Boolean(path));
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let disabled = false;
    if (!path || !user) {
      disabled = true;
      void Promise.resolve().then(() => {
        if (!disabled) return;
        setLoading(false);
      });
      return () => {
        disabled = false;
      };
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });

    api
      .get<T>(path)
      .then((body) => {
        if (!cancelled) setData(body.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err, "Could not load this record"));
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path, nonce, user]);

  return { data, loading, error, refresh: React.useCallback(() => setNonce((n) => n + 1), []) };
}

/**
 * Dashboard statistics. Zeroes on an empty database, never invented numbers.
 *
 * ── A REFUSAL IS NOT A ZERO — audit U-4, D-004 / D-049 ─────────────────────
 *
 * This hook used to `.catch(() => setData(null))` and expose only `num()`,
 * which coalesces `null` to `0`. Every consumer therefore rendered **₹0** when
 * the request had been **refused**, and an Executive — who does not hold
 * `reports.view`, so `/api/dashboard/stats` answers **403** — saw a dashboard of
 * zeroes indistinguishable from a genuinely empty book. That is a control
 * claiming an outcome it did not achieve, on the numbers a lending business
 * runs on.
 *
 * The fix is to stop throwing the distinction away. `forbidden` says the caller
 * may not see these figures; `error` says the request failed for another
 * reason. `num()` keeps its signature — callers that legitimately want a number
 * are unchanged — but callers can now ask *why* it is zero, and the dashboard
 * does.
 */
export interface StatsState<T> {
  data: T | null;
  loading: boolean;
  /** True when the API refused on permissions — a 403. */
  forbidden: boolean;
  /** A non-permission failure, already humanised. `null` when there was none. */
  error: string | null;
  /** `0` for an absent key. Only meaningful when `!forbidden && !error`. */
  num: (key: string) => number;
}

export function useStats<T extends Record<string, unknown>>(path: string): StatsState<T> {
  const { user } = useAuth();
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [forbidden, setForbidden] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!user) {
      void Promise.resolve().then(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    /*
     * Every outcome sets all three pieces of state, so a retry cannot leave a
     * stale refusal behind. Resetting synchronously at the top of the effect
     * would be simpler to read and is what `react-hooks/set-state-in-effect`
     * forbids — it causes a cascading render on every path, including the
     * common one where nothing changed.
     */
    api
      .get<T>(path)
      .then((body) => {
        if (cancelled) return;
        setData(body.data);
        setForbidden(false);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        const denied = err instanceof ApiError && err.status === 403;
        setForbidden(denied);
        setError(denied ? null : errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, user]);

  const num = React.useCallback(
    (key: string): number => Number((data as Record<string, unknown> | null)?.[key] ?? 0),
    [data],
  );

  return { data, loading, forbidden, error, num };
}
