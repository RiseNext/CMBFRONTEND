/**
 * TASK 3.10 — the last false email promise, driven through the real page.
 *
 * The settings page carried a **Request export** control whose entire handler
 * was one line:
 *
 *     toast.success("Export queued", {
 *       description: "You'll get an email when it's ready.",
 *     });
 *
 * No request, no queue, no job, no file, no `sendEmail`. It promised an
 * asynchronous archive *and* an email, and neither exists anywhere in this
 * system. The roadmap allowed either implementing it or removing the control;
 * it was **removed**, because a real workspace archive needs server-side export
 * or a zip dependency and **roadmap 11.9 already owns that work** (see D-043).
 *
 * The load-bearing group is B: it sweeps the **entire rendered page** — every
 * tab at once — for any claim that an email will arrive or that work has been
 * queued. That is the Phase 3 Definition of Done box this task closes ("No UI
 * text promises an email that is not sent"), and asserting it page-wide is what
 * stops the promise creeping back somewhere adjacent.
 *
 * Follows D-012 and the Task 2.4–3.9 files: `react-dom/client` + React 19's
 * `act`, no component-testing library, `vi.hoisted` for anything the mock
 * factories close over. `@/components/ui/tabs` is stubbed so every tab's
 * content is in the DOM simultaneously — Radix renders only the active panel,
 * and a promise hiding on an inactive tab is exactly what must not survive.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  updateUserMock: vi.fn(),
  signOutMock: vi.fn(),
}));

const { apiRequestMock, toastSuccess, toastError, toastInfo } = h;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: h.apiRequestMock };
});

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "admin-1",
      name: "Super Admin",
      email: "admin@risenext.com",
      phone: "9848000000",
      avatarUrl: null,
      role: { id: "sa", key: "super_admin", name: "Super Admin", level: 0 },
      permissions: ["*"],
      assignedBanks: [],
    },
    updateUser: h.updateUserMock,
    signOut: h.signOutMock,
    can: () => true,
  }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [],
    teams: [],
    employees: [],
    loading: false,
    refresh: vi.fn(),
    bankName: () => "Unassigned",
    bankById: () => undefined,
    bankShortName: () => "—",
    employeeById: () => undefined,
    employeeName: () => "Unassigned",
    teamName: () => "—",
  }),
}));

/**
 * Radix renders only the ACTIVE tab panel. Stubbed so every panel is mounted at
 * once — a false promise parked on an inactive tab must not escape the sweep.
 */
vi.mock("@/components/ui/tabs", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const passthrough = (tag: string, name: string) => {
    const Passthrough = ({ children }: { children?: React.ReactNode }) =>
      React.createElement(tag, null, children);
    Passthrough.displayName = name;
    return Passthrough;
  };

  const TabsTrigger = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("button", { type: "button" }, children);
  TabsTrigger.displayName = "TabsTrigger";

  return {
    Tabs: passthrough("div", "Tabs"),
    TabsList: passthrough("div", "TabsList"),
    TabsTrigger,
    TabsContent: passthrough("div", "TabsContent"),
  };
});

vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    Select: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("select", null, children),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => children,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) =>
      React.createElement("option", { value }, children),
  };
});

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: h.toastInfo },
}));

import SettingsPage from "@/app/(app)/settings/page";

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ data: {} });
  toastSuccess.mockReset();
  toastError.mockReset();
  toastInfo.mockReset();

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
    root.render(<SettingsPage />);
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

const buttons = () => Array.from(document.querySelectorAll("button"));
const bodyText = () => document.body.textContent ?? "";

/** Everything the page said through a toast, in one string. */
const everythingSaid = () =>
  JSON.stringify([toastSuccess.mock.calls, toastInfo.mock.calls, toastError.mock.calls]);

/**
 * Buttons that navigate or destroy, which a sweep must not fire.
 * `Reset demo data` calls `window.location.reload()`, which jsdom cannot do.
 */
const DENY = ["Reset data", "Sign out", "Delete", "Remove"];

/* ------------------------------------------------------------------ group A */

describe("A — the control is gone", () => {
  it("1. there is no Request export button", async () => {
    const page = await mountPage();

    expect(buttons().find((b) => /request export/i.test(b.textContent ?? ""))).toBeUndefined();
    await page.unmount();
  });

  it("2. no control anywhere on the page mentions export", async () => {
    const page = await mountPage();

    expect(buttons().find((b) => /export/i.test(b.textContent ?? ""))).toBeUndefined();
    await page.unmount();
  });

  it("3. the descriptive copy that framed it is gone too", async () => {
    // A dead label with no button is still a promise of a feature.
    const page = await mountPage();
    const text = bodyText();

    expect(text).not.toMatch(/Export all workspace data/i);
    expect(text).not.toMatch(/as a single archive/i);
    await page.unmount();
  });

  it("4. no disabled or hidden remnant of it survives", async () => {
    const page = await mountPage();
    const remnants = buttons().filter((b) => /export|archive/i.test(b.textContent ?? ""));

    expect(remnants).toEqual([]);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — the page makes no false email or queue promise anywhere", () => {
  it("5. the exact false promise text is absent", async () => {
    const page = await mountPage();
    const text = bodyText();

    expect(text).not.toContain("Export queued");
    expect(text).not.toContain("You'll get an email when it's ready");
    await page.unmount();
  });

  it("6. nothing on the whole page promises a future email", async () => {
    /*
     * The load-bearing sweep, and the Phase 3 DoD box this task closes. Every
     * tab is mounted at once by the Tabs stub, so this covers the page rather
     * than one panel.
     */
    const page = await mountPage();
    const text = bodyText();

    expect(text).not.toMatch(/you'?ll get an email/i);
    expect(text).not.toMatch(/we'?ll email you/i);
    expect(text).not.toMatch(/email when it'?s ready/i);
    expect(text).not.toMatch(/check your (email|inbox)/i);
    await page.unmount();
  });

  it("7. nothing on the page claims work was queued", async () => {
    const page = await mountPage();
    expect(bodyText()).not.toMatch(/\bqueued\b/i);
    await page.unmount();
  });

  it("8. no toast fires on mount", async () => {
    const page = await mountPage();

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("9. clicking every safe control produces no export or email claim", async () => {
    /*
     * Behavioural, not a snapshot. If the handler were restored and wired to
     * any button on this page, this fires it and catches the claim.
     */
    const page = await mountPage();

    for (const button of buttons()) {
      const label = button.textContent ?? "";
      if (DENY.some((deny) => label.includes(deny))) continue;
      await click(button);
    }

    const said = everythingSaid();
    expect(said).not.toMatch(/export/i);
    expect(said).not.toMatch(/queued/i);
    expect(said).not.toMatch(/you'?ll get an email/i);
    await page.unmount();
  });

  it("10. and no such claim reaches the rendered page either", async () => {
    const page = await mountPage();

    for (const button of buttons()) {
      const label = button.textContent ?? "";
      if (DENY.some((deny) => label.includes(deny))) continue;
      await click(button);
    }

    expect(bodyText()).not.toMatch(/Export queued|get an email/i);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

/*
 * ── GROUP C REWRITTEN 2026-09-06, WAVE 1 TRACK A ───────────────────────────
 *
 * This group was a **coherence** check on the neighbourhood of the removed
 * "Request export" control: it pinned the Danger zone card and its "Reset demo
 * data" row as the survivors that proved the page still hung together.
 *
 * Wave 1's honesty sweep removed that neighbourhood too, because the survivor
 * was itself a fake. "Reset demo data" was described as *"Restores the sample
 * customers, loans, and ledger entries"* and its whole handler was
 * `window.location.reload()` — it restored nothing, on a page with no sample
 * data to restore. That is the same D-004 shape the original task was written
 * to remove, one card lower.
 *
 * The coherence question is unchanged and still worth asking, so the group is
 * **retargeted rather than deleted**, and the assertions are strictly stronger:
 * the fake must be gone, the page must still render, and nothing may have
 * replaced it. Groups A, B and D — the load-bearing ones — are untouched.
 */
describe("C — the page is coherent after the honesty sweep", () => {
  it("11. the fake 'Reset demo data' control is gone", async () => {
    const page = await mountPage();
    const text = bodyText();

    // Its handler was a bare `window.location.reload()` under a description
    // promising restored sample records.
    expect(text).not.toMatch(/Reset demo data/i);
    expect(text).not.toMatch(/Restores the sample customers/i);
    expect(buttons().some((b) => /^Reset data$/i.test((b.textContent ?? "").trim()))).toBe(false);
    await page.unmount();
  });

  it("12. no control anywhere on the page offers to reset or restore data", async () => {
    const page = await mountPage();

    for (const b of buttons()) {
      expect((b.textContent ?? "").trim()).not.toMatch(/^(reset|restore)\b/i);
    }
    await page.unmount();
  });

  it("13. the 2FA switch is gone, and nothing claims two-factor is available", async () => {
    // OPEN-8 / D-083. The switch reported "2FA enabled" for a feature present
    // in no layer — a false security assurance, which 12.7 rates as worse than
    // a missing feature.
    const page = await mountPage();
    const text = bodyText();

    expect(text).not.toMatch(/2FA enabled/i);
    expect(text).not.toMatch(/Authenticator app/i);
    // The page may EXPLAIN that 2FA is absent; it may not offer to turn it on.
    expect(document.querySelectorAll('[role="switch"]').length).toBe(0);
    await page.unmount();
  });

  it("14. the rest of the settings page still renders", async () => {
    const page = await mountPage();
    const text = bodyText();

    expect(text).toContain("Settings");
    expect(text).toContain("Security");
    expect(text).toContain("Profile");
    await page.unmount();
  });

  it("15. the one genuinely real control — change password — survived", async () => {
    const page = await mountPage();

    const update = buttons().find((b) => /update password/i.test(b.textContent ?? ""));
    expect(update).toBeDefined();
    expect(update!.disabled).toBe(false);
    await page.unmount();
  });

  it("16. the fabricated active-sessions table is gone", async () => {
    const page = await mountPage();
    const text = bodyText();

    // Three hardcoded 2024 literals, each with a "Sign out" that revoked
    // nothing. Roadmap 12.8 owns the real thing.
    expect(text).not.toMatch(/Chrome · Windows/);
    expect(text).not.toMatch(/Safari · iPhone/);
    expect(text).not.toMatch(/This device/);
    await page.unmount();
  });

  it("17. the company record no longer shows editable-looking fields that discard input", async () => {
    const page = await mountPage();

    // Every one of these was an uncontrolled `defaultValue` under the words
    // "Printed on invoices and settlement statements".
    for (const id of ["co-name", "co-gst", "co-pan", "co-address", "inv-prefix", "inv-next"]) {
      expect(document.getElementById(id), `#${id} should be gone`).toBeNull();
    }
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — nothing was silently replaced with another fake", () => {
  it("16. no download was wired in as a substitute", async () => {
    /*
     * Replacing one fake with another would satisfy a naive text assertion.
     * A real export would have to create an object URL; nothing here does.
     */
    const createObjectURL = vi.fn(() => "blob:stub");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });

    const page = await mountPage();
    for (const button of buttons()) {
      const label = button.textContent ?? "";
      if (DENY.some((deny) => label.includes(deny))) continue;
      await click(button);
    }

    expect(createObjectURL).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("17. the page issues no export request to the API", async () => {
    const page = await mountPage();
    for (const button of buttons()) {
      const label = button.textContent ?? "";
      if (DENY.some((deny) => label.includes(deny))) continue;
      await click(button);
    }

    const paths = apiRequestMock.mock.calls.map((call) => String(call[0] ?? ""));
    expect(paths.filter((p) => /export/i.test(p))).toEqual([]);
    await page.unmount();
  });
});
