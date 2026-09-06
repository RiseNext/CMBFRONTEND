/**
 * Demo request handler.
 *
 * Stands in for the whole API while demo mode is active. `apiRequest` hands
 * every call here instead of reaching the network, so the walkthrough works
 * with the backend stopped, the database absent, and no environment
 * configured at all.
 *
 * The responses copy the real contract exactly — `{ data, meta }` for lists,
 * `{ data }` for a record, 204/undefined for a delete — so no page needed a
 * change to read them.
 *
 * Authorisation is enforced here the same way the server enforces it: against
 * the Executive permission set. Anything that role cannot do fails with the
 * same 403 the API would return, so the demo never shows a client something a
 * real executive could not do.
 */

import type { RequestOptions } from "@/lib/api";
import {
  DEMO_BANK_IDS,
  DEMO_EMAIL,
  DEMO_PERMISSIONS,
  DEMO_USER_ID,
} from "./config";
import type { DemoDataset } from "./data";
import { demoId, getDemoData, mutateDemoData, nextDemoCode } from "./store";

/**
 * Thrown by the handlers below and translated into a real `ApiError` by
 * `lib/api`. Declared here rather than imported so the demo module never
 * depends on the module that depends on it.
 */
export class DemoHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "DemoHttpError";
    this.status = status;
    this.code = code;
  }
}

const forbidden = () =>
  new DemoHttpError(403, "forbidden", "You do not have access to this resource");
const notFound = (what: string) =>
  new DemoHttpError(404, "not_found", `${what} not found`);
const badRequest = (message: string) =>
  new DemoHttpError(400, "bad_request", message);

function requirePermission(permission: string): void {
  if (!DEMO_PERMISSIONS.includes(permission)) throw forbidden();
}

/** A short pause so loading states behave the way they do against the API. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 140));

export const DEMO_SESSION_USER = {
  id: DEMO_USER_ID,
  name: "Karthik Rao",
  email: DEMO_EMAIL,
  phone: "+91 98495 60142",
  avatarUrl: null,
  role: { id: "role-executive", key: "executive", name: "Executive", level: 40 },
  permissions: [...DEMO_PERMISSIONS].sort(),
  bankIds: DEMO_BANK_IDS,
  unrestrictedBankAccess: false,
};

/* --------------------------------------------------------------- helpers */

type Query = NonNullable<RequestOptions["query"]>;
type Row = Record<string, unknown>;

interface ListConfig {
  searchable?: string[];
  filterable?: string[];
  orderBy?: string;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function listResponse<T extends Row>(rows: T[], query: Query, config: ListConfig) {
  const page = Number(query.page ?? 1) || 1;
  const pageSize = Number(query.pageSize ?? 25) || 25;
  let matched = [...rows];

  for (const field of config.filterable ?? []) {
    const value = query[field];
    if (typeof value === "string" && value.length > 0) {
      matched = matched.filter((row) => text(row[field]) === value);
    }
  }

  const search = text(query.search).trim().toLowerCase();
  if (search && config.searchable?.length) {
    matched = matched.filter((row) =>
      (config.searchable ?? []).some((field) =>
        text(row[field]).toLowerCase().includes(search),
      ),
    );
  }

  const orderBy = config.orderBy ?? "createdAt";
  matched.sort((a, b) => text(b[orderBy]).localeCompare(text(a[orderBy])));

  const total = matched.length;
  return {
    data: matched.slice((page - 1) * pageSize, page * pageSize),
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      scoped: true,
    },
  };
}

function body(options: RequestOptions): Row {
  return (options.body ?? {}) as Row;
}

function str(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function nullableStr(value: unknown): string | null {
  const out = value == null ? "" : String(value).trim();
  return out.length ? out : null;
}

/** The bank scope a real executive is confined to. */
function inScope(row: { bankId?: string | null }): boolean {
  return row.bankId == null || DEMO_BANK_IDS.includes(row.bankId);
}

/**
 * Resources the Executive role cannot read at all. Listing them explicitly
 * means an administrative screen reached by URL fails exactly as it would
 * against the live API rather than quietly rendering an empty table.
 */
const RESOURCE_VIEW_PERMISSION: Record<string, string> = {
  banks: "banks.view",
  customers: "customers.view",
  loans: "requests.view",
  verifications: "verification.view",
  "bank-orders": "bank_orders.view",
  disbursements: "disbursements.view",
  settlements: "settlements.view",
  transactions: "transactions.view",
  ledger: "ledger.view",
  documents: "documents.view",
  "funding-sources": "funding_sources.view",
  "service-providers": "service_providers.view",
  "recycle-bin": "recycle_bin.view",
  "audit-logs": "audit_logs.view",
  roles: "roles.view",
  dashboard: "reports.view",
  reports: "reports.view",
  imports: "customers.import",
};

/* ---------------------------------------------------------------- routing */

export async function demoRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  await settle();

  const segments = path.split("?")[0].split("/").filter(Boolean);
  const method = options.method ?? "GET";
  const query = options.query ?? {};
  const [resource = "", second = "", third = ""] = segments;

  return handle(resource, second, third, method, query, options) as T;
}

function handle(
  resource: string,
  second: string,
  third: string,
  method: string,
  query: Query,
  options: RequestOptions,
): unknown {
  const data = getDemoData();

  switch (resource) {
    case "auth":
      return auth(second, method);

    case "banks":
      return banks(second, method, query, data);

    case "customers":
      return customers(second, method, query, options, data);

    case "loans":
      return loans(second, third, method, query, options, data);

    case "verifications":
      return verifications(second, method, query, data);

    case "service-providers":
      return serviceProviders(second, method, data);

    case "bank-orders":
      return bankOrders(second, method, query, data);

    case "disbursements":
      return disbursements(second, method, query, data);

    case "transactions":
      return transactions(second, method, query, data);

    case "documents":
      return documents(second, third, method, query, options, data);

    case "notifications":
      return notifications(second, third, method, query, data);

    case "users":
      return users(second, method, query, data);

    case "teams":
      return teams(second, method, query, data);

    default: {
      // Everything the Executive role cannot reach answers with the API's own
      // 403 rather than a blank screen.
      const permission = RESOURCE_VIEW_PERMISSION[resource];
      if (permission) requirePermission(permission);
      throw notFound("Resource");
    }
  }
}

/* ------------------------------------------------------------------- auth */

function auth(action: string, method: string): unknown {
  if (action === "refresh" && method === "POST") {
    // Deliberately empty. Nothing in demo mode reaches a server, and an empty
    // token means no Authorization header could be attached even if some
    // future code path did try.
    return { accessToken: "", user: DEMO_SESSION_USER };
  }
  if (action === "logout" && method === "POST") return { data: null };
  if (action === "me" && method === "GET") return { data: DEMO_SESSION_USER };
  throw notFound("Endpoint");
}

/* ------------------------------------------------------------------ banks */

function banks(id: string, method: string, query: Query, data: DemoDataset): unknown {
  requirePermission("banks.view");
  if (method !== "GET") throw forbidden();

  const rows = data.banks.filter((bank) => DEMO_BANK_IDS.includes(bank.id));
  if (id) {
    const bank = rows.find((row) => row.id === id || row.code === id);
    if (!bank) throw notFound("Bank");
    return { data: bank };
  }
  return listResponse(rows as unknown as Row[], query, {
    searchable: ["name", "shortName", "code"],
    filterable: ["status"],
  });
}

/* -------------------------------------------------------------- customers */

function customers(
  id: string,
  method: string,
  query: Query,
  options: RequestOptions,
  data: DemoDataset,
): unknown {
  if (method === "GET") {
    requirePermission("customers.view");
    const rows = data.customers.filter(inScope);

    /*
     * `GET /customers/check/reference` — Task 4.6.
     *
     * Without this branch the path falls through to the `:id` lookup below,
     * finds no customer with the id `"check"` and answers **404**. The create
     * form treats any non-409 as "could not be checked", so nothing was ever
     * mis-reported — but a demo where the duplicate check silently never runs
     * is a demo of a feature that is not there.
     *
     * The real route answers `{ available: true }` (not the `{ data }`
     * envelope) or 409. `DemoHttpError` carries no `details`, so the existing
     * code goes in the message, which the form shows verbatim when no
     * `existingCustomerCode` is present.
     */
    if (id === "check") {
      const bankId = text(query.bankId);
      const reference = text(query.bankReferenceId).trim();
      if (!bankId || !reference) throw badRequest("bankId and bankReferenceId are required");
      if (!DEMO_BANK_IDS.includes(bankId)) throw forbidden();

      const existing = rows.find(
        (row) =>
          row.bankId === bankId &&
          row.bankReferenceId.toLowerCase() === reference.toLowerCase(),
      );
      if (existing) {
        throw new DemoHttpError(
          409,
          "conflict",
          `This Bank Reference ID is already used for the selected bank (${existing.code})`,
        );
      }
      return { available: true };
    }

    if (id) {
      // Every link in the app now uses `id` — the command palette used to use
      // `code`, which 500'd against the real API (BUG-017, Task 1.9). The
      // `code` branch stays: it costs nothing, and a demo presenter following
      // an older bookmark should not hit a dead end mid-walkthrough.
      const customer = rows.find((row) => row.id === id || row.code === id);
      if (!customer) throw notFound("Customer");
      return { data: customer };
    }
    return listResponse(rows as unknown as Row[], query, {
      searchable: ["name", "mobile", "code", "bankReferenceId"],
      filterable: ["status", "bankId", "kyc"],
    });
  }

  if (method === "POST" && !id) {
    requirePermission("customers.create");
    const input = body(options);
    const bankId = str(input.bankId);
    if (!DEMO_BANK_IDS.includes(bankId)) throw forbidden();

    const created = mutateDemoData((store) => {
      const customer = {
        id: demoId(),
        code: nextDemoCode(store, "customer", "CUS"),
        bankId,
        bankReferenceId: str(input.bankReferenceId),
        name: str(input.name),
        fatherName: nullableStr(input.fatherName),
        motherName: nullableStr(input.motherName),
        dob: nullableStr(input.dob),
        gender: null,
        maritalStatus: null,
        occupation: nullableStr(input.occupation),
        monthlyIncome: str(input.monthlyIncome, "0"),
        mobile: str(input.mobile),
        altMobile: nullableStr(input.altMobile),
        email: nullableStr(input.email),
        address: nullableStr(input.address),
        city: nullableStr(input.city),
        state: nullableStr(input.state) ?? "Telangana",
        pincode: nullableStr(input.pincode),
        pan: nullableStr(input.pan),
        aadhaarLast4: null,
        kyc: (input.kyc as "Verified" | "Pending" | "Rejected") ?? "Pending",
        cibil: null,
        accountNo: null,
        ifsc: null,
        branch: null,
        assignedUserId: nullableStr(input.assignedUserId) ?? DEMO_USER_ID,
        assignedTeamId: nullableStr(input.assignedTeamId),
        status:
          (input.status as "Active" | "Follow Up" | "Closed") ?? "Active",
        createdAt: new Date().toISOString(),
      };
      store.customers.unshift(customer);
    }).customers[0];

    return { data: created };
  }

  if (method === "PATCH" && id) {
    requirePermission("customers.edit");
    const input = body(options);
    let updated: unknown;
    mutateDemoData((store) => {
      const customer = store.customers.find((row) => row.id === id);
      if (!customer) throw notFound("Customer");
      Object.assign(customer, input);
      updated = customer;
    });
    return { data: updated };
  }

  // `customers.delete` is not held by an Executive, so the recycle-bin move
  // fails here exactly as it does on the server.
  if (method === "DELETE" && id) {
    requirePermission("customers.delete");
  }

  throw forbidden();
}

/* ------------------------------------------------------------------ loans */

function loans(
  id: string,
  action: string,
  method: string,
  query: Query,
  options: RequestOptions,
  data: DemoDataset,
): unknown {
  /*
   * TASK 5.6 — `POST /loans/:id/verification`.
   *
   * Refused, because the demo user is an **Executive** and the route requires
   * `verification.create`, which the seeded Executive role does not hold
   * (`backend/src/lib/permissions.ts:299-311`). `requirePermission` raises the
   * same 403 the API would; the branch exists so the refusal is the permission
   * model's rather than a 404 from an unrouted path, and so the demo can never
   * fabricate a verification a real executive could not create.
   */
  if (action === "verification" && method === "POST" && id) {
    requirePermission("verification.create");
    throw forbidden();
  }

  if (method === "GET") {
    requirePermission("requests.view");
    const rows = data.loans.filter(inScope);
    if (id) {
      const loan = rows.find((row) => row.id === id || row.code === id);
      if (!loan) throw notFound("Loan");
      return { data: loan };
    }
    return listResponse(rows as unknown as Row[], query, {
      searchable: ["code", "applicationNo"],
      filterable: ["status", "loanType", "priority", "customerId", "bankId"],
    });
  }

  if (method === "POST" && !id) {
    requirePermission("requests.create");
    const input = body(options);
    const bankId = str(input.bankId);
    if (!DEMO_BANK_IDS.includes(bankId)) throw forbidden();

    const customer = data.customers.find((row) => row.id === str(input.customerId));
    if (!customer) throw badRequest("Select a customer before submitting the file");
    const bankCode = data.banks.find((row) => row.id === bankId)?.code ?? "RN";

    const principal = Number(input.amountRequested ?? 0);
    const rate = Number(input.interestRate ?? 0);
    const months = Number(input.tenureMonths ?? 0);

    const created = mutateDemoData((store) => {
      const now = new Date().toISOString();
      const code = nextDemoCode(store, "loan", "LN");
      const loan = {
        id: demoId(),
        code,
        applicationNo: `${bankCode}${code.replace(/\D/g, "")}${String(Date.now()).slice(-6)}`,
        customerId: customer.id,
        bankId,
        loanType: str(input.loanType, "Personal Loan"),
        amountRequested: String(principal),
        amountApproved: "0",
        interestRate: String(rate),
        tenureMonths: months,
        emi: "0",
        processingFee: "0",
        commission: "0",
        status: (input.status as "Submitted") ?? "Submitted",
        appliedOn: str(input.appliedOn, now),
        verificationRequired: true,
        fundingSourceId: null,
        assignedUserId: DEMO_USER_ID,
        assignedTeamId: customer.assignedTeamId,
        priority: "Normal" as const,
        dueDate: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      };
      store.loans.unshift(loan);
    }).loans[0];

    return { data: created };
  }

  throw forbidden();
}

/* ---------------------------------------------------------- verifications */

/**
 * TASK 5.6. Before this branch existed, `GET /verifications?loanId=…` fell
 * through to the router's `default`: the demo Executive **does** hold
 * `verification.view`, so `requirePermission` passed and the request ended at
 * `throw notFound("Resource")` — a **404 on a list this role is entitled to
 * read**. The loan dialog's verification panel would have shown its load-error
 * state on every loan in the walkthrough.
 *
 * Reads only. `verification.create` is not an Executive permission, so the
 * create path is refused on the loan sub-route above; there is nothing to write
 * here.
 */
function verifications(id: string, method: string, query: Query, data: DemoDataset): unknown {
  requirePermission("verification.view");
  if (method !== "GET") {
    // Every write on this resource needs a permission the Executive lacks.
    // Named explicitly rather than falling through to a bare 403, so the reason
    // is the same one the server would give.
    requirePermission("verification.edit");
    throw forbidden();
  }

  /*
   * `?? []` is not defensive noise. `getDemoData` restores whatever is in
   * sessionStorage when it has customers (`store.ts:18-22`), so a tab that
   * started the walkthrough on a build predating this field carries a dataset
   * with no `verifications` key at all. Reading it unguarded would throw inside
   * the request handler rather than answer an empty list.
   */
  const rows = (data.verifications ?? []).filter(inScope);
  if (id) {
    const row = rows.find((item) => item.id === id);
    if (!row) throw notFound("Verification");
    return { data: row };
  }
  // `loanId` mirrors the real route's `filterable` list
  // (`operations.routes.ts:278`), which is the filter the panel sends.
  return listResponse(rows as unknown as Row[], query, {
    searchable: ["providerReference"],
    filterable: ["status", "serviceProviderId", "loanId"],
    orderBy: "requestedAt",
  });
}

/* ------------------------------------------------------- service providers */

/**
 * TASK 5.6. **Always 403 for the demo user**, and deliberately so: the seeded
 * Executive does not hold `service_providers.view`
 * (`backend/src/lib/permissions.ts:299-311`), so the real API refuses this list
 * too. The verification panel never issues the request — it gates on the same
 * permission — and falls back to showing providers by their reference.
 *
 * The branch exists so the refusal comes from the permission gate rather than
 * from the router's `default`, and so the envelope is correct if the demo role
 * ever gains the grant. Note the shape: `{ data, meta: { count } }` with **no
 * `page`/`total`**, matching `operations.routes.ts:607-615` rather than the
 * paginated envelope every other list here returns.
 */
function serviceProviders(id: string, method: string, data: DemoDataset): unknown {
  requirePermission("service_providers.view");
  if (method !== "GET") {
    requirePermission("service_providers.create");
    throw forbidden();
  }

  // See the `?? []` note in `verifications` above — same restored-session case.
  const rows = [...(data.serviceProviders ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  if (id) {
    const row = rows.find((item) => item.id === id);
    if (!row) throw notFound("Service provider");
    return { data: row };
  }
  return { data: rows, meta: { count: rows.length } };
}

/* ------------------------------------------------------------ bank orders */

function bankOrders(
  id: string,
  method: string,
  query: Query,
  data: DemoDataset,
): unknown {
  requirePermission("bank_orders.view");
  if (method !== "GET") throw forbidden();

  const rows = data.bankOrders.filter(inScope);
  if (id) {
    const order = rows.find((row) => row.id === id || row.code === id);
    if (!order) throw notFound("Bank order");
    return { data: order };
  }
  return listResponse(rows as unknown as Row[], query, {
    searchable: ["code", "officer", "remarks"],
    filterable: ["status", "stage", "loanId", "customerId", "bankId"],
    orderBy: "submittedOn",
  });
}

/* ---------------------------------------------------------- disbursements */

function disbursements(
  id: string,
  method: string,
  query: Query,
  data: DemoDataset,
): unknown {
  if (method !== "GET") {
    // Recording a disbursal needs `disbursements.create`, which an Executive
    // does not hold.
    requirePermission("disbursements.create");
    throw forbidden();
  }
  requirePermission("disbursements.view");

  const rows = data.disbursements.filter(inScope);
  if (id) {
    const row = rows.find((item) => item.id === id || item.code === id);
    if (!row) throw notFound("Disbursement");
    return { data: row };
  }
  return listResponse(rows as unknown as Row[], query, {
    searchable: ["code", "utr", "creditedTo"],
    filterable: ["status", "mode", "loanId", "customerId", "bankId"],
    orderBy: "disbursedOn",
  });
}

/* ----------------------------------------------------------- transactions */

function transactions(
  id: string,
  method: string,
  query: Query,
  data: DemoDataset,
): unknown {
  if (method !== "GET") {
    requirePermission("transactions.create");
    throw forbidden();
  }
  requirePermission("transactions.view");

  const rows = data.transactions.filter(inScope);
  if (id) {
    const row = rows.find((item) => item.id === id || item.code === id);
    if (!row) throw notFound("Transaction");
    return { data: row };
  }
  return listResponse(rows as unknown as Row[], query, {
    searchable: ["code", "reference"],
    filterable: ["status", "txnType", "loanId", "customerId", "bankId"],
    orderBy: "occurredAt",
  });
}

/* -------------------------------------------------------------- documents */

function documents(
  id: string,
  action: string,
  method: string,
  query: Query,
  options: RequestOptions,
  data: DemoDataset,
): unknown {
  /*
   * ── Task 9.6 — TWO DEFECTS FIXED HERE ─────────────────────────────────────
   *
   * The dispatcher used to call this handler WITHOUT the third path segment,
   * and both consequences were real:
   *
   *   1. `GET /documents/:id/content` fell into the branch below, found the row
   *      and returned **200 with the metadata record** — a forged success. The
   *      demo would have appeared to serve file content it does not have,
   *      which is exactly the class of lie this whole block exists to remove.
   *
   *   2. `POST /documents/upload` set `id = "upload"`, so the `!id` guard was
   *      false and control fell through to the delete branch — refusing the
   *      request while citing **`documents.delete`**, a permission the demo
   *      user does not need for an operation they ARE allowed to perform.
   *
   * Both are handled explicitly now, and the content route refuses HONESTLY:
   * the demo holds metadata and no bytes, and says so.
   */
  if (method === "GET" && id && action === "content") {
    requirePermission("documents.view");
    const doc = data.documents.filter(inScope).find((row) => row.id === id);
    if (!doc) throw notFound("Document");
    throw new DemoHttpError(
      501,
      "demo_no_storage",
      "The demo workspace stores document details but not the files themselves, so there is nothing to download.",
    );
  }

  if (method === "GET") {
    requirePermission("documents.view");
    const rows = data.documents.filter(inScope);
    if (id) {
      const doc = rows.find((row) => row.id === id);
      if (!doc) throw notFound("Document");
      return { data: doc };
    }
    return listResponse(rows as unknown as Row[], query, {
      searchable: ["fileName", "docType"],
      filterable: ["status", "docType", "customerId", "loanId", "bankId"],
    });
  }

  // `/documents/upload` arrives with `id === "upload"`, not as a bare POST.
  if (method === "POST" && (!id || id === "upload")) {
    requirePermission("documents.upload");

    /*
     * A multipart upload arrives as FormData, not JSON. The demo records the
     * metadata so the register looks right, and stores **no bytes** —
     * `storageKey` stays null, which is what makes the UI correctly refuse to
     * offer a download rather than pretending one exists.
     */
    const form = options.formData;
    const field = (name: string): string | null => {
      const value = form?.get(name);
      return typeof value === "string" && value ? value : null;
    };
    const file = form?.get("file");
    const input = form ? {} : body(options);

    const bankId = field("bankId") ?? str(input.bankId);
    if (!DEMO_BANK_IDS.includes(bankId)) throw forbidden();

    const uploaded = file instanceof File ? file : null;

    const created = mutateDemoData((store) => {
      store.documents.unshift({
        id: demoId(),
        customerId: field("customerId") ?? nullableStr(input.customerId),
        loanId: field("loanId") ?? nullableStr(input.loanId),
        bankId,
        docType: field("docType") ?? str(input.docType, "Other"),
        fileName: uploaded?.name ?? str(input.fileName, "document.pdf"),
        fileSize: uploaded?.size ?? Number(input.fileSize ?? 0),
        mimeType: uploaded?.type || nullableStr(input.mimeType),
        // No bytes in the demo, so nothing to point at and nothing to hash.
        storageKey: null,
        checksum: null,
        // A new document is always Pending — the demo enforces the same initial
        // status the server does.
        status: "Pending",
        uploadedBy: DEMO_USER_ID,
        verifiedBy: null,
        createdAt: new Date().toISOString(),
      });
    }).documents[0];

    return { data: created };
  }

  /*
   * Verify and reject — Task 9.7.
   *
   * The demo user is an Executive, who holds `documents.upload` and NOT
   * `documents.verify`. Naming the permission the server would actually check
   * is what makes this refusal honest rather than merely a 403.
   */
  if (method === "PATCH" && id) {
    requirePermission("documents.verify");
    throw forbidden();
  }

  // Removing a document needs `documents.delete`.
  requirePermission("documents.delete");
  throw forbidden();
}

/* ---------------------------------------------------------- notifications */

function notifications(
  id: string,
  action: string,
  method: string,
  query: Query,
  data: DemoDataset,
): unknown {
  if (method === "GET" && !id) {
    const rows = [...data.notifications].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    return {
      data: rows,
      meta: { total: rows.length, unread: rows.filter((row) => !row.read).length },
    };
  }

  if (method === "POST" && id === "read-all") {
    mutateDemoData((store) => {
      store.notifications.forEach((row) => {
        row.read = true;
      });
    });
    return undefined;
  }

  if (method === "POST" && id && action === "read") {
    let updated: unknown;
    mutateDemoData((store) => {
      const row = store.notifications.find((item) => item.id === id);
      if (!row) throw notFound("Notification");
      row.read = true;
      updated = row;
    });
    return { data: updated };
  }

  throw notFound("Endpoint");
}

/* ------------------------------------------------------ read-only lookups */

/**
 * A name directory, not user management. It exists so an owner or a team on a
 * record the executive can already open renders as a name instead of a blank.
 * Every write is refused, and the Employees screen stays unreachable.
 */
function users(id: string, method: string, query: Query, data: DemoDataset): unknown {
  if (method !== "GET") {
    requirePermission("users.create");
    throw forbidden();
  }
  if (id) {
    const employee = data.employees.find((row) => row.id === id);
    if (!employee) throw notFound("User");
    return { data: employee };
  }
  return listResponse(data.employees as unknown as Row[], query, {
    searchable: ["name", "email", "employeeCode"],
    filterable: ["status", "roleKey"],
  });
}

function teams(id: string, method: string, query: Query, data: DemoDataset): unknown {
  if (method !== "GET") {
    requirePermission("teams.create");
    throw forbidden();
  }
  if (id) {
    const team = data.teams.find((row) => row.id === id);
    if (!team) throw notFound("Team");
    return { data: team };
  }
  return listResponse(data.teams as unknown as Row[], query, {
    searchable: ["name"],
    filterable: ["status"],
  });
}
