/**
 * Demo session flag.
 *
 * Held in sessionStorage so it dies with the browser tab and can never outlive
 * a presentation. Every accessor is guarded for SSR, because `lib/api` is
 * imported on the server even though `apiRequest` only ever runs in the browser.
 */

import { DEMO_DATA_KEY, DEMO_SESSION_KEY } from "./config";

const ACTIVE = "active";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Private browsing with storage disabled.
    return null;
  }
}

export function isDemoMode(): boolean {
  return storage()?.getItem(DEMO_SESSION_KEY) === ACTIVE;
}

export function enableDemoMode(): void {
  const store = storage();
  if (!store) return;
  store.setItem(DEMO_SESSION_KEY, ACTIVE);
  // A fresh sign-in always starts from the seeded dataset, so a previous
  // walkthrough's edits never leak into the next one.
  store.removeItem(DEMO_DATA_KEY);
}

export function disableDemoMode(): void {
  const store = storage();
  if (!store) return;
  store.removeItem(DEMO_SESSION_KEY);
  store.removeItem(DEMO_DATA_KEY);
}

export function readDemoData<T>(): T | null {
  const raw = storage()?.getItem(DEMO_DATA_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeDemoData(value: unknown): void {
  try {
    storage()?.setItem(DEMO_DATA_KEY, JSON.stringify(value));
  } catch {
    // Quota or disabled storage — the in-memory copy still serves the session.
  }
}
