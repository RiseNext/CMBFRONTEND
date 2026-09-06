/**
 * THE TEAMS SCREEN — Tasks 12.2 and 12.3.
 *
 * There was no teams screen at all. `POST /api/teams` had zero callers, so a
 * fresh deployment had zero teams and no in-product way to make one — and the
 * employee screen's team assignment could only move people between teams a REST
 * client had created. `PATCH /api/teams/:id` did not exist until 12.3.
 *
 * ── GROUP C IS THE ONE THAT MATTERS ─────────────────────────────────────────
 *
 * `PUT /api/teams/:id/members` REPLACES the roster. Two consequences the tests
 * pin down, because getting either wrong is a silent data loss rather than a
 * visible error:
 *
 *   1. the request must carry the COMPLETE roster, not a delta — case 13;
 *   2. it must be built from the SERVER's membership, and the list must be
 *      re-read afterwards rather than patched in memory — cases 15 and 16.
 *      Merging a local draft would evict whoever joined since the page loaded,
 *      and the server would authorize that eviction perfectly correctly.
 *
 * Follows D-012.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as { fn: string; path: string; body?: unknown }[],
  reject: null as unknown,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  refresh: vi.fn(),
  refreshReference: vi.fn(),
  teams: [] as unknown[],
  employees: [] as unknown[],
  loading: false,
  error: null as string | null,
  permissionsOfUser: [] as string[],
}));

function record(fn: string) {
  return vi.fn(async (path: string, body?: unknown) => {
    h.calls.push({ fn, path, body });
    if (h.reject) throw h.reject;
    return { data: {} };
  });
}

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      create: record("create"),
      update: record("update"),
      replace: record("replace"),
      remove: record("remove"),
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      name: "Signed In",
      email: "me@risenext.test",
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

vi.mock("@/hooks/use-api", () => ({
  useResource: () => ({
    data: h.teams,
    total: 0,
    loading: h.loading,
    error: h.error,
    refresh: h.refresh,
    setData: vi.fn(),
  }),
  useRecord: () => ({ data: null, loading: false, error: null, refresh: vi.fn() }),
  useStats: () => ({ data: null, loading: false, forbidden: false, error: null, num: () => 0 }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [],
    employees: h.employees,
    teams: [],
    loading: false,
    refresh: h.refreshReference,
    bankById: () => undefined,
    bankName: () => "Bank",
    bankShortName: () => "B",
    employeeById: () => undefined,
    employeeName: () => "—",
    teamName: () => "—",
  }),
}));

import TeamsPage from "./page";

const EMPLOYEES = [
  { id: "e-anita", name: "Anita Rao", roleName: "Team Leader" },
  { id: "e-bharat", name: "Bharat Singh", roleName: "Executive" },
  { id: "e-chetan", name: "Chetan Iyer", roleName: "Executive" },
];

const TEAMS = [
  {
    id: "t-south",
    name: "South zone",
    description: "Bengaluru and Chennai",
    leaderId: "e-anita",
    status: "Active",
    members: [{ teamId: "t-south", userId: "e-bharat", name: "Bharat Singh" }],
  },
];

const ALL = ["teams.view", "teams.create", "teams.edit", "teams.delete", "teams.assign"];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.calls = [];
  h.reject = null;
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
  h.refresh.mockReset();
  h.refreshReference.mockReset();
  h.teams = TEAMS;
  h.employees = EMPLOYEES;
  h.loading = false;
  h.error = null;
  h.permissionsOfUser = ALL;

  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => {
    root.render(<TeamsPage />);
  });
  await act(async () => {});
}

const scope = () => document.body;
const text = () => scope().textContent ?? "";
const buttons = () => Array.from(scope().querySelectorAll("button"));
const byText = (pattern: RegExp) =>
  buttons().find((b) => pattern.test((b.textContent ?? "").trim()));

async function click(el: Element | undefined | null) {
  expect(el, "control should exist").toBeTruthy();
  await act(async () => (el as HTMLElement).click());
  await act(async () => {});
}

function setInput(id: string, value: string) {
  const input = scope().querySelector<HTMLInputElement>(`#${id}`);
  expect(input, `#${id} should exist`).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(input, value);
  input!.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The card's action buttons, in render order: Edit, Members, delete. */
const cardButtons = () =>
  Array.from(scope().querySelector('[data-team="t-south"]')!.querySelectorAll("button"));

/* ══ A — honest states ════════════════════════════════════════════════════ */

describe("A · loading, error, empty and permission are four different things", () => {
  it("1. loading is not rendered as an empty list", async () => {
    h.loading = true;
    h.teams = [];
    await render();
    expect(text()).not.toMatch(/No teams yet/i);
  });

  it("2. a failed load says so, and offers a retry", async () => {
    h.teams = [];
    h.error = "Network unreachable";
    await render();
    expect(text()).toMatch(/Could not load teams/i);
    expect(text()).toContain("Network unreachable");
    expect(text()).not.toMatch(/No teams yet/i);
    await click(byText(/^Try again$/));
    expect(h.refresh).toHaveBeenCalled();
  });

  it("3. THE FINDING: an empty database offers a way OUT of the empty state", async () => {
    // A fresh deployment has zero teams and, before 12.2, no way to make one.
    h.teams = [];
    await render();
    expect(text()).toMatch(/No teams yet/i);
    expect(byText(/New team/)).toBeTruthy();
  });

  it("4. a role without teams.view sees a refusal, not an empty page", async () => {
    h.permissionsOfUser = ["customers.view"];
    await render();
    expect(text()).toMatch(/cannot view teams/i);
  });

  it("5. a team renders its leader and its members from the server payload", async () => {
    await render();
    expect(text()).toContain("South zone");
    expect(text()).toContain("Led by Anita Rao");
    expect(text()).toContain("Bharat Singh");
    expect(text()).toContain("Members (1)");
  });

  it("6. a team with no members says so rather than showing an empty strip", async () => {
    h.teams = [{ ...TEAMS[0], members: [], leaderId: null }];
    await render();
    expect(text()).toContain("No members yet");
    expect(text()).toContain("Led by nobody yet");
  });
});

/* ══ B — create, edit, delete ═════════════════════════════════════════════ */

describe("B · CRUD calls the real routes", () => {
  it("7. THE FINDING: creating a team POSTs to /teams", async () => {
    await render();
    await click(byText(/New team/));
    setInput("create-team-name", "West zone");
    await click(byText(/^Create team$/));

    const call = h.calls.find((c) => c.fn === "create");
    expect(call, JSON.stringify(h.calls)).toBeTruthy();
    expect(call!.path).toBe("/teams");
    expect(call!.body).toMatchObject({ name: "West zone", leaderId: null, status: "Active" });
    expect(h.toastSuccess).toHaveBeenCalled();
    expect(h.refresh).toHaveBeenCalled();
  });

  it("8. THE FINDING (12.3): editing a team PATCHes /teams/:id", async () => {
    // Before 12.3 this route did not exist and the button could not.
    await render();
    await click(cardButtons().find((b) => b.textContent === "Edit"));
    setInput("edit-team-name", "Southern zone");
    await click(byText(/^Save changes$/));

    const call = h.calls.find((c) => c.fn === "update");
    expect(call!.path).toBe("/teams/t-south");
    expect(call!.body).toMatchObject({ name: "Southern zone", leaderId: "e-anita" });
  });

  it("9. the edit form opens pre-filled from the server row", async () => {
    await render();
    await click(cardButtons().find((b) => b.textContent === "Edit"));
    expect(scope().querySelector<HTMLInputElement>("#edit-team-name")!.value).toBe("South zone");
  });

  it("10. a refused save raises NO success toast and does not re-read the list", async () => {
    const { ApiError } = await import("@/lib/api");
    h.reject = new ApiError(403, "forbidden", "You cannot manage a user at or above your own level");
    await render();

    await click(cardButtons().find((b) => b.textContent === "Edit"));
    await click(byText(/^Save changes$/));

    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
    expect(text()).toContain("You cannot manage a user at or above your own level");
  });

  it("11. deleting asks first and issues nothing until confirmed", async () => {
    await render();
    await click(cardButtons().at(-1));
    expect(h.calls).toHaveLength(0);
    expect(text()).toMatch(/Delete South zone\?/);

    await click(byText(/^Delete team$/));
    expect(h.calls.find((c) => c.fn === "remove")!.path).toBe("/teams/t-south");
  });

  it("12. a refused delete shows the server's words and claims nothing", async () => {
    const { ApiError } = await import("@/lib/api");
    h.reject = new ApiError(404, "not_found", "Team not found");
    await render();

    await click(cardButtons().at(-1));
    await click(byText(/^Delete team$/));

    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledWith(
      "Could not delete this team",
      expect.objectContaining({ description: "Team not found" }),
    );
  });
});

/* ══ C — whole-roster replacement ═════════════════════════════════════════ */

describe("C · membership is replaced wholesale, from the server's roster", () => {
  it("13. THE POINT: the request carries the COMPLETE roster, not a delta", async () => {
    await render();
    await click(cardButtons().find((b) => /^Members/.test(b.textContent ?? "")));

    // Bharat is already on the team. Add Chetan.
    await click(scope().querySelector("#member-e-chetan"));
    await click(byText(/^Save roster$/));

    const call = h.calls.find((c) => c.fn === "replace");
    expect(call!.path).toBe("/teams/t-south/members");
    expect((call!.body as { userIds: string[] }).userIds.sort()).toEqual(["e-bharat", "e-chetan"]);
  });

  it("14. unticking somebody REMOVES them — the roster is not merged", async () => {
    await render();
    await click(cardButtons().find((b) => /^Members/.test(b.textContent ?? "")));

    await click(scope().querySelector("#member-e-bharat"));
    await click(byText(/^Save roster$/));

    expect((h.calls.find((c) => c.fn === "replace")!.body as { userIds: string[] }).userIds).toEqual(
      [],
    );
  });

  it("15. the dialog opens from the SERVER's membership, every time", async () => {
    await render();
    const open = () => click(cardButtons().find((b) => /^Members/.test(b.textContent ?? "")));

    await open();
    await click(scope().querySelector("#member-e-chetan"));
    await click(byText(/^Cancel$/));

    // Reopening must NOT show the abandoned draft. If it did, a later save would
    // submit a roster nobody chose.
    await open();
    const chetan = scope().querySelector("#member-e-chetan");
    expect(chetan?.getAttribute("data-state") ?? chetan?.getAttribute("aria-checked")).toMatch(
      /unchecked|false/,
    );
  });

  it("16. on success the list is RE-READ rather than patched in memory", async () => {
    await render();
    await click(cardButtons().find((b) => /^Members/.test(b.textContent ?? "")));
    await click(scope().querySelector("#member-e-chetan"));
    await click(byText(/^Save roster$/));

    // The response is the request echoed; the list route is what computes each
    // team's roster, and somebody else may have changed it meanwhile.
    expect(h.refresh).toHaveBeenCalled();
  });

  it("17. a refused roster change claims nothing and does not re-read", async () => {
    const { ApiError } = await import("@/lib/api");
    h.reject = new ApiError(403, "forbidden", "You cannot manage a user at or above your own level");
    await render();

    await click(cardButtons().find((b) => /^Members/.test(b.textContent ?? "")));
    await click(scope().querySelector("#member-e-chetan"));
    await click(byText(/^Save roster$/));

    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("18. with no visible colleagues it says so instead of showing an empty picker", async () => {
    // A scoped operator is only sent the people they may see. That is the API's
    // doing, not this screen's — but the screen must not present it as a bug.
    h.employees = [];
    await render();
    await click(cardButtons().find((b) => /^Members/.test(b.textContent ?? "")));
    expect(text()).toMatch(/nobody to roster/i);
  });
});

/* ══ D — permission-aware controls ════════════════════════════════════════ */

describe("D · the screen does not offer what the caller may not do", () => {
  it("19. without teams.create there is no New team button", async () => {
    h.permissionsOfUser = ["teams.view"];
    await render();
    expect(byText(/New team/)).toBeUndefined();
  });

  it("20. without teams.edit the Edit control is disabled", async () => {
    h.permissionsOfUser = ["teams.view", "teams.assign"];
    await render();
    expect(cardButtons().find((b) => b.textContent === "Edit")!.disabled).toBe(true);
  });

  it("21. without teams.assign the Members control is disabled", async () => {
    h.permissionsOfUser = ["teams.view", "teams.edit"];
    await render();
    expect(cardButtons().find((b) => /^Members/.test(b.textContent ?? ""))!.disabled).toBe(true);
  });

  it("22. without teams.delete the delete control is disabled", async () => {
    h.permissionsOfUser = ["teams.view", "teams.edit", "teams.assign"];
    await render();
    expect(cardButtons().at(-1)!.disabled).toBe(true);
  });

  it("23. a Manager — view and assign only — can roster but cannot rename", async () => {
    // The exact seeded grant. Manager holds teams.view and teams.assign; the
    // backend refuses teams.edit, so offering Edit would guarantee a 403.
    h.permissionsOfUser = ["teams.view", "teams.assign"];
    await render();
    expect(cardButtons().find((b) => /^Members/.test(b.textContent ?? ""))!.disabled).toBe(false);
    expect(cardButtons().find((b) => b.textContent === "Edit")!.disabled).toBe(true);
  });
});
