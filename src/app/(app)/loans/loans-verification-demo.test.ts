/**
 * TASK 5.6 — the verification panel under demo mode.
 *
 * The demo router had **no case for either resource**, so both fell through to
 * its `default` branch (`lib/demo/api.ts:228-235`), which checks
 * `RESOURCE_VIEW_PERMISSION` and then throws `notFound("Resource")`:
 *
 *   - `GET /verifications` — the demo user is an **Executive**, who **holds**
 *     `verification.view` (`backend/src/lib/permissions.ts:305`). The permission
 *     gate therefore *passed* and the request ended in a **404**. The loan
 *     dialog's panel would have shown its load-error state on every loan in the
 *     walkthrough — a failure invented by the demo layer, on a list the role is
 *     entitled to read.
 *
 *   - `GET /service-providers` — the Executive does **not** hold
 *     `service_providers.view`, so this one already answered **403**, and that
 *     403 is *correct*. It stays a 403. What changes is only that the refusal
 *     now comes from a real handler rather than from a fallthrough, so the
 *     envelope is right if the demo role ever gains the grant.
 *
 * The honest demo outcome is therefore a **read-only** verification panel: rows
 * render, the create form is permission-hidden because an Executive has no
 * `verification.create`, and providers are shown by reference because the
 * directory cannot be read. All four are asserted here.
 *
 * This exercises the demo transport directly rather than through React: what is
 * under test is the request layer's answers, and the panel's rendering of them
 * is `loans-verification.test.tsx`'s job.
 */

import { describe, expect, it } from "vitest";
import { DemoHttpError, demoRequest } from "@/lib/demo";
import { DEMO_PERMISSIONS } from "@/lib/demo";
import { buildDemoDataset } from "@/lib/demo/data";
import type { Verification } from "@/lib/types";

type List<T> = { data: T[]; meta?: Record<string, unknown> };

/** The status a demo request failed with, or `null` if it succeeded. */
async function statusOf(call: () => Promise<unknown>): Promise<number | null> {
  try {
    await call();
    return null;
  } catch (error) {
    if (error instanceof DemoHttpError) return error.status;
    throw error;
  }
}

describe("the demo user is the Executive this panel is designed around", () => {
  it("1. holds verification.view", () => {
    expect(DEMO_PERMISSIONS).toContain("verification.view");
  });

  it("2. does NOT hold verification.create, so the create form is correctly hidden", () => {
    expect(DEMO_PERMISSIONS).not.toContain("verification.create");
  });

  it("3. does NOT hold service_providers.view, which is the D-049 case itself", () => {
    expect(DEMO_PERMISSIONS).not.toContain("service_providers.view");
  });
});

describe("GET /verifications answers with rows instead of 404", () => {
  it("4. the list is served, not refused", async () => {
    const body = await demoRequest<List<Verification>>("/verifications", {});

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("5. filtering by loanId returns that loan's record and no other", async () => {
    const dataset = buildDemoDataset();
    const loanId = dataset.verifications[0].loanId;

    const body = await demoRequest<List<Verification>>("/verifications", {
      query: { loanId },
    });

    expect(body.data.length).toBe(1);
    expect(body.data[0].loanId).toBe(loanId);
  });

  it("6. a loan with no verification returns an empty list, not an error", async () => {
    const dataset = buildDemoDataset();
    const covered = new Set(dataset.verifications.map((row) => row.loanId));
    const uncovered = dataset.loans.find((loan) => !covered.has(loan.id));

    // The fixtures deliberately leave loans uncovered so the panel's empty
    // state is reachable in the walkthrough.
    expect(uncovered).toBeTruthy();

    const body = await demoRequest<List<Verification>>("/verifications", {
      query: { loanId: uncovered!.id },
    });
    expect(body.data).toEqual([]);
  });

  it("7. every fixture is shaped the way the loan sub-route writes one", async () => {
    const body = await demoRequest<List<Verification>>("/verifications", {});

    for (const row of body.data) {
      // `handledByBank` is `required ? false : true` on the route
      // (`operations.routes.ts:234`). A fixture that broke the invariant would
      // demonstrate a state the product cannot actually produce.
      expect(row.handledByBank).toBe(!row.required);
      if (row.required) {
        expect(row.requestedAt).toBeTruthy();
      } else {
        expect(row.requestedAt).toBeNull();
        expect(row.status).toBe("Verified");
        expect(row.completedAt).toBeTruthy();
      }
    }
  });

  it("8. a third-party fixture carries a reference, which is what this role can read", async () => {
    const body = await demoRequest<List<Verification>>("/verifications", {});
    const thirdParty = body.data.filter((row) => row.serviceProviderId);

    expect(thirdParty.length).toBeGreaterThan(0);
    for (const row of thirdParty) {
      expect(row.providerReference).toBeTruthy();
    }
  });
});

describe("the writes an Executive may not perform are still refused", () => {
  it("9. POST /loans/:id/verification is 403, not a fabricated success", async () => {
    const dataset = buildDemoDataset();

    const status = await statusOf(() =>
      demoRequest(`/loans/${dataset.loans[0].id}/verification`, {
        method: "POST",
        body: { required: false },
      }),
    );

    expect(status).toBe(403);
  });

  it("10. and it is not a 404 — the path is routed, the permission is what refuses", async () => {
    const dataset = buildDemoDataset();

    const status = await statusOf(() =>
      demoRequest(`/loans/${dataset.loans[0].id}/verification`, {
        method: "POST",
        body: { required: false },
      }),
    );

    expect(status).not.toBe(404);
  });

  it("11. writing a verification directly is refused too", async () => {
    const status = await statusOf(() =>
      demoRequest("/verifications", { method: "POST", body: { required: true } }),
    );

    expect(status).toBe(403);
  });
});

describe("GET /service-providers stays the 403 the real API gives this role", () => {
  it("12. it is refused on the permission, not answered with fixtures", async () => {
    const status = await statusOf(() => demoRequest("/service-providers", {}));

    expect(status).toBe(403);
  });

  it("13. and not with a 404 either — the resource exists, this role may not read it", async () => {
    const status = await statusOf(() => demoRequest("/service-providers", {}));

    expect(status).not.toBe(404);
  });

  it("14. the directory behind the refusal is populated, so 403 means 403", () => {
    // A refusal over an empty list would be indistinguishable from an empty
    // directory the day the demo role changes.
    const dataset = buildDemoDataset();
    expect(dataset.serviceProviders.length).toBeGreaterThan(0);
    expect(dataset.serviceProviders.some((p) => p.status === "Active")).toBe(true);
  });

  it("15. and it contains an Inactive entry, so the Active filter has something to remove", () => {
    const dataset = buildDemoDataset();
    expect(dataset.serviceProviders.some((p) => p.status === "Inactive")).toBe(true);
  });
});
