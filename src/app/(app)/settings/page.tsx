"use client";

import * as React from "react";
import { Info, KeyRound } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/layout/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useAuth } from "@/hooks/use-auth";
import { useReference } from "@/hooks/use-reference";
import { asText, useSessions, useSettings, type Settings } from "@/hooks/use-settings";
import { serverFieldIssues } from "@/lib/field-errors";
import { formatDateTime } from "@/lib/format";
import { initials } from "@/lib/utils";
import { toast } from "sonner";
import { apiRequest, errorMessage } from "@/lib/api";
import { isDemoMode } from "@/lib/demo";
import { passwordProblems } from "@/lib/password-policy";
import Link from "next/link";

/**
 * SETTINGS — WAVE 1, TRACK A. THE HONESTY SWEEP.
 *
 * BUG-002 recorded thirteen controls across the business screens that raised a
 * success toast and issued no request. All thirteen are closed. **This page was
 * never part of that count**, and the 2026-09-06 production-readiness audit
 * found thirteen more of the same shape living here:
 *
 *   · "Save changes" wrote to local auth state only and toasted "Settings saved"
 *   · avatar change/remove staged a `File` the code explicitly discarded
 *   · the company record and invoice numbering were uncontrolled `defaultValue`
 *     inputs — every keystroke thrown away, under the words "Printed on invoices"
 *   · the bank "Logging enabled" switch toasted and issued nothing
 *   · five alert switches and three delivery-channel switches, likewise
 *   · three "Preferences" switches and a landing-page select with no handler
 *   · a three-row active-sessions table of hardcoded 2024 literals, each with a
 *     "Sign out" button that toasted "Session ended" and revoked nothing
 *   · a 2FA switch that reported **"2FA enabled"** for a feature present in no
 *     layer of the system
 *   · "Reset demo data", described as restoring sample records, which was a bare
 *     `window.location.reload()`
 *
 * ── WHY THEY ARE REMOVED RATHER THAN WIRED ─────────────────────────────────
 *
 * **D-004** forbids a control that claims an outcome it did not achieve, and
 * roadmap row 12.7 states the principle for the security ones: *"On a banking
 * application a false security assurance is worse than a missing feature."*
 * Each control was checked against the API before being cut, and every one of
 * them is unbacked **today**:
 *
 * | Control | Why it could not be wired in Wave 1 |
 * |---|---|
 * | Profile name / email / phone | `PATCH /api/users/:id` needs `users.edit` **and** passes `assertCanManageRoleLevel(ctx, target.roleLevel)`. Applied to yourself that is never "strictly greater", so **self-edit is refused for every role**. There is no self-service profile endpoint. |
 * | Avatar upload | `users` has `avatar_color`, **not** `avatar_url` (`db/schema/identity.ts:116`). There is no column, no route and no bucket path for it. |
 * | Company record, invoice numbering, alert preferences, delivery channels, UI preferences, landing page | `app_settings` exists in the schema and is **completely dead** — zero references outside the schema file. Routes are roadmap **12.6**, which also absorbs the deferred notification-preferences row 10.7. |
 * | Active sessions, per-session sign-out | `refresh_tokens` holds the real data, but there is **no** `GET /api/auth/sessions` and no revoke-by-id route. Roadmap **12.8**. |
 * | Two-factor authentication | No TOTP secret, no enrolment, no verification at login, no recovery codes. **OPEN-8**, resolved by **D-083**: delete now, real TOTP post-launch. |
 *
 * Nothing here is disabled-but-visible. A greyed-out security switch still says
 * the capability exists and is merely off, which is the claim being withdrawn.
 * Where a tab would otherwise be empty it states plainly what is not yet
 * configurable and which roadmap row owns it.
 *
 * ── WAVE 4 CLOSES TWO OF THOSE ROWS ─────────────────────────────────────────
 *
 * **12.6 — the organisation record and data retention.** `app_settings` now has
 * routes and a closed key registry (`services/settings.ts`). The Company tab is
 * a real form again: it loads from the server, saves through `PATCH
 * /api/settings`, and adopts the state the server returns rather than the values
 * that were typed. `settings.edit` is Super Admin and Admin (U-14 / OD-8), so
 * everybody else sees the same record read-only.
 *
 * **12.8 — active sessions.** `GET /api/auth/sessions` and `DELETE
 * /api/auth/sessions/:id` exist, and the panel lists the caller's real refresh
 * tokens with a revoke that genuinely ends the session.
 *
 * ── AND WHAT 12.6 DELIBERATELY DOES NOT COVER ───────────────────────────────
 *
 * **Per-user preferences and alert preferences stay `NotConfigurable`, with a
 * corrected reason.** `app_settings` is keyed by `key` alone — it has **no user
 * column** — so it structurally cannot hold "which alerts does *this person*
 * want". Storing them there would make one operator's choice everybody's. That
 * needs a `user_settings` table, which is a schema change this wave does not
 * make. **Invoice numbering** is likewise still absent: settlement invoice
 * numbers come from the backend's own `code_sequences` generator, so a prefix
 * stored here would be read by nothing and the panel would claim it "applies to
 * new settlement invoices" when it applies to nothing.
 *
 * ── WHAT SURVIVED FROM WAVE 1, BECAUSE IT WAS ALWAYS REAL ──────────────────
 *
 * **Change password** — a genuine awaited `POST /api/auth/change-password` that
 * revokes every refresh token server-side, which is why it signs you out.
 * **Bank access** — real rows from `useReference`, rendered read-only.
 */

/** A tab that has nothing to configure yet, saying so instead of pretending. */
function NotConfigurable({
  title,
  description,
  reason,
  owner,
  action,
}: {
  title: string;
  description: string;
  reason: string;
  owner: string;
  action?: React.ReactNode;
}) {
  return (
    <SectionCard title={title} description={description} contentClassName="space-y-3">
      <div className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]" />
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">Not configurable yet</p>
          <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">{reason}</p>
          <p className="text-[11px] text-[var(--muted-foreground)]">{owner}</p>
          {action}
        </div>
      </div>
    </SectionCard>
  );
}

/** A read-only profile row. Explicitly not an input — nothing here can be saved. */
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{label}</p>
      <p className="text-[13px]">{value || <span className="text-[var(--muted-foreground)]">Not set</span>}</p>
    </div>
  );
}

/** One text field of the organisation record. Read-only without `settings.edit`. */
function SettingField({
  id,
  label,
  value,
  onChange,
  editable,
  issue,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
  issue?: string;
} & Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  if (!editable) return <ReadOnlyField label={label} value={value} />;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} {...rest} />
      {issue && <p className="text-[11px] text-[var(--danger)]">{issue}</p>}
    </div>
  );
}

/** The organisation record's keys, in the order the form renders them. */
const ORGANISATION_FIELDS = [
  { key: "organisation.legalName", label: "Registered name", placeholder: "Risenext Advisory LLP" },
  { key: "organisation.gstin", label: "GSTIN", placeholder: "29ABCDE1234F1Z5" },
  { key: "organisation.pan", label: "PAN", placeholder: "ABCDE1234F" },
  { key: "organisation.billingEmail", label: "Billing email", placeholder: "accounts@example.com" },
  { key: "organisation.billingPhone", label: "Billing phone", placeholder: "9848000000" },
] as const;

/** Every editable setting as a string, ready for a controlled input. */
function draftFrom(settings: Settings): Record<string, string> {
  const next: Record<string, string> = {};
  for (const field of ORGANISATION_FIELDS) next[field.key] = asText(settings, field.key);
  next["organisation.address"] = asText(settings, "organisation.address");
  next["recycleBin.retentionDays"] = asText(settings, "recycleBin.retentionDays");
  return next;
}

export default function SettingsPage() {
  const { banks } = useReference();
  const { user, signOut, can } = useAuth();

  /* ---------------------------------------------------------------- settings */

  const canViewSettings = can("settings.view");
  const canEditSettings = can("settings.edit");
  const {
    settings,
    loading: loadingSettings,
    error: settingsError,
    forbidden: settingsForbidden,
    save: saveSettings,
    reload: reloadSettings,
  } = useSettings(canViewSettings);

  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [settingsIssues, setSettingsIssues] = React.useState<Record<string, string>>({});

  /*
   * The draft is re-seeded whenever the SERVER's state changes — which after a
   * save is the value the server accepted, not the value that was typed (D-026).
   * `useSettings` produces a new object only when the authority changed, so the
   * identity comparison below is exactly the right trigger.
   *
   * Adjusted during render rather than in an effect. This is React's documented
   * pattern for state derived from something that can change underneath you: an
   * effect would render the stale draft first and then immediately re-render,
   * which is the cascading-render shape `react-hooks/set-state-in-effect`
   * forbids. Setting state during render of the SAME component is the supported
   * alternative — React discards the in-progress output and re-runs the body
   * before touching the DOM.
   */
  const [seededFrom, setSeededFrom] = React.useState<Settings | null>(null);
  if (seededFrom !== settings) {
    setSeededFrom(settings);
    setDraft(draftFrom(settings));
  }

  const dirty = React.useMemo(
    () => Object.entries(draft).some(([key, value]) => value !== asText(settings, key)),
    [draft, settings],
  );

  async function handleSettingsSave() {
    setSavingSettings(true);
    setSettingsIssues({});
    try {
      // Only what actually changed, so a save cannot rewrite a field somebody
      // else edited between this page loading and the button being pressed.
      const patch = Object.fromEntries(
        Object.entries(draft).filter(([key, value]) => value !== asText(settings, key)),
      );
      await saveSettings(patch);
      // Reached only on a 2xx. The hook has already adopted the server's state.
      toast.success("Settings saved");
    } catch (err) {
      /*
       * Matched on the WHOLE path, not `serverFieldErrors`' first segment. A
       * setting key is itself dotted — `recycleBin.retentionDays` — so first-
       * segment matching would look for a field called `recycleBin` and drop
       * every message on the floor.
       */
      const fields: Record<string, string> = {};
      for (const issue of serverFieldIssues(err)) {
        if (!(issue.path in fields)) fields[issue.path] = issue.message;
      }
      setSettingsIssues(fields);
      toast.error("Could not save settings", { description: errorMessage(err) });
    } finally {
      setSavingSettings(false);
    }
  }

  /* ---------------------------------------------------------------- sessions */

  const {
    sessions,
    loading: loadingSessions,
    error: sessionsError,
    revoke,
    reload: reloadSessions,
  } = useSessions(!isDemoMode());
  const [revoking, setRevoking] = React.useState<string | null>(null);

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      await revoke(id);
      toast.success("Session revoked", {
        description: "That device cannot renew its session.",
      });
    } catch (err) {
      toast.error("Could not revoke that session", { description: errorMessage(err) });
    } finally {
      setRevoking(null);
    }
  }

  /* ---------------------------------------------------------------- password */

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [changingPassword, setChangingPassword] = React.useState(false);

  /**
   * The server revokes every refresh token on a successful change, so this
   * session ends with it. Signing out explicitly is the honest end to the flow
   * rather than leaving the page holding a dead session.
   */
  async function handlePasswordUpdate() {
    /*
     * The presentation account is not a database record and has no password to
     * change. Stopping here matters for more than tidiness: `/settings` is a
     * demo route, and since real authentication paths stopped being answered by
     * the fixture layer this request would otherwise put whatever the presenter
     * typed on the wire — from a session whose whole premise is that nothing
     * leaves the tab and that it works with the backend stopped.
     */
    if (isDemoMode()) {
      toast.info("Not available in the demo", {
        description: "The demo account is not a real user, so it has no password to change.",
      });
      return;
    }

    if (!currentPassword) {
      toast.error("Enter your current password");
      return;
    }

    const problems = passwordProblems(newPassword);
    if (problems.length > 0) {
      toast.error("Choose a stronger password", {
        description: `Password ${problems.join(", ")}.`,
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match", {
        description: "Re-enter the new password to confirm it.",
      });
      return;
    }

    setChangingPassword(true);
    try {
      await apiRequest("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
        skipAuthRetry: true,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      toast.success("Password updated", {
        description: "Sign in again with your new password.",
      });

      await signOut();
    } catch (err) {
      toast.error("Could not update password", { description: errorMessage(err) });
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Your profile, the lenders you can see, and your password."
      />

      <Tabs defaultValue="profile">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="banks">Bank access</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* ================================================================== */}
        {/* PROFILE — read-only: there is no self-service edit endpoint         */}
        {/* ================================================================== */}

        <TabsContent value="profile">
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard
              title="Your profile"
              description="Shown to your team on every record"
              className="lg:col-span-2"
            >
              <div className="flex items-center gap-4 pb-4">
                <Avatar className="size-14">
                  <AvatarFallback className="text-base">
                    {initials(user?.name || "RN")}
                  </AvatarFallback>
                </Avatar>

                <div className="space-y-1">
                  <p className="text-[13px] font-medium">{user?.name ?? "—"}</p>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Signed in as {user?.role?.name ?? "User"}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 pt-4 sm:grid-cols-2">
                <ReadOnlyField label="Full name" value={user?.name ?? ""} />
                <ReadOnlyField label="Work email" value={user?.email ?? ""} />
                <ReadOnlyField label="Phone" value={user?.phone ?? ""} />
                <ReadOnlyField label="Role" value={user?.role?.name ?? ""} />
              </div>

              <div className="mt-4 flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] p-3">
                <Info className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]" />
                <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                  These details are read-only here. Changing them requires{" "}
                  <code className="text-[11px]">users.edit</code> on your own record, which the
                  role hierarchy does not grant to anyone — ask an administrator to update them
                  from the Employees screen.
                </p>
              </div>
            </SectionCard>

            <NotConfigurable
              title="Preferences"
              description="How the workspace behaves for you"
              reason="Task 12.6 gave app_settings routes, and these still cannot live there: the table is keyed by `key` alone and has no user column, so a preference stored in it would be everybody’s preference rather than yours. Per-user settings need a table that does not exist yet."
              owner="Needs a `user_settings` table — a schema change no current roadmap row owns."
            />
          </div>
        </TabsContent>

        {/* ================================================================== */}
        {/* COMPANY                                                            */}
        {/* ================================================================== */}

        <TabsContent value="company">
          {!canViewSettings ? (
            <NotConfigurable
              title="Organisation record"
              description="Your registered details"
              reason="Your role cannot see the organisation record. It needs settings.view, which is held by Super Admin and Admin."
              owner="Ask an administrator if these details need changing."
            />
          ) : settingsForbidden ? (
            <NotConfigurable
              title="Organisation record"
              description="Your registered details"
              reason="The server refused to return these settings for your account."
              owner="This is the API's decision, not this screen's."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard
                title="Organisation record"
                description={
                  canEditSettings
                    ? "Stored on the server. Nothing prints them yet — invoice and statement output is a later roadmap row."
                    : "Read-only: changing these needs settings.edit."
                }
                className="lg:col-span-2"
                contentClassName="space-y-3"
              >
                {loadingSettings && <Skeleton className="h-40 w-full rounded-lg" />}

                {!loadingSettings && settingsError && (
                  <div className="space-y-2">
                    <p className="text-sm text-[var(--danger)]">{settingsError}</p>
                    <Button variant="outline" size="sm" onClick={reloadSettings}>
                      Try again
                    </Button>
                  </div>
                )}

                {!loadingSettings && !settingsError && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {ORGANISATION_FIELDS.map((field) => (
                        <SettingField
                          key={field.key}
                          id={`set-${field.key.replace(/\./g, "-")}`}
                          label={field.label}
                          placeholder={field.placeholder}
                          value={draft[field.key] ?? ""}
                          onChange={(value) => setDraft({ ...draft, [field.key]: value })}
                          editable={canEditSettings}
                          issue={settingsIssues[field.key]}
                        />
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      {canEditSettings ? (
                        <>
                          <Label htmlFor="set-organisation-address">Registered address</Label>
                          <Textarea
                            id="set-organisation-address"
                            value={draft["organisation.address"] ?? ""}
                            onChange={(event) =>
                              setDraft({ ...draft, "organisation.address": event.target.value })
                            }
                          />
                          {settingsIssues["organisation.address"] && (
                            <p className="text-[11px] text-[var(--danger)]">
                              {settingsIssues["organisation.address"]}
                            </p>
                          )}
                        </>
                      ) : (
                        <ReadOnlyField
                          label="Registered address"
                          value={asText(settings, "organisation.address")}
                        />
                      )}
                    </div>

                    {canEditSettings && (
                      <Button onClick={handleSettingsSave} disabled={savingSettings || !dirty}>
                        {savingSettings ? "Saving…" : "Save changes"}
                      </Button>
                    )}
                  </>
                )}
              </SectionCard>

              <SectionCard
                title="Data retention"
                description="How long a deleted record stays restorable"
                contentClassName="space-y-3"
              >
                {loadingSettings ? (
                  <Skeleton className="h-24 w-full rounded-lg" />
                ) : (
                  <>
                    <SettingField
                      id="set-recycleBin-retentionDays"
                      label="Recycle bin retention (days)"
                      type="number"
                      value={draft["recycleBin.retentionDays"] ?? ""}
                      onChange={(value) =>
                        setDraft({ ...draft, "recycleBin.retentionDays": value })
                      }
                      editable={canEditSettings}
                      issue={settingsIssues["recycleBin.retentionDays"]}
                    />
                    <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                      This one is live: it sets the purge date stamped on every record deleted from
                      now on. Records already in the bin keep the window they were given.
                    </p>
                    {canEditSettings && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSettingsSave}
                        disabled={savingSettings || !dirty}
                      >
                        {savingSettings ? "Saving…" : "Save changes"}
                      </Button>
                    )}
                  </>
                )}
              </SectionCard>

              <div className="lg:col-span-3">
                <NotConfigurable
                  title="Invoice numbering"
                  description="Applies to new settlement invoices"
                  reason="Deliberately not added by 12.6. Settlement invoice numbers come from the backend's own code_sequences generator, so a prefix or next-number stored here would be read by nothing — the control would claim an effect it does not have."
                  owner="Needs the generator to consult a setting first; not yet owned by a roadmap row."
                />
              </div>
            </div>
          )}
        </TabsContent>

        {/* ================================================================== */}
        {/* BANK ACCESS — real data, read-only                                  */}
        {/* ================================================================== */}

        <TabsContent value="banks">
          <SectionCard
            title="Bank access"
            description="The lenders your account can see. Read-only here."
            contentClassName="px-0 pb-0"
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/banks">Manage banks</Link>
              </Button>
            }
          >
            <Table>
              <TableHeader className="bg-[color-mix(in_oklab,var(--secondary)_70%,transparent)]">
                <TableRow>
                  <TableHead>Bank</TableHead>
                  <TableHead>Vendor ID</TableHead>
                  <TableHead>Settlement cycle</TableHead>
                  <TableHead>SPOC</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {banks.map((bank) => (
                  <TableRow key={bank.id}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className="grid size-7 place-items-center rounded-md text-[10px] font-bold text-white"
                          style={{ background: bank.accentColor ?? "#1d4ed8" }}
                        >
                          {bank.logoText}
                        </span>
                        {bank.name}
                      </span>
                    </TableCell>
                    <TableCell className="numeric text-xs">{bank.vendorId}</TableCell>
                    <TableCell>{bank.settlementCycle}</TableCell>
                    <TableCell>
                      {bank.spocName}
                      <span className="numeric block text-[11px] text-[var(--muted-foreground)]">
                        {bank.spocPhone}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={bank.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {!banks.length && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-sm text-[var(--muted-foreground)]"
                    >
                      No banks are assigned to your account.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </SectionCard>
        </TabsContent>

        {/* ================================================================== */}
        {/* ALERTS                                                             */}
        {/* ================================================================== */}

        <TabsContent value="alerts">
          <div className="grid gap-4 lg:grid-cols-2">
            <NotConfigurable
              title="Alert preferences"
              description="Choose what lands in your notifications"
              reason="Notifications are real and are generated by the backend inside the transaction that causes them. Which alerts YOU receive is still not storable: 12.6’s settings table has no user dimension, and making these organisation-wide would let one person mute everybody."
              owner="Deferred row 10.7, now blocked on the same missing `user_settings` table."
              action={
                <Button variant="outline" size="sm" asChild className="mt-1">
                  <Link href="/notifications">View notifications</Link>
                </Button>
              }
            />
            <NotConfigurable
              title="Delivery channels"
              description="Where alerts are sent"
              reason="In-app notifications are always delivered. Email, SMS and WhatsApp delivery for notifications does not exist — transactional email is wired for invitations and password resets only, and there is no SMS or WhatsApp integration in any layer."
              owner="Blocked on `user_settings` (preferences) and 15.9 (the scheduled sender)."
            />
          </div>
        </TabsContent>

        {/* ================================================================== */}
        {/* SECURITY — the password change is real; everything else was not     */}
        {/* ================================================================== */}

        <TabsContent value="security">
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard
              title="Password"
              description="Replaced immediately across every device"
              contentClassName="space-y-3"
            >
              <div className="space-y-1.5">
                <Label htmlFor="pw-current">Current password</Label>
                <Input
                  id="pw-current"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pw-new">New password</Label>
                <Input
                  id="pw-new"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pw-confirm">Confirm password</Label>
                <Input
                  id="pw-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
              </div>

              <Button className="w-full" onClick={handlePasswordUpdate} disabled={changingPassword}>
                <KeyRound className="size-4" />
                {changingPassword ? "Updating…" : "Update password"}
              </Button>

              <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                At least 12 characters with an uppercase letter, a lowercase letter, and a digit.
                Updating signs you out everywhere, including here.
              </p>
            </SectionCard>

            {/* ============================================================ */}
            {/* ACTIVE SESSIONS — Task 12.8. Real refresh tokens.            */}
            {/* ============================================================ */}

            <div className="lg:col-span-2">
              <SectionCard
                title="Active sessions"
                description="Every device holding a live session for your account"
                contentClassName="space-y-3"
              >
                {isDemoMode() ? (
                  <p className="text-[12px] text-[var(--muted-foreground)]">
                    The demo account is not a real user, so it has no server-side sessions to list.
                  </p>
                ) : loadingSessions ? (
                  <Skeleton className="h-28 w-full rounded-lg" />
                ) : sessionsError ? (
                  <div className="space-y-2">
                    <p className="text-sm text-[var(--danger)]">{sessionsError}</p>
                    <Button variant="outline" size="sm" onClick={reloadSessions}>
                      Try again
                    </Button>
                  </div>
                ) : sessions.length === 0 ? (
                  <p className="text-[12px] text-[var(--muted-foreground)]">
                    No live sessions were returned. If you are reading this you have one, so this
                    most likely means the list could not be matched — reload the page.
                  </p>
                ) : (
                  <Table>
                    <TableHeader className="bg-[color-mix(in_oklab,var(--secondary)_70%,transparent)]">
                      <TableRow>
                        <TableHead>Signed in</TableHead>
                        <TableHead>Reported browser</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessions.map((session) => (
                        <TableRow key={session.id} data-session={session.id}>
                          <TableCell className="numeric text-xs">
                            {formatDateTime(session.createdAt)}
                            {session.current && (
                              <span className="ml-2 rounded-full bg-[var(--secondary)] px-1.5 py-0.5 text-[10px] font-semibold">
                                This device
                              </span>
                            )}
                          </TableCell>
                          {/*
                           * The raw header, not a parsed device name. It is
                           * self-reported by the client and any browser may set
                           * it to anything — on the screen whose purpose is
                           * deciding what to revoke, presenting a guess as an
                           * identified device is the worst possible claim.
                           */}
                          <TableCell className="max-w-[220px] truncate text-[11px]">
                            {session.userAgent ?? "Not recorded"}
                          </TableCell>
                          <TableCell className="numeric text-[11px]">
                            {session.ipAddress ?? "Not recorded"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={revoking === session.id}
                              onClick={() => handleRevoke(session.id)}
                            >
                              {revoking === session.id ? "Revoking…" : "Revoke"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                  Revoking stops that device renewing its session; an access token it already holds
                  stays valid for a few more minutes. There is no device or location here because
                  the server does not record one — only the sign-in time, the address it came from
                  and the browser string the client sent. Changing your password revokes every
                  session at once, including this one.
                </p>
              </SectionCard>
            </div>

            <div className="lg:col-span-3">
              <NotConfigurable
                title="Two-factor authentication"
                description="Extra step at sign in"
                reason="Two-factor authentication is not implemented. There is no enrolment, no secret, no verification step at sign-in and no recovery codes. A switch here previously reported that it had been turned on — a security assurance for a feature that exists in no layer of the system, which is worse than its absence."
                owner="OPEN-8, resolved by D-083: the switch is removed now; real TOTP is post-launch."
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
