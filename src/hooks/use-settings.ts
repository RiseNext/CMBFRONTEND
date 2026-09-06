"use client";

import * as React from "react";
import { apiRequest, ApiError, errorMessage } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

/**
 * ORGANISATION SETTINGS — Task 12.6.
 *
 * `app_settings` was dead in the schema and the settings screen's Company tab
 * was a set of uncontrolled inputs whose contents were discarded on every
 * keystroke, under the words "Printed on invoices".
 *
 * ── THE SERVER'S ANSWER IS ADOPTED, NEVER THE REQUEST ───────────────────────
 *
 * `save()` returns the state the server has after the write — the route re-reads
 * every key and returns that, not the body echoed. This hook stores that result
 * and nothing else, so the screen can never show a value the database did not
 * accept (D-026). A rejected save leaves the previous state exactly as it was.
 *
 * The shape is deliberately `Record<string, unknown>`: the key registry lives on
 * the server (`services/settings.ts`), and duplicating it here as a typed
 * interface would give two places to change and one of them to forget.
 */

export type Settings = Record<string, unknown>;

export interface SettingsState {
  settings: Settings;
  loading: boolean;
  /** A non-permission failure, already humanised. */
  error: string | null;
  /** The API refused on permissions — only Super Admin and Admin hold the keys. */
  forbidden: boolean;
  /** Resolves when the SERVER has accepted; rejects with the API's own error. */
  save: (patch: Settings) => Promise<void>;
  reload: () => void;
}

/** `settings["organisation.pan"]` as a string, for a controlled input. */
export const asText = (settings: Settings, key: string): string => {
  const value = settings[key];
  return value === undefined || value === null ? "" : String(value);
};

export function useSettings(enabled = true): SettingsState {
  const { user } = useAuth();
  /*
   * Keyed on the id, not the object. A provider that hands back a fresh `user`
   * literal on every render — which any consumer is entitled to do — would make
   * an effect that depends on the object itself re-fire forever.
   */
  const userId = user?.id ?? null;
  const [settings, setSettings] = React.useState<Settings>({});
  const [loading, setLoading] = React.useState(enabled);
  const [error, setError] = React.useState<string | null>(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    if (!enabled || !userId) {
      void Promise.resolve().then(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    apiRequest<{ data: Settings }>("/settings")
      .then((body) => {
        if (cancelled) return;
        setSettings(body.data ?? {});
        setForbidden(false);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Never leave a previous tenant's values on screen behind a failure.
        setSettings({});
        const denied = err instanceof ApiError && err.status === 403;
        setForbidden(denied);
        setError(denied ? null : errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, userId, nonce]);

  const save = React.useCallback(async (patch: Settings) => {
    const body = await apiRequest<{ data: Settings }>("/settings", {
      method: "PATCH",
      body: patch,
    });
    // Only reached when the server answered 2xx. Anything else throws, and the
    // caller must not report a success it did not get.
    setSettings(body.data ?? {});
  }, []);

  return {
    settings,
    loading,
    error,
    forbidden,
    save,
    reload: React.useCallback(() => setNonce((n) => n + 1), []),
  };
}

/* ------------------------------------------------------------------ sessions */

export interface ActiveSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  /** Self-reported by the browser that signed in. Never parsed into a device. */
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
}

export interface SessionsState {
  sessions: ActiveSession[];
  loading: boolean;
  error: string | null;
  revoke: (id: string) => Promise<void>;
  reload: () => void;
}

/**
 * ACTIVE SESSIONS — Task 12.8.
 *
 * The panel this replaces listed three hardcoded devices dated 2024, each with
 * a sign-out button that raised a success toast and revoked nothing.
 *
 * `revoke` awaits the 204 and then re-reads. It does not remove the row locally
 * first: an optimistic removal would show a session as ended while it was still
 * refreshing, which on a security screen is the one thing that must not happen.
 */
export function useSessions(enabled = true): SessionsState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [sessions, setSessions] = React.useState<ActiveSession[]>([]);
  const [loading, setLoading] = React.useState(enabled);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    if (!enabled || !userId) {
      void Promise.resolve().then(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    apiRequest<{ data: ActiveSession[] }>("/auth/sessions")
      .then((body) => {
        if (cancelled) return;
        setSessions(Array.isArray(body.data) ? body.data : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSessions([]);
        setError(errorMessage(err, "Could not load your sessions"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, userId, nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  const revoke = React.useCallback(
    async (id: string) => {
      await apiRequest<void>(`/auth/sessions/${id}`, { method: "DELETE" });
      reload();
    },
    [reload],
  );

  return { sessions, loading, error, revoke, reload };
}
