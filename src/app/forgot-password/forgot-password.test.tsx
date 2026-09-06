/**
 * TASK 3.12 — requesting a password reset, driven through the real component.
 *
 * **This page is where the enumeration risk actually lives.** `/reset-password`
 * redeems a token someone already holds; this one takes an *email address*, and
 * the backend's whole defence is that `POST /api/auth/forgot-password` answers
 * **204 for every address** — unknown, soft-deleted, deactivated, disabled
 * role, even a mail provider outage — with enumeration-safe logs to match.
 *
 * That guarantee is worth nothing if this screen says *"we sent a reset email
 * to that address"*, because the **absence** of that sentence for a different
 * address is the oracle. So group B is load-bearing: the confirmation must be
 * conditional, must never echo the address back, and must be **byte-identical**
 * for a known address, an unknown one, and a deactivated one.
 *
 * Group C is its mirror: the confirmation is shown on **204 only**. Telling
 * someone a link is on its way when the request never landed would leave them
 * waiting for an email nobody attempted to send (**D-004**).
 *
 * Follows D-012 and the Task 2.4–3.11 files.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
const { apiRequestMock } = h;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: h.apiRequestMock };
});

vi.mock("next/link", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Link = ({ href, children }: { href: string; children?: React.ReactNode }) =>
    React.createElement("a", { href }, children);
  Link.displayName = "Link";
  return { default: Link };
});

import ForgotPasswordPage from "@/app/forgot-password/page";

const KNOWN = "ravi.kumar@risenext.com";
const UNKNOWN = "nobody.at.all@risenext.com";

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue(undefined); // 204, always
  localStorage.clear();
  sessionStorage.clear();
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
    root.render(<ForgotPasswordPage />);
  });
  return {
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function setEmail(value: string) {
  const field = document.getElementById("fp-email") as HTMLInputElement | null;
  if (!field) throw new Error("email field not rendered");
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitForm() {
  const form = document.querySelector("form");
  if (!form) throw new Error("form not rendered");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function request(email: string) {
  await setEmail(email);
  await submitForm();
}

const submitButton = () =>
  Array.from(document.querySelectorAll("button")).find((b) =>
    /^(Send reset link|Sending)/.test((b.textContent ?? "").trim()),
  );

const bodyText = () => document.body.textContent ?? "";

/* ------------------------------------------------------------------ group A */

describe("A — the request", () => {
  it("1. the page renders an email field and a submit control", async () => {
    const page = await mountPage();

    expect(document.getElementById("fp-email")).not.toBeNull();
    expect(submitButton()).toBeDefined();
    await page.unmount();
  });

  it("2. it asks the server nothing on load", async () => {
    const page = await mountPage();
    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("3. submitting POSTs to /auth/forgot-password", async () => {
    const page = await mountPage();
    await request(KNOWN);

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock.mock.calls[0]![0]).toBe("/auth/forgot-password");
    expect((apiRequestMock.mock.calls[0]![1] as { method?: string }).method).toBe("POST");
    await page.unmount();
  });

  it("4. it sends only the email, lowercased and trimmed", async () => {
    const page = await mountPage();
    await request("  Ravi.Kumar@RiseNext.com  ");

    const body = (apiRequestMock.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(Object.keys(body)).toEqual(["email"]);
    expect(body.email).toBe(KNOWN);
    await page.unmount();
  });

  it("5. an empty address is blocked client-side", async () => {
    const page = await mountPage();
    await submitForm();

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(bodyText()).toMatch(/enter your work email/i);
    await page.unmount();
  });

  it("6. a malformed address is blocked client-side", async () => {
    const page = await mountPage();
    await request("not-an-email");

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(bodyText()).toMatch(/valid email/i);
    await page.unmount();
  });

  it("7. that check is about FORMAT, not existence — a well-formed unknown address is sent", async () => {
    const page = await mountPage();
    await request(UNKNOWN);

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    await page.unmount();
  });

  it("8. the control is disabled and busy while in flight", async () => {
    let release: (value: unknown) => void = () => {};
    apiRequestMock.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const page = await mountPage();
    await request(KNOWN);

    expect(submitButton()!.disabled).toBe(true);
    expect(submitButton()!.getAttribute("aria-busy")).toBe("true");

    await act(async () => release(undefined));
    await page.unmount();
  });

  it("9. repeated submits while in flight issue only one request", async () => {
    let release: (value: unknown) => void = () => {};
    apiRequestMock.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const page = await mountPage();
    await request(KNOWN);
    await submitForm();
    await submitForm();

    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    await act(async () => release(undefined));
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — the confirmation reveals nothing about the address", () => {
  it("10. a known and an unknown address produce BYTE-IDENTICAL output", async () => {
    /*
     * The load-bearing test. The endpoint answers 204 for both; if this screen
     * differed by so much as a word, the difference would be the oracle the
     * backend spent Task 3.6 avoiding.
     */
    const renders: string[] = [];

    for (const address of [KNOWN, UNKNOWN]) {
      const page = await mountPage();
      await request(address);
      renders.push(bodyText());
      await page.unmount();
      document.body.innerHTML = "";
    }

    expect(new Set(renders).size).toBe(1);
  });

  it("11. the confirmation never echoes the address back", async () => {
    const page = await mountPage();
    await request(KNOWN);

    expect(bodyText()).not.toContain(KNOWN);
    await page.unmount();
  });

  it("12. it is phrased conditionally — 'if that address belongs to an account'", async () => {
    const page = await mountPage();
    await request(KNOWN);

    expect(bodyText()).toMatch(/if that address/i);
    await page.unmount();
  });

  it("13. it never asserts that a message was sent", async () => {
    const page = await mountPage();
    await request(KNOWN);
    const text = bodyText();

    expect(text).not.toMatch(/we (have )?sent|email sent|link sent|has been sent/i);
    expect(text).not.toMatch(/we emailed/i);
    await page.unmount();
  });

  it("14. it never says an account does not exist", async () => {
    const page = await mountPage();
    await request(UNKNOWN);
    const text = bodyText();

    expect(text).not.toMatch(/no account|not found|does not exist|unknown address/i);
    await page.unmount();
  });

  it("15. it never reports account state", async () => {
    const page = await mountPage();
    await request(KNOWN);
    const text = bodyText();

    expect(text).not.toMatch(/inactive|deactivated|disabled|deleted|suspended/i);
    await page.unmount();
  });

  it("16. it never says a reset is already pending", async () => {
    const page = await mountPage();
    await request(KNOWN);

    expect(bodyText()).not.toMatch(/already (requested|pending)|a request is pending/i);
    await page.unmount();
  });

  it("17. the form is withdrawn afterwards, so the screen cannot be used to probe", async () => {
    const page = await mountPage();
    await request(KNOWN);

    expect(document.querySelector("form")).toBeNull();
    await page.unmount();
  });

  it("18. the address is not left rendered in a field either", async () => {
    const page = await mountPage();
    await request(KNOWN);

    expect(document.getElementById("fp-email")).toBeNull();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — the confirmation is shown on 204 only", () => {
  it("19. a 500 does not claim a link is on its way", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, "internal", "Unexpected server error"));
    const page = await mountPage();
    await request(KNOWN);

    const text = bodyText();
    expect(text).not.toMatch(/if that address/i);
    expect(text).toMatch(/something went wrong/i);
    await page.unmount();
  });

  it("20. a network failure does not claim a link is on its way", async () => {
    apiRequestMock.mockRejectedValue(new Error("Network request failed"));
    const page = await mountPage();
    await request(KNOWN);

    expect(bodyText()).not.toMatch(/if that address/i);
    await page.unmount();
  });

  it("21. a 429 is reported as a rate limit", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(429, "too_many_requests", "Too many attempts, try again later"),
    );
    const page = await mountPage();
    await request(KNOWN);

    const text = bodyText();
    expect(text).toMatch(/too many requests/i);
    expect(text).not.toMatch(/if that address/i);
    await page.unmount();
  });

  it("22. the 429 message reveals nothing about the address", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(429, "too_many_requests", "Too many attempts, try again later"),
    );
    const page = await mountPage();
    await request(KNOWN);

    /*
     * Asserted on the alert itself, not the whole page: the field's help text
     * legitimately contains the word "account" in a *conditional* sentence
     * ("if this address belongs to an active account"), which reveals nothing.
     * What must not happen is the rate-limit message saying anything about
     * whether THIS address has one.
     */
    const alert = document.querySelector('[role="alert"]')!;
    expect(alert.textContent).not.toContain(KNOWN);
    expect(alert.textContent).not.toMatch(/account|address|exists/i);
    await page.unmount();
  });

  it("23. a 422 is surfaced as an address-format problem", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(422, "unprocessable", "email: Invalid email"));
    const page = await mountPage();
    await request(KNOWN);

    expect(bodyText()).toMatch(/valid email/i);
    expect(bodyText()).not.toMatch(/if that address/i);
    await page.unmount();
  });

  it("24. the form stays usable after any failure, so the user can retry", async () => {
    apiRequestMock.mockRejectedValueOnce(new ApiError(500, "internal", "Boom"));
    const page = await mountPage();
    await request(KNOWN);

    expect(document.querySelector("form")).not.toBeNull();
    expect(submitButton()!.disabled).toBe(false);

    apiRequestMock.mockResolvedValue(undefined);
    await submitForm();

    expect(bodyText()).toMatch(/if that address/i);
    await page.unmount();
  });

  it("25. no internal server detail is exposed", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(500, "internal", 'relation "password_resets" does not exist'),
    );
    const page = await mountPage();
    await request(KNOWN);

    expect(bodyText()).not.toMatch(/relation|password_resets|does not exist/i);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — nothing sensitive is retained", () => {
  it("26. the address is not written to storage", async () => {
    const page = await mountPage();
    await request(KNOWN);

    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(KNOWN);
    await page.unmount();
  });

  it("27. the address is not logged", async () => {
    const lines: unknown[] = [];
    const record = (...args: unknown[]) => lines.push(args);
    vi.stubGlobal("console", { ...console, log: record, warn: record, error: record, info: record });

    const page = await mountPage();
    await request(KNOWN);

    expect(JSON.stringify(lines)).not.toContain(KNOWN);
    await page.unmount();
  });

  it("28. the page offers a way back to sign in", async () => {
    const page = await mountPage();
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));

    expect(hrefs).toContain("/login");
    await page.unmount();
  });

  it("29. it never links into the authenticated application", async () => {
    const page = await mountPage();
    await request(KNOWN);

    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.some((href) => href?.startsWith("/dashboard"))).toBe(false);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — accessibility", () => {
  it("30. the email field has a real label", async () => {
    const page = await mountPage();
    const label = document.querySelector('label[for="fp-email"]');

    expect(label).not.toBeNull();
    expect((label!.textContent ?? "").trim().length).toBeGreaterThan(0);
    await page.unmount();
  });

  it("31. the field is described, and the description is conditional too", async () => {
    const page = await mountPage();
    const describedBy = document.getElementById("fp-email")!.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    const help = document.getElementById(describedBy!)!.textContent ?? "";
    expect(help).toMatch(/if this address/i);
    await page.unmount();
  });

  it("32. the field is a real email input", async () => {
    const page = await mountPage();
    expect((document.getElementById("fp-email") as HTMLInputElement).type).toBe("email");
    await page.unmount();
  });

  it("33. a validation failure is announced", async () => {
    const page = await mountPage();
    await submitForm();

    const alert = document.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toMatch(/enter your work email/i);
    await page.unmount();
  });

  it("34. the confirmation is announced politely", async () => {
    const page = await mountPage();
    await request(KNOWN);

    const status = document.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status!.getAttribute("aria-live")).toBe("polite");
    await page.unmount();
  });

  it("35. the form is keyboard-submittable", async () => {
    const page = await mountPage();
    expect(submitButton()!.getAttribute("type")).toBe("submit");
    await page.unmount();
  });
});
