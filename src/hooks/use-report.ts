"use client";

import * as React from "react";
import { apiRequest, ApiError, errorMessage } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

/**
 * The loan report, fetched from the server — Task 11.3.
 *
 * The reports screen used `useResource("/loans", { pageSize: 500 })` and did
 * everything in the browser. 500 is the factory's hard maximum, so **loan 501
 * was invisible**, every filter was applied over that truncated page, and the
 * totals were sums of a sample presented as sums of the book — with nothing on
 * screen to say so.
 *
 * `summary` here is computed by the database over the **whole** filtered set,
 * not over the rows returned. That is the distinction the old screen could not
 * make and the reason the endpoint returns both in one response: two calls
 * could straddle a write and show a total that disagreed with its own rows.
 */

export interface ReportRow {
  id: string;
  code: string | null;
  bankId: string;
  customerId: string | null;
  assignedUserId: string | null;
  loanType: string;
  status: string;
  amountRequested: string;
  amountApproved: string;
  commission: string;
  appliedOn: string | null;
  createdAt: string;
}

export interface ReportSummary {
  count: number;
  approvedValue: string;
  requestedValue: string;
  commission: string;
  approvedCount: number;
}

export interface ReportMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** True when `rows` holds every matching record, not just this page. */
  complete: boolean;
  scoped: boolean;
}

export interface ReportFilters {
  from?: string;
  to?: string;
  bankId?: string;
  assignedUserId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/** `/reports/loans?from=…&to=…`, omitting anything empty. */
function withQuery(path: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${path}?${qs}` : path;
}

const EMPTY_SUMMARY: ReportSummary = {
  count: 0,
  approvedValue: "0",
  requestedValue: "0",
  commission: "0",
  approvedCount: 0,
};

interface ReportResponse {
  data: ReportRow[];
  summary: ReportSummary;
  meta: ReportMeta;
}

export interface ReportState {
  rows: ReportRow[];
  summary: ReportSummary;
  meta: ReportMeta | null;
  loading: boolean;
  /** A non-permission failure, already humanised. */
  error: string | null;
  /** The API refused on permissions — Executive holds no `reports.view`. */
  forbidden: boolean;
  /** Fetches EVERY matching row for an export. Never mutates the view. */
  fetchAll: () => Promise<ReportRow[]>;
}

/** Strips empty values so the query string carries only real filters. */
function toQuery(filters: ReportFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "" || v === "All") continue;
    out[k] = String(v);
  }
  return out;
}

export function useReport(filters: ReportFilters): ReportState {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<ReportRow[]>([]);
  const [summary, setSummary] = React.useState<ReportSummary>(EMPTY_SUMMARY);
  const [meta, setMeta] = React.useState<ReportMeta | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [forbidden, setForbidden] = React.useState(false);

  const key = JSON.stringify(toQuery(filters));

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

    // `apiRequest`, not `api.get`: this response carries `summary` and `meta`
    // alongside `data`, and `api.get` narrows to `{ data }`.
    apiRequest<ReportResponse>(withQuery("/reports/loans", JSON.parse(key) as Record<string, string>))
      .then((full) => {
        if (cancelled) return;
        setRows(full.data ?? []);
        setSummary(full.summary ?? EMPTY_SUMMARY);
        setMeta(full.meta ?? null);
        setForbidden(false);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Never leave stale figures on screen behind a failure — a report that
        // shows the previous filter's totals is worse than one that shows none.
        setRows([]);
        setSummary(EMPTY_SUMMARY);
        setMeta(null);
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
  }, [key, user]);

  /**
   * Every matching row, for an export — Task 11.9.
   *
   * `pageSize=0` is the server's "no page limit" mode. Exports previously wrote
   * whatever the component happened to hold, which in server-paged mode is one
   * page; the toast was honest about that (D-051) but the capability was still
   * missing. The server refuses past its own ceiling rather than truncating, so
   * a refusal surfaces as an error instead of a short file.
   */
  const fetchAll = React.useCallback(async () => {
    const body = await apiRequest<ReportResponse>(
      withQuery("/reports/loans", { ...toQuery(filters), pageSize: "0" }),
    );
    return body.data ?? [];
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` is the serialised `filters`

  return { rows, summary, meta, loading, error, forbidden, fetchAll };
}
