/**
 * TASK 3.11 — the `/accept-invite` page, driven through the real component.
 *
 * The backend has been complete since Task 3.5 (49 tests). This page is the
 * user-facing half, and the risk is concentrated in one place: **the failure
 * branch**.
 *
 * `acceptInvitation` answers **one identical refusal** for every unusable token
 * — unknown, expired, already consumed, or belonging to a deleted or
 * deactivated employee (**D-038**). Distinguishing them would turn a public
 * page into an oracle for which addresses have a pending invitation. So group C
 * is the load-bearing one: it drives all four backend refusal shapes through
 * the real page and asserts the rendered output is **byte-identical**, and that
 * none of the forbidden words ever appears.
 *
 * Group D is its mirror image and matters just as much: a 422, a 429, a 500 and
 * a dropped connection must **not** be reported as a bad invitation. Telling a
 * user their link is dead because the server hiccuped costs them the one
 * working link they have.
 *
 * Follows D-012 and the Task 2.4–3.10 files: `react-dom/client` + React 19's
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

const TOKEN = "Zm9vYmFyLXRva2VuLXZhbHVlLTQ4LWJ5dGVzLWJhc2U2NHVybA";
const GOOD_PASSWORD = "ChosenByTheEmployee1";

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

import AcceptInvitePage from "@/app/accept-invite/page";

/** The exact refusal the backend sends for every unusable token. */
const BACKEND_REFUSAL =
  "This invitation link is not valid. It may have expired or already been used.";

/** Every distinct backend state that must render identically. */
const REFUSAL_CASES = [
  ["an unknown token", BACKEND_REFUSAL],
  ["an expired token", BACKEND_REFUSAL],
  ["an already-consumed token", BACKEND_REFUSAL],
  ["a deleted or deactivated employee", BACKEND_REFUSAL],
] as const;

/** Words that would betray which backend state occurred. */
const FORBIDDEN = [
  /\bexpired\b/i,
  /\balready (been )?used\b/i,
  /\bconsumed\b/i,
  /\bdoes not exist\b/i,
  /\bunknown\b/i,
  /\bdeleted\b/i,
  /\bdeactivated\b/i,
  /\bdisabled\b/i,
  /\bnot found\b/i,
];

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue(undefined); // 204, no body
  h.searchParams = new URLSearchParams(`token=${TOKEN}`);

  window.history.replaceState(null, "", `/accept-invite?token=${TOKEN}`);
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
    root.render(<AcceptInvitePage />);
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

const submitButton = () =>
  Array.from(document.querySelectorAll("button")).find((b) =>
    /^(Set password|Setting your password)/.test((b.textContent ?? "").trim()),
  );

async function submitForm() {
  const form = document.querySelector("form");
  if (!form) throw new Error("form not rendered");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

/** Fills a valid password pair and submits. */
async function completeForm(password = GOOD_PASSWORD) {
  await setInput("ai-password", password);
  await setInput("ai-confirm", password);
  await submitForm();
}

const bodyText = () => document.body.textContent ?? "";
const payloads = () => apiRequestMock.mock.calls.map((call) => call[1] as { body?: unknown });

/* ------------------------------------------------------------------ group A */

describe("A — routing and the token", () => {
  it("1. a link with a token renders the password form", async () => {
    const page = await mountPage();

    expect(document.getElementById("ai-password")).not.toBeNull();
    expect(document.getElementById("ai-confirm")).not.toBeNull();
    await page.unmount();
  });

  it("2. a link with NO token shows the generic refusal, and asks the server nothing", async () => {
    h.searchParams = new URLSearchParams();
    const page = await mountPage();

    expect(bodyText()).toContain(BACKEND_REFUSAL);
    expect(document.getElementById("ai-password")).toBeNull();
    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("3. an empty token is treated the same way", async () => {
    h.searchParams = new URLSearchParams("token=   ");
    const page = await mountPage();

    expect(bodyText()).toContain(BACKEND_REFUSAL);
    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("4. the token from the query string is sent in the `token` field", async () => {
    const page = await mountPage();
    await completeForm();

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock.mock.calls[0]![0]).toBe("/auth/accept-invite");
    expect((payloads()[0]!.body as { token: string }).token).toBe(TOKEN);
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

  it("6. the page never renders the token", async () => {
    const page = await mountPage();
    expect(bodyText()).not.toContain(TOKEN);

    await completeForm();
    expect(bodyText()).not.toContain(TOKEN);
    await page.unmount();
  });

  it("7. no page checks the token with the server before showing the form", async () => {
    // There is no token-validation endpoint, and inventing one would leak
    // exactly what the single refusal protects.
    const page = await mountPage();

    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — password validation, mirrored from the server policy", () => {
  it("8. an empty password does not reach the server", async () => {
    const page = await mountPage();
    await submitForm();

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(bodyText()).toMatch(/choose a password/i);
    await page.unmount();
  });

  it("9. a too-short password is refused client-side", async () => {
    const page = await mountPage();
    await setInput("ai-password", "Short1");
    await setInput("ai-confirm", "Short1");
    await submitForm();

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(bodyText()).toMatch(/at least 12 characters/i);
    await page.unmount();
  });

  it("10. a password with no digit is refused client-side", async () => {
    const page = await mountPage();
    await setInput("ai-password", "NoDigitsHereAtAll");
    await setInput("ai-confirm", "NoDigitsHereAtAll");
    await submitForm();

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(bodyText()).toMatch(/must contain a digit/i);
    await page.unmount();
  });

  it("11. a password with no uppercase letter is refused client-side", async () => {
    const page = await mountPage();
    await setInput("ai-password", "nouppercase123");
    await setInput("ai-confirm", "nouppercase123");
    await submitForm();

    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("12. a mismatched confirmation is refused client-side", async () => {
    const page = await mountPage();
    await setInput("ai-password", GOOD_PASSWORD);
    await setInput("ai-confirm", "SomethingElse123");
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

  it("14. the submit control is disabled while the request is in flight", async () => {
    let release: (value: unknown) => void = () => {};
    apiRequestMock.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const page = await mountPage();
    await setInput("ai-password", GOOD_PASSWORD);
    await setInput("ai-confirm", GOOD_PASSWORD);
    await submitForm();

    expect(submitButton()!.disabled).toBe(true);
    expect(submitButton()!.getAttribute("aria-busy")).toBe("true");

    await act(async () => release(undefined));
    await page.unmount();
  });

  it("15. a second submit while in flight does not issue a second request", async () => {
    let release: (value: unknown) => void = () => {};
    apiRequestMock.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const page = await mountPage();
    await setInput("ai-password", GOOD_PASSWORD);
    await setInput("ai-confirm", GOOD_PASSWORD);
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
    /*
     * The load-bearing test. Not "each contains the message" — the whole
     * rendered page must be indistinguishable, or the difference itself is the
     * oracle (D-038).
     */
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

  it("18. a missing token renders the same thing as a server refusal", async () => {
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

  it("19. the refusal never says WHICH condition occurred", async () => {
    for (const [, message] of REFUSAL_CASES) {
      apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", message));
      const page = await mountPage();
      await completeForm();

      /*
       * The backend's own sentence pairs "expired" with "already been used" —
       * that pairing is exactly what makes it uninformative, so it is allowed
       * and is stripped before the check. What must never appear is either
       * condition asserted on its own as a verdict.
       */
      const text = bodyText().split(BACKEND_REFUSAL).join("");
      const verdicts = [
        /has expired/i,
        /link expired/i,
        /already been used/i,
        /was already used/i,
        /invitation (does not exist|not found)/i,
        /account (was )?(deleted|deactivated|disabled)/i,
      ];
      for (const pattern of verdicts) expect(text).not.toMatch(pattern);

      await page.unmount();
      document.body.innerHTML = "";
    }
  });

  it("20. the form is withdrawn after a refusal, so the dead token is not retried", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", BACKEND_REFUSAL));
    const page = await mountPage();
    await completeForm();

    expect(document.getElementById("ai-password")).toBeNull();
    await page.unmount();
  });

  it("21. no employee identity is shown before or after a refusal", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", BACKEND_REFUSAL));
    const page = await mountPage();
    const before = bodyText();
    await completeForm();

    for (const text of [before, bodyText()]) {
      expect(text).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i); // no email address
      expect(text).not.toMatch(/EMP-\d+/);
    }
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — a failure that is NOT the token's fault must not blame the token", () => {
  it("22. a 500 does not say the invitation is invalid", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, "internal", "Unexpected server error"));
    const page = await mountPage();
    await completeForm();

    const text = bodyText();
    expect(text).not.toContain(BACKEND_REFUSAL);
    expect(text).toMatch(/something went wrong/i);
    await page.unmount();
  });

  it("23. a network failure does not say the invitation is invalid", async () => {
    apiRequestMock.mockRejectedValue(new Error("Network request failed"));
    const page = await mountPage();
    await completeForm();

    expect(bodyText()).not.toContain(BACKEND_REFUSAL);
    await page.unmount();
  });

  it("24. a 429 says it is a rate limit, not a bad link", async () => {
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

  it("25. a 422 password rejection keeps the form and does not blame the link", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(422, "unprocessable", "Password must contain a digit"),
    );
    const page = await mountPage();
    await completeForm();

    const text = bodyText();
    expect(text).not.toContain(BACKEND_REFUSAL);
    expect(text).toMatch(/must contain a digit/i);
    expect(document.getElementById("ai-password")).not.toBeNull();
    await page.unmount();
  });

  it("26. after a non-token failure the user can try again", async () => {
    apiRequestMock.mockRejectedValueOnce(new ApiError(500, "internal", "Boom"));
    const page = await mountPage();
    await completeForm();

    expect(submitButton()!.disabled).toBe(false);

    apiRequestMock.mockResolvedValue(undefined);
    await completeForm();

    expect(bodyText()).toMatch(/your password is set/i);
    await page.unmount();
  });

  it("27. no failure produces a success state", async () => {
    for (const failure of [
      new ApiError(400, "bad_request", BACKEND_REFUSAL),
      new ApiError(422, "unprocessable", "Password must contain a digit"),
      new ApiError(500, "internal", "Boom"),
      new Error("offline"),
    ]) {
      apiRequestMock.mockRejectedValue(failure);
      const page = await mountPage();
      await completeForm();

      expect(bodyText()).not.toMatch(/your password is set/i);
      await page.unmount();
      document.body.innerHTML = "";
    }
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — success creates no session and leads to sign in", () => {
  it("28. a 204 renders the success state", async () => {
    const page = await mountPage();
    await completeForm();

    expect(bodyText()).toMatch(/your password is set/i);
    await page.unmount();
  });

  it("29. success offers a link to /login, not a redirect into the app", async () => {
    // The endpoint creates no session, so entering `(app)` would bounce back.
    const page = await mountPage();
    await completeForm();

    const link = Array.from(document.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === "/login",
    );
    expect(link).toBeDefined();
    await page.unmount();
  });

  it("30. success never links into the authenticated application", async () => {
    const page = await mountPage();
    await completeForm();

    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/dashboard");
    expect(hrefs.some((href) => href?.startsWith("/dashboard"))).toBe(false);
    await page.unmount();
  });

  it("31. no session-bearing call is made — only the one accept request", async () => {
    const page = await mountPage();
    await completeForm();

    const paths = apiRequestMock.mock.calls.map((call) => call[0]);
    expect(paths).toEqual(["/auth/accept-invite"]);
    await page.unmount();
  });

  it("32. neither the password nor the token is displayed after success", async () => {
    const page = await mountPage();
    await completeForm();

    const text = bodyText();
    expect(text).not.toContain(GOOD_PASSWORD);
    expect(text).not.toContain(TOKEN);
    await page.unmount();
  });

  it("33. the spent token is dropped from the address bar", async () => {
    const page = await mountPage();
    expect(window.location.search).toContain("token=");

    await completeForm();

    expect(window.location.search).toBe("");
    await page.unmount();
  });

  it("34. the form is gone after success, so it cannot be resubmitted", async () => {
    const page = await mountPage();
    await completeForm();

    expect(document.querySelector("form")).toBeNull();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group F */

describe("F — the token is treated as a one-time credential", () => {
  it("35. it is never written to localStorage or sessionStorage", async () => {
    const page = await mountPage();
    await completeForm();

    const stored = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(stored).not.toContain(TOKEN);
    await page.unmount();
  });

  it("36. it is never logged to the console", async () => {
    const lines: unknown[] = [];
    const record = (...args: unknown[]) => lines.push(args);
    vi.stubGlobal("console", { ...console, log: record, warn: record, error: record, info: record });

    const page = await mountPage();
    await completeForm();

    expect(JSON.stringify(lines)).not.toContain(TOKEN);
    await page.unmount();
  });

  it("37. it does not appear in the refusal state", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", BACKEND_REFUSAL));
    const page = await mountPage();
    await completeForm();

    expect(bodyText()).not.toContain(TOKEN);
    await page.unmount();
  });

  it("38. it does not appear in any error state", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, "internal", "Boom"));
    const page = await mountPage();
    await completeForm();

    expect(bodyText()).not.toContain(TOKEN);
    await page.unmount();
  });

  it("39. no forbidden state word appears anywhere on the page, in any state", async () => {
    const states: Array<() => void> = [
      () => apiRequestMock.mockResolvedValue(undefined),
      () => apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", BACKEND_REFUSAL)),
      () => apiRequestMock.mockRejectedValue(new ApiError(500, "internal", "Boom")),
    ];

    for (const arrange of states) {
      arrange();
      const page = await mountPage();
      await completeForm();
      const text = bodyText();

      for (const pattern of FORBIDDEN) {
        // The backend's own sentence pairs "expired" with "already been used";
        // that exact sentence is allowed, nothing else is.
        const withoutBackendSentence = text.split(BACKEND_REFUSAL).join("");
        expect(withoutBackendSentence).not.toMatch(pattern);
      }

      await page.unmount();
      document.body.innerHTML = "";
    }
  });
});

/* ------------------------------------------------------------------ group G */

describe("G — accessibility", () => {
  it("40. both password fields have real labels", async () => {
    const page = await mountPage();

    for (const id of ["ai-password", "ai-confirm"]) {
      const label = document.querySelector(`label[for="${id}"]`);
      expect(label, `no label for ${id}`).not.toBeNull();
      expect((label!.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
    await page.unmount();
  });

  it("41. the password requirement is described, not left to the error state", async () => {
    const page = await mountPage();
    const field = document.getElementById("ai-password")!;
    const describedBy = field.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toMatch(/12 characters/i);
    await page.unmount();
  });

  it("42. a validation failure is announced", async () => {
    const page = await mountPage();
    await submitForm();

    const alert = document.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toMatch(/choose a password/i);
    await page.unmount();
  });

  it("43. an invalid field is marked invalid", async () => {
    const page = await mountPage();
    await setInput("ai-password", "short");

    expect(document.getElementById("ai-password")!.getAttribute("aria-invalid")).toBe("true");
    await page.unmount();
  });

  it("44. a mismatched confirmation is marked and described", async () => {
    const page = await mountPage();
    await setInput("ai-password", GOOD_PASSWORD);
    await setInput("ai-confirm", "Different123456");

    const field = document.getElementById("ai-confirm")!;
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby")!)).not.toBeNull();
    await page.unmount();
  });

  it("45. the refusal state is announced assertively", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", BACKEND_REFUSAL));
    const page = await mountPage();
    await completeForm();

    const alert = document.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.getAttribute("aria-live")).toBe("assertive");
    await page.unmount();
  });

  it("46. the success state is announced", async () => {
    const page = await mountPage();
    await completeForm();

    const status = document.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status!.getAttribute("aria-live")).toBe("polite");
    await page.unmount();
  });

  it("47. the form is submittable by keyboard — the button is a real submit", async () => {
    const page = await mountPage();
    expect(submitButton()!.getAttribute("type")).toBe("submit");
    await page.unmount();
  });

  it("48. the success action is a real link, reachable by keyboard", async () => {
    const page = await mountPage();
    await completeForm();

    const link = Array.from(document.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === "/login",
    );
    expect(link!.tagName).toBe("A");
    expect((link!.textContent ?? "").trim().length).toBeGreaterThan(0);
    await page.unmount();
  });

  it("49. the refusal state offers a keyboard-reachable way onward", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(400, "bad_request", BACKEND_REFUSAL));
    const page = await mountPage();
    await completeForm();

    const link = Array.from(document.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === "/login",
    );
    expect(link).toBeDefined();
    await page.unmount();
  });

  it("50. clicking the success link does not issue a request", async () => {
    const page = await mountPage();
    await completeForm();
    apiRequestMock.mockClear();

    const link = Array.from(document.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === "/login",
    );
    await click(link!);

    expect(apiRequestMock).not.toHaveBeenCalled();
    await page.unmount();
  });
});
