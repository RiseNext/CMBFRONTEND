/**
 * In-session store for the demo dataset.
 *
 * Seeded from `buildDemoDataset()` on first read and mirrored into
 * sessionStorage so a page refresh keeps whatever the presenter added during
 * the walkthrough. Nothing is ever written to localStorage, to a cookie, or to
 * the network — closing the tab discards every edit.
 */

import { buildDemoDataset, type DemoDataset } from "./data";
import { readDemoData, writeDemoData } from "./session";

let cache: DemoDataset | null = null;

export function getDemoData(): DemoDataset {
  if (cache) return cache;

  const restored = readDemoData<DemoDataset>();
  if (restored?.customers?.length) {
    cache = restored;
    return cache;
  }

  cache = buildDemoDataset();
  writeDemoData(cache);
  return cache;
}

/** Applies a change and persists it for the rest of the browser session. */
export function mutateDemoData(apply: (data: DemoDataset) => void): DemoDataset {
  const data = getDemoData();
  apply(data);
  writeDemoData(data);
  return data;
}

/** Drops the in-memory copy. Called on sign-out alongside the storage clear. */
export function resetDemoData(): void {
  cache = null;
}

/** Next code in a series — `CUS-10048`, `LN-1075`, and so on. */
export function nextDemoCode(
  data: DemoDataset,
  series: string,
  prefix: string,
): string {
  const next = (data.sequence[series] ?? 1) + 0;
  data.sequence[series] = next + 1;
  return `${prefix}-${next}`;
}

/**
 * Stable, collision-free identifiers without pulling in a uuid dependency.
 * `crypto.randomUUID` is available in every browser this app targets; the
 * counter fallback keeps older embedded webviews working.
 */
let fallbackCounter = 0;
export function demoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackCounter += 1;
  return `demo-${Date.now().toString(36)}-${fallbackCounter}`;
}
