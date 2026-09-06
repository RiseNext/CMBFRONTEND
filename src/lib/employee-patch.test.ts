import { describe, expect, it } from "vitest";
import {
  buildEmployeePatch,
  formFromEmployee,
  isEmptyPatch,
  validateEmployeeForm,
  type EmployeeEditForm,
} from "@/lib/employee-patch";
import type { Employee } from "@/lib/types";

/**
 * TASK 2.4 — the employee edit payload sends only what changed.
 *
 * `PATCH /api/users/:id` became a genuine partial update when BUG-036 was fixed:
 * an omitted field is left alone, a sent field is written. So the form's choice
 * of keys *is* the contract, and this is where it is pinned.
 *
 * Two failure modes matter and are both covered:
 *   - sending too much — re-posting unchanged values would overwrite whatever a
 *     colleague changed since the dialog opened, and would reactivate a revoked
 *     employee by echoing `status: "Active"` back;
 *   - sending too little — a typed `0` is a real value, and a truthiness check
 *     would silently drop it.
 */

const EMPLOYEE: Employee = {
  id: "8d1f0f5a-4c2e-4b7a-9f61-0f2c9a3b7d10",
  employeeCode: "EMP-1042",
  name: "Anitha Rao",
  email: "anitha.rao@risenext.com",
  phone: "9848011111",
  branch: "Hyderabad",
  status: "Active",
  joinedOn: "2024-04-01T00:00:00.000Z",
  target: 8_000_000,
  achieved: 3_250_000,
  avatarColor: "#1d4ed8",
  lastLoginAt: "2026-08-30T09:00:00.000Z",
  roleId: "1c4b2f90-77a1-4f0e-a0d2-6b9a1e3c5f22",
  roleKey: "executive",
  roleName: "Executive",
  roleLevel: 40,
  assignedBanks: ["b1", "b2"],
  // Task 3.7 added these to Employee; irrelevant to the patch builder, which
  // never sends them.
  invitedAt: null,
  inviteAcceptedAt: null,
};

const INACTIVE: Employee = { ...EMPLOYEE, status: "Inactive" };

/** The form as the dialog seeds it, with an optional single edit applied. */
const editedTo = (patch: Partial<EmployeeEditForm>): EmployeeEditForm => ({
  ...formFromEmployee(EMPLOYEE),
  ...patch,
});

describe("formFromEmployee", () => {
  it("seeds every control from the stored record", () => {
    expect(formFromEmployee(EMPLOYEE)).toEqual({
      name: "Anitha Rao",
      email: "anitha.rao@risenext.com",
      phone: "9848011111",
      employeeCode: "EMP-1042",
      branch: "Hyderabad",
      roleId: EMPLOYEE.roleId,
      status: "Active",
      target: "8000000",
      achieved: "3250000",
    });
  });

  it("renders a null phone or branch as an empty box, not the string 'null'", () => {
    const form = formFromEmployee({ ...EMPLOYEE, phone: null, branch: null });
    expect(form.phone).toBe("");
    expect(form.branch).toBe("");
  });
});

describe("buildEmployeePatch — only what changed", () => {
  it("an untouched form produces an empty patch", () => {
    const patch = buildEmployeePatch(EMPLOYEE, formFromEmployee(EMPLOYEE));
    expect(patch).toEqual({});
    expect(isEmptyPatch(patch)).toBe(true);
  });

  it("changing only the name sends only the name", () => {
    expect(buildEmployeePatch(EMPLOYEE, editedTo({ name: "Anitha R Rao" }))).toEqual({
      name: "Anitha R Rao",
    });
  });

  it("changing only the phone sends only the phone", () => {
    expect(buildEmployeePatch(EMPLOYEE, editedTo({ phone: "9000000000" }))).toEqual({
      phone: "9000000000",
    });
  });

  it("changing only the email sends only the email, lowercased", () => {
    expect(buildEmployeePatch(EMPLOYEE, editedTo({ email: "A.Rao@Risenext.com" }))).toEqual({
      email: "a.rao@risenext.com",
    });
  });

  it("re-typing the same email in a different case is not a change", () => {
    expect(buildEmployeePatch(EMPLOYEE, editedTo({ email: "Anitha.Rao@RISENEXT.com" }))).toEqual(
      {},
    );
  });

  it("changing only the employee code sends only the employee code", () => {
    expect(buildEmployeePatch(EMPLOYEE, editedTo({ employeeCode: "EMP-2042" }))).toEqual({
      employeeCode: "EMP-2042",
    });
  });

  it("changing only the branch sends only the branch", () => {
    expect(buildEmployeePatch(EMPLOYEE, editedTo({ branch: "Bengaluru" }))).toEqual({
      branch: "Bengaluru",
    });
  });

  it("changing only the role sends only roleId", () => {
    expect(buildEmployeePatch(EMPLOYEE, editedTo({ roleId: "role-manager" }))).toEqual({
      roleId: "role-manager",
    });
  });

  it("re-selecting the role the employee already holds sends nothing", () => {
    expect(buildEmployeePatch(EMPLOYEE, editedTo({ roleId: EMPLOYEE.roleId }))).toEqual({});
  });

  it("changing only the status sends only the status", () => {
    expect(buildEmployeePatch(EMPLOYEE, editedTo({ status: "Inactive" }))).toEqual({
      status: "Inactive",
    });
  });

  it("changing only the target sends only the target, as a number", () => {
    const patch = buildEmployeePatch(EMPLOYEE, editedTo({ target: "12000000" }));
    expect(patch).toEqual({ target: 12_000_000 });
    expect(typeof patch.target).toBe("number");
  });

  it("changing only achieved sends only achieved, as a number", () => {
    const patch = buildEmployeePatch(EMPLOYEE, editedTo({ achieved: "4100000" }));
    expect(patch).toEqual({ achieved: 4_100_000 });
    expect(typeof patch.achieved).toBe("number");
  });

  it("sends several keys when several fields changed, and no others", () => {
    const patch = buildEmployeePatch(
      EMPLOYEE,
      editedTo({ name: "Anitha R Rao", phone: "9000000000", target: "9500000" }),
    );
    expect(patch).toEqual({
      name: "Anitha R Rao",
      phone: "9000000000",
      target: 9_500_000,
    });
    expect(Object.keys(patch).sort()).toEqual(["name", "phone", "target"]);
  });

  it("trims whitespace, and whitespace alone is not a change", () => {
    expect(buildEmployeePatch(EMPLOYEE, editedTo({ name: "  Anitha Rao  " }))).toEqual({});
    expect(buildEmployeePatch(EMPLOYEE, editedTo({ name: "  Anitha R Rao  " }))).toEqual({
      name: "Anitha R Rao",
    });
  });
});

describe("buildEmployeePatch — zero is a value, blank is not", () => {
  it("an explicit 0 target is sent", () => {
    const patch = buildEmployeePatch(EMPLOYEE, editedTo({ target: "0" }));
    // A truthiness check would drop this: Number("0") is falsy.
    expect(patch).toEqual({ target: 0 });
    expect(patch.target).toBe(0);
    expect("target" in patch).toBe(true);
  });

  it("an explicit 0 achieved is sent", () => {
    const patch = buildEmployeePatch(EMPLOYEE, editedTo({ achieved: "0" }));
    expect(patch).toEqual({ achieved: 0 });
    expect("achieved" in patch).toBe(true);
  });

  it("a 0 that was already 0 is not re-sent", () => {
    const zeroed: Employee = { ...EMPLOYEE, target: 0, achieved: 0 };
    expect(buildEmployeePatch(zeroed, formFromEmployee(zeroed))).toEqual({});
  });

  it("a blank numeric box means 'leave it alone', not 'set it to zero'", () => {
    const patch = buildEmployeePatch(EMPLOYEE, editedTo({ target: "", achieved: "" }));
    expect(patch).toEqual({});
    expect("target" in patch).toBe(false);
    expect("achieved" in patch).toBe(false);
  });

  it("clearing the phone or branch sends an explicit null", () => {
    const patch = buildEmployeePatch(EMPLOYEE, editedTo({ phone: "", branch: "" }));
    expect(patch).toEqual({ phone: null, branch: null });
  });

  it("an already-null phone left blank is not a change", () => {
    const nullPhone: Employee = { ...EMPLOYEE, phone: null };
    expect(buildEmployeePatch(nullPhone, formFromEmployee(nullPhone))).toEqual({});
  });
});

describe("buildEmployeePatch — a revoked employee is not reactivated by an edit", () => {
  it("editing the name of an Inactive employee does NOT send status", () => {
    /*
     * The exact shape of BUG-036, now at the client boundary. The backend no
     * longer invents `status: "Active"`, and the form must not supply one either.
     */
    const form = { ...formFromEmployee(INACTIVE), name: "Renamed While Revoked" };
    const patch = buildEmployeePatch(INACTIVE, form);

    expect(patch).toEqual({ name: "Renamed While Revoked" });
    expect("status" in patch).toBe(false);
    expect(patch.status).toBeUndefined();
  });

  it("changing every other field on an Inactive employee still never sends status", () => {
    const form: EmployeeEditForm = {
      ...formFromEmployee(INACTIVE),
      name: "New Name",
      email: "new.address@risenext.com",
      phone: "9000000000",
      employeeCode: "EMP-9999",
      branch: "Chennai",
      target: "1",
      achieved: "0",
    };
    const patch = buildEmployeePatch(INACTIVE, form);
    expect("status" in patch).toBe(false);
    expect(Object.keys(patch).sort()).toEqual([
      "achieved",
      "branch",
      "email",
      "employeeCode",
      "name",
      "phone",
      "target",
    ]);
  });

  it("reactivation is possible, but only as a deliberate status change", () => {
    const form = { ...formFromEmployee(INACTIVE), status: "Active" as const };
    expect(buildEmployeePatch(INACTIVE, form)).toEqual({ status: "Active" });
  });
});

describe("buildEmployeePatch — BUG-020 fields are absent by construction", () => {
  it("never emits bankIds, teamId, joinedOn, password or mustChangePassword", () => {
    /*
     * The endpoint parses and then silently discards bankIds, teamId and
     * joinedOn (BUG-020, still open). A control offering them would report a
     * success that never happened. They are not in the form type and cannot
     * reach the body.
     */
    const patch = buildEmployeePatch(
      EMPLOYEE,
      editedTo({ name: "Changed", phone: "9000000000", target: "0", status: "Inactive" }),
    );

    for (const forbidden of [
      "bankIds",
      "teamId",
      "joinedOn",
      "password",
      "mustChangePassword",
      "avatarColor",
    ]) {
      expect(Object.keys(patch)).not.toContain(forbidden);
    }
  });

  it("the form type carries no BUG-020 field to begin with", () => {
    const keys = Object.keys(formFromEmployee(EMPLOYEE)).sort();
    expect(keys).toEqual([
      "achieved",
      "branch",
      "email",
      "employeeCode",
      "name",
      "phone",
      "roleId",
      "status",
      "target",
    ]);
  });
});

describe("validateEmployeeForm", () => {
  it("accepts the untouched form", () => {
    expect(validateEmployeeForm(formFromEmployee(EMPLOYEE))).toBeNull();
  });

  it("rejects an empty or one-character name", () => {
    expect(validateEmployeeForm(editedTo({ name: "" }))).toMatch(/full name/i);
    expect(validateEmployeeForm(editedTo({ name: "A" }))).toMatch(/full name/i);
  });

  it("rejects an address with no @", () => {
    expect(validateEmployeeForm(editedTo({ email: "nope" }))).toMatch(/email/i);
  });

  it("rejects an empty employee code and an empty role", () => {
    expect(validateEmployeeForm(editedTo({ employeeCode: "" }))).toMatch(/employee code/i);
    expect(validateEmployeeForm(editedTo({ roleId: "" }))).toMatch(/role/i);
  });

  it("rejects a negative or fractional number but accepts 0 and blank", () => {
    expect(validateEmployeeForm(editedTo({ target: "-1" }))).toMatch(/whole number/i);
    expect(validateEmployeeForm(editedTo({ achieved: "1.5" }))).toMatch(/whole number/i);
    expect(validateEmployeeForm(editedTo({ target: "0" }))).toBeNull();
    expect(validateEmployeeForm(editedTo({ target: "" }))).toBeNull();
  });
});
