/** The API returns Postgres numeric as a string and nullable columns as null,
 *  so every formatter normalises rather than forcing 100 call sites to. */

/**
 * The one place a non-finite value is caught — Tasks 7.5 and 7.7a, D-068.
 *
 * `₹NaN` was rendering on an empty database, and the roadmap named one site
 * (`disbursement/page.tsx`). It was never a one-site defect: `Number(x)` returns
 * `NaN` for any unparseable input and `Infinity` for a division by zero, and
 * every stat card in the product divides by a `rows.length` that can be 0. A
 * guard at each call site would have to be remembered ~115 times; a guard here
 * is remembered once.
 *
 * `NaN` is a genuine absence of a number, so it formats as the same em dash the
 * rest of the product uses for absent values — not as `0`, which would be a
 * figure the system does not actually have.
 */
const EMPTY = "—";

function finite(input: number | string | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return 0;
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

export function formatCurrency(
  input: number | string | null | undefined,
  options?: { compact?: boolean },
) {
  const value = finite(input);
  if (value === null) return EMPTY;
  if (options?.compact) {
    if (Math.abs(value) >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(1)} K`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(input: number | string | null | undefined) {
  const value = finite(input);
  if (value === null) return EMPTY;
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatPercent(input: number | string | null | undefined, digits = 1) {
  const value = finite(input);
  if (value === null) return EMPTY;
  return `${value.toFixed(digits)}%`;
}

export function formatDate(input: string | null | undefined) {
  if (!input) return "—";
  const value = input;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(input: string | null | undefined) {
  if (!input) return "—";
  const value = input;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(input: string | null | undefined) {
  if (!input) return "—";
  const value = input;
  const date = new Date(value).getTime();
  const now = Date.now();
  const diff = Math.round((date - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
    ["year", Number.POSITIVE_INFINITY],
  ];
  let amount = diff;
  for (const [unit, step] of units) {
    if (Math.abs(amount) < step) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        Math.round(amount),
        unit,
      );
    }
    amount /= step;
  }
  return formatDate(value);
}

export function maskAccount(input: string | null | undefined) {
  if (!input) return "—";
  const value = input;
  if (value.length <= 4) return value;
  return `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}
