"use client";

import * as React from "react";
import { AlertTriangle, Plus, Trash2, Users } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useReference } from "@/hooks/use-reference";
import { api, errorMessage } from "@/lib/api";
import { formLevelError, serverFieldErrors } from "@/lib/field-errors";
import type { Employee, Team } from "@/lib/types";
import { toast } from "sonner";

/**
 * TEAMS — Tasks 12.2 and 12.3.
 *
 * ── WHAT WAS MISSING ────────────────────────────────────────────────────────
 *
 * There was **no teams screen of any kind**. `POST /api/teams` had no caller, so
 * a fresh deployment had zero teams and no in-product way to make one — and the
 * employee screen's team assignment (Task 2.7) could only ever move people
 * between teams that a REST client had created. `PATCH /api/teams/:id` did not
 * exist at all until Task 12.3, so a team's name, description, leader and status
 * were fixed for the life of the record.
 *
 * ── THE ROSTER IS REPLACED WHOLESALE, AND THAT IS DELIBERATE ────────────────
 *
 * `PUT /api/teams/:id/members` takes the complete roster and replaces it. This
 * screen therefore submits the complete roster too, built from a **fresh read of
 * the server's** membership each time the dialog opens — never merged with
 * anything held locally. That matters more than it looks:
 *
 *   · the backend authorizes over `previous ∪ submitted` precisely because
 *     omitting a name is an act upon that person (BUG-038 / SEC-029). Submitting
 *     a stale roster would evict whoever joined since the page loaded, and the
 *     server would authorize the eviction perfectly correctly;
 *   · so on success the list is **re-read**, not patched in memory. The response
 *     is the request echoed; the list route is what computes each team's roster.
 *
 * ── SCOPING ─────────────────────────────────────────────────────────────────
 *
 * `GET /api/teams` and `GET /api/users` are both scoped by the API. The member
 * picker offers exactly the colleagues `useReference` returned, so a scoped
 * operator cannot roster somebody they cannot see — not because this screen
 * filters, but because they were never sent.
 */

const FORM_FIELDS = ["name", "description", "leaderId", "status", "userIds"] as const;

interface TeamRow extends Team {
  members?: { teamId: string; userId: string; name: string }[];
}

const NONE = "__none__";

export default function TeamsPage() {
  const { can } = useAuth();
  const { data: teams, loading, error, refresh } = useResource<TeamRow>("/teams");
  const { employees, refresh: refreshReference } = useReference();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TeamRow | null>(null);
  const [rosterFor, setRosterFor] = React.useState<TeamRow | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<TeamRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [issues, setIssues] = React.useState<Record<string, string>>({});
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    name: "",
    description: "",
    leaderId: NONE,
    status: "Active",
  });
  const [roster, setRoster] = React.useState<Set<string>>(new Set());

  function resetDialogState() {
    setIssues({});
    setDialogError(null);
  }

  function surface(err: unknown) {
    const { fields } = serverFieldErrors(err, FORM_FIELDS);
    setIssues(fields);
    setDialogError(formLevelError(err, errorMessage(err), FORM_FIELDS));
    toast.error("The server refused that change", { description: errorMessage(err) });
  }

  const body = () => ({
    name: form.name.trim(),
    description: form.description.trim() || null,
    leaderId: form.leaderId === NONE ? null : form.leaderId,
    status: form.status,
  });

  async function createTeam() {
    setBusy(true);
    resetDialogState();
    try {
      await api.create<Team>("/teams", body());
      setCreateOpen(false);
      refresh();
      refreshReference();
      toast.success("Team created");
    } catch (err) {
      surface(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveTeam() {
    if (!editing) return;
    setBusy(true);
    resetDialogState();
    try {
      await api.update<Team>(`/teams/${editing.id}`, body());
      setEditing(null);
      refresh();
      refreshReference();
      toast.success("Team updated");
    } catch (err) {
      surface(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveRoster() {
    if (!rosterFor) return;
    setBusy(true);
    resetDialogState();
    try {
      await api.replace(`/teams/${rosterFor.id}/members`, { userIds: [...roster] });
      setRosterFor(null);
      // Re-read. Merging the draft into the row we hold would show a roster the
      // server may have authorized differently.
      refresh();
      refreshReference();
      toast.success("Team members updated");
    } catch (err) {
      surface(err);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTeam() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await api.remove(`/teams/${confirmDelete.id}`);
      setConfirmDelete(null);
      refresh();
      refreshReference();
      toast.success("Team deleted");
    } catch (err) {
      toast.error("Could not delete this team", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (!can("teams.view")) {
    return (
      <>
        <PageHeader eyebrow="Administration" title="Teams" />
        <SectionCard title="Not available to your role" description="">
          <p className="text-sm text-[var(--muted-foreground)]">
            Your role cannot view teams. It needs <code className="text-[11px]">teams.view</code>.
          </p>
        </SectionCard>
      </>
    );
  }

  const nameOf = (id: string | null) =>
    employees.find((employee) => employee.id === id)?.name ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Teams"
        description="Who reports where. Membership is replaced as a whole roster, so removing a name is a change to that person's record too."
        actions={
          can("teams.create") ? (
            <Button
              onClick={() => {
                setForm({ name: "", description: "", leaderId: NONE, status: "Active" });
                resetDialogState();
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" /> New team
            </Button>
          ) : undefined
        }
      />

      {loading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <SectionCard title="Could not load teams" description="Nothing has been changed">
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

      {!loading && !error && teams.length === 0 && (
        <Card>
          <EmptyState
            icon={Users}
            title="No teams yet"
            description="A team groups executives under a leader. Create the first one to start assigning people."
            action={
              can("teams.create") ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" /> New team
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {!loading && !error && teams.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => {
            const members = team.members ?? [];
            return (
              <Card key={team.id} className="flex flex-col gap-3 p-5" data-team={team.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{team.name}</p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      Led by {nameOf(team.leaderId) ?? "nobody yet"}
                    </p>
                  </div>
                  <StatusBadge status={team.status} />
                </div>

                <p className="min-h-[32px] text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                  {team.description ?? "No description."}
                </p>

                <div className="flex flex-wrap gap-1">
                  {members.length === 0 && (
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                      No members yet
                    </span>
                  )}
                  {members.map((member) => (
                    <Badge key={member.userId} variant="outline">
                      {member.name}
                    </Badge>
                  ))}
                </div>

                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!can("teams.edit")}
                    onClick={() => {
                      setForm({
                        name: team.name,
                        description: team.description ?? "",
                        leaderId: team.leaderId ?? NONE,
                        status: team.status,
                      });
                      resetDialogState();
                      setEditing(team);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!can("teams.assign")}
                    onClick={() => {
                      // Straight from the server payload this render was built
                      // from — never from a draft kept between openings.
                      setRoster(new Set(members.map((member) => member.userId)));
                      resetDialogState();
                      setRosterFor(team);
                    }}
                  >
                    Members ({members.length})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!can("teams.delete")}
                    onClick={() => setConfirmDelete(team)}
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
      {/* CREATE / EDIT — one form, two routes                              */}
      {/* ================================================================= */}

      {[
        { open: createOpen, close: () => setCreateOpen(false), mode: "create" as const },
        { open: Boolean(editing), close: () => setEditing(null), mode: "edit" as const },
      ].map(({ open, close, mode }) => (
        <Dialog key={mode} open={open} onOpenChange={(next) => !next && close()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{mode === "create" ? "New team" : `Edit ${editing?.name}`}</DialogTitle>
              <DialogDescription>
                {mode === "create"
                  ? "Members are added after the team exists, from the Members button."
                  : "Membership is managed separately, from the Members button."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${mode}-team-name`}>Name</Label>
                <Input
                  id={`${mode}-team-name`}
                  value={form.name}
                  placeholder="South zone"
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
                {issues.name && <p className="text-[11px] text-[var(--danger)]">{issues.name}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${mode}-team-leader`}>Leader</Label>
                <Select
                  value={form.leaderId}
                  onValueChange={(value) => setForm({ ...form, leaderId: value })}
                >
                  <SelectTrigger id={`${mode}-team-leader`}>
                    <SelectValue placeholder="Nobody" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nobody</SelectItem>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {issues.leaderId && (
                  <p className="text-[11px] text-[var(--danger)]">{issues.leaderId}</p>
                )}
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Naming a leader is a change to that person&apos;s record, so the same role
                  hierarchy applies as for membership.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${mode}-team-status`}>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm({ ...form, status: value })}
                >
                  <SelectTrigger id={`${mode}-team-status`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${mode}-team-description`}>Description</Label>
                <Textarea
                  id={`${mode}-team-description`}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
            </div>

            {dialogError && <p className="text-[12px] text-[var(--danger)]">{dialogError}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button onClick={mode === "create" ? createTeam : saveTeam} disabled={busy}>
                {busy ? "Saving…" : mode === "create" ? "Create team" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}

      {/* ================================================================= */}
      {/* ROSTER                                                            */}
      {/* ================================================================= */}

      <Dialog open={Boolean(rosterFor)} onOpenChange={(open) => !open && setRosterFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Members of {rosterFor?.name}</DialogTitle>
            <DialogDescription>
              This replaces the whole roster. Anybody unticked is removed from the team, which the
              server treats as a change to their record and authorizes accordingly.
            </DialogDescription>
          </DialogHeader>

          {employees.length === 0 ? (
            <p className="text-[12px] text-[var(--muted-foreground)]">
              No colleagues are visible to your account, so there is nobody to roster.
            </p>
          ) : (
            <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-[var(--border)] p-3">
              {employees.map((employee: Employee) => (
                <label
                  key={employee.id}
                  htmlFor={`member-${employee.id}`}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <Checkbox
                    id={`member-${employee.id}`}
                    checked={roster.has(employee.id)}
                    onCheckedChange={() =>
                      setRoster((previous) => {
                        const next = new Set(previous);
                        if (next.has(employee.id)) next.delete(employee.id);
                        else next.add(employee.id);
                        return next;
                      })
                    }
                  />
                  <span>{employee.name}</span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    {employee.roleName ?? ""}
                  </span>
                </label>
              ))}
            </div>
          )}

          {dialogError && <p className="text-[12px] text-[var(--danger)]">{dialogError}</p>}

          <DialogFooter className="sm:justify-between">
            <p className="text-[11px] text-[var(--muted-foreground)]">{roster.size} selected</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRosterFor(null)}>
                Cancel
              </Button>
              <Button onClick={saveRoster} disabled={busy}>
                {busy ? "Saving…" : "Save roster"}
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
              The team is hidden and its members keep their accounts. Teams are not held in the
              recycle bin, so this cannot be undone from the product.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteTeam} disabled={busy}>
              {busy ? "Deleting…" : "Delete team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
