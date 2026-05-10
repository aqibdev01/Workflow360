"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  ClipboardList,
  MessageSquare,
  Mail,
  FolderOpen,
  UserPlus,
  AlertCircle,
  Zap,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@/lib/notifications/notifications";

// ── Helpers ─────────────────────────────────────────────────────────────────

const typeIcons: Record<string, React.ElementType> = {
  task_assigned: ClipboardList,
  task_status_changed: ClipboardList,
  mentioned: MessageSquare,
  mail_received: Mail,
  file_shared: FolderOpen,
  member_joined: UserPlus,
  project_invite: UserPlus,
  comment: MessageSquare,
  sprint_deadline: AlertCircle,
};

const typeColors: Record<string, string> = {
  task_assigned: "text-blue-500 bg-blue-50",
  task_status_changed: "text-indigo-500 bg-indigo-50",
  mentioned: "text-amber-500 bg-amber-50",
  mail_received: "text-green-500 bg-green-50",
  file_shared: "text-purple-500 bg-purple-50",
  member_joined: "text-teal-500 bg-teal-50",
  project_invite: "text-teal-500 bg-teal-50",
  comment: "text-amber-500 bg-amber-50",
  sprint_deadline: "text-red-500 bg-red-50",
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Notification Item ───────────────────────────────────────────────────────

function NotificationItem({
  notification,
  onSelect,
  onDelete,
}: {
  notification: Notification;
  onSelect: (n: Notification) => void;
  onDelete: (id: string) => void;
}) {
  const Icon = typeIcons[notification.type] || Zap;
  const colorClasses = typeColors[notification.type] || "text-gray-500 bg-gray-50";

  return (
    <div
      className={`group relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 ${
        !notification.is_read ? "bg-blue-50/40" : ""
      }`}
      onClick={() => onSelect(notification)}
    >
      {/* Type icon */}
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colorClasses}`}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug ${!notification.is_read ? "font-semibold text-foreground" : "text-foreground"}`}>
            {notification.title}
          </p>
          {!notification.is_read && (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          )}
        </div>
        {notification.body && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {notification.body}
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {relativeTime(notification.created_at)}
        </p>
      </div>

      {/* Delete button on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(notification.id);
        }}
        className="absolute right-2 top-2 hidden group-hover:flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── NotificationBell ────────────────────────────────────────────────────────

interface NotificationBellProps {
  orgId: string | null;
}

export function NotificationBell({ orgId }: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");

  const {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    deleteNotification,
  } = useNotifications(orgId);

  const filteredNotifications = useMemo(() => {
    if (tab === "unread") return notifications.filter((n) => !n.is_read);
    return notifications;
  }, [notifications, tab]);

  const handleSelect = (n: Notification) => {
    if (!n.is_read) {
      markRead(n.id);
    }
    setOpen(false);
    if (n.link) {
      router.push(n.link);
    }
  };

  const badgeLabel = unreadCount > 99 ? "99+" : unreadCount.toString();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
              {badgeLabel}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-indigo-600 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setTab("all")}
            className={`flex-1 py-2 text-xs font-medium text-center transition-colors ${
              tab === "all"
                ? "text-indigo-600 border-b-2 border-indigo-500"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setTab("unread")}
            className={`flex-1 py-2 text-xs font-medium text-center transition-colors ${
              tab === "unread"
                ? "text-indigo-600 border-b-2 border-indigo-500"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Unread{unreadCount > 0 && ` (${unreadCount})`}
          </button>
        </div>

        {/* List */}
        <div className="max-h-[400px] overflow-y-auto">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                You&apos;re all caught up!
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                No {tab === "unread" ? "unread " : ""}notifications
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredNotifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onSelect={handleSelect}
                  onDelete={deleteNotification}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {orgId && (
          <div className="border-t">
            <button
              onClick={() => {
                setOpen(false);
                router.push(`/dashboard/organizations/${orgId}/notifications`);
              }}
              className="w-full py-2.5 text-xs font-medium text-indigo-600 hover:bg-muted/50 transition-colors"
            >
              View all notifications
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
