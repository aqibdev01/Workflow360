"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Users,
  Search,
  Loader2,
  Trash2,
  AlertTriangle,
  UserPlus,
  Code,
  Bug,
  Palette,
  Briefcase,
} from "lucide-react";
import { updateMemberRole } from "@/lib/database";
import { removeProjectMember, addMemberToProject } from "@/lib/projects/update";
import { getOrganizationMembers } from "@/lib/database";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectMember {
  id: string;
  role: string;
  custom_role: string | null;
  user_id: string;
  users: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface ProjectMemberManagerProps {
  projectId: string;
  orgId: string;
  members: ProjectMember[];
  currentUserId: string;
  isOwner: boolean;
  isManager: boolean;
  onMembersChanged: () => void;
}

// ─── Role config ─────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "lead", label: "Lead" },
  { value: "contributor", label: "Contributor" },
  { value: "viewer", label: "Viewer" },
];

const CUSTOM_ROLE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "Developer", label: "Developer" },
  { value: "QA Engineer", label: "QA Engineer" },
  { value: "Designer", label: "Designer" },
  { value: "Project Manager", label: "Project Manager" },
];

const roleIcons: Record<string, any> = {
  Developer: Code,
  "QA Engineer": Bug,
  Designer: Palette,
  "Project Manager": Briefcase,
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-violet-600/10 text-violet-600 border-violet-500/20",
  lead: "bg-indigo-600/10 text-indigo-600 border-indigo-500/20",
  contributor: "bg-emerald-50 text-emerald-600 border-emerald-200",
  viewer: "bg-muted text-muted-foreground",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ProjectMemberManager({
  projectId,
  orgId,
  members,
  currentUserId,
  isOwner,
  isManager,
  onMembersChanged,
}: ProjectMemberManagerProps) {
  const canManage = isOwner || isManager;

  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [removeMember, setRemoveMember] = useState<ProjectMember | null>(null);
  const [removing, setRemoving] = useState(false);

  // Add member state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [loadingOrgMembers, setLoadingOrgMembers] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [addRole, setAddRole] = useState("contributor");
  const [addCustomRole, setAddCustomRole] = useState("");
  const [adding, setAdding] = useState(false);

  const filteredMembers = useMemo(() => {
    if (!search) return members;
    const q = search.toLowerCase();
    return members.filter(
      (m) =>
        (m.users?.full_name || "").toLowerCase().includes(q) ||
        (m.users?.email || "").toLowerCase().includes(q) ||
        (m.role || "").toLowerCase().includes(q) ||
        (m.custom_role || "").toLowerCase().includes(q)
    );
  }, [members, search]);

  // Load org members for add dialog
  useEffect(() => {
    if (!addDialogOpen || !orgId) return;
    setLoadingOrgMembers(true);
    getOrganizationMembers(orgId)
      .then((data) => setOrgMembers(data || []))
      .catch(console.error)
      .finally(() => setLoadingOrgMembers(false));
  }, [addDialogOpen, orgId]);

  // Filter org members: exclude those already in project
  const existingUserIds = useMemo(
    () => new Set(members.map((m) => m.user_id)),
    [members]
  );

  const availableOrgMembers = useMemo(() => {
    const filtered = (orgMembers as any[]).filter(
      (om) => !existingUserIds.has(om.users?.id)
    );
    if (!addSearch) return filtered;
    const q = addSearch.toLowerCase();
    return filtered.filter(
      (om) =>
        (om.users?.full_name || "").toLowerCase().includes(q) ||
        (om.users?.email || "").toLowerCase().includes(q)
    );
  }, [orgMembers, existingUserIds, addSearch]);

  const handleRoleChange = async (member: ProjectMember, newRole: string) => {
    if (newRole === member.role) return;
    setUpdatingId(member.id);
    try {
      await updateMemberRole(member.id, newRole, member.custom_role || undefined);
      toast.success(`Role updated to ${newRole}`);
      onMembersChanged();
    } catch (err) {
      console.error("Error updating role:", err);
      toast.error("Failed to update role");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCustomRoleChange = async (
    member: ProjectMember,
    newCustomRole: string
  ) => {
    const actualRole = newCustomRole === "none" ? "" : newCustomRole;
    setUpdatingId(member.id);
    try {
      await updateMemberRole(member.id, member.role, actualRole || undefined);
      toast.success(newCustomRole ? `Custom role set to ${newCustomRole}` : "Custom role removed");
      onMembersChanged();
    } catch (err) {
      console.error("Error updating custom role:", err);
      toast.error("Failed to update custom role");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeMember) return;
    setRemoving(true);
    try {
      await removeProjectMember(removeMember.id);
      toast.success(`${removeMember.users?.full_name || "Member"} removed from project`);
      setRemoveMember(null);
      onMembersChanged();
    } catch (err) {
      console.error("Error removing member:", err);
      toast.error("Failed to remove member");
    } finally {
      setRemoving(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) return;
    setAdding(true);
    try {
      const customRoleToSave = addCustomRole === "none" ? "" : addCustomRole;
      await addMemberToProject(projectId, selectedUserId, addRole, customRoleToSave || undefined);
      toast.success("Member added to project");
      setAddDialogOpen(false);
      setSelectedUserId("");
      setAddRole("contributor");
      setAddCustomRole("");
      setAddSearch("");
      onMembersChanged();
    } catch (err: any) {
      console.error("Error adding member:", err);
      if (err?.code === "23505") {
        toast.error("This user is already a project member");
      } else {
        toast.error("Failed to add member");
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-violet-600" />
          <h3 className="text-base font-semibold text-foreground">
            Project Members
          </h3>
          <span className="text-sm text-muted-foreground">({members.length})</span>
        </div>
        {canManage && (
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-600/90 gap-1.5"
            onClick={() => setAddDialogOpen(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Member
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9 text-sm"
        />
      </div>

      {/* Table */}
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900 border-b">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Member</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Role</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Custom Role</th>
              {canManage && (
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((member) => {
              const displayName =
                member.users?.full_name ||
                member.users?.email?.split("@")[0] ||
                "Unknown";
              const initials = member.users?.full_name
                ? member.users.full_name
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)
                : displayName[0]?.toUpperCase() || "?";
              const isSelf = member.user_id === currentUserId;
              const roleColor = ROLE_COLORS[member.role] || ROLE_COLORS.viewer;
              const CustomRoleIcon = member.custom_role
                ? roleIcons[member.custom_role]
                : null;

              return (
                <tr
                  key={member.id}
                  className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                >
                  {/* Member */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-medium text-white">{initials}</span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {displayName}
                          {isSelf && (
                            <span className="text-xs text-muted-foreground ml-1.5">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{member.users?.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3">
                    {canManage && !isSelf ? (
                      updatingId === member.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(v) => handleRoleChange(member, v)}
                        >
                          <SelectTrigger className="h-7 w-[120px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    ) : (
                      <Badge className={`capitalize ${roleColor}`}>
                        {member.role}
                      </Badge>
                    )}
                  </td>

                  {/* Custom Role */}
                  <td className="px-4 py-3">
                    {canManage && !isSelf ? (
                      <Select
                        value={member.custom_role || "none"}
                        onValueChange={(v) => handleCustomRoleChange(member, v)}
                      >
                        <SelectTrigger className="h-7 w-[150px] text-xs">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          {CUSTOM_ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r.value || "none"} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : member.custom_role ? (
                      <Badge variant="secondary" className="gap-1">
                        {CustomRoleIcon && <CustomRoleIcon className="h-3 w-3" />}
                        {member.custom_role}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      {!isSelf && member.role !== "owner" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
                          onClick={() => setRemoveMember(member)}
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredMembers.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              {search ? "No members match your search" : "No members found"}
            </p>
          </div>
        )}
      </div>

      {/* Remove confirmation dialog */}
      <Dialog open={!!removeMember} onOpenChange={(open) => !open && setRemoveMember(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Remove Member
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">
                {removeMember?.users?.full_name || removeMember?.users?.email?.split("@")[0]}
              </span>{" "}
              from this project? They will lose access to all project tasks and channels.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveMember(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveMember} disabled={removing} className="gap-1.5">
              {removing && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add member dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[600px] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-indigo-600" />
              Add Project Member
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Search org members */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search organization members..."
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Member list */}
            <div className="flex-1 overflow-y-auto border rounded-lg max-h-[200px]">
              {loadingOrgMembers ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : availableOrgMembers.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">
                    {addSearch ? "No members match your search" : "All org members are already in this project"}
                  </p>
                </div>
              ) : (
                availableOrgMembers.map((om: any) => {
                  const name = om.users?.full_name || om.users?.email?.split("@")[0] || "Unknown";
                  const isSelected = selectedUserId === om.users?.id;
                  return (
                    <button
                      key={om.users?.id}
                      onClick={() => setSelectedUserId(om.users?.id)}
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors border-b last:border-b-0 ${
                        isSelected
                          ? "bg-indigo-600/10 border-l-2 border-l-indigo-500"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-medium text-white">
                          {(om.users?.full_name || om.users?.email)?.[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground truncate">{om.users?.email}</p>
                      </div>
                      <Badge className="bg-muted text-muted-foreground text-[10px]">
                        {om.role}
                      </Badge>
                    </button>
                  );
                })
              )}
            </div>

            {/* Role selectors */}
            {selectedUserId && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Project Role</Label>
                  <Select value={addRole} onValueChange={setAddRole}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.filter((r) => r.value !== "owner").map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Custom Role</Label>
                  <Select value={addCustomRole || "none"} onValueChange={setAddCustomRole}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOM_ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r.value || "none"} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-600/90 gap-1.5"
              onClick={handleAddMember}
              disabled={adding || !selectedUserId}
            >
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
