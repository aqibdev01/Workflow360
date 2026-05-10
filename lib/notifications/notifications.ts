import { supabase } from "../supabase";

// =====================================================
// Types
// =====================================================

export type NotificationType =
  | "task_assigned"
  | "task_status_changed"
  | "mentioned"
  | "sprint_deadline"
  | "mail_received"
  | "member_joined"
  | "project_invite"
  | "comment"
  | "file_shared";

export interface Notification {
  id: string;
  organization_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  metadata: Record<string, any> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// =====================================================
// Get Notifications
// =====================================================

/**
 * Get notifications for current user in an org, paginated, newest first.
 */
export async function getNotifications(
  orgId: string,
  options: { unreadOnly?: boolean; page?: number; pageSize?: number } = {}
): Promise<{ notifications: Notification[]; total: number }> {
  const { unreadOnly = false, page = 1, pageSize = 30 } = options;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = (supabase as any)
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (unreadOnly) {
    query = query.eq("is_read", false);
  }

  const { data, error, count } = await query;

  if (error) throw error;
  return { notifications: (data || []) as Notification[], total: count || 0 };
}

// =====================================================
// Unread Count
// =====================================================

/**
 * Get count of unread notifications for current user in an org.
 */
export async function getUnreadCount(orgId: string): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await (supabase as any)
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .eq("is_read", false);

  if (error) return 0;
  return count || 0;
}

// =====================================================
// Mark Read
// =====================================================

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await (supabase as any)
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  if (error) throw error;
}

/**
 * Mark all notifications as read for the current user in an org.
 */
export async function markAllNotificationsRead(orgId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await (supabase as any)
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .eq("is_read", false);

  if (error) throw error;
}

// =====================================================
// Create Notification
// =====================================================

/**
 * Create a notification for a specific user.
 * Used by trigger helpers and composeMail.
 */
export async function createNotification(data: {
  orgId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, any>;
}): Promise<Notification> {
  const { error } = await (supabase as any)
    .from("notifications")
    .insert({
      organization_id: data.orgId,
      user_id: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      link: data.link || null,
      metadata: data.metadata || null,
    });

  if (error) throw error;
  return { user_id: data.userId, type: data.type, title: data.title } as any;
}

// =====================================================
// Delete Notification
// =====================================================

/**
 * Delete a notification.
 */
export async function deleteNotification(
  notificationId: string
): Promise<void> {
  const { error } = await (supabase as any)
    .from("notifications")
    .delete()
    .eq("id", notificationId);

  if (error) throw error;
}
