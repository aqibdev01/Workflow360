"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification as deleteNotificationFn,
  type Notification,
} from "@/lib/notifications/notifications";
import { toast } from "sonner";

export function useNotifications(orgId: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const channelRef = useRef<any>(null);

  // Derived — always in sync with the notifications array
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  // ── Fetch initial data ──────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      // orgId null → fetch across all orgs (global bell on /dashboard)
      const result = await getNotifications(orgId, { page: 1 });
      setNotifications(result.notifications);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  // ── Realtime subscription ───────────────────────────────────────────────

  useEffect(() => {
    refresh();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      const channel = (supabase as any)
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const newNotification = payload.new as Notification;

            // When scoped to an org, ignore notifications from other orgs
            if (orgId && newNotification.organization_id !== orgId) return;

            setNotifications((prev) => [newNotification, ...prev]);

            toast(newNotification.title, {
              description: newNotification.body || undefined,
              action: newNotification.link
                ? {
                    label: "View",
                    onClick: () => {
                      window.location.href = newNotification.link!;
                    },
                  }
                : undefined,
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const updated = payload.new as Notification;
            if (orgId && updated.organization_id !== orgId) return;

            setNotifications((prev) =>
              prev.map((n) => (n.id === updated.id ? updated : n))
            );
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const deleted = payload.old as { id: string };
            setNotifications((prev) =>
              prev.filter((n) => n.id !== deleted.id)
            );
          }
        )
        .subscribe();

      channelRef.current = channel;
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [orgId, refresh]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const markRead = useCallback(
    async (notificationId: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n
        )
      );
      try {
        await markNotificationRead(notificationId);
      } catch (err) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, is_read: false, read_at: null } : n
          )
        );
        console.error("Error marking notification read:", err);
      }
    },
    []
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at || now }))
    );
    try {
      // orgId null → marks all orgs' notifications as read
      await markAllNotificationsRead(orgId);
    } catch (err) {
      refresh();
      console.error("Error marking all notifications read:", err);
    }
  }, [orgId, refresh]);

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      try {
        await deleteNotificationFn(notificationId);
      } catch (err) {
        refresh();
        console.error("Error deleting notification:", err);
      }
    },
    [refresh]
  );

  return {
    notifications,
    unreadCount,
    isLoading,
    markRead,
    markAllRead,
    deleteNotification,
    refresh,
  };
}
