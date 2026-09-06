import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * WAVE 1 / TRACK B — SECURITY HEADERS ON THE FRONTEND ORIGIN
 *
 *   SEC-011  no CSP anywhere; the frontend origin sets no security headers at all
 *   SEC-012  `images.remotePatterns` hostname `**` turns the Next image
 *            optimiser into an open fetch proxy
 *
 * These assert the **shipped configuration object**, not a rendered response.
 * That is deliberate and it is the strongest check available here: `headers()`
 * and `images` are static configuration consumed by Next at build and request
 * time, so if the object is right the behaviour follows, and a test that booted
 * a server would be testing Next rather than this repository.
 *
 * SEC-012's assertion is written as an **absence** check on purpose. The defect
 * was a wildcard that looked deliberate, and the fix is a deletion — so the
 * regression to guard against is somebody re-adding a permissive entry, not the
 * key changing shape.
 */

type HeaderEntry = { key: string; value: string };

async function headersFor(path = "/dashboard"): Promise<Map<string, string>> {
  const fn = nextConfig.headers;
  expect(fn, "next.config.ts must export a headers() function — SEC-011").toBeTypeOf("function");

  const groups = await fn!.call(nextConfig);
  const matched = groups.filter((g) => g.source === "/:path*" || g.source === path);
  expect(matched.length, "a header group must cover every path").toBeGreaterThan(0);

  const out = new Map<string, string>();
  for (const g of matched) {
    for (const h of g.headers as HeaderEntry[]) out.set(h.key.toLowerCase(), h.value);
  }
  return out;
}

/** Splits a CSP into `directive -> value` for assertions that read clearly. */
function directives(csp: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of csp.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const space = trimmed.indexOf(" ");
    if (space === -1) out.set(trimmed, "");
    else out.set(trimmed.slice(0, space), trimmed.slice(space + 1).trim());
  }
  return out;
}

describe("SEC-012 — the image optimiser is no longer an open fetch proxy", () => {
  it("1. no wildcard remote pattern is configured", () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];
    for (const p of patterns) {
      const host = typeof p === "string" ? p : (p.hostname ?? "");
      expect(host, "a wildcard hostname re-opens SEC-012").not.toBe("**");
      expect(host, "a bare wildcard re-opens SEC-012").not.toBe("*");
      expect(host.startsWith("**."), `over-broad hostname: ${host}`).toBe(false);
    }
  });

  it("2. the app configures no remote image hosts at all", () => {
    // Nothing in the application renders a remote image, and Task 9.6
    // deliberately avoided `next/image` for document previews so this could
    // stay a deletion. If a host is ever genuinely needed, add ONE and update
    // this expectation with the reason.
    expect(nextConfig.images?.remotePatterns ?? []).toHaveLength(0);
  });
});

describe("SEC-011 — the frontend origin sets real security headers", () => {
  it("3. a Content-Security-Policy is present", async () => {
    const h = await headersFor();
    expect(h.get("content-security-policy")).toBeTruthy();
  });

  it("4. the CSP denies framing, plugins, base-tag hijacking and off-site form posts", async () => {
    const d = directives((await headersFor()).get("content-security-policy")!);

    // These four are the directives that actually stop clickjacking, plugin
    // execution, base-tag hijacking and form exfiltration. None is weakened by
    // the inline-script allowance the config documents (D-082).
    expect(d.get("frame-ancestors")).toBe("'none'");
    expect(d.get("object-src")).toBe("'none'");
    expect(d.get("base-uri")).toBe("'self'");
    expect(d.get("form-action")).toBe("'self'");
    expect(d.get("default-src")).toBe("'self'");
  });

  it("5. the CSP does not allow inline STYLE to become inline SCRIPT by accident", async () => {
    const d = directives((await headersFor()).get("content-security-policy")!);
    // script-src carries a documented `'unsafe-inline'` until middleware mints
    // a per-request nonce (D-082). What must never appear is a source that
    // makes the directive meaningless.
    const script = d.get("script-src") ?? "";
    expect(script).toContain("'self'");
    expect(script, "a wildcard script source defeats the policy entirely").not.toContain("*");
    expect(script, "'unsafe-eval' is not needed by this app").not.toContain("'unsafe-eval'");
  });

  it("6. HSTS, X-Frame-Options, nosniff and Referrer-Policy are all present", async () => {
    const h = await headersFor();

    const hsts = h.get("strict-transport-security") ?? "";
    expect(hsts).toMatch(/max-age=\d+/);
    // Anything under a year is not a meaningful commitment.
    expect(Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0)).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain("includeSubDomains");

    expect(h.get("x-frame-options")).toBe("DENY");
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("permissions-policy")).toBeTruthy();
  });

  it("7. the headers apply to every path, not just one route", async () => {
    const groups = await nextConfig.headers!.call(nextConfig);
    expect(groups.some((g) => g.source === "/:path*")).toBe(true);
  });
});
