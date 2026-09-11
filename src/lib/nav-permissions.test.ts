/**
 * PERMISSION-AWARE NAVIGATION — Task 12.10.
 *
 * `NavItem` had **no permission field at all**, so all fourteen entries rendered
 * for all five roles. An Executive holds no `reports.view`, `settlements.view`
 * or `recycle_bin.view` and was invited into every one of them.
 *
 * ── WHY THE ROLE GRANTS ARE COPIED IN, RATHER THAN IMPORTED ─────────────────
 *
 * The five permission sets below are transcribed from
 * `backend/src/lib/permissions.ts`'s `DEFAULT_ROLES`. That duplication is
 * deliberate and is the point of the file: if somebody widens a seeded grant,
 * these expectations should have to be re-derived by a human rather than
 * silently following along. The backend's own `frontend-contract.test.ts`
 * already pins that the two permission CATALOGUES agree, so a renamed key fails
 * there instead of quietly emptying a menu here.
 *
 * ── AND WHY GROUP D EXISTS ──────────────────────────────────────────────────
 *
 * Navigation is not security and must never be mistaken for it. Group D asserts
 * the properties that keep that true: nothing in the menu is the only thing
 * standing between a role and a screen, every role keeps a reachable home, and
 * the personal screens are never filtered away.
 */

import { describe, expect, it } from "vitest";
import { navSections, visibleNavSections } from "./nav";

/* ── DEFAULT_ROLES, transcribed ─────────────────────────────────────────── */

const CUSTOMERS = [
  "customers.view",
  "customers.create",
  "customers.edit",
  "customers.delete",
  "customers.import",
  "customers.export",
];
const REQUESTS = [
  "requests.view",
  "requests.create",
  "requests.edit",
  "requests.delete",
  "requests.assign",
  "requests.approve",
  "requests.import",
];
const BANK_ORDERS = [
  "bank_orders.view",
  "bank_orders.create",
  "bank_orders.edit",
  "bank_orders.delete",
];

const SUPER_ADMIN = [
  ...CUSTOMERS,
  ...REQUESTS,
  ...BANK_ORDERS,
  "banks.view",
  "users.view",
  "roles.view",
  "teams.view",
  "verification.view",
  "funding_sources.view",
  "service_providers.view",
  "disbursements.view",
  "settlements.view",
  "transactions.view",
  "ledger.view",
  "documents.view",
  "reports.view",
  // Manager Maintenance — D-095. Super Admin holds `*`, so it holds all three.
  "maintenance.view",
  "maintenance.edit",
  "maintenance.manage_locations",
  "audit_logs.view",
  "recycle_bin.view",
  "settings.view",
  "settings.edit",
  "system.access_all_banks",
  "system.manage_any_user",
];

const ADMIN = [
  ...CUSTOMERS,
  ...REQUESTS,
  ...BANK_ORDERS,
  "banks.view",
  "teams.view",
  "verification.view",
  "funding_sources.view",
  "service_providers.view",
  "disbursements.view",
  "settlements.view",
  "transactions.view",
  "ledger.view",
  "documents.view",
  "reports.view",
  // Admin holds the whole maintenance group, master data included — D-095.
  "maintenance.view",
  "maintenance.edit",
  "maintenance.manage_locations",
  "users.view",
  "roles.view",
  "audit_logs.view",
  "recycle_bin.view",
  "settings.view",
  "settings.edit",
  "system.access_all_banks",
];

const MANAGER = [
  ...CUSTOMERS,
  ...REQUESTS,
  ...BANK_ORDERS,
  "banks.view",
  "users.view",
  "teams.view",
  "teams.assign",
  "verification.view",
  "disbursements.view",
  "settlements.view",
  "transactions.view",
  "ledger.view",
  "ledger.create",
  "documents.view",
  "reports.view",
  /*
   * These are the Manager's own tracking sheets — D-095. View and edit, but NOT
   * `maintenance.manage_locations`: renaming a branch re-labels every historical
   * sheet that resolves through it, so master data stays with Admin.
   */
  "maintenance.view",
  "maintenance.edit",
  "recycle_bin.view",
];

const TEAM_LEADER = [
  "customers.view",
  "customers.create",
  "customers.edit",
  "customers.import",
  "banks.view",
  "users.view",
  "teams.view",
  "requests.view",
  "requests.create",
  "requests.edit",
  "requests.assign",
  "verification.view",
  "bank_orders.view",
  "bank_orders.edit",
  "disbursements.view",
  "settlements.view",
  "transactions.view",
  "documents.view",
  "reports.view",
];

const EXECUTIVE = [
  "customers.view",
  "customers.create",
  "customers.edit",
  "banks.view",
  "requests.view",
  "requests.create",
  "verification.view",
  "bank_orders.view",
  "disbursements.view",
  "transactions.view",
  "documents.view",
];

const ROLES = {
  "Super Admin": SUPER_ADMIN,
  Admin: ADMIN,
  Manager: MANAGER,
  "Team Leader": TEAM_LEADER,
  Executive: EXECUTIVE,
} as const;

const labelsFor = (permissions: readonly string[]) =>
  visibleNavSections(permissions).flatMap((section) => section.items.map((item) => item.label));

const sectionTitles = (permissions: readonly string[]) =>
  visibleNavSections(permissions).map((section) => section.title);

/* ══ A — the catalogue itself ═════════════════════════════════════════════ */

describe("A · every entry declares who may see it", () => {
  it("1. THE FINDING: no nav item is missing a permission decision", async () => {
    // Before 12.10 `NavItem` had no permission field at all. `undefined` would
    // now mean "somebody added an entry and did not think about it"; `null` is
    // an explicit decision that everyone may see it.
    for (const section of navSections) {
      for (const item of section.items) {
        expect(item.permission, `${item.label} has no permission decision`).not.toBeUndefined();
      }
    }
  });

  it("2. the three new administrative screens are in the menu", async () => {
    const hrefs = navSections.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain("/roles");
    expect(hrefs).toContain("/teams");
    expect(hrefs).toContain("/audit-logs");
  });

  it("3. a section that loses every item is dropped, not left as a heading", async () => {
    expect(sectionTitles(EXECUTIVE)).not.toContain("Administration");
  });

  it("4. holding nothing leaves only the personal screens", async () => {
    // Dashboard is the landing route for every session; notifications and
    // settings are gated by identity, not by role.
    expect(labelsFor([]).sort()).toEqual(["Dashboard", "Notifications", "Settings"].sort());
  });
});

/* ══ B — the five seeded roles ════════════════════════════════════════════ */

describe("B · what each role is actually offered", () => {
  it("5. Super Admin sees everything", async () => {
    const all = navSections.flatMap((s) => s.items.map((i) => i.label));
    expect(labelsFor(SUPER_ADMIN).sort()).toEqual(all.sort());
  });

  it("6. Admin sees everything except what it does not hold", async () => {
    const labels = labelsFor(ADMIN);
    expect(labels).toContain("Roles");
    expect(labels).toContain("Audit trail");
    expect(labels).toContain("Recycle bin");
    expect(labels).toContain("Reports");
  });

  it("7. Manager loses Roles and the Audit trail", async () => {
    // Manager holds neither `roles.view` nor `audit_logs.view`.
    const labels = labelsFor(MANAGER);
    expect(labels).not.toContain("Roles");
    expect(labels).not.toContain("Audit trail");
    // …and keeps what it does hold, including Teams via `teams.view`.
    expect(labels).toContain("Teams");
    expect(labels).toContain("Ledger");
    expect(labels).toContain("Recycle bin");
  });

  it("8. Team Leader loses the recycle bin as well", async () => {
    const labels = labelsFor(TEAM_LEADER);
    expect(labels).not.toContain("Recycle bin");
    expect(labels).not.toContain("Ledger");
    expect(labels).not.toContain("Roles");
    expect(labels).toContain("Reports");
    expect(labels).toContain("Employees");
  });

  it("9. THE FINDING: Executive is no longer invited into three dead ends", async () => {
    // Every one of these rendered for an Executive before 12.10, and every one
    // of them answers 403.
    const labels = labelsFor(EXECUTIVE);
    expect(labels).not.toContain("Reports");
    expect(labels).not.toContain("Settlements");
    expect(labels).not.toContain("Recycle bin");
    expect(labels).not.toContain("Ledger");
    expect(labels).not.toContain("Employees");
    expect(labels).not.toContain("Teams");
  });

  it("10. …and still reaches everything it can actually use", async () => {
    const labels = labelsFor(EXECUTIVE);
    for (const expected of [
      "Dashboard",
      "Customers",
      "Loans",
      "Bank orders",
      "Disbursement",
      "Transactions",
      "Documents",
      "Banks",
      "Notifications",
      "Settings",
    ]) {
      expect(labels, `Executive should keep ${expected}`).toContain(expected);
    }
  });

  it("11. the menu narrows monotonically down the hierarchy", async () => {
    // Not a coincidence worth asserting for its own sake — it is a cheap check
    // that no role was given an entry a more senior one lacks.
    const sizes = [SUPER_ADMIN, ADMIN, MANAGER, TEAM_LEADER, EXECUTIVE].map(
      (role) => labelsFor(role).length,
    );
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]!).toBeLessThanOrEqual(sizes[i - 1]!);
    }
  });
});

/* ══ C — the keys are the backend's ═══════════════════════════════════════ */

describe("C · the permission strings are real", () => {
  it("12. every declared permission is `resource.action`, never a role name", async () => {
    for (const section of navSections) {
      for (const item of section.items) {
        if (item.permission == null) continue;
        expect(item.permission, `${item.label}: ${item.permission}`).toMatch(
          /^[a-z_]+\.[a-z_]+$/,
        );
      }
    }
  });

  it("13. no entry is gated on a permission no seeded role holds", async () => {
    // A typo would silently empty the entry for everybody, and nothing else
    // would notice.
    const everyGrant = new Set(Object.values(ROLES).flat());
    for (const section of navSections) {
      for (const item of section.items) {
        if (item.permission == null) continue;
        expect(everyGrant.has(item.permission), `nobody holds ${item.permission}`).toBe(true);
      }
    }
  });
});

/* ══ D — navigation is not security ═══════════════════════════════════════ */

describe("D · the menu is a convenience, and the properties that keep it one", () => {
  it("14. every role keeps a home to land on", async () => {
    for (const [name, permissions] of Object.entries(ROLES)) {
      expect(labelsFor(permissions), `${name} has no Dashboard`).toContain("Dashboard");
    }
  });

  it("15. the personal screens are never filtered away", async () => {
    // A user must always be able to reach their own password and sessions,
    // whatever their role holds.
    for (const [name, permissions] of Object.entries(ROLES)) {
      const labels = labelsFor(permissions);
      expect(labels, `${name} lost Settings`).toContain("Settings");
      expect(labels, `${name} lost Notifications`).toContain("Notifications");
    }
  });

  it("16. filtering removes nothing from the underlying catalogue", async () => {
    // `navSections` is the full list and stays the full list. Hiding an entry
    // does not delete the route, and the route's own guard is what protects it.
    labelsFor(EXECUTIVE);
    expect(navSections.flatMap((s) => s.items).length).toBeGreaterThan(labelsFor(EXECUTIVE).length);
    expect(navSections.some((s) => s.title === "Administration")).toBe(true);
  });

  it("17. an unknown permission grants nothing extra", async () => {
    expect(labelsFor(["not.a.real.permission"]).sort()).toEqual(
      ["Dashboard", "Notifications", "Settings"].sort(),
    );
  });
});
