"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/shared/brand-mark";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import { passwordProblems } from "@/lib/password-policy";

/**
 * PASSWORD RESET — roadmap task 3.12.
 *
 * The redeeming half of Task 3.6. `POST /api/auth/reset-password` has been
 * complete and tested since then (43 cases); every reset email has linked here
 * and landed on a 404.
 *
 * **The status-branching rule from D-045 applies unchanged**, because the
 * failure modes are identical in shape: `resetPassword` answers **one identical
 * refusal** for an unknown token, an expired one, an already-consumed one, and
 * one belonging to a deleted or deactivated account (**D-039**). Only a **400**
 * means the link is unusable. A 422 is the password policy, a 429 is the
 * limiter, and a 5xx or a dropped connection is nobody's link being broken —
 * reporting any of those as "your reset link is dead" would send the user back
 * to request another one they do not need, and the one they hold expires in an
 * hour.
 *
 * Deliberately a **separate file** from `/accept-invite` rather than a shared
 * component. The two flows are kept apart on purpose all the way down — a
 * separate table so a reset token cannot be redeemed at `/accept-invite` or the
 * reverse (**D-039**) — and merging their UIs would be the one place that
 * separation could quietly erode.
 */

/** The one thing a visitor may be told about an unusable reset link. */
const GENERIC_REFUSAL =
  "This password reset link is not valid. It may have expired or already been used.";

type Stage = "form" | "success" | "refused";

export default function ResetPasswordPage() {
  // `useSearchParams` needs a Suspense boundary or the production build fails
  // for a statically prerendered client page.
  return (
    <React.Suspense fallback={<Shell>{null}</Shell>}>
      <ResetPassword />
    </React.Suspense>
  );
}

function ResetPassword() {
  const params = useSearchParams();
  /*
   * Read during render, held in memory, sent to exactly one endpoint. Never
   * rendered, never logged, never stored — a one-time bearer credential, not a
   * session.
   */
  const token = (params.get("token") ?? "").trim();

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  /*
   * A link with no token is refused without contacting the server. There is
   * nothing to submit, no token-validation endpoint exists, and inventing one
   * would leak exactly what the single refusal protects.
   */
  const [stage, setStage] = React.useState<Stage>(token ? "form" : "refused");

  const problems = password ? passwordProblems(password) : [];
  const mismatch = confirm.length > 0 && password !== confirm;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (!password) return setError("Choose a new password.");
    if (problems.length > 0) return setError(`Password ${problems.join(", ")}.`);
    if (password !== confirm) return setError("The two passwords do not match.");

    setSubmitting(true);
    try {
      // 204, no body, no session — every existing session is revoked instead.
      await apiRequest("/auth/reset-password", {
        method: "POST",
        body: { token, password },
        skipAuthRetry: true,
      });

      // The token is spent. Leaving it in the address bar puts a dead
      // credential in browser history and in the next referrer.
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname);
      }

      setPassword("");
      setConfirm("");
      setStage("success");
    } catch (err) {
      // Status, never message-matching. See the note at the top of this file.
      if (err instanceof ApiError && err.status === 400) {
        setStage("refused");
        return;
      }
      if (err instanceof ApiError && err.status === 422) {
        setError(errorMessage(err, "That password was not accepted."));
        return;
      }
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Wait a few minutes and try again.");
        return;
      }
      setError("Something went wrong setting your password. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "success") {
    return (
      <Shell>
        <div className="space-y-4" role="status" aria-live="polite">
          <div className="flex items-start gap-3 rounded-lg bg-[var(--success-soft)] px-3 py-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
            <div className="space-y-1">
              <p className="text-[13px] font-semibold text-[var(--success)]">
                Your password has been reset
              </p>
              {/*
                * Task 3.6 revokes every refresh token on completion, so saying
                * "you have been signed out everywhere" is a fact, not a
                * reassurance — and it is the reason someone resetting after a
                * compromise did the right thing.
                */}
              <p className="text-[12px] leading-relaxed text-[var(--success)]">
                You have been signed out on every device. Sign in again with your new password.
              </p>
            </div>
          </div>

          <Button asChild className="w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  if (stage === "refused") {
    return (
      <Shell>
        <div className="space-y-4" role="alert" aria-live="assertive">
          <div className="flex items-start gap-3 rounded-lg bg-[var(--danger-soft)] px-3 py-2.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
            <div className="space-y-1">
              <p className="text-[13px] font-semibold text-[var(--danger)]">
                This link cannot be used
              </p>
              {/*
                * One sentence, for every reason. Expired, already used, unknown,
                * or an account that no longer qualifies all read identically —
                * see D-039.
                */}
              <p className="text-[12px] leading-relaxed text-[var(--danger)]">{GENERIC_REFUSAL}</p>
            </div>
          </div>

          {/*
            * Actionable, and safe: requesting a new link reveals nothing,
            * because `forgot-password` answers identically for every address.
            */}
          <Button asChild className="w-full">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/*
        * No name, no email, no account detail. The page cannot know whose token
        * this is and the endpoint will not say — showing an identity would leak
        * precisely what the single refusal exists to protect.
        */}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="rp-password">New password</Label>
          <Input
            id="rp-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            aria-invalid={problems.length > 0 || undefined}
            aria-describedby="rp-password-help"
            autoFocus
          />
          <p id="rp-password-help" className="text-[11px] text-[var(--muted-foreground)]">
            At least 12 characters, with an uppercase letter, a lowercase letter, and a digit.
          </p>
          {password && problems.length > 0 && (
            <p className="text-[11px] text-[var(--danger)]">Password {problems.join(", ")}.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rp-confirm">Confirm new password</Label>
          <Input
            id="rp-confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            aria-invalid={mismatch || undefined}
            aria-describedby={mismatch ? "rp-confirm-error" : undefined}
          />
          {mismatch && (
            <p id="rp-confirm-error" className="text-[11px] text-[var(--danger)]">
              The two passwords do not match.
            </p>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]"
          >
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Setting your password…" : "Set new password"}
        </Button>
      </form>
    </Shell>
  );
}

/** The public shell — outside the authenticated `(app)` layout, like `/login`. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--navy)] p-6">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-[var(--background)] p-8 shadow-xl">
        <div className="space-y-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[var(--primary)]" />
            <h1 className="text-lg font-semibold tracking-tight">Choose a new password</h1>
          </div>
          <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">
            This link works once, and expires an hour after it was requested.
          </p>
        </div>

        {children}
      </div>
    </main>
  );
}
