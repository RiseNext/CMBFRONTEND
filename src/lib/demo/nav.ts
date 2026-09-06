/**
 * Navigation for the demo employee.
 *
 * Built from the same `NavItem`/`NavSection` shapes and the same icons the
 * production sidebar uses, then filtered against the Executive permission set —
 * so the administrative sections (Employees, Roles, Settlements, Ledger,
 * Reports, Recycle bin) are absent rather than merely disabled. `lib/nav.ts` is
 * untouched, so real users see exactly the navigation they saw before.
 */

import {
  Banknote,
  Bell,
  Building2,
  ClipboardCheck,
  FileStack,
  FileText,
  ListChecks,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import type { NavItem, NavSection } from "@/lib/nav";
import { DEMO_HOME, DEMO_PERMISSIONS } from "./config";

/** A nav item plus the permission that earns it. `null` means always visible. */
interface GatedItem extends NavItem {
  permission: string | null;
}

interface GatedSection {
  title: string;
  items: GatedItem[];
}

const CATALOGUE: GatedSection[] = [
  {
    title: "Overview",
    items: [
      { label: "My work", href: DEMO_HOME, icon: ClipboardCheck, permission: null },
      { label: "Customers", href: "/customers", icon: Users, permission: "customers.view" },
      { label: "Loans", href: "/loans", icon: FileText, permission: "requests.view" },
    ],
  },
  {
    title: "Bank operations",
    items: [
      {
        label: "Bank orders",
        href: "/bank-orders",
        icon: ListChecks,
        permission: "bank_orders.view",
      },
      {
        label: "Disbursement",
        href: "/disbursement",
        icon: Banknote,
        permission: "disbursements.view",
      },
      {
        label: "Transactions",
        href: "/transactions",
        icon: Wallet,
        permission: "transactions.view",
      },
    ],
  },
  {
    title: "Records",
    items: [
      {
        label: "Documents",
        href: "/documents",
        icon: FileStack,
        permission: "documents.view",
      },
      { label: "Banks", href: "/banks", icon: Building2, permission: "banks.view" },
    ],
  },
  {
    title: "Account",
    items: [
      // Neither screen is permission-gated in this application: notifications
      // are addressed to the signed-in user and settings is their own profile.
      { label: "Notifications", href: "/notifications", icon: Bell, permission: null },
      { label: "Settings", href: "/settings", icon: Settings, permission: null },
    ],
  },
];

export const demoNavSections: NavSection[] = CATALOGUE.map((section) => ({
  title: section.title,
  items: section.items
    .filter((item) => item.permission === null || DEMO_PERMISSIONS.includes(item.permission))
    .map(({ label, href, icon }) => ({ label, href, icon })),
})).filter((section) => section.items.length > 0);
