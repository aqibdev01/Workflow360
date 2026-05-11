"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Loader2, Trash2, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  createTask,
  updateTask,
  deleteTask,
  getProjectMembersForAssignment,
} from "@/lib/database";
import { notifyTaskAssigned } from "@/lib/notifications/triggers";
import { TaskAttachments } from "@/components/files/TaskAttachments";

const taskFormSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title is too long")
    .refine((v) => v.trim().length > 0, "Title cannot be empty or only whitespace"),
  description: z
    .string()
    .max(2000, "Description is too long")
    .optional()
    .refine(
      (v) => !v || v.trim().length > 0,
      "Description cannot be only whitespace",
    ),
  assignee_id: z.string().optional(),
  sprint_id: z.string().optional(),
  due_date: z.date().optional(),
  priority: z.enum(["low", "medium", "high"]),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

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
  } | null;
}

interface Sprint {
  id: string;
  name: string;
  status: string;
  start_date?: string;
  end_date?: string;
}

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  orgId?: string;
  currentUserId: string;
  task?: {
    id: string;
    title: string;
    description: string | null;
    assignee_id: string | null;
    sprint_id: string | null;
    due_date: string | null;
    priority: "low" | "medium" | "high" | "urgent";
    created_by: string;
  } | null;
  isProjectManager: boolean;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  availableSprints?: Sprint[];
  defaultSprintId?: string;
  defaultPriority?: "low" | "medium" | "high";
  defaultStatus?: string;
  hidePriority?: boolean;
  onTaskCreated?: () => void;
  onTaskUpdated?: () => void;
  onTaskDeleted?: () => void;
}

export function TaskDialog({
  open,
  onOpenChange,
  projectId,
  orgId,
  currentUserId,
  task,
  isProjectManager,
  projectStartDate,
  projectEndDate,
  availableSprints = [],
  defaultSprintId,
  defaultPriority,
  defaultStatus,
  hidePriority,
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
}: TaskDialogProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const isEditing = !!task;

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      assignee_id: "",
      sprint_id: defaultSprintId || "",
      priority: "medium",
    },
  });

  // Load project members for assignment dropdown
  useEffect(() => {
    async function loadMembers() {
      if (!open) return;

      setLoadingMembers(true);
      try {
        const projectMembers = await getProjectMembersForAssignment(projectId);
        setMembers(projectMembers as ProjectMember[]);
      } catch (error) {
        console.error("Error loading project members:", error);
        toast.error("Failed to load team members");
      } finally {
        setLoadingMembers(false);
      }
    }

    loadMembers();
  }, [projectId, open]);

  // Reset form when dialog opens or task changes
  useEffect(() => {
    if (open) {
      if (task) {
        form.reset({
          title: task.title,
          description: task.description || "",
          assignee_id: task.assignee_id || "",
          sprint_id: task.sprint_id || "",
          due_date: task.due_date ? new Date(task.due_date) : undefined,
          priority: task.priority === "urgent" ? "high" : task.priority,
        });
      } else {
        form.reset({
          title: "",
          description: "",
          assignee_id: "",
          sprint_id: defaultSprintId || "",
          priority: defaultPriority || "medium",
        });
      }
    }
  }, [open, task, form]);

  const selectedSprintId = form.watch("sprint_id");
  const selectedSprint = availableSprints.find((s) => s.id === selectedSprintId);

  async function onSubmit(values: TaskFormValues) {
    setLoading(true);
    try {
      // Convert empty string or "unassigned" to null for the database
      const assigneeId = values.assignee_id && values.assignee_id !== "unassigned"
        ? values.assignee_id
        : null;

      // Get current user's name for notifications
      const currentMember = members.find((m) => m.user_id === currentUserId);
      const currentUserName = currentMember?.users?.full_name || currentMember?.users?.email?.split("@")[0] || "Someone";

      if (isEditing && task) {
        // Update existing task
        const sprintId = values.sprint_id && values.sprint_id !== "none"
          ? values.sprint_id
          : null;
        await updateTask(task.id, {
          title: values.title,
          description: values.description || null,
          assignee_id: assigneeId,
          sprint_id: sprintId,
          due_date: values.due_date ? values.due_date.toISOString() : null,
          priority: values.priority,
        });

        // Notify if assignee changed
        if (assigneeId && assigneeId !== task.assignee_id && orgId) {
          notifyTaskAssigned(
            { id: task.id, title: values.title, project_id: projectId },
            assigneeId,
            { id: currentUserId, name: currentUserName },
            orgId
          ).catch(() => {});
        }

        toast.success("Task updated successfully");
        onTaskUpdated?.();
      } else {
        // Create new task
        const sprintId = values.sprint_id && values.sprint_id !== "none"
          ? values.sprint_id
          : null;
        const newTask = await createTask({
          project_id: projectId,
          title: values.title,
          description: values.description || null,
          assignee_id: assigneeId,
          sprint_id: sprintId,
          due_date: values.due_date ? values.due_date.toISOString() : null,
          priority: values.priority,
          status: defaultStatus || "todo",
          created_by: currentUserId,
        } as any);

        // Notify assignee on new task
        if (assigneeId && orgId && newTask) {
          notifyTaskAssigned(
            { id: newTask.id, title: values.title, project_id: projectId },
            assigneeId,
            { id: currentUserId, name: currentUserName },
            orgId
          ).catch(() => {});
        }

        toast.success("Task created successfully");
        onTaskCreated?.();
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving task:", error);
      toast.error(isEditing ? "Failed to update task" : "Failed to create task");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!task || !isProjectManager) return;

    setDeleting(true);
    try {
      await deleteTask(task.id);
      toast.success("Task deleted successfully");
      onTaskDeleted?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Failed to delete task");
    } finally {
      setDeleting(false);
    }
  }

  // Only project managers can create and edit tasks
  const canEdit = isProjectManager;
  const canDelete = isProjectManager && isEditing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Task" : "Create New Task"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the task details below."
              : "Fill in the details to create a new task. Tasks are added to the To Do column by default."}
          </DialogDescription>
        </DialogHeader>

        {!canEdit && !isEditing ? (
          <div className="py-6 text-center text-muted-foreground">
            Only project managers can create tasks.
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task Title *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter task title"
                        {...field}
                        disabled={!canEdit}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter task description (optional)"
                        className="resize-none"
                        rows={3}
                        {...field}
                        disabled={!canEdit}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assignee_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned To (Optional)</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || "unassigned"}
                      disabled={!canEdit || loadingMembers}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a team member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {members.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {member.users?.full_name ||
                              member.users?.email?.split("@")[0] ||
                              "Unknown"}
                            {member.custom_role && ` (${member.custom_role})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Sprint selector — shown for both create and edit when sprints are available */}
              {availableSprints.length > 0 && (
                <FormField
                  control={form.control}
                  name="sprint_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sprint (Optional)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || "none"}
                        disabled={!canEdit}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="No sprint (backlog)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No sprint (backlog)</SelectItem>
                          {availableSprints.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                              {s.status === "active" && " (Active)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Due Date (Optional)</FormLabel>
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={!canEdit}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[200]" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => {
                            // Sprint range is the authoritative constraint when a sprint is chosen.
                            if (selectedSprint?.start_date && selectedSprint?.end_date) {
                              const sprintStart = new Date(selectedSprint.start_date);
                              sprintStart.setHours(0, 0, 0, 0);
                              const sprintEnd = new Date(selectedSprint.end_date);
                              sprintEnd.setHours(23, 59, 59, 999);
                              return date < sprintStart || date > sprintEnd;
                            }
                            // Minimum: the later of today and the project start date
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            if (projectStartDate) {
                              const pStart = new Date(projectStartDate);
                              pStart.setHours(0, 0, 0, 0);
                              if (date < pStart) return true;
                            } else {
                              if (date < today) return true;
                            }
                            // Maximum: project end date
                            if (projectEndDate) {
                              const endDate = new Date(projectEndDate);
                              endDate.setHours(23, 59, 59, 999);
                              if (date > endDate) return true;
                            }
                            return false;
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {hidePriority && defaultPriority && !isEditing ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Priority</label>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${
                    defaultPriority === "high" ? "bg-orange-50 border-orange-200 text-orange-700"
                      : defaultPriority === "medium" ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-gray-50 border-gray-200 text-gray-700"
                  }`}>
                    <div className={`h-2.5 w-2.5 rounded-full ${
                      defaultPriority === "high" ? "bg-orange-500"
                        : defaultPriority === "medium" ? "bg-blue-500"
                        : "bg-gray-500"
                    }`} />
                    <span className="font-medium capitalize">{defaultPriority}</span>
                    <span className="text-xs opacity-60 ml-1">(set from card)</span>
                  </div>
                </div>
              ) : (
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={!canEdit}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-gray-500" />
                              Low
                            </div>
                          </SelectItem>
                          <SelectItem value="medium">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-blue-500" />
                              Medium
                            </div>
                          </SelectItem>
                          <SelectItem value="high">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-orange-500" />
                              High
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Task Attachments — only shown when editing an existing task */}
              {isEditing && task && orgId && (
                <TaskAttachments
                  taskId={task.id}
                  orgId={orgId}
                  projectId={projectId}
                  canEdit={canEdit}
                />
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                {canDelete && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleting || loading}
                    className="mr-auto"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    <span className="ml-2">Delete</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                {canEdit && (
                  <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isEditing ? "Update Task" : "Create Task"}
                  </Button>
                )}
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
