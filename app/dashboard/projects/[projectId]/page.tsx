"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import {
  FolderKanban,
  Users,
  CheckCircle2,
  Clock,
  Calendar,
  Settings,
  LayoutGrid,
  Activity,
  TrendingUp,
  AlertCircle,
  PlayCircle,
  ArrowLeft,
  Code,
  Bug,
  Palette,
  Briefcase,
  Plus,
  GripVertical,
  Pencil,
  BarChart3,
  Archive,
  Layers,
  Trash2,
  Files,
  Paperclip,
  Sparkles,
  Wand2,
  ChevronRight,
  Bot,
} from "lucide-react";
import {
  getProjectDetails,
  getProjectTaskStats,
  getProjectTasks,
  getProjectSprints,
  updateTaskStatus,
  deleteTask,
  getUserProjectRole,
  startSprint,
  stopSprint,
  updateSprint,
  getSprintEvents,
} from "@/lib/database";
import { TaskDialog } from "@/components/task-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SprintDialog } from "@/components/sprint-dialog";
import { SprintEventDialog } from "@/components/sprint-event-dialog";
import { SprintTimeline } from "@/components/sprint-timeline";
import { ProjectAnalytics } from "@/components/project-analytics";
import { ProjectCalendar } from "@/components/project-calendar";
import { EditProjectDialog } from "@/components/projects/EditProjectDialog";
import { ProjectMemberManager } from "@/components/projects/ProjectMemberManager";
import { ProjectDangerZone } from "@/components/projects/ProjectDangerZone";
import { ProjectFilesTab } from "@/components/files/ProjectFilesTab";
import { getTaskFileCounts } from "@/lib/files/files";
import { notifyStatusChanged } from "@/lib/notifications/triggers";
import { DecomposeButton } from "@/components/ai/DecomposeButton";
import { DecompositionPanel } from "@/components/ai/DecompositionPanel";
import { SubtaskHierarchyView } from "@/components/ai/SubtaskHierarchyView";
import { AssigneeSuggestionPanel } from "@/components/ai/AssigneeSuggestionPanel";
import { WorkloadDashboard } from "@/components/ai/WorkloadDashboard";
import { BulkAssignDialog } from "@/components/ai/BulkAssignDialog";
import { SprintRiskWidget } from "@/components/ai/SprintRiskWidget";
import { AIOptimizerTab } from "@/components/ai/AIOptimizerTab";
import { RiskScoreGauge } from "@/components/ai/RiskScoreGauge";
import { BottleneckList } from "@/components/ai/BottleneckList";
import { RecommendationList } from "@/components/ai/RecommendationList";
import { VelocityTrendChart } from "@/components/ai/VelocityTrendChart";
import { WorkloadHeatmap } from "@/components/ai/WorkloadHeatmap";
import { ProjectRiskHistory } from "@/components/ai/ProjectRiskHistory";
import { analyzeSprint, getLatestReport } from "@/lib/ai/optimizer";
import type { SprintAnalysisResult } from "@/lib/ai/optimizer";
import { getDecompositionHistory } from "@/lib/ai/decomposition";
import type { DecomposeResult } from "@/lib/ai/decomposition";
import { toast } from "sonner";
import { useBreadcrumbs } from "@/components/breadcrumbs";

const statusConfig = {
  planning: { label: "Planning", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  active: { label: "Active", color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" },
  on_hold: { label: "On Hold", color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
  completed: { label: "Completed", color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20" },
  archived: { label: "Archived", color: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20" },
};


// ─── Drag-and-drop: Priority Card (draggable from the tray) ──────────────────

function PriorityDragCard({ priority, color, bgColor, borderColor, label, icon }: {
  priority: string;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  icon: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: priority,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex flex-col items-center gap-1.5 px-5 py-3.5 rounded-xl border-2 cursor-grab active:cursor-grabbing select-none transition-all ${bgColor} ${
        isDragging ? "opacity-30 scale-90" : "hover:shadow-lg hover:scale-105 hover:-translate-y-0.5"
      }`}
      style={{ borderColor }}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="h-3.5 w-3.5 opacity-30" />
        <span className="text-lg">{icon}</span>
      </div>
      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-bold text-xs uppercase tracking-wider" style={{ color }}>{label}</span>
    </div>
  );
}

// ─── Drag-and-drop: Board Drop Zone (for priority cards → new task) ──────────

function BoardDropZone({ children, active }: { children: React.ReactNode; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "kanban-board" });

  return (
    <div
      ref={setNodeRef}
      className={`transition-all rounded-xl ${
        active && isOver ? "ring-3 ring-indigo-500/40 ring-offset-4 bg-indigo-500/[0.02]" : ""
      }`}
    >
      {children}
    </div>
  );
}

// ─── Drag-and-drop: Column Drop Zone (for task cards → change status) ────────

function ColumnDropZone({ status, active, children }: {
  status: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status}` });

  return (
    <div
      ref={setNodeRef}
      className={`transition-all rounded-xl ${
        active && isOver ? "ring-2 ring-indigo-500 ring-offset-2 scale-[1.01] bg-indigo-500/5" : ""
      }`}
    >
      {children}
    </div>
  );
}

// ─── Drag-and-drop: Delete Drop Zone ─────────────────────────────────────────

function DeleteDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: "delete-zone" });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center gap-3 py-4 px-6 rounded-xl border-2 border-dashed transition-all ${
        isOver
          ? "border-red-500 bg-red-100 scale-[1.02]"
          : "border-red-300 bg-red-50"
      }`}
    >
      <Trash2 className={`h-5 w-5 transition-colors ${isOver ? "text-red-600" : "text-red-400"}`} />
      <span className={`font-semibold text-sm transition-colors ${isOver ? "text-red-700" : "text-red-400"}`}>
        {isOver ? "Release to delete" : "Drop here to delete task"}
      </span>
    </div>
  );
}

// ─── Drag-and-drop: Draggable Task Card wrapper ─────────────────────────────

function DraggableTaskCard({ taskId, canDrag, children }: {
  taskId: string;
  canDrag: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-${taskId}`,
    disabled: !canDrag,
  });

  return (
    <div
      ref={setNodeRef}
      {...(canDrag ? listeners : {})}
      {...(canDrag ? attributes : {})}
      className={`transition-all ${isDragging ? "opacity-30 scale-95" : ""} ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {children}
    </div>
  );
}

// ─── Backlog Section ─────────────────────────────────────────────────────────

function BacklogSection({ tasks, taskFileCounts, isProjectManager, onEditTask, onViewTask }: {
  tasks: any[];
  taskFileCounts: Record<string, number>;
  isProjectManager: boolean;
  onEditTask: (task: any) => void;
  onViewTask: (task: any) => void;
}) {
  return (
    <Card className="bg-amber-50/50 dark:bg-amber-950/10 border-amber-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-amber-600" />
            <h4 className="font-semibold text-amber-900 dark:text-amber-200">Backlog</h4>
            <span className="text-xs text-amber-600">Tasks not assigned to any sprint</span>
          </div>
          <Badge variant="secondary" className="font-bold">{tasks.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No backlog tasks. All tasks are assigned to sprints.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {tasks.map((task: any) => (
              <Card
                key={task.id}
                className="cursor-pointer border-l-4 bg-white dark:bg-slate-900 hover:shadow-md transition-shadow"
                style={{
                  borderLeftColor:
                    task.priority === "urgent" ? "#ef4444"
                      : task.priority === "high" ? "#f97316"
                      : task.priority === "medium" ? "#3b82f6"
                      : "#6b7280",
                }}
                onClick={() => isProjectManager ? onEditTask(task) : onViewTask(task)}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h5 className="font-medium text-sm leading-tight line-clamp-2 flex-1">{task.title}</h5>
                    {isProjectManager && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                        onClick={(e: any) => { e.stopPropagation(); onEditTask(task); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={`text-xs capitalize ${
                      task.priority === "high" ? "border-orange-500 text-orange-600"
                        : task.priority === "urgent" ? "border-red-500 text-red-600" : ""
                    }`}>
                      {task.priority}
                    </Badge>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {task.status === "in_progress" ? "In Progress" : task.status}
                    </Badge>
                    {task.due_date && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(task.due_date).toLocaleDateString()}
                      </Badge>
                    )}
                    {taskFileCounts[task.id] > 0 && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Paperclip className="h-3 w-3" />
                        {taskFileCounts[task.id]}
                      </Badge>
                    )}
                  </div>
                  {task.assignee && (
                    <div className="flex items-center gap-2 pt-1">
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary">
                        {task.assignee.full_name
                          ? task.assignee.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
                          : task.assignee.email?.[0]?.toUpperCase() || "?"}
                      </div>
                      <span className="text-xs text-muted-foreground truncate">
                        {task.assignee.full_name || task.assignee.email}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function ProjectDashboardContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const { user, userProfile, loading: authLoading } = useAuth();

  const [project, setProject] = useState<any>(null);
  const [taskStats, setTaskStats] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [sprints, setSprints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, _setActiveTabState] = useState(searchParams.get("tab") || "overview");

  const setActiveTab = (tab: string) => {
    _setActiveTabState(tab);
    const url = tab === "overview"
      ? `/dashboard/projects/${projectId}`
      : `/dashboard/projects/${projectId}?tab=${tab}`;
    router.replace(url, { scroll: false });
  };

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab") || "overview";
    _setActiveTabState(tabFromUrl);
  }, [searchParams]);

  // Task dialog state
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [taskDialogDefaultSprintId, setTaskDialogDefaultSprintId] = useState<string | undefined>(undefined);
  const [taskDialogDefaultPriority, setTaskDialogDefaultPriority] = useState<"low" | "medium" | "high" | undefined>(undefined);
  const [taskDialogDefaultStatus, setTaskDialogDefaultStatus] = useState<string | undefined>(undefined);

  // Kanban view state
  const [showBacklog, setShowBacklog] = useState(false);
  const [activeDragPriority, setActiveDragPriority] = useState<string | null>(null);
  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null);
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(null);
  const [viewingTask, setViewingTask] = useState<any>(null);

  // AI decomposition state
  const [decompResult, setDecompResult] = useState<DecomposeResult | null>(null);
  const [decompHistory, setDecompHistory] = useState<any[]>([]);

  // dnd-kit sensor
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Sprint dialog state
  const [sprintDialogOpen, setSprintDialogOpen] = useState(false);
  const [editingSprint, setEditingSprint] = useState<any>(null);
  const [selectedSprint, setSelectedSprint] = useState<any>(null);
  const [sprintEvents, setSprintEvents] = useState<any[]>([]);

  // Sprint event dialog state
  const [sprintEventDialogOpen, setSprintEventDialogOpen] = useState(false);
  const [editingSprintEvent, setEditingSprintEvent] = useState<any>(null);

  // User and permissions state
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [userRole, setUserRole] = useState<{ id: string; role: string; custom_role: string | null } | null>(null);

  // Calendar → Kanban highlight
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);

  // File attachment counts per task
  const [taskFileCounts, setTaskFileCounts] = useState<Record<string, number>>({});

  // Edit project dialog state
  const [editProjectOpen, setEditProjectOpen] = useState(false);

const roleIcons: { [key: string]: any } = {
  Developer: Code,
  developer: Code,
  "QA Engineer": Bug,
  qa: Bug,
  Designer: Palette,
  designer: Palette,
  "Business Analyst": TrendingUp,
  business_analyst: TrendingUp,
  "Project Manager": Briefcase,
  project_manager: Briefcase,
};

  // Check user's project role
  const isProjectManager = userRole?.role === "owner" || userRole?.role === "lead";
  const isProjectOwner = userRole?.role === "owner";

  // Members see only their own tasks; owners see all
  const visibleTasks = isProjectManager
    ? tasks
    : tasks.filter((t: any) => t.assignee_id === currentUserId || t.assignee?.id === currentUserId || t.created_by === currentUserId);

  // Build breadcrumbs — include active tab name when not on overview
  const tabLabels: Record<string, string> = {
    kanban: "Kanban Board",
    sprints: "Sprints",
    team: "Team",
    settings: "Settings",
    analytics: "Analytics",
    calendar: "Calendar",
    files: "Files",
    "ai-optimizer": "AI Optimizer",
  };

  const breadcrumbs = [
    { label: "Organizations", href: "/dashboard/organizations" },
    {
      label: project?.organizations?.name || "…",
      href: project?.organizations?.id ? `/dashboard/organizations/${project.organizations.id}` : undefined,
    },
  ];

  if (activeTab && activeTab !== "overview" && tabLabels[activeTab]) {
    // Project name is clickable, links back to overview
    breadcrumbs.push({
      label: project?.name || "…",
      href: `/dashboard/projects/${projectId}`,
    });
    breadcrumbs.push({ label: tabLabels[activeTab] });
  } else {
    breadcrumbs.push({ label: project?.name || "…" });
  }

  useBreadcrumbs(breadcrumbs);

  const handleCalendarTaskClick = (taskId: string) => {
    setActiveTab("kanban");
    setHighlightTaskId(taskId);
    // Scroll to the task card after a brief delay for the tab to render
    setTimeout(() => {
      const el = document.getElementById(`task-card-${taskId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    // Clear highlight after animation finishes
    setTimeout(() => setHighlightTaskId(null), 2000);
  };

  const loadProjectData = async (userId: string) => {
    try {
      setCurrentUserId(userId);
      // Fetch role + all project data fully in parallel (single round-trip)
      const [role, projectData, stats, projectTasks, projectSprints] = await Promise.all([
        getUserProjectRole(projectId, userId),
        getProjectDetails(projectId),
        getProjectTaskStats(projectId),
        getProjectTasks(projectId),
        getProjectSprints(projectId),
      ]);

      setUserRole(role);
      setProject(projectData);
      setTaskStats(stats);
      setTasks(projectTasks || []);
      setSprints(projectSprints || []);

      // Load file counts for tasks
      if (projectTasks && projectTasks.length > 0) {
        const ids = projectTasks.map((t: any) => t.id);
        getTaskFileCounts(ids).then(setTaskFileCounts).catch(() => {});
      }
    } catch (error) {
      console.error("Error loading project data:", error);
    } finally {
      setLoading(false);
    }
  };

  const refreshTasks = async () => {
    try {
      const [stats, projectTasks] = await Promise.all([
        getProjectTaskStats(projectId),
        getProjectTasks(projectId),
      ]);
      setTaskStats(stats);
      setTasks(projectTasks || []);

      // Load file counts for all tasks
      if (projectTasks && projectTasks.length > 0) {
        const ids = projectTasks.map((t: any) => t.id);
        getTaskFileCounts(ids).then(setTaskFileCounts).catch(() => {});
      }
    } catch (error) {
      console.error("Error refreshing tasks:", error);
    }
  };

  // Handle task status change (drag and drop simulation)
  const handleTaskStatusChange = async (taskId: string, newStatus: string, task: any) => {
    // Check permissions: only assignee or creator can move tasks
    const canMoveTask = isProjectManager || task.assignee_id === currentUserId || task.assignee?.id === currentUserId || task.created_by === currentUserId || (task.created_by_user?.id === currentUserId);

    if (!canMoveTask) {
      toast.error("Only the assignee or task creator can move this task");
      return;
    }

    try {
      await updateTaskStatus(taskId, newStatus as any);

      // Send status change notification
      if (project?.organizations?.id) {
        const changedByName = userProfile?.full_name || user?.email?.split("@")[0] || "Someone";
        notifyStatusChanged(
          {
            id: taskId,
            title: task.title,
            project_id: projectId,
            assignee_id: task.assignee_id || task.assignee?.id || null,
            created_by: task.created_by,
          },
          newStatus,
          { id: currentUserId, name: changedByName },
          project.organizations?.id || ""
        ).catch(() => {});
      }

      toast.success("Task status updated");
      refreshTasks();
    } catch (error) {
      console.error("Error updating task status:", error);
      toast.error("Failed to update task status");
    }
  };

  const openEditTaskDialog = (task: any) => {
    setEditingTask(task);
    setTaskDialogOpen(true);
  };

  const handleDragDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      toast.success("Task deleted");
      refreshTasks();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Failed to delete task");
    }
  };

  const openCreateTaskDialog = (sprintId?: string, priority?: "low" | "medium" | "high", status?: string) => {
    if (!isProjectManager) {
      toast.error("Only project managers can create tasks");
      return;
    }
    setEditingTask(null);
    setTaskDialogDefaultSprintId(sprintId);
    setTaskDialogDefaultPriority(priority);
    setTaskDialogDefaultStatus(status);
    setTaskDialogOpen(true);
  };

  // Sprint management functions
  const refreshSprints = async () => {
    try {
      const projectSprints = await getProjectSprints(projectId);
      setSprints(projectSprints || []);
      // Refresh selected sprint if viewing one
      if (selectedSprint) {
        const updatedSprint = (projectSprints as any[])?.find((s: any) => s.id === selectedSprint.id);
        if (updatedSprint) {
          setSelectedSprint(updatedSprint);
          const events = await getSprintEvents((updatedSprint as any).id);
          setSprintEvents(events);
        }
      }
    } catch (error) {
      console.error("Error refreshing sprints:", error);
    }
  };

  const openCreateSprintDialog = () => {
    if (!isProjectManager) {
      toast.error("Only project managers can create sprints");
      return;
    }
    setEditingSprint(null);
    setSprintDialogOpen(true);
  };

  const openEditSprintDialog = (sprint: any) => {
    if (!isProjectManager) {
      toast.error("Only project managers can edit sprints");
      return;
    }
    setEditingSprint(sprint);
    setSprintDialogOpen(true);
  };

  const handleViewSprint = async (sprint: any) => {
    setSelectedSprint(sprint);
    try {
      const events = await getSprintEvents(sprint.id);
      setSprintEvents(events);
    } catch (error) {
      console.error("Error loading sprint events:", error);
      setSprintEvents([]);
    }
  };

  const handleStartSprint = async () => {
    if (!selectedSprint || !isProjectManager) return;
    try {
      await startSprint(selectedSprint.id);
      toast.success("Sprint started successfully");
      refreshSprints();
    } catch (error: any) {
      console.error("Error starting sprint:", error);
      toast.error(error.message || "Failed to start sprint");
    }
  };

  const handleStopSprint = async () => {
    if (!selectedSprint || !isProjectManager) return;
    try {
      await stopSprint(selectedSprint.id);
      toast.success("Sprint completed successfully");
      refreshSprints();
    } catch (error) {
      console.error("Error stopping sprint:", error);
      toast.error("Failed to complete sprint");
    }
  };

  const handleReopenSprint = async () => {
    if (!selectedSprint || !isProjectManager) return;
    try {
      await updateSprint(selectedSprint.id, { status: "active" });
      toast.success("Sprint reopened successfully");
      refreshSprints();
    } catch (error) {
      console.error("Error reopening sprint:", error);
      toast.error("Failed to reopen sprint");
    }
  };

  const openCreateEventDialog = () => {
    if (!isProjectManager) {
      toast.error("Only project managers can create events");
      return;
    }
    setEditingSprintEvent(null);
    setSprintEventDialogOpen(true);
  };

  const openEditEventDialog = (event: any) => {
    if (!isProjectManager) {
      toast.error("Only project managers can edit events");
      return;
    }
    setEditingSprintEvent(event);
    setSprintEventDialogOpen(true);
  };

  const refreshSprintEvents = async () => {
    if (selectedSprint) {
      try {
        const events = await getSprintEvents(selectedSprint.id);
        setSprintEvents(events);
      } catch (error) {
        console.error("Error refreshing sprint events:", error);
      }
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    loadProjectData(user.id);
  // user reference changes on token refresh — only re-run on projectId or auth state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user?.id, authLoading]);

  // Load decomposition history when viewing a task
  useEffect(() => {
    if (!viewingTask) {
      setDecompHistory([]);
      setDecompResult(null);
      return;
    }
    // Only load history for parent tasks (not subtasks)
    if (viewingTask.parent_task_id) return;
    getDecompositionHistory(viewingTask.id)
      .then(setDecompHistory)
      .catch(() => setDecompHistory([]));
  }, [viewingTask?.id]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded-lg w-1/3" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded-xl" />
          ))}
        </div>
        <div className="h-48 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <h3 className="text-lg font-semibold">Project Not Found</h3>
          <p className="text-sm text-muted-foreground">
            This project may have been deleted or you don't have access.
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard")}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

  const completionPercentage = taskStats?.total > 0
    ? Math.round((taskStats.byStatus.done / taskStats.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-3 mb-2">
              <FolderKanban className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {project.organizations?.name || "Organization"}
                </p>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
                  {isProjectManager && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-indigo-500"
                      onClick={() => setEditProjectOpen(true)}
                      title="Edit project"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <p className="text-muted-foreground max-w-3xl">
              {project.description || "No description provided"}
            </p>
          </div>
          <Badge
            variant="outline"
            className={`${statusConfig[project.status as keyof typeof statusConfig].color} border`}
          >
            {statusConfig[project.status as keyof typeof statusConfig].label}
          </Badge>
        </div>

        {/* Project Metadata */}
        <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
          {project.start_date && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>Start: {new Date(project.start_date).toLocaleDateString()}</span>
            </div>
          )}
          {project.end_date && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Deadline: {new Date(project.end_date).toLocaleDateString()}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>{project.project_members?.length || 0} team members</span>
          </div>
        </div>

        {/* Progress Bar */}
        {taskStats && taskStats.total > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Overall Progress</span>
              <span className="text-muted-foreground">{completionPercentage}% complete</span>
            </div>
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Team Avatars */}
        {project.project_members && project.project_members.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Team:</span>
            <div className="flex -space-x-2">
              {project.project_members.slice(0, 5).map((member: any) => (
                <div
                  key={member.id}
                  className="relative group"
                  title={`${member.users.full_name || member.users.email} - ${member.custom_role || member.role}`}
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 border-2 border-background flex items-center justify-center text-sm font-medium text-primary hover:z-10 transition-all cursor-pointer">
                    {member.users.full_name
                      ? member.users.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
                      : member.users.email[0].toUpperCase()}
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-popover text-popover-foreground text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap border z-50">
                    <div className="font-medium">{member.users.full_name || member.users.email}</div>
                    <div className="text-muted-foreground">{member.custom_role || member.role}</div>
                  </div>
                </div>
              ))}
              {project.project_members.length > 5 && (
                <div className="h-10 w-10 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-xs font-medium hover:z-10 transition-all cursor-pointer">
                  +{project.project_members.length - 5}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Content Sections - Navigation via Quick Actions */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{taskStats?.total || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {taskStats?.total === 0 ? "No tasks yet" : "Across all sprints"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {taskStats?.byStatus.done || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {taskStats?.total > 0
                    ? `${Math.round((taskStats.byStatus.done / taskStats.total) * 100)}% of total`
                    : "No tasks completed"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {taskStats?.byStatus.in_progress || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Currently being worked on
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">To Do</CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {taskStats?.byStatus.todo || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Pending tasks
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Navigate to different sections of your project
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2 hover:bg-primary/5 hover:text-primary hover:border-primary/50 transition-colors"
                  onClick={() => setActiveTab("kanban")}
                >
                  <LayoutGrid className="h-6 w-6" />
                  <span className="text-sm font-medium">Kanban Board</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2 hover:bg-primary/5 hover:text-primary hover:border-primary/50 transition-colors"
                  onClick={() => setActiveTab("sprints")}
                >
                  <PlayCircle className="h-6 w-6" />
                  <span className="text-sm font-medium">Sprint Management</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2 hover:bg-primary/5 hover:text-primary hover:border-primary/50 transition-colors"
                  onClick={() => setActiveTab("team")}
                >
                  <Users className="h-6 w-6" />
                  <span className="text-sm font-medium">Team</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2 hover:bg-primary/5 hover:text-primary hover:border-primary/50 transition-colors"
                  onClick={() => setActiveTab("settings")}
                >
                  <Settings className="h-6 w-6" />
                  <span className="text-sm font-medium">Settings</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2 hover:bg-primary/5 hover:text-primary hover:border-primary/50 transition-colors"
                  onClick={() => setActiveTab("analytics")}
                >
                  <BarChart3 className="h-6 w-6" />
                  <span className="text-sm font-medium">Analytics</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2 hover:bg-primary/5 hover:text-primary hover:border-primary/50 transition-colors"
                  onClick={() => setActiveTab("calendar")}
                >
                  <Calendar className="h-6 w-6" />
                  <span className="text-sm font-medium">Calendar</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2 hover:bg-primary/5 hover:text-primary hover:border-primary/50 transition-colors"
                  onClick={() => setActiveTab("files")}
                >
                  <Files className="h-6 w-6" />
                  <span className="text-sm font-medium">Files</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 transition-colors"
                  onClick={() => setActiveTab("ai-optimizer")}
                >
                  <Bot className="h-6 w-6" />
                  <span className="text-sm font-medium">AI Optimizer</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Project Info */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Project Information</CardTitle>
                <CardDescription>Key details about this project</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant="outline"
                    className={`${statusConfig[project.status as keyof typeof statusConfig].color} border text-xs`}
                  >
                    {statusConfig[project.status as keyof typeof statusConfig].label}
                  </Badge>
                </div>
                {project.start_date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Start Date</span>
                    <span className="font-medium">
                      {new Date(project.start_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {project.end_date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">End Date</span>
                    <span className="font-medium">
                      {new Date(project.end_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created By</span>
                  <span className="font-medium">
                    {project.created_by_user?.full_name || "Unknown"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created On</span>
                  <span className="font-medium">
                    {new Date(project.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Task Distribution</CardTitle>
                <CardDescription>Tasks by status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {taskStats && taskStats.total > 0 ? (
                  <>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">To Do</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full w-24">
                          <div
                            className="h-full bg-orange-500 rounded-full"
                            style={{ width: `${(taskStats.byStatus.todo / taskStats.total) * 100}%` }}
                          />
                        </div>
                        <span className="font-medium w-8 text-right">{taskStats.byStatus.todo}</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">In Progress</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full w-24">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${(taskStats.byStatus.in_progress / taskStats.total) * 100}%` }}
                          />
                        </div>
                        <span className="font-medium w-8 text-right">{taskStats.byStatus.in_progress}</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">In Review</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full w-24">
                          <div
                            className="h-full bg-purple-500 rounded-full"
                            style={{ width: `${(taskStats.byStatus.review / taskStats.total) * 100}%` }}
                          />
                        </div>
                        <span className="font-medium w-8 text-right">{taskStats.byStatus.review}</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">Done</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full w-24">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${(taskStats.byStatus.done / taskStats.total) * 100}%` }}
                          />
                        </div>
                        <span className="font-medium w-8 text-right">{taskStats.byStatus.done}</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">Blocked</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full w-24">
                          <div
                            className="h-full bg-red-500 rounded-full"
                            style={{ width: `${(taskStats.byStatus.blocked / taskStats.total) * 100}%` }}
                          />
                        </div>
                        <span className="font-medium w-8 text-right">{taskStats.byStatus.blocked}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No tasks created yet
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Kanban Tab */}
        <TabsContent value="kanban" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold">Kanban Board</h3>
              <p className="text-sm text-muted-foreground">
                Visualize and manage tasks across different stages
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showBacklog ? "default" : "outline"}
                size="sm"
                className={`gap-2 ${showBacklog ? "bg-amber-600 hover:bg-amber-700" : ""}`}
                onClick={() => setShowBacklog(!showBacklog)}
              >
                <Archive className="h-4 w-4" />
                Backlog
                {(() => {
                  const backlogCount = visibleTasks.filter((t) => !t.sprint_id).length;
                  return backlogCount > 0 ? (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{backlogCount}</Badge>
                  ) : null;
                })()}
              </Button>
              <Button
                className="gap-2"
                onClick={() => openCreateTaskDialog()}
                disabled={!isProjectManager}
              >
                <Plus className="h-4 w-4" />
                Add Task
              </Button>
            </div>
          </div>

          {/* Backlog Section */}
          {showBacklog && (
            <BacklogSection
              tasks={visibleTasks.filter((t: any) => !t.sprint_id)}
              taskFileCounts={taskFileCounts}
              isProjectManager={isProjectManager}
              onEditTask={openEditTaskDialog}
              onViewTask={(task: any) => setViewingTask(task)}
            />
          )}

          {/* Kanban Board with Drag-and-Drop */}
          {visibleTasks.length > 0 && (
            <DndContext
              sensors={sensors}
              onDragStart={(event: DragStartEvent) => {
                const id = event.active.id as string;
                if (id.startsWith("task-")) {
                  setActiveDragTaskId(id.replace("task-", ""));
                  setActiveDragPriority(null);
                } else {
                  setActiveDragPriority(id);
                  setActiveDragTaskId(null);
                }
              }}
              onDragEnd={(event: DragEndEvent) => {
                const { active, over } = event;
                const activeId = active.id as string;

                if (activeId.startsWith("task-") && over) {
                  const taskId = activeId.replace("task-", "");
                  const targetId = over.id as string;
                  const task = tasks.find((t) => t.id === taskId);

                  if (targetId === "delete-zone" && task) {
                    // Show delete confirmation
                    setDeleteConfirmTaskId(taskId);
                  } else if (targetId.startsWith("column-") && task) {
                    const newStatus = targetId.replace("column-", "");
                    if (newStatus !== task.status) {
                      handleTaskStatusChange(taskId, newStatus, task);
                    }
                  }
                } else if (!activeId.startsWith("task-") && over) {
                  // Priority card dropped on board
                  const priority = activeId as "low" | "medium" | "high";
                  openCreateTaskDialog(undefined, priority, "todo");
                }

                setActiveDragPriority(null);
                setActiveDragTaskId(null);
              }}
              onDragCancel={() => {
                setActiveDragPriority(null);
                setActiveDragTaskId(null);
              }}
            >
              {/* Priority Card Tray */}
              <div className={`bg-white dark:bg-slate-800/50 border-2 border-dashed rounded-xl p-4 shadow-sm transition-all ${
                activeDragPriority ? "border-indigo-500/40 bg-indigo-500/[0.02]" : "border-gray-200 dark:border-slate-700"
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <Layers className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-foreground">Quick Add</span>
                    <p className="text-xs text-muted-foreground">Pick a priority card and drop it on the board to create a task</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <PriorityDragCard priority="low" color="#6b7280" bgColor="bg-gray-50 dark:bg-slate-700" borderColor="#d1d5db" label="Low" icon="🟢" />
                  <PriorityDragCard priority="medium" color="#3b82f6" bgColor="bg-blue-50 dark:bg-blue-950/30" borderColor="#93c5fd" label="Medium" icon="🟡" />
                  <PriorityDragCard priority="high" color="#f97316" bgColor="bg-orange-50 dark:bg-orange-950/30" borderColor="#fdba74" label="High" icon="🔴" />
                </div>
              </div>

              {/* Delete zone — only visible when dragging a task */}
              {activeDragTaskId && (
                <DeleteDropZone />
              )}

              <BoardDropZone active={!!activeDragPriority}>
                {visibleTasks.length === 0 ? (
                  <Card className={`transition-all ${activeDragPriority ? "ring-2 ring-indigo-500/30 ring-dashed" : ""}`}>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <LayoutGrid className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Tasks Yet</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {activeDragPriority
                          ? "Drop here to create your first task!"
                          : "Drag a card from above or click Add Task to get started"}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {["todo", "in_progress", "review", "done"].map((status) => {
                      const statusTasks = visibleTasks.filter((t) => t.status === status);
                      const statusLabels: { [key: string]: { title: string; color: string; bgColor: string } } = {
                        todo: { title: "To Do", color: "bg-orange-500", bgColor: "bg-orange-50 dark:bg-orange-950/20" },
                        in_progress: { title: "Work in Progress", color: "bg-blue-500", bgColor: "bg-blue-50 dark:bg-blue-950/20" },
                        review: { title: "Review", color: "bg-purple-500", bgColor: "bg-purple-50 dark:bg-purple-950/20" },
                        done: { title: "Completed", color: "bg-green-500", bgColor: "bg-green-50 dark:bg-green-950/20" },
                      };

                      const statusOrder = ["todo", "in_progress", "review", "done"];
                      const currentIndex = statusOrder.indexOf(status);
                      const prevStatus = currentIndex > 0 ? statusOrder[currentIndex - 1] : null;
                      const nextStatus = currentIndex < statusOrder.length - 1 ? statusOrder[currentIndex + 1] : null;

                      return (
                        <ColumnDropZone key={status} status={status} active={!!activeDragTaskId}>
                          <Card className={`flex flex-col min-h-[500px] ${statusLabels[status].bgColor}`}>
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={`h-3 w-3 rounded-full ${statusLabels[status].color}`} />
                                  <h4 className="font-semibold">{statusLabels[status].title}</h4>
                                </div>
                                <Badge variant="secondary" className="font-bold">{statusTasks.length}</Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="flex-1 space-y-3 overflow-y-auto">
                              {statusTasks.map((task) => {
                                const canMoveTask = isProjectManager || task.assignee_id === currentUserId || task.assignee?.id === currentUserId || task.created_by === currentUserId || (task.created_by_user?.id === currentUserId);
                                const isHighlighted = task.id === highlightTaskId;

                                return (
                                  <DraggableTaskCard key={task.id} taskId={task.id} canDrag={canMoveTask}>
                                    <Card
                                      id={`task-card-${task.id}`}
                                      className={`border-l-4 bg-background transition-shadow cursor-pointer ${
                                        isHighlighted
                                          ? "ring-2 ring-indigo-500 animate-task-highlight"
                                          : "hover:shadow-md"
                                      }`}
                                      style={{
                                        borderLeftColor:
                                          task.priority === "urgent" ? "#ef4444"
                                            : task.priority === "high" ? "#f97316"
                                            : task.priority === "medium" ? "#3b82f6"
                                            : "#6b7280",
                                      }}
                                      onClick={() => isProjectManager ? openEditTaskDialog(task) : setViewingTask(task)}
                                    >
                                      <CardContent className="p-3 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                            {task.is_ai_generated && (
                                              <Sparkles className="h-3 w-3 text-purple-400 shrink-0" title="AI generated" />
                                            )}
                                            <h5 className="font-medium text-sm leading-tight line-clamp-2 flex-1">
                                              {task.title}
                                            </h5>
                                          </div>
                                          {isProjectManager && (
                                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                                              onClick={(e) => { e.stopPropagation(); openEditTaskDialog(task); }}>
                                              <Pencil className="h-3 w-3" />
                                            </Button>
                                          )}
                                        </div>
                                        {task.description && (
                                          <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <Badge variant="outline" className={`text-xs ${
                                            task.priority === "high" ? "border-orange-500 text-orange-600"
                                              : task.priority === "urgent" ? "border-red-500 text-red-600" : ""
                                          }`}>
                                            {task.priority}
                                          </Badge>
                                          {task.due_date && (
                                            <Badge variant="outline" className="text-xs gap-1">
                                              <Calendar className="h-3 w-3" />
                                              {new Date(task.due_date).toLocaleDateString()}
                                            </Badge>
                                          )}
                                          {taskFileCounts[task.id] > 0 && (
                                            <Badge variant="outline" className="text-xs gap-1">
                                              <Paperclip className="h-3 w-3" />
                                              {taskFileCounts[task.id]}
                                            </Badge>
                                          )}
                                        </div>
                                        {task.assignee ? (
                                          <div className="flex items-center gap-2 pt-1">
                                            <div className="relative">
                                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                                                {task.assignee.full_name
                                                  ? task.assignee.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
                                                  : task.assignee.email?.[0]?.toUpperCase() || "?"}
                                              </div>
                                              {task.ai_suggested_assignee_id && task.ai_suggested_assignee_id === task.assignee_id && (
                                                <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-purple-500" />
                                              )}
                                            </div>
                                            <span className="text-xs text-muted-foreground truncate">
                                              {task.assignee.full_name || task.assignee.email}
                                            </span>
                                          </div>
                                        ) : (
                                          <div
                                            className="flex items-center gap-2 pt-1 cursor-pointer group/avatar"
                                            onClick={(e) => { e.stopPropagation(); setViewingTask(task); }}
                                          >
                                            <div className="h-6 w-6 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center group-hover/avatar:border-purple-400 transition-colors">
                                              <Plus className="h-3 w-3 text-muted-foreground/40 group-hover/avatar:text-purple-500 transition-colors" />
                                            </div>
                                            <span className="text-xs text-muted-foreground/50 group-hover/avatar:text-purple-500 transition-colors">
                                              Unassigned
                                            </span>
                                          </div>
                                        )}

                                        {/* Subtask progress indicator — only for parent tasks */}
                                        {(() => {
                                          const childTasks = visibleTasks.filter((t: any) => t.parent_task_id === task.id);
                                          if (!task.parent_task_id && childTasks.length > 0) {
                                            const doneCount = childTasks.filter((t: any) => t.status === "done").length;
                                            const pct = Math.round((doneCount / childTasks.length) * 100);
                                            return (
                                              <div className="flex items-center gap-2 pt-1">
                                                <div className="h-1.5 flex-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                                  {doneCount}/{childTasks.length} subtasks
                                                </span>
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}

                                        {!activeDragTaskId && canMoveTask && (prevStatus || nextStatus) && (
                                          <div className="flex items-center justify-between pt-2 border-t mt-2">
                                            {prevStatus ? (
                                              <Button variant="ghost" size="sm" className="h-7 text-xs px-2"
                                                onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(task.id, prevStatus, task); }}>
                                                ← {statusLabels[prevStatus].title}
                                              </Button>
                                            ) : <div />}
                                            {nextStatus && (
                                              <Button variant="ghost" size="sm" className="h-7 text-xs px-2"
                                                onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(task.id, nextStatus, task); }}>
                                                {statusLabels[nextStatus].title} →
                                              </Button>
                                            )}
                                          </div>
                                        )}
                                      </CardContent>
                                    </Card>
                                  </DraggableTaskCard>
                                );
                              })}
                            </CardContent>
                          </Card>
                        </ColumnDropZone>
                      );
                    })}
                  </div>
                )}
              </BoardDropZone>

              {/* Drag Overlay */}
              <DragOverlay>
                {activeDragPriority ? (
                  <div className={`px-5 py-3 rounded-xl border-2 shadow-2xl font-semibold text-sm flex items-center gap-3 ${
                    activeDragPriority === "high" ? "bg-orange-50 border-orange-400 text-orange-700"
                      : activeDragPriority === "medium" ? "bg-blue-50 border-blue-400 text-blue-700"
                      : "bg-gray-50 border-gray-400 text-gray-700"
                  }`}>
                    <span className="text-base">{activeDragPriority === "high" ? "🔴" : activeDragPriority === "medium" ? "🟡" : "🟢"}</span>
                    <span>{activeDragPriority === "high" ? "High" : activeDragPriority === "medium" ? "Medium" : "Low"} Priority</span>
                    <Plus className="h-4 w-4 opacity-60" />
                  </div>
                ) : activeDragTaskId ? (() => {
                  const dragTask = tasks.find((t) => t.id === activeDragTaskId);
                  if (!dragTask) return null;
                  return (
                    <div className="px-4 py-2.5 rounded-lg border-2 shadow-2xl bg-white max-w-[220px] border-l-4"
                      style={{
                        borderLeftColor:
                          dragTask.priority === "urgent" ? "#ef4444"
                            : dragTask.priority === "high" ? "#f97316"
                            : dragTask.priority === "medium" ? "#3b82f6"
                            : "#6b7280",
                      }}>
                      <p className="font-medium text-sm truncate">{dragTask.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">{dragTask.priority} priority</p>
                    </div>
                  );
                })() : null}
              </DragOverlay>
            </DndContext>
          )}

          {/* Delete Confirmation Dialog */}
          {deleteConfirmTaskId && (() => {
            const taskToDelete = tasks.find((t) => t.id === deleteConfirmTaskId);
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirmTaskId(null)}>
                <div className="bg-white rounded-xl p-6 shadow-2xl max-w-sm mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                      <Trash2 className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Delete Task?</h3>
                      <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
                    </div>
                  </div>
                  {taskToDelete && (
                    <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                      <p className="font-medium text-sm">{taskToDelete.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{taskToDelete.priority} priority</p>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDeleteConfirmTaskId(null)}>
                      Cancel
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => {
                      handleDragDeleteTask(deleteConfirmTaskId);
                      setDeleteConfirmTaskId(null);
                    }}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Fallback list view (hidden — DnD board is used instead) */}
          {false && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {["todo", "in_progress", "review", "done"].map((status) => {
                const statusTasks = visibleTasks.filter((t) => t.status === status);
                const statusLabels: { [key: string]: { title: string; color: string; bgColor: string } } = {
                  todo: { title: "To Do", color: "bg-orange-500", bgColor: "bg-orange-50 dark:bg-orange-950/20" },
                  in_progress: { title: "Work in Progress", color: "bg-blue-500", bgColor: "bg-blue-50 dark:bg-blue-950/20" },
                  review: { title: "Review", color: "bg-purple-500", bgColor: "bg-purple-50 dark:bg-purple-950/20" },
                  done: { title: "Completed", color: "bg-green-500", bgColor: "bg-green-50 dark:bg-green-950/20" },
                };

                const statusOrder = ["todo", "in_progress", "review", "done"];
                const currentIndex = statusOrder.indexOf(status);
                const prevStatus = currentIndex > 0 ? statusOrder[currentIndex - 1] : null;
                const nextStatus = currentIndex < statusOrder.length - 1 ? statusOrder[currentIndex + 1] : null;

                return (
                  <Card key={status} className={`flex flex-col min-h-[500px] ${statusLabels[status].bgColor}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`h-3 w-3 rounded-full ${statusLabels[status].color}`} />
                          <h4 className="font-semibold">{statusLabels[status].title}</h4>
                        </div>
                        <Badge variant="secondary" className="font-bold">{statusTasks.length}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-3 overflow-y-auto">
                      {statusTasks.map((task) => {
                        const canMoveTask = isProjectManager || task.assignee_id === currentUserId || task.assignee?.id === currentUserId || task.created_by === currentUserId || (task.created_by_user?.id === currentUserId);
                        const isHighlighted = task.id === highlightTaskId;

                        return (
                          <Card
                            key={task.id}
                            id={`task-card-${task.id}`}
                            className={`cursor-pointer border-l-4 bg-background transition-shadow ${
                              isHighlighted ? "ring-2 ring-indigo-500 animate-task-highlight" : "hover:shadow-md"
                            }`}
                            style={{
                              borderLeftColor:
                                task.priority === "urgent" ? "#ef4444"
                                  : task.priority === "high" ? "#f97316"
                                  : task.priority === "medium" ? "#3b82f6"
                                  : "#6b7280",
                            }}
                          >
                            <CardContent className="p-3 space-y-2">
                              <h5 className="font-medium text-sm leading-tight line-clamp-2">{task.title}</h5>
                              {task.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className={`text-xs ${
                                  task.priority === "high" ? "border-orange-500 text-orange-600"
                                    : task.priority === "urgent" ? "border-red-500 text-red-600" : ""
                                }`}>
                                  {task.priority}
                                </Badge>
                                {task.due_date && (
                                  <Badge variant="outline" className="text-xs gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(task.due_date).toLocaleDateString()}
                                  </Badge>
                                )}
                              </div>
                              {task.assignee && (
                                <div className="flex items-center gap-2 pt-1">
                                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                                    {task.assignee.full_name
                                      ? task.assignee.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
                                      : task.assignee.email?.[0]?.toUpperCase() || "?"}
                                  </div>
                                  <span className="text-xs text-muted-foreground truncate">
                                    {task.assignee.full_name || task.assignee.email}
                                  </span>
                                </div>
                              )}
                              {canMoveTask && (prevStatus || nextStatus) && (
                                <div className="flex items-center justify-between pt-2 border-t mt-2">
                                  {prevStatus ? (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2"
                                      onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(task.id, prevStatus, task); }}>
                                      ← {statusLabels[prevStatus].title}
                                    </Button>
                                  ) : <div />}
                                  {nextStatus && (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2"
                                      onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(task.id, nextStatus, task); }}>
                                      {statusLabels[nextStatus].title} →
                                    </Button>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {visibleTasks.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <LayoutGrid className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Tasks Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  No tasks have been created yet. Click "Add Task" to get started.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Task Dialog */}
          <TaskDialog
            open={taskDialogOpen}
            onOpenChange={setTaskDialogOpen}
            projectId={projectId}
            orgId={project?.organizations?.id}
            currentUserId={currentUserId}
            task={editingTask}
            isProjectManager={isProjectManager}
            projectEndDate={project?.end_date}
            availableSprints={sprints.filter((s: any) => s.status !== "cancelled")}
            defaultSprintId={taskDialogDefaultSprintId}
            defaultPriority={taskDialogDefaultPriority}
            defaultStatus={taskDialogDefaultStatus}
            hidePriority={!!taskDialogDefaultPriority}
            onTaskCreated={refreshTasks}
            onTaskUpdated={refreshTasks}
            onTaskDeleted={refreshTasks}
          />

          {/* View-only Task Detail Dialog (for non-managers) — enhanced with AI decomposition */}
          <Dialog open={!!viewingTask} onOpenChange={(open) => { if (!open) { setViewingTask(null); setDecompResult(null); setDecompHistory([]); } }}>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center gap-2">
                  {viewingTask?.is_ai_generated && (
                    <Sparkles className="h-4 w-4 text-purple-500 shrink-0" />
                  )}
                  <DialogTitle>{viewingTask?.title}</DialogTitle>
                </div>
              </DialogHeader>
              {viewingTask && (
                <div className="space-y-4">
                  {viewingTask.description && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                      <p className="text-sm whitespace-pre-wrap">{viewingTask.description}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Status</p>
                      <Badge variant="outline" className="capitalize">{viewingTask.status?.replace("_", " ")}</Badge>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Priority</p>
                      <Badge variant="outline" className={`capitalize ${
                        viewingTask.priority === "urgent" ? "border-red-500 text-red-600"
                          : viewingTask.priority === "high" ? "border-orange-500 text-orange-600"
                          : viewingTask.priority === "medium" ? "border-blue-500 text-blue-600"
                          : ""
                      }`}>{viewingTask.priority}</Badge>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Assignee</p>
                      {viewingTask.assignee ? (
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm">{viewingTask.assignee.full_name || viewingTask.assignee.email}</p>
                          {viewingTask.ai_suggested_assignee_id === viewingTask.assignee_id && (
                            <Sparkles className="h-3 w-3 text-purple-500" title="AI suggested" />
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Unassigned</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Due Date</p>
                      <p className="text-sm">{viewingTask.due_date ? new Date(viewingTask.due_date).toLocaleDateString() : "Not set"}</p>
                    </div>
                    {viewingTask.sprints && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Sprint</p>
                        <p className="text-sm">{viewingTask.sprints.name}</p>
                      </div>
                    )}
                    {viewingTask.story_points && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Story Points</p>
                        <Badge variant="secondary">{viewingTask.story_points} pts</Badge>
                      </div>
                    )}
                  </div>

                  {/* AI Assignee suggestion — always available (also for re-assignment) */}
                  {(
                    <AssigneeSuggestionPanel
                      taskId={viewingTask.id}
                      hasAssignee={!!viewingTask.assignee_id}
                      userRole={userRole?.role || "viewer"}
                      onAssigned={(userId, fullName) => {
                        // Optimistic update
                        setViewingTask((prev: any) => prev ? {
                          ...prev,
                          assignee_id: userId,
                          assignee: { id: userId, full_name: fullName, email: "", avatar_url: null },
                          ai_suggested_assignee_id: userId,
                        } : null);
                        // Update in DB
                        supabase
                          .from("tasks")
                          .update({ assignee_id: userId, ai_suggested_assignee_id: userId })
                          .eq("id", viewingTask.id)
                          .then(() => refreshTasks());
                      }}
                      onDismiss={() => {}}
                    />
                  )}

                  {/* Subtask hierarchy — shown when task has accepted subtasks */}
                  {!viewingTask.parent_task_id && (
                    <SubtaskHierarchyView
                      parentTaskId={viewingTask.id}
                      parentTitle={viewingTask.title}
                      onSubtaskClick={(subtaskId) => {
                        const subtask = tasks.find((t: any) => t.id === subtaskId);
                        if (subtask) setViewingTask(subtask);
                      }}
                    />
                  )}

                  {/* AI Decompose button — no subtasks yet */}
                  {!viewingTask.parent_task_id && !decompResult && (
                    <DecomposeButton
                      taskId={viewingTask.id}
                      hasSubtasks={tasks.some((t: any) => t.parent_task_id === viewingTask.id)}
                      userRole={userRole?.role || "viewer"}
                      decompositionStatus={viewingTask.decomposition_status}
                      onDecompose={(result) => setDecompResult(result)}
                    />
                  )}

                  {/* Decomposition panel — shown after AI analysis */}
                  {decompResult && (
                    <DecompositionPanel
                      result={decompResult}
                      onClose={() => setDecompResult(null)}
                      onAccepted={() => {
                        setDecompResult(null);
                        setViewingTask(null);
                        refreshTasks();
                      }}
                      onRejected={() => {
                        setDecompResult(null);
                      }}
                    />
                  )}

                  {/* Decomposition history accordion */}
                  {!decompResult && decompHistory.length > 0 && (
                    <details className="group">
                      <summary className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronRight className="h-3.5 w-3.5 group-open:rotate-90 transition-transform" />
                        Past AI Analyses ({decompHistory.length})
                      </summary>
                      <div className="mt-2 space-y-2 pl-5">
                        {decompHistory.map((entry: any) => (
                          <div key={entry.id} className="text-xs p-2 rounded-md bg-muted/50 space-y-1">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-[10px] capitalize">{entry.status}</Badge>
                              <span className="text-muted-foreground">
                                {new Date(entry.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="text-muted-foreground">
                              {Array.isArray(entry.suggested_subtasks) ? entry.suggested_subtasks.length : 0} subtasks suggested
                              {entry.confidence_score != null && ` \u00B7 ${Math.round(entry.confidence_score * 100)}% confidence`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setViewingTask(null); setDecompResult(null); setDecompHistory([]); }}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Sprints Tab */}
        <TabsContent value="sprints" className="space-y-4">
          {selectedSprint ? (
            // Sprint Detail View with Timeline
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setSelectedSprint(null)}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Sprints
              </Button>

              <div className="flex justify-end">
                <Button
                  className="gap-2"
                  size="sm"
                  onClick={() => openCreateTaskDialog(selectedSprint.id)}
                >
                  <Plus className="h-4 w-4" />
                  Add Task to Sprint
                </Button>
              </div>

              <SprintTimeline
                sprint={selectedSprint}
                events={sprintEvents}
                isProjectManager={isProjectManager}
                onStartSprint={handleStartSprint}
                onStopSprint={handleStopSprint}
                onReopenSprint={handleReopenSprint}
                onEditSprint={() => openEditSprintDialog(selectedSprint)}
                onAddEvent={openCreateEventDialog}
                onEditEvent={openEditEventDialog}
              />

              {/* Task Dialog (for creating tasks within a sprint) */}
              <TaskDialog
                open={taskDialogOpen}
                onOpenChange={setTaskDialogOpen}
                projectId={projectId}
                currentUserId={currentUserId}
                task={editingTask}
                isProjectManager={isProjectManager}
                projectEndDate={project?.end_date}
                availableSprints={sprints.filter((s: any) => s.status !== "cancelled")}
                defaultSprintId={taskDialogDefaultSprintId}
                onTaskCreated={refreshTasks}
                onTaskUpdated={refreshTasks}
                onTaskDeleted={refreshTasks}
              />

              {/* Sprint Event Dialog */}
              {selectedSprint && (
                <SprintEventDialog
                  open={sprintEventDialogOpen}
                  onOpenChange={setSprintEventDialogOpen}
                  sprintId={selectedSprint.id}
                  projectId={projectId}
                  currentUserId={currentUserId}
                  event={editingSprintEvent}
                  isProjectManager={isProjectManager}
                  onEventCreated={refreshSprintEvents}
                  onEventUpdated={refreshSprintEvents}
                  onEventDeleted={refreshSprintEvents}
                />
              )}
            </div>
          ) : (
            // Sprint List View
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Sprint Management</h3>
                  <p className="text-sm text-muted-foreground">
                    Plan, track, and manage your project sprints
                    {!isProjectManager && " (Only project managers can create/edit sprints)"}
                  </p>
                </div>
                <Button
                  className="gap-2"
                  onClick={() => openCreateSprintDialog()}
                  disabled={!isProjectManager}
                >
                  <Plus className="h-4 w-4" />
                  Create Sprint
                </Button>
              </div>

              {sprints.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <PlayCircle className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Sprints Yet</h3>
                    <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                      Create your first sprint to organize tasks into time-boxed iterations.
                      Define goals, set timelines, and schedule events.
                    </p>
                    {isProjectManager && (
                      <Button className="gap-2" onClick={() => openCreateSprintDialog()}>
                        <Plus className="h-4 w-4" />
                        Create First Sprint
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {sprints.map((sprint: any) => {
                    const sprintStatusConfig: { [key: string]: { label: string; color: string } } = {
                      planned: { label: "Planned", color: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
                      active: { label: "Active", color: "bg-green-500/10 text-green-700 border-green-500/20" },
                      completed: { label: "Completed", color: "bg-purple-500/10 text-purple-700 border-purple-500/20" },
                      cancelled: { label: "Cancelled", color: "bg-gray-500/10 text-gray-700 border-gray-500/20" },
                    };

                    const config = sprintStatusConfig[sprint.status] || sprintStatusConfig.planned;
                    const taskCount = sprint.tasks?.[0]?.count || 0;

                    return (
                      <Card key={sprint.id} className="hover:shadow-md transition-shadow">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-lg">{sprint.name}</CardTitle>
                              <CardDescription className="mt-1 line-clamp-2">
                                {sprint.goal || "No goal set"}
                              </CardDescription>
                            </div>
                            <Badge variant="outline" className={`${config.color} border`}>
                              {config.label}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Start Date</span>
                              <span className="font-medium">
                                {new Date(sprint.start_date).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">End Date</span>
                              <span className="font-medium">
                                {new Date(sprint.end_date).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Tasks</span>
                              <span className="font-medium">{taskCount}</span>
                            </div>
                          </div>

                          {sprint.status === "active" && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Days Remaining</span>
                                <span className="font-medium">
                                  {Math.max(
                                    0,
                                    Math.ceil(
                                      (new Date(sprint.end_date).getTime() - new Date().getTime()) /
                                        (1000 * 60 * 60 * 24)
                                    )
                                  )}
                                </span>
                              </div>
                              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      ((new Date().getTime() - new Date(sprint.start_date).getTime()) /
                                        (new Date(sprint.end_date).getTime() -
                                          new Date(sprint.start_date).getTime())) *
                                        100
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => handleViewSprint(sprint)}
                          >
                            View Sprint
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {sprints.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Sprint Statistics</CardTitle>
                    <CardDescription>Overview of all sprints</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          {sprints.filter((s) => s.status === "planned").length}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Planned</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {sprints.filter((s) => s.status === "active").length}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Active</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">
                          {sprints.filter((s) => s.status === "completed").length}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Completed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">
                          {sprints.length}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Total</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Sprint Dialog */}
          <SprintDialog
            open={sprintDialogOpen}
            onOpenChange={setSprintDialogOpen}
            projectId={projectId}
            sprint={editingSprint}
            isProjectManager={isProjectManager}
            onSprintCreated={refreshSprints}
            onSprintUpdated={refreshSprints}
            onSprintDeleted={() => {
              refreshSprints();
              setSelectedSprint(null);
            }}
          />
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team">
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Manage your project team and their roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              {project.project_members && project.project_members.length > 0 ? (
                <div className="space-y-4">
                  {project.project_members.map((member: any) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-medium text-primary">
                          {member.users.full_name
                            ? member.users.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
                            : member.users.email[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">
                            {member.users.full_name || member.users.email}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {member.users.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {member.custom_role && (
                          <Badge variant="secondary" className="gap-1">
                            {roleIcons[member.custom_role] && (
                              (() => {
                                const Icon = roleIcons[member.custom_role];
                                return <Icon className="h-3 w-3" />;
                              })()
                            )}
                            {member.custom_role}
                          </Badge>
                        )}
                        <Badge variant="outline" className="capitalize">
                          {member.role}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No team members yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          {isProjectManager ? (
            <>
              {/* General Settings */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>General</CardTitle>
                      <CardDescription>
                        Project name, description, status, and dates
                      </CardDescription>
                    </div>
                    <Button
                      size="sm"
                      className="bg-indigo-500 hover:bg-indigo-500/90 gap-1.5"
                      onClick={() => setEditProjectOpen(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit Details
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Name</p>
                      <p className="text-sm font-medium text-foreground">{project.name}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Status</p>
                      <Badge
                        variant="outline"
                        className={`${statusConfig[project.status as keyof typeof statusConfig]?.color} border text-xs`}
                      >
                        {statusConfig[project.status as keyof typeof statusConfig]?.label || project.status}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Start Date</p>
                      <p className="text-sm">{project.start_date ? new Date(project.start_date).toLocaleDateString() : "Not set"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">End Date</p>
                      <p className="text-sm">{project.end_date ? new Date(project.end_date).toLocaleDateString() : "Not set"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Project Manager</p>
                      <p className="text-sm font-medium text-foreground">
                        {(() => {
                          const pm = (project.project_members || []).find(
                            (m: any) => m.role === "owner" || m.role === "lead",
                          );
                          return (
                            pm?.users?.full_name ||
                            pm?.users?.email ||
                            project.created_by_user?.full_name ||
                            project.created_by_user?.email ||
                            "Unassigned"
                          );
                        })()}
                      </p>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <p className="text-xs font-medium text-muted-foreground">Description</p>
                      <p className="text-sm text-muted-foreground">{project.description || "No description"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Members */}
              <Card>
                <CardContent className="p-6">
                  <ProjectMemberManager
                    projectId={projectId}
                    orgId={project.organizations?.id || ""}
                    members={project.project_members || []}
                    currentUserId={currentUserId}
                    isOwner={isProjectOwner}
                    isManager={isProjectManager}
                    onMembersChanged={() => loadProjectData(currentUserId)}
                  />
                </CardContent>
              </Card>

              {/* Danger Zone */}
              <Card>
                <CardContent className="p-6">
                  <ProjectDangerZone
                    project={project}
                    isOwner={isProjectManager}
                    currentUserMemberId={userRole?.id}
                    members={project.project_members || []}
                    onUpdated={() => loadProjectData(currentUserId)}
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <Settings className="h-12 w-12 text-muted-foreground mx-auto" />
                    <h3 className="text-lg font-semibold">Access Restricted</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Only project owners and leads can access project settings.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Analytics</h3>
              <p className="text-sm text-muted-foreground">
                Track contributions, team performance, and project health
              </p>
            </div>
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>

          {activeTab === "analytics" && (
            <>
              {/* AI Sprint Health Widget — embedded in analytics */}
              <SprintRiskWidget
                projectId={projectId}
                sprints={sprints}
                onViewFullReport={() => setActiveTab("ai-optimizer")}
                className="mb-4"
              />
              <ProjectAnalytics
                projectId={projectId}
                currentUserId={currentUserId}
                isProjectManager={isProjectManager}
              />
            </>
          )}
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="space-y-4">
          {activeTab === "calendar" && (
            <ProjectCalendar
              projectId={projectId}
              currentUserId={currentUserId}
              isProjectManager={isProjectManager}
              onNavigateToKanban={handleCalendarTaskClick}
              onAddSprintEvent={() => {
                if (!isProjectManager || !selectedSprint) {
                  if (!selectedSprint) {
                    toast.error("Please select a sprint first from the Sprints tab to add events");
                  }
                  return;
                }
                setEditingSprintEvent(null);
                setSprintEventDialogOpen(true);
              }}
            />
          )}
        </TabsContent>

        {/* Files Tab */}
        <TabsContent value="files" className="space-y-4">
          {activeTab === "files" && project?.organizations?.id && (
            <ProjectFilesTab
              orgId={project.organizations.id}
              projectId={projectId}
            />
          )}
        </TabsContent>

        {/* AI Optimizer Tab */}
        <TabsContent value="ai-optimizer" className="space-y-4">
          {activeTab === "ai-optimizer" && (() => {
            const activeSprint = sprints.find((s: any) => s.status === "active") || sprints[0];
            return (
              <AIOptimizerTab
                projectId={projectId}
                sprints={sprints}
                activeSprint={activeSprint}
              />
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* Edit Project Dialog */}
      {isProjectManager && (
        <EditProjectDialog
          open={editProjectOpen}
          onOpenChange={setEditProjectOpen}
          project={project}
          onUpdated={() => loadProjectData(currentUserId)}
        />
      )}
    </div>
  );
}

export default function ProjectDashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen" />}>
      <ProjectDashboardContent />
    </Suspense>
  );
}
