"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Archive, Trash2, Loader2, UserCog } from "lucide-react";
import { updateProjectDetails, deleteProject, transferProjectOwnership } from "@/lib/projects/update";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  role: string;
  user_id: string;
  users?: {
    id: string;
    full_name?: string | null;
    email: string;
  };
}

interface ProjectDangerZoneProps {
  project: {
    id: string;
    name: string;
    status: string;
    organizations?: { id: string };
  };
  /** True when current user is owner or lead (project manager) */
  isOwner: boolean;
  /** The current user's own project_members row id */
  currentUserMemberId?: string;
  /** All project members — used for the transfer ownership dropdown */
  members?: Member[];
  onUpdated: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectDangerZone({
  project,
  isOwner,
  currentUserMemberId,
  members = [],
  onUpdated,
}: ProjectDangerZoneProps) {
  const router = useRouter();

  // Archive
  const [archiving, setArchiving] = useState(false);

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Transfer ownership
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedNewOwnerId, setSelectedNewOwnerId] = useState<string>("");
  const [transferring, setTransferring] = useState(false);

  const isArchived = project.status === "archived";

  // Members eligible for ownership transfer: everyone except the current owner
  const transferCandidates = members.filter(
    (m) => m.id !== currentUserMemberId && m.role !== "viewer"
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await updateProjectDetails(project.id, {
        status: isArchived ? "active" : "archived",
      });
      toast.success(isArchived ? "Project restored to active" : "Project archived successfully");
      onUpdated();
    } catch {
      toast.error("Failed to update project status");
    } finally {
      setArchiving(false);
    }
  };

  const handleDelete = async () => {
    if (confirmName !== project.name) return;
    setDeleting(true);
    try {
      await deleteProject(project.id);
      toast.success("Project deleted permanently");
      const orgId = project.organizations?.id;
      router.push(orgId ? `/dashboard/organizations/${orgId}` : "/dashboard");
    } catch {
      toast.error("Failed to delete project");
    } finally {
      setDeleting(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedNewOwnerId || !currentUserMemberId) return;
    setTransferring(true);
    try {
      await transferProjectOwnership(currentUserMemberId, selectedNewOwnerId);
      toast.success("Project ownership transferred successfully");
      setTransferDialogOpen(false);
      setSelectedNewOwnerId("");
      onUpdated();
    } catch {
      toast.error("Failed to transfer ownership");
    } finally {
      setTransferring(false);
    }
  };

  const selectedMember = transferCandidates.find((m) => m.id === selectedNewOwnerId);
  const selectedMemberName =
    selectedMember?.users?.full_name || selectedMember?.users?.email || "";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-red-600" />
        <h3 className="text-base font-semibold text-red-600">Danger Zone</h3>
      </div>

      <div className="border border-red-200 rounded-xl divide-y divide-red-200 dark:border-red-900">
        {/* Archive */}
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              {isArchived ? "Restore Project" : "Archive Project"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isArchived
                ? "Restore this project to active status."
                : "Archive this project. It will be hidden from the default view but data is preserved."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 ${
              isArchived
                ? "border-indigo-500 text-indigo-600 hover:bg-indigo-600/5"
                : "border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
            }`}
            onClick={handleArchive}
            disabled={archiving || !isOwner}
          >
            {archiving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            {isArchived ? "Restore" : "Archive"}
          </Button>
        </div>

        {/* Transfer Ownership — only project managers */}
        {isOwner && (
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Transfer Ownership</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Hand over project ownership to another team member. You will become a lead.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
              onClick={() => setTransferDialogOpen(true)}
              disabled={transferCandidates.length === 0}
            >
              <UserCog className="h-3.5 w-3.5" />
              Transfer
            </Button>
          </div>
        )}

        {/* Delete — only project managers */}
        {isOwner && (
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Delete Project</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently delete this project and all its data. This action cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* ── Transfer Ownership Dialog ─────────────────────────────────────── */}
      <Dialog open={transferDialogOpen} onOpenChange={(open) => {
        setTransferDialogOpen(open);
        if (!open) setSelectedNewOwnerId("");
      }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <UserCog className="h-5 w-5" />
              Transfer Ownership
            </DialogTitle>
            <DialogDescription>
              Select a team member to become the new project owner. You will be demoted to{" "}
              <span className="font-semibold text-foreground">lead</span> and lose owner
              privileges.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">New owner:</p>
            <Select value={selectedNewOwnerId} onValueChange={setSelectedNewOwnerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a team member..." />
              </SelectTrigger>
              <SelectContent>
                {transferCandidates.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="font-medium">
                      {m.users?.full_name || m.users?.email || "Unknown"}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground capitalize">
                      ({m.role})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedMemberName && (
              <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-md px-3 py-2">
                <span className="font-semibold">{selectedMemberName}</span> will become the
                project owner. This action can be reversed by the new owner.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTransferDialogOpen(false);
                setSelectedNewOwnerId("");
              }}
              disabled={transferring}
            >
              Cancel
            </Button>
            <Button
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleTransfer}
              disabled={transferring || !selectedNewOwnerId}
            >
              {transferring && <Loader2 className="h-4 w-4 animate-spin" />}
              Transfer Ownership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ────────────────────────────────────── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Project
            </DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold text-foreground">{project.name}</span> and all
              associated tasks, sprints, and data. This action{" "}
              <span className="font-semibold text-red-600">cannot be undone</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Type{" "}
              <span className="font-mono font-semibold text-foreground">{project.name}</span>{" "}
              to confirm:
            </p>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder="Enter project name"
              className="font-mono"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setConfirmName("");
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || confirmName !== project.name}
              className="gap-1.5"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
