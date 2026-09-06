/**
 * THE ROLES SCREEN — Task 12.1.
 *
 * Every route this page uses shipped with the first migration and had **zero
 * frontend callers**. The permission model — what all five roles may do — could
 * only be changed with a REST client.
 *
 * ── WHAT THESE CASES REFUSE TO ACCEPT ───────────────────────────────────────
 *
 * Group B is the point of the file. A control here must call the route it
 * claims to, and a refusal must NOT produce a success toast. That is the exact
 * defect class BUG-002 recorded thirteen times and the Wave 1 audit found
 * seventeen more of — so every mutation case asserts both halves: the request
 * that was made, and that a rejected request leaves no success claim behind.
 *
 * Group C pins the hierarchy mirroring. The backend is the authority and is
 * tested separately; what is asserted here is only that the screen does not
 * offer a control that is certain to be refused, and does not hide the fact
 * that a permission exists.
 *
 * Follows D-012 — `react-dom/client` + React 19 `act`, no component-testing
 * library, `vi.hoisted` for anything the mock factories close over.
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
  roles: [] as unknown[],
  permissions: [] as unknown[],
  loading: false,
  error: null as string | null,
  permissionsOfUser: [] as string[],
  userLevel: 0,
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
      role: { id: "r1", key: "tester", name: "Tester", level: h.userLevel },
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
  useResource: (path: string) => ({
    data: path === "/roles" ? h.roles : h.permissions,
    total: 0,
    loading: h.loading,
    error: path === "/roles" ? h.error : null,
    refresh: h.refresh,
    setData: vi.fn(),
  }),
  useRecord: () => ({ data: null, loading: false, error: null, refresh: vi.fn() }),
  useStats: () => ({ data: null, loading: false, forbidden: false, error: null, num: () => 0 }),
}));

import RolesPage from "./page";

let container: HTMLDivElement;
let root: Root;

/** The full catalogue is large; three keys is enough to prove the grouping. */
const PERMISSIONS = [
  { id: "p1", key: "customers.view", resource: "customers", action: "view", description: null },
  { id: "p2", key: "customers.delete", resource: "customers", action: "delete", description: null },
  { id: "p3", key: "roles.edit", resource: "roles", action: "edit", description: null },
];

const ROLES = [
  {
    id: "role-super",
    key: "super_admin",
    name: "Super Admin",
    description: "Protected",
    level: 0,
    isSystem: true,
    isActive: true,
    permissions: ["customers.view", "customers.delete", "roles.edit"],
  },
  {
    id: "role-manager",
    key: "manager",
    name: "Manager",
    description: "Runs teams",
    level: 20,
    isSystem: false,
    isActive: true,
    permissions: ["customers.view"],
  },
];

const ALL = [
  "roles.view",
  "roles.create",
  "roles.edit",
  "roles.delete",
  "roles.assign_permissions",
  "system.manage_any_user",
  "customers.view",
  "customers.delete",
];

beforeEach(() => {
  h.calls = [];
  h.reject = null;
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
  h.refresh.mockReset();
  h.roles = ROLES;
  h.permissions = PERMISSIONS;
  h.loading = false;
  h.error = null;
  h.permissionsOfUser = ALL;
  h.userLevel = 0;

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
    root.render(<RolesPage />);
  });
  await act(async () => {});
}

/** Radix renders dialogs into a portal, so search the whole document. */
const scope = () => document.body;
const text = () => scope().textContent ?? "";
const buttons = () => Array.from(scope().querySelectorAll("button"));
const byText = (pattern: RegExp) =>
  buttons().find((b) => pattern.test((b.textContent ?? "").trim()));

async function click(el: Element | undefined) {
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

/* ══ A — honest states ════════════════════════════════════════════════════ */

describe("A · loading, error, empty and permission are four different things", () => {
  it("1. a loading list is not presented as an empty one", async () => {
    h.loading = true;
    h.roles = [];
    await render();
    expect(text()).not.toMatch(/No roles yet/i);
  });

  it("2. a failed load says so and offers a retry — it is not an empty state", async () => {
    h.roles = [];
    h.error = "Network unreachable";
    await render();
    expect(text()).toMatch(/Could not load roles/i);
    expect(text()).toContain("Network unreachable");
    expect(text()).not.toMatch(/No roles yet/i);

    await click(byText(/^Try again$/));
    expect(h.refresh).toHaveBeenCalled();
  });

  it("3. a genuinely empty list gets the empty state", async () => {
    h.roles = [];
    await render();
    expect(text()).toMatch(/No roles yet/i);
  });

  it("4. a role without roles.view sees a refusal, not an empty page", async () => {
    // D-049: a refusal must be distinguishable from "there is nothing here".
    h.permissionsOfUser = ["customers.view"];
    await render();
    expect(text()).toMatch(/cannot view the permission model/i);
    expect(text()).toContain("roles.view");
  });

  it("5. the roles that loaded are rendered from the server payload", async () => {
    await render();
    expect(text()).toContain("Super Admin");
    expect(text()).toContain("Manager");
    // Straight from each role's own `permissions` array, not a count of anything local.
    expect(text()).toContain("3 permissions");
    expect(text()).toContain("1 permissions");
  });
});

/* ══ B — every control calls its route, and a refusal claims nothing ══════ */

describe("B · real CRUD, with no fabricated success", () => {
  it("6. THE FINDING: creating a role POSTs to /roles with the ticked permissions", async () => {
    await render();
    await click(byText(/New role/));

    setInput("role-key", "branch_auditor");
    setInput("role-name", "Branch Auditor");
    setInput("role-level", "40");

    const box = scope().querySelector<HTMLElement>("#perm-customers\\.view");
    await click(box ?? undefined);

    await click(byText(/^Create role$/));

    const call = h.calls.find((c) => c.fn === "create");
    expect(call, `calls: ${JSON.stringify(h.calls)}`).toBeTruthy();
    expect(call!.path).toBe("/roles");
    expect(call!.body).toMatchObject({
      key: "branch_auditor",
      name: "Branch Auditor",
      level: 40,
      permissions: ["customers.view"],
    });
    expect(h.toastSuccess).toHaveBeenCalled();
    expect(h.refresh).toHaveBeenCalled();
  });

  it("7. a refused create raises NO success toast and keeps the dialog open", async () => {
    const { ApiError } = await import("@/lib/api");
    h.reject = new ApiError(403, "forbidden", "You cannot grant permissions you do not hold");
    await render();

    await click(byText(/New role/));
    setInput("role-key", "sneaky");
    setInput("role-name", "Sneaky");
    await click(byText(/^Create role$/));

    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalled();
    expect(text()).toContain("You cannot grant permissions you do not hold");
    // Still open, so the operator can correct it rather than losing the form.
    expect(byText(/^Create role$/)).toBeTruthy();
  });

  it("8. a 422 puts the server's message under the field it names", async () => {
    const { ApiError } = await import("@/lib/api");
    h.reject = new ApiError(422, "validation_failed", "The submitted data is not valid", [
      { path: "key", message: "Key must be lowercase snake_case" },
    ]);
    await render();

    await click(byText(/New role/));
    setInput("role-key", "Bad Key");
    await click(byText(/^Create role$/));

    expect(text()).toContain("Key must be lowercase snake_case");
  });

  it("9. editing a role PATCHes it, and does not send the key", async () => {
    // The key is fixed once a role exists; the route omits it from the schema.
    await render();
    const card = scope().querySelector('[data-role="manager"]')!;
    await click(Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Edit"));

    setInput("edit-name", "Regional Manager");
    await click(byText(/^Save changes$/));

    const call = h.calls.find((c) => c.fn === "update");
    expect(call!.path).toBe("/roles/role-manager");
    expect(call!.body).toMatchObject({ name: "Regional Manager" });
    expect(call!.body).not.toHaveProperty("key");
  });

  it("10. the permission matrix PUTs the WHOLE grant, so unticking revokes", async () => {
    await render();
    const card = scope().querySelector('[data-role="manager"]')!;
    await click(
      Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Permissions"),
    );

    // Manager holds customers.view. Untick it and tick customers.delete.
    await click(scope().querySelector("#perm-customers\\.view") ?? undefined);
    await click(scope().querySelector("#perm-customers\\.delete") ?? undefined);
    await click(byText(/^Save permissions$/));

    const call = h.calls.find((c) => c.fn === "replace");
    expect(call!.path).toBe("/roles/role-manager/permissions");
    expect(call!.body).toEqual({ permissions: ["customers.delete"] });
  });

  it("11. the matrix opens pre-filled from the SERVER's grant, not from a cache", async () => {
    await render();
    const card = scope().querySelector('[data-role="manager"]')!;
    await click(
      Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Permissions"),
    );
    const checked = scope().querySelector("#perm-customers\\.view");
    expect(checked?.getAttribute("data-state") ?? checked?.getAttribute("aria-checked")).toMatch(
      /checked|true/,
    );
  });

  it("12. a refused permission save leaves the list untouched and claims nothing", async () => {
    const { ApiError } = await import("@/lib/api");
    h.reject = new ApiError(403, "forbidden", "Refused");
    await render();

    const card = scope().querySelector('[data-role="manager"]')!;
    await click(
      Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Permissions"),
    );
    await click(scope().querySelector("#perm-customers\\.delete") ?? undefined);
    await click(byText(/^Save permissions$/));

    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("13. deleting asks first, and issues nothing until confirmed", async () => {
    await render();
    const card = scope().querySelector('[data-role="manager"]')!;
    const trash = Array.from(card.querySelectorAll("button")).at(-1);
    await click(trash);

    expect(h.calls).toHaveLength(0);
    expect(text()).toMatch(/Delete Manager\?/);

    await click(byText(/^Delete role$/));
    const call = h.calls.find((c) => c.fn === "remove");
    expect(call!.path).toBe("/roles/role-manager");
  });

  it("14. a 409 on delete shows the server's sentence verbatim", async () => {
    // "This role is still assigned to 4 user(s)" is the most useful line on the
    // screen; a generic message would throw the count away.
    const { ApiError } = await import("@/lib/api");
    h.reject = new ApiError(409, "conflict", "This role is still assigned to 4 user(s).");
    await render();

    const card = scope().querySelector('[data-role="manager"]')!;
    await click(Array.from(card.querySelectorAll("button")).at(-1));
    await click(byText(/^Delete role$/));

    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledWith(
      "Could not delete this role",
      expect.objectContaining({ description: "This role is still assigned to 4 user(s)." }),
    );
  });
});

/* ══ C — the hierarchy the server enforces is mirrored, not replaced ══════ */

describe("C · the screen does not offer what the API will refuse", () => {
  it("15. the system role is read-only, and says why", async () => {
    await render();
    const card = scope().querySelector('[data-role="super_admin"]')!;
    for (const button of card.querySelectorAll("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    expect(card.textContent).toMatch(/system role always holds every permission/i);
  });

  it("16. a role at or above your own level cannot be edited", async () => {
    // Level 20 acting on Manager (20): not strictly greater, so the API refuses.
    h.userLevel = 20;
    h.permissionsOfUser = ALL.filter((p) => p !== "system.manage_any_user");
    await render();

    const card = scope().querySelector('[data-role="manager"]')!;
    for (const button of card.querySelectorAll("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    expect(card.textContent).toMatch(/at or above your own level/i);
  });

  it("17. …but below it, it can", async () => {
    h.userLevel = 10;
    h.permissionsOfUser = ALL.filter((p) => p !== "system.manage_any_user");
    await render();

    const card = scope().querySelector('[data-role="manager"]')!;
    const edit = Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Edit");
    expect((edit as HTMLButtonElement).disabled).toBe(false);
  });

  it("18. a permission you do not hold is DISABLED, not hidden", async () => {
    // Hiding it would make the matrix read as the role's complete grant when it
    // is not. Offering it would guarantee a 403.
    h.userLevel = 10;
    h.permissionsOfUser = ["roles.view", "roles.assign_permissions", "customers.view"];
    await render();

    const card = scope().querySelector('[data-role="manager"]')!;
    await click(
      Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Permissions"),
    );

    const held = scope().querySelector("#perm-customers\\.view") as HTMLButtonElement;
    const notHeld = scope().querySelector("#perm-customers\\.delete") as HTMLButtonElement;
    expect(notHeld, "the permission must still be rendered").toBeTruthy();
    expect(notHeld.disabled).toBe(true);
    expect(held.disabled).toBe(false);
  });

  it("19. `system.manage_any_user` lifts the restriction, because the API says it does", async () => {
    h.userLevel = 0;
    h.permissionsOfUser = ["roles.view", "roles.assign_permissions", "system.manage_any_user"];
    await render();

    const card = scope().querySelector('[data-role="manager"]')!;
    await click(
      Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Permissions"),
    );
    const notHeld = scope().querySelector("#perm-customers\\.delete") as HTMLButtonElement;
    expect(notHeld.disabled).toBe(false);
  });

  it("20. a viewer without roles.create is not offered New role", async () => {
    h.permissionsOfUser = ["roles.view"];
    await render();
    expect(byText(/New role/)).toBeUndefined();
  });

  it("21. a viewer without roles.delete cannot reach the delete control", async () => {
    h.permissionsOfUser = ["roles.view", "roles.edit"];
    await render();
    const card = scope().querySelector('[data-role="manager"]')!;
    const trash = Array.from(card.querySelectorAll("button")).at(-1) as HTMLButtonElement;
    expect(trash.disabled).toBe(true);
  });
});
