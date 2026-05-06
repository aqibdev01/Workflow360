"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Users,
  FolderKanban,
  CheckCircle2,
  Plus,
  ArrowRight,
  Copy,
  MessageSquare,
  LayoutDashboard,
  Sparkles,
} from "lucide-react";
import { getOrganization, getOrganizationProjects, getOrganizationMembers, getOrgJoinRequests } from "@/lib/database";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useBreadcrumbs } from "@/components/breadcrumbs";
import { OrgMemberTable } from "@/components/org/OrgMemberTable";
import { JoinRequestsPanel, type JoinRequest } from "@/components/org/JoinRequestsPanel";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrganizationDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  const { user, loading: authLoading } = useAuth();

  const [organization, setOrganization] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [activeTasks, setActiveTasks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "members">("overview");

  useBreadcrumbs([
    { label: "Organizations", href: "/dashboard/organizations" },
    { label: organization?.name || "..." },
  ]);

  useEffect(() => {
    if (authLoading) return;
    async function loadOrganizationData() {
      try {
        const [orgData, projectsData, membersData] = await Promise.all([
          getOrganization(orgId),
          getOrganizationProjects(orgId),
          getOrganizationMembers(orgId),
        ]);

        setOrganization(orgData);
        setProjects(projectsData || []);
        setMembers(membersData || []);

        // Load join requests for admins/managers (silently skip if not admin)
        const currentUserMember = (membersData || []).find((m: any) => m.user_id === user?.id);
        if (currentUserMember?.role === "admin" || currentUserMember?.role === "manager") {
          getOrgJoinRequests(orgId).then(setJoinRequests).catch(() => {});
        }

        const projectIds = (projectsData || []).map((p: any) => p.id);
        if (projectIds.length > 0) {
          const { count } = await (supabase as any)
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .in("project_id", projectIds)
            .in("status", ["todo", "in_progress", "review"]);
          setActiveTasks(count || 0);
        }
      } catch (error) {
        console.error("Error loading organization data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadOrganizationData();
  }, [orgId, authLoading]);

  const copyInviteCode = () => {
    if (organization?.invite_code) {
      navigator.clipboard.writeText(organization.invite_code);
      toast.success("Invite code copied!");
    }
  };

  const currentUserId = user?.id || "";
  const currentMember = members.find((m: any) => m.user_id === currentUserId);
  const isOrgAdmin = currentMember?.role === "admin" || currentMember?.role === "manager";

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-52 w-full rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const stats = [
    {
      value: projects.length,
      label: "Projects",
      sub: projects.length === 0 ? "No projects yet" : "Active projects",
      icon: FolderKanban,
      color: "bg-indigo-500",
      bgLight: "bg-indigo-50 dark:bg-indigo-950/30",
    },
    {
      value: members.length,
      label: "Team Members",
      sub: members.length === 1 ? "Just you" : "Team members",
      icon: Users,
      color: "bg-violet-500",
      bgLight: "bg-violet-50 dark:bg-violet-950/30",
    },
    {
      value: activeTasks,
      label: "Active Tasks",
      sub: activeTasks === 0 ? "No tasks yet" : "Across all projects",
      icon: CheckCircle2,
      color: "bg-emerald-500",
      bgLight: "bg-emerald-50 dark:bg-emerald-950/30",
    },
    {
      value: organization?.invite_code,
      label: "Invite Code",
      sub: "Click to copy",
      icon: Building2,
      color: "bg-amber-500",
      bgLight: "bg-amber-50 dark:bg-amber-950/30",
      isCode: true,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner (Bento style from Stitch) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 relative overflow-hidden bg-indigo-600 text-white rounded-2xl p-8 flex flex-col justify-between min-h-[220px]">
          <div className="absolute top-0 right-0 -mr-12 -mt-12 w-64 h-64 bg-violet-500 rounded-full blur-[80px] opacity-40" />
          <div className="z-10">
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              Welcome back, {organization?.name}
            </h1>
            <p className="text-indigo-100 max-w-md">
              {projects.length} projects, {members.length} members, {activeTasks} active tasks across your workspace.
            </p>
          </div>
          <div className="flex gap-4 z-10">
            <Link href={`/dashboard/organizations/${orgId}/projects/new`}>
              <button className="bg-white text-indigo-600 px-6 py-2.5 rounded-xl font-bold text-sm shadow-xl hover:bg-slate-50 active:scale-95 transition-all flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create Project
              </button>
            </Link>
            <button
              onClick={copyInviteCode}
              className="bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm border border-white/20 hover:bg-white/10 active:scale-95 transition-all flex items-center gap-2"
            >
              <Copy className="h-4 w-4" />
              Invite Member
            </button>
          </div>
        </div>

        {/* AI Suggestion card */}
        <div className="bg-violet-600 rounded-2xl p-6 flex flex-col justify-between text-white relative overflow-hidden">
          <div className="absolute bottom-0 right-0 -mb-4 -mr-4 opacity-10">
            <Sparkles className="h-28 w-28" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4" />
              <span className="text-[0.6875rem] font-bold uppercase tracking-widest opacity-80">
                AI Insight
              </span>
            </div>
            <p className="text-sm font-medium leading-relaxed">
              {activeTasks > 5
                ? `You have ${activeTasks} active tasks. Consider running the AI Bottleneck Predictor to identify potential blockers.`
                : "Your workspace is ready for AI optimization. Train your models to unlock smart task decomposition and assignment."}
            </p>
          </div>
          <button className="mt-4 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2">
            Explore AI Tools
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "overview"
              ? "bg-white dark:bg-slate-700 text-foreground shadow-sm font-bold"
              : "text-slate-500 dark:text-slate-400 hover:text-foreground"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          Overview
        </button>
        {isOrgAdmin && (
          <button
            onClick={() => setActiveTab("members")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "members"
                ? "bg-white dark:bg-slate-700 text-foreground shadow-sm font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-foreground"
            }`}
          >
            <Users className="h-4 w-4" />
            Members
            {joinRequests.length > 0 && (
              <span className="ml-0.5 h-5 min-w-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {joinRequests.length}
              </span>
            )}
          </button>
        )}
        <Link href={`/dashboard/organizations/${orgId}/communication`}>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-foreground transition-all">
            <MessageSquare className="h-4 w-4" />
            Communication
          </button>
        </Link>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <>
          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="bg-white dark:bg-slate-800/50 rounded-xl p-6 shadow-sm hover:shadow-ambient transition-all"
                onClick={stat.isCode ? copyInviteCode : undefined}
                style={stat.isCode ? { cursor: "pointer" } : undefined}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p
                      className={`${
                        stat.isCode ? "text-lg font-mono" : "text-3xl"
                      } font-bold text-foreground`}
                    >
                      {stat.value}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                      {stat.label}
                    </p>
                    <p className="text-xs text-slate-400">{stat.sub}</p>
                  </div>
                  <div
                    className={`h-12 w-12 ${stat.color} rounded-xl flex items-center justify-center`}
                  >
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Projects */}
          {projects.length === 0 ? (
            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-8 shadow-sm">
              <div className="flex gap-6">
                <div className="h-14 w-14 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl flex items-center justify-center shrink-0">
                  <FolderKanban className="h-7 w-7 text-indigo-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-foreground mb-2 tracking-tight">
                    Ready to Create Your First Project?
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                    Projects help you organize work, assign tasks to team members,
                    and track progress with Kanban boards and sprints.
                  </p>
                  <div className="space-y-1.5 mb-6">
                    {[
                      "Create and manage tasks on a Kanban board",
                      "Assign team members with specific roles",
                      "Plan and track sprints",
                      "AI-powered task decomposition and assignment",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Link href={`/dashboard/organizations/${orgId}/projects/new`}>
                    <button className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 active:scale-95 transition-all flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Create Your First Project
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold text-foreground mb-4 tracking-tight">
                Projects
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project: any) => (
                  <Link
                    key={project.id}
                    href={`/dashboard/projects/${project.id}`}
                  >
                    <div className="bg-white dark:bg-slate-800/50 rounded-xl p-6 shadow-sm hover:shadow-ambient transition-all cursor-pointer group h-full">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-lg font-bold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors tracking-tight">
                          {project.name}
                        </h3>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                            project.status === "active"
                              ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                              : project.status === "planning"
                              ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                          }`}
                        >
                          {project.status}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">
                        {project.description || "No description"}
                      </p>
                      <div className="flex items-center justify-between text-sm text-slate-400">
                        <span>
                          {project.project_members?.[0]?.count || 0} members
                        </span>
                        <ArrowRight className="h-4 w-4 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Members Tab */}
      {activeTab === "members" && isOrgAdmin && (
        <div className="space-y-6">
          {/* Pending join requests */}
          {joinRequests.length > 0 && (
            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-base font-semibold">Membership Requests</h3>
                <span className="h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {joinRequests.length}
                </span>
              </div>
              <JoinRequestsPanel
                orgId={orgId}
                orgName={organization?.name || ""}
                requests={joinRequests}
                onRequestsChanged={async () => {
                  const [updatedMembers, updatedRequests] = await Promise.all([
                    getOrganizationMembers(orgId),
                    getOrgJoinRequests(orgId),
                  ]);
                  setMembers(updatedMembers || []);
                  setJoinRequests(updatedRequests);
                }}
              />
            </div>
          )}

          {/* Current members */}
          <div className="bg-white dark:bg-slate-800/50 rounded-xl p-6 shadow-sm">
            <OrgMemberTable
              members={members}
              currentUserId={currentUserId}
              isAdmin={currentMember?.role === "admin"}
              orgName={organization?.name || ""}
              onMembersChanged={async () => {
                const updated = await getOrganizationMembers(orgId);
                setMembers(updated || []);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
