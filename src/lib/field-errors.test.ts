import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { formLevelError, serverFieldErrors, serverFieldIssues } from "@/lib/field-errors";

/**
 * The payloads below are the shapes `backend/src/middleware/error-handler.ts`
 * actually produces, not invented ones:
 *
 *   :46-55  ZodError  → 422 `validation_failed`, details = {path, message}[]
 *                       where path is `i.path.join(".")`
 *   :57-63  AppError  → details = whatever was thrown with it, or undefined
 *   :66-76  23505     → 409 `conflict`, details = { constraint: string }  ← an OBJECT
 *   :77-82  23503     → 409 `conflict`, no details at all
 *
 * The third case is the reason nothing here keys off the status code.
 */

const CREATE_FIELDS = ["name", "email", "employeeCode", "roleId", "bankIds"] as const;

const validation = (details: { path: string; message: string }[]) =>
  new ApiError(422, "validation_failed", "The submitted data is not valid", details);

describe("serverFieldIssues — only the validation shape survives", () => {
  it("reads a real 422 payload", () => {
    const err = validation([{ path: "email", message: "Invalid email" }]);
    expect(serverFieldIssues(err)).toEqual([{ path: "email", message: "Invalid email" }]);
  });

  it("ignores a 409's { constraint } object", () => {
    // The single most likely thing to crash a naive `details.map(...)`.
    const err = new ApiError(409, "conflict", "That record already exists", {
      constraint: "users_email_unique",
    });
    expect(serverFieldIssues(err)).toEqual([]);
  });

  it("ignores an error with no details, and non-errors", () => {
    expect(serverFieldIssues(new ApiError(403, "forbidden", "Nope"))).toEqual([]);
    expect(serverFieldIssues(new Error("network"))).toEqual([]);
    expect(serverFieldIssues(null)).toEqual([]);
    expect(serverFieldIssues(undefined)).toEqual([]);
  });

  it("drops malformed entries but keeps well-formed neighbours", () => {
    const err = new ApiError(422, "validation_failed", "bad", [
      { path: "email", message: "Invalid email" },
      { path: 7, message: "not a path" },
      "nonsense",
      null,
    ]);
    expect(serverFieldIssues(err)).toEqual([{ path: "email", message: "Invalid email" }]);
  });
});

describe("serverFieldErrors — mapping paths onto rendered controls", () => {
  it("maps a single field", () => {
    const err = validation([{ path: "email", message: "Invalid email" }]);
    expect(serverFieldErrors(err, CREATE_FIELDS)).toEqual({
      fields: { email: "Invalid email" },
      unmapped: [],
    });
  });

  it("maps several fields at once", () => {
    const err = validation([
      { path: "email", message: "Invalid email" },
      { path: "name", message: "Too short" },
      { path: "employeeCode", message: "Required" },
    ]);
    const { fields } = serverFieldErrors(err, CREATE_FIELDS);

    expect(fields).toEqual({
      email: "Invalid email",
      name: "Too short",
      employeeCode: "Required",
    });
  });

  it("attaches an indexed path to its parent field", () => {
    // zod reports `bankIds.0` for a bad element; the index is not something the
    // user can act on, so the message belongs on the `bankIds` control.
    const err = validation([{ path: "bankIds.0", message: "Invalid uuid" }]);
    expect(serverFieldErrors(err, CREATE_FIELDS).fields).toEqual({ bankIds: "Invalid uuid" });
  });

  it("keeps the first message when one field has several issues", () => {
    const err = validation([
      { path: "email", message: "Invalid email" },
      { path: "email", message: "Too long" },
    ]);
    expect(serverFieldErrors(err, CREATE_FIELDS).fields.email).toBe("Invalid email");
  });

  it("reports an unrendered field as unmapped rather than dropping it", () => {
    const err = validation([{ path: "avatarColor", message: "Too long" }]);
    const { fields, unmapped } = serverFieldErrors(err, CREATE_FIELDS);

    expect(fields).toEqual({});
    expect(unmapped).toEqual([{ path: "avatarColor", message: "Too long" }]);
  });

  it("splits mapped and unmapped in one response", () => {
    const err = validation([
      { path: "email", message: "Invalid email" },
      { path: "avatarColor", message: "Too long" },
    ]);
    const { fields, unmapped } = serverFieldErrors(err, CREATE_FIELDS);

    expect(fields).toEqual({ email: "Invalid email" });
    expect(unmapped).toEqual([{ path: "avatarColor", message: "Too long" }]);
  });

  it("treats an empty path as unmapped", () => {
    const err = validation([{ path: "", message: "Root problem" }]);
    const { fields, unmapped } = serverFieldErrors(err, CREATE_FIELDS);

    expect(fields).toEqual({});
    expect(unmapped).toHaveLength(1);
  });
});

describe("formLevelError — what stays on the dialog's own line", () => {
  it("keeps the caller's message for an error with no details", () => {
    // The behaviour Tasks 2.4-2.9 rely on: 400/403/409 surfaced verbatim.
    const err = new ApiError(403, "forbidden", "You cannot manage a user at or above your own role level");
    expect(formLevelError(err, "You cannot manage a user at or above your own role level", CREATE_FIELDS)).toBe(
      "You cannot manage a user at or above your own role level",
    );
  });

  it("keeps the caller's message for a 409 constraint object", () => {
    const err = new ApiError(409, "conflict", "That record already exists", {
      constraint: "users_email_unique",
    });
    expect(formLevelError(err, "That record already exists", CREATE_FIELDS)).toBe(
      "That record already exists",
    );
  });

  it("clears the generic line once every issue has a field", () => {
    // "The submitted data is not valid" adds nothing beside a message pinned to
    // the offending control.
    const err = validation([{ path: "email", message: "Invalid email" }]);
    expect(formLevelError(err, "The submitted data is not valid", CREATE_FIELDS)).toBeNull();
  });

  it("appends the server's words when an issue names no rendered field", () => {
    const err = validation([{ path: "avatarColor", message: "Too long" }]);
    const line = formLevelError(err, "Could not create this employee.", CREATE_FIELDS);

    expect(line).toContain("Could not create this employee.");
    expect(line).toContain("avatarColor");
    expect(line).toContain("Too long");
  });

  it("keeps unmapped detail even when other issues did map", () => {
    const err = validation([
      { path: "email", message: "Invalid email" },
      { path: "avatarColor", message: "Too long" },
    ]);
    const line = formLevelError(err, "Could not create this employee.", CREATE_FIELDS);

    expect(line).toContain("avatarColor: Too long");
  });
});
