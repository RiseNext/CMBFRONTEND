/**
 * TASK 3.8 — resend invitation, driven through the real page.
 *
 * Two things carry the weight here, and they are the two the task is most
 * likely to get wrong:
 *
 *   - **Group C: the toast reports what the SERVER said.** `POST
 *     /users/:id/resend-invitation` answers 200 whether the mail provider
 *     accepted the message, merely logged it to the console, or failed
 *     outright — the reissue happened either way. A screen that says "Invitation
 *     resent" on a `failed` outcome is a control claiming a success it did not
 *     achieve (**D-004**), and it is one `if` away at all times.
 *   - **Group A: the gate matches the backend and does not replace it.** The
 *     route requires `users.reset_password` *and* the hierarchy rule; the button
 *     is convenience only, which is why group A asserts the gate and group E
 *     asserts that a server refusal is surfaced rather than swallowed.
 *
 * Follows D-012 and the Task 2.4–3.7 files: `react-dom/client` + React 19's
 * `act`, no component-testing library, `vi.hoisted` for anything the mock
 * factories close over, and the real `ApiError`/`errorMessage`.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => {
  const EMP = "8d1f0f5a-4c2e-4b7a-9f61-0f2c9a3b7d10";

  const BASE = {
    id: EMP,
    employeeCode: "EMP-1042",
    name: "Ravi Kumar",
    email: "ravi.kumar@risenext.com",
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
    invitedAt: "2026-08-03T09:00:00.000Z" as string | null,
    inviteAcceptedAt: null as string | null,
  };

  return {
    EMP,
    BASE,
    apiRequestMock: vi.fn(),
    refreshMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    toastInfo: vi.fn(),
    state: {
      permissions: [] as string[],
      employees: [] as (typeof BASE)[],
    },
  };
});

const { EMP, BASE, apiRequestMock, refreshMock, toastSuccess, toastError, toastInfo } = h;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: h.apiRequestMock,
    api: {
      ...actual.api,
      remove: vi.fn(),
      replace: vi.fn(),
      list: vi.fn(),
    },
  };
});

vi.mock("@/components/charts/employee-target-chart", () => ({
  EmployeeTargetChart: () => null,
}));

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
  toast: { success: h.toastSuccess, error: h.toastError, info: h.toastInfo },
}));

import EmployeesPage from "@/app/(app)/employees/page";

const ALL_PERMS = [
  "users.view",
  "users.edit",
  "users.assign",
  "users.create",
  "users.reset_password",
  "users.delete",
  "teams.assign",
];

/** The success the route actually returns: reissued, and merely logged locally. */
const LOGGED = {
  data: { id: EMP, name: BASE.name, email: BASE.email },
  invitation: { status: "logged", expiresInHours: 72 },
};

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue(LOGGED);
  refreshMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastInfo.mockReset();

  h.state.permissions = [...ALL_PERMS];
  h.state.employees = [{ ...BASE }];

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
  /*
   * A failing case never reaches its own `unmount()`, and Radix renders the
   * dialog into `document.body`. Without this, one failure leaves a stale tree
   * behind and every later case queries the wrong DOM — which is exactly how
   * the first run of this file turned one real failure into eleven.
   */
  document.body.innerHTML = "";
});

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

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** The table row for an employee, by their code. */
function rowFor(code: string): HTMLTableRowElement {
  const row = Array.from(document.querySelectorAll("tr")).find((tr) =>
    tr.textContent?.includes(code),
  );
  if (!row) throw new Error(`row ${code} not rendered`);
  return row as HTMLTableRowElement;
}

/** Opens the detail dialog for the fixture employee. */
async function openDetail() {
  const page = await mountPage();
  await click(rowFor("EMP-1042"));
  return page;
}

const buttons = () => Array.from(document.querySelectorAll("button"));

/**
 * The resend control, by any of its labels: "Resend invitation", "Send
 * invitation" for an employee who never had one, and "Sending…" while a reissue
 * is in flight — group D needs to find it in exactly that state.
 */
const resendButton = (): HTMLButtonElement | undefined =>
  buttons().find((b) => /^(Resend|Send)/.test((b.textContent ?? "").trim()));

const bodyText = () => document.body.textContent ?? "";

/** Every call the page made to the resend endpoint. */
const resendCalls = () =>
  apiRequestMock.mock.calls.filter((call) =>
    String(call[0] ?? "").includes("resend-invitation"),
  );

/* ------------------------------------------------------------------ group A */

describe("A — the control is gated the way the route is", () => {
  it("1. an invited, not-yet-accepted, active employee gets a resend button", async () => {
    const page = await openDetail();
    expect(resendButton()).toBeDefined();
    await page.unmount();
  });

  it("2. without users.reset_password there is no resend button", async () => {
    h.state.permissions = ALL_PERMS.filter((p) => p !== "users.reset_password");
    const page = await openDetail();

    expect(resendButton()).toBeUndefined();
    await page.unmount();
  });

  it("3. users.edit alone is not enough — it is a different permission", async () => {
    h.state.permissions = ["users.view", "users.edit"];
    const page = await openDetail();

    expect(resendButton()).toBeUndefined();
    await page.unmount();
  });

  it("4. an employee who already accepted gets no resend button", async () => {
    // The route answers 409 for them; the screen should not offer the action.
    h.state.employees = [{ ...BASE, inviteAcceptedAt: "2026-08-04T10:00:00.000Z" }];
    const page = await openDetail();

    expect(resendButton()).toBeUndefined();
    await page.unmount();
  });

  it("5. an accepted employee still gets Reset password — the two are distinct", async () => {
    h.state.employees = [{ ...BASE, inviteAcceptedAt: "2026-08-04T10:00:00.000Z" }];
    const page = await openDetail();

    expect(buttons().some((b) => (b.textContent ?? "").includes("Reset password"))).toBe(true);
    await page.unmount();
  });

  it("6. a deactivated employee gets no resend button", async () => {
    h.state.employees = [{ ...BASE, status: "Inactive" }];
    const page = await openDetail();

    expect(resendButton()).toBeUndefined();
    await page.unmount();
  });

  it("7. a never-invited active employee DOES get one — they need the first link", async () => {
    h.state.employees = [{ ...BASE, invitedAt: null, inviteAcceptedAt: null }];
    const page = await openDetail();

    expect(resendButton()).toBeDefined();
    await page.unmount();
  });

  it("8. the button is not in the list itself — only behind the detail view", async () => {
    const page = await mountPage();
    expect(resendButton()).toBeUndefined();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — the request", () => {
  it("9. clicking posts to the resend endpoint for that employee", async () => {
    const page = await openDetail();
    await click(resendButton()!);

    expect(resendCalls().length).toBe(1);
    expect(resendCalls()[0]![0]).toBe(`/users/${EMP}/resend-invitation`);
    await page.unmount();
  });

  it("10. it is a POST", async () => {
    const page = await openDetail();
    await click(resendButton()!);

    expect((resendCalls()[0]![1] as { method?: string }).method).toBe("POST");
    await page.unmount();
  });

  it("11. it sends no token, password or credential of any kind", async () => {
    const page = await openDetail();
    await click(resendButton()!);

    const body = JSON.stringify((resendCalls()[0]![1] as { body?: unknown }).body ?? {});
    expect(body).not.toMatch(/token|password/i);
    await page.unmount();
  });

  it("12. merely opening the detail view issues nothing", async () => {
    const page = await openDetail();
    expect(resendCalls().length).toBe(0);
    await page.unmount();
  });

  it("13. the list is re-read after a successful reissue — invitedAt has moved", async () => {
    const page = await openDetail();
    await click(resendButton()!);

    expect(refreshMock).toHaveBeenCalled();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — the message reports what the server actually said", () => {
  it("14. a `sent` outcome reads as resent", async () => {
    apiRequestMock.mockResolvedValue({
      data: { id: EMP, name: BASE.name, email: BASE.email },
      invitation: { status: "sent", expiresInHours: 72 },
    });
    const page = await openDetail();
    await click(resendButton()!);

    expect(toastSuccess).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("15. a `failed` outcome does NOT report success", async () => {
    /*
     * The load-bearing test. The HTTP call succeeded — 200, no throw — but the
     * email did not go. Reporting that as "Invitation resent" is exactly the
     * false success D-004 forbids.
     */
    apiRequestMock.mockResolvedValue({
      data: { id: EMP, name: BASE.name, email: BASE.email },
      invitation: { status: "failed", expiresInHours: 72 },
    });
    const page = await openDetail();
    await click(resendButton()!);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
    await page.unmount();
  });

  it("16. a `failed` outcome still says the previous link is dead", async () => {
    // It is: supersession is settled in the database before the mail is tried.
    apiRequestMock.mockResolvedValue({
      data: { id: EMP, name: BASE.name, email: BASE.email },
      invitation: { status: "failed", expiresInHours: 72 },
    });
    const page = await openDetail();
    await click(resendButton()!);

    const description = String(toastError.mock.calls[0]?.[1]?.description ?? "");
    expect(description).toMatch(/no longer works|previous link/i);
    await page.unmount();
  });

  it("17. a `logged` outcome is not dressed up as a delivered email", async () => {
    const page = await openDetail();
    await click(resendButton()!);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalled();
    await page.unmount();
  });

  it("18. nothing anywhere claims the email was delivered", async () => {
    apiRequestMock.mockResolvedValue({
      data: { id: EMP, name: BASE.name, email: BASE.email },
      invitation: { status: "sent", expiresInHours: 72 },
    });
    const page = await openDetail();
    await click(resendButton()!);

    const said = JSON.stringify([
      toastSuccess.mock.calls,
      toastInfo.mock.calls,
      toastError.mock.calls,
    ]);
    expect(said).not.toMatch(/\bdelivered\b/i);
    expect(said).not.toMatch(/\breceived\b/i);
    await page.unmount();
  });

  it("19. a missing invitation field is NOT read as success", async () => {
    /*
     * `sent` must be asserted, not assumed. An earlier draft of the page made
     * success the fallthrough branch and this test asserted only that no error
     * appeared — which passed against the broken code. An adversarial review
     * caught that; the assertion now pins the half that matters.
     */
    apiRequestMock.mockResolvedValue({ data: { id: EMP, name: BASE.name, email: BASE.email } });
    const page = await openDetail();
    await click(resendButton()!);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalled();
    await page.unmount();
  });

  it("20. an unrecognised outcome is not read as success either", async () => {
    apiRequestMock.mockResolvedValue({
      data: { id: EMP, name: BASE.name, email: BASE.email },
      invitation: { status: "queued", expiresInHours: 72 },
    });
    const page = await openDetail();
    await click(resendButton()!);

    expect(toastSuccess).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("21. a never-invited employee is not told anything was RE-sent", async () => {
    // The route allows them — every employee predating Task 3.5 has no
    // invitation — so the copy must not claim a previous one existed.
    h.state.employees = [{ ...BASE, invitedAt: null, inviteAcceptedAt: null }];
    apiRequestMock.mockResolvedValue({
      data: { id: EMP, name: BASE.name, email: BASE.email },
      invitation: { status: "sent", expiresInHours: 72 },
    });
    const page = await openDetail();

    expect((resendButton()!.textContent ?? "").trim()).toBe("Send invitation");
    await click(resendButton()!);

    const said = JSON.stringify([toastSuccess.mock.calls, toastInfo.mock.calls]);
    expect(said).not.toMatch(/resent|reissued/i);
    await page.unmount();
  });

  it("22. a previously-invited employee IS told it was resent", async () => {
    apiRequestMock.mockResolvedValue({
      data: { id: EMP, name: BASE.name, email: BASE.email },
      invitation: { status: "sent", expiresInHours: 72 },
    });
    const page = await openDetail();

    expect((resendButton()!.textContent ?? "").trim()).toBe("Resend invitation");
    await click(resendButton()!);

    expect(String(toastSuccess.mock.calls[0]?.[0] ?? "")).toMatch(/resent/i);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — the in-flight state", () => {
  it("23. the button disables while the reissue is in flight", async () => {
    let release: (value: unknown) => void = () => {};
    apiRequestMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const page = await openDetail();
    await click(resendButton()!);

    expect(resendButton()!.disabled).toBe(true);

    await act(async () => {
      release(LOGGED);
    });
    await page.unmount();
  });

  it("24. it says so while it is working", async () => {
    let release: (value: unknown) => void = () => {};
    apiRequestMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const page = await openDetail();
    await click(resendButton()!);

    expect(bodyText()).toContain("Sending…");

    await act(async () => {
      release(LOGGED);
    });
    await page.unmount();
  });

  it("25. it is usable again once the call settles", async () => {
    const page = await openDetail();
    await click(resendButton()!);

    expect(resendButton()!.disabled).toBe(false);
    await page.unmount();
  });

  it("26. it is re-enabled after a failure too, so the action is retryable", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, "server_error", "Boom"));
    const page = await openDetail();
    await click(resendButton()!);

    expect(resendButton()!.disabled).toBe(false);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — a server refusal is surfaced, never swallowed", () => {
  it("27. a 403 is reported and not treated as success", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(403, "forbidden", "You cannot manage a user at or above your own role level"),
    );
    const page = await openDetail();
    await click(resendButton()!);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
    await page.unmount();
  });

  it("28. the server's reason is shown, not replaced with a generic one", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(409, "conflict", "This employee has already completed setup."),
    );
    const page = await openDetail();
    await click(resendButton()!);

    const description = String(toastError.mock.calls[0]?.[1]?.description ?? "");
    expect(description).toContain("already completed setup");
    await page.unmount();
  });

  it("29. a refusal does not re-read the list as though something changed", async () => {
    apiRequestMock.mockRejectedValue(new ApiError(403, "forbidden", "Nope"));
    const page = await openDetail();
    await click(resendButton()!);

    expect(refreshMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("30. a network failure is reported rather than thrown at the user", async () => {
    apiRequestMock.mockRejectedValue(new Error("Network request failed"));
    const page = await openDetail();
    await click(resendButton()!);

    expect(toastError).toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group F */

describe("F — nothing sensitive reaches the screen", () => {
  it("31. no token appears anywhere after a resend", async () => {
    apiRequestMock.mockResolvedValue({
      data: { id: EMP, name: BASE.name, email: BASE.email },
      invitation: { status: "sent", expiresInHours: 72 },
    });
    const page = await openDetail();
    await click(resendButton()!);

    expect(bodyText()).not.toMatch(/token|accept-invite/i);
    await page.unmount();
  });

  it("32. no password is shown — a resend hands over a link, not a credential", async () => {
    const page = await openDetail();
    await click(resendButton()!);

    expect(bodyText()).not.toMatch(/temporary password/i);
    await page.unmount();
  });

  it("33. the toast never carries a token even if the server sent one", async () => {
    // The server does not, and must not, return one — but if it ever did, the
    // screen must not be the thing that surfaces it.
    apiRequestMock.mockResolvedValue({
      data: { id: EMP, name: BASE.name, email: BASE.email },
      invitation: { status: "sent", expiresInHours: 72 },
      token: "raw-token-should-never-be-here",
    });
    const page = await openDetail();
    await click(resendButton()!);

    const said = JSON.stringify([toastSuccess.mock.calls, toastInfo.mock.calls]);
    expect(said).not.toContain("raw-token-should-never-be-here");
    expect(bodyText()).not.toContain("raw-token-should-never-be-here");
    await page.unmount();
  });
});
