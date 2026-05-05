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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Loader2, Trash2, Target } from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  createSprint,
  updateSprint,
  deleteSprint,
} from "@/lib/database";

const sprintFormSchema = z.object({
  name: z
    .string()
    .min(1, "Sprint name is required")
    .max(100, "Name is too long")
    .refine((v) => v.trim().length > 0, "Name cannot be empty or only whitespace"),
  goal: z
    .string()
    .max(1000, "Goal is too long")
    .optional()
    .refine((v) => !v || v.trim().length > 0, "Goal cannot be only whitespace"),
  start_date: z.date({ message: "Start date is required" }),
  end_date: z.date({ message: "End date is required" }),
  status: z.enum(["planned", "active", "completed", "cancelled"]).optional(),
}).refine((data) => data.end_date > data.start_date, {
  message: "End date must be after start date",
  path: ["end_date"],
});

type SprintFormValues = z.infer<typeof sprintFormSchema>;

interface SprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  sprint?: {
    id: string;
    name: string;
    goal: string | null;
    start_date: string;
    end_date: string;
    status: string;
  } | null;
  isProjectManager: boolean;
  onSprintCreated?: () => void;
  onSprintUpdated?: () => void;
  onSprintDeleted?: () => void;
}

export function SprintDialog({
  open,
  onOpenChange,
  projectId,
  projectStartDate,
  projectEndDate,
  sprint,
  isProjectManager,
  onSprintCreated,
  onSprintUpdated,
  onSprintDeleted,
}: SprintDialogProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditing = !!sprint;

  const form = useForm<SprintFormValues>({
    resolver: zodResolver(sprintFormSchema),
    defaultValues: {
      name: "",
      goal: "",
      start_date: new Date(),
      end_date: addDays(new Date(), 14), // Default 2-week sprint
    },
  });

  // Reset form when dialog opens or sprint changes
  useEffect(() => {
    if (open) {
      if (sprint) {
        form.reset({
          name: sprint.name,
          goal: sprint.goal || "",
          start_date: new Date(sprint.start_date),
          end_date: new Date(sprint.end_date),
          status: sprint.status as "planned" | "active" | "completed" | "cancelled",
        });
      } else {
        form.reset({
          name: "",
          goal: "",
          start_date: new Date(),
          end_date: addDays(new Date(), 14),
        });
      }
    }
  }, [open, sprint, form]);

  async function onSubmit(values: SprintFormValues) {
    setLoading(true);
    try {
      if (isEditing && sprint) {
        // Update existing sprint
        await updateSprint(sprint.id, {
          name: values.name,
          goal: values.goal || null,
          start_date: values.start_date.toISOString(),
          end_date: values.end_date.toISOString(),
          ...(values.status ? { status: values.status } : {}),
        });
        toast.success("Sprint updated successfully");
        onSprintUpdated?.();
      } else {
        // Create new sprint
        await createSprint({
          project_id: projectId,
          name: values.name,
          goal: values.goal || null,
          start_date: values.start_date.toISOString(),
          end_date: values.end_date.toISOString(),
          status: "planned",
        });
        toast.success("Sprint created successfully");
        onSprintCreated?.();
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving sprint:", error);
      toast.error(isEditing ? "Failed to update sprint" : "Failed to create sprint");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!sprint || !isProjectManager) return;

    setDeleting(true);
    try {
      await deleteSprint(sprint.id);
      toast.success("Sprint deleted successfully");
      onSprintDeleted?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error deleting sprint:", error);
      toast.error("Failed to delete sprint");
    } finally {
      setDeleting(false);
    }
  }

  const canEdit = isProjectManager;
  const canDelete = isProjectManager && isEditing && sprint?.status === "planned";

  // Project date boundaries (strip time so day comparisons are inclusive)
  const projectStart = projectStartDate ? (() => { const d = new Date(projectStartDate); d.setHours(0,0,0,0); return d; })() : null;
  const projectEnd = projectEndDate ? (() => { const d = new Date(projectEndDate); d.setHours(23,59,59,999); return d; })() : null;

  // Calculate sprint duration
  const startDate = form.watch("start_date");
  const endDate = form.watch("end_date");
  const sprintDuration = startDate && endDate
    ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            {isEditing ? "Edit Sprint" : "Create New Sprint"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the sprint details below."
              : "Define your sprint goals and timeline. Sprints help organize work into focused, time-boxed iterations."}
          </DialogDescription>
        </DialogHeader>

        {!canEdit && !isEditing ? (
          <div className="py-6 text-center text-muted-foreground">
            Only project managers can create sprints.
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sprint Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Sprint 1 - User Authentication"
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
                name="goal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Sprint Goal
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Define the main objective for this sprint. What should be accomplished by the end?"
                        className="resize-none"
                        rows={3}
                        {...field}
                        disabled={!canEdit}
                      />
                    </FormControl>
                    <FormDescription>
                      A clear goal helps the team understand what success looks like for this sprint.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isEditing && (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sprint Status</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={!canEdit}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="planned">Planned</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date *</FormLabel>
                      <Popover modal={true}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
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
                            onSelect={(date) => {
                              field.onChange(date);
                              // If new start date is after current end date, reset end date
                              const currentEndDate = form.getValues("end_date");
                              if (date && currentEndDate && date >= currentEndDate) {
                                form.setValue("end_date", addDays(date, 14));
                              }
                            }}
                            disabled={(date) => {
                              const yesterday = new Date();
                              yesterday.setDate(yesterday.getDate() - 1);
                              yesterday.setHours(23, 59, 59, 999);
                              if (date < yesterday) return true;
                              if (projectStart && date < projectStart) return true;
                              if (projectEnd && date > projectEnd) return true;
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

                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date *</FormLabel>
                      <Popover modal={true}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
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
                              const minEndDate = new Date(startDate);
                              minEndDate.setDate(minEndDate.getDate() + 1);
                              minEndDate.setHours(0, 0, 0, 0);
                              if (date < minEndDate) return true;
                              if (projectEnd && date > projectEnd) return true;
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
              </div>

              {sprintDuration > 0 && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <span className="font-medium">Sprint Duration: </span>
                  <span className="text-muted-foreground">
                    {sprintDuration} day{sprintDuration !== 1 ? "s" : ""}
                    {sprintDuration === 7 && " (1 week)"}
                    {sprintDuration === 14 && " (2 weeks)"}
                    {sprintDuration === 21 && " (3 weeks)"}
                    {sprintDuration === 28 && " (4 weeks)"}
                  </span>
                </div>
              )}

              {(projectStart || projectEnd) && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-400">
                  Sprint dates must fall within the project timeline
                  {projectStart && projectEnd
                    ? `: ${format(projectStart, "PPP")} – ${format(projectEnd, "PPP")}`
                    : projectEnd
                      ? ` (ends ${format(projectEnd, "PPP")})`
                      : ` (starts ${format(projectStart!, "PPP")})`}
                </div>
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
                    {isEditing ? "Update Sprint" : "Create Sprint"}
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
