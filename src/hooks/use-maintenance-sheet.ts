"use client";

import * as React from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { MaintenanceMeta, SheetResponse } from "@/lib/maintenance/types";

export type SheetQuery = Record<string, string | number | undefined>;

export interface MaintenanceSheetState<Row> {
  rows: Row[];
  /** Aggregated by the SERVER over the whole filtered set, never over the page. */
  summary: { count: number; transferAmountTotal?: string };
  meta: MaintenanceMeta | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /**
   * Every matching row, for the export path. Issues its own request with
   * `pageSize=0` rather than returning what is on screen — exporting a page and
   * calling it the sheet is the defect Task 11.9 removed from the reports
   * screen, and it would be the same defect here.
   */
  fetchAll: () => Promise<Row[]>;
}

/**
 * Loads one manager maintenance sheet. Task MM-1, D-095.
 *
 * Shaped after `useResource` deliberately, including the microtask-deferred
 * state updates: `react-hooks/set-state-in-effect` is an ERROR in this
 * repository, and setting state synchronously in the effect body is what trips
 * it. It is a separate hook only because these endpoints return a third
 * top-level key, `summary`, that `Paginated<T>` does not model.
 *
 * Returns an empty array — never fixtures, never a cached page — while loading
 * and on failure, so a refused or broken request can never be mistaken for a
 * genuinely empty sheet.
 */
export function useMaintenanceSheet<Row>(
  path: string,
  query: SheetQuery,
  enabled = true,
): MaintenanceSheetState<Row> {
  const { user } = useAuth();
  /*
   * The effect keys on the session's IDENTITY, not on the user OBJECT.
   *
   * `user` is only consulted to answer "is there a session, and is it the same
   * one?", and `id` answers that exactly. Depending on the object instead makes
   * the effect re-run on every render for any caller whose auth value is not
   * memoised — fetch, setState, render, fetch — which is an infinite request
   * loop that no amount of query memoisation upstream can prevent.
   */
  const sessionId = user?.id ?? null;
  const [rows, setRows] = React.useState<Row[]>([]);
  const [summary, setSummary] = React.useState<{ count: number; transferAmountTotal?: string }>({
    count: 0,
  });
  const [meta, setMeta] = React.useState<MaintenanceMeta | null>(null);
  const [loading, setLoading] = React.useState(enabled);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  const queryKey = JSON.stringify(query);

  React.useEffect(() => {
    if (!enabled || !sessionId) {
      void Promise.resolve().then(() => setLoading(false));
      return;
    }
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });

    /*
     * `api.list` is typed `Paginated<T>`, which models `data` and `meta` but not
     * the `summary` these endpoints also return. The response is read through
     * `SheetResponse` for that one extra key; the request itself is the ordinary
     * one every other screen makes.
     */
    api
      .list<Row>(path, JSON.parse(queryKey) as SheetQuery)
      .then((body) => {
        if (cancelled) return;
        const sheet = body as unknown as SheetResponse<Row>;
        /*
         * `Array.isArray`, not `?? []`.
         *
         * A nullish check only defends against null and undefined. A response
         * whose `data` is an object — a malformed payload, a proxy error page
         * parsed as JSON, a contract change — would pass `?? []` straight
         * through, and the first `.map` in the renderer throws inside React's
         * render phase and takes the whole screen down with it. The sheet must
         * degrade to empty, not to a blank page.
         */
        setRows(Array.isArray(sheet.data) ? sheet.data : []);
        setSummary(sheet.summary ?? { count: 0 });
        setMeta(sheet.meta ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err, "Could not load this sheet"));
        setRows([]);
        setSummary({ count: 0 });
        setMeta(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path, queryKey, nonce, enabled, sessionId]);

  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);

  const fetchAll = React.useCallback(async (): Promise<Row[]> => {
    const all = (await api.list<Row>(path, {
      ...(JSON.parse(queryKey) as SheetQuery),
      page: 1,
      pageSize: 0,
    })) as unknown as SheetResponse<Row>;
    // Same guarantee as above: the export path must receive an array or write
    // nothing, never a malformed value that throws mid-download.
    return Array.isArray(all.data) ? all.data : [];
  }, [path, queryKey]);

  return { rows, summary, meta, loading, error, refresh, fetchAll };
}
