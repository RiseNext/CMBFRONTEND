import { num, type Loan } from "@/lib/types";

/**
 * LOAN EDIT PAYLOAD — Task 5.5
 *
 * `PATCH /api/loans/:id` is a genuine partial update: the route builds its body
 * schema with `patchSchema` rather than `.partial()` (`scoped-resource.ts:388`,
 * BUG-036), so a field the request omits keeps its stored value. **What the form
 * chooses to send is therefore the whole contract**, and the diffing lives here
 * rather than inline in the dialog, where it can be tested on its own — the same
 * split `customer-patch.ts` makes for Task 4.1.
 *
 * The rule: send a key only when its value actually differs from the loan the
 * dialog opened on. Never send the whole form back. Re-sending unchanged values
 * would still be accepted and would silently overwrite whatever a colleague
 * changed since the dialog opened — a data-loss bug wearing a lost-update
 * costume (**D-052**).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SEVEN FIELDS, AND WHY THEY ARE SEVEN — **D-056**
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `PATCH /api/loans/:id` requires `requests.edit`. **Team Leader holds
 * `requests.edit` and does NOT hold `requests.approve`**
 * (`lib/permissions.ts:276-279`), and before Task 5.3 the patch schema kept the
 * status enum — so `PATCH {"status":"Approved"}` succeeded, leaving
 * `approved_by` NULL and auditing the change as *"updated"* rather than
 * *"approved"*. D-056 closed that with `notOnThisRoute()` refusals for `status`
 * and `amountApproved` (`operations.routes.ts:170-178`), which now answer 422.
 *
 * This module is the client's half of the same decision, and it does not merely
 * *decline* to send those fields — **it cannot express them.** `LoanPatch` has
 * exactly seven optional keys and no index signature, so
 * `{ status: "Approved" }` is a compile error at every call site, and
 * `buildLoanPatch`'s return type stops one being spread in later. A regression
 * test (`loan-patch.test.ts`) pins both the type error and the runtime key set.
 *
 * Absent by construction, with the reason for each:
 *
 * | Field | Why not |
 * |---|---|
 * | `status` | Owned by `POST /api/loans/:id/approve`, the single writer (D-056). Refused 422 here. |
 * | `amountApproved` | Part of the approval decision, not an edit. Refused 422 here. |
 * | `customerId`, `bankId` | The customer↔bank pairing is enforced by `assertSameBank`; re-homing a loan is not a profile edit. |
 * | `verificationRequired` | Owned by `POST /api/loans/:id/verification`, which creates the row that must accompany it. |
 * | `assignedUserId`, `assignedTeamId` | Assignment is its own task and its own decision (the customers analogue is D-047/D-048). |
 * | `fundingSourceId` | Belongs to disbursement (Phase 7). |
 * | `emi`, `processingFee`, `commission` | Derived money the product does not compute yet — **D-058** removed the UI claim that an EMI was calculated rather than inventing the arithmetic. |
 * | `applicationNo`, `appliedOn` | Identity and provenance of the filing. |
 *
 * ⚠️ **Numeric columns arrive as strings.** `types.ts` says so at the top:
 * Postgres `numeric` is serialised as a string so no precision is lost, which is
 * why `amountRequested` comes back as `"500000.00"` and `interestRate` as
 * `"13.50"`. Comparing those to the `"500000"` and `"13.5"` an input box holds
 * as **strings** reports a change on every open, and an untouched dialog would
 * PATCH three fields. Every numeric comparison below is therefore made as a
 * `number`.
 */

/** The four priorities the server's enum accepts (`operations.routes.ts:149`). */
export type LoanPriority = Loan["priority"];

export const LOAN_PRIORITIES: readonly LoanPriority[] = ["Low", "Normal", "High", "Urgent"];

/** The seven controls the edit dialog renders, as the strings they bind to. */
export interface LoanEditForm {
  loanType: string;
  /** Rupees, digits only. */
  amountRequested: string;
  /** Percent, may carry decimals. */
  interestRate: string;
  tenureMonths: string;
  priority: LoanPriority;
  /** `<input type="date">` format — `YYYY-MM-DD`, or `""` for none. */
  dueDate: string;
  notes: string;
}

/**
 * The body of a `PATCH /api/loans/:id`.
 *
 * Seven optional keys, no more, and **no index signature** — that is the whole
 * of the guarantee described above. Numbers rather than strings because the
 * route coerces with `z.coerce.number()`; sending the string would work but
 * would leave the client's idea of the value and the server's one parse apart.
 */
export interface LoanPatch {
  loanType?: string;
  amountRequested?: number;
  interestRate?: number;
  tenureMonths?: number;
  priority?: LoanPriority;
  dueDate?: string | null;
  notes?: string | null;
}

/** The schema keys this form has controls for — the `known` list D-031 wants. */
export const LOAN_EDIT_FIELDS = [
  "loanType",
  "amountRequested",
  "interestRate",
  "tenureMonths",
  "priority",
  "dueDate",
  "notes",
] as const;

/**
 * A stored date as an `<input type="date">` value.
 *
 * `due_date` is a `date` column but the API may serialise it either as
 * `"2026-10-15"` or as a full `"2026-10-15T00:00:00.000Z"` timestamp. The first
 * ten characters are the calendar date in both spellings, and taking them as a
 * **string slice** rather than via `new Date()` is deliberate: constructing a
 * Date and reading local getters shifts the day by one for anyone east or west
 * of UTC, which would show a different due date than the one stored and then
 * PATCH the shift back as though the user had chosen it.
 */
export function dateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const candidate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : "";
}

/** Seeds the form from the loaded loan. */
export function formFromLoan(loan: Loan): LoanEditForm {
  return {
    loanType: loan.loanType ?? "",
    // `num()` collapses "500000.00" to 500000, so the box shows what a person
    // would type rather than the column's scale.
    amountRequested: String(num(loan.amountRequested)),
    interestRate: String(num(loan.interestRate)),
    tenureMonths: String(loan.tenureMonths ?? 0),
    priority: loan.priority ?? "Normal",
    dueDate: dateInputValue(loan.dueDate),
    notes: loan.notes ?? "",
  };
}

/**
 * An empty box means "no value", which the API models as `null` — and the
 * client has to say so explicitly. The PATCH path spreads the parsed body, so
 * `""` would land in the column as an empty string rather than being normalised
 * away, exactly as `customer-patch.ts` records for `email`/`address`.
 */
const nullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * A number box's value, or `null` when it does not hold one.
 *
 * ⚠️ **`Number("")` is `0`, not `NaN`** — and so is `Number("   ")`. A bare
 * `Number.isFinite(Number(box))` guard therefore treats a **cleared** amount
 * field as the number zero, and an untouched-but-emptied box would PATCH
 * `amountRequested: 0`, wiping the requested amount of a live loan file with a
 * value the user never typed. The blank check has to come first.
 */
const numeric = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Builds the request body: every field the user actually changed, and nothing
 * else. An unchanged form yields `{}`, which the dialog treats as "nothing to
 * save" rather than issuing a pointless request.
 *
 * A field whose box cannot be read as a number is **left out** rather than sent
 * as `NaN`. In practice `validateLoanForm` refuses the save first; this is the
 * belt to that pair of braces, because `JSON.stringify(NaN)` is `null` and the
 * server would coerce a null amount to a refusal the user could not explain.
 */
export function buildLoanPatch(original: Loan, form: LoanEditForm): LoanPatch {
  const patch: LoanPatch = {};

  const loanType = form.loanType.trim();
  if (loanType !== (original.loanType ?? "")) patch.loanType = loanType;

  // ── numbers, compared as numbers ──────────────────────────────────────────
  // `num()` on the left, `Number()` on the right. "500000.00" === "500000" is
  // false as strings and true here, which is the difference between an
  // untouched dialog sending nothing and one sending three fields.
  const amount = numeric(form.amountRequested);
  if (amount !== null && amount !== num(original.amountRequested)) {
    patch.amountRequested = amount;
  }

  const rate = numeric(form.interestRate);
  if (rate !== null && rate !== num(original.interestRate)) {
    patch.interestRate = rate;
  }

  const tenure = numeric(form.tenureMonths);
  if (tenure !== null && tenure !== Number(original.tenureMonths ?? 0)) {
    patch.tenureMonths = tenure;
  }

  if (form.priority !== (original.priority ?? "Normal")) patch.priority = form.priority;

  // Both sides normalised to `YYYY-MM-DD | null`, so a stored timestamp and a
  // date input agree about the same day.
  const dueDate = nullable(form.dueDate);
  if (dueDate !== (dateInputValue(original.dueDate) || null)) patch.dueDate = dueDate;

  const notes = nullable(form.notes);
  if (notes !== (original.notes ?? null)) patch.notes = notes;

  return patch;
}

/** True when there is nothing to save. */
export const isEmptyPatch = (patch: LoanPatch): boolean => Object.keys(patch).length === 0;

/**
 * Client-side shape checks, mirroring the server's schema so an obvious mistake
 * is caught before a round trip. The server remains the authority — every rule
 * here exists in the loan create schema (`operations.routes.ts:129-152`) too,
 * and a refusal from it is surfaced verbatim (D-031).
 */
export function validateLoanForm(form: LoanEditForm): string | null {
  const loanType = form.loanType.trim();
  if (loanType.length < 2) return "Choose a loan product.";
  if (loanType.length > 80) return "The product name is longer than 80 characters.";

  const amount = Number(form.amountRequested);
  if (form.amountRequested.trim() === "" || !Number.isFinite(amount)) {
    return "Enter the requested amount.";
  }
  if (amount < 0) return "The requested amount cannot be negative.";
  if (amount > 1_000_000_000_000) return "The requested amount is larger than the API accepts.";

  const rate = Number(form.interestRate);
  if (form.interestRate.trim() === "" || !Number.isFinite(rate)) {
    return "Enter the interest rate.";
  }
  if (rate < 0 || rate > 100) return "The interest rate must be between 0 and 100.";

  const tenure = Number(form.tenureMonths);
  if (form.tenureMonths.trim() === "" || !Number.isFinite(tenure)) {
    return "Enter the tenure in months.";
  }
  if (!Number.isInteger(tenure)) return "The tenure must be a whole number of months.";
  if (tenure < 0 || tenure > 600) return "The tenure must be between 0 and 600 months.";

  if (!LOAN_PRIORITIES.includes(form.priority)) return "Choose a priority.";

  // Blank is a legitimate value — it clears the column.
  const dueDate = form.dueDate.trim();
  if (dueDate !== "") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return "Enter the due date as YYYY-MM-DD.";
    if (Number.isNaN(Date.parse(`${dueDate}T00:00:00.000Z`))) return "That due date is not a real date.";
  }

  if (form.notes.trim().length > 2000) return "The note is longer than 2000 characters.";

  return null;
}
