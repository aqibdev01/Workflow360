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
import {
  CalendarIcon,
  Loader2,
  Trash2,
  Clock,
  Users,
  Target,
  MessageSquare,
  Flag,
  Calendar as CalendarIconSolid,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  createSprintEvent,
  updateSprintEvent,
  deleteSprintEvent,
  notifyProjectMembers,
} from "@/lib/database";

const eventTypes = [
  { value: "planning", label: "Sprint Planning", icon: Target, color: "text-blue-500" },
  { value: "daily_standup", label: "Daily Standup", icon: Users, color: "text-green-500" },
  { value: "review", label: "Sprint Review", icon: MessageSquare, color: "text-purple-500" },
  { value: "retrospective", label: "Retrospective", icon: Clock, color: "text-orange-500" },
  { value: "meeting", label: "Team Meeting", icon: Users, color: "text-indigo-500" },
  { value: "milestone", label: "Milestone", icon: Flag, color: "text-red-500" },
  { value: "other", label: "Other", icon: CalendarIconSolid, color: "text-gray-500" },
];

const sprintEventFormSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title is too long")
    .refine((v) => v.trim().length > 0, "Title cannot be empty or only whitespace"),
  description: z
    .string()
    .max(1000, "Description is too long")
    .optional()
    .refine((v) => !v || v.trim().length > 0, "Description cannot be only whitespace"),
  event_type: z.enum(["planning", "daily_standup", "review", "retrospective", "meeting", "milestone", "other"]),
  event_date: z.date({ message: "Date is required" }),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
}).refine((data) => {
  // If both times are provided, end time must be after start time
  if (data.start_time && data.end_time) {
    return data.end_time > data.start_time;
  }
  return true;
}, {
  message: "End time must be after start time",
  path: ["end_time"],
});

type SprintEventFormValues = z.infer<typeof sprintEventFormSchema>;

interface SprintEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprintId: string;
  sprintStartDate: string;
  sprintEndDate: string;
  projectId: string;
  currentUserId: string;
  event?: {
    id: string;
    title: string;
    description: string | null;
    event_type: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
  } | null;
  isProjectManager: boolean;
  onEventCreated?: () => void;
  onEventUpdated?: () => void;
  onEventDeleted?: () => void;
}

export function SprintEventDialog({
  open,
  onOpenChange,
  sprintId,
  sprintStartDate,
  sprintEndDate,
  projectId,
  currentUserId,
  event,
  isProjectManager,
  onEventCreated,
  onEventUpdated,
  onEventDeleted,
}: SprintEventDialogProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditing = !!event;

  const form = useForm<SprintEventFormValues>({
    resolver: zodResolver(sprintEventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      event_type: "meeting",
      event_date: new Date(),
      start_time: "",
      end_time: "",
    },
  });

  // Reset form when dialog opens or event changes
  useEffect(() => {
    if (open) {
      if (event) {
        form.reset({
          title: event.title,
          description: event.description || "",
          event_type: event.event_type as any,
          event_date: new Date(event.event_date),
          start_time: event.start_time || "",
          end_time: event.end_time || "",
        });
      } else {
        form.reset({
          title: "",
          description: "",
          event_type: "meeting",
          event_date: new Date(),
          start_time: "",
          end_time: "",
        });
      }
    }
  }, [open, event, form]);

  async function onSubmit(values: SprintEventFormValues) {
    setLoading(true);
    try {
      if (isEditing && event) {
        // Update existing event
        await updateSprintEvent(event.id, {
          title: values.title,
          description: values.description || null,
          event_type: values.event_type,
          event_date: values.event_date.toISOString(),
          start_time: values.start_time || null,
          end_time: values.end_time || null,
        });
        toast.success("Event updated successfully");
        onEventUpdated?.();
      } else {
        // Create new event
        await createSprintEvent({
          sprint_id: sprintId,
          title: values.title,
          description: values.description || null,
          event_type: values.event_type,
          event_date: values.event_date.toISOString(),
          start_time: values.start_time || null,
          end_time: values.end_time || null,
          created_by: currentUserId,
        });

        // Notify project members about the new event
        try {
          const eventTypeLabel = eventTypes.find(t => t.value === values.event_type)?.label || "Event";
          await notifyProjectMembers(projectId, {
            title: `New ${eventTypeLabel} Scheduled`,
            message: `${values.title} has been scheduled for ${format(values.event_date, "PPP")}${values.start_time ? ` at ${values.start_time}` : ""}.`,
            type: "event",
            link: `/dashboard/projects/${projectId}?tab=sprints`,
          });
        } catch (notifyError) {
          console.error("Failed to send notifications:", notifyError);
          // Don't fail the whole operation if notifications fail
        }

        toast.success("Event created and team notified");
        onEventCreated?.();
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving event:", error);
      toast.error(isEditing ? "Failed to update event" : "Failed to create event");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!event || !isProjectManager) return;

    setDeleting(true);
    try {
      await deleteSprintEvent(event.id);
      toast.success("Event deleted successfully");
      onEventDeleted?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error deleting event:", error);
      toast.error("Failed to delete event");
    } finally {
      setDeleting(false);
    }
  }

  const canEdit = isProjectManager;
  const canDelete = isProjectManager && isEditing;

  // Sprint date boundaries for event date constraint
  const sprintStart = (() => { const d = new Date(sprintStartDate); d.setHours(0,0,0,0); return d; })();
  const sprintEnd = (() => { const d = new Date(sprintEndDate); d.setHours(23,59,59,999); return d; })();

  const selectedEventType = form.watch("event_type");
  const selectedTypeConfig = eventTypes.find(t => t.value === selectedEventType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedTypeConfig && (
              <selectedTypeConfig.icon className={cn("h-5 w-5", selectedTypeConfig.color)} />
            )}
            {isEditing ? "Edit Event" : "Schedule Event"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the event details below."
              : "Schedule a meeting or milestone for your sprint. Team members will be notified."}
          </DialogDescription>
        </DialogHeader>

        {!canEdit && !isEditing ? (
          <div className="py-6 text-center text-muted-foreground">
            Only project managers can create events.
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="event_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Type *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!canEdit}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select event type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {eventTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className={cn("h-4 w-4", type.color)} />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Sprint Planning Meeting"
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
                        placeholder="Add details about this event..."
                        className="resize-none"
                        rows={2}
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
                name="event_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date *</FormLabel>
                    <Popover>
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
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < sprintStart || date > sprintEnd}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">
                      Must be within sprint: {format(sprintStart, "PPP")} – {format(sprintEnd, "PPP")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
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
                  name="end_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          {...field}
                          disabled={!canEdit}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {!isEditing && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 text-sm text-blue-700 dark:text-blue-400">
                  <strong>Note:</strong> All project team members will be notified when this event is created.
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
                    {isEditing ? "Update Event" : "Create Event"}
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
