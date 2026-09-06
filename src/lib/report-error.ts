/**
 * BROWSER ERROR REPORTING — Task 15.5, the frontend half.
 *
 * ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ───────────────────────────
 *
 * It is one `sendBeacon` of a fixed envelope to whatever collector the operator
 * configures in `NEXT_PUBLIC_ERROR_TRACKING_URL`. It is **not** an SDK, for the
 * reasons D-006 and D-035 already settled — and for one more that is specific
 * to the browser: an error-tracking SDK is third-party JavaScript, and the CSP
 * this application ships (`next.config.ts`) has no allowance for one. Adding a
 * script origin to a banking application's CSP to gain error reports is a bad
 * trade, and doing it *silently* would undo half of what SEC-011 is about.
 *
 * ── WHY THE URL IS A PUBLIC VARIABLE, AND WHAT FOLLOWS FROM THAT ────────────
 *
 * `NEXT_PUBLIC_*` is compiled into the bundle and is readable by anyone. So:
 *
 *   · **there is no token here.** A credential in a public variable is not a
 *     credential. The collector endpoint must accept unauthenticated posts and
 *     be rate-limited on its own side — that is a property of the endpoint the
 *     operator chooses, and it is stated in the runbook rather than assumed;
 *   · the endpoint is therefore a **write-only sink**, and treating it as
 *     anything more is the operator's mistake to avoid.
 *
 * Unset, nothing is sent and nothing is logged to the console in production.
 *
 * ── WHAT IS IN THE ENVELOPE ─────────────────────────────────────────────────
 *
 * The error name, message, stack and `digest`; the pathname; the release. And
 * that is all.
 *
 * **No query string and no URL fragment.** Both routinely carry record ids and,
 * on this application, `?token=` — the invitation and password-reset pages take
 * their single-use credential from the query string, and a crash on one of
 * those pages would otherwise post a live token to a third party. `pathname`
 * alone answers "which screen broke" without carrying anything.
 *
 * **No user id, no email, no session data.** A crash report does not need to
 * identify a person, and the pairing of "who" with "what they were doing" is
 * exactly the thing an external sink should not accumulate.
 */

export interface BrowserErrorEnvelope {
  service: "risenext-crm-frontend";
  environment: string;
  release: string | null;
  timestamp: string;
  /** Path only — never `search` or `hash`, which carry ids and tokens. */
  pathname: string;
  error: { name: string; message: string; stack: string | null; digest: string | null };
}

const MAX_STACK = 8_000;

export const errorTrackingUrl = (): string | null =>
  process.env.NEXT_PUBLIC_ERROR_TRACKING_URL?.trim() || null;

export const errorTrackingConfigured = (): boolean => errorTrackingUrl() !== null;

export function buildBrowserEnvelope(
  error: Error & { digest?: string },
  pathname: string,
): BrowserErrorEnvelope {
  return {
    service: "risenext-crm-frontend",
    environment: process.env.NODE_ENV ?? "unknown",
    release: process.env.NEXT_PUBLIC_RELEASE_SHA?.trim() || null,
    timestamp: new Date().toISOString(),
    pathname,
    error: {
      name: error.name,
      message: error.message,
      stack: typeof error.stack === "string" ? error.stack.slice(0, MAX_STACK) : null,
      // Next.js replaces the message with a digest in production builds; it is
      // the only way to correlate a user's report with a server log.
      digest: error.digest ?? null,
    },
  };
}

/**
 * Sends the report. Returns whether anything was actually transmitted, so a
 * caller can be honest about it rather than assuming.
 *
 * `sendBeacon` first: the page is usually being torn down by the error, and a
 * `fetch` started during unload is routinely cancelled. Falls back to a
 * keepalive `fetch` where `sendBeacon` is unavailable.
 *
 * **Never throws.** This runs inside an error boundary; a reporting failure
 * that threw would replace the honest error screen with a blank one.
 */
export function reportBrowserError(
  error: Error & { digest?: string },
  pathname: string,
): boolean {
  const url = errorTrackingUrl();
  if (!url || typeof window === "undefined") return false;

  try {
    const body = JSON.stringify(buildBrowserEnvelope(error, pathname));

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      return navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    }

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      // No credentials. The collector is a third party and must never receive
      // this application's cookies.
      credentials: "omit",
    }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
