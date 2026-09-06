/**
 * The single path from the browser to the API.
 *
 * The access token is held in a module variable, never in localStorage. The
 * refresh token is an httpOnly cookie the browser sends automatically and JS
 * cannot read. A 401 triggers one refresh attempt and one replay; a second
 * failure signs the user out rather than looping.
 */

// Through the barrel deliberately, not the files beneath it. `@/lib/demo` is
// the single specifier the bundler swaps for `@/lib/demo-disabled` when the
// demo is built out (`next.config.ts`), so a deep import here would reach past
// the switch and pull the fixtures back into a production bundle.
import {
  DemoHttpError,
  demoRequest,
  isDemoMode,
} from "@/lib/demo";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"
).replace(/\/$/, "");

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
const signOutListeners = new Set<() => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onForcedSignOut(listener: () => void): () => void {
  signOutListeners.add(listener);
  return () => signOutListeners.delete(listener);
}

function forceSignOut(): void {
  accessToken = null;
  signOutListeners.forEach((listener) => listener());
}

/**
 * The ONLY `/auth/*` path the demo layer is allowed to answer.
 *
 * Demo mode restores itself across a page reload by letting `demoRequest`
 * serve `POST /auth/refresh` (`lib/demo/api.ts`), so excluding it would end
 * the demo session on every refresh. Every other authentication path must
 * reach the real backend.
 *
 * This is an allow-list rather than a list of blocked paths, deliberately: it
 * fails closed. A future auth route — the invitation and self-service reset
 * endpoints planned for roadmap Phase 3, for instance — is protected the
 * moment it is added, with no one having to remember to block it.
 *
 * Verified against the demo router: `/auth/logout` and `/auth/me` have demo
 * handlers, but neither is reachable while the demo is active — `signOut`
 * returns before its request, and nothing in the app calls `/auth/me` — so
 * routing them to the network changes no demo behaviour.
 */
const DEMO_SERVED_AUTH_PATHS: ReadonlySet<string> = new Set(["/auth/refresh"]);

/**
 * True for an authentication request that must never be satisfied by fixtures.
 *
 * Demo mode must not be able to turn a real authentication action into a fake
 * one: a stale flag used to divert `POST /auth/login` into the demo layer,
 * which has no handler for it, so the attempt failed with "Endpoint not found"
 * and the tab stayed trapped (BUG-001 / SEC-001).
 */
export function requiresRealBackend(path: string): boolean {
  const route = `/${path}`
    .split("?")[0]
    .split("#")[0]
    // `//auth/login` and `/AUTH/login` must not slip past the prefix test:
    // `demoRequest` drops empty segments and Express routes case-insensitively,
    // so either spelling would otherwise reach the demo while naming a real
    // backend route.
    .replace(/\/{2,}/g, "/")
    .toLowerCase();

  if (!route.startsWith("/auth/")) return false;
  return !DEMO_SERVED_AUTH_PATHS.has(route);
}

/**
 * Error codes that mean the session itself has ended, not that this particular
 * action was refused. Raised only by the backend's per-request session gates
 * (`services/access.ts`), so they arrive on every endpoint at once.
 *
 * Deliberately NOT including `"forbidden"`: that is the code for a missing
 * permission, an out-of-scope record, a hierarchy refusal — and for every 403
 * the demo layer fabricates. Adding it here would sign users out for browsing.
 */
const SESSION_ENDED_CODES: ReadonlySet<string> = new Set(["account_inactive", "role_disabled"]);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the record is missing OR out of the caller's bank scope — the
   *  API deliberately does not distinguish the two. */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let code = "request_failed";
  let message = response.statusText || "Request failed";
  let details: unknown;
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(response.status, code, message, details);
}

async function refreshAccessToken(): Promise<string | null> {
  // Concurrent 401s must share one refresh, or they race and invalidate
  // each other's rotated token.
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { accessToken: string };
      accessToken = body.accessToken;
      return body.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Set for multipart uploads; the body is passed through untouched. */
  formData?: FormData;
  skipAuthRetry?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // The demo account is served entirely from the browser. This is the only
  // branch in the app that diverges: no request is built, no token is attached,
  // and nothing leaves the tab. Normal sessions fall straight through.
  //
  // Authentication is the exception. `requiresRealBackend` keeps real sign-in
  // and password changes on the network even while the demo flag is set — the
  // flag is unsigned `sessionStorage` and can be set by devtools or inherited
  // by a duplicated tab, so it cannot be allowed to decide whether a real
  // credential is checked by a real server.
  if (isDemoMode() && !requiresRealBackend(path)) {
    try {
      return await demoRequest<T>(path, options);
    } catch (error) {
      if (error instanceof DemoHttpError) {
        throw new ApiError(error.status, error.code, error.message);
      }
      throw error;
    }
  }

  const url = new URL(`${API_BASE_URL}/api${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (!options.formData && options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const send = () =>
    fetch(url.toString(), {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
      signal: options.signal,
      body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });

  let response = await send();

  if (response.status === 401 && !options.skipAuthRetry) {
    const token = await refreshAccessToken();
    if (!token) {
      forceSignOut();
      throw new ApiError(401, "unauthorized", "Your session has expired. Please sign in again.");
    }
    headers.Authorization = `Bearer ${token}`;
    response = await send();
    if (response.status === 401) {
      forceSignOut();
      throw new ApiError(401, "unauthorized", "Your session has expired. Please sign in again.");
    }
  }

  if (!response.ok) {
    const error = await parseError(response);

    /*
     * The session is over, as opposed to "you may not do this" (BUG-034).
     *
     * 403 is deliberately overloaded in this API: an Executive opening the
     * dashboard, anyone touching an out-of-scope record, and the demo layer's
     * fabricated refusals all return 403 with `code: "forbidden"`. Signing out
     * on the status alone would log people out for ordinary browsing, so the
     * decision keys on the two codes the backend raises from its per-request
     * session gates (`services/access.ts`) and nothing else — no message
     * matching, no path matching.
     *
     * `getAccessToken()` gates it on there actually being a session to end.
     * `forceSignOut()` clears the token and fires the listeners that redirect
     * to the login page, which is meaningless — and user-visible noise — when
     * no token is held, as on the login screen itself.
     *
     * Note this is defence in depth rather than a live case today: `POST
     * /auth/login` against a deactivated account returns plain `forbidden`
     * (`auth.routes.ts:131-132`), not one of these codes, so it never reaches
     * this branch. The guard exists so that changing login to use the specific
     * codes cannot silently start bouncing the login page. See DECISIONS.md
     * D-020.
     */
    if (SESSION_ENDED_CODES.has(error.code) && getAccessToken()) forceSignOut();

    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface Paginated<T> {
  data: T[];
  meta?: { page: number; pageSize: number; total: number; totalPages: number; scoped?: boolean };
}

export const api = {
  list: <T>(path: string, query?: RequestOptions["query"]) =>
    apiRequest<Paginated<T>>(path, { query }),
  get: <T>(path: string) => apiRequest<{ data: T }>(path),
  create: <T>(path: string, body: unknown) =>
    apiRequest<{ data: T }>(path, { method: "POST", body }),
  update: <T>(path: string, body: unknown) =>
    apiRequest<{ data: T }>(path, { method: "PATCH", body }),
  replace: <T>(path: string, body: unknown) =>
    apiRequest<{ data: T }>(path, { method: "PUT", body }),
  remove: (path: string) => apiRequest<void>(path, { method: "DELETE" }),
  action: <T>(path: string, body?: unknown) =>
    apiRequest<{ data: T }>(path, { method: "POST", body: body ?? {} }),
  upload: <T>(path: string, formData: FormData) =>
    apiRequest<{ data: T }>(path, { method: "POST", formData }),
  /**
   * Document content — Task 9.5.
   *
   * Not `apiRequest`, because this endpoint answers in two shapes: a JSON
   * envelope carrying a short-lived signed URL, or the raw bytes. `apiRequest`
   * parses JSON unconditionally and would choke on a PDF.
   *
   * **Demo mode gets an honest refusal, not a forged success.** The demo
   * dataset holds metadata and no bytes; returning anything here would be a
   * control claiming a capability the demo does not have (D-004). The
   * dispatcher's own `documents` handler used to answer this path with the
   * METADATA ROW and a 200 — because it discarded the third path segment — and
   * that is precisely the defect this avoids.
   */
  content: async (path: string): Promise<{ url?: string; blob?: Blob }> => {
    if (isDemoMode()) {
      throw new ApiError(
        501,
        "demo_no_storage",
        "The demo workspace stores document details but not the files themselves, so there is nothing to download.",
      );
    }

    const url = new URL(`${API_BASE_URL}/api${path.startsWith("/") ? path : `/${path}`}`);
    const token = getAccessToken();
    const res = await fetch(url.toString(), {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      let message = "Could not retrieve that document";
      let code = "request_failed";
      try {
        const body = (await res.json()) as { error?: { message?: string; code?: string } };
        message = body.error?.message ?? message;
        code = body.error?.code ?? code;
      } catch {
        // A non-JSON error body is not worth surfacing verbatim.
      }
      throw new ApiError(res.status, code, message);
    }

    const type = res.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      const body = (await res.json()) as { data?: { url?: string } };
      return { url: body.data?.url };
    }
    return { blob: await res.blob() };
  },
};

/** Turns an unknown thrown value into something safe to show a user. */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}
