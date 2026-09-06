/**
 * REGRESSION TEST — Task 1.9 / BUG-017: the command palette must navigate to a
 * customer's `id`, never their `code`.
 *
 * The palette used to build `/customers/${customer.code}`. The detail route
 * hands that segment to `GET /api/customers/:id`, which compares it against a
 * `uuid` column — so selecting a search result produced a 500 and an empty
 * page. The backend half is pinned by `backend/src/tests/customer-lookup.test.ts`
 * (a `code` now returns 422 `validation_failed`); this is the client half.
 *
 * It is deliberately NOT a source-string scan. It mounts the real `Topbar`,
 * opens the palette, clicks a real result button, and asserts what the router
 * was actually asked to navigate to. The fixture gives `id` and `code`
 * obviously different values so a passing assertion cannot be ambiguous.
 *
 * Follows D-012: `react-dom/client` + React 19's native `act`, no
 * component-testing library.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CUSTOMER = {
  id: "3f8b21c4-9d0e-4a77-b512-6ce4a8f01d93",
  code: "CUS-10001",
  name: "Priya Raman",
};

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/customers",
  useSearchParams: () => new URLSearchParams(),
}));

// The palette's own data source. Returning the fixture regardless of the query
// keeps the test about navigation, not about debounce or the network.
vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string) => ({
    data: path === "/customers" ? [CUSTOMER] : [],
    total: path === "/customers" ? 1 : 0,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { name: "Test User", email: "test@risenext.test", role: { name: "Admin" } },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useTheme: () => ({ theme: "light", toggle: vi.fn() }),
}));

import { Topbar } from "@/components/layout/topbar";
import { NotificationsProvider } from "@/hooks/use-notifications";

beforeEach(() => {
  push.mockClear();
  // Radix reaches for both in a real browser.
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

afterEach(() => vi.unstubAllGlobals());

async function mountTopbar() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  await act(async () => {
    root = createRoot(container);
    /*
     * Wrapped since Task 10.9 (D-078). The bell badge now reads the SHARED
     * notification state rather than running its own fetch, which is what makes
     * Phase 10's third DoD box — "the bell badge and the page agree" —
     * achievable at all. `useNotifications` throws without a provider on
     * purpose: a component that silently reported an unread count of zero
     * because nobody mounted the provider would be a false statement about the
     * user's work.
     */
    root.render(
      <NotificationsProvider>
        <Topbar onOpenMobileNav={vi.fn()} />
      </NotificationsProvider>,
    );
  });
  return {
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** Opens the command palette and returns the customer result button. */
async function openPaletteAndFindResult(): Promise<HTMLButtonElement> {
  const trigger = Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Search customers"),
  );
  if (!trigger) throw new Error("palette trigger not found");
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  // The dialog renders in a portal, so search the whole document.
  const result = Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(CUSTOMER.name),
  );
  if (!result) throw new Error("customer result button not rendered in the palette");
  return result as HTMLButtonElement;
}

describe("command palette customer navigation", () => {
  it("navigates to the customer's id, not their code", async () => {
    const { unmount } = await mountTopbar();

    const result = await openPaletteAndFindResult();
    await act(async () => {
      result.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(`/customers/${CUSTOMER.id}`);

    // The explicit negative. `CUS-10001` is what produced the 500.
    expect(push).not.toHaveBeenCalledWith(`/customers/${CUSTOMER.code}`);
    const [href] = push.mock.calls[0] as [string];
    expect(href).not.toContain(CUSTOMER.code);

    await unmount();
  });

  it("still shows the human-readable code in the result row", async () => {
    // The fix must change where the link points, not what the user reads. The
    // code is the identifier staff actually recognise.
    const { unmount } = await mountTopbar();
    const result = await openPaletteAndFindResult();

    expect(result.textContent).toContain(CUSTOMER.name);
    expect(result.textContent).toContain(CUSTOMER.code);

    await unmount();
  });
});
