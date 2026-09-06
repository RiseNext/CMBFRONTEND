"use client";

import * as React from "react";
import { Check, Copy, KeyRound, Mail, MailWarning, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * The one-time credential hand-over.
 *
 * The server returns a generated password in the single response that creates
 * or resets an account and keeps only its argon2id hash, so this panel is the
 * only moment the value exists in readable form. The copy affordances and the
 * warning exist because there is no second chance to read it — the recovery
 * path is a fresh reset, not a lookup.
 */
export interface HandoverCredential {
  name: string;
  email: string;
  temporaryPassword: string;
  /** Distinguishes a newly created account from a reset of an existing one. */
  reason: "created" | "reset";
  /**
   * The mail outcome for the invitation that accompanies a newly created
   * account — roadmap 3.9.
   *
   * The password is shown for **every** outcome; that is the preservation
   * requirement and it does not vary. What varies is what the administrator is
   * told, because "the link is on its way" and "no link exists" call for
   * completely different action from them, and the screen previously could not
   * tell the two apart.
   *
   * Absent on a password reset, which sends no email at all.
   */
  delivery?: "sent" | "logged" | "failed";
}

/**
 * What the administrator must do about delivery, per outcome.
 *
 * `logged` is the development console transport: the message was written to the
 * server log and **nothing left the machine** (D-035). It is grouped with
 * `failed` here — not with `sent` — because from the employee's point of view
 * the two are identical: no email arrived.
 */
function deliveryNote(credential: HandoverCredential): { tone: "ok" | "warn"; text: string } | null {
  switch (credential.delivery) {
    case "sent":
      return {
        tone: "ok",
        text: `An invitation link was also emailed to ${credential.email}. They can set their own password from it — this password is the fallback if it does not arrive.`,
      };
    case "failed":
      return {
        tone: "warn",
        text: "The invitation email could not be sent, so no link is on its way. This password is the only way in — hand it over.",
      };
    case "logged":
      return {
        tone: "warn",
        text: "Email is not configured here, so the invitation was written to the server log and nothing was delivered. This password is the only way in — hand it over.",
      };
    default:
      // A reset issues no invitation, so there is no delivery to report.
      return null;
  }
}

function CopyField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access is refused outside a secure context, so fall back to
      // telling the admin to select it by hand rather than failing silently.
      toast.error("Could not copy automatically", {
        description: "Select the value and copy it manually.",
      });
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="eyebrow text-[var(--muted-foreground)]">{label}</p>
      <div className="flex items-center gap-2">
        <code
          className={`flex-1 truncate rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] ${
            mono ? "numeric tracking-wide" : ""
          }`}
        >
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check className="size-4 text-[var(--success)]" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

export function CredentialHandover({ credential }: { credential: HandoverCredential }) {
  const note = deliveryNote(credential);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg bg-[var(--success-soft)] px-3 py-2.5">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
        <p className="text-[13px] leading-relaxed text-[var(--success)]">
          {credential.reason === "created"
            ? `${credential.name}'s account is active and can sign in now.`
            : `A new temporary password has been issued for ${credential.name}.`}
        </p>
      </div>

      {/*
        * Roadmap 3.9. The password below is shown either way — removing it is
        * exactly what the roadmap forbids. This line is what makes it an
        * *explicit* fallback rather than an unconditional hand-over: before it
        * existed, a mail outage and a successful send produced identical
        * screens, so the administrator could not tell which had happened.
        */}
      {note && (
        <div
          className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${
            note.tone === "ok" ? "bg-[var(--info-soft)]" : "bg-[var(--warning-soft)]"
          }`}
        >
          {note.tone === "ok" ? (
            <Mail className="mt-0.5 size-4 shrink-0 text-[var(--info)]" />
          ) : (
            <MailWarning className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
          )}
          <p
            className={`text-[13px] leading-relaxed ${
              note.tone === "ok" ? "text-[var(--info)]" : "text-[var(--warning)]"
            }`}
          >
            {note.text}
          </p>
        </div>
      )}

      <CopyField label="Email" value={credential.email} />
      <CopyField label="Temporary password" value={credential.temporaryPassword} mono />

      <div className="flex items-start gap-3 rounded-lg bg-[var(--warning-soft)] px-3 py-2.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
        <div className="space-y-1 text-[12px] leading-relaxed text-[var(--warning)]">
          <p className="font-semibold">
            Save this password now. It will not be shown again.
          </p>
          <p>
            Only a hash is stored, so nobody — including you — can read it back later. If it is
            lost, issue a new one with Reset password. The employee is asked to choose their own
            password the first time they sign in.
          </p>
        </div>
      </div>
    </div>
  );
}
