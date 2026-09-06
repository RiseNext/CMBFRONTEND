import { describe, expect, it } from "vitest";
import {
  buildLoanPatch,
  dateInputValue,
  formFromLoan,
  isEmptyPatch,
  LOAN_EDIT_FIELDS,
  LOAN_PRIORITIES,
  validateLoanForm,
  type LoanEditForm,
  type LoanPatch,
} from "@/lib/loan-patch";
import { num, type Loan } from "@/lib/types";

/**
 * TASK 5.5 — the loan edit payload sends only what changed, and can never send
 * `status` or `amountApproved`.
 *
 * `loans-edit-dialog.test.tsx` drives the real dialog; this pins the diffing
 * rules on their own, where every branch is cheap to reach.
 *
 * Four failure modes matter here, and each has a group:
 *
 *   - **the numeric-string trap (group B).** Postgres `numeric` is serialised as
 *     a string, so `amountRequested` arrives as `"2500000.00"` and
 *     `interestRate` as `"9.25"` (`types.ts:49`). An input box holds
 *     `"2500000"`. Compared as strings those differ, so an *untouched* dialog
 *     would PATCH three money fields on every open — the exact lost-update
 *     defect D-052 describes, fired by doing nothing at all.
 *   - **sending too much (group C).** Re-posting unchanged values is accepted by
 *     the API and silently overwrites whatever a colleague changed since the
 *     dialog opened.
 *   - **sending `""` where the API means `null` (group D).** PATCH spreads the
 *     parsed body, so an empty string lands in the column.
 *   - **offering a field that must never be sent (group E).** `status` through
 *     PATCH was a **privilege bypass**: Team Leader holds `requests.edit` and
 *     not `requests.approve`, so `PATCH {"status":"Approved"}` was an approval
 *     by a role that may not approve, with `approved_by` left NULL and the audit
 *     row reading *"updated"* (**D-056**). The route now answers 422; group E
 *     asserts the client cannot even form the request, at runtime and at compile
 *     time.
 */

const LOAN: Loan = {
  id: "7c4e1a90-2b6d-4f08-9a31-5e07b3c2d811",
  code: "LN-11042",
  applicationNo: "APP-4471",
  customerId: "3f8b21c4-9d0e-4a77-b512-6ce4a8f01d93",
  bankId: "0d2a7e91-4c66-4b0f-9d31-8a5e2c7f6b10",
  loanType: "Home Loan",
  // Deliberately at the column's scale, which is NOT what a text box holds.
  amountRequested: "2500000.00",
  amountApproved: "0.00",
  interestRate: "9.25",
  tenureMonths: 240,
  emi: "0.00",
  processingFee: "0.00",
  commission: "0.00",
  status: "Under Review",
  appliedOn: "2026-08-02T09:00:00.000Z",
  verificationRequired: false,
  fundingSourceId: null,
  assignedUserId: null,
  assignedTeamId: null,
  priority: "Normal",
  dueDate: "2026-10-15T00:00:00.000Z",
  notes: "Awaiting salary slips",
  createdAt: "2026-08-02T09:00:00.000Z",
  updatedAt: "2026-08-02T09:00:00.000Z",
};

/** The form as the dialog seeds it, with an optional single edit applied. */
const editedTo = (patch: Partial<LoanEditForm>): LoanEditForm => ({
  ...formFromLoan(LOAN),
  ...patch,
});

/* ------------------------------------------------------------------ group A */

describe("A — formFromLoan seeds the seven controls the dialog renders", () => {
  it("1. produces exactly the seven editable fields, and no others", () => {
    expect(Object.keys(formFromLoan(LOAN)).sort()).toEqual([...LOAN_EDIT_FIELDS].sort());
  });

  it("2. seeds each one from the record", () => {
    expect(formFromLoan(LOAN)).toEqual({
      loanType: "Home Loan",
      amountRequested: "2500000",
      interestRate: "9.25",
      tenureMonths: "240",
      priority: "Normal",
      dueDate: "2026-10-15",
      notes: "Awaiting salary slips",
    });
  });

  it("3. a numeric column's scale is not shown in the box", () => {
    // "2500000.00" is how the column serialises; "2500000" is what a person
    // would type, and what must come back unchanged if they type nothing.
    expect(LOAN.amountRequested).toBe("2500000.00");
    expect(formFromLoan(LOAN).amountRequested).toBe("2500000");
  });

  it("4. a null column becomes an empty box, not the string 'null'", () => {
    const form = formFromLoan({ ...LOAN, notes: null, dueDate: null });
    expect(form.notes).toBe("");
    expect(form.dueDate).toBe("");
  });

  it("5. a date-only dueDate is taken as-is", () => {
    expect(formFromLoan({ ...LOAN, dueDate: "2027-01-31" }).dueDate).toBe("2027-01-31");
  });

  it("6. a timestamp dueDate is sliced, never re-zoned through Date", () => {
    // Reading local getters off `new Date("...T00:00:00.000Z")` shifts the day
    // for anyone west of UTC, which would display — and then save — a date the
    // user never chose.
    expect(formFromLoan({ ...LOAN, dueDate: "2026-10-15T00:00:00.000Z" }).dueDate).toBe(
      "2026-10-15",
    );
    expect(formFromLoan({ ...LOAN, dueDate: "2026-01-01T18:30:00.000Z" }).dueDate).toBe(
      "2026-01-01",
    );
  });
});

describe("A2 — dateInputValue", () => {
  it("7. answers '' for every absent spelling", () => {
    expect(dateInputValue(null)).toBe("");
    expect(dateInputValue(undefined)).toBe("");
    expect(dateInputValue("")).toBe("");
  });

  it("8. refuses to guess at a value it does not recognise", () => {
    expect(dateInputValue("15/10/2026")).toBe("");
    expect(dateInputValue("not a date")).toBe("");
  });
});

/* ------------------------------------------------------------------ group B */

describe("B — numeric columns are compared as numbers, not as strings", () => {
  it("9. an untouched form produces an EMPTY patch", () => {
    const patch = buildLoanPatch(LOAN, formFromLoan(LOAN));
    expect(patch).toEqual({});
    expect(isEmptyPatch(patch)).toBe(true);
  });

  it("10. the strings really do differ — which is what makes test 9 meaningful", () => {
    // If this ever stops being true the trap has moved, not gone away.
    const form = formFromLoan(LOAN);
    expect(form.amountRequested).not.toBe(LOAN.amountRequested);
    expect(Number(form.amountRequested)).toBe(num(LOAN.amountRequested));
  });

  it("11. '9.25' and '9.250000' are the same rate", () => {
    const original = { ...LOAN, interestRate: "9.250000" };
    expect(buildLoanPatch(original, formFromLoan(original))).toEqual({});
  });

  it("12. a trailing-zero amount is not a change", () => {
    const original = { ...LOAN, amountRequested: "500000.00" };
    expect(buildLoanPatch(original, { ...formFromLoan(original), amountRequested: "500000" })).toEqual(
      {},
    );
  });

  it("13. a real amount change is sent, as a NUMBER", () => {
    const patch = buildLoanPatch(LOAN, editedTo({ amountRequested: "2400000" }));
    expect(patch).toEqual({ amountRequested: 2400000 });
    expect(typeof patch.amountRequested).toBe("number");
  });

  it("14. a real rate change is sent, as a number", () => {
    const patch = buildLoanPatch(LOAN, editedTo({ interestRate: "9.5" }));
    expect(patch).toEqual({ interestRate: 9.5 });
    expect(typeof patch.interestRate).toBe("number");
  });

  it("15. a real tenure change is sent, as a number", () => {
    const patch = buildLoanPatch(LOAN, editedTo({ tenureMonths: "180" }));
    expect(patch).toEqual({ tenureMonths: 180 });
    expect(typeof patch.tenureMonths).toBe("number");
  });

  it("16. zero is a value, not an absence", () => {
    const patch = buildLoanPatch(LOAN, editedTo({ interestRate: "0" }));
    expect(patch).toEqual({ interestRate: 0 });
  });

  it("17. a CLEARED amount box sends nothing — it must not be read as zero", () => {
    /*
     * The trap, caught by this test while it was being written: `Number("")` is
     * **0**, not `NaN`. A bare `Number.isFinite(Number(box))` guard therefore
     * accepts an emptied field as the number zero, and clearing the box while
     * intending to retype would PATCH `amountRequested: 0` — wiping the
     * requested amount of a live loan file with a value nobody typed.
     */
    expect(Number("")).toBe(0);

    const patch = buildLoanPatch(LOAN, editedTo({ amountRequested: "" }));
    expect(patch).not.toHaveProperty("amountRequested");
    expect(patch).toEqual({});
  });

  it("18. the same holds for a whitespace-only box, and for the other two numbers", () => {
    expect(Number("   ")).toBe(0);

    expect(buildLoanPatch(LOAN, editedTo({ amountRequested: "   " }))).toEqual({});
    expect(buildLoanPatch(LOAN, editedTo({ interestRate: "" }))).toEqual({});
    expect(buildLoanPatch(LOAN, editedTo({ tenureMonths: "" }))).toEqual({});
  });

  it("19. an unreadable box is left out rather than sent as NaN", () => {
    // `JSON.stringify(NaN)` is `null`, which the route would coerce into a
    // refusal the user could not connect to anything they typed.
    const patch = buildLoanPatch(LOAN, editedTo({ amountRequested: "1,00,000" }));
    expect(patch).not.toHaveProperty("amountRequested");
    expect(JSON.stringify(patch)).not.toContain("null");
  });
});

/* ------------------------------------------------------------------ group C */

describe("C — only what changed, one field at a time", () => {
  it("20. changing only the product sends only the product", () => {
    expect(buildLoanPatch(LOAN, editedTo({ loanType: "Business Loan" }))).toEqual({
      loanType: "Business Loan",
    });
  });

  it("21. changing only the priority sends only the priority", () => {
    expect(buildLoanPatch(LOAN, editedTo({ priority: "Urgent" }))).toEqual({ priority: "Urgent" });
  });

  it("22. changing only the due date sends only the due date", () => {
    expect(buildLoanPatch(LOAN, editedTo({ dueDate: "2026-12-01" }))).toEqual({
      dueDate: "2026-12-01",
    });
  });

  it("23. changing only the notes sends only the notes", () => {
    expect(buildLoanPatch(LOAN, editedTo({ notes: "Docs received" }))).toEqual({
      notes: "Docs received",
    });
  });

  it("24. changing three fields sends exactly those three", () => {
    const patch = buildLoanPatch(
      LOAN,
      editedTo({ priority: "High", tenureMonths: "120", notes: "Escalated" }),
    );
    expect(patch).toEqual({ priority: "High", tenureMonths: 120, notes: "Escalated" });
    expect("loanType" in patch).toBe(false);
    expect("amountRequested" in patch).toBe(false);
    expect("interestRate" in patch).toBe(false);
    expect("dueDate" in patch).toBe(false);
  });

  it("25. surrounding whitespace alone is not a change", () => {
    expect(
      buildLoanPatch(LOAN, editedTo({ loanType: "  Home Loan  ", notes: "  Awaiting salary slips  " })),
    ).toEqual({});
  });

  it("26. a change IS trimmed before it is sent", () => {
    expect(buildLoanPatch(LOAN, editedTo({ notes: "  Docs received  " }))).toEqual({
      notes: "Docs received",
    });
  });

  it("27. every editable field can be changed, and all seven travel together", () => {
    const patch = buildLoanPatch(
      LOAN,
      editedTo({
        loanType: "Gold Loan",
        amountRequested: "900000",
        interestRate: "11",
        tenureMonths: "24",
        priority: "Urgent",
        dueDate: "2027-03-31",
        notes: "Rework with a new lender",
      }),
    );
    expect(Object.keys(patch).sort()).toEqual([...LOAN_EDIT_FIELDS].sort());
  });
});

/* ------------------------------------------------------------------ group D */

describe("D — an empty box means null, and says so explicitly", () => {
  it("28. clearing the notes sends null, not an empty string", () => {
    const patch = buildLoanPatch(LOAN, editedTo({ notes: "" }));
    expect(patch).toEqual({ notes: null });
    expect(patch.notes).not.toBe("");
  });

  it("29. clearing the due date sends null", () => {
    expect(buildLoanPatch(LOAN, editedTo({ dueDate: "" }))).toEqual({ dueDate: null });
  });

  it("30. a whitespace-only box is a cleared box", () => {
    expect(buildLoanPatch(LOAN, editedTo({ notes: "   " }))).toEqual({ notes: null });
  });

  it("31. an already-null column left empty is not a change", () => {
    const original = { ...LOAN, notes: null, dueDate: null };
    expect(buildLoanPatch(original, formFromLoan(original))).toEqual({});
  });

  it("32. filling a previously-null column sends the new value", () => {
    const original = { ...LOAN, notes: null, dueDate: null };
    const patch = buildLoanPatch(original, {
      ...formFromLoan(original),
      notes: "First note",
      dueDate: "2027-01-31",
    });
    expect(patch).toEqual({ notes: "First note", dueDate: "2027-01-31" });
  });
});

/* ------------------------------------------------------------------ group E */

describe("E — D-056: status and amountApproved can never be sent", () => {
  /**
   * Every payload this module can produce, from a spread of originals and a
   * spread of edits. The assertions below run over all of them at once, so a
   * new field added to `buildLoanPatch` without a decision is caught here rather
   * than in production.
   */
  const everyPatch = (): LoanPatch[] => {
    const originals: Loan[] = [
      LOAN,
      { ...LOAN, status: "Approved", amountApproved: "2400000.00" },
      { ...LOAN, status: "Rejected", notes: null, dueDate: null },
      { ...LOAN, status: "Draft", priority: "Urgent" },
    ];

    const edits: Partial<LoanEditForm>[] = [
      {},
      { loanType: "Gold Loan" },
      { amountRequested: "1" },
      { amountRequested: "" },
      { interestRate: "0" },
      { tenureMonths: "600" },
      { priority: "Low" },
      { priority: "Urgent" },
      { dueDate: "" },
      { dueDate: "2030-01-01" },
      { notes: "" },
      { notes: "changed" },
      {
        loanType: "Vehicle Loan",
        amountRequested: "12345",
        interestRate: "7.75",
        tenureMonths: "12",
        priority: "High",
        dueDate: "2028-06-30",
        notes: "everything at once",
      },
    ];

    return originals.flatMap((original) =>
      edits.map((edit) => buildLoanPatch(original, { ...formFromLoan(original), ...edit })),
    );
  };

  it("33. no generated payload carries `status` — in any of 52 combinations", () => {
    const patches = everyPatch();
    expect(patches.length).toBe(52);
    for (const patch of patches) {
      expect(patch).not.toHaveProperty("status");
      expect(JSON.stringify(patch)).not.toContain("status");
    }
  });

  it("34. no generated payload carries `amountApproved`", () => {
    for (const patch of everyPatch()) {
      expect(patch).not.toHaveProperty("amountApproved");
      expect(JSON.stringify(patch)).not.toContain("amountApproved");
    }
  });

  it("35. an original that IS approved still yields no status and no approved amount", () => {
    // The case the bypass needed: a loan whose stored status is interesting.
    const approved: Loan = { ...LOAN, status: "Approved", amountApproved: "2400000.00" };
    const patch = buildLoanPatch(approved, { ...formFromLoan(approved), notes: "post-sanction" });
    expect(patch).toEqual({ notes: "post-sanction" });
  });

  it("36. every key ever produced is one of the seven D-056 allows", () => {
    for (const patch of everyPatch()) {
      for (const key of Object.keys(patch)) {
        expect(LOAN_EDIT_FIELDS).toContain(key);
      }
    }
  });

  it("37. none of the twelve fields owned by another route ever appears", () => {
    const forbidden = [
      "status",
      "amountApproved",
      "customerId",
      "bankId",
      "verificationRequired",
      "assignedUserId",
      "assignedTeamId",
      "fundingSourceId",
      "emi",
      "processingFee",
      "commission",
      "applicationNo",
      "appliedOn",
    ];
    for (const patch of everyPatch()) {
      for (const field of forbidden) {
        expect(patch).not.toHaveProperty(field);
      }
    }
  });

  it("38. and the TYPE refuses them too — these lines fail `tsc` if LoanPatch widens", () => {
    /*
     * `@ts-expect-error` is the assertion: if `LoanPatch` ever gained a `status`
     * key — or an index signature — the directive would become unused and
     * `npm run typecheck` would fail with "Unused '@ts-expect-error' directive".
     * That is a compile-time proof, which no runtime test can give.
     */
    // @ts-expect-error `status` is not a member of LoanPatch (D-056)
    const withStatus: LoanPatch = { status: "Approved" };
    // @ts-expect-error `amountApproved` is not a member of LoanPatch (D-056)
    const withAmountApproved: LoanPatch = { amountApproved: 2400000 };
    // @ts-expect-error `assignedUserId` belongs to the assignment task
    const withAssignee: LoanPatch = { assignedUserId: "someone" };

    // Referenced so the declarations are not merely dead code.
    expect([withStatus, withAmountApproved, withAssignee]).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ group F */

describe("F — isEmptyPatch", () => {
  it("39. an empty object is nothing to save", () => {
    expect(isEmptyPatch({})).toBe(true);
  });

  it("40. a null-valued key is still something to save", () => {
    // Clearing a column is a change, and the dialog must issue the request.
    expect(isEmptyPatch({ notes: null })).toBe(false);
    expect(isEmptyPatch({ dueDate: null })).toBe(false);
  });

  it("41. a zero is something to save", () => {
    expect(isEmptyPatch({ interestRate: 0 })).toBe(false);
  });
});

/* ------------------------------------------------------------------ group G */

describe("G — validateLoanForm mirrors the server's schema", () => {
  const valid = formFromLoan(LOAN);

  it("42. the seeded form is valid", () => {
    expect(validateLoanForm(valid)).toBeNull();
  });

  it("43. a product name shorter than the server's minimum is refused", () => {
    expect(validateLoanForm({ ...valid, loanType: "A" })).toBe("Choose a loan product.");
    expect(validateLoanForm({ ...valid, loanType: "  " })).toBe("Choose a loan product.");
  });

  it("44. a product name longer than 80 characters is refused", () => {
    expect(validateLoanForm({ ...valid, loanType: "L".repeat(81) })).toContain("80 characters");
  });

  it("45. an empty amount is refused before any request", () => {
    expect(validateLoanForm({ ...valid, amountRequested: "" })).toBe("Enter the requested amount.");
  });

  it("46. an amount past the API's ceiling is refused", () => {
    expect(validateLoanForm({ ...valid, amountRequested: "2000000000000" })).toContain(
      "larger than the API accepts",
    );
  });

  it("47. a rate outside 0–100 is refused, as `z.coerce.number().min(0).max(100)` would", () => {
    expect(validateLoanForm({ ...valid, interestRate: "101" })).toContain("between 0 and 100");
    expect(validateLoanForm({ ...valid, interestRate: "-1" })).toContain("between 0 and 100");
    expect(validateLoanForm({ ...valid, interestRate: "" })).toBe("Enter the interest rate.");
  });

  it("48. a fractional tenure is refused — the column is an integer", () => {
    expect(validateLoanForm({ ...valid, tenureMonths: "12.5" })).toContain("whole number");
  });

  it("49. a tenure past 600 months is refused", () => {
    expect(validateLoanForm({ ...valid, tenureMonths: "601" })).toContain("between 0 and 600");
  });

  it("50. a blank due date is legitimate — it clears the column", () => {
    expect(validateLoanForm({ ...valid, dueDate: "" })).toBeNull();
  });

  it("51. a malformed due date is refused", () => {
    expect(validateLoanForm({ ...valid, dueDate: "15/10/2026" })).toContain("YYYY-MM-DD");
  });

  it("52. a note past 2000 characters is refused", () => {
    expect(validateLoanForm({ ...valid, notes: "n".repeat(2001) })).toContain("2000 characters");
    expect(validateLoanForm({ ...valid, notes: "n".repeat(2000) })).toBeNull();
  });

  it("53. every priority the server's enum accepts is accepted here", () => {
    for (const priority of LOAN_PRIORITIES) {
      expect(validateLoanForm({ ...valid, priority })).toBeNull();
    }
  });
});
