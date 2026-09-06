"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Bank, Employee, Team } from "@/lib/types";

/**
 * Reference data — banks, users and teams — is small, changes rarely, and is
 * needed by almost every screen to turn a foreign key into a name. Loading it
 * once here replaces the module-scope lookup helpers the demo used
 * (`bankName(id)`, `employeeName(id)`) with the same call signatures, so the
 * page bodies did not have to be rewritten.
 *
 * Everything is scoped by the API, so a user only ever receives the banks and
 * colleagues they are entitled to see.
 */
interface ReferenceValue {
  banks: Bank[];
  employees: Employee[];
  teams: Team[];
  loading: boolean;
  refresh: () => void;
  bankById: (id: string | null | undefined) => Bank | undefined;
  bankName: (id: string | null | undefined) => string;
  bankShortName: (id: string | null | undefined) => string;
  employeeById: (id: string | null | undefined) => Employee | undefined;
  employeeName: (id: string | null | undefined) => string;
  teamName: (id: string | null | undefined) => string;
}

const ReferenceContext = React.createContext<ReferenceValue | null>(null);

export function ReferenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [banks, setBanks] = React.useState<Bank[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [teams, setTeams] = React.useState<Team[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    if (!user) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setBanks([]);
        setEmployees([]);
        setTeams([]);
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.resolve().then(() => {
      if (!cancelled) setLoading(true);
    });

    // A user without `users.view` still needs bank names, so each request is
    // allowed to fail independently rather than taking the others down.
    const settle = <T,>(promise: Promise<{ data: T[] }>) =>
      promise.then((r) => r.data ?? []).catch(() => [] as T[]);

    /*
     * EVERY request carries an explicit `pageSize` — audit U-7.
     *
     * `/banks` and `/teams` were sent with none, and the factory defaults to
     * **25** (`scoped-resource.ts:307`). A 26th bank was therefore invisible in
     * every selector on every screen, and `bankName()` returned "Unknown" for
     * its rows — a silently wrong lookup table feeding the whole application.
     *
     * 500 is the factory's hard maximum, so this is the most a single request
     * can ask for. Reference data is small and changes rarely, which is why one
     * unpaged fetch is the right shape; if an installation ever exceeds 500
     * banks or teams the honest fix is pagination here, not a larger number.
     */
    Promise.all([
      settle<Bank>(api.list<Bank>("/banks", { pageSize: 500 })),
      settle<Employee>(api.list<Employee>("/users", { pageSize: 500 })),
      settle<Team>(api.list<Team>("/teams", { pageSize: 500 })),
    ])
      .then(([bankRows, userRows, teamRows]) => {
        if (cancelled) return;
        setBanks(bankRows);
        setEmployees(userRows);
        setTeams(teamRows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  const value = React.useMemo<ReferenceValue>(() => {
    const bankMap = new Map(banks.map((b) => [b.id, b]));
    const employeeMap = new Map(employees.map((e) => [e.id, e]));
    const teamMap = new Map(teams.map((t) => [t.id, t]));

    return {
      banks,
      employees,
      teams,
      loading,
      refresh: () => setNonce((n) => n + 1),
      bankById: (id) => (id ? bankMap.get(id) : undefined),
      bankName: (id) => (id ? (bankMap.get(id)?.name ?? "Unassigned") : "Unassigned"),
      bankShortName: (id) =>
        id ? (bankMap.get(id)?.shortName ?? bankMap.get(id)?.name ?? "—") : "—",
      employeeById: (id) => (id ? employeeMap.get(id) : undefined),
      employeeName: (id) => (id ? (employeeMap.get(id)?.name ?? "Unassigned") : "Unassigned"),
      teamName: (id) => (id ? (teamMap.get(id)?.name ?? "—") : "—"),
    };
  }, [banks, employees, teams, loading]);

  return <ReferenceContext.Provider value={value}>{children}</ReferenceContext.Provider>;
}

export function useReference(): ReferenceValue {
  const context = React.useContext(ReferenceContext);
  if (!context) throw new Error("useReference must be used inside ReferenceProvider");
  return context;
}

/* ------------------------------------------------------------------ theme */

type Theme = "light" | "dark";

interface ThemeValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = React.createContext<ThemeValue | null>(null);
export const THEME_STORAGE_KEY = "risenext.theme";

/**
 * Theme is applied by `theme-script.tsx` before paint, so this provider only
 * has to read back what the DOM already reflects. Initialising from
 * `localStorage` here instead would produce a light flash on every load.
 */
/**
 * `theme-script.tsx` has already put the correct class on <html> before paint,
 * so the DOM — not React — is the source of truth on the first render.
 * useSyncExternalStore reads it during hydration without a setState-in-effect
 * and without a mismatch warning.
 */
const subscribeToTheme = () => () => {};
const readTheme = (): Theme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";
const readServerTheme = (): Theme => "light";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const domTheme = React.useSyncExternalStore(subscribeToTheme, readTheme, readServerTheme);
  const [override, setOverride] = React.useState<Theme | null>(null);
  const theme = override ?? domTheme;

  const setTheme = React.useCallback((next: Theme) => {
    setOverride(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private browsing */
    }
  }, []);

  const value = React.useMemo<ThemeValue>(
    () => ({ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
