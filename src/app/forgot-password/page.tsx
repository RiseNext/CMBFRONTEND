"use client";

import * as React from "react";
import Link from "next/link";
import { MailCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/shared/brand-mark";
import { ApiError, apiRequest } from "@/lib/api";

/**
 * REQUEST A PASSWORD RESET — roadmap task 3.12.
 *
 * **Why this page is part of 3.12 and not scope creep.** The roadmap row builds
 * `/reset-password`, which redeems a link. Phase 3's Definition of Done box 2
 * is *"A user who forgets their password can recover it **unaided**."* Until
 * now the only way to obtain a reset link was for `POST
 * /api/auth/forgot-password` to be called — and it had **zero product callers**.
 * `/login`'s "Forgot password?" control was a toast reading *"Contact your
 * administrator to have your password reset."*
 *
 * So without this page `/reset-password` is a door nobody can reach, and box 2
 * stays unmet no matter how good the redeeming half is. See D-046.
 *
 * **The enumeration risk lives here, not on the redeeming page.** The endpoint
 * answers **204 for every address** — unknown, soft-deleted, deactivated,
 * disabled role, even a mail provider outage — and its logs are
 * enumeration-safe too. That guarantee is worth nothing if this screen says
 * *"we sent a reset email to that address"*, because the absence of that
 * sentence for a different address is the oracle. So the confirmation is
 * **conditional and identical for every input**, and it is shown on 204 only —
 * never optimistically, and never after a failure.
 */

type Stage = "form" | "requested";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [stage, setStage] = React.useState<Stage>("form");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    /*
     * Format only. This is not an existence check and must never become one —
     * it is the same validation the server's zod schema applies, mirrored so
     * the user is told about a typo without a round trip.
     */
    if (!email.trim()) return setError("Enter your work email address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setError("Enter a valid email address.");
    }

    setSubmitting(true);
    try {
      await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: { email: email.trim().toLowerCase() },
        skipAuthRetry: true,
      });

      setStage("requested");
    } catch (err) {
      /*
       * A 204 is the ONLY path to the confirmation. Anything else is reported
       * as a failure — telling someone a link is on its way when the request
       * never landed would be a false success (D-004), and they would sit
       * waiting for an email that was never attempted.
       *
       * A 422 here is a malformed address, which is about the input and not
       * about whether an account exists — safe to surface.
       */
      if (err instanceof ApiError && err.status === 422) {
        setError("Enter a valid email address.");
        return;
      }
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many requests. Wait a few minutes and try again.");
        return;
      }
      setError("Something went wrong sending the request. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "requested") {
    return (
      <Shell>
        <div className="space-y-4" role="status" aria-live="polite">
          <div className="flex items-start gap-3 rounded-lg bg-[var(--info-soft)] px-3 py-2.5">
            <MailCheck className="mt-0.5 size-4 shrink-0 text-[var(--info)]" />
            <div className="space-y-1">
              <p className="text-[13px] font-semibold text-[var(--info)]">Check your inbox</p>
              {/*
                * Conditional, and identical for every address that could be
                * typed here. It does not name the address back, does not say a
                * message was sent, and reads the same whether or not an account
                * exists — which is the whole point.
                */}
              <p className="text-[12px] leading-relaxed text-[var(--info)]">
                If that address belongs to an active account, a reset link is on its way. The link
                works once and expires in an hour.
              </p>
            </div>
          </div>

          <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">
            Nothing arrived? Check spam, then ask an administrator to reset your password directly.
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
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="fp-email">Work email address</Label>
          <Input
            id="fp-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            placeholder="name@risenext.com"
            aria-describedby="fp-email-help"
            autoFocus
          />
          <p id="fp-email-help" className="text-[11px] text-[var(--muted-foreground)]">
            We will send a reset link if this address belongs to an active account.
          </p>
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
          {submitting ? "Sending…" : "Send reset link"}
        </Button>

        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Back to sign in</Link>
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
            <h1 className="text-lg font-semibold tracking-tight">Reset your password</h1>
          </div>
          <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">
            Enter your work email address and we will send you a link to choose a new password.
          </p>
        </div>

        {children}
      </div>
    </main>
  );
}
