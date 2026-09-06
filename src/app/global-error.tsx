"use client";

import * as React from "react";
import { reportBrowserError } from "@/lib/report-error";

/**
 * THE ROOT ERROR BOUNDARY — Task 15.5.
 *
 * Next.js renders this when the root layout itself throws, which is why it has
 * to supply its own `<html>` and `<body>`: nothing above it survived. There was
 * no boundary at all before this, so a crash in a provider produced the
 * framework's default screen — a blank page in production.
 *
 * ── WHAT THE USER IS TOLD ───────────────────────────────────────────────────
 *
 * That it broke, that nothing they were doing was saved, and the digest. The
 * **digest is the useful part**: Next.js replaces the message with it in
 * production builds, so it is the only string a user can read out that
 * correlates with the server log. A screen that says "something went wrong" and
 * nothing else makes every support call start from zero.
 *
 * The **message and stack are shown only outside production**. In a production
 * build Next has already withheld them; rendering whatever is left would risk
 * putting internals on screen for no gain.
 *
 * ── AND WHAT IS NOT CLAIMED ─────────────────────────────────────────────────
 *
 * The copy does **not** say "our team has been notified". That is true only
 * when `NEXT_PUBLIC_ERROR_TRACKING_URL` is set, and a page that asserts it
 * unconditionally is the D-004 shape applied to the one screen a user reaches
 * when they are already having a bad time. It says what it can prove.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // `location.pathname` only — never `search`, which on `/accept-invite` and
    // `/reset-password` carries a live single-use token.
    reportBrowserError(error, typeof window === "undefined" ? "" : window.location.pathname);
  }, [error]);

  const showDetail = process.env.NODE_ENV !== "production";

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f6f7f9",
          color: "#111827",
        }}
      >
        <main
          style={{
            maxWidth: 520,
            padding: "32px",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
          }}
        >
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>The workspace could not load</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#4b5563", margin: "0 0 16px" }}>
            Something failed before the page could be drawn. Nothing you were working on has been
            saved. Try again — if it keeps happening, quote the reference below to your
            administrator.
          </p>

          {error.digest && (
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
                background: "#f3f4f6",
                padding: "8px 10px",
                borderRadius: 6,
                margin: "0 0 16px",
              }}
            >
              Reference: {error.digest}
            </p>
          )}

          {showDetail && (
            <pre
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                whiteSpace: "pre-wrap",
                background: "#f3f4f6",
                padding: "8px 10px",
                borderRadius: 6,
                margin: "0 0 16px",
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {error.message}
            </pre>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              fontSize: 14,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #1d4ed8",
              background: "#1d4ed8",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
