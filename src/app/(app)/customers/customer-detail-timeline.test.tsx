/**
 * TASK 4.3 — the customer timeline shows real audit data, or says why it
 * cannot. TASK 4.10 — the false audit-lock badge is gone.
 *
 * What stood here before was fabricated: three to five events built by
 * concatenating `"T10:20:00"` onto values that were already full ISO
 * timestamps, asserting that documents had been uploaded and a loan submitted
 * to a bank on no evidence whatsoever. Every one of those strings is asserted
 * absent below, in all three states.
 *
 * The two rules this suite exists to hold (**D-049**):
 *
 *   1. **A 403 is not an empty list.** `audit_logs.view` is held only by Super
 *      Admin and Admin, while Manager, Team Leader and Executive hold
 *      `customers.view` and can open this page. Widening the grant is
 *      forbidden (RULES §5), and rendering an empty timeline would tell three
 *      of five roles that nothing has ever happened to this customer.
 *   2. **No raw `changes` values reach the DOM.** `REDACTED_FIELDS` covers
 *      Aadhaar and credentials and nothing else, so the payload carries PAN,
 *      mobile, email, account number and IFSC in the clear (**SEC-017**, OPEN).
 *      The fixture below deliberately puts values in `changes` that appear
 *      nowhere else on the page, and asserts every one of them is absent.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => {
  const CUSTOMER = {
    id: "6b1f2c48-9a30-4d17-8e52-3f0c7b9d1a44",
    code: "CUS-10007",
    bankId: "0d2a7e91-4c66-4b0f-9d31-8a5e2c7f6b10",
    bankReferenceId: "HDFC/2026/00841",
    name: "Meera Nair",
    fatherName: "Raghavan Nair",
    motherName: "Latha Nair",
    dob: "1988-02-11T00:00:00.000Z",
    gender: "Female" as const,
    maritalStatus: "Married" as const,
    occupation: "Pharmacist",
    monthlyIncome: "72000",
    mobile: "9848022222",
    altMobile: null,
    email: "meera.nair@example.com",
    address: "12/4 Nallakunta",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500044",
    pan: "AWKPN1234C",
    aadhaarLast4: "7781",
    kyc: "Verified" as const,
    cibil: 762,
    accountNo: "50100234567891",
    ifsc: "HDFC0000123",
    branch: "Nallakunta",
    assignedUserId: null,
    assignedTeamId: null,
    status: "Active" as const,
    createdAt: "2026-01-14T06:30:00.000Z",
  };

  /*
   * Values chosen so that finding any of them in the document proves a raw
   * `changes` value was rendered: none of them appears anywhere else on the
   * page or in the customer fixture above.
   */
  const SECRET = {
    oldPan: "ZZZPQ8888K",
    newPan: "YYYPQ7777J",
    oldMobile: "9111100001",
    newMobile: "9222200002",
    oldAccount: "99998888777766",
    newAccount: "11112222333344",
    oldEmail: "leaked.before@example.invalid",
    newEmail: "leaked.after@example.invalid",
    oldIfsc: "LEAK0000999",
    dob: "1971-07-07T00:00:00.000Z",
  };

  const ENTRIES = [
    {
      id: 4021,
      occurredAt: "2026-03-02T09:15:00.000Z",
      actorId: "u-1",
      actorEmail: "priya.menon@risenext.com",
      actorRoleKey: "admin",
      action: "updated",
      recordType: "customer",
      recordId: CUSTOMER.id,
      bankId: CUSTOMER.bankId,
      summary: "Updated customer Meera Nair",
      changes: {
        pan: { from: SECRET.oldPan, to: SECRET.newPan },
        mobile: { from: SECRET.oldMobile, to: SECRET.newMobile },
        accountNo: { from: SECRET.oldAccount, to: SECRET.newAccount },
        email: { from: SECRET.oldEmail, to: SECRET.newEmail },
        ifsc: { from: SECRET.oldIfsc, to: "HDFC0000123" },
        dob: { from: SECRET.dob, to: CUSTOMER.dob },
        updatedAt: { from: "2026-01-14T06:30:00.000Z", to: "2026-03-02T09:15:00.000Z" },
        updatedBy: { from: null, to: "u-1" },
      },
    },
    {
      id: 3980,
      occurredAt: "2026-01-14T06:30:00.000Z",
      actorId: "u-2",
      actorEmail: "arun.das@risenext.com",
      actorRoleKey: "super_admin",
      action: "created",
      recordType: "customer",
      recordId: CUSTOMER.id,
      bankId: CUSTOMER.bankId,
      summary: "Created customer Meera Nair (HDFC Bank / HDFC/2026/00841)",
      changes: null,
    },
  ];

  return {
    CUSTOMER,
    SECRET,
    ENTRIES,
    apiRequestMock: vi.fn(),
    listMock: vi.fn(),
    refreshMock: vi.fn(),
    pushMock: vi.fn(),
    state: { permissions: [] as string[] },
  };
});

const { CUSTOMER, SECRET, ENTRIES, listMock } = h;

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: h.apiRequestMock,
    api: {
      ...actual.api,
      update: (path: string, body: unknown) =>
        h.apiRequestMock(path, { method: "PATCH", body }),
      remove: (path: string) => h.apiRequestMock(path, { method: "DELETE" }),
      list: h.listMock,
    },
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: h.CUSTOMER.id }),
  useRouter: () => ({
    push: h.pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  notFound: () => {
    throw new Error("notFound() was called — the page discarded a live record");
  },
}));

vi.mock("@/hooks/use-api", () => ({
  useRecord: () => ({
    data: h.CUSTOMER,
    loading: false,
    error: null,
    refresh: h.refreshMock,
  }),
  useResource: () => ({
    data: [],
    total: 0,
    loading: false,
    error: null,
    refresh: vi.fn(),
    setData: vi.fn(),
  }),
  useStats: () => ({ data: null, loading: false, num: () => 0 }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [],
    teams: [],
    employees: [],
    loading: false,
    refresh: vi.fn(),
    bankName: () => "HDFC Bank",
    bankById: () => undefined,
    bankShortName: () => "HDFC",
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
      bankIds: null,
      unrestrictedBankAccess: true,
    },
    can: (permission: string) => h.state.permissions.includes(permission),
    canAny: (...permissions: string[]) =>
      permissions.some((p) => h.state.permissions.includes(p)),
    signOut: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import CustomerProfilePage from "@/app/(app)/customers/[id]/page";

beforeEach(() => {
  h.apiRequestMock.mockReset();
  h.apiRequestMock.mockResolvedValue({ data: { ...CUSTOMER } });
  listMock.mockReset();
  listMock.mockResolvedValue({ data: ENTRIES });
  h.refreshMock.mockClear();
  h.pushMock.mockClear();
  // Super Admin: holds customers.view AND audit_logs.view.
  h.state.permissions = ["customers.view", "customers.edit", "audit_logs.view"];

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
    root.render(<CustomerProfilePage />);
  });
  return {
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** Radix activates a tab on `mousedown` with the primary button. */
async function openTimelineTab() {
  const trigger = Array.from(document.querySelectorAll('[role="tab"]')).find((node) =>
    node.textContent?.trim().includes("Timeline"),
  );
  if (!trigger) throw new Error("Timeline tab trigger not rendered");
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
  });
}

const text = () => document.body.textContent ?? "";

/** Every string the deleted fabrication used to put on screen. */
const FABRICATED = [
  "Customer added",
  "Documents uploaded",
  "Loan submitted to",
  "Loan approved",
  "Amount disbursed",
  // The malformed timestamps it produced by concatenation.
  "T10:20:00",
  "T11:00:00",
  "T12:30:00",
  "T15:20:00",
  "T17:10:00",
];

function expectNoFabrication() {
  const body = text();
  for (const phrase of FABRICATED) {
    expect(body, `fabricated timeline content is back: "${phrase}"`).not.toContain(phrase);
  }
}

/* ------------------------------------------------------------------ group A */

describe("A — the request", () => {
  it("1. asks the real audit endpoint, scoped to this customer record", async () => {
    const page = await mountPage();

    expect(listMock).toHaveBeenCalledTimes(1);
    const [path, query] = listMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/audit-logs");
    expect(query.recordType).toBe("customer");
    expect(query.recordId).toBe(CUSTOMER.id);

    await page.unmount();
  });

  it("2. invents no customer-scoped endpoint of its own", async () => {
    const page = await mountPage();

    for (const [path] of listMock.mock.calls as [string][]) {
      expect(path).toBe("/audit-logs");
    }
    // Nothing else is fetched by hand: the other tabs still go through the
    // shared hooks, which are mocked out here.
    expect(h.apiRequestMock).not.toHaveBeenCalled();

    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — real entries render, and only safe parts of them", () => {
  it("3. renders one row per audit entry, with action, time and actor", async () => {
    const page = await mountPage();
    await openTimelineTab();

    const rows = Array.from(document.querySelectorAll("ol li")).map(
      (li) => li.textContent ?? "",
    );
    expect(rows).toHaveLength(ENTRIES.length);

    expect(rows[0]).toContain("Updated");
    expect(rows[0]).toContain("priya.menon@risenext.com");
    // A real, parseable timestamp — the fabrication produced malformed ones.
    expect(rows[0]).toMatch(/\d{2} Mar/);

    expect(rows[1]).toContain("Created");
    expect(rows[1]).toContain("arun.das@risenext.com");

    await page.unmount();
  });

  it("4. renders the NAMES of the fields that changed", async () => {
    const page = await mountPage();
    await openTimelineTab();

    const body = text();
    expect(body).toContain("Fields changed");
    expect(body).toContain("PAN");
    expect(body).toContain("Mobile");
    expect(body).toContain("Account number");

    await page.unmount();
  });

  it("5. THE HEADLINE — no raw `changes` value reaches the DOM", async () => {
    const page = await mountPage();
    await openTimelineTab();

    const body = text();
    for (const [key, value] of Object.entries(SECRET)) {
      expect(body, `raw audit value leaked (${key})`).not.toContain(value);
    }
    // Nor the diff's own vocabulary, which would mean a payload dump.
    expect(body).not.toContain('"from"');
    expect(body).not.toContain('"to"');

    await page.unmount();
  });

  it("6. drops the bookkeeping columns every write touches", async () => {
    const page = await mountPage();
    await openTimelineTab();

    const body = text();
    expect(body).not.toContain("updatedAt");
    expect(body).not.toContain("updatedBy");

    await page.unmount();
  });

  it("7. no fabricated event survives alongside the real ones", async () => {
    const page = await mountPage();
    await openTimelineTab();
    expectNoFabrication();
    await page.unmount();
  });

  it("8. says plainly which activity this trail does not cover", async () => {
    // `recordType` is a scalar filter, so loan, document and transaction events
    // are unreachable in one request. The tab must not imply otherwise.
    const page = await mountPage();
    await openTimelineTab();

    expect(text()).toContain("is not listed here");
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — a 403 is an honest permission state, never an empty history", () => {
  it("9. the server's 403 produces the permission-aware state", async () => {
    listMock.mockRejectedValueOnce(
      new ApiError(403, "forbidden", "You do not have permission to perform this action"),
    );

    const page = await mountPage();
    await openTimelineTab();

    const body = text();
    expect(body).toContain("do not have permission");
    expect(body).toContain("audit_logs.view");
    // Explicitly NOT the empty-history wording.
    expect(body).not.toContain("No audit entries have been recorded");
    expect(body).toContain("This is not an empty history");
    expectNoFabrication();

    await page.unmount();
  });

  it("10. a role without audit_logs.view sees the same honest state", async () => {
    // Manager / Team Leader / Executive: they hold customers.view and can open
    // this page, but the audit endpoint would refuse them.
    h.state.permissions = ["customers.view", "customers.edit"];

    const page = await mountPage();
    await openTimelineTab();

    const body = text();
    expect(body).toContain("do not have permission");
    expect(body).not.toContain("No audit entries have been recorded");
    expectNoFabrication();

    await page.unmount();
  });

  it("11. ...and no pointless request is sent on their behalf", async () => {
    h.state.permissions = ["customers.view"];
    const page = await mountPage();

    expect(listMock).not.toHaveBeenCalled();
    await page.unmount();
  });

  it("12. the permission grant is never widened to fill the tab", async () => {
    h.state.permissions = ["customers.view"];
    const page = await mountPage();
    await openTimelineTab();

    // No entry rows, no invented events, and nothing claiming the trail is empty.
    expect(document.querySelectorAll("ol li")).toHaveLength(0);
    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — an empty result is honest, and distinct from a refusal", () => {
  it("13. says the record has no entries, not that access was refused", async () => {
    listMock.mockResolvedValueOnce({ data: [] });

    const page = await mountPage();
    await openTimelineTab();

    const body = text();
    expect(body).toContain("No audit entries have been recorded");
    expect(body).not.toContain("do not have permission");
    expectNoFabrication();

    await page.unmount();
  });

  it("14. an empty result invents no placeholder rows", async () => {
    listMock.mockResolvedValueOnce({ data: [] });

    const page = await mountPage();
    await openTimelineTab();

    expect(document.querySelectorAll("ol li")).toHaveLength(0);
    await page.unmount();
  });

  it("15. a non-403 failure is reported as a failure, not as an empty trail", async () => {
    listMock.mockRejectedValueOnce(new Error("Failed to fetch"));

    const page = await mountPage();
    await openTimelineTab();

    const body = text();
    expect(body).toContain("could not be loaded");
    expect(body).toContain("Failed to fetch");
    expect(body).not.toContain("No audit entries have been recorded");
    expect(body).not.toContain("do not have permission");
    expectNoFabrication();

    await page.unmount();
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — TASK 4.10: the false audit-lock claim is gone", () => {
  it("16. the badge text is absent from the page", async () => {
    const page = await mountPage();

    // Verified false: PATCH /:id and DELETE /:id carry no loan-status check of
    // any kind, so a disbursed customer is fully editable and deletable.
    expect(text()).not.toContain("Record locked for audit after disbursal");
    await page.unmount();
  });

  it("17. no substitute lock claim was invented in its place", async () => {
    const page = await mountPage();
    await openTimelineTab();

    const body = text().toLowerCase();
    for (const phrase of ["record locked", "locked for audit", "after disbursal", "read-only after"]) {
      expect(body, `an unsupported lock claim is on screen: "${phrase}"`).not.toContain(phrase);
    }

    await page.unmount();
  });
});
