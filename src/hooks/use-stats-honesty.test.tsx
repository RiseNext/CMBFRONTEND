/**
 * WAVE 1 / TRACK C — A REFUSAL IS NOT A ZERO (audit U-4)
 *
 * `useStats` used to `.catch(() => setData(null))` and expose only `num()`,
 * which coalesces a null payload to `0`. `/api/dashboard/stats` is gated on
 * `reports.view`, which **Executive does not hold**, so that role's dashboard
 * rendered **₹0 across every tile** — customer counts, disbursed value,
 * commission due — and there was nothing on the screen to distinguish that from
 * a genuinely empty book.
 *
 * That is D-004 (a control claiming an outcome it did not achieve) applied to
 * the numbers the business runs on, and D-049 (honest permission-aware
 * behaviour) applied to a whole page.
 *
 * These cases pin the distinction at the two places it can be lost: the hook
 * that swallowed it, and the component that rendered it.
 *
 * Follows D-012 — `react-dom/client` + React 19 `act`, no component-testing
 * library, `vi.hoisted` for anything the mock factories close over.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getMock: vi.fn(),
  user: { id: "u1", name: "Exec", email: "exec@risenext.test" } as unknown,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, get: h.getMock } };
});

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: h.user }) }));

import { ApiError } from "@/lib/api";
import { useStats } from "@/hooks/use-api";
import { StatCard } from "@/components/shared/stat-card";
import { Users } from "lucide-react";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.getMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Renders a probe that surfaces the whole hook result as text. */
function Probe({ path = "/dashboard/stats" }: { path?: string }) {
  const { num, forbidden, error, loading } = useStats(path);
  return (
    <div>
      <span data-testid="num">{String(num("total_customers"))}</span>
      <span data-testid="forbidden">{String(forbidden)}</span>
      <span data-testid="error">{String(error)}</span>
      <span data-testid="loading">{String(loading)}</span>
    </div>
  );
}

const read = (id: string) =>
  container.querySelector(`[data-testid="${id}"]`)?.textContent ?? "";

async function render(node: React.ReactNode) {
  await act(async () => {
    root.render(node);
  });
  // let the settled promise flush
  await act(async () => {});
}

describe("useStats — a 403 is reported as a refusal, not as zero", () => {
  it("1. THE FINDING: a 403 sets `forbidden`, and does not masquerade as data", async () => {
    h.getMock.mockRejectedValue(new ApiError(403, "forbidden", "Missing required permission"));
    await render(<Probe />);

    expect(read("forbidden")).toBe("true");
    // `num()` still returns 0 — but the caller can now SEE that it is meaningless.
    // Pre-fix, `forbidden` did not exist and 0 was all the caller ever got.
    expect(read("num")).toBe("0");
    expect(read("loading")).toBe("false");
  });

  it("2. a 403 is not reported as a generic error — the two are distinct", async () => {
    h.getMock.mockRejectedValue(new ApiError(403, "forbidden", "Missing required permission"));
    await render(<Probe />);

    expect(read("forbidden")).toBe("true");
    expect(read("error")).toBe("null");
  });

  it("3. a 500 sets `error`, not `forbidden`", async () => {
    h.getMock.mockRejectedValue(new ApiError(500, "internal_error", "Unexpected server error"));
    await render(<Probe />);

    expect(read("forbidden")).toBe("false");
    expect(read("error")).not.toBe("null");
    expect(read("error")).toContain("Unexpected server error");
  });

  it("4. a genuine empty database is NOT flagged — zero must still be able to mean zero", async () => {
    h.getMock.mockResolvedValue({ data: { total_customers: 0 } });
    await render(<Probe />);

    expect(read("num")).toBe("0");
    expect(read("forbidden")).toBe("false");
    expect(read("error")).toBe("null");
  });

  it("5. real figures come through unchanged — the fix is not a regression", async () => {
    h.getMock.mockResolvedValue({ data: { total_customers: 1234 } });
    await render(<Probe />);

    expect(read("num")).toBe("1234");
    expect(read("forbidden")).toBe("false");
  });
});

describe("StatCard — `unavailable` replaces the figure rather than decorating it", () => {
  it("6. an unavailable card renders an em dash, NOT the value it was handed", async () => {
    await render(
      <StatCard
        label="Total customers"
        value="0"
        helper="0 active customers"
        icon={Users}
        unavailable="Your role cannot view reporting figures"
      />,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("—");
    expect(text).toContain("Your role cannot view reporting figures");
    // The helper is suppressed too: "0 active customers" is the same lie in
    // smaller type.
    expect(text).not.toContain("0 active customers");
  });

  it("7. without `unavailable` the card is byte-for-byte its old self", async () => {
    await render(
      <StatCard label="Total customers" value="1,234" helper="900 active customers" icon={Users} />,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("1,234");
    expect(text).toContain("900 active customers");
  });

  it("8. a real zero still renders as 0, not as an em dash", async () => {
    await render(<StatCard label="Total customers" value="0" helper="empty book" icon={Users} />);

    const text = container.textContent ?? "";
    expect(text).toContain("0");
    expect(text).toContain("empty book");
  });
});
