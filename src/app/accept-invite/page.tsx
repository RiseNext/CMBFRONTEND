"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, KeyRound, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/shared/brand-mark";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import { passwordProblems } from "@/lib/password-policy";

/**
 * INVITATION ACCEPTANCE — roadmap task 3.11.
 *
 * The user-facing half of Task 3.5. The backend has been complete and tested
 * since then (`POST /api/auth/accept-invite`, 49 cases); every invitation email
 * has been linking here, and until now it landed on a 404.
 *
 * **The security contract is the hard part, not the form.** `acceptInvitation`
 * answers **one identical refusal** for every unusable token — unknown, expired,
 * already consumed, or belonging to a deleted or deactivated employee (D-038).
 * Distinguishing them would turn a public page into an oracle for which
 * addresses have a pending invitation. So this page may render only two
 * outcomes for a token: it worked, or it did not.
 *
 * That is why the failure branch **discriminates on HTTP status, not on
 * message**:
 *
 *   - **400** is the invitation refusal, and the only status that may say so.
 *     The backend's own single sentence is shown verbatim.
 *   - **422** is the password policy — the token was fine, the password was not.
 *     Saying "invalid invitation" here would be a lie that costs the user their
 *     one working link.
 *   - **429** is the rate limiter (10 per 15 minutes, Task 3.6). Also not the
 *     token's fault.
 *   - **anything else** — 5xx, a network failure — must never be reported as a
 *     bad invitation. The link may be perfectly good.
 *
 * Getting that backwards is the defect this page is most likely to have, so
 * each branch is pinned by its own test.
 */

/** The one thing a visitor may be told about an unusable token. */
const GENERIC_REFUSAL =
  "This invitation link is not valid. It may have expired or already been used.";

type Stage = "form" | "success" | "refused";

export default function AcceptInvitePage() {
  /*
   * `useSearchParams` requires a Suspense boundary — without one Next fails the
   * production build for a statically prerendered client page.
   */
  return (
    <React.Suspense fallback={<Shell>{null}</Shell>}>
      <AcceptInvite />
    </React.Suspense>
  );
}

function AcceptInvite() {
  const params = useSearchParams();
  /*
   * Read during render, held in memory, and sent to exactly one endpoint. It is
   * never rendered, never logged, and never written to storage — it is a
   * one-time credential, not a session.
   */
  const token = (params.get("token") ?? "").trim();

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  /*
   * A link with no token is refused without contacting the server. There is
   * nothing to check, and the refusal is the same one an unusable token gets —
   * so the absence of a token reveals nothing either.
   */
  const [stage, setStage] = React.useState<Stage>(token ? "form" : "refused");

  const problems = password ? passwordProblems(password) : [];
  const mismatch = confirm.length > 0 && password !== confirm;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (!password) return setError("Choose a password.");
    if (problems.length > 0) return setError(`Password ${problems.join(", ")}.`);
    if (password !== confirm) return setError("The two passwords do not match.");

    setSubmitting(true);
    try {
      // 204, no body. Nothing to adopt, and no session is created.
      await apiRequest("/auth/accept-invite", {
        method: "POST",
        body: { token, password },
        skipAuthRetry: true,
      });

      /*
       * Drop the token from the address bar. It is spent, and leaving it there
       * puts a dead credential in browser history and in the referrer of any
       * link the user clicks next.
       */
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname);
      }

      setPassword("");
      setConfirm("");
      setStage("success");
    } catch (err) {
      /*
       * Status, never message-matching. See the note at the top of this file:
       * only a 400 is the invitation itself being unusable.
       */
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
      // 5xx, offline, DNS — the link may be perfectly good. Do not blame it.
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
                Your password is set
              </p>
              <p className="text-[12px] leading-relaxed text-[var(--success)]">
                Sign in with your work email address and the password you just chose.
              </p>
            </div>
          </div>

          {/*
            * Accepting an invitation creates no session — the endpoint answers
            * 204 and nothing else. So this is a link to sign in, not a redirect
            * into the application, which would land on an unauthenticated
            * shell and bounce straight back.
            */}
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
                * or an account that no longer qualifies all land here and read
                * identically — see D-038.
                */}
              <p className="text-[12px] leading-relaxed text-[var(--danger)]">
                {GENERIC_REFUSAL}
              </p>
            </div>
          </div>

          <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">
            Ask an administrator to send you a new invitation.
          </p>

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
        * No name, no email, no employee code. The page has no way to know who
        * the token belongs to, and the endpoint will not say — showing an
        * identity before acceptance would leak exactly what the single refusal
        * exists to protect.
        */}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="ai-password">Choose a password</Label>
          <Input
            id="ai-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            aria-invalid={problems.length > 0 || undefined}
            aria-describedby="ai-password-help"
            autoFocus
          />
          <p id="ai-password-help" className="text-[11px] text-[var(--muted-foreground)]">
            At least 12 characters, with an uppercase letter, a lowercase letter, and a digit.
          </p>
          {password && problems.length > 0 && (
            <p className="text-[11px] text-[var(--danger)]">Password {problems.join(", ")}.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ai-confirm">Confirm password</Label>
          <Input
            id="ai-confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            aria-invalid={mismatch || undefined}
            aria-describedby={mismatch ? "ai-confirm-error" : undefined}
          />
          {mismatch && (
            <p id="ai-confirm-error" className="text-[11px] text-[var(--danger)]">
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
          {submitting ? "Setting your password…" : "Set password"}
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
            <KeyRound className="size-4 text-[var(--primary)]" />
            <h1 className="text-lg font-semibold tracking-tight">Finish setting up your account</h1>
          </div>
          <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">
            Choose the password you will use to sign in. This link works once.
          </p>
        </div>

        {children}
      </div>
    </main>
  );
}
