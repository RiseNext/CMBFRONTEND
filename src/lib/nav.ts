import {
  Banknote,
  Bell,
  Building2,
  FileStack,
  FileText,
  Gauge,
  HandCoins,
  Landmark,
  ListChecks,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";

/**
 * NAVIGATION — Task 12.10.
 *
 * ── WHAT THIS FILE LOOKED LIKE BEFORE ───────────────────────────────────────
 *
 * `NavItem` had **no permission field at all**, so every one of the fourteen
 * entries rendered for every one of the five roles. An Executive holds no
 * `reports.view`, no `settlements.view` and no `recycle_bin.view`, and was
 * offered all three; each one led to a screen that either refused outright or —
 * before the Wave 1 and Wave 3 work — rendered a page of zeroes that looked like
 * a genuinely empty book (U-4, D-049).
 *
 * Interestingly the demo already did this properly: `lib/demo/nav.ts` filters an
 * identically-shaped catalogue against the Executive permission set, and says in
 * its own header that it does so because the administrative sections should be
 * *absent rather than merely disabled*. This is that idea moved to where every
 * real session can use it.
 *
 * ── NAVIGATION IS NOT SECURITY, AND MUST NOT BE MISTAKEN FOR IT ─────────────
 *
 * Hiding a link stops nobody. Every route this menu points at is enforced by the
 * API — `requirePermission` on the backend, and a permission-aware refusal on
 * each screen for anyone who arrives by typing the URL. Removing an entry from
 * this list changes exactly one thing: whether a user is invited into a dead
 * end. That is a usability property, and it is the only claim made for it.
 *
 * So the screens keep their own refusals. `/roles`, `/teams`, `/audit-logs` and
 * the settings panels each render an honest "your role cannot see this" rather
 * than an empty page, and a test asserts they still do. If navigation filtering
 * were load-bearing, deleting it would open a hole; deleting it here only makes
 * the menu noisier.
 *
 * ── THE PERMISSION KEYS ARE THE BACKEND'S OWN ───────────────────────────────
 *
 * Every string below is a key from `backend/src/lib/permissions.ts`, not a role
 * name. `frontend-contract.test.ts` on the backend already pins that the two
 * catalogues agree, so a renamed permission fails there rather than silently
 * emptying somebody's menu.
 */

export interface NavItem {
  label: string;
  href: string;
  icon: typeof Gauge;
  badge?: string;
  /**
   * The permission that earns this entry. `null` means every signed-in user —
   * used only for screens that are genuinely personal (notifications, your own
   * settings and password) and are gated by identity rather than by role.
   */
  permission?: string | null;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      /*
       * The dashboard is not gated. Its figures come from `/api/dashboard/stats`,
       * which needs `reports.view` — but since U-4 the page reports a refusal
       * instead of rendering zeroes, and it is the landing route for every
       * session. Hiding it would leave a role with no home.
       */
      { label: "Dashboard", href: "/dashboard", icon: Gauge, permission: null },
      { label: "Customers", href: "/customers", icon: Users, permission: "customers.view" },
      { label: "Loans", href: "/loans", icon: FileText, permission: "requests.view" },
    ],
  },
  {
    title: "Bank operations",
    items: [
      { label: "Bank orders", href: "/bank-orders", icon: ListChecks, permission: "bank_orders.view" },
      { label: "Disbursement", href: "/disbursement", icon: Banknote, permission: "disbursements.view" },
      { label: "Settlements", href: "/settlements", icon: HandCoins, permission: "settlements.view" },
      { label: "Ledger", href: "/ledger", icon: Receipt, permission: "ledger.view" },
      { label: "Transactions", href: "/transactions", icon: Wallet, permission: "transactions.view" },
    ],
  },
  {
    title: "Records",
    items: [
      { label: "Documents", href: "/documents", icon: FileStack, permission: "documents.view" },
      { label: "Reports", href: "/reports", icon: Landmark, permission: "reports.view" },
      { label: "Banks", href: "/banks", icon: Building2, permission: "banks.view" },
      { label: "Employees", href: "/employees", icon: Users, permission: "users.view" },
    ],
  },
  {
    /* Task 12.1, 12.2 and 12.4 built these three screens. */
    title: "Administration",
    items: [
      { label: "Roles", href: "/roles", icon: ShieldCheck, permission: "roles.view" },
      { label: "Teams", href: "/teams", icon: UsersRound, permission: "teams.view" },
      { label: "Audit trail", href: "/audit-logs", icon: ScrollText, permission: "audit_logs.view" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell, permission: null },
      { label: "Recycle bin", href: "/recycle-bin", icon: Trash2, permission: "recycle_bin.view" },
      /*
       * Not gated on `settings.view`. This screen is also where a user changes
       * their own password and reviews their own sessions, which every role must
       * be able to reach; only the organisation panels inside it are gated.
       */
      { label: "Settings", href: "/settings", icon: Settings, permission: null },
    ],
  },
];

/**
 * The sections a holder of `permissions` should be offered.
 *
 * A section with nothing left in it is dropped rather than rendered as an empty
 * heading — the same rule `lib/demo/nav.ts` applies. Pure and exported so the
 * five-role tests can assert it directly rather than through a rendered sidebar.
 */
export function visibleNavSections(permissions: readonly string[]): NavSection[] {
  const held = new Set(permissions);
  return navSections
    .map((section) => ({
      title: section.title,
      items: section.items.filter(
        (item) => item.permission == null || held.has(item.permission),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export const flatNav = navSections.flatMap((section) => section.items);
