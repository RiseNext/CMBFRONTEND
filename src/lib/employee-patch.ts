import type { Employee } from "@/lib/types";

/**
 * EMPLOYEE EDIT PAYLOAD — Task 2.4
 *
 * `PATCH /api/users/:id` is a genuine partial update: since BUG-036 was fixed
 * (`backend/src/lib/zod.ts`), a field the request omits is left alone, and a
 * field it sends is written. That makes **what the form chooses to send** the
 * whole contract, so the diffing lives here rather than inline in the dialog —
 * it is the part worth testing exhaustively.
 *
 * The rule: send a key only when its value actually differs from the employee
 * record the form was opened on. Never send the whole form back. Re-sending
 * unchanged values would still be *accepted* by the API, but it would silently
 * overwrite anything a colleague changed since this dialog opened, turning a
 * data-loss bug into a lost-update bug.
 */

/** Every field the edit dialog offers, held as the strings the inputs bind to. */
export interface EmployeeEditForm {
  name: string;
  email: string;
  phone: string;
  employeeCode: string;
  branch: string;
  roleId: string;
  status: Employee["status"];
  target: string;
  achieved: string;
}

/**
 * The body of a `PATCH /api/users/:id`.
 *
 * Deliberately narrow. `bankIds`, `teamId` and `joinedOn` are **absent by
 * construction**, not merely unset: the endpoint parses and then silently
 * discards all three (**BUG-020**, still open), so a control offering them
 * would report a success that never happened — exactly the class of defect
 * RULES §4 forbids. `password` and `mustChangePassword` are absent too; issuing
 * a credential is `POST /users/:id/reset-password`'s job, and it is already
 * wired to its own button.
 */
export interface EmployeePatch {
  name?: string;
  email?: string;
  phone?: string | null;
  employeeCode?: string;
  branch?: string | null;
  roleId?: string;
  status?: Employee["status"];
  target?: number;
  achieved?: number;
}

/** Seeds the form from the row the administrator clicked. */
export function formFromEmployee(employee: Employee): EmployeeEditForm {
  return {
    name: employee.name,
    email: employee.email,
    phone: employee.phone ?? "",
    employeeCode: employee.employeeCode,
    branch: employee.branch ?? "",
    roleId: employee.roleId,
    status: employee.status,
    target: String(employee.target),
    achieved: String(employee.achieved),
  };
}

/** An empty text box means "no value", which the API models as `null`. */
const nullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Parses a numeric input.
 *
 * Returns `undefined` for a blank box — "I left this alone", not "set it to
 * zero". A typed `0` is a real value and must survive, so this cannot be a
 * truthiness check: `Number("0")` is `0`, which is falsy, and `|| 0` would
 * conflate an explicit zero with an empty field.
 */
const numeric = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Builds the request body: every field the user actually changed, and nothing
 * else. An unchanged form yields `{}`, which the dialog treats as "nothing to
 * save" rather than issuing a pointless request.
 */
export function buildEmployeePatch(
  original: Employee,
  form: EmployeeEditForm,
): EmployeePatch {
  const patch: EmployeePatch = {};

  const name = form.name.trim();
  if (name !== original.name) patch.name = name;

  // The API lowercases the address itself, so compare on the same footing —
  // retyping the same address in a different case is not a change.
  const email = form.email.trim().toLowerCase();
  if (email !== original.email.trim().toLowerCase()) patch.email = email;

  const employeeCode = form.employeeCode.trim();
  if (employeeCode !== original.employeeCode) patch.employeeCode = employeeCode;

  const phone = nullable(form.phone);
  if (phone !== (original.phone ?? null)) patch.phone = phone;

  const branch = nullable(form.branch);
  if (branch !== (original.branch ?? null)) patch.branch = branch;

  if (form.roleId && form.roleId !== original.roleId) patch.roleId = form.roleId;

  /*
   * Status is the field BUG-036 made dangerous, and it stays explicit here: it
   * is sent only when the administrator actually moved the control. Opening an
   * Inactive employee, fixing a typo in their name and saving must NOT hand
   * their access back.
   */
  if (form.status !== original.status) patch.status = form.status;

  const target = numeric(form.target);
  if (target !== undefined && target !== original.target) patch.target = target;

  const achieved = numeric(form.achieved);
  if (achieved !== undefined && achieved !== original.achieved) patch.achieved = achieved;

  return patch;
}

/** True when there is nothing to save. */
export const isEmptyPatch = (patch: EmployeePatch): boolean =>
  Object.keys(patch).length === 0;

/**
 * Client-side shape checks, mirroring the server's schema so an obvious mistake
 * is caught before a round trip. The server remains the authority — every rule
 * here exists there too, and a refusal from it is surfaced verbatim.
 */
export function validateEmployeeForm(form: EmployeeEditForm): string | null {
  if (form.name.trim().length < 2) return "Enter the employee's full name.";
  if (!form.email.includes("@")) return "Enter a valid work email address.";
  if (form.employeeCode.trim().length < 2) return "Enter an employee code.";
  if (!form.roleId) return "Choose the role this employee should hold.";

  for (const [label, value] of [
    ["Target", form.target],
    ["Achieved", form.achieved],
  ] as const) {
    if (value.trim() === "") continue;
    const parsed = Number(value.trim());
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      return `${label} must be a whole number of rupees, or blank to leave it unchanged.`;
    }
  }

  return null;
}
