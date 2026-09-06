/**
 * TASK 3.12 — the `/reset-password` page, driven through the real component.
 *
 * The redeeming half of Task 3.6, whose backend has been complete and tested
 * since then (43 cases). Every reset email has linked here and landed on a 404.
 *
 * The risk is the same shape as Task 3.11's, so **D-045's rule applies
 * unchanged**: branch on HTTP status, never on the message. Group C proves the
 * page cannot distinguish *why* a token is unusable — all four backend refusal
 * states must render byte-identical output, or the difference is itself the
 * oracle (**D-039**). Group D proves the mirror image, which is the failure a
 * naive `catch { refused }` commits: a 500, a dropped connection, a rate-limit
 * and a rejected *password* must **not** be reported as a dead link. The user
 * holds one link that expires in an hour; telling them to throw it away
 * because the server hiccuped is expensive.
 *
 * Follows D-012 and the Task 2.4–3.11 files: `react-dom/client` + React 19's
 * `act`, no component-testing library, `vi.hoisted` for anything the mock
 * factories close over, and the real `ApiError`.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  searchParams: new URLSearchParams(),
}));

const { apiRequestMock } = h;

const TOKEN = "cmVzZXQtdG9rZW4tNDgtYnl0ZXMtYmFzZTY0dXJsLXZhbHVl";
const NEW_PASSWORD = "ChosenAfterReset1";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: h.apiRequestMock };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => h.searchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/link", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Link = ({ href, children }: { href: string; children?: React.ReactNode }) =>
    React.createElement("a", { href }, children);
  Link.displayName = "Link";
  return { default: Link };
});

import ResetPasswordPage from "@/app/reset-password/page";

/** The exact refusal the backend sends for every unusable reset token. */
const BACKEND_REFUSAL =
  "This password reset link is not valid. It may have expired or already been used.";

/** Every distinct backend state that must render identically. */
const REFUSAL_CASES = [
  ["an unknown token", BACKEND_REFUSAL],
  ["an expired token", BACKEND_REFUSAL],
  ["an already-consumed token", BACKEND_REFUSAL],
  ["a deleted or deactivated account", BACKEND_REFUSAL],
] as const;

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue(undefined); // 204, no body
  h.searchParams = new URLSearchParams(`token=${TOKEN}`);

  window.history.replaceState(null, "", `/reset-password?token=${TOKEN}`);
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
    root.render(<ResetPasswordPage />);
  });
  return {
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function setInput(id: string, value: string) {
  const field = document.getElementById(id) as HTMLInputElement | null;
  if (!field) throw new Error(`field ${id} not rendered`);
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

async function completeForm(password = NEW_PASSWORD) {
  await setInput("rp-password", password);
  await setInput("rp-confirm", password);
  await submitForm();
}

const submitButton = () =>
  Array.from(document.querySelectorAll("button")).find((b) =>
    /^(Set new password|Setting your password)/.test((b.textContent ?? "").trim()),
  );

const bodyText = () => document.body.textContent ?? "";
const hrefs = () =>
  Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));

/* ------------------------------------------------------------------ group A */

describe("A — routing and the token", () => {
  it("1. a link with a token renders the reset form", async () => {
    const page = await mountPage();

    expect(document.getElementById("rp-password")).not.toBeNull();
    expect(document.getElementById("rp-confirm")).not.toBeNull();
    await page.unmount();
  });

  it("2. a link with NO token shows the generic refusal and asks the server nothing", async () => {
    h.searchParams = new URLSearchParams();
    const page = await mountPage();

    expect(bodyText()).toContain(BACKEND_REFUSAL);
    expect(document.getElementById("rp-password")).toBeNull();
    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("3. a blank token is treated the same way", async () => {
    h.searchParams = new URLSearchParams("token=   ");
    const page = await mountPage();

    expect(bodyText()).toContain(BACKEND_REFUSAL);
    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("4. the token is sent to /auth/reset-password in the `token` field", async () => {
    const page = await mountPage();
    await completeForm();

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock.mock.calls[0]![0]).toBe("/auth/reset-password");
    const body = (apiRequestMock.mock.calls[0]![1] as { body: { token: string } }).body;
    expect(body.token).toBe(TOKEN);
    await page.unmount();
  });

  it("5. it POSTs, and sends only the token and the password", async () => {
    const page = await mountPage();
    await completeForm();

    const options = apiRequestMock.mock.calls[0]![1] as { method?: string; body?: object };
    expect(options.method).toBe("POST");
    expect(Object.keys(options.body ?? {}).sort()).toEqual(["password", "token"]);
    await page.unmount();
  });

  it("6. it does NOT hit the invitation endpoint — the two flows stay separate", async () => {
    // D-039 keeps reset and invitation on separate tables precisely so a token
    // cannot cross. The pages must not cross either.
    const page = await mountPage();
    await completeForm();

    expect(apiRequestMock.mock.calls[0]![0]).not.toContain("accept-invite");
    await page.unmount();
  });

  it("7. the page never renders the token", async () => {
    const page = await mountPage();
    expect(bodyText()).not.toContain(TOKEN);

    await completeForm();
    expect(bodyText()).not.toContain(TOKEN);
    await page.unmount();
  });

  it("8. no request is made just to check the token before submitting", async () => {
    const page = await mountPage();
    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — password validation, mirrored from the shared policy", () => {
  it("9. an empty password does not reach the server", async () => {
    const page = await mountPage();
    await submitForm();

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(bodyText()).toMatch(/choose a new password/i);
    await page.unmount();
  });

  it("10. a too-short password is refused client-side", async () => {
    const page = await mountPage();
    await setInput("rp-password", "Short1");
    await setInput("rp-confirm", "Short1");
    await submitForm();

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(bodyText()).toMatch(/at least 12 characters/i);
    await page.unmount();
  });

  it("11. a password with no digit is refused client-side", async () => {
    const page = await mountPage();
    await setInput("rp-password", "NoDigitsHereAtAll");
    await setInput("rp-confirm", "NoDigitsHereAtAll");
    await submitForm();

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(bodyText()).toMatch(/must contain a digit/i);
    await page.unmount();
  });

  it("12. a mismatched confirmation is refused client-side", async () => {
    const page = await mountPage();
    await setInput("rp-password", NEW_PASSWORD);
    await setInput("rp-confirm", "SomethingElse123");
    await submitForm();

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(bodyText()).toMatch(/do not match/i);
    await page.unmount();
  });

  it("13. a valid password submits exactly once", async () => {
    const page = await mountPage();
    await completeForm();

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    await page.unmount();
  });

  it("14. the submit control is disabled and marked busy while in flight", async () => {
    let release: (value: unknown) => void = () => {};
    apiRequestMock.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const page = await mountPage();
    await setInput("rp-password", NEW_PASSWORD);
    await setInput("rp-confirm", NEW_PASSWORD);
    await submitForm();

    expect(submitButton()!.disabled).toBe(true);
    expect(submitButton()!.getAttribute("aria-busy")).toBe("true");

    await act(async () => release(undefined));
    await page.unmount();
  });

  it("15. repeated submits while in flight issue only one request", async () => {
    let release: (value: unknown) => void = () => {};
    apiRequestMock.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const page = await mountPage();
    await setInput("rp-password", NEW_PASSWORD);
    await setInput("rp-confirm", NEW_PASSWORD);
    await submitForm();
    await submitForm();
    await submitForm();

    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    await act(async () => release(undefined));
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — every unusable token produces ONE identical refusal", () => {
  it.each(REFUSAL_CASES)("16. %s renders the generic refusal", async (_label, message) => {
    apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", message));
    const page = await mountPage();
    await completeForm();

    expect(bodyText()).toContain(BACKEND_REFUSAL);
    await page.unmount();
  });

  it("17. all four backend states render BYTE-IDENTICAL output", async () => {
    const renders: string[] = [];

    for (const [, message] of REFUSAL_CASES) {
      apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", message));
      const page = await mountPage();
      await completeForm();
      renders.push(bodyText());
      await page.unmount();
      document.body.innerHTML = "";
    }

    expect(new Set(renders).size).toBe(1);
  });

  it("18. a missing token renders exactly what a server refusal renders", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", BACKEND_REFUSAL));
    const page = await mountPage();
    await completeForm();
    const fromServer = bodyText();
    await page.unmount();
    document.body.innerHTML = "";

    h.searchParams = new URLSearchParams();
    const second = await mountPage();
    expect(bodyText()).toBe(fromServer);
    await second.unmount();
  });

  it("19. the refusal never states WHICH condition occurred", async () => {
    for (const [, message] of REFUSAL_CASES) {
      apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", message));
      const page = await mountPage();
      await completeForm();

      /*
       * The backend's own sentence hedges — "may have expired or already been
       * used" — and that hedging is what makes it uninformative, so it is
       * stripped before the check. Nothing outside it may assert a condition.
       */
      const text = bodyText().split(BACKEND_REFUSAL).join("");
      for (const pattern of [
        /has expired/i,
        /link expired/i,
        /already been used/i,
        /was already used/i,
        /(does not exist|not found)/i,
        /account (was )?(deleted|deactivated|disabled|inactive)/i,
      ]) {
        expect(text).not.toMatch(pattern);
      }

      await page.unmount();
      document.body.innerHTML = "";
    }
  });

  it("20. the form is withdrawn after a refusal, so a dead token is not retried", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", BACKEND_REFUSAL));
    const page = await mountPage();
    await completeForm();

    expect(document.getElementById("rp-password")).toBeNull();
    await page.unmount();
  });

  it("21. the refusal offers a safe way onward — request a fresh link", async () => {
    // Safe because `forgot-password` answers identically for every address.
    apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", BACKEND_REFUSAL));
    const page = await mountPage();
    await completeForm();

    expect(hrefs()).toContain("/forgot-password");
    await page.unmount();
  });

  it("22. no account identity is shown, before or after a refusal", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", BACKEND_REFUSAL));
    const page = await mountPage();
    const before = bodyText();
    await completeForm();

    for (const text of [before, bodyText()]) {
      expect(text).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
      expect(text).not.toMatch(/EMP-\d+/);
    }
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — a failure that is NOT the token's fault must not blame the token", () => {
  it("23. a 500 does not claim the link is invalid", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, "internal", "Unexpected server error"));
    const page = await mountPage();
    await completeForm();

    expect(bodyText()).not.toContain(BACKEND_REFUSAL);
    expect(bodyText()).toMatch(/something went wrong/i);
    await page.unmount();
  });

  it("24. a network failure does not claim the link is invalid", async () => {
    apiRequestMock.mockRejectedValue(new Error("Network request failed"));
    const page = await mountPage();
    await completeForm();

    expect(bodyText()).not.toContain(BACKEND_REFUSAL);
    await page.unmount();
  });

  it("25. a 429 is reported as a rate limit, not a dead link", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(429, "too_many_requests", "Too many attempts, try again later"),
    );
    const page = await mountPage();
    await completeForm();

    const text = bodyText();
    expect(text).not.toContain(BACKEND_REFUSAL);
    expect(text).toMatch(/too many attempts/i);
    await page.unmount();
  });

  it("26. a 429 does not reveal whether the account exists", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(429, "too_many_requests", "Too many attempts, try again later"),
    );
    const page = await mountPage();
    await completeForm();

    expect(bodyText()).not.toMatch(/account|address|email exists/i);
    await page.unmount();
  });

  it("27. a 422 keeps the form open and does not blame the link", async () => {
    // The server rejects the password WITHOUT consuming the token, so the link
    // is still good — withdrawing the form here would strand the user.
    apiRequestMock.mockRejectedValue(
      new ApiError(422, "unprocessable", "Password must contain a digit"),
    );
    const page = await mountPage();
    await completeForm();

    const text = bodyText();
    expect(text).not.toContain(BACKEND_REFUSAL);
    expect(text).toMatch(/must contain a digit/i);
    expect(document.getElementById("rp-password")).not.toBeNull();
    await page.unmount();
  });

  it("28. after a non-token failure the user can retry successfully", async () => {
    apiRequestMock.mockRejectedValueOnce(new ApiError(500, "internal", "Boom"));
    const page = await mountPage();
    await completeForm();

    expect(submitButton()!.disabled).toBe(false);

    apiRequestMock.mockResolvedValue(undefined);
    await completeForm();

    expect(bodyText()).toMatch(/your password has been reset/i);
    await page.unmount();
  });

  it("29. no failure of any kind produces a success state", async () => {
    for (const failure of [
      new ApiError(400, "bad_request", BACKEND_REFUSAL),
      new ApiError(422, "unprocessable", "Password must contain a digit"),
      new ApiError(429, "too_many_requests", "Too many attempts"),
      new ApiError(500, "internal", "Boom"),
      new Error("offline"),
    ]) {
      apiRequestMock.mockRejectedValue(failure);
      const page = await mountPage();
      await completeForm();

      expect(bodyText()).not.toMatch(/your password has been reset/i);
      await page.unmount();
      document.body.innerHTML = "";
    }
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — success revokes sessions and leads to sign in", () => {
  it("30. a 204 renders the success state", async () => {
    const page = await mountPage();
    await completeForm();

    expect(bodyText()).toMatch(/your password has been reset/i);
    await page.unmount();
  });

  it("31. it says the user has been signed out everywhere, which is true", async () => {
    // Task 3.6 revokes every refresh token on completion.
    const page = await mountPage();
    await completeForm();

    expect(bodyText()).toMatch(/signed out on every device/i);
    await page.unmount();
  });

  it("32. success links to /login, not into the application", async () => {
    const page = await mountPage();
    await completeForm();

    expect(hrefs()).toContain("/login");
    expect(hrefs().some((href) => href?.startsWith("/dashboard"))).toBe(false);
    await page.unmount();
  });

  it("33. no session-bearing call is made — only the one reset request", async () => {
    const page = await mountPage();
    await completeForm();

    expect(apiRequestMock.mock.calls.map((call) => call[0])).toEqual(["/auth/reset-password"]);
    await page.unmount();
  });

  it("34. neither the password nor the token is displayed after success", async () => {
    const page = await mountPage();
    await completeForm();

    const text = bodyText();
    expect(text).not.toContain(NEW_PASSWORD);
    expect(text).not.toContain(TOKEN);
    await page.unmount();
  });

  it("35. the spent token is dropped from the address bar", async () => {
    const page = await mountPage();
    expect(window.location.search).toContain("token=");

    await completeForm();

    expect(window.location.search).toBe("");
    await page.unmount();
  });

  it("36. the form is gone after success, so it cannot be resubmitted", async () => {
    const page = await mountPage();
    await completeForm();

    expect(document.querySelector("form")).toBeNull();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group F */

describe("F — the token is treated as a one-time credential", () => {
  it("37. it is never written to localStorage or sessionStorage", async () => {
    const page = await mountPage();
    await completeForm();

    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(TOKEN);
    await page.unmount();
  });

  it("38. it is never logged to the console", async () => {
    const lines: unknown[] = [];
    const record = (...args: unknown[]) => lines.push(args);
    vi.stubGlobal("console", { ...console, log: record, warn: record, error: record, info: record });

    const page = await mountPage();
    await completeForm();

    expect(JSON.stringify(lines)).not.toContain(TOKEN);
    await page.unmount();
  });

  it("39. the password is never logged either", async () => {
    const lines: unknown[] = [];
    const record = (...args: unknown[]) => lines.push(args);
    vi.stubGlobal("console", { ...console, log: record, warn: record, error: record, info: record });

    const page = await mountPage();
    await completeForm();

    expect(JSON.stringify(lines)).not.toContain(NEW_PASSWORD);
    await page.unmount();
  });

  it("40. the token appears in no error state", async () => {
    for (const failure of [
      new ApiError(400, "bad_request", BACKEND_REFUSAL),
      new ApiError(500, "internal", "Boom"),
    ]) {
      apiRequestMock.mockRejectedValue(failure);
      const page = await mountPage();
      await completeForm();

      expect(bodyText()).not.toContain(TOKEN);
      await page.unmount();
      document.body.innerHTML = "";
    }
  });

  it("41. no internal server detail is surfaced", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(500, "internal", 'relation "password_resets" does not exist'),
    );
    const page = await mountPage();
    await completeForm();

    expect(bodyText()).not.toMatch(/relation|password_resets|does not exist/i);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group G */

describe("G — accessibility", () => {
  it("42. both password fields have real labels", async () => {
    const page = await mountPage();

    for (const id of ["rp-password", "rp-confirm"]) {
      const label = document.querySelector(`label[for="${id}"]`);
      expect(label, `no label for ${id}`).not.toBeNull();
      expect((label!.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
    await page.unmount();
  });

  it("43. the policy is described up front, not only after a mistake", async () => {
    const page = await mountPage();
    const describedBy = document.getElementById("rp-password")!.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toMatch(/12 characters/i);
    await page.unmount();
  });

  it("44. a validation failure is announced", async () => {
    const page = await mountPage();
    await submitForm();

    const alert = document.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toMatch(/choose a new password/i);
    await page.unmount();
  });

  it("45. an invalid password field is marked invalid", async () => {
    const page = await mountPage();
    await setInput("rp-password", "short");

    expect(document.getElementById("rp-password")!.getAttribute("aria-invalid")).toBe("true");
    await page.unmount();
  });

  it("46. a mismatched confirmation is marked and described", async () => {
    const page = await mountPage();
    await setInput("rp-password", NEW_PASSWORD);
    await setInput("rp-confirm", "Different123456");

    const field = document.getElementById("rp-confirm")!;
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby")!)).not.toBeNull();
    await page.unmount();
  });

  it("47. the refusal is announced assertively", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", BACKEND_REFUSAL));
    const page = await mountPage();
    await completeForm();

    const alert = document.querySelector('[role="alert"]');
    expect(alert!.getAttribute("aria-live")).toBe("assertive");
    await page.unmount();
  });

  it("48. the success state is announced politely", async () => {
    const page = await mountPage();
    await completeForm();

    const status = document.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status!.getAttribute("aria-live")).toBe("polite");
    await page.unmount();
  });

  it("49. the form is keyboard-submittable — the button is a real submit", async () => {
    const page = await mountPage();
    expect(submitButton()!.getAttribute("type")).toBe("submit");
    await page.unmount();
  });

  it("50. every onward action is a real, labelled link", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", BACKEND_REFUSAL));
    const page = await mountPage();
    await completeForm();

    for (const anchor of Array.from(document.querySelectorAll("a"))) {
      expect((anchor.textContent ?? "").trim().length).toBeGreaterThan(0);
      expect(anchor.getAttribute("href")).toBeTruthy();
    }
    await page.unmount();
  });
});
