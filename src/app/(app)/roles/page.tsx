"use client";

import * as React from "react";
import { AlertTriangle, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useAuth } from "@/hooks/use-auth";
import { useResource } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { formLevelError, serverFieldErrors } from "@/lib/field-errors";
import type { Permission, Role } from "@/lib/types";
import { toast } from "sonner";

/**
 * ROLES AND PERMISSIONS — Task 12.1.
 *
 * Every route this screen uses has existed since the first migration and had
 * **zero frontend callers**: `GET /api/roles`, `GET /api/roles/permissions`,
 * `POST`, `PATCH /:id`, `PUT /:id/permissions`, `DELETE /:id`. The permission
 * model — the thing that decides what all five roles may do — was editable only
 * with a REST client.
 *
 * ── THE UI MIRRORS THE SERVER'S RULES, IT DOES NOT REPLACE THEM ─────────────
 *
 * The backend is the authority and refuses on its own (`assertCanManageRoleLevel`,
 * `assertCanGrantPermissions`, `assertRoleMutable`). Three of those rules are
 * ALSO applied here, and only because the alternative is offering a control that
 * is certain to 403:
 *
 *   · a role at or above your own level is read-only to you;
 *   · a permission you do not hold cannot be ticked — it is disabled and says
 *     why, rather than being hidden, because hiding it would make the matrix
 *     look like the role's full grant when it is not;
 *   · the system role is never editable or deletable.
 *
 * None of that is security. Every one of them is re-checked server-side, and a
 * refusal that arrives anyway is shown verbatim rather than swallowed.
 *
 * ── SERVER-RETURNED DATA IS THE TRUTH ───────────────────────────────────────
 *
 * No optimistic state anywhere. A save awaits the response and then re-reads the
 * list; the matrix's draft is discarded on close rather than merged, so a
 * partially-applied change can never be left on screen looking applied. D-026.
 */

/** Groups `customers.view` … under `customers`, in the catalogue's own order. */
function groupByResource(permissions: Permission[]): [string, Permission[]][] {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions) {
    const list = groups.get(permission.resource) ?? [];
    list.push(permission);
    groups.set(permission.resource, list);
  }
  return [...groups.entries()];
}

const label = (value: string) => value.replace(/_/g, " ");

/** The keys this screen renders a control for — see `serverFieldErrors`. */
const FORM_FIELDS = ["key", "name", "description", "level", "permissions"] as const;

export default function RolesPage() {
  const { user, can } = useAuth();
  const {
    data: roles,
    loading,
    error,
    refresh,
  } = useResource<Role>("/roles");
  const { data: permissions, loading: loadingPermissions } =
    useResource<Permission>("/roles/permissions");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Role | null>(null);
  const [matrixFor, setMatrixFor] = React.useState<Role | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<Role | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [issues, setIssues] = React.useState<Record<string, string>>({});
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({ key: "", name: "", description: "", level: "50" });
  const [draft, setDraft] = React.useState<Set<string>>(new Set());

  /** The one rule the whole screen turns on. Mirrors `assertCanManageRoleLevel`. */
  const outranks = React.useCallback(
    (level: number) => {
      if (!user) return false;
      if (user.permissions.includes("system.manage_any_user")) return true;
      return level > user.role.level;
    },
    [user],
  );

  const mine = React.useMemo(() => new Set(user?.permissions ?? []), [user]);

  function resetDialogState() {
    setIssues({});
    setDialogError(null);
  }

  /**
   * A refusal is shown where it belongs and never swallowed. Field-level 422
   * messages land under the control they name (D-031); anything else stays as
   * one line at the foot of the dialog, plus a toast so a refusal is noticed
   * even if the dialog has been scrolled.
   */
  function surface(err: unknown) {
    const { fields } = serverFieldErrors(err, FORM_FIELDS);
    setIssues(fields);
    setDialogError(formLevelError(err, errorMessage(err), FORM_FIELDS));
    toast.error("The server refused that change", { description: errorMessage(err) });
  }

  /* ------------------------------------------------------------------ create */

  async function createRole() {
    setBusy(true);
    resetDialogState();
    try {
      await api.create<Role>("/roles", {
        key: form.key.trim().toLowerCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        level: Number(form.level),
        permissions: [...draft],
      });
      setCreateOpen(false);
      setForm({ key: "", name: "", description: "", level: "50" });
      setDraft(new Set());
      refresh();
      toast.success("Role created");
    } catch (err) {
      surface(err);
    } finally {
      setBusy(false);
    }
  }

  /* -------------------------------------------------------------------- edit */

  async function saveRole() {
    if (!editing) return;
    setBusy(true);
    resetDialogState();
    try {
      await api.update<Role>(`/roles/${editing.id}`, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        level: Number(form.level),
      });
      setEditing(null);
      refresh();
      toast.success("Role updated");
    } catch (err) {
      surface(err);
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------ matrix */

  async function savePermissions() {
    if (!matrixFor) return;
    setBusy(true);
    resetDialogState();
    try {
      /*
       * The whole grant is replaced, which is what `PUT` means here. Sending a
       * delta would need the client to know what the server currently holds,
       * and two operators editing at once would each silently undo the other.
       */
      await api.replace(`/roles/${matrixFor.id}/permissions`, { permissions: [...draft] });
      setMatrixFor(null);
      // Re-read rather than merging the draft in: the response is the request
      // echoed, and the list route is what computes each role's grant.
      refresh();
      toast.success("Permissions saved");
    } catch (err) {
      surface(err);
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------ delete */

  async function deleteRole() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await api.remove(`/roles/${confirmDelete.id}`);
      setConfirmDelete(null);
      refresh();
      toast.success("Role deleted");
    } catch (err) {
      // A role still assigned to somebody answers 409 with the count. That is
      // the most useful sentence on the screen — show it as it arrived.
      toast.error("Could not delete this role", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------- views */

  if (!can("roles.view")) {
    return (
      <>
        <PageHeader eyebrow="Administration" title="Roles and permissions" />
        <SectionCard title="Not available to your role" description="">
          <p className="text-sm text-[var(--muted-foreground)]">
            Your role cannot view the permission model. It needs{" "}
            <code className="text-[11px]">roles.view</code>.
          </p>
        </SectionCard>
      </>
    );
  }

  const grouped = groupByResource(permissions);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Roles and permissions"
        description="What each role may do. A role can never be given a permission you do not hold yourself."
        actions={
          can("roles.create") ? (
            <Button
              onClick={() => {
                setDraft(new Set());
                setForm({ key: "", name: "", description: "", level: "50" });
                resetDialogState();
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" /> New role
            </Button>
          ) : undefined
        }
      />

      {loading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <SectionCard title="Could not load roles" description="Nothing has been changed">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
            <div className="space-y-2">
              <p className="text-sm">{error}</p>
              <Button variant="outline" size="sm" onClick={refresh}>
                Try again
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      {!loading && !error && roles.length === 0 && (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="No roles yet"
            description="Every account needs a role. Create one to describe what a group of people may do."
          />
        </Card>
      )}

      {!loading && !error && roles.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => {
            const editable = !role.isSystem && outranks(role.level);
            const granted = role.permissions ?? [];
            return (
              <Card key={role.id} className="flex flex-col gap-3 p-5" data-role={role.key}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      {role.name}
                      {role.isSystem && (
                        <Badge variant="outline" className="gap-1">
                          <Lock className="size-3" /> System
                        </Badge>
                      )}
                    </p>
                    <p className="numeric text-[11px] text-[var(--muted-foreground)]">
                      {role.key} · level {role.level}
                    </p>
                  </div>
                  <Badge variant="outline">{granted.length} permissions</Badge>
                </div>

                <p className="min-h-[32px] text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                  {role.description ?? "No description."}
                </p>

                {!editable && (
                  <p className="rounded-md bg-[var(--secondary)] px-2.5 py-1.5 text-[11px] text-[var(--muted-foreground)]">
                    {role.isSystem
                      ? "The system role always holds every permission and cannot be edited."
                      : "This role is at or above your own level, so you cannot change it."}
                  </p>
                )}

                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!editable || !can("roles.edit")}
                    onClick={() => {
                      setForm({
                        key: role.key,
                        name: role.name,
                        description: role.description ?? "",
                        level: String(role.level),
                      });
                      resetDialogState();
                      setEditing(role);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!editable || !can("roles.assign_permissions")}
                    onClick={() => {
                      setDraft(new Set(granted));
                      resetDialogState();
                      setMatrixFor(role);
                    }}
                  >
                    Permissions
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!editable || !can("roles.delete")}
                    onClick={() => setConfirmDelete(role)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ================================================================= */}
      {/* CREATE                                                            */}
      {/* ================================================================= */}

      <Dialog open={createOpen} onOpenChange={(open) => !open && setCreateOpen(false)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New role</DialogTitle>
            <DialogDescription>
              A lower level means more authority. You cannot create a role at or above your own
              level ({user?.role.level ?? "—"}).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="role-key">Key</Label>
              <Input
                id="role-key"
                value={form.key}
                placeholder="branch_auditor"
                onChange={(event) => setForm({ ...form, key: event.target.value })}
              />
              {issues.key && <p className="text-[11px] text-[var(--danger)]">{issues.key}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                value={form.name}
                placeholder="Branch Auditor"
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              {issues.name && <p className="text-[11px] text-[var(--danger)]">{issues.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-level">Level</Label>
              <Input
                id="role-level"
                type="number"
                value={form.level}
                onChange={(event) => setForm({ ...form, level: event.target.value })}
              />
              {issues.level && <p className="text-[11px] text-[var(--danger)]">{issues.level}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="role-description">Description</Label>
              <Textarea
                id="role-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>
          </div>

          <PermissionMatrix
            grouped={grouped}
            loading={loadingPermissions}
            draft={draft}
            setDraft={setDraft}
            mine={mine}
            unrestricted={mine.has("system.manage_any_user")}
          />

          {dialogError && <p className="text-[12px] text-[var(--danger)]">{dialogError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createRole} disabled={busy}>
              {busy ? "Creating…" : "Create role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* EDIT                                                              */}
      {/* ================================================================= */}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
            <DialogDescription>
              The key is fixed once a role exists — routes and grants reference it.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              {issues.name && <p className="text-[11px] text-[var(--danger)]">{issues.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-level">Level</Label>
              <Input
                id="edit-level"
                type="number"
                value={form.level}
                onChange={(event) => setForm({ ...form, level: event.target.value })}
              />
              {issues.level && <p className="text-[11px] text-[var(--danger)]">{issues.level}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>
          </div>

          {dialogError && <p className="text-[12px] text-[var(--danger)]">{dialogError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveRole} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* PERMISSION MATRIX                                                 */}
      {/* ================================================================= */}

      <Dialog open={Boolean(matrixFor)} onOpenChange={(open) => !open && setMatrixFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Permissions for {matrixFor?.name}</DialogTitle>
            <DialogDescription>
              Saving replaces the whole grant. Anything unticked is revoked.
            </DialogDescription>
          </DialogHeader>

          <PermissionMatrix
            grouped={grouped}
            loading={loadingPermissions}
            draft={draft}
            setDraft={setDraft}
            mine={mine}
            unrestricted={mine.has("system.manage_any_user")}
          />

          {dialogError && <p className="text-[12px] text-[var(--danger)]">{dialogError}</p>}

          <DialogFooter className="sm:justify-between">
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {draft.size} selected
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMatrixFor(null)}>
                Cancel
              </Button>
              <Button onClick={savePermissions} disabled={busy}>
                {busy ? "Saving…" : "Save permissions"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* DELETE                                                            */}
      {/* ================================================================= */}

      <Dialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.name}?</DialogTitle>
            <DialogDescription>
              A role that is still assigned to anybody cannot be deleted — reassign those people
              first. This is not reversible: roles are not kept in the recycle bin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteRole} disabled={busy}>
              {busy ? "Deleting…" : "Delete role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The grid of tick boxes.
 *
 * A permission the signed-in user does not hold is rendered **disabled and
 * labelled**, not hidden. `assertCanGrantPermissions` refuses it server-side, so
 * offering it would guarantee a 403; hiding it would make the matrix read as the
 * role's complete grant when the role may in fact hold keys the viewer cannot
 * see. Disabled-and-explained is the only honest option of the three.
 */
function PermissionMatrix({
  grouped,
  loading,
  draft,
  setDraft,
  mine,
  unrestricted,
}: {
  grouped: [string, Permission[]][];
  loading: boolean;
  draft: Set<string>;
  setDraft: React.Dispatch<React.SetStateAction<Set<string>>>;
  mine: Set<string>;
  unrestricted: boolean;
}) {
  if (loading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (!grouped.length) {
    return (
      <p className="text-[12px] text-[var(--muted-foreground)]">
        The permission catalogue could not be loaded, so nothing can be granted here.
      </p>
    );
  }

  const toggle = (key: string) =>
    setDraft((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
      {grouped.map(([resource, list]) => (
        <div key={resource}>
          <p className="eyebrow pb-1.5">{label(resource)}</p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((permission) => {
              const blocked = !unrestricted && !mine.has(permission.key);
              return (
                <label
                  key={permission.key}
                  htmlFor={`perm-${permission.key}`}
                  title={
                    blocked
                      ? "You do not hold this permission, so you cannot grant it."
                      : (permission.description ?? permission.key)
                  }
                  className="flex items-center gap-2 text-[12px]"
                >
                  <Checkbox
                    id={`perm-${permission.key}`}
                    checked={draft.has(permission.key)}
                    disabled={blocked}
                    onCheckedChange={() => toggle(permission.key)}
                  />
                  <span className={blocked ? "text-[var(--muted-foreground)] line-through" : ""}>
                    {label(permission.action)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
