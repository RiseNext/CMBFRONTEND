/**
 * REGRESSION TEST — Task 1.4: demo mode must be unmistakable while it is active.
 *
 * The defect: the only on-screen sign that the data was fabricated was a
 * caption inside the sidebar footer card, nested in that card's
 * `{!collapsed && …}` wrapper. Collapsing the sidebar removed it entirely,
 * leaving a screenful of structurally valid PANs, IFSC codes and loan amounts
 * with nothing saying they were invented.
 *
 * These tests render real DOM with `react-dom/client` and React 19's native
 * `act` — the same approach as `use-auth.demo-boundary.test.tsx`, no
 * component-testing library (docs/DECISIONS.md D-012).
 *
 * The important one is group C. It mounts the WHOLE `AppShell` in a live demo
 * session, clicks the real collapse button, and asserts the indicator is still
 * in the document — so it exercises the actual regression rather than
 * restating the component's own condition. A test that only asserted
 * "isDemoMode() is true, therefore the banner renders" would pass with the
 * layout wiring deleted.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoModeBadge, DemoModeBanner } from "@/components/layout/demo-mode-indicator";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-reference";
import { enableDemoMode, isDemoMode, DEMO_HOME } from "@/lib/demo";

const DEMO_SESSION_KEY = "risenext.demo.session";

/** The demo employee's landing route; anything else is bounced by AppShell. */
let pathname = DEMO_HOME;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

/** Radix and framer-motion both reach for these in a real browser. */
beforeEach(() => {
  pathname = DEMO_HOME;
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  if (!window.matchMedia) {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

/** Mounts an arbitrary tree and returns the container plus an unmount. */
async function mount(ui: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(ui);
  });

  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const indicators = (root: ParentNode) =>
  Array.from(root.querySelectorAll("[data-demo-indicator]"));

describe("A — the indicator renders only in a demo session", () => {
  it("renders the banner when demo mode is active", async () => {
    enableDemoMode();
    const { container, unmount } = await mount(<DemoModeBanner />);

    const banner = container.querySelector('[data-demo-indicator="banner"]');
    expect(banner).not.toBeNull();
    // The wording has to actually say the data is not real; "Preview
    // workspace" — the old caption — did not.
    expect(banner?.textContent?.toLowerCase()).toContain("demo mode");
    expect(banner?.textContent?.toLowerCase()).toContain("sample data");
    expect(banner?.textContent?.toLowerCase()).toContain("nothing is real");

    await unmount();
  });

  it("renders the badge when demo mode is active", async () => {
    enableDemoMode();
    const { container, unmount } = await mount(<DemoModeBadge />);

    const badge = container.querySelector('[data-demo-indicator="badge"]');
    expect(badge).not.toBeNull();
    // The label is hidden on the narrowest screens, so the meaning has to
    // survive in the accessible name.
    expect(badge?.getAttribute("aria-label")?.toLowerCase()).toContain("sample data");

    await unmount();
  });

  it("renders NOTHING for a real session", async () => {
    expect(isDemoMode()).toBe(false);

    const { container, unmount } = await mount(
      <>
        <DemoModeBanner />
        <DemoModeBadge />
      </>,
    );

    expect(indicators(container)).toHaveLength(0);
    expect(container.textContent).toBe("");

    await unmount();
  });
});

/*
 * The defect Task 1.4 fixed was a visibility signal wired to unrelated layout
 * state, so the components must have no input a caller can use to suppress
 * them. These render with every plausible suppression prop spread on and
 * assert the indicator survives.
 *
 * An earlier version of this group asserted `DemoModeBanner.length === 1` on
 * the theory that "exactly one parameter" meant "only `className`". It did not.
 * `Function.prototype.length` counts formal parameters, not destructured
 * properties, so `({ className, collapsed, hidden })` also has length 1 — the
 * assertion passed with the defect reintroduced, and would have FAILED had the
 * component been hardened to take no props at all. It was inverted as well as
 * vacuous, and is replaced rather than kept as false assurance (the same call
 * made for BUG-031).
 */
const SUPPRESSION_PROPS = {
  collapsed: true,
  hidden: true,
  visible: false,
  disabled: true,
} as unknown as { className?: string };

describe("B — the indicator cannot be suppressed by its caller", () => {
  it("renders the banner even when a caller passes every suppression prop it can invent", async () => {
    enableDemoMode();
    const { container, unmount } = await mount(<DemoModeBanner {...SUPPRESSION_PROPS} />);

    expect(container.querySelector('[data-demo-indicator="banner"]')).not.toBeNull();

    await unmount();
  });

  it("renders the badge even when a caller passes every suppression prop it can invent", async () => {
    enableDemoMode();
    const { container, unmount } = await mount(<DemoModeBadge {...SUPPRESSION_PROPS} />);

    expect(container.querySelector('[data-demo-indicator="badge"]')).not.toBeNull();

    await unmount();
  });
});

/*
 * ---------------------------------------------------------------------------
 * THE REGRESSION ITSELF. Everything above tests the component in isolation;
 * this mounts the real application shell — sidebar, topbar and all — inside a
 * live demo session and operates the control that used to hide the signal.
 * ---------------------------------------------------------------------------
 */
describe("C — a collapsed sidebar in the real AppShell", () => {
  /** Waits for AuthProvider's fixture-served restore (~140 ms) to land. */
  async function shellReady(container: HTMLElement, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (!container.querySelector("aside")) {
      if (Date.now() > deadline) throw new Error("AppShell never left its loading state");
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }
  }

  async function mountShell() {
    const mounted = await mount(
      <ThemeProvider>
        <AuthProvider>
          <AppShell>
            <p>page content</p>
          </AppShell>
        </AuthProvider>
      </ThemeProvider>,
    );
    await shellReady(mounted.container);
    return mounted;
  }

  it("keeps the indicator visible after the sidebar is collapsed", async () => {
    enableDemoMode();
    const { container, unmount } = await mountShell();

    // Expanded: all three surfaces present.
    const expanded = indicators(container).map((el) => el.getAttribute("data-demo-indicator"));
    expect(expanded).toContain("banner");
    expect(expanded).toContain("badge");
    expect(expanded).toContain("sidebar");

    // Neither the banner nor the badge may live inside the sidebar, or
    // collapsing could reach them. Asserted against the real rendered tree —
    // an earlier version checked the sidebar module's *exports*, which would
    // not have changed if someone moved the render site into <Sidebar>.
    const banner = container.querySelector('[data-demo-indicator="banner"]');
    const badge = container.querySelector('[data-demo-indicator="badge"]');
    expect(banner?.closest("aside")).toBeNull();
    expect(badge?.closest("aside")).toBeNull();
    // And the sidebar's own marker genuinely is inside it.
    expect(
      container.querySelector('[data-demo-indicator="sidebar"]')?.closest("aside"),
    ).not.toBeNull();

    // Now do the thing that used to erase every trace of the demo.
    const collapse = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse sidebar"]',
    );
    expect(collapse).not.toBeNull();
    await act(async () => {
      collapse!.click();
    });

    // The sidebar really did collapse — this is what makes the assertion below
    // mean something rather than passing because nothing happened.
    expect(container.querySelector('button[aria-label="Expand sidebar"]')).not.toBeNull();

    // Before Task 1.4 the count here was 0.
    const collapsed = indicators(container).map((el) => el.getAttribute("data-demo-indicator"));
    expect(collapsed).toContain("banner");
    expect(collapsed).toContain("badge");
    // The sidebar's own marker survives too — it shrinks to its icon rather
    // than unmounting, and keeps its meaning for screen readers.
    expect(collapsed).toContain("sidebar");
    expect(
      container.querySelector('[data-demo-indicator="sidebar"]')?.textContent?.toLowerCase(),
    ).toContain("sample data");

    await unmount();
  });

  it("shows no indicator anywhere in the shell for a real session", async () => {
    // A real user must never see it. The session has to genuinely restore —
    // a failed refresh clears the user and AppShell holds on its loading
    // screen, which would make this pass for the wrong reason.
    const realUser = {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Super Admin",
      email: "super.admin@risenext.com",
      role: { id: "r1", key: "super_admin", name: "Super Admin", level: 0 },
      permissions: ["customers.view", "reports.view"],
      bankIds: null,
      unrestrictedBankAccess: true,
      mustChangePassword: false,
    };
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/api/auth/refresh")
          ? json({ accessToken: "real-access-token", user: realUser })
          : json({ data: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 } }),
      ),
    );
    pathname = "/dashboard";

    const { container, unmount } = await mountShell();

    // The shell really is showing a signed-in workspace, not the spinner.
    expect(isDemoMode()).toBe(false);
    expect(container.querySelector("aside")).not.toBeNull();
    expect(container.textContent).toContain("page content");

    expect(indicators(container)).toHaveLength(0);
    expect(container.textContent?.toLowerCase()).not.toContain("sample data");
    expect(container.textContent?.toLowerCase()).not.toContain("demo mode");

    await unmount();
  });
});

describe("D — the flag alone drives it, so a reload keeps the indicator", () => {
  it("a fresh mount in an already-flagged tab renders the indicator", async () => {
    // A page refresh mid-walkthrough: sessionStorage survives, React state
    // does not. Nothing is passed down, so the banner comes straight back.
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "active");

    const { container, unmount } = await mount(<DemoModeBanner />);

    expect(container.querySelector('[data-demo-indicator="banner"]')).not.toBeNull();

    await unmount();
  });
});
