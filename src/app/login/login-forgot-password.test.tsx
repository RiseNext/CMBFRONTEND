/**
 * TASK 3.12 — the "Forgot password?" entry point on `/login`.
 *
 * **Why this file exists.** Phase 3's Definition of Done box 2 is *"A user who
 * forgets their password can recover it **unaided**."* Building
 * `/reset-password` alone does not satisfy it: something has to send the link,
 * and `POST /api/auth/forgot-password` had **zero product callers**. The
 * control on this page was a toast reading *"Contact your administrator to have
 * your password reset"* — true when it was written, false since Task 3.6
 * shipped, and the literal opposite of "unaided".
 *
 * So this suite guards the one-element change that closes the loop, and the
 * claim that went with it. It is deliberately narrow: sign-in behaviour is not
 * in Task 3.12's scope and is not touched here.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  signInMock: vi.fn(),
  exitDemoSessionMock: vi.fn(),
}));

const { toastInfo, toastSuccess, toastError } = h;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Link = ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: React.ReactNode;
    className?: string;
  }) => React.createElement("a", { href, className }, children);
  Link.displayName = "Link";
  return { default: Link };
});

vi.mock("framer-motion", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Div = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children);
  Div.displayName = "MotionDiv";
  return { motion: new Proxy({}, { get: () => Div }) };
});

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    signIn: h.signInMock,
    user: null,
    ready: true,
    exitDemoSession: h.exitDemoSessionMock,
  }),
}));

vi.mock("@/lib/demo", () => ({
  DEMO_HOME: "/dashboard",
  isDemoMode: () => false,
  DEMO_EMAIL: "demo@risenext.com",
  DEMO_PASSWORD: "demo",
}));

vi.mock("sonner", () => ({
  toast: { info: h.toastInfo, success: h.toastSuccess, error: h.toastError },
}));

import LoginPage from "@/app/login/page";

beforeEach(() => {
  toastInfo.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();

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
  document.body.innerHTML = "";
});

async function mountPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(<LoginPage />);
  });
  return {
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const forgotControl = () =>
  Array.from(document.querySelectorAll("a, button")).find((element) =>
    /forgot password/i.test(element.textContent ?? ""),
  );

const bodyText = () => document.body.textContent ?? "";

describe("the Forgot password entry point", () => {
  it("1. the control still exists", async () => {
    const page = await mountPage();
    expect(forgotControl()).toBeDefined();
    await page.unmount();
  });

  it("2. it is a LINK to /forgot-password, not a button", async () => {
    const page = await mountPage();
    const control = forgotControl()!;

    expect(control.tagName).toBe("A");
    expect(control.getAttribute("href")).toBe("/forgot-password");
    await page.unmount();
  });

  it("3. clicking it fires no toast — the dead end is gone", async () => {
    const page = await mountPage();
    await click(forgotControl()!);

    expect(toastInfo).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("4. nothing tells the user to contact an administrator", async () => {
    /*
     * The load-bearing assertion. That sentence was the reason box 2 could not
     * be met — it is the definition of *not* unaided, and it stopped being true
     * the moment Task 3.6 shipped self-service reset.
     */
    const page = await mountPage();
    await click(forgotControl()!);

    const said = JSON.stringify([
      bodyText(),
      toastInfo.mock.calls,
      toastSuccess.mock.calls,
      toastError.mock.calls,
    ]);
    expect(said).not.toMatch(/contact your administrator/i);
    expect(said).not.toMatch(/administrator to have your password reset/i);
    await page.unmount();
  });

  it("5. the link is reachable by keyboard and has a visible label", async () => {
    const page = await mountPage();
    const control = forgotControl()!;

    expect((control.textContent ?? "").trim()).toBe("Forgot password?");
    expect(control.getAttribute("href")).toBeTruthy();
    await page.unmount();
  });

  it("6. it does not lead into the authenticated application", async () => {
    const page = await mountPage();
    const href = forgotControl()!.getAttribute("href")!;

    expect(href.startsWith("/dashboard")).toBe(false);
    expect(href).toBe("/forgot-password");
    await page.unmount();
  });
});
