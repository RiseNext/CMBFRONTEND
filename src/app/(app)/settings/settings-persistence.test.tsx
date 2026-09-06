/**
 * SETTINGS PERSISTENCE AND REAL SESSIONS — Tasks 12.6 and 12.8.
 *
 * Wave 1 removed seventeen controls from this page because none of them had
 * anywhere to persist to. Two of the rows it named are now built, and the risk
 * of building them is that the page goes back to *looking* saved.
 *
 * ── SO EVERY SAVE CASE ASSERTS THE SAME FOUR-PART SHAPE ─────────────────────
 *
 *   1. the request went out, to the right route, with the right body;
 *   2. the success claim came only AFTER a 2xx;
 *   3. a refusal produces no success claim and leaves the previous value;
 *   4. what is shown afterwards is the SERVER's state, not what was typed.
 *
 * Part 4 is the one that is easy to get wrong and impossible to notice: a screen
 * that adopts its own draft looks identical to one that adopted the server's
 * answer, right up until the server normalises or rejects a value. Case 8 sends
 * a value the server trims and asserts the trimmed one is what appears.
 *
 * Group C is 12.8. A revoke must actually call the endpoint and then re-read —
 * the panel it replaces raised "Session ended" and revoked nothing.
 *
 * Follows D-012.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_A = {
  id: "s-current",
  createdAt: "2026-09-06T09:00:00.000Z",
  expiresAt: "2026-10-06T09:00:00.000Z",
  userAgent: "Mozilla/5.0 (Honest Test Agent)",
  ipAddress: "203.0.113.7",
  current: true,
};
const SESSION_B = {
  id: "s-other",
  createdAt: "2026-09-01T08:00:00.000Z",
  expiresAt: "2026-10-01T08:00:00.000Z",
  userAgent: null,
  ipAddress: null,
  current: false,
};

const h = vi.hoisted(() => ({
  requests: [] as { path: string; method: string; body?: unknown }[],
  /** What `GET /settings` answers, and what a PATCH resolves to. */
  stored: {} as Record<string, unknown>,
  sessions: [] as unknown[],
  rejectPatch: null as unknown,
  rejectSettingsGet: null as unknown,
  rejectSessionsGet: null as unknown,
  rejectDelete: null as unknown,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  permissionsOfUser: [] as string[],
  demo: false,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: vi.fn(async (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      h.requests.push({ path, method, body: options?.body });

      if (path === "/settings" && method === "GET") {
        if (h.rejectSettingsGet) throw h.rejectSettingsGet;
        return { data: { ...h.stored } };
      }
      if (path === "/settings" && method === "PATCH") {
        if (h.rejectPatch) throw h.rejectPatch;
        // The real route trims and re-reads. Modelled, so case 8 is meaningful.
        for (const [key, value] of Object.entries(options?.body as Record<string, unknown>)) {
          h.stored[key] = typeof value === "string" ? value.trim() : value;
        }
        return { data: { ...h.stored } };
      }
      if (path === "/auth/sessions" && method === "GET") {
        if (h.rejectSessionsGet) throw h.rejectSessionsGet;
        return { data: h.sessions };
      }
      if (path.startsWith("/auth/sessions/") && method === "DELETE") {
        if (h.rejectDelete) throw h.rejectDelete;
        const id = path.split("/").at(-1);
        h.sessions = h.sessions.filter((s) => (s as { id: string }).id !== id);
        return undefined;
      }
      return { data: {} };
    }),
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: h.toastSuccess,
    error: h.toastError,
    info: h.toastInfo,
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/demo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo")>();
  return { ...actual, isDemoMode: () => h.demo };
});

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      name: "Signed In",
      email: "me@risenext.test",
      phone: "9848000000",
      role: { id: "r1", key: "admin", name: "Admin", level: 10 },
      permissions: h.permissionsOfUser,
      bankIds: null,
      unrestrictedBankAccess: true,
    },
    can: (key: string) => h.permissionsOfUser.includes(key),
    canAny: (...keys: string[]) => keys.some((k) => h.permissionsOfUser.includes(k)),
    signOut: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [],
    employees: [],
    teams: [],
    loading: false,
    refresh: vi.fn(),
    bankById: () => undefined,
    bankName: () => "Bank",
    bankShortName: () => "B",
    employeeById: () => undefined,
    employeeName: () => "—",
    teamName: () => "—",
  }),
}));

// Radix renders only the active tab panel; stub it so Company and Security are
// both mounted, exactly as `no-unbacked-success.test.tsx` does.
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import SettingsPage from "./page";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.requests = [];
  h.stored = {
    "organisation.legalName": "Risenext Advisory LLP",
    "organisation.gstin": "",
    "organisation.pan": "",
    "organisation.address": "",
    "organisation.billingEmail": "",
    "organisation.billingPhone": "",
    "recycleBin.retentionDays": 30,
  };
  h.sessions = [SESSION_A, SESSION_B];
  h.rejectPatch = null;
  h.rejectSettingsGet = null;
  h.rejectSessionsGet = null;
  h.rejectDelete = null;
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
  h.toastInfo.mockReset();
  h.permissionsOfUser = ["settings.view", "settings.edit"];
  h.demo = false;

  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => {
    root.render(<SettingsPage />);
  });
  await act(async () => {});
  await act(async () => {});
}

const scope = () => document.body;
const text = () => scope().textContent ?? "";
const buttons = () => Array.from(scope().querySelectorAll("button"));
const byText = (pattern: RegExp) =>
  buttons().filter((b) => pattern.test((b.textContent ?? "").trim()));

async function click(el: Element | undefined | null) {
  expect(el, "control should exist").toBeTruthy();
  await act(async () => (el as HTMLElement).click());
  await act(async () => {});
}

function setValue(id: string, value: string) {
  const input = scope().querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  expect(input, `#${id} should exist`).toBeTruthy();
  const proto =
    input!.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
  input!.dispatchEvent(new Event("input", { bubbles: true }));
}

const patches = () => h.requests.filter((r) => r.path === "/settings" && r.method === "PATCH");
const saveButton = () => byText(/^Save changes$/)[0];

/* ══ A — 12.6: the organisation record persists ═══════════════════════════ */

describe("A · settings load from and save to the server", () => {
  it("1. THE FINDING: the page reads /settings instead of showing blank inputs", async () => {
    await render();
    expect(h.requests.some((r) => r.path === "/settings" && r.method === "GET")).toBe(true);
    expect(
      scope().querySelector<HTMLInputElement>("#set-organisation-legalName")!.value,
    ).toBe("Risenext Advisory LLP");
  });

  it("2. Save is inert until something changes — it cannot report a no-op save", async () => {
    await render();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("3. saving PATCHes /settings with ONLY what changed", async () => {
    await render();
    setValue("set-organisation-gstin", "29ABCDE1234F1Z5");
    await act(async () => {});
    await click(saveButton());

    expect(patches()).toHaveLength(1);
    // Sending untouched fields too would rewrite whatever somebody else changed
    // between this page loading and the button being pressed.
    expect(patches()[0]!.body).toEqual({ "organisation.gstin": "29ABCDE1234F1Z5" });
    expect(h.toastSuccess).toHaveBeenCalled();
  });

  it("4. several fields in one save go in one request", async () => {
    await render();
    setValue("set-organisation-pan", "ABCDE1234F");
    await act(async () => {});
    setValue("set-organisation-billingEmail", "accounts@example.com");
    await act(async () => {});
    await click(saveButton());

    expect(patches()).toHaveLength(1);
    expect(patches()[0]!.body).toEqual({
      "organisation.pan": "ABCDE1234F",
      "organisation.billingEmail": "accounts@example.com",
    });
  });

  it("5. the retention setting is saved through the same route", async () => {
    await render();
    setValue("set-recycleBin-retentionDays", "7");
    await act(async () => {});
    await click(saveButton());
    expect(patches()[0]!.body).toEqual({ "recycleBin.retentionDays": "7" });
  });

  it("6. the address textarea saves too", async () => {
    await render();
    setValue("set-organisation-address", "4th floor, MG Road, Bengaluru");
    await act(async () => {});
    await click(saveButton());
    expect(patches()[0]!.body).toEqual({
      "organisation.address": "4th floor, MG Road, Bengaluru",
    });
  });

  it("7. THE RULE: success is claimed only after the server accepted", async () => {
    const { ApiError } = await import("@/lib/api");
    h.rejectPatch = new ApiError(422, "unprocessable_entity", "One or more settings are invalid", [
      { path: "recycleBin.retentionDays", message: "Too small: expected number to be >=1" },
    ]);
    await render();

    setValue("set-recycleBin-retentionDays", "0");
    await act(async () => {});
    await click(saveButton());

    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalled();
    // And the message lands under the field it names (D-031).
    expect(text()).toContain("Too small: expected number to be >=1");
  });

  it("8. what is shown afterwards is the SERVER's value, not the typed one", async () => {
    // The route trims. A screen that adopted its own draft would keep the
    // spaces and look identical until something downstream disagreed. D-026.
    await render();
    setValue("set-organisation-gstin", "  29ABCDE1234F1Z5  ");
    await act(async () => {});
    await click(saveButton());
    await act(async () => {});

    expect(scope().querySelector<HTMLInputElement>("#set-organisation-gstin")!.value).toBe(
      "29ABCDE1234F1Z5",
    );
  });

  it("9. a refused save leaves the stored value untouched", async () => {
    const { ApiError } = await import("@/lib/api");
    h.rejectPatch = new ApiError(403, "forbidden", "Refused");
    await render();

    setValue("set-organisation-legalName", "Should not persist");
    await act(async () => {});
    await click(saveButton());

    expect(h.stored["organisation.legalName"]).toBe("Risenext Advisory LLP");
  });

  it("10. a failed LOAD says so and offers a retry — it is not an empty form", async () => {
    const { ApiError } = await import("@/lib/api");
    h.rejectSettingsGet = new ApiError(500, "internal_error", "Database unavailable");
    await render();
    expect(text()).toContain("Database unavailable");
    expect(byText(/^Try again$/).length).toBeGreaterThan(0);
  });
});

/* ══ B — U-14 / OD-8: who may edit ════════════════════════════════════════ */

describe("B · settings.edit is what makes the form a form", () => {
  it("11. without settings.edit the record is read-only and offers no Save", async () => {
    h.permissionsOfUser = ["settings.view"];
    await render();
    expect(scope().querySelector("#set-organisation-legalName")).toBeNull();
    expect(text()).toContain("Risenext Advisory LLP");
    expect(byText(/^Save changes$/)).toHaveLength(0);
  });

  it("12. without settings.view the panel says so and asks nothing of the server", async () => {
    h.permissionsOfUser = [];
    await render();
    expect(text()).toContain("settings.view");
    expect(h.requests.some((r) => r.path === "/settings")).toBe(false);
  });

  it("13. a 403 from the server is reported as a refusal, not an empty record", async () => {
    const { ApiError } = await import("@/lib/api");
    h.rejectSettingsGet = new ApiError(403, "forbidden", "Refused");
    await render();
    expect(text()).toMatch(/server refused to return these settings/i);
  });

  it("14. invoice numbering is still NOT offered, and says why", async () => {
    // Nothing reads it, so a control here would claim an effect it does not have.
    await render();
    expect(text()).toMatch(/Invoice numbering/);
    expect(text()).toMatch(/read by nothing/i);
  });

  it("15. per-user preferences are still NOT offered, with the corrected reason", async () => {
    // `app_settings` has no user column, so this is not a missing route — it is
    // a missing table.
    await render();
    expect(text()).toMatch(/no user column/i);
    expect(text()).toMatch(/user_settings/);
  });
});

/* ══ C — 12.8: sessions are real and revocation revokes ═══════════════════ */

describe("C · active sessions", () => {
  it("16. THE FINDING: the panel lists sessions from the server", async () => {
    await render();
    expect(h.requests.some((r) => r.path === "/auth/sessions")).toBe(true);
    expect(scope().querySelectorAll("[data-session]")).toHaveLength(2);
  });

  it("17. the current session is marked", async () => {
    await render();
    expect(text()).toContain("This device");
  });

  it("18. the reported browser string is shown as reported, not as a device name", async () => {
    // A parsed "Chrome on Windows" would state as fact something the server
    // cannot know, on the screen whose purpose is deciding what to revoke.
    await render();
    expect(text()).toContain("Mozilla/5.0 (Honest Test Agent)");
    expect(text()).toMatch(/browser string the client sent/i);
  });

  it("19. missing metadata says Not recorded rather than being invented", async () => {
    await render();
    expect(text()).toContain("Not recorded");
  });

  it("20. Revoke calls DELETE for that session id", async () => {
    await render();
    const row = scope().querySelector('[data-session="s-other"]')!;
    await click(Array.from(row.querySelectorAll("button")).at(-1));

    expect(
      h.requests.some((r) => r.path === "/auth/sessions/s-other" && r.method === "DELETE"),
    ).toBe(true);
    expect(h.toastSuccess).toHaveBeenCalled();
  });

  it("21. …and the list is RE-READ afterwards, not patched locally", async () => {
    await render();
    const before = h.requests.filter((r) => r.path === "/auth/sessions").length;

    const row = scope().querySelector('[data-session="s-other"]')!;
    await click(Array.from(row.querySelectorAll("button")).at(-1));
    await act(async () => {});

    expect(h.requests.filter((r) => r.path === "/auth/sessions").length).toBeGreaterThan(before);
    expect(scope().querySelector('[data-session="s-other"]')).toBeNull();
  });

  it("22. a refused revoke claims nothing and leaves the row on screen", async () => {
    const { ApiError } = await import("@/lib/api");
    h.rejectDelete = new ApiError(404, "not_found", "Session not found");
    await render();

    const row = scope().querySelector('[data-session="s-other"]')!;
    await click(Array.from(row.querySelectorAll("button")).at(-1));

    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalled();
    expect(scope().querySelector('[data-session="s-other"]')).not.toBeNull();
  });

  it("23. a failed load says so rather than showing no sessions", async () => {
    const { ApiError } = await import("@/lib/api");
    h.rejectSessionsGet = new ApiError(500, "internal_error", "Upstream failure");
    await render();
    expect(text()).toContain("Upstream failure");
  });

  it("24. the demo account is told plainly it has no server-side sessions", async () => {
    // The demo user is not a database record, and asking the API for its
    // sessions would put a request on the wire from a session whose whole
    // premise is that nothing leaves the tab.
    h.demo = true;
    await render();
    expect(text()).toMatch(/no server-side sessions/i);
    expect(h.requests.some((r) => r.path === "/auth/sessions")).toBe(false);
  });

  it("25. the copy does not overstate what revocation does", async () => {
    // An access token already issued stays valid until it expires. Saying
    // "signed out instantly" would be a false security assurance.
    await render();
    expect(text()).toMatch(/stays valid for a few more minutes/i);
  });
});
