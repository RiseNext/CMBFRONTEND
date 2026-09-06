/**
 * Server validation details → per-field messages.
 *
 * The contract, read off `backend/src/middleware/error-handler.ts:46-55` rather
 * than assumed: a `ZodError` becomes **422** `validation_failed` with
 *
 *     details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
 *
 * so `path` is a **dot-joined** string — `"email"` for a top-level field,
 * `"bankIds.0"` for an array element.
 *
 * `details` is NOT always that shape. The same field carries `{ constraint }`
 * (an object) on a 409 unique violation at `:66-76`, and an arbitrary value for
 * any `AppError` thrown with one at `:57-63`. `ApiError.details` is therefore
 * typed `unknown`, and everything here discriminates on the **shape** rather
 * than on the status or code — anything that is not an array of
 * `{ path, message }` yields no field errors and leaves the caller's existing
 * top-line message untouched.
 */

export interface ServerFieldIssue {
  /** The server's dot-joined path, verbatim. */
  path: string;
  message: string;
}

export interface ServerFieldErrors {
  /** One message per known field — the first the server reported for it. */
  fields: Record<string, string>;
  /** Issues naming something this form does not render. Never discarded. */
  unmapped: ServerFieldIssue[];
}

const NONE: ServerFieldErrors = { fields: {}, unmapped: [] };

const isIssue = (value: unknown): value is ServerFieldIssue =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ServerFieldIssue).path === "string" &&
  typeof (value as ServerFieldIssue).message === "string";

/**
 * The issues a server error carries, or `[]` for every other error shape.
 *
 * Deliberately duck-typed rather than checking `instanceof ApiError`: the guard
 * that matters is the payload's shape, and a 409's `{ constraint }` object must
 * fall through here exactly as a network failure does.
 */
export function serverFieldIssues(err: unknown): ServerFieldIssue[] {
  const details = (err as { details?: unknown } | null | undefined)?.details;
  if (!Array.isArray(details)) return [];
  return details.filter(isIssue);
}

/**
 * Splits a server error's issues into the fields this form actually renders and
 * everything else.
 *
 * `known` is the list of schema keys the form has controls for. A path is
 * matched on its **first segment**, so `bankIds.0` attaches to `bankIds` — the
 * element index is not something the user can act on.
 */
export function serverFieldErrors(err: unknown, known: readonly string[]): ServerFieldErrors {
  const issues = serverFieldIssues(err);
  if (issues.length === 0) return NONE;

  const fields: Record<string, string> = {};
  const unmapped: ServerFieldIssue[] = [];

  for (const issue of issues) {
    const key = issue.path.split(".")[0] ?? "";
    if (key && known.includes(key)) {
      // First one wins: zod can report several issues for one field, and the
      // first is the one the user hits.
      if (!(key in fields)) fields[key] = issue.message;
    } else {
      unmapped.push(issue);
    }
  }

  return { fields, unmapped };
}

/**
 * The dialog-level line to show alongside any field messages.
 *
 * `fallback` is the caller's existing `errorMessage(err, ...)` result, so
 * behaviour is unchanged for every error that carries no usable details — which
 * is what keeps the verbatim 400/403/409 surfacing from Tasks 2.4–2.9 intact.
 *
 * When issues exist but none of them name a rendered field, the server's own
 * words are appended rather than dropped: a 422 about a field this form does not
 * show must still say something specific.
 */
export function formLevelError(
  err: unknown,
  fallback: string,
  known: readonly string[],
): string | null {
  const { fields, unmapped } = serverFieldErrors(err, known);

  if (unmapped.length > 0) {
    return `${fallback} ${unmapped.map((i) => `${i.path}: ${i.message}`).join(" · ")}`;
  }
  // Every issue landed on a field, so the generic line would just be noise.
  if (Object.keys(fields).length > 0) return null;

  return fallback;
}
