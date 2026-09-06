"use client";

import * as React from "react";
import {
  Award,
  Building2,
  KeyRound,
  MailPlus,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailRow } from "@/components/shared/detail-row";
import { SectionCard } from "@/components/layout/section-card";
import { EmployeeTargetChart } from "@/components/charts/employee-target-chart";
import {
  CredentialHandover,
  type HandoverCredential,
} from "@/components/shared/credential-handover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formLevelError, serverFieldErrors } from "@/lib/field-errors";
import { formatCurrency, formatDate } from "@/lib/format";
import { initials } from "@/lib/utils";
import { toast } from "sonner";
import { useReference } from "@/hooks/use-reference";
import { useAuth } from "@/hooks/use-auth";
import { useResource } from "@/hooks/use-api";
import { api, apiRequest, errorMessage } from "@/lib/api";
import {
  buildEmployeePatch,
  formFromEmployee,
  isEmptyPatch,
  validateEmployeeForm,
  type EmployeeEditForm,
} from "@/lib/employee-patch";
import type { Customer, Employee, Loan, Team } from "@/lib/types";

/** `/roles` returns the catalogue each role grants, which is what the panel shows. */
interface RoleOption {
  id: string;
  key: string;
  name: string;
  description: string | null;
  level: number;
  isSystem: boolean;
  permissions?: string[];
}

/**
 * Shape of the create and reset responses, including the one-time password.
 *
 * `invitation` is present on create only — the reset route sends no email. It
 * was previously omitted from this type and silently discarded, which is what
 * made the on-screen hand-over an *unconditional* one rather than the explicit
 * email-unavailable fallback roadmap 3.9 requires.
 */
interface CredentialResponse {
  data: { id: string; name: string; email: string };
  temporaryPassword?: string;
  invitation?: { status: "sent" | "logged" | "failed"; expiresInHours: number };
}

/**
 * Shape of the resend response — roadmap 3.8.
 *
 * `status` is the mail outcome and nothing more: `sent` means the provider
 * accepted the message, `logged` is the development console transport, `failed`
 * means it did not go. The screen must distinguish all three (D-004, D-035).
 * There is deliberately no token here — the raw one exists only in the email.
 */
interface InvitationResponse {
  data: { id: string; name: string; email: string };
  invitation?: { status: "sent" | "logged" | "failed"; expiresInHours: number };
}

const NO_TEAM = "__none__";

/**
 * Where an employee is in the invitation journey — roadmap 3.7.
 *
 * Derived from the two timestamps rather than stored a third time. The wording
 * is deliberately *"Invited"*, never *"Emailed"*: `invitedAt` records that an
 * invitation was **issued**, and the mail service reports provider acceptance at
 * best — in development it delivers nothing at all (**D-035**, **D-040**).
 * Claiming delivery here would be a control reporting an outcome the system
 * never achieved (**D-004**).
 */
type InviteState = "Accepted" | "Invited" | "Not invited";

function inviteState(row: Employee): InviteState {
  if (row.inviteAcceptedAt) return "Accepted";
  if (row.invitedAt) return "Invited";
  return "Not invited";
}

/*
 * The schema keys each dialog renders a control for. A server issue whose path
 * starts with one of these is shown against that control; anything else is kept
 * on the dialog's own error line rather than dropped (see `lib/field-errors.ts`).
 */
const CREATE_FIELDS = [
  "name",
  "email",
  "phone",
  "employeeCode",
  "roleId",
  "teamId",
  "branch",
  "target",
  "bankIds",
] as const;

const EDIT_FIELDS = [
  "name",
  "email",
  "phone",
  "employeeCode",
  "branch",
  "roleId",
  "status",
  "target",
  "achieved",
] as const;

/** The server's message for one field, rendered under its control. */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] leading-relaxed text-[var(--danger)]">{message}</p>;
}

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  employeeCode: "",
  roleId: "",
  teamId: NO_TEAM,
  branch: "Hyderabad",
  target: "8000000",
  bankIds: [] as string[],
};

export default function EmployeesPage() {
  const { bankName, banks, teams, refresh: refreshReference } = useReference();
  const { user, can } = useAuth();
  const {
    data: rows,
    loading,
    error: loadError,
    refresh,
  } = useResource<Employee>("/users", { pageSize: 200 });
  const { data: customers } = useResource<Customer>("/customers", { pageSize: 500 });
  const { data: loans } = useResource<Loan>("/loans", { pageSize: 500 });
  const { data: roles } = useResource<RoleOption>("/roles");

  const [selected, setSelected] = React.useState<Employee | null>(null);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  /** Roadmap 3.8 — disables the resend control while the reissue is in flight. */
  const [resending, setResending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [formFields, setFormFields] = React.useState<Record<string, string>>({});
  const [form, setForm] = React.useState(emptyForm);

  /** Set once an account is created or reset; the only time the password exists. */
  const [credential, setCredential] = React.useState<HandoverCredential | null>(null);

  /* ---------------------------------------------------------- delete (2.8) */

  /** The employee awaiting an explicit confirmation before being deleted. */
  const [deleting, setDeleting] = React.useState<Employee | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deletingNow, setDeletingNow] = React.useState(false);

  /* --------------------------------------------------- team membership (2.7) */

  /** The employee whose team is being changed, and the team chosen for them. */
  const [teamAssigning, setTeamAssigning] = React.useState<Employee | null>(null);
  const [teamChoice, setTeamChoice] = React.useState<string>(NO_TEAM);
  const [teamError, setTeamError] = React.useState<string | null>(null);
  const [savingTeam, setSavingTeam] = React.useState(false);

  /* ------------------------------------------------------ bank access (2.6) */

  /** The employee whose bank access is being changed, and the working selection. */
  const [assigning, setAssigning] = React.useState<Employee | null>(null);
  const [assignBankIds, setAssignBankIds] = React.useState<string[]>([]);
  const [assignError, setAssignError] = React.useState<string | null>(null);
  const [savingBanks, setSavingBanks] = React.useState(false);

  /* --------------------------------------------------------------- edit (2.4) */

  /** The employee the edit dialog was opened on — also the diff baseline. */
  const [editing, setEditing] = React.useState<Employee | null>(null);
  const [editForm, setEditForm] = React.useState<EmployeeEditForm | null>(null);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editFields, setEditFields] = React.useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = React.useState(false);

  /*
   * Mirrors the server's hierarchy rule so the picker cannot offer a role the
   * request would then be refused for: an actor may only assign a role strictly
   * below their own, unless they hold `system.manage_any_user`.
   */
  const assignableRoles = React.useMemo(() => {
    if (!user) return [];
    const unrestricted = user.permissions.includes("system.manage_any_user");
    return roles.filter((role) => unrestricted || role.level > user.role.level);
  }, [roles, user]);

  const selectedRole = assignableRoles.find((role) => role.id === form.roleId) ?? null;

  /*
   * The edit picker offers the assignable roles plus whatever the employee
   * already holds, so a Select bound to their current role always has a matching
   * option — otherwise editing a colleague you cannot promote to would render an
   * empty control and look like their role had been cleared. Choosing a role you
   * lack the authority to assign is still refused by the server.
   */
  const editableRoles = React.useMemo(() => {
    if (!editing) return assignableRoles;
    const current = roles.find((role) => role.id === editing.roleId);
    if (!current || assignableRoles.some((role) => role.id === current.id)) return assignableRoles;
    return [current, ...assignableRoles];
  }, [assignableRoles, editing, roles]);

  const teamOf = React.useCallback(
    (employeeId: string) =>
      teams.find((team) => team.members?.some((member) => member.userId === employeeId)),
    [teams],
  );

  function openCreate() {
    setForm({ ...emptyForm });
    setFormError(null);
    setFormFields({});
    setCredential(null);
    setOpen(true);
  }

  function closeCreate() {
    setOpen(false);
    setCredential(null);
    setFormError(null);
  }

  function toggleBank(bankId: string) {
    setForm((prev) => ({
      ...prev,
      bankIds: prev.bankIds.includes(bankId)
        ? prev.bankIds.filter((id) => id !== bankId)
        : [...prev.bankIds, bankId],
    }));
  }

  async function addEmployee() {
    setFormError(null);

    if (!form.name.trim()) return setFormError("Enter the employee's full name.");
    if (!form.email.includes("@")) return setFormError("Enter a valid work email address.");
    // The role was previously defaulted to whatever the API listed first, which
    // is Super Admin. It is now an explicit, deliberate choice.
    if (!form.roleId) return setFormError("Choose the role this employee should hold.");

    setSaving(true);
    try {
      const created = await apiRequest<CredentialResponse>("/users", {
        method: "POST",
        body: {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          // Omitted when blank, so the server assigns the next free code.
          ...(form.employeeCode.trim() ? { employeeCode: form.employeeCode.trim() } : {}),
          roleId: form.roleId,
          branch: form.branch.trim() || null,
          status: "Active",
          target: Number(form.target) || 0,
          bankIds: form.bankIds,
          teamId: form.teamId === NO_TEAM ? null : form.teamId,
        },
      });

      refresh();
      refreshReference();

      if (created.temporaryPassword) {
        setCredential({
          name: created.data.name,
          email: created.data.email,
          temporaryPassword: created.temporaryPassword,
          reason: "created",
          /*
           * Roadmap 3.9. The hand-over is shown for every outcome — that is the
           * preservation requirement. Passing the outcome through is what makes
           * it *explicit*: the dialog can now say whether a link is actually on
           * its way, which decides what the administrator does next.
           */
          delivery: created.invitation?.status,
        });
      } else {
        closeCreate();
        toast.success("Employee added", { description: created.data.name });
      }
    } catch (err) {
      /*
       * A 409 is a duplicate email or employee code; a 403 is the server
       * refusing to let you create a peer or a superior; a 422 carries per-field
       * detail, which goes under the control it names. Anything the form does not
       * render stays on this line rather than being discarded.
       */
      const fallback = errorMessage(err, "Could not create this employee.");
      setFormFields(serverFieldErrors(err, CREATE_FIELDS).fields);
      setFormError(formLevelError(err, fallback, CREATE_FIELDS));
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(employee: Employee) {
    try {
      const result = await apiRequest<CredentialResponse>(
        `/users/${employee.id}/reset-password`,
        { method: "POST", body: {} },
      );
      if (!result.temporaryPassword) throw new Error("No credential was returned");

      setSelected(null);
      setCredential({
        name: result.data.name,
        email: result.data.email,
        temporaryPassword: result.temporaryPassword,
        reason: "reset",
      });
      setOpen(true);
      refresh();
    } catch (err) {
      toast.error("Could not reset the password", { description: errorMessage(err) });
    }
  }

  /**
   * Resend an employee's setup invitation — roadmap 3.8.
   *
   * The toast is driven by what the server actually reported, never by the call
   * having returned. A `failed` outcome still means the link was reissued and
   * the previous one is dead — that is a database fact, decided before the mail
   * was attempted — so the message says so rather than pretending either that
   * nothing happened or that an email arrived (D-004).
   */
  async function resendInvitation(employee: Employee) {
    setResending(true);
    try {
      const result = await apiRequest<InvitationResponse>(
        `/users/${employee.id}/resend-invitation`,
        { method: "POST", body: {} },
      );

      /*
       * `sent` is asserted explicitly rather than being the fallthrough. An
       * absent or unrecognised outcome means we do not know what happened, and
       * "we do not know" must not be rendered as success (D-004).
       */
      const status = result.invitation?.status;
      const first = !employee.invitedAt;
      const issued = first ? "Invitation created" : "Invitation reissued";

      if (status === "failed") {
        toast.error(`${issued}, but the email could not be sent`, {
          description: `${employee.email} — any previous link no longer works. Try again once mail is available.`,
        });
      } else if (status === "sent") {
        toast.success(first ? "Invitation sent" : "Invitation resent", {
          description: employee.email,
        });
      } else if (status === "logged") {
        toast.info(issued, {
          description: "Email is not configured here, so the link went to the server log.",
        });
      } else {
        toast.info(issued, {
          description: "The server reported no delivery outcome for this email.",
        });
      }

      // `invitedAt` has moved either way, so the list is now stale.
      refresh();
    } catch (err) {
      toast.error("Could not resend the invitation", { description: errorMessage(err) });
    } finally {
      setResending(false);
    }
  }

  async function toggleStatus(employee: Employee) {
    const status = employee.status === "Active" ? "Inactive" : "Active";
    try {
      await apiRequest(`/users/${employee.id}`, { method: "PATCH", body: { status } });
      setSelected((prev) => (prev ? { ...prev, status } : prev));
      refresh();
      toast.success(`Access ${status === "Active" ? "restored" : "revoked"}`, {
        description: employee.name,
      });
    } catch (err) {
      toast.error("Could not change access", { description: errorMessage(err) });
    }
  }

  function openDelete(employee: Employee) {
    setDeleting(employee);
    setDeleteError(null);
  }

  function closeDelete() {
    setDeleting(null);
    setDeleteError(null);
  }

  /**
   * Deletes an employee through `DELETE /api/users/:id`.
   *
   * The route is a **soft** delete — it stamps `deletedAt`/`deletedBy` and forces
   * `status: "Inactive"` — but it writes **no recycle-bin entry**, because `user`
   * is absent from `BIN_REGISTRY`. Nothing in the product can bring the record
   * back. Roadmap 2.9 adds that; until it lands the confirmation must say so
   * plainly rather than implying a reversibility that does not exist (D-004).
   *
   * There is no response body to adopt — the route answers **204** — so the list
   * is re-read from the server instead of being patched locally.
   */
  async function confirmDelete() {
    if (!deleting) return;
    const employee = deleting;

    setDeleteError(null);
    setDeletingNow(true);
    try {
      await api.remove(`/users/${employee.id}`);
      refresh();
      refreshReference();
      // The detail dialog is showing a record that no longer exists.
      setSelected(null);
      closeDelete();
      toast.success("Employee deleted", { description: `${employee.name} was removed` });
    } catch (err) {
      /*
       * The server's message is the useful one and is shown verbatim: 400 for
       * deleting your own account, 409 for the last active Super Admin, 403 for
       * a target at or above the actor's role level.
       */
      setDeleteError(errorMessage(err, "Could not delete this employee."));
    } finally {
      setDeletingNow(false);
    }
  }

  function openTeamAssign(employee: Employee) {
    setTeamAssigning(employee);
    setTeamChoice(teamOf(employee.id)?.id ?? NO_TEAM);
    setTeamError(null);
  }

  function closeTeamAssign() {
    setTeamAssigning(null);
    setTeamChoice(NO_TEAM);
    setTeamError(null);
  }

  /**
   * Changes one employee's team through `PUT /api/teams/:id/members`.
   *
   * That route replaces a team's ENTIRE roster, but this screen only knows about
   * one employee — so the request has to carry every other member too, unchanged.
   * Getting this wrong does not fail loudly: sending `{ userIds: [employeeId] }`
   * returns 200 and silently evicts everyone else on the team.
   *
   * Two consequences drive the shape of this function:
   *
   * 1. **The rosters are re-read from the server first.** Reference data is
   *    loaded at sign-in and refreshed only on demand, so a roster built from it
   *    could be minutes stale and would evict whoever another administrator added
   *    in the meantime. A cached read is not good enough to submit.
   * 2. **A move is two requests** — off the old team, then onto the new one —
   *    because one team's roster cannot express membership of another. They
   *    cannot be atomic across two endpoints, so the removal goes first: if the
   *    second call then fails the employee is left on no team, which is visible
   *    and recoverable, rather than on two teams, which `teamOf` would hide by
   *    reporting only the first match.
   */
  async function saveTeamMembership() {
    if (!teamAssigning) return;
    const employee = teamAssigning;

    // Nothing actually changed — do not spend a request saying so.
    if (teamChoice === (teamOf(employee.id)?.id ?? NO_TEAM)) {
      closeTeamAssign();
      return;
    }

    setTeamError(null);
    setSavingTeam(true);
    let removedFrom: Team | null = null;

    try {
      const fresh = (await api.list<Team>("/teams")).data ?? [];
      const rosterOf = (team: Team) => (team.members ?? []).map((member) => member.userId);

      const from = fresh.find((team) => rosterOf(team).includes(employee.id)) ?? null;
      const to = teamChoice === NO_TEAM ? null : (fresh.find((t) => t.id === teamChoice) ?? null);

      if (teamChoice !== NO_TEAM && !to) {
        throw new Error("That team no longer exists. Refresh and try again.");
      }
      // The server moved on between opening the dialog and saving.
      if ((from?.id ?? NO_TEAM) === (to?.id ?? NO_TEAM)) {
        throw new Error(
          `${employee.name} is already ${to ? `on ${to.name}` : "on no team"}. Nothing was changed.`,
        );
      }

      if (from) {
        const result = await api.replace<{ teamId: string; userIds: string[] }>(
          `/teams/${from.id}/members`,
          // Everyone who was on that team, minus this employee. Never a bare list.
          { userIds: rosterOf(from).filter((id) => id !== employee.id) },
        );
        // The route echoes what it stored; believe that, not the request.
        if (result.data.userIds.includes(employee.id)) {
          throw new Error(`${employee.name} could not be removed from ${from.name}.`);
        }
        removedFrom = from;
      }

      if (to) {
        const existing = rosterOf(to);
        const result = await api.replace<{ teamId: string; userIds: string[] }>(
          `/teams/${to.id}/members`,
          // Everyone already on that team, plus this employee.
          { userIds: existing.includes(employee.id) ? existing : [...existing, employee.id] },
        );
        if (!result.data.userIds.includes(employee.id)) {
          throw new Error(`${employee.name} was not added to ${to.name}.`);
        }
      }

      refresh();
      refreshReference();
      toast.success("Team updated", {
        description: to
          ? `${employee.name} is now on ${to.name}`
          : `${employee.name} is no longer on a team`,
      });
      closeTeamAssign();
    } catch (err) {
      /*
       * The server's message is the useful one: 403 when the actor may not manage
       * someone on either roster — including a member they never named, because
       * the route authorises the union of the old and new rosters (D-027) — 400
       * for a user that does not exist, 404 for a deleted team.
       */
      const message = errorMessage(err, "Could not update team membership.");
      setTeamError(
        removedFrom
          ? `${message} ${employee.name} was removed from ${removedFrom.name} but not added to the new team, so they are currently on no team.`
          : message,
      );
      // A half-completed move must not leave the screen showing the old state.
      if (removedFrom) {
        refresh();
        refreshReference();
      }
    } finally {
      setSavingTeam(false);
    }
  }

  function openBankAccess(employee: Employee) {
    setAssigning(employee);
    // Seeded from the list row, which carries the server's `assignedBanks`.
    setAssignBankIds([...employee.assignedBanks]);
    setAssignError(null);
  }

  function closeBankAccess() {
    setAssigning(null);
    setAssignBankIds([]);
    setAssignError(null);
  }

  function toggleAssignBank(bankId: string) {
    setAssignBankIds((prev) =>
      prev.includes(bankId) ? prev.filter((id) => id !== bankId) : [...prev, bankId],
    );
  }

  /**
   * Saves bank access through `PUT /api/users/:id/banks` — the route that owns
   * this relationship.
   *
   * Deliberately NOT part of the employee PATCH: `bankIds` is a many-to-many
   * relationship through `user_bank_access`, and since Task 2.5 the PATCH route
   * refuses it with a 422 pointing here (D-025). This is its own request.
   *
   * The route replaces the whole grant list in one transaction and audits the
   * change with a from/to pair, so the client sends the complete desired set and
   * writes nothing itself.
   */
  async function saveBankAccess() {
    if (!assigning) return;

    setAssignError(null);
    setSavingBanks(true);
    try {
      const result = await api.replace<{ userId: string; bankIds: string[] }>(
        `/users/${assigning.id}/banks`,
        { bankIds: assignBankIds },
      );

      /*
       * Reflect what the SERVER stored, not what was typed. The response carries
       * the persisted list, so a partial or reordered result cannot be hidden by
       * optimistic state — and `refresh()` re-reads the list regardless.
       */
      const saved = result.data.bankIds;
      setSelected((prev) =>
        prev && prev.id === assigning.id ? { ...prev, assignedBanks: saved } : prev,
      );
      refresh();
      refreshReference();
      toast.success("Bank access updated", {
        description: saved.length
          ? `${assigning.name} can log files with ${saved.length} bank(s)`
          : `${assigning.name} has no bank access`,
      });
      closeBankAccess();
    } catch (err) {
      /*
       * The server's message is the useful one: 400 for a bank that does not
       * exist, 403 for a bank outside the actor's own scope or a target at or
       * above their role level, 422 for a malformed id.
       */
      setAssignError(errorMessage(err, "Could not update bank access."));
    } finally {
      setSavingBanks(false);
    }
  }

  function openEdit(employee: Employee) {
    setEditing(employee);
    setEditForm(formFromEmployee(employee));
    setEditError(null);
    setEditFields({});
  }

  function closeEdit() {
    setEditing(null);
    setEditForm(null);
    setEditError(null);
    setEditFields({});
  }

  /**
   * Saves only what changed.
   *
   * `buildEmployeePatch` diffs the form against the row the dialog opened on, so
   * an untouched field is absent from the body and the server leaves it alone
   * (BUG-036 made that guarantee real). Re-sending the whole form would work,
   * and would quietly overwrite anything a colleague changed in the meantime.
   */
  async function saveEdit() {
    if (!editing || !editForm) return;

    const invalid = validateEmployeeForm(editForm);
    if (invalid) return setEditError(invalid);

    const patch = buildEmployeePatch(editing, editForm);
    if (isEmptyPatch(patch)) {
      closeEdit();
      return;
    }

    setEditError(null);
    setEditFields({});
    setSavingEdit(true);
    try {
      await apiRequest(`/users/${editing.id}`, { method: "PATCH", body: patch });
      refresh();
      // Keep the detail dialog, if it is behind this one, showing what was saved.
      setSelected((prev) => (prev && prev.id === editing.id ? { ...prev, ...patch } : prev));
      toast.success("Employee updated", { description: editForm.name.trim() });
      closeEdit();
    } catch (err) {
      /*
       * The server's message is the useful one and is shown verbatim: 400 for
       * the Task 2.1 self-guard ("You cannot deactivate your own account"), 409
       * for the last-Super-Admin invariant, 403 for the role hierarchy, 422 for
       * a schema refusal. Replacing them with a generic string would hide the
       * only explanation the administrator gets.
       */
      const fallback = errorMessage(err, "Could not save this employee.");
      setEditFields(serverFieldErrors(err, EDIT_FIELDS).fields);
      setEditError(formLevelError(err, fallback, EDIT_FIELDS));
    } finally {
      setSavingEdit(false);
    }
  }

  const columns: Column<Employee>[] = [
    {
      key: "name",
      header: "Employee",
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback
              style={{
                background: `${row.avatarColor ?? "#1d4ed8"}1a`,
                color: row.avatarColor ?? "#1d4ed8",
              }}
            >
              {initials(row.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{row.name}</p>
            <p className="text-[11px] text-[var(--muted-foreground)]">{row.email}</p>
          </div>
        </div>
      ),
      exportValue: (row) => row.name,
    },
    {
      key: "employeeCode",
      header: "Code",
      sortValue: (row) => row.employeeCode,
      render: (row) => <span className="numeric text-xs">{row.employeeCode}</span>,
      exportValue: (row) => row.employeeCode,
    },
    {
      // Same defect as the loans "Type" column (BUG-039): `key` was "role" and
      // the field is `roleName`, so DataTable's fallback rendered "—" for every
      // employee. Unregistered twin, found by the 2026-09-06 audit.
      key: "role",
      header: "Role",
      sortValue: (row) => row.roleName,
      render: (row) => row.roleName || "—",
      exportValue: (row) => row.roleName,
    },
    { key: "branch", header: "Branch", sortValue: (row) => row.branch },
    {
      key: "assignedBanks",
      header: "Banks",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.assignedBanks.length === 0 && (
            <Badge variant="warning">No bank access</Badge>
          )}
          {row.assignedBanks.slice(0, 2).map((bankId) => (
            <Badge key={bankId} variant="outline">
              {bankName(bankId)}
            </Badge>
          ))}
          {row.assignedBanks.length > 2 && (
            <Badge variant="neutral">+{row.assignedBanks.length - 2}</Badge>
          )}
        </div>
      ),
      exportValue: (row) => row.assignedBanks.map(bankName).join(" | "),
    },
    {
      key: "target",
      header: "Target",
      align: "right",
      sortValue: (row) => row.target,
      render: (row) => (
        <span className="numeric">
          {row.target ? formatCurrency(row.target, { compact: true }) : "—"}
        </span>
      ),
      exportValue: (row) => row.target,
    },
    {
      key: "achievement",
      header: "Achievement",
      sortValue: (row) => (row.target ? row.achieved / row.target : 0),
      render: (row) => {
        if (!row.target) return <span className="text-[var(--muted-foreground)]">—</span>;
        const percent = Math.round((row.achieved / row.target) * 100);
        return (
          <div className="flex w-32 items-center gap-2">
            <Progress
              value={percent}
              indicatorClassName={percent >= 100 ? "bg-[var(--success)]" : undefined}
            />
            <span className="numeric text-xs">{percent}%</span>
          </div>
        );
      },
      exportValue: (row) => (row.target ? Math.round((row.achieved / row.target) * 100) : 0),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
      exportValue: (row) => row.status,
    },
    {
      key: "invite",
      header: "Setup",
      sortValue: (row) => inviteState(row),
      render: (row) => {
        const state = inviteState(row);
        return (
          <span
            className={
              state === "Accepted"
                ? "text-[11px] text-[var(--success)]"
                : state === "Invited"
                  ? "text-[11px] text-[var(--warning)]"
                  : "text-[11px] text-[var(--muted-foreground)]"
            }
          >
            {state}
          </span>
        );
      },
      exportValue: (row) => inviteState(row),
    },
  ];

  const active = rows.filter((row) => row.status === "Active");
  const chartRows = rows.filter((row) => row.target > 0).slice(0, 6);
  const selectedTeam = selected ? teamOf(selected.id) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Employees"
        description="Team members, the banks they can log files with, and how they are tracking against target."
        actions={
          can("users.create") ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" /> Add employee
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Team size"
          value={String(rows.length)}
          icon={Users}
          helper={`${active.length} active`}
        />
        <StatCard
          label="Combined target"
          value={formatCurrency(
            rows.reduce((total, row) => total + row.target, 0),
            { compact: true },
          )}
          icon={Award}
          accent="var(--info)"
          helper="quarter to date"
          index={1}
        />
        <StatCard
          label="Achieved"
          value={formatCurrency(
            rows.reduce((total, row) => total + row.achieved, 0),
            { compact: true },
          )}
          icon={Award}
          accent="var(--success)"
          helper="disbursed volume credited"
          index={2}
        />
        <StatCard
          label="Managers"
          value={String(rows.filter((row) => row.roleName === "Manager").length)}
          icon={UserCog}
          accent="var(--warning)"
          helper="with approval rights"
          index={3}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Target vs achieved"
          description="Volume credited against each team member"
          className="xl:col-span-2"
        >
          <EmployeeTargetChart rows={chartRows} />
        </SectionCard>

        <SectionCard
          title="Roles"
          description="What each role grants, straight from the permission catalogue"
          contentClassName="space-y-3"
        >
          {roles.map((role) => (
            <div key={role.id} className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium">{role.name}</span>
                <Badge variant={role.isSystem ? "info" : "neutral"}>
                  {role.permissions?.length ?? 0} permissions
                </Badge>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                {role.description ?? "—"}
              </p>
            </div>
          ))}
          <p className="flex items-center gap-1.5 pt-1 text-[11px] text-[var(--muted-foreground)]">
            <ShieldCheck className="size-3.5" /> Change what a role grants under Roles and
            permissions.
          </p>
        </SectionCard>
      </div>

      {/*
        * A failed load must never read as an empty database. `useResource`
        * clears `data` when the request rejects, so without this the table falls
        * through to its "no employees" empty state and reports an outcome the
        * request never achieved (D-004).
        *
        * Same shape as the recycle-bin screen, which is the only other page that
        * surfaces this hook's error today.
        */}
      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={refresh}>
            Try again
          </Button>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <SectionCard title="Employees" description="Loading the employee list…">
          <div className="space-y-2" data-testid="employees-loading">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </SectionCard>
      ) : loadError ? (
        // The table is suppressed entirely on failure: an empty grid beside an
        // error banner still invites the reader to conclude there is no data.
        <SectionCard title="Employees" description="This list could not be loaded.">
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            Nothing is shown because the request failed — not because there are no employees.
          </p>
        </SectionCard>
      ) : (
      <DataTable
        rows={rows}
        columns={columns}
        exportName="risenext-employees"
        searchPlaceholder="Search name, email, code, or branch"
        searchText={(row) =>
          `${row.name} ${row.employeeCode} ${row.email} ${row.branch} ${row.roleName}`
        }
        filters={[
          {
            key: "role",
            label: "Role",
            options: Array.from(new Set(rows.map((row) => row.roleName))),
            value: (row) => row.roleName,
          },
          {
            key: "status",
            label: "Status",
            options: ["Active", "Inactive"],
            value: (row) => row.status,
          },
          {
            key: "invite",
            label: "Setup",
            options: ["Accepted", "Invited", "Not invited"],
            value: (row) => inviteState(row),
          },
        ]}
        onRowClick={(row) => setSelected(row)}
      />
      )}

      {/* ------------------------------------------------------ employee detail */}

      <Dialog open={Boolean(selected)} onOpenChange={(value) => !value && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>
                  {selected.roleName} · {selected.branch ?? "No branch"}
                </DialogDescription>
              </DialogHeader>
              <div>
                <DetailRow label="Employee code" value={selected.employeeCode} mono />
                <DetailRow label="Email" value={selected.email} />
                <DetailRow label="Phone" value={selected.phone ?? "—"} mono />
                <DetailRow label="Team" value={selectedTeam?.name ?? "Unassigned"} />
                <DetailRow label="Joined" value={formatDate(selected.joinedOn)} />
                <DetailRow
                  label="Account setup"
                  value={
                    selected.inviteAcceptedAt
                      ? `Accepted ${formatDate(selected.inviteAcceptedAt)}`
                      : selected.invitedAt
                        ? // "Invited", not "emailed" — see the note on inviteState.
                          `Invited ${formatDate(selected.invitedAt)}, not yet accepted`
                        : "Never invited"
                  }
                />
                <DetailRow label="Last signed in" value={formatDate(selected.lastLoginAt)} />
                <DetailRow
                  label="Assigned banks"
                  value={
                    selected.assignedBanks.length
                      ? selected.assignedBanks.map(bankName).join(", ")
                      : "None"
                  }
                />
                <DetailRow
                  label="Customers owned"
                  value={customers.filter((c) => c.assignedUserId === selected.id).length}
                  mono
                />
                <DetailRow
                  label="Files logged"
                  value={loans.filter((loan) => loan.assignedUserId === selected.id).length}
                  mono
                />
                <DetailRow label="Status" value={<StatusBadge status={selected.status} />} />
              </div>
              <DialogFooter className="sm:justify-between">
                {can("users.reset_password") ? (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => resetPassword(selected)}>
                      <KeyRound className="size-4" /> Reset password
                    </Button>
                    {/*
                      * Roadmap 3.8. Gated on the SAME permission the backend
                      * route requires — `users.reset_password`, because a setup
                      * link is a way in, and its holder can already mint a
                      * temporary password for this person.
                      *
                      * Shown only in the state the server will actually accept:
                      * an active employee who has not finished setup. Someone
                      * who has their own password gets the reset button beside
                      * it instead, and the route refuses them a 409 regardless —
                      * this gate is convenience, the backend is the authority.
                      */}
                    {!selected.inviteAcceptedAt && selected.status === "Active" && (
                      <Button
                        variant="outline"
                        onClick={() => resendInvitation(selected)}
                        disabled={resending}
                      >
                        <MailPlus className="size-4" />
                        {/*
                          * "Resend" is untrue for an employee who has never had
                          * one — the route deliberately allows them, since every
                          * employee predating Task 3.5 has no invitation at all.
                          */}
                        {resending
                          ? "Sending…"
                          : selected.invitedAt
                            ? "Resend invitation"
                            : "Send invitation"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <span />
                )}
                {(can("users.edit") ||
                  can("users.assign") ||
                  can("teams.assign") ||
                  can("users.delete")) && (
                  <div className="flex gap-2">
                    {/*
                      * Bank access is gated on `users.assign`, which is a
                      * DIFFERENT permission from `users.edit` — the route
                      * requires it, so a holder of only `users.edit` would get a
                      * 403. The gate is UI convenience; the backend is the
                      * authority either way.
                      *
                      * Team membership is a THIRD permission again,
                      * `teams.assign`, because it is a different route on a
                      * different resource. Never inferred from a role name.
                      */}
                    {can("teams.assign") && (
                      <Button variant="outline" onClick={() => openTeamAssign(selected)}>
                        <Users className="size-4" /> Team
                      </Button>
                    )}
                    {can("users.assign") && (
                      <Button variant="outline" onClick={() => openBankAccess(selected)}>
                        <Building2 className="size-4" /> Bank access
                      </Button>
                    )}
                    {can("users.edit") && (
                      <Button variant="outline" onClick={() => openEdit(selected)}>
                        <Pencil className="size-4" /> Edit
                      </Button>
                    )}
                    {can("users.edit") && (
                      <Button
                        variant={selected.status === "Active" ? "destructive" : "success"}
                        onClick={() => toggleStatus(selected)}
                      >
                        {selected.status === "Active" ? "Revoke access" : "Restore access"}
                      </Button>
                    )}
                    {/*
                      * A FOURTH permission again — `users.delete`. Revoking
                      * access and deleting are different operations on different
                      * routes, so they cannot share a gate.
                      */}
                    {can("users.delete") && (
                      <Button variant="destructive" onClick={() => openDelete(selected)}>
                        <Trash2 className="size-4" /> Delete
                      </Button>
                    )}
                  </div>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------ add employee / credential hand-over */}

      <Dialog open={open} onOpenChange={(value) => (value ? setOpen(true) : closeCreate())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {credential ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {credential.reason === "created" ? "Employee created" : "Temporary password issued"}
                </DialogTitle>
                <DialogDescription>
                  {/*
                    * Roadmap 3.9 — the copy follows the delivery outcome. When a
                    * link really was emailed, pushing the administrator to read
                    * a password aloud works against the invitation model
                    * (D-037); when it was not, the password is the only way in
                    * and saying so plainly is the point of the fallback.
                    */}
                  {credential.delivery === "sent"
                    ? `An invitation link was emailed to ${credential.name}. Keep this password in case it does not arrive.`
                    : `Hand these details to ${credential.name} so they can sign in.`}
                </DialogDescription>
              </DialogHeader>

              <CredentialHandover credential={credential} />

              <DialogFooter>
                <Button onClick={closeCreate}>I have saved the password</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Add employee</DialogTitle>
                <DialogDescription>
                  The account is created immediately and a one-time password is shown to you on the
                  next step.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="emp-name">Full name</Label>
                  <Input
                    id="emp-name"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                  <FieldError message={formFields.name} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-email">Work email</Label>
                  <Input
                    id="emp-email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="name@risenext.com"
                    autoComplete="off"
                  />
                  <FieldError message={formFields.email} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-code">Employee code</Label>
                  <Input
                    id="emp-code"
                    value={form.employeeCode}
                    onChange={(event) => setForm({ ...form, employeeCode: event.target.value })}
                    placeholder="Assigned automatically"
                  />
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Leave blank and the next code is assigned when the employee is saved. Type one
                    to keep an existing numbering scheme.
                  </p>
                  <FieldError message={formFields.employeeCode} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-phone">Phone</Label>
                  <Input
                    id="emp-phone"
                    value={form.phone}
                    maxLength={10}
                    onChange={(event) =>
                      setForm({ ...form, phone: event.target.value.replace(/\D/g, "") })
                    }
                  />
                  <FieldError message={formFields.phone} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-branch">Branch</Label>
                  <Input
                    id="emp-branch"
                    value={form.branch}
                    onChange={(event) => setForm({ ...form, branch: event.target.value })}
                  />
                  <FieldError message={formFields.branch} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-role">Role</Label>
                  <Select
                    value={form.roleId}
                    onValueChange={(value) => setForm({ ...form, roleId: value })}
                  >
                    <SelectTrigger id="emp-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedRole && (
                    <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                      {selectedRole.description ?? "—"} ·{" "}
                      {selectedRole.permissions?.length ?? 0} permissions
                    </p>
                  )}
                  <FieldError message={formFields.roleId} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emp-team">Team</Label>
                  <Select
                    value={form.teamId}
                    onValueChange={(value) => setForm({ ...form, teamId: value })}
                  >
                    <SelectTrigger id="emp-team">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TEAM}>No team</SelectItem>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={formFields.teamId} />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="emp-target">Quarterly target</Label>
                  <Input
                    id="emp-target"
                    value={form.target}
                    onChange={(event) =>
                      setForm({ ...form, target: event.target.value.replace(/\D/g, "") })
                    }
                  />
                  <FieldError message={formFields.target} />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>Bank access</Label>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Records are scoped to these banks. An employee with none assigned signs in
                    successfully but sees an empty workspace.
                  </p>
                  <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-[var(--border)] p-2.5 scrollbar-thin">
                    {banks.length === 0 && (
                      <p className="px-1 py-2 text-xs text-[var(--muted-foreground)]">
                        No banks are available to assign.
                      </p>
                    )}
                    {banks.map((bank) => (
                      <label
                        key={bank.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 text-[13px] hover:bg-[var(--secondary)]"
                      >
                        <Checkbox
                          checked={form.bankIds.includes(bank.id)}
                          onCheckedChange={() => toggleBank(bank.id)}
                        />
                        {bank.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {formError && (
                <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                  {formError}
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeCreate} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={addEmployee} disabled={saving}>
                  {saving ? "Creating…" : "Create employee"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------- edit employee */}

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(value) => (value ? undefined : closeEdit())}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {editing && editForm && (
            <>
              <DialogHeader>
                <DialogTitle>Edit employee</DialogTitle>
                <DialogDescription>
                  Only the fields you change are sent. Bank access, team and joining date are
                  set when the account is created and are not editable here.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="edit-name">Full name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                  />
                  <FieldError message={editFields.name} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-email">Work email</Label>
                  <Input
                    id="edit-email"
                    value={editForm.email}
                    onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                    autoComplete="off"
                  />
                  <FieldError message={editFields.email} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-code">Employee code</Label>
                  <Input
                    id="edit-code"
                    value={editForm.employeeCode}
                    onChange={(event) =>
                      setEditForm({ ...editForm, employeeCode: event.target.value })
                    }
                  />
                  <FieldError message={editFields.employeeCode} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    value={editForm.phone}
                    maxLength={10}
                    onChange={(event) =>
                      setEditForm({ ...editForm, phone: event.target.value.replace(/\D/g, "") })
                    }
                  />
                  <FieldError message={editFields.phone} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-branch">Branch</Label>
                  <Input
                    id="edit-branch"
                    value={editForm.branch}
                    onChange={(event) => setEditForm({ ...editForm, branch: event.target.value })}
                  />
                  <FieldError message={editFields.branch} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-role">Role</Label>
                  <Select
                    value={editForm.roleId}
                    onValueChange={(value) => setEditForm({ ...editForm, roleId: value })}
                  >
                    <SelectTrigger id="edit-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {editableRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={editFields.roleId} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(value) =>
                      setEditForm({ ...editForm, status: value as Employee["status"] })
                    }
                  >
                    <SelectTrigger id="edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError message={editFields.status} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-target">Quarterly target</Label>
                  <Input
                    id="edit-target"
                    value={editForm.target}
                    onChange={(event) =>
                      setEditForm({ ...editForm, target: event.target.value.replace(/\D/g, "") })
                    }
                  />
                  <FieldError message={editFields.target} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-achieved">Achieved</Label>
                  <Input
                    id="edit-achieved"
                    value={editForm.achieved}
                    onChange={(event) =>
                      setEditForm({ ...editForm, achieved: event.target.value.replace(/\D/g, "") })
                    }
                  />
                  <FieldError message={editFields.achieved} />
                </div>
              </div>

              {editError && (
                <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                  {editError}
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeEdit} disabled={savingEdit}>
                  Cancel
                </Button>
                <Button onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------------------------- delete */}

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(value) => (value ? undefined : closeDelete())}
      >
        <DialogContent>
          {deleting && (
            <>
              <DialogHeader>
                <DialogTitle>Delete {deleting.name}?</DialogTitle>
                <DialogDescription>
                  This removes {deleting.name} from the employee list and ends their access. Work
                  they logged — customers, files and history — stays in the system and stays
                  attributed to them.
                </DialogDescription>
                {/*
                  * The route is a soft delete: `deletedAt`/`deletedBy` are
                  * stamped and the account is deactivated, but no row is
                  * destroyed until the entry is purged.
                  */}
              </DialogHeader>

              {/*
                * Task 2.9 added `user` to BIN_REGISTRY and routed this delete
                * through `softDelete`, so the record now goes to the recycle bin
                * and can be restored. Until then this paragraph said the
                * opposite, correctly. Both halves of the promise below are
                * asserted by tests — the bin entry in `user-recycle-bin.test.ts`,
                * and the fact that a restored employee comes back deactivated.
                */}
              <p className="rounded-md bg-[var(--warning-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--warning)]">
                <strong>This moves {deleting.name} to the recycle bin.</strong> An administrator can
                restore the record from there, and it is purged for good once the retention window
                elapses. A restored employee comes back <strong>deactivated</strong> — their access
                has to be granted again deliberately.
              </p>

              <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                If you only need to stop someone signing in, close this and use{" "}
                <strong>Revoke access</strong> instead — it leaves them in the employee list.
              </p>

              {deleteError && (
                <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                  {deleteError}
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeDelete} disabled={deletingNow}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmDelete} disabled={deletingNow}>
                  {deletingNow ? "Deleting…" : "Delete employee"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------- team membership */}

      <Dialog
        open={Boolean(teamAssigning)}
        onOpenChange={(value) => (value ? undefined : closeTeamAssign())}
      >
        <DialogContent>
          {teamAssigning && (
            <>
              <DialogHeader>
                <DialogTitle>Team</DialogTitle>
                <DialogDescription>
                  Which team {teamAssigning.name} belongs to. Changing this moves them off their
                  current team; everyone else on both teams stays where they are.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="emp-team-assign">Team</Label>
                <Select value={teamChoice} onValueChange={setTeamChoice}>
                  <SelectTrigger id="emp-team-assign">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEAM}>No team</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {teams.length === 0 && (
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    No teams are available to assign.
                  </p>
                )}
              </div>

              {teamError && (
                <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                  {teamError}
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeTeamAssign} disabled={savingTeam}>
                  Cancel
                </Button>
                <Button onClick={saveTeamMembership} disabled={savingTeam}>
                  {savingTeam ? "Saving…" : "Save team"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------------------- bank access */}

      <Dialog
        open={Boolean(assigning)}
        onOpenChange={(value) => (value ? undefined : closeBankAccess())}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {assigning && (
            <>
              <DialogHeader>
                <DialogTitle>Bank access</DialogTitle>
                <DialogDescription>
                  Which banks {assigning.name} may log files with. Records are scoped to this
                  list, and saving replaces it entirely.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-md border border-[var(--border)] p-2.5 scrollbar-thin">
                  {banks.length === 0 && (
                    <p className="px-1 py-2 text-xs text-[var(--muted-foreground)]">
                      No banks are available to assign.
                    </p>
                  )}
                  {banks.map((bank) => (
                    <label
                      key={bank.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 text-[13px] hover:bg-[var(--secondary)]"
                    >
                      <Checkbox
                        checked={assignBankIds.includes(bank.id)}
                        onCheckedChange={() => toggleAssignBank(bank.id)}
                      />
                      {bank.name}
                    </label>
                  ))}
                </div>

                {assignBankIds.length === 0 ? (
                  <p className="rounded-md bg-[var(--warning-soft)] px-3 py-2 text-[11px] leading-relaxed text-[var(--warning)]">
                    With no banks assigned this employee can still sign in, but their workspace
                    will be empty — every list is scoped to the banks above.
                  </p>
                ) : (
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {assignBankIds.length} of {banks.length} bank(s) selected.
                  </p>
                )}
              </div>

              {assignError && (
                <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                  {assignError}
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeBankAccess} disabled={savingBanks}>
                  Cancel
                </Button>
                <Button onClick={saveBankAccess} disabled={savingBanks}>
                  {savingBanks ? "Saving\u2026" : "Save bank access"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
