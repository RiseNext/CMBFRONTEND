/**
 * TASKS 4.4 and 4.11 — the two fabrications on the customer list are gone.
 *
 * **4.4 — "Re-upload written form."** The handler read a `File` out of a hidden
 * input, discarded it, and reported *"<name> has been queued for
 * verification"*. No request, no `FormData`, no queue — and no file storage
 * exists anywhere in this repository (object storage is OPEN-2; the document
 * endpoints are Phase 9). A control claiming an outcome the system cannot
 * achieve is what D-004 and RULES §4 forbid.
 *
 * **4.11 — "Draft application."** Built an HTML document from the CREATE-DIALOG
 * form state, which sits at its defaults unless that dialog was opened, so a
 * click from the page header produced a file naming an applicant "Customer",
 * the bank `banks[0]`, and an income of ₹45,000 — presented as one customer's
 * details in a document describing itself as *"for manual verification and
 * onboarding"* (D-055). The toast was true; the artefact was not.
 *
 * Both were removed rather than repaired: neither could be implemented in this
 * phase without building infrastructure the roadmap places elsewhere, and a
 * missing feature is honest where a lying one is a defect.
 *
 * The load-bearing group is C: it clicks **every** control the page header
 * offers and asserts that nothing produced a file. That is what stops the
 * generator coming back behind a different label.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const CUSTOMER = {
    id: "3f8b21c4-9d0e-4a77-b512-6ce4a8f01d93",
    code: "CUS-10001",
    bankId: "b1000000-0000-4000-8000-000000000001",
    bankReferenceId: "REF001",
    name: "Priya Raman",
    fatherName: null,
    motherName: null,
    dob: null,
    gender: null,
    maritalStatus: null,
    occupation: null,
    monthlyIncome: "62000",
    mobile: "9848011111",
    altMobile: null,
    email: null,
    address: null,
    city: "Hyderabad",
    state: "Telangana",
    pincode: null,
    pan: "ABCPK1234K",
    aadhaarLast4: null,
    kyc: "Verified" as const,
    cibil: 780,
    accountNo: null,
    ifsc: null,
    branch: null,
    assignedUserId: null,
    assignedTeamId: null,
    status: "Active" as const,
    createdAt: "2026-08-01T09:00:00.000Z",
  };

  return {
    CUSTOMER,
    BANK: { id: CUSTOMER.bankId, name: "HDFC Bank", shortName: "HDFC", code: "HDFC" },
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    apiRequestMock: vi.fn(),
  };
});

const { CUSTOMER, toastSuccess } = h;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/customers",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiRequest: h.apiRequestMock,
    api: { ...actual.api, remove: vi.fn(), create: vi.fn() },
  };
});

vi.mock("@/hooks/use-api", () => ({
  useResource: (path: string) => ({
    data: path === "/customers" ? [h.CUSTOMER] : [],
    total: path === "/customers" ? 1 : 0,
    loading: false,
    error: null,
    refresh: vi.fn(),
    setData: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-reference", () => ({
  useReference: () => ({
    banks: [h.BANK],
    employees: [],
    teams: [],
    loading: false,
    refresh: vi.fn(),
    bankName: () => h.BANK.name,
    bankById: () => h.BANK,
    bankShortName: () => h.BANK.shortName,
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
      permissions: ["*"],
    },
    can: () => true,
    signOut: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: vi.fn() },
}));

import CustomersPage from "@/app/(app)/customers/page";

let container: HTMLDivElement;
let root: Root;
const createObjectURL = vi.fn(() => "blob:mock");

beforeEach(() => {
  toastSuccess.mockClear();
  h.toastError.mockClear();
  h.apiRequestMock.mockReset();
  h.apiRequestMock.mockResolvedValue({ available: true });
  createObjectURL.mockClear();

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
  // jsdom implements neither; the draft generator used both.
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function mountPage() {
  await act(async () => {
    root.render(<CustomersPage />);
  });
}

const bodyText = () => document.body.textContent ?? "";

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/* ------------------------------------------------------------------ group A */

describe("A — 4.4: nothing claims a written form was queued", () => {
  it("1. the Re-upload written form control is gone", async () => {
    await mountPage();

    const labels = Array.from(container.querySelectorAll("button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(labels.some((label) => /re-upload/i.test(label ?? ""))).toBe(false);
    expect(labels.some((label) => /written form/i.test(label ?? ""))).toBe(false);
  });

  it("2. no file input is left behind on the page", async () => {
    await mountPage();

    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("3. the page contains no queued/uploaded claim at all", async () => {
    await mountPage();

    const text = bodyText();
    expect(text).not.toMatch(/queued for verification/i);
    expect(text).not.toMatch(/written form uploaded/i);
    expect(text).not.toMatch(/has been queued/i);
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — 4.11: the fabricated draft application is gone (D-055)", () => {
  it("4. the Draft application control is gone", async () => {
    await mountPage();

    const labels = Array.from(container.querySelectorAll("button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(labels.some((label) => /draft application/i.test(label ?? ""))).toBe(false);
    expect(bodyText()).not.toMatch(/draft application/i);
  });

  it("5. none of the values it invented is emitted anywhere", async () => {
    await mountPage();

    const text = bodyText();
    // The applicant name, the income and the document's own framing.
    expect(text).not.toMatch(/manual verification/i);
    expect(text).not.toMatch(/prepared for verification and onboarding/i);
    expect(text).not.toContain("₹45,000");
  });

  it("6. the create dialog's defaults are never presented as a customer's facts", async () => {
    await mountPage();

    const add = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Add customer",
    );
    await click(add!);

    // The 45000 default still exists as a form value — that is a prefilled
    // input, not a statement about a person. What must not exist is a document
    // built from it.
    const income = document.querySelector<HTMLInputElement>("#c-income");
    expect(income?.value).toBe("45000");
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — no control on this page produces a file", () => {
  it("7. clicking every header control downloads nothing and toasts nothing", async () => {
    await mountPage();

    const header = container.querySelector("header");
    const controls = Array.from(header?.querySelectorAll("button") ?? []);
    expect(controls.length).toBeGreaterThan(0);

    for (const control of controls) {
      await click(control);
    }

    // The one remaining link goes to a page; it generates nothing.
    const links = Array.from(header?.querySelectorAll("a") ?? []);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/documents"]);
    expect(links.some((a) => a.hasAttribute("download"))).toBe(false);

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelector("a[download]")).toBeNull();
    expect(document.querySelector("a[download]")).toBeNull();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("8. the export that remains is the DataTable's own, and it names its scope", async () => {
    await mountPage();

    // Not a regression guard against exporting — `DataTable` exports a real CSV
    // of the rows it holds. It is here so removing two fake controls is not
    // mistaken for removing the working one.
    const exportButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Export"),
    );
    expect(exportButton?.textContent).toContain("Export page");
  });

  it("9. the row still renders — nothing else on the page was disturbed", async () => {
    await mountPage();

    expect(bodyText()).toContain(CUSTOMER.name);
  });
});
