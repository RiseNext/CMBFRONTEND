"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Command,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoModeBadge } from "@/components/layout/demo-mode-indicator";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-reference";
import { useResource } from "@/hooks/use-api";
import { useNotifications } from "@/hooks/use-notifications";
import { visibleNavSections } from "@/lib/nav";
import { initials } from "@/lib/utils";
import type { Customer } from "@/lib/types";

/** Keeps the command palette from firing a request on every keystroke. */
function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const debounced = useDebounced(query, 250);
  const handleSignOut = React.useCallback(() => {
    void signOut();
  }, [signOut]);

  // Searches every customer the user is entitled to see, not just a page
  // already loaded into memory.
  const { data: customerMatches } = useResource<Customer>(
    "/customers",
    { search: debounced, pageSize: 5 },
    debounced.trim().length > 1,
  );
  /*
   * Task 10.9 / D-078 — the badge reads the SAME state the notifications page
   * renders. It used to run its own `useResource("/notifications")`, so marking
   * something read on the page left this count stale until an unrelated
   * refetch. Phase 10's third DoD box — "the bell badge and the page agree" —
   * is this line.
   */
  const { unread } = useNotifications();

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needle = query.trim().toLowerCase();
  /*
   * Task 12.10. The palette used `flatNav` — every entry, for every role — so
   * Ctrl+K offered an Executive the Reports and Settlements screens their role
   * is refused on. It is the same menu by another route, so it gets the same
   * filter; the API is still the authority and each screen still refuses
   * honestly when reached by URL.
   */
  const reachable = React.useMemo(
    () => visibleNavSections(user?.permissions ?? []).flatMap((section) => section.items),
    [user],
  );
  const pageMatches = reachable.filter((item) => item.label.toLowerCase().includes(needle));

  function go(href: string) {
    setPaletteOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_92%,transparent)] px-4 backdrop-blur-md md:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
      >
        <Menu className="size-4" />
      </Button>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-left text-sm text-[var(--muted-foreground)] transition-colors hover:border-[var(--ring)]"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate">Search customers, loans, pages</span>
        <span className="hidden items-center gap-0.5 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium sm:flex">
          <Command className="size-3" />K
        </span>
      </button>

      {/* The topbar is `sticky top-0`, so this keeps the signal on screen once
          the page is scrolled past the banner above. */}
      <DemoModeBadge />

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        <Button variant="ghost" size="icon-sm" asChild aria-label="Notifications">
          <Link href="/notifications" className="relative">
            <Bell className="size-4" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 grid size-3.5 place-items-center rounded-full bg-[var(--danger)] text-[9px] font-bold text-white">
                {unread}
              </span>
            )}
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-[var(--secondary)]">
              <Avatar className="size-8">
                <AvatarFallback>{initials(user?.name ?? "?")}</AvatarFallback>
              </Avatar>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[13px] font-semibold">{user?.name}</span>
                <span className="block text-[11px] text-[var(--muted-foreground)]">
                  {user?.role.name ?? ""}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/settings")}>
              <UserRound /> My profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/settings")}>
              <Settings /> Workspace settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSignOut} className="text-[var(--danger)]">
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent className="max-w-xl gap-3 p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>Find customers and pages</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type a customer name, mobile number, or page"
              className="h-11 pl-9"
            />
          </div>
          <div className="max-h-80 space-y-4 overflow-y-auto scrollbar-thin">
            {customerMatches.length > 0 && (
              <div>
                <p className="eyebrow px-1 pb-1.5 text-[var(--muted-foreground)]">Customers</p>
                {customerMatches.map((customer) => (
                  <button
                    key={customer.id}
                    // By `id`, not `code`. The detail route passes this segment
                    // to `GET /api/customers/:id`, which compares it against a
                    // uuid column — a code like `CUS-10001` used to produce a
                    // 500 and open an empty page (BUG-017). The code is still
                    // what the user sees, on the right.
                    onClick={() => go(`/customers/${customer.id}`)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-[var(--secondary)]"
                  >
                    <span>{customer.name}</span>
                    <span className="numeric text-xs text-[var(--muted-foreground)]">
                      {customer.code}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div>
              <p className="eyebrow px-1 pb-1.5 text-[var(--muted-foreground)]">Pages</p>
              {pageMatches.map((item) => (
                <button
                  key={item.href}
                  onClick={() => go(item.href)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-[var(--secondary)]"
                >
                  <item.icon className="size-4 text-[var(--muted-foreground)]" />
                  {item.label}
                </button>
              ))}
              {!pageMatches.length && !customerMatches.length && (
                <p className="px-2 py-6 text-center text-sm text-[var(--muted-foreground)]">
                  Nothing matches that. Try a customer name or a page like &ldquo;ledger&rdquo;.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
