import { describe, expect, it } from "vitest";
import {
  buildCustomerPatch,
  CUSTOMER_EDIT_FIELDS,
  formFromCustomer,
  isEmptyPatch,
  validateCustomerForm,
  type CustomerEditForm,
} from "@/lib/customer-patch";
import type { Customer } from "@/lib/types";

/**
 * TASK 4.1 — the customer edit payload sends only what changed.
 *
 * `customer-detail-edit.test.tsx` drives the real dialog; this pins the diffing
 * rules on their own, where every branch is cheap to reach.
 *
 * Three failure modes matter and are all covered:
 *   - **sending too much** — re-posting unchanged values is accepted by the API
 *     and silently overwrites whatever a colleague changed since the dialog
 *     opened (D-052);
 *   - **sending an empty string where the API means `null`** — `PATCH` spreads
 *     `...rest` raw, so `""` lands in the column, while `POST` would have
 *     normalised it away;
 *   - **offering a field that must never be sent** — `aadhaar` is destructive
 *     and not round-trippable.
 */

const CUSTOMER: Customer = {
  id: "6b1f2c48-9a30-4d17-8e52-3f0c7b9d1a44",
  code: "CUS-10007",
  bankId: "0d2a7e91-4c66-4b0f-9d31-8a5e2c7f6b10",
  bankReferenceId: "HDFC/2026/00841",
  name: "Meera Nair",
  fatherName: "Raghavan Nair",
  motherName: "Latha Nair",
  dob: "1988-02-11T00:00:00.000Z",
  gender: "Female",
  maritalStatus: "Married",
  occupation: "Pharmacist",
  monthlyIncome: "72000",
  mobile: "9848022222",
  altMobile: null,
  email: "meera.nair@example.com",
  address: "12/4 Nallakunta",
  city: "Hyderabad",
  state: "Telangana",
  pincode: "500044",
  pan: "AWKPN1234C",
  aadhaarLast4: "7781",
  kyc: "Verified",
  cibil: 762,
  accountNo: "50100234567891",
  ifsc: "HDFC0000123",
  branch: "Nallakunta",
  assignedUserId: null,
  assignedTeamId: null,
  status: "Active",
  createdAt: "2026-01-14T06:30:00.000Z",
};

/** The form as the dialog seeds it, with an optional single edit applied. */
const editedTo = (patch: Partial<CustomerEditForm>): CustomerEditForm => ({
  ...formFromCustomer(CUSTOMER),
  ...patch,
});

describe("formFromCustomer", () => {
  it("seeds exactly the four controls the dialog renders", () => {
    expect(formFromCustomer(CUSTOMER)).toEqual({
      name: "Meera Nair",
      mobile: "9848022222",
      email: "meera.nair@example.com",
      address: "12/4 Nallakunta",
    });
  });

  it("renders a null column as an empty box, not the string 'null'", () => {
    const form = formFromCustomer({ ...CUSTOMER, email: null, address: null });
    expect(form.email).toBe("");
    expect(form.address).toBe("");
  });
});

describe("buildCustomerPatch — only what changed", () => {
  it("an untouched form produces an empty patch", () => {
    const patch = buildCustomerPatch(CUSTOMER, formFromCustomer(CUSTOMER));
    expect(patch).toEqual({});
    expect(isEmptyPatch(patch)).toBe(true);
  });

  it("changing only the name sends only the name", () => {
    expect(buildCustomerPatch(CUSTOMER, editedTo({ name: "Meera R Nair" }))).toEqual({
      name: "Meera R Nair",
    });
  });

  it("changing only the mobile sends only the mobile", () => {
    expect(buildCustomerPatch(CUSTOMER, editedTo({ mobile: "9000000000" }))).toEqual({
      mobile: "9000000000",
    });
  });

  it("changing only the address sends only the address", () => {
    expect(buildCustomerPatch(CUSTOMER, editedTo({ address: "7 Banjara Hills" }))).toEqual({
      address: "7 Banjara Hills",
    });
  });

  it("changing two fields sends exactly those two", () => {
    const patch = buildCustomerPatch(
      CUSTOMER,
      editedTo({ name: "Meera R Nair", email: "meera@work.example.com" }),
    );
    expect(patch).toEqual({ name: "Meera R Nair", email: "meera@work.example.com" });
    expect("mobile" in patch).toBe(false);
    expect("address" in patch).toBe(false);
  });

  it("surrounding whitespace alone is not a change", () => {
    expect(buildCustomerPatch(CUSTOMER, editedTo({ name: "  Meera Nair  " }))).toEqual({});
  });

  it("trims the value it does send", () => {
    expect(buildCustomerPatch(CUSTOMER, editedTo({ name: "  Meera R Nair  " }))).toEqual({
      name: "Meera R Nair",
    });
  });

  it("email case IS a change — the customer schema has no toLowerCase transform", () => {
    // Unlike `users`, `customerInput.email` stores what it is given
    // (customers.routes.ts:41), so treating a case change as a no-op would
    // leave the screen and the column disagreeing.
    expect(buildCustomerPatch(CUSTOMER, editedTo({ email: "Meera.Nair@example.com" }))).toEqual({
      email: "Meera.Nair@example.com",
    });
  });
});

describe("buildCustomerPatch — an empty box is null, never an empty string", () => {
  it("clearing the email sends null", () => {
    const patch = buildCustomerPatch(CUSTOMER, editedTo({ email: "" }));
    expect(patch).toEqual({ email: null });
    expect(patch.email).toBeNull();
    expect(patch.email).not.toBe("");
  });

  it("clearing the address sends null", () => {
    const patch = buildCustomerPatch(CUSTOMER, editedTo({ address: "   " }));
    expect(patch).toEqual({ address: null });
    expect(patch.address).toBeNull();
  });

  it("a box that was already empty and is still empty is not sent at all", () => {
    const cleared: Customer = { ...CUSTOMER, email: null, address: null };
    expect(buildCustomerPatch(cleared, formFromCustomer(cleared))).toEqual({});
  });

  it("filling a previously null box sends the value", () => {
    const cleared: Customer = { ...CUSTOMER, email: null };
    const patch = buildCustomerPatch(cleared, {
      ...formFromCustomer(cleared),
      email: "meera@example.com",
    });
    expect(patch).toEqual({ email: "meera@example.com" });
  });
});

describe("buildCustomerPatch — the fields that must never appear", () => {
  const everythingChanged = buildCustomerPatch(CUSTOMER, {
    name: "Someone Else",
    mobile: "9111111111",
    email: "someone@example.com",
    address: "Somewhere",
  });

  it("never sends aadhaar, in any spelling", () => {
    // `aadhaar: ""` or `null` passes the schema and nulls BOTH `aadhaarHash`
    // and `aadhaarLast4` irreversibly (customers.routes.ts:115-121). D-052
    // makes it absent by construction, not merely unset.
    for (const key of ["aadhaar", "aadhaarHash", "aadhaarLast4"]) {
      expect(Object.keys(everythingChanged)).not.toContain(key);
    }
  });

  it("never sends the assignment or bank fields", () => {
    for (const key of ["assignedUserId", "assignedTeamId", "bankId", "bankReferenceId"]) {
      expect(Object.keys(everythingChanged)).not.toContain(key);
    }
  });

  it("never sends the fields no control offers", () => {
    for (const key of ["kyc", "status", "monthlyIncome", "cibil", "pan", "accountNo", "ifsc"]) {
      expect(Object.keys(everythingChanged)).not.toContain(key);
    }
  });

  it("sends at most the four keys the dialog renders", () => {
    expect(Object.keys(everythingChanged).sort()).toEqual([
      "address",
      "email",
      "mobile",
      "name",
    ]);
    expect([...CUSTOMER_EDIT_FIELDS].sort()).toEqual(["address", "email", "mobile", "name"]);
  });
});

describe("validateCustomerForm", () => {
  it("accepts the untouched form", () => {
    expect(validateCustomerForm(formFromCustomer(CUSTOMER))).toBeNull();
  });

  it("refuses a name shorter than the server's minimum of two", () => {
    expect(validateCustomerForm(editedTo({ name: "M" }))).toContain("full name");
  });

  it("refuses a mobile that is not ten digits", () => {
    expect(validateCustomerForm(editedTo({ mobile: "98480" }))).toContain("10 digits");
    expect(validateCustomerForm(editedTo({ mobile: "98480222220" }))).toContain("10 digits");
    expect(validateCustomerForm(editedTo({ mobile: "98480a2222" }))).toContain("10 digits");
  });

  it("refuses an address-shaped-but-not email", () => {
    expect(validateCustomerForm(editedTo({ email: "meera.example.com" }))).toContain(
      "valid email",
    );
  });

  it("accepts a blank email — clearing the column is legitimate", () => {
    expect(validateCustomerForm(editedTo({ email: "" }))).toBeNull();
  });

  it("accepts a blank address", () => {
    expect(validateCustomerForm(editedTo({ address: "" }))).toBeNull();
  });

  it("refuses values longer than the server's column limits", () => {
    expect(validateCustomerForm(editedTo({ name: "M".repeat(161) }))).toContain("160");
    expect(validateCustomerForm(editedTo({ address: "x".repeat(401) }))).toContain("400");
  });
});
