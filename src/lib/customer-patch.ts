import type { Customer } from "@/lib/types";

/**
 * CUSTOMER EDIT PAYLOAD — Task 4.1
 *
 * `PATCH /api/customers/:id` is a genuine partial update: `patchSchema` rather
 * than `.partial()` (`customers.routes.ts:261`, BUG-036) means a field the
 * request omits keeps its stored value — including the three that carry zod
 * defaults, `monthlyIncome`, `kyc` and `status`. So **what the form chooses to
 * send** is the whole contract, and the diffing lives here rather than inline in
 * the dialog, where it can be tested on its own.
 *
 * The rule: send a key only when its value actually differs from the customer
 * record the dialog opened on. Never send the whole form back. Re-sending
 * unchanged values would still be *accepted* by the API and would silently
 * overwrite anything a colleague changed since the dialog opened — a data-loss
 * bug turned into a lost-update bug (**D-052**).
 */

/** The four fields the edit dialog offers, as the strings the inputs bind to. */
export interface CustomerEditForm {
  name: string;
  mobile: string;
  email: string;
  address: string;
}

/**
 * The body of a `PATCH /api/customers/:id`.
 *
 * Deliberately four keys wide, and every omission is **by construction** rather
 * than merely unset (**D-052**):
 *
 * - **`aadhaar` is forbidden.** `aadhaar: ""` or `null` passes the schema and
 *   `aadhaarFields` (`customers.routes.ts:115-121`) then nulls **both**
 *   `aadhaarHash` and `aadhaarLast4` — irreversibly. The API only ever returns
 *   `aadhaarLast4`, so the field is not round-trippable either: echoing a
 *   masked value back would overwrite the real hash with a mask.
 * - **`assignedUserId` / `assignedTeamId`** belong to Task 4.7, which is itself
 *   decision-blocked (D-047, D-048).
 * - **`bankId`** is a scope-changing operation, not a profile edit.
 */
export interface CustomerPatch {
  name?: string;
  mobile?: string;
  email?: string | null;
  address?: string | null;
}

/** The schema keys this form has controls for — the `known` list D-031 wants. */
export const CUSTOMER_EDIT_FIELDS = ["name", "mobile", "email", "address"] as const;

/** Seeds the form from the loaded customer. */
export function formFromCustomer(customer: Customer): CustomerEditForm {
  return {
    name: customer.name ?? "",
    mobile: customer.mobile ?? "",
    email: customer.email ?? "",
    address: customer.address ?? "",
  };
}

/**
 * An empty box means "no value", which the API models as `null` — and the
 * client has to say so explicitly.
 *
 * `POST` normalises `email: ""` to `null` itself (`customers.routes.ts:228-231`)
 * but `PATCH` spreads `...rest` raw (`:285`) and would write the empty string
 * straight into the column. The asymmetry is recorded in D-052 as a backend
 * finding; **the fix stays on the client**, so clearing a box here nulls the
 * column exactly as creating the customer without one would.
 */
const nullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Builds the request body: every field the user actually changed, and nothing
 * else. An unchanged form yields `{}`, which the dialog treats as "nothing to
 * save" rather than issuing a pointless request.
 */
export function buildCustomerPatch(original: Customer, form: CustomerEditForm): CustomerPatch {
  const patch: CustomerPatch = {};

  // `name` and `mobile` are non-nullable columns and the schema requires them
  // (`name` min 2, `mobile` exactly ten digits), so they are compared as plain
  // strings — a blank one is refused by `validateCustomerForm` before any
  // request rather than being sent as `null`.
  const name = form.name.trim();
  if (name !== (original.name ?? "")) patch.name = name;

  const mobile = form.mobile.trim();
  if (mobile !== (original.mobile ?? "")) patch.mobile = mobile;

  // Unlike the employee endpoint, `customerInput.email` carries no
  // `.toLowerCase()` transform, so the server stores what it is given and the
  // comparison must be case-sensitive too. Lower-casing here would make
  // re-typing an address in a different case look like a no-op while the
  // stored value stayed as it was.
  const email = nullable(form.email);
  if (email !== (original.email ?? null)) patch.email = email;

  const address = nullable(form.address);
  if (address !== (original.address ?? null)) patch.address = address;

  return patch;
}

/** True when there is nothing to save. */
export const isEmptyPatch = (patch: CustomerPatch): boolean => Object.keys(patch).length === 0;

/**
 * Client-side shape checks, mirroring the server's schema so an obvious mistake
 * is caught before a round trip. The server remains the authority — every rule
 * here exists in `customerInput` (`customers.routes.ts:25-68`) too, and a
 * refusal from it is surfaced verbatim.
 */
export function validateCustomerForm(form: CustomerEditForm): string | null {
  if (form.name.trim().length < 2) return "Enter the customer's full name.";
  if (form.name.trim().length > 160) return "The name is longer than 160 characters.";

  if (!/^\d{10}$/.test(form.mobile.trim())) return "Mobile must be 10 digits.";

  // Blank is a legitimate value — it clears the column. Anything else has to
  // look like an address, which is the same thing `z.string().email()` insists
  // on before the server will accept it.
  const email = form.email.trim();
  if (email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address, or leave it blank.";
  }
  if (email.length > 255) return "The email address is longer than 255 characters.";

  if (form.address.trim().length > 400) return "The address is longer than 400 characters.";

  return null;
}
