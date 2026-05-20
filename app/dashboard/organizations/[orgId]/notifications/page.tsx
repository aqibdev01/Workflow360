"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
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
  Trash2,
  Check,
  X,
  Loader2,
} from "lucide-react";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification as deleteNotificationFn,
  type Notification,
  type NotificationType,
} from "@/lib/notifications/notifications";
import { useBreadcrumbs } from "@/components/breadcrumbs";

const NOTIFICATIONS_BREADCRUMBS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Notifications" },
];

// ── Constants ───────────────────────────────────────────────────────────────

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

const typeLabels: Record<string, string> = {
  task_assigned: "Tasks",
  task_status_changed: "Tasks",
  mentioned: "Mentions",
  mail_received: "Mail",
  file_shared: "Files",
  member_joined: "Members",
  project_invite: "Members",
  comment: "Mentions",
  sprint_deadline: "Tasks",
};

type FilterType = "all" | "unread" | "tasks" | "mentions" | "mail" | "files" | "members";

const filterTypeMap: Record<FilterType, NotificationType[] | null> = {
  all: null,
  unread: null,
  tasks: ["task_assigned", "task_status_changed", "sprint_deadline"],
  mentions: ["mentioned", "comment"],
  mail: ["mail_received"],
  files: ["file_shared"],
  members: ["member_joined", "project_invite"],
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

// ── Page ────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const loaderRef = useRef<HTMLDivElement>(null);

  useBreadcrumbs(NOTIFICATIONS_BREADCRUMBS);

  // ── Data fetching ─────────────────────────────────────────────────────

  const loadNotifications = useCallback(
    async (pageNum: number, append = false) => {
      try {
        setIsLoading(true);
        const allowedTypes = filterTypeMap[filter];
        const result = await getNotifications(orgId, {
          unreadOnly: filter === "unread",
          types: allowedTypes ?? undefined,
          page: pageNum,
          pageSize: 30,
        });

        if (append) {
          setNotifications((prev) => [...prev, ...result.notifications]);
        } else {
          setNotifications(result.notifications);
        }
        // hasMore is accurate because filtering now happens on the server
        setHasMore(result.notifications.length === 30);
      } catch (err) {
        console.error("Failed to load notifications:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [orgId, filter]
  );

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    loadNotifications(1);
  }, [loadNotifications]);

  // Infinite scroll
  useEffect(() => {
    if (!loaderRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadNotifications(nextPage, true);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, page, loadNotifications]);

  // ── Actions ───────────────────────────────────────────────────────────

  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id
            ? { ...item, is_read: true, read_at: new Date().toISOString() }
            : item
        )
      );
    }
    if (n.link) router.push(n.link);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(orgId);
    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        is_read: true,
        read_at: n.read_at || new Date().toISOString(),
      }))
    );
  };

  const handleDelete = async (id: string) => {
    await deleteNotificationFn(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkMarkRead = async () => {
    for (const id of selected) {
      await markNotificationRead(id).catch(() => {});
    }
    setNotifications((prev) =>
      prev.map((n) =>
        selected.has(n.id)
          ? { ...n, is_read: true, read_at: new Date().toISOString() }
          : n
      )
    );
    setSelected(new Set());
  };

  const handleBulkDelete = async () => {
    for (const id of selected) {
      await deleteNotificationFn(id).catch(() => {});
    }
    setNotifications((prev) => prev.filter((n) => !selected.has(n.id)));
    setSelected(new Set());
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stay up to date with your projects and team
          </p>
        </div>
        <button
          onClick={handleMarkAllRead}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <CheckCheck className="h-4 w-4" />
          Mark all read
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "all", label: "All" },
            { key: "unread", label: "Unread" },
            { key: "tasks", label: "Tasks" },
            { key: "mentions", label: "Mentions" },
            { key: "mail", label: "Mail" },
            { key: "files", label: "Files" },
            { key: "members", label: "Members" },
          ] as { key: FilterType; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === key
                ? "bg-indigo-600 text-white"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2">
          <span className="text-sm text-muted-foreground">
            {selected.size} selected
          </span>
          <button
            onClick={handleBulkMarkRead}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
            Mark read
          </button>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Notification list */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden divide-y">
        {notifications.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="h-12 w-12 text-muted-foreground/20 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              You&apos;re all caught up!
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              No {filter !== "all" ? `${filter} ` : ""}notifications to show
            </p>
          </div>
        ) : (
          notifications.map((n) => {
            const Icon = typeIcons[n.type] || Zap;
            const colorClasses = typeColors[n.type] || "text-gray-500 bg-gray-50";
            const isSelected = selected.has(n.id);

            return (
              <div
                key={n.id}
                className={`group flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-muted/30 ${
                  !n.is_read ? "bg-blue-50/30" : ""
                } ${isSelected ? "bg-indigo-600/5" : ""}`}
                onClick={() => handleClick(n)}
              >
                {/* Checkbox */}
                <div
                  className="mt-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(n.id);
                  }}
                >
                  <div
                    className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? "bg-indigo-600 border-indigo-500"
                        : "border-muted-foreground/30 hover:border-muted-foreground/60"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>

                {/* Icon */}
                <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${colorClasses}`}>
                  <Icon className="h-5 w-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-sm ${!n.is_read ? "font-semibold text-foreground" : "text-foreground"}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                          {n.body}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!n.is_read && (
                        <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                      )}
                      <span className="text-xs text-muted-foreground/70 whitespace-nowrap">
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground/60 font-medium uppercase tracking-wider">
                      {typeLabels[n.type] || n.type}
                    </span>
                  </div>
                </div>

                {/* Delete on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(n.id);
                  }}
                  className="mt-1 hidden group-hover:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}

        {/* Infinite scroll loader */}
        {hasMore && (
          <div ref={loaderRef} className="flex items-center justify-center py-6">
            {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </div>
        )}

        {isLoading && page === 1 && notifications.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
