"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useResource } from "@/hooks/use-api";
import type { Area, Branch, Region } from "@/lib/maintenance/types";

/**
 * Region ▸ Area ▸ Branch master data. Task MM-1, D-095.
 *
 * ── WHY IT LIVES HERE ───────────────────────────────────────────────────────
 *
 * Without it the hierarchy could be created only by direct API call, which
 * means `REGION NAME`, `AREA NAME` and `BRANCH` would be **permanently blank on
 * every sheet** — the same "backend exists, product cannot reach it" defect
 * this CRM already had with `verifications`.
 *
 * It sits on the Transfer sheet rather than taking a fifth nav entry because the
 * brief names exactly four Maintenance screens, and this is the screen whose
 * columns it feeds. It is rendered only for holders of
 * `maintenance.manage_locations` (Admin and above), so a Manager never sees it.
 *
 * ── NO DELETE, DELIBERATELY ─────────────────────────────────────────────────
 *
 * A location is referenced by historical files. Removing one would orphan a
 * booked file or be refused confusingly by the `restrict` foreign key. Setting
 * it `Inactive` retires it from the pickers while every sheet that already
 * resolved through it keeps resolving.
 */
export function LocationsPanel() {
  const { can } = useAuth();
  const allowed = can("maintenance.manage_locations");

  const { data: regions, refresh: refreshRegions } = useResource<Region>(
    "/maintenance/regions",
    undefined,
    allowed,
  );
  const { data: areas, refresh: refreshAreas } = useResource<Area>(
    "/maintenance/areas",
    undefined,
    allowed,
  );
  const { data: branches, refresh: refreshBranches } = useResource<Branch>(
    "/maintenance/branches",
    undefined,
    allowed,
  );

  const [open, setOpen] = React.useState(false);
  const [regionName, setRegionName] = React.useState("");
  const [areaName, setAreaName] = React.useState("");
  const [areaRegion, setAreaRegion] = React.useState("");
  const [branchName, setBranchName] = React.useState("");
  const [branchArea, setBranchArea] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  if (!allowed) return null;

  async function run(label: string, work: () => Promise<unknown>, after: () => void) {
    setBusy(true);
    try {
      await work();
      toast.success(`${label} saved`);
      after();
    } catch (err) {
      toast.error(`Could not save that ${label.toLowerCase()}`, {
        description: errorMessage(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(
    segment: "regions" | "areas" | "branches",
    row: { id: string; name: string; status: string },
    refresh: () => void,
  ) {
    const next = row.status === "Active" ? "Inactive" : "Active";
    await run(
      row.name,
      () => api.update(`/maintenance/${segment}/${row.id}`, { status: next }),
      refresh,
    );
  }

  return (
    <SectionCard
      title="Locations"
      description="Region ▸ Area ▸ Branch — the master data the Region, Area and Branch columns resolve through"
      action={
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Manage"}
        </Button>
      }
    >
      {!open ? (
        <p className="text-[11px] text-[var(--muted-foreground)]">
          {regions.length} regions · {areas.length} areas · {branches.length} branches. A file&rsquo;s
          Region and Area follow from its branch, so only the branch is chosen on a transfer.
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-region">New region</Label>
              <div className="flex gap-2">
                <Input
                  id="new-region"
                  placeholder="e.g. Telangana"
                  value={regionName}
                  onChange={(event) => setRegionName(event.target.value)}
                />
                <Button
                  size="sm"
                  disabled={busy || regionName.trim() === ""}
                  onClick={() =>
                    void run(
                      "Region",
                      () => api.create("/maintenance/regions", { name: regionName.trim() }),
                      () => {
                        setRegionName("");
                        refreshRegions();
                      },
                    )
                  }
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-area">New area</Label>
              <Select value={areaRegion} onValueChange={setAreaRegion}>
                <SelectTrigger>
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  id="new-area"
                  placeholder="e.g. HYDERABAD"
                  value={areaName}
                  onChange={(event) => setAreaName(event.target.value)}
                />
                <Button
                  size="sm"
                  disabled={busy || areaName.trim() === "" || areaRegion === ""}
                  onClick={() =>
                    void run(
                      "Area",
                      () =>
                        api.create("/maintenance/areas", {
                          regionId: areaRegion,
                          name: areaName.trim(),
                        }),
                      () => {
                        setAreaName("");
                        refreshAreas();
                      },
                    )
                  }
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-branch">New branch</Label>
              <Select value={branchArea} onValueChange={setBranchArea}>
                <SelectTrigger>
                  <SelectValue placeholder="Area" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {a.regionName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  id="new-branch"
                  placeholder="e.g. OMKAR NAGAR"
                  value={branchName}
                  onChange={(event) => setBranchName(event.target.value)}
                />
                <Button
                  size="sm"
                  disabled={busy || branchName.trim() === "" || branchArea === ""}
                  onClick={() =>
                    void run(
                      "Branch",
                      () =>
                        api.create("/maintenance/branches", {
                          areaId: branchArea,
                          name: branchName.trim(),
                        }),
                      () => {
                        setBranchName("");
                        refreshBranches();
                      },
                    )
                  }
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                      No branches yet. Add a region, then an area, then a branch.
                    </TableCell>
                  </TableRow>
                ) : (
                  branches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.name}</TableCell>
                      <TableCell>{b.areaName}</TableCell>
                      <TableCell>{b.regionName}</TableCell>
                      <TableCell>{b.status}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void toggleStatus("branches", b, refreshBranches)}
                        >
                          {b.status === "Active" ? "Deactivate" : "Reactivate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
