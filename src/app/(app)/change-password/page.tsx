"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, errorMessage } from "@/lib/api";
import { passwordProblems } from "@/lib/password-policy";
import { toast } from "sonner";

/**
 * Exchange of a temporary password for one the employee chooses.
 *
 * `POST /auth/change-password` deliberately revokes every refresh token for the
 * account, so a successful change ends the current session too. Rather than
 * leaving the user on a page whose session has just been invalidated, the sign
 * out is made explicit and they are returned to the login screen.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const forced = Boolean(user?.mustChangePassword);
  const problems = next ? passwordProblems(next) : [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!current) return setError("Enter your current password.");
    if (problems.length > 0) return setError(`Password ${problems.join(", ")}.`);
    if (next !== confirm) return setError("The two new passwords do not match.");
    if (next === current) return setError("Choose a password you have not used already.");

    setSaving(true);
    try {
      await apiRequest("/auth/change-password", {
        method: "POST",
        body: { currentPassword: current, newPassword: next },
        skipAuthRetry: true,
      });

      toast.success("Password updated", {
        description: "Sign in again with your new password.",
      });
      await signOut();
      router.replace("/login");
    } catch (err) {
      setError(errorMessage(err, "Could not update your password."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Account security"
        title={forced ? "Choose your password" : "Change your password"}
        description={
          forced
            ? "You are signed in with a temporary password issued by an administrator. Set your own password to continue."
            : "Changing your password signs you out of every device, including this one."
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="New password"
          description="At least 12 characters, with an uppercase letter, a lowercase letter, and a digit"
          className="lg:col-span-2"
        >
          <form onSubmit={submit} className="max-w-md space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cp-current">
                {forced ? "Temporary password" : "Current password"}
              </Label>
              <Input
                id="cp-current"
                type="password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-new">New password</Label>
              <Input
                id="cp-new"
                type="password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                autoComplete="new-password"
              />
              {next && problems.length > 0 && (
                <p className="text-[11px] text-[var(--danger)]">
                  Password {problems.join(", ")}.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-confirm">Confirm new password</Label>
              <Input
                id="cp-confirm"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                {error}
              </p>
            )}

            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              <KeyRound className="size-4" />
              {saving ? "Updating…" : "Update password"}
            </Button>
          </form>
        </SectionCard>

        <SectionCard title="Why you are here" description="Account protection">
          <ul className="space-y-3 text-[13px] leading-relaxed text-[var(--muted-foreground)]">
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
              Your password is stored as an irreversible hash. Nobody, including an administrator,
              can read it back.
            </li>
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
              A temporary password is known to whoever created your account, which is why it has to
              be replaced before you start work.
            </li>
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
              Updating it ends every other signed-in session on your account.
            </li>
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
