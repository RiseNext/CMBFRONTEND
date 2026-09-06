"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  api,
  apiRequest,
  errorMessage,
  onForcedSignOut,
  setAccessToken,
} from "@/lib/api";
import {
  DEMO_SESSION_USER,
  disableDemoMode,
  enableDemoMode,
  isDemoCredentials,
  isDemoMode,
  resetDemoData,
} from "@/lib/demo";

export interface SessionUser {
  id: string;
  name: string;
  email: string;

  phone?: string | null;
  avatarUrl?: string | null;

  role: {
    id: string;
    key: string;
    name: string;
    level: number;
  };

  permissions: string[];
  bankIds: string[] | null;
  unrestrictedBankAccess: boolean;

  /**
   * Set while the account is still on an admin-issued temporary password. The
   * API returns it on the profile, not just on the login response, so a page
   * reload cannot drop the user out of the forced change.
   */
  mustChangePassword?: boolean;
}

interface AuthContextValue {
  user: SessionUser | null;
  ready: boolean;

  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;

  /**
   * Ends a demo session without the sign-out round trip, and reports whether
   * one was actually running. Used by the login screen: arriving there is an
   * explicit request to authenticate, so a demo session left over from earlier
   * in the tab is stale and must not be allowed to intercept the attempt.
   */
  exitDemoSession: () => boolean;

  updateUser: (next: Partial<SessionUser>) => void;

  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

const AUTH_STORAGE_KEY = "risenext-auth-user";

function persistAuthUser(user: SessionUser | null) {
  if (typeof window === "undefined") return;

  // The demo session is held in sessionStorage and must never be cached here,
  // so it cannot outlive the tab it was opened in.
  if (user && isDemoMode()) return;

  if (user) {
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify(user),
    );
  } else {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [ready, setReady] = React.useState(false);

  /*
   * Restore cached user and refresh the server session.
   */
  React.useEffect(() => {
    let cancelled = false;

    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(
          AUTH_STORAGE_KEY,
        );

        if (stored) {
          const parsed = JSON.parse(stored) as SessionUser;

          if (parsed?.id) {
            setUser(parsed);
          }
        }
      } catch {
        // Ignore invalid cached session data.
      }
    }

    (async () => {
      /*
       * Whether this restore is being served by the demo layer is decided
       * synchronously, inside `apiRequest`, at the moment the call is made.
       * If the demo is exited while the call is in flight — which is exactly
       * what the login screen does on mount — the response is a fixture for a
       * session that no longer exists and must be discarded, or it would put
       * the demo user straight back and re-trap the tab (BUG-001).
       */
      const startedInDemo = isDemoMode();

      try {
        const body = await apiRequest<{
          accessToken: string;
          user: SessionUser;
        }>("/auth/refresh", {
          method: "POST",
          skipAuthRetry: true,
        });

        if (cancelled) return;
        // `finally` below still marks the provider ready.
        if (startedInDemo && !isDemoMode()) return;

        setAccessToken(body.accessToken);
        setUser(body.user);
        persistAuthUser(body.user);
      } catch {
        if (!cancelled) {
          setUser(null);
          persistAuthUser(null);
          setAccessToken(null);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Handle forced logout from API layer.
   */
  React.useEffect(
    () =>
      onForcedSignOut(() => {
        // A session ending must not leave the tab in demo mode, or the next
        // sign-in attempt is served fixtures instead of the API (BUG-001).
        disableDemoMode();
        resetDemoData();

        setUser(null);
        persistAuthUser(null);
        setAccessToken(null);

        router.replace("/login");
      }),
    [router],
  );

  /*
   * Login
   */
  const signIn = React.useCallback(
    async (email: string, password: string) => {
      /*
       * The presentation account is matched here, before a request exists.
       * Anything else — including a mistyped demo password — carries on to the
       * real login below unchanged.
       */
      if (isDemoCredentials(email, password)) {
        enableDemoMode();

        setAccessToken(null);
        setUser(DEMO_SESSION_USER);

        // The demo session lives in sessionStorage only; clearing the cached
        // profile also stops a previous real sign-in flashing on reload.
        persistAuthUser(null);

        return;
      }

      /*
       * These are real credentials. A demo flag left over from earlier in this
       * tab would divert the request below into the fixture layer, where
       * `/auth/login` has no handler at all — the sign-in would fail with
       * "Endpoint not found" and the tab would stay trapped (BUG-001 / SEC-001).
       *
       * The clear happens HERE and not at the top of the function: the demo
       * credential check above must run first, or entering the demo would
       * immediately undo itself.
       */
      disableDemoMode();
      resetDemoData();

      const body = await apiRequest<{
        accessToken: string;
        user: SessionUser;
      }>("/auth/login", {
        method: "POST",
        body: {
          email,
          password,
        },
        skipAuthRetry: true,
      });

      setAccessToken(body.accessToken);
      setUser(body.user);
      persistAuthUser(body.user);
    },
    [],
  );

  /*
   * Logout
   */
  const signOut = React.useCallback(async () => {
    if (isDemoMode()) {
      // Nothing to revoke server-side — clear the flag and the fixtures.
      disableDemoMode();
      resetDemoData();

      setAccessToken(null);
      setUser(null);

      router.replace("/login");
      return;
    }

    try {
      await api.action("/auth/logout");
    } catch {
      // Local logout should still happen.
    }

    setAccessToken(null);
    setUser(null);
    persistAuthUser(null);

    router.replace("/login");
  }, [router]);

  /*
   * Leave a demo session without touching the network.
   */
  const exitDemoSession = React.useCallback(() => {
    if (!isDemoMode()) return false;

    disableDemoMode();
    resetDemoData();

    setAccessToken(null);
    setUser(null);

    return true;
  }, []);

  /*
   * Update logged-in user profile.
   */
  const updateUser = React.useCallback(
    (next: Partial<SessionUser>) => {
      setUser((current) => {
        if (!current) return null;

        const merged: SessionUser = {
          ...current,
          ...next,
        };

        persistAuthUser(merged);

        return merged;
      });
    },
    [],
  );

  /*
   * Permission checks.
   */
  const can = React.useCallback(
    (permission: string) =>
      user?.permissions?.includes(permission) ?? false,
    [user],
  );

  const canAny = React.useCallback(
    (...permissions: string[]) =>
      permissions.some(
        (permission) =>
          user?.permissions?.includes(permission) ?? false,
      ),
    [user],
  );

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      signIn,
      signOut,
      exitDemoSession,
      updateUser,
      can,
      canAny,
    }),
    [
      user,
      ready,
      signIn,
      signOut,
      exitDemoSession,
      updateUser,
      can,
      canAny,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider",
    );
  }

  return context;
}

export { errorMessage };
