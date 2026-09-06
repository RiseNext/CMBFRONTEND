/**
 * REGRESSION TEST — BUG-001 / SEC-001: the demo/real authentication boundary.
 *
 * The defect this locks down: demo mode is a `sessionStorage` flag, and
 * `apiRequest` diverts EVERY call into the in-browser fixture layer while it is
 * set. Nothing used to clear it on the way into a real session, so a real
 * sign-in in a tab that had once run the demo was routed to `demoRequest`,
 * which has no `/auth/login` handler — the attempt failed with "Endpoint not
 * found" and the tab stayed trapped.
 *
 * The assertions below deliberately watch `fetch`. Whether a real credential
 * reached the network is the only thing that actually distinguishes the two
 * code paths; asserting on state alone would pass even if the request were
 * still being swallowed by the fixtures.
 *
 * Scope is the boundary only — no pages, no routing, no rendering beyond the
 * provider itself.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { DEMO_EMAIL } from "@/lib/demo/config";
import { enableDemoMode, isDemoMode } from "@/lib/demo/session";
import { apiRequest, onForcedSignOut, requiresRealBackend } from "@/lib/api";

/** Matches `frontend/src/lib/demo/config.ts`. Not a real credential. */
const DEMO_PASSWORD = "Demo@12345";

const REAL_EMAIL = "super.admin@risenext.com";
const REAL_PASSWORD = "RealPassword123";

const DEMO_SESSION_KEY = "risenext.demo.session";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}));

/** The shape `POST /api/auth/login` and `/auth/refresh` return. */
const realUser = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Super Admin",
  email: REAL_EMAIL,
  role: { id: "r1", key: "super_admin", name: "Super Admin", level: 0 },
  permissions: ["users.create", "users.view"],
  bankIds: null,
  unrestrictedBankAccess: true,
  mustChangePassword: false,
};

/**
 * Mounts the provider and hands back the live context plus the root, so a test
 * can drive `signIn` exactly as the login form does.
 */
async function mountAuth() {
  const container = document.createElement("div");
  document.body.appendChild(container);

  let ctx: ReturnType<typeof useAuth> | null = null;
  function Probe() {
    ctx = useAuth();
    return null;
  }

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });

  return {
    get ctx() {
      if (!ctx) throw new Error("auth context was not captured");
      return ctx;
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/**
 * Waits for the provider's mount-time session restore to finish.
 *
 * `demoRequest` deliberately delays ~140 ms (`settle()` in `lib/demo/api.ts`)
 * to imitate network latency during a walkthrough, so the restore resolves
 * well after the `act()` that mounted the tree.
 */
async function waitForReady(ctx: () => ReturnType<typeof useAuth>, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!ctx().ready) {
    if (Date.now() > deadline) throw new Error("auth provider never became ready");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

/** Records every `fetch` and answers the auth routes the provider calls. */
function stubFetch() {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.includes("/api/auth/login")) {
      return new Response(JSON.stringify({ accessToken: "real-access-token", user: realUser }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/auth/change-password")) {
      // The real route answers 204 with no body.
      return new Response(null, { status: 204 });
    }
    // No cookie in a test environment, so a restore legitimately fails.
    return new Response(JSON.stringify({ error: { code: "unauthorized" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    loginCalls: () => calls.filter((u) => u.includes("/api/auth/login")),
    callsTo: (fragment: string) => calls.filter((u) => u.includes(fragment)),
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("A — fresh tab, real credentials", () => {
  it("authenticates against the real backend and never enters demo mode", async () => {
    const net = stubFetch();
    const auth = await mountAuth();

    expect(isDemoMode()).toBe(false);

    await act(async () => {
      await auth.ctx.signIn(REAL_EMAIL, REAL_PASSWORD);
    });

    expect(net.loginCalls()).toHaveLength(1);
    expect(isDemoMode()).toBe(false);
    expect(auth.ctx.user?.email).toBe(REAL_EMAIL);
    expect(auth.ctx.user?.role.key).toBe("super_admin");
    // Permissions come from the server response, not from the client.
    expect(auth.ctx.user?.permissions).toContain("users.create");

    await auth.unmount();
  });
});

describe("B — demo credentials", () => {
  it("enters demo mode and sends nothing to the backend", async () => {
    const net = stubFetch();
    const auth = await mountAuth();

    await act(async () => {
      await auth.ctx.signIn(DEMO_EMAIL, DEMO_PASSWORD);
    });

    expect(isDemoMode()).toBe(true);
    expect(net.loginCalls()).toHaveLength(0);
    expect(auth.ctx.user?.role.key).toBe("executive");

    await auth.unmount();
  });

  it("does not treat a mistyped demo password as the demo account", async () => {
    const net = stubFetch();
    const auth = await mountAuth();

    await act(async () => {
      await auth.ctx.signIn(DEMO_EMAIL, "Demo@12345-wrong");
    });

    // Falls through to the real login, which is the documented behaviour.
    expect(isDemoMode()).toBe(false);
    expect(net.loginCalls()).toHaveLength(1);

    await auth.unmount();
  });
});

describe("C — THE REGRESSION: demo mode active, then a real sign-in", () => {
  it("clears demo mode and reaches the real backend", async () => {
    // A tab that already ran the demo.
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "active");
    expect(isDemoMode()).toBe(true);

    const net = stubFetch();
    const auth = await mountAuth();

    await act(async () => {
      await auth.ctx.signIn(REAL_EMAIL, REAL_PASSWORD);
    });

    // Before the fix this was 0 — the request was swallowed by the fixture
    // layer and threw "Endpoint not found".
    expect(net.loginCalls()).toHaveLength(1);
    expect(isDemoMode()).toBe(false);
    expect(auth.ctx.user?.email).toBe(REAL_EMAIL);
    expect(auth.ctx.user?.role.key).toBe("super_admin");

    await auth.unmount();
  });

  it("clears demo mode BEFORE the request is built, not after", async () => {
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "active");

    let demoActiveWhenRequestLeft: boolean | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/auth/login")) {
        demoActiveWhenRequestLeft = isDemoMode();
      }
      return new Response(JSON.stringify({ accessToken: "t", user: realUser }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const auth = await mountAuth();
    await act(async () => {
      await auth.ctx.signIn(REAL_EMAIL, REAL_PASSWORD);
    });

    // Ordering is the whole fix: clearing after the call would still divert it.
    expect(demoActiveWhenRequestLeft).toBe(false);

    await auth.unmount();
  });
});

describe("D — leaving a demo session", () => {
  it("exitDemoSession clears the flag, the fixtures and the user", async () => {
    const net = stubFetch();
    const auth = await mountAuth();

    await act(async () => {
      await auth.ctx.signIn(DEMO_EMAIL, DEMO_PASSWORD);
    });
    expect(isDemoMode()).toBe(true);

    let exited = false;
    await act(async () => {
      exited = auth.ctx.exitDemoSession();
    });

    expect(exited).toBe(true);
    expect(isDemoMode()).toBe(false);
    expect(auth.ctx.user).toBeNull();
    expect(window.sessionStorage.getItem("risenext.demo.data")).toBeNull();
    expect(net.loginCalls()).toHaveLength(0);

    await auth.unmount();
  });

  it("exitDemoSession reports false when no demo session is running", async () => {
    stubFetch();
    const auth = await mountAuth();

    let exited = true;
    await act(async () => {
      exited = auth.ctx.exitDemoSession();
    });

    expect(exited).toBe(false);
    await auth.unmount();
  });

  it("signOut clears demo mode", async () => {
    stubFetch();
    const auth = await mountAuth();

    await act(async () => {
      await auth.ctx.signIn(DEMO_EMAIL, DEMO_PASSWORD);
    });
    expect(isDemoMode()).toBe(true);

    await act(async () => {
      await auth.ctx.signOut();
    });

    expect(isDemoMode()).toBe(false);
    expect(auth.ctx.user).toBeNull();

    await auth.unmount();
  });

  it("a REAL forced sign-out clears demo mode", async () => {
    // Drives the genuine path: a 401 on a retryable request makes `lib/api`
    // attempt a refresh, fail, and call `forceSignOut()`, which fires the
    // provider's listener. An earlier version of this test called
    // `exitDemoSession()` by hand and proved nothing about that listener.
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "unauthorized" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const auth = await mountAuth();
    await waitForReady(() => auth.ctx);

    // A real session, then the flag is planted by some other route.
    await act(async () => {
      await auth.ctx.signIn(REAL_EMAIL, REAL_PASSWORD).catch(() => {});
    });
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "active");
    expect(isDemoMode()).toBe(true);

    /*
     * The request must be one that actually reaches the network with the flag
     * set — a data path would be answered by the fixtures and never 401. Under
     * the Task 1.2 guard `/auth/logout` does reach it, and it is the one auth
     * caller that omits `skipAuthRetry`, so the 401 ladder runs: refresh fails,
     * `forceSignOut()` fires, and the provider's listener clears demo mode.
     */
    await act(async () => {
      await apiRequest("/auth/logout", { method: "POST" }).catch(() => {});
    });

    expect(isDemoMode()).toBe(false);
    expect(auth.ctx.user).toBeNull();

    await auth.unmount();
  });

});

/*
 * ---------------------------------------------------------------------------
 * TASK 1.2 — the transport-level guard.
 *
 * Task 1.1 stops the demo flag being SET on the way into a real session. These
 * tests cover the case it cannot: the flag being set by some other route —
 * devtools, a duplicated tab that inherited `sessionStorage`, or any future
 * call to `enableDemoMode()`. They therefore drive `apiRequest` directly,
 * WITHOUT going through `signIn`, so Task 1.1's clearing never runs and only
 * the transport guard can be what makes them pass.
 * ---------------------------------------------------------------------------
 */
describe("F — auth transport guard (independent of Task 1.1)", () => {
  it("classifies auth paths correctly", () => {
    // Must always reach the real backend.
    expect(requiresRealBackend("/auth/login")).toBe(true);
    expect(requiresRealBackend("/auth/change-password")).toBe(true);
    expect(requiresRealBackend("/auth/logout")).toBe(true);
    expect(requiresRealBackend("/auth/me")).toBe(true);
    // Fails closed for auth routes that do not exist yet (roadmap Phase 3).
    expect(requiresRealBackend("/auth/forgot-password")).toBe(true);
    expect(requiresRealBackend("/auth/reset-password")).toBe(true);
    expect(requiresRealBackend("/auth/accept-invite")).toBe(true);

    // The one exception: demo session restoration.
    expect(requiresRealBackend("/auth/refresh")).toBe(false);

    // Business data is still the demo's to answer.
    expect(requiresRealBackend("/customers")).toBe(false);
    expect(requiresRealBackend("/users")).toBe(false);
    expect(requiresRealBackend("/loans")).toBe(false);
  });

  it("sends a real login to the network even with the flag set and signIn bypassed", async () => {
    const net = stubFetch();
    enableDemoMode();
    expect(isDemoMode()).toBe(true);

    await apiRequest("/auth/login", {
      method: "POST",
      body: { email: REAL_EMAIL, password: REAL_PASSWORD },
      skipAuthRetry: true,
    });

    // Before Task 1.2 this threw "Endpoint not found" from the fixture layer.
    expect(net.callsTo("/api/auth/login")).toHaveLength(1);
    // The transport guard does not clear the flag — that is Task 1.1's job.
    expect(isDemoMode()).toBe(true);
  });

  it("sends a real change-password to the network even with the flag set", async () => {
    const net = stubFetch();
    enableDemoMode();

    await apiRequest("/auth/change-password", {
      method: "POST",
      body: { currentPassword: "old", newPassword: "NewPassword123" },
      skipAuthRetry: true,
    });

    expect(net.callsTo("/api/auth/change-password")).toHaveLength(1);
  });

  it("STILL lets the demo serve /auth/refresh, so a reload restores the session", async () => {
    const net = stubFetch();
    enableDemoMode();

    const restored = await apiRequest<{ accessToken: string; user: { role: { key: string } } }>(
      "/auth/refresh",
      { method: "POST", skipAuthRetry: true },
    );

    // Answered from fixtures, not the network — this is demo persistence.
    expect(net.callsTo("/api/auth/refresh")).toHaveLength(0);
    expect(restored.user.role.key).toBe("executive");
    expect(restored.accessToken).toBe("");
  });

  it("STILL lets the demo serve business data", async () => {
    const net = stubFetch();
    enableDemoMode();

    const customers = await apiRequest<{ data: unknown[] }>("/customers");

    expect(net.callsTo("/api/customers")).toHaveLength(0);
    expect(Array.isArray(customers.data)).toBe(true);
    expect(customers.data.length).toBeGreaterThan(0);
  });

  it("leaves every path alone when the demo is not active", async () => {
    const net = stubFetch();
    expect(isDemoMode()).toBe(false);

    await apiRequest("/auth/refresh", { method: "POST", skipAuthRetry: true }).catch(() => {});

    // Not in demo mode, so even the demo-served path goes to the network.
    expect(net.callsTo("/api/auth/refresh")).toHaveLength(1);
  });
});

describe("H — Task 1.1's in-flight discard (previously untested)", () => {
  it("a demo /auth/refresh that lands after the demo was exited does not restore the demo user", async () => {
    // The race: `AuthProvider`'s restore is already in flight, served by the
    // fixture layer with its ~140 ms delay, when the session is exited. Without
    // the `startedInDemo && !isDemoMode()` guard in use-auth.tsx the fixture
    // lands afterwards and puts the demo user straight back, re-trapping the tab.
    const net = stubFetch();
    enableDemoMode();

    const auth = await mountAuth();

    // Exit while the restore is still settling, as the login page does on mount.
    await act(async () => {
      auth.ctx.exitDemoSession();
    });
    expect(isDemoMode()).toBe(false);

    // Let the in-flight fixture resolve.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    // The demo user must NOT have been restored.
    expect(auth.ctx.user).toBeNull();
    expect(isDemoMode()).toBe(false);
    expect(net.callsTo("/api/auth/refresh")).toHaveLength(0);

    await auth.unmount();
  });
});

describe("G — demo session restoration survives a simulated reload", () => {
  it("a fresh provider in a flagged tab restores the demo user without a network call", async () => {
    const net = stubFetch();
    // A tab that ran the demo, then reloaded: the flag persists in sessionStorage.
    enableDemoMode();

    const auth = await mountAuth();
    await waitForReady(() => auth.ctx);

    // The provider's mount refresh is served by fixtures, as before Task 1.2.
    expect(net.callsTo("/api/auth/refresh")).toHaveLength(0);
    expect(isDemoMode()).toBe(true);
    expect(auth.ctx.user?.role.key).toBe("executive");
    expect(auth.ctx.user?.email).toBe(DEMO_EMAIL);

    await auth.unmount();
  });
});

describe("E — the demo still works after the fix, in both directions", () => {
  it("demo → real → demo all succeed in the same tab", async () => {
    const net = stubFetch();
    const auth = await mountAuth();

    // Demo.
    await act(async () => {
      await auth.ctx.signIn(DEMO_EMAIL, DEMO_PASSWORD);
    });
    expect(isDemoMode()).toBe(true);
    expect(net.loginCalls()).toHaveLength(0);

    // Real, without an explicit sign-out — the trap scenario.
    await act(async () => {
      await auth.ctx.signIn(REAL_EMAIL, REAL_PASSWORD);
    });
    expect(isDemoMode()).toBe(false);
    expect(net.loginCalls()).toHaveLength(1);
    expect(auth.ctx.user?.email).toBe(REAL_EMAIL);

    // Demo again — entering it must still be possible afterwards.
    await act(async () => {
      await auth.ctx.signIn(DEMO_EMAIL, DEMO_PASSWORD);
    });
    expect(isDemoMode()).toBe(true);
    expect(net.loginCalls()).toHaveLength(1);
    expect(auth.ctx.user?.role.key).toBe("executive");

    await auth.unmount();
  });

  it("real → sign-out → demo works", async () => {
    const net = stubFetch();
    const auth = await mountAuth();

    await act(async () => {
      await auth.ctx.signIn(REAL_EMAIL, REAL_PASSWORD);
    });
    expect(auth.ctx.user?.email).toBe(REAL_EMAIL);

    await act(async () => {
      await auth.ctx.signOut();
    });
    expect(auth.ctx.user).toBeNull();

    await act(async () => {
      await auth.ctx.signIn(DEMO_EMAIL, DEMO_PASSWORD);
    });
    expect(isDemoMode()).toBe(true);
    expect(net.loginCalls()).toHaveLength(1);

    await auth.unmount();
  });
});

/*
 * ---------------------------------------------------------------------------
 * TASK 1.8 — session-invalidating 403s (BUG-034).
 *
 * 403 is deliberately overloaded in this API. Before this change every one of
 * them carried `code: "forbidden"` — a deactivated account, a missing
 * permission, an out-of-scope record and the demo layer's fabricated refusals
 * were indistinguishable, so the client could not end a dead session without
 * also ending a live one.
 *
 * Two codes now mean "the session is over". These tests drive the real
 * `apiRequest` path and assert the authenticated state BEFORE and AFTER, so a
 * pass cannot be explained by the session never having been established.
 * ---------------------------------------------------------------------------
 */
describe("I — only session-invalidating 403 codes end the session", () => {
  /** Answers login normally, then the next call with a chosen error. */
  function stubFetchWithError(status: number, code: string) {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/api/auth/login")) {
        return new Response(JSON.stringify({ accessToken: "real-access-token", user: realUser }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: { code, message: "…" } }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    return { callsTo: (f: string) => calls.filter((u) => u.includes(f)) };
  }

  /** Signs in for real, then issues one request that fails with `code`. */
  async function signInThenFail(status: number, code: string) {
    stubFetchWithError(status, code);
    const auth = await mountAuth();

    await act(async () => {
      await auth.ctx.signIn(REAL_EMAIL, REAL_PASSWORD);
    });
    // Precondition: a genuine session exists. Without this the assertions
    // below would pass against a provider that never signed anyone in.
    expect(auth.ctx.user?.email).toBe(REAL_EMAIL);

    let thrown: unknown;
    await act(async () => {
      await apiRequest("/customers", { skipAuthRetry: true }).catch((e) => {
        thrown = e;
      });
    });

    return { auth, thrown };
  }

  it("account_inactive ends the session", async () => {
    const { auth, thrown } = await signInThenFail(403, "account_inactive");

    expect(auth.ctx.user).toBeNull();
    // The original error still reaches the caller — sign-out does not swallow it.
    expect((thrown as { code?: string }).code).toBe("account_inactive");

    await auth.unmount();
  });

  it("role_disabled ends the session", async () => {
    const { auth, thrown } = await signInThenFail(403, "role_disabled");

    expect(auth.ctx.user).toBeNull();
    expect((thrown as { code?: string }).code).toBe("role_disabled");

    await auth.unmount();
  });

  it("an ordinary forbidden 403 leaves the user signed in", async () => {
    // THE REGRESSION THAT MATTERS. An Executive opening the dashboard, or
    // anyone touching an out-of-scope record, gets exactly this.
    const { auth, thrown } = await signInThenFail(403, "forbidden");

    expect(auth.ctx.user?.email).toBe(REAL_EMAIL);
    expect((thrown as { code?: string }).code).toBe("forbidden");

    await auth.unmount();
  });

  it("an unrelated 500 leaves the user signed in", async () => {
    const { auth } = await signInThenFail(500, "internal_error");

    expect(auth.ctx.user?.email).toBe(REAL_EMAIL);

    await auth.unmount();
  });

  it("password_change_required leaves the user signed in — SEC-010 / Task 2.3", async () => {
    /*
     * The forced-password-change gate is a WORKFLOW restriction, not a session
     * termination. Every authenticated route except `/auth/me` and
     * `/auth/change-password` answers a flagged account with this code, and the
     * user needs that very session to clear the flag — signing them out would
     * make the state unfixable from the UI.
     *
     * This is also what lets the shell keep working on `/change-password`: the
     * topbar's unconditional `/notifications` fetch gets this 403, and it must
     * not end the session behind the form the user is filling in.
     */
    const { auth, thrown } = await signInThenFail(403, "password_change_required");

    expect(auth.ctx.user?.email).toBe(REAL_EMAIL);
    // The error still reaches the caller, exactly like an ordinary `forbidden`.
    expect((thrown as { code?: string }).code).toBe("password_change_required");

    await auth.unmount();
  });

  it("does not sign out when there is no session — a login-page 403", async () => {
    // `POST /auth/login` against a deactivated account returns the same code.
    // There is no session to end, and forcing one would bounce the login page.
    // Every call fails here, login included — the helper above deliberately
    // lets login succeed, which is the wrong shape for this case.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "account_inactive", message: "…" } }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const auth = await mountAuth();
    await waitForReady(() => auth.ctx);
    expect(auth.ctx.user).toBeNull();

    let thrown: unknown;
    await act(async () => {
      await auth.ctx.signIn(REAL_EMAIL, REAL_PASSWORD).catch((e) => {
        thrown = e;
      });
    });

    expect((thrown as { code?: string }).code).toBe("account_inactive");
    expect(auth.ctx.user).toBeNull();

    await auth.unmount();
  });

  it("a demo-mode forbidden 403 leaves the demo session running", async () => {
    // The demo fabricates `forbidden` 403s (SEC-026). Ending a presenter's
    // walkthrough mid-demo would be a regression in a feature RULES.md §3
    // requires preserving.
    const net = stubFetch();
    const auth = await mountAuth();

    await act(async () => {
      await auth.ctx.signIn(DEMO_EMAIL, DEMO_PASSWORD);
    });
    expect(isDemoMode()).toBe(true);

    let thrown: unknown;
    await act(async () => {
      // A write the demo Executive is not permitted to make: answered by the
      // fixture layer with its own 403, never reaching the network.
      await apiRequest("/banks", { method: "POST", body: { name: "X" } }).catch((e) => {
        thrown = e;
      });
    });

    expect((thrown as { status?: number; code?: string }).status).toBe(403);
    expect((thrown as { code?: string }).code).toBe("forbidden");
    // Still in the demo, still signed in, and nothing went to the network.
    expect(isDemoMode()).toBe(true);
    expect(auth.ctx.user?.role.key).toBe("executive");
    expect(net.callsTo("/api/banks")).toHaveLength(0);

    await auth.unmount();
  });

  it("leaves the 401 refresh ladder exactly as it was", async () => {
    // 401 must still attempt one refresh and then force sign-out on failure —
    // the new branch runs after that ladder and must not pre-empt it.
    const net = stubFetch(); // every non-login call answers 401
    const auth = await mountAuth();

    await act(async () => {
      await auth.ctx.signIn(REAL_EMAIL, REAL_PASSWORD);
    });
    expect(auth.ctx.user?.email).toBe(REAL_EMAIL);

    await act(async () => {
      await apiRequest("/customers").catch(() => {});
    });

    // One refresh attempt was made, it failed, and the session ended.
    expect(net.callsTo("/api/auth/refresh").length).toBeGreaterThanOrEqual(1);
    expect(auth.ctx.user).toBeNull();

    await auth.unmount();
  });
});
