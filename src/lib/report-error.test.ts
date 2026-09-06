/**
 * BROWSER ERROR REPORTING — Task 15.5, the frontend half.
 *
 * ── THE CASE THAT JUSTIFIES THE FILE ────────────────────────────────────────
 *
 * Case 6. `/accept-invite?token=…` and `/reset-password?token=…` take a
 * **live, single-use credential from the query string**. A crash on either
 * page, reported naively with `window.location.href`, would POST that token to
 * a third-party collector — where it is retained, indexed, and readable by
 * anyone with access to the sink. The envelope therefore carries `pathname`
 * only, and case 6 pushes exactly that URL through to prove it.
 *
 * The rest is the same discipline the backend half gets: nothing is sent when
 * nothing is configured, and a reporting failure can never replace the honest
 * error screen with a blank one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBrowserEnvelope,
  errorTrackingConfigured,
  reportBrowserError,
} from "./report-error";

const URL_KEY = "NEXT_PUBLIC_ERROR_TRACKING_URL";
const original = process.env[URL_KEY];

/** Captures what `sendBeacon` would have transmitted, without a network. */
function captureBeacon(result = true) {
  const sent: { url: string; body: string }[] = [];
  const beacon = vi.fn((url: string, blob: Blob) => {
    // jsdom's Blob has `text()`, but it is async; the payload is built
    // synchronously so it is read from the closure instead.
    void blob;
    sent.push({ url, body: lastBody });
    return result;
  });
  let lastBody = "";
  const originalStringify = JSON.stringify;
  vi.spyOn(JSON, "stringify").mockImplementation(((value: unknown) => {
    const text = originalStringify(value);
    lastBody = text;
    return text;
  }) as typeof JSON.stringify);

  vi.stubGlobal("navigator", { sendBeacon: beacon });
  return { sent, beacon };
}

beforeEach(() => {
  delete process.env[URL_KEY];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterEach(() => {
  if (original === undefined) delete process.env[URL_KEY];
  else process.env[URL_KEY] = original;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ══ A — it sends only when configured ════════════════════════════════════ */

describe("A · nothing is transmitted unless a collector is configured", () => {
  it("1. with no URL set, nothing is sent and the caller is told so", async () => {
    const { beacon } = captureBeacon();
    expect(errorTrackingConfigured()).toBe(false);
    expect(reportBrowserError(new Error("boom"), "/dashboard")).toBe(false);
    expect(beacon).not.toHaveBeenCalled();
  });

  it("2. with a URL set, one beacon goes to that URL", async () => {
    process.env[URL_KEY] = "https://collector.example/browser";
    const { sent, beacon } = captureBeacon();

    expect(errorTrackingConfigured()).toBe(true);
    expect(reportBrowserError(new Error("boom"), "/loans")).toBe(true);
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(sent[0]!.url).toBe("https://collector.example/browser");
  });

  it("3. a sendBeacon that refuses is reported honestly, not as a success", async () => {
    process.env[URL_KEY] = "https://collector.example/browser";
    captureBeacon(false);
    expect(reportBrowserError(new Error("boom"), "/loans")).toBe(false);
  });

  it("4. a throw inside reporting is contained — the error screen must still render", async () => {
    process.env[URL_KEY] = "https://collector.example/browser";
    vi.stubGlobal("navigator", {
      sendBeacon: () => {
        throw new Error("beacon exploded");
      },
    });
    expect(() => reportBrowserError(new Error("boom"), "/loans")).not.toThrow();
    expect(reportBrowserError(new Error("boom"), "/loans")).toBe(false);
  });
});

/* ══ B — what the envelope may carry ══════════════════════════════════════ */

describe("B · the envelope carries the screen, never the credential", () => {
  it("5. it carries what an operator needs", async () => {
    const error = Object.assign(new Error("render failed"), { digest: "abc123" });
    const envelope = buildBrowserEnvelope(error, "/customers");

    expect(envelope.service).toBe("risenext-crm-frontend");
    expect(envelope.pathname).toBe("/customers");
    expect(envelope.error.message).toBe("render failed");
    expect(envelope.error.digest).toBe("abc123");
    expect(envelope.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("6. THE GUARD: a `?token=` in the address is NOT transmitted", async () => {
    // `/accept-invite` and `/reset-password` take a live single-use credential
    // from the query string. `pathname` is the whole defence, and this is the
    // case that proves the defence is the one actually in use.
    process.env[URL_KEY] = "https://collector.example/browser";
    const { sent } = captureBeacon();

    reportBrowserError(new Error("crashed while redeeming"), "/accept-invite");

    const body = sent[0]!.body;
    expect(body).toContain("/accept-invite");
    expect(body).not.toContain("token=");
    expect(body).not.toContain("?");
  });

  it("7. the envelope has no user, email or session field at all", async () => {
    // A crash report does not need to identify a person, and pairing "who"
    // with "what they were doing" is what an external sink must not accumulate.
    const envelope = buildBrowserEnvelope(new Error("x"), "/dashboard");
    const keys = Object.keys(envelope).sort();
    expect(keys).toEqual(
      ["environment", "error", "pathname", "release", "service", "timestamp"].sort(),
    );
  });

  it("8. a long stack is truncated rather than shipped whole", async () => {
    const error = new Error("deep");
    error.stack = "x".repeat(50_000);
    expect(buildBrowserEnvelope(error, "/x").error.stack!.length).toBeLessThanOrEqual(8_000);
  });

  it("9. a missing digest is null rather than the string \"undefined\"", async () => {
    expect(buildBrowserEnvelope(new Error("x"), "/x").error.digest).toBeNull();
  });
});
