/**
 * TASK 2.7 — employee team membership, driven through the real page.
 *
 * `PUT /api/teams/:id/members` replaces a team's ENTIRE roster. The employee
 * screen knows about one employee, so almost every bug available here is the
 * same bug: sending a roster that is missing somebody. That failure is silent —
 * `{ userIds: [employeeId] }` returns **200** and evicts everyone else — so most
 * of these tests assert the exact body of the request rather than its effect.
 *
 * Two behaviours carry the weight:
 *   - group C, that both rosters are complete and that a move is remove-then-add;
 *   - group D, that the rosters are re-read from the server at save time rather
 *     than taken from reference data, which is loaded at sign-in and would evict
 *     anyone added since.
 *
 * Follows D-012 and the Task 2.4/2.6 test files: `react-dom/client` + React 19's
 * `act`, no component-testing library, `vi.hoisted` for anything the mock
 * factories close over, and the real `ApiError`/`errorMessage` so the error
 * assertions exercise the genuine surfacing path.
 *
 * `@/components/ui/select` is stubbed as a native `<select>`. Radix's select is
 * not driveable in jsdom without pointer-capture polyfills, and the logic under
 * test is the page's, not Radix's — the stub still routes through the real
 * `onValueChange`, so the state wiring is exercised.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => {
  const EMP = "8d1f0f5a-4c2e-4b7a-9f61-0f2c9a3b7d10";
  const COLLEAGUE = "1a2b3c4d-1111-4111-8111-111111111111";
  const BETA_ONE = "2b3c4d5e-2222-4222-8222-222222222222";
  const BETA_TWO = "3c4d5e6f-3333-4333-8333-333333333333";
  const OUTSIDER = "4d5e6f70-4444-4444-8444-444444444444";

  const ALPHA = "aaaa1111-1111-4111-8111-aaaaaaaaaaaa";
  const BETA = "bbbb2222-2222-4222-8222-bbbbbbbbbbbb";
  const GAMMA = "cccc3333-3333-4333-8333-cccccccccccc";

  const EMPLOYEE = {
    id: EMP,
    employeeCode: "EMP-1042",
    name: "Anitha Rao",
    email: "anitha.rao@risenext.com",
    phone: "9848011111",
    branch: "Hyderabad",
    status: "Active" as "Active" | "Inactive",
    joinedOn: "2024-04-01T00:00:00.000Z",
    target: 8_000_000,
    achieved: 3_250_000,
    avatarColor: "#1d4ed8",
    lastLoginAt: "2026-08-30T09:00:00.000Z",
    roleId: "1c4b2f90-77a1-4f0e-a0d2-6b9a1e3c5f22",
    roleKey: "executive",
    roleName: "Executive",
    roleLevel: 40,
    assignedBanks: [] as string[],
    // Task 3.7 added these to Employee. The fixtures describe a fully set-up
    // employee, so both are populated; the invitation-state cases live in
    // employees-invite-state.test.tsx.
    invitedAt: '2026-08-01T09:00:00.000Z',
    inviteAcceptedAt: '2026-08-01T10:00:00.000Z',
  };

  /** Alpha holds the employee and one colleague; Beta holds two strangers. */
  const teamFixtures = () => [
    {
      id: ALPHA,
      name: "Alpha Team",
      description: null,
      leaderId: null,
      status: "Active" as const,
      members: [
        { teamId: ALPHA, userId: EMP, name: "Anitha Rao" },
        { teamId: ALPHA, userId: COLLEAGUE, name: "Ravi Kumar" },
      ],
    },
    {
      id: BETA,
      name: "Beta Team",
      description: null,
      leaderId: null,
      status: "Active" as const,
      members: [
        { teamId: BETA, userId: BETA_ONE, name: "Sunil Nair" },
        { teamId: BETA, userId: BETA_TWO, name: "Meera Iyer" },
      ],
    },
    {
      id: GAMMA,
      name: "Gamma Team",
      description: null,
      leaderId: null,
      status: "Active" as const,
      members: [],
    },
  ];

  return {
    EMP,
    COLLEAGUE,
    BETA_ONE,
    BETA_TWO,
    OUTSIDER,
    ALPHA,
    BETA,
    GAMMA,
    EMPLOYEE,
    teamFixtures,
    apiRequestMock: vi.fn(),
    replaceMock: vi.fn(),
    listMock: vi.fn(),
    refreshMock: vi.fn(),
    refreshReferenceMock: vi.fn(),
    toastSuccess: vi.fn(),
    state: {
      permissions: [] as string[],
      employees: [] as (typeof EMPLOYEE)[],
      teams: teamFixtures() as ReturnType<typeof teamFixtures>,
    },
  };
});

const {
  EMP,
  COLLEAGUE,
  BETA_ONE,
  BETA_TWO,
  OUTSIDER,
  ALPHA,
  BETA,
  GAMMA,
  EMPLOYEE,
  apiRequestMock,
  replaceMock,
  listMock,
  refreshMock,
  refreshReferenceMock,
  toastSuccess,
} = h;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: h.apiRequestMock,
    api: { ...actual.api, replace: h.replaceMock, list: h.listMock },
  };
});

vi.mock("@/components/charts/employee-target-chart", () => ({
  EmployeeTargetChart: () => null,
}));

/**
 * A native <select> standing in for the Radix primitive.
 *
 * `Select` itself becomes the <select> so that the `<option>`s — which the page
 * nests inside `SelectContent`, a *sibling* of `SelectTrigger` — end up inside
 * it. The trigger's `id` is lifted onto the <select> so tests can address the
 * right one; the trigger itself then renders nothing.
 */
vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  const idOfTrigger = (children: React.ReactNode): string | undefined => {
    let found: string | undefined;
    React.Children.forEach(children, (child) => {
      if (React.isValidElement<{ id?: string }>(child) && child.props.id) found = child.props.id;
    });
    return found;
  };

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children?: React.ReactNode;
    }) =>
      React.createElement(
        "select",
        {
          id: idOfTrigger(children),
          value: value ?? "",
          onChange: (e: { target: { value: string } }) => onValueChange?.(e.target.value),
        },
        children,
      ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => children,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) =>
      React.createElement("option", { value }, children),
  };
});

vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string) => {
    const data = path === "/users" ? h.state.employees : [];
    return {
      data,
      total: data.length,
      loading: false,
      error: null,
      refresh: h.refreshMock,
      setData: vi.fn(),
    };
  },
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [],
    teams: h.state.teams,
    employees: [],
    loading: false,
    refresh: h.refreshReferenceMock,
    bankName: () => "Unassigned",
    bankById: () => undefined,
    bankShortName: () => "—",
    employeeById: () => undefined,
    employeeName: () => "Unassigned",
    teamName: () => "—",
  }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "admin-1",
      name: "Super Admin",
      email: "admin@risenext.com",
      role: { id: "sa", key: "super_admin", name: "Super Admin", level: 0 },
      permissions: h.state.permissions,
    },
    can: (permission: string) => h.state.permissions.includes(permission),
    signOut: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: vi.fn(), info: vi.fn() },
}));

import EmployeesPage from "@/app/(app)/employees/page";

const ALL_PERMS = [
  "users.view",
  "users.edit",
  "users.assign",
  "users.create",
  "users.reset_password",
  "teams.assign",
];

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ data: { id: EMP } });
  replaceMock.mockReset();
  listMock.mockReset();
  refreshMock.mockClear();
  refreshReferenceMock.mockClear();
  toastSuccess.mockClear();

  h.state.permissions = [...ALL_PERMS];
  h.state.employees = [{ ...EMPLOYEE }];
  h.state.teams = h.teamFixtures();

  // The server is asked for fresh rosters at save time.
  listMock.mockImplementation(() => Promise.resolve({ data: h.teamFixtures() }));
  // By default the route confirms exactly what it was sent.
  replaceMock.mockImplementation((path: string, body: { userIds: string[] }) =>
    Promise.resolve({
      data: { teamId: path.split("/")[2], userIds: body.userIds },
    }),
  );

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

async function mountPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(<EmployeesPage />);
  });
  return {
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const buttonByText = (text: string): HTMLButtonElement | undefined =>
  Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.trim().includes(text),
  ) as HTMLButtonElement | undefined;

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

async function openDetail() {
  const row = Array.from(document.querySelectorAll("tr")).find((tr) =>
    tr.textContent?.includes(EMPLOYEE.employeeCode),
  );
  if (!row) throw new Error("employee row not rendered");
  await click(row);
}

async function openTeamDialog() {
  await openDetail();
  const button = buttonByText("Team");
  if (!button) throw new Error("Team button not rendered");
  await click(button);
}

const teamSelect = (): HTMLSelectElement => {
  const el = document.querySelector<HTMLSelectElement>("#emp-team-assign");
  if (!el) throw new Error("team select not rendered");
  return el;
};

async function choose(value: string) {
  const select = teamSelect();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function save() {
  const button = buttonByText("Save team");
  if (!button) throw new Error("Save team button not rendered");
  await click(button);
}

/** Every PUT the page issued, as [path, body] pairs, in order. */
const puts = (): [string, { userIds: string[] }][] =>
  replaceMock.mock.calls as [string, { userIds: string[] }][];

const putTo = (teamId: string) => {
  const call = puts().find(([path]) => path === `/teams/${teamId}/members`);
  if (!call) throw new Error(`no PUT to team ${teamId}; got ${JSON.stringify(puts())}`);
  return call[1];
};

const errorText = (): string =>
  Array.from(document.querySelectorAll("p"))
    .map((p) => p.textContent ?? "")
    .join(" ");

/* ------------------------------------------------------------------ group A */

describe("A — the control, its gate, and what it shows", () => {
  it("1. offers the Team control when the user holds teams.assign", async () => {
    const page = await mountPage();
    await openDetail();
    expect(buttonByText("Team")).toBeTruthy();
    await page.unmount();
  });

  it("2. hides it without teams.assign, even holding users.edit and users.assign", async () => {
    // The route requires `teams.assign`. Inferring it from `users.edit`, or from
    // the actor being a Super Admin, would be recreating authorization in React.
    h.state.permissions = ALL_PERMS.filter((p) => p !== "teams.assign");
    const page = await mountPage();
    await openDetail();
    expect(buttonByText("Team")).toBeUndefined();
    expect(buttonByText("Edit")).toBeTruthy();
    expect(buttonByText("Bank access")).toBeTruthy();
    await page.unmount();
  });

  it("3. shows the employee's current team on the detail view", async () => {
    const page = await mountPage();
    await openDetail();
    expect(document.body.textContent).toContain("Alpha Team");
    await page.unmount();
  });

  it("4. shows Unassigned when the employee is on no team", async () => {
    h.state.teams = h
      .teamFixtures()
      .map((t) => ({ ...t, members: t.members.filter((m) => m.userId !== EMP) }));
    const page = await mountPage();
    await openDetail();
    expect(document.body.textContent).toContain("Unassigned");
    await page.unmount();
  });

  it("5. opens pre-selected to the current team", async () => {
    const page = await mountPage();
    await openTeamDialog();
    expect(teamSelect().value).toBe(ALPHA);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — nothing happens when nothing changed", () => {
  it("6. saving without changing the selection issues no request", async () => {
    const page = await mountPage();
    await openTeamDialog();
    await save();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("7. cancelling issues no request", async () => {
    const page = await mountPage();
    await openTeamDialog();
    const cancel = buttonByText("Cancel");
    if (!cancel) throw new Error("Cancel not rendered");
    await click(cancel);
    expect(replaceMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("8. cancelling after choosing a different team issues no request", async () => {
    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    const cancel = buttonByText("Cancel");
    if (!cancel) throw new Error("Cancel not rendered");
    await click(cancel);
    expect(replaceMock).not.toHaveBeenCalled();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — the whole roster, which is the whole task", () => {
  it("9. moving to another team calls PUT on both teams' member routes", async () => {
    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(puts().map(([path]) => path)).toEqual([
      `/teams/${ALPHA}/members`,
      `/teams/${BETA}/members`,
    ]);
    await page.unmount();
  });

  it("10. removes from the old team FIRST, then adds to the new one", async () => {
    // Order matters: if the add went first and the removal failed, the employee
    // would be on two teams and `teamOf` would report only the first.
    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(puts()[0]![0]).toBe(`/teams/${ALPHA}/members`);
    expect(puts()[1]![0]).toBe(`/teams/${BETA}/members`);
    await page.unmount();
  });

  it("11. the target roster is every existing member PLUS the employee", async () => {
    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(putTo(BETA).userIds.sort()).toEqual([BETA_ONE, BETA_TWO, EMP].sort());
    await page.unmount();
  });

  it("12. NEVER replaces a roster with just the employee — the silent-eviction bug", async () => {
    // `{ userIds: [employeeId] }` returns 200 and evicts everyone else. This is
    // the single most damaging mistake available on this screen.
    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    for (const [, body] of puts()) {
      expect(body.userIds).not.toEqual([EMP]);
    }
    expect(putTo(BETA).userIds).toContain(BETA_ONE);
    expect(putTo(BETA).userIds).toContain(BETA_TWO);
    await page.unmount();
  });

  it("13. the old roster is every existing member MINUS the employee", async () => {
    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(putTo(ALPHA).userIds).toEqual([COLLEAGUE]);
    await page.unmount();
  });

  it("14. a move preserves unrelated members on BOTH sides", async () => {
    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    // Ravi keeps his place on Alpha; Sunil and Meera keep theirs on Beta.
    expect(putTo(ALPHA).userIds).toContain(COLLEAGUE);
    expect(putTo(BETA).userIds).toContain(BETA_ONE);
    expect(putTo(BETA).userIds).toContain(BETA_TWO);
    await page.unmount();
  });

  it("15. assigning an unassigned employee issues only the add", async () => {
    h.state.teams = h
      .teamFixtures()
      .map((t) => ({ ...t, members: t.members.filter((m) => m.userId !== EMP) }));
    listMock.mockImplementation(() =>
      Promise.resolve({
        data: h.teamFixtures().map((t) => ({
          ...t,
          members: t.members.filter((m) => m.userId !== EMP),
        })),
      }),
    );

    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(puts()).toHaveLength(1);
    expect(puts()[0]![0]).toBe(`/teams/${BETA}/members`);
    expect(putTo(BETA).userIds.sort()).toEqual([BETA_ONE, BETA_TWO, EMP].sort());
    await page.unmount();
  });

  it("16. joining an empty team sends exactly one member", async () => {
    const page = await mountPage();
    await openTeamDialog();
    await choose(GAMMA);
    await save();

    // Legitimately `[EMP]` here, because Gamma really is empty — which is why
    // test 12 asserts against a populated target instead.
    expect(putTo(GAMMA).userIds).toEqual([EMP]);
    await page.unmount();
  });

  it("17. clearing membership issues only the removal, keeping the rest", async () => {
    const page = await mountPage();
    await openTeamDialog();
    await choose("__none__");
    await save();

    expect(puts()).toHaveLength(1);
    expect(puts()[0]![0]).toBe(`/teams/${ALPHA}/members`);
    expect(putTo(ALPHA).userIds).toEqual([COLLEAGUE]);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — rosters are re-read from the server, not from cached reference data", () => {
  it("18. fetches /teams before writing", async () => {
    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(listMock).toHaveBeenCalledWith("/teams");
    await page.unmount();
  });

  it("19. preserves a member added by someone else since the page loaded", async () => {
    // Reference data is loaded at sign-in. Building the roster from it would
    // evict anyone another administrator added in the meantime.
    listMock.mockImplementation(() =>
      Promise.resolve({
        data: h.teamFixtures().map((t) =>
          t.id === BETA
            ? { ...t, members: [...t.members, { teamId: BETA, userId: OUTSIDER, name: "Late Arrival" }] }
            : t,
        ),
      }),
    );

    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(putTo(BETA).userIds).toContain(OUTSIDER);
    expect(putTo(BETA).userIds.sort()).toEqual([BETA_ONE, BETA_TWO, OUTSIDER, EMP].sort());
    await page.unmount();
  });

  it("20. uses the server's view of where the employee currently is", async () => {
    // Cached data says Alpha; the server says Beta. The removal must target Beta.
    listMock.mockImplementation(() =>
      Promise.resolve({
        data: h.teamFixtures().map((t) => {
          if (t.id === ALPHA) return { ...t, members: t.members.filter((m) => m.userId !== EMP) };
          if (t.id === BETA) {
            return { ...t, members: [...t.members, { teamId: BETA, userId: EMP, name: "Anitha Rao" }] };
          }
          return t;
        }),
      }),
    );

    const page = await mountPage();
    await openTeamDialog();
    await choose(GAMMA);
    await save();

    expect(puts()[0]![0]).toBe(`/teams/${BETA}/members`);
    expect(putTo(BETA).userIds.sort()).toEqual([BETA_ONE, BETA_TWO].sort());
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — the server stays the authority", () => {
  it("21. adopts the server's confirmation and reconciles local state", async () => {
    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(toastSuccess).toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
    expect(refreshReferenceMock).toHaveBeenCalled();
    await page.unmount();
  });

  it("22. treats a response that omits the employee as a failure, not a success", async () => {
    // The response is the route's record of what it stored. If the employee is
    // not in it, the move did not happen — whatever the status code said.
    replaceMock.mockImplementation((path: string, body: { userIds: string[] }) =>
      Promise.resolve({
        data: {
          teamId: path.split("/")[2],
          userIds: body.userIds.filter((id) => id !== EMP),
        },
      }),
    );

    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(errorText()).toContain("was not added to Beta Team");
    await page.unmount();
  });

  it("23. surfaces a 403 verbatim and shows no success", async () => {
    replaceMock.mockRejectedValue(
      new ApiError(403, "forbidden", "You cannot manage a user at or above your own role level"),
    );

    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(errorText()).toContain("You cannot manage a user at or above your own role level");
    await page.unmount();
  });

  it("24. surfaces a 400 verbatim", async () => {
    replaceMock.mockRejectedValue(
      new ApiError(400, "bad_request", "One or more users do not exist"),
    );

    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(errorText()).toContain("One or more users do not exist");
    await page.unmount();
  });

  it("25. leaves the dialog open on failure so the message is readable", async () => {
    replaceMock.mockRejectedValue(new ApiError(403, "forbidden", "Refused"));

    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(buttonByText("Save team")).toBeTruthy();
    await page.unmount();
  });

  it("26. reports a half-completed move honestly", async () => {
    // Removal succeeds, the add is refused. The employee is on no team, and
    // saying otherwise would be reporting a success that did not happen (D-004).
    replaceMock.mockImplementation((path: string, body: { userIds: string[] }) => {
      if (path === `/teams/${BETA}/members`) {
        return Promise.reject(new ApiError(403, "forbidden", "Refused by the server"));
      }
      return Promise.resolve({ data: { teamId: ALPHA, userIds: body.userIds } });
    });

    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(toastSuccess).not.toHaveBeenCalled();
    const text = errorText();
    expect(text).toContain("Refused by the server");
    expect(text).toContain("removed from Alpha Team");
    expect(text).toContain("currently on no team");
    // The screen must show the real state after a partial write.
    expect(refreshReferenceMock).toHaveBeenCalled();
    await page.unmount();
  });

  it("27. does not write when the server says the employee already moved", async () => {
    listMock.mockImplementation(() =>
      Promise.resolve({
        data: h.teamFixtures().map((t) => {
          if (t.id === ALPHA) return { ...t, members: t.members.filter((m) => m.userId !== EMP) };
          if (t.id === BETA) {
            return { ...t, members: [...t.members, { teamId: BETA, userId: EMP, name: "Anitha Rao" }] };
          }
          return t;
        }),
      }),
    );

    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    expect(replaceMock).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(errorText()).toContain("already");
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group F */

describe("F — no collateral requests", () => {
  it("28. issues no PATCH on the employee", async () => {
    // `users` has no team column and PATCH refuses `teamId` with a 422 (D-025).
    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    const patched = apiRequestMock.mock.calls.filter(
      ([, options]) => (options as { method?: string } | undefined)?.method === "PATCH",
    );
    expect(patched).toHaveLength(0);
    await page.unmount();
  });

  it("29. touches no bank-access route", async () => {
    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    for (const [path] of puts()) {
      expect(path).not.toContain("/banks");
    }
    await page.unmount();
  });

  it("30. sends no teamId in any request body", async () => {
    const page = await mountPage();
    await openTeamDialog();
    await choose(BETA);
    await save();

    for (const [, body] of puts()) {
      expect(Object.keys(body)).toEqual(["userIds"]);
    }
    await page.unmount();
  });
});
