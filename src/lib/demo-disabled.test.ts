/**
 * REGRESSION TEST — SEC-001 (exposure): the demo-disabled production build.
 *
 * `next.config.ts` aliases `@/lib/demo` to `@/lib/demo-disabled` when the demo
 * is built out, so a production bundle contains the inert module below instead
 * of the fixture layer. These tests exercise that substitution the same way the
 * bundler performs it — by replacing the module — and assert the behaviour a
 * deployed build must have.
 *
 * WHAT THIS FILE DOES NOT PROVE. It cannot show that the fixtures are absent
 * from the shipped JavaScript; only building and searching the output can do
 * that, and that evidence is recorded in docs/SECURITY_AUDIT.md. What it does
 * prove is the other half: that when the substitution happens, demo mode is
 * genuinely inert and real requests still reach the network — and that the two
 * modules cannot silently drift apart.
 */

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exactly what the bundler substitutes, expressed as a module mock.
vi.mock("@/lib/demo", async () => await import("@/lib/demo-disabled"));

import * as demoDisabled from "@/lib/demo-disabled";
import { apiRequest } from "@/lib/api";

const DEMO_SESSION_KEY = "risenext.demo.session";

/** Matches `frontend/src/lib/demo/config.ts`. Not a real credential. */
const DEMO_EMAIL = "demo.employee@risenext.com";
const DEMO_PASSWORD = "Demo@12345";

function stubFetch() {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, callsTo: (f: string) => calls.filter((u) => u.includes(f)) };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("export parity with the real demo module", () => {
  it("exposes exactly the same names, so the substituted build resolves every symbol", async () => {
    const real = await vi.importActual<Record<string, unknown>>("@/lib/demo");

    const realNames = Object.keys(real).sort();
    const stubNames = Object.keys(demoDisabled).sort();

    // A missing name is a build that fails to resolve; a spare one is dead
    // weight that suggests the two files have drifted.
    expect(stubNames).toEqual(realNames);
  });

  it("carries no credential and no fixture data of its own", () => {
    // Vitest runs from the frontend package root.
    const source = readFileSync("src/lib/demo-disabled.ts", "utf8");

    // The obvious way to satisfy a type mismatch against the real module is to
    // paste the real values in. That would put the credential straight back
    // into the production bundle, so it is asserted against here.
    expect(source).not.toContain(DEMO_PASSWORD);
    expect(source).not.toContain(DEMO_EMAIL);
    expect(source).not.toContain("Karthik Rao");
  });
});

describe("demo mode is inert", () => {
  it("isDemoMode() stays false even when the session flag is planted by hand", () => {
    // The production requirement, stated directly: someone running
    // `sessionStorage["risenext.demo.session"] = "active"` in devtools on a
    // deployed build must gain nothing.
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "active");

    expect(demoDisabled.isDemoMode()).toBe(false);
  });

  it("enableDemoMode() cannot start a session", () => {
    demoDisabled.enableDemoMode();

    expect(demoDisabled.isDemoMode()).toBe(false);
  });

  it("does not recognise the demo credentials", () => {
    // They fall through to the real login request and are rejected by the
    // server like any other unknown account.
    expect(demoDisabled.isDemoCredentials(DEMO_EMAIL, DEMO_PASSWORD)).toBe(false);
  });

  it("has no navigation, no permissions and no persona", () => {
    expect(demoDisabled.demoNavSections).toEqual([]);
    expect(demoDisabled.DEMO_PERMISSIONS).toEqual([]);
    expect(demoDisabled.DEMO_SESSION_USER.email).toBe("");
    expect(demoDisabled.DEMO_SESSION_USER.permissions).toEqual([]);
    expect(demoDisabled.isDemoRoute("/customers")).toBe(false);
  });

  it("refuses to answer a request rather than serving fabricated data", async () => {
    // Structurally unreachable — but if it is ever reached it must be loud.
    // A fixture layer quietly answering a production request is the defect.
    await expect(demoDisabled.demoRequest("/customers")).rejects.toThrow(
      /not available in this build/i,
    );
  });
});

describe("the API layer reaches the network regardless of the flag", () => {
  it("sends a demo-served data path to the backend when the flag is set", async () => {
    const net = stubFetch();
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "active");

    await apiRequest("/customers");

    // In a demo-enabled build this is answered from fixtures and never
    // reaches fetch. Here there are no fixtures to answer it.
    expect(net.callsTo("/api/customers")).toHaveLength(1);
  });

  it("sends a login to the backend when the flag is set", async () => {
    const net = stubFetch();
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "active");

    await apiRequest("/auth/login", {
      method: "POST",
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      skipAuthRetry: true,
    });

    expect(net.callsTo("/api/auth/login")).toHaveLength(1);
  });

  it("sends even /auth/refresh to the backend, the one path the demo may answer", async () => {
    const net = stubFetch();
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "active");

    await apiRequest("/auth/refresh", { method: "POST", skipAuthRetry: true });

    // The Task 1.2 allow-list lets the demo serve this path — so it is the
    // sharpest check that there is no demo left to serve it.
    expect(net.callsTo("/api/auth/refresh")).toHaveLength(1);
  });
});
