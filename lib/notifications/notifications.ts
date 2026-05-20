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
 * Get notifications for the current user.
 * When orgId is provided, results are scoped to that org.
 * When orgId is null/undefined, all notifications across every org are returned
 * (used by the global bell on pages with no org context, e.g. /dashboard).
 */
export async function getNotifications(
  orgId: string | null,
  options: {
    unreadOnly?: boolean;
    types?: NotificationType[];
    page?: number;
    pageSize?: number;
  } = {}
): Promise<{ notifications: Notification[]; total: number }> {
  const { unreadOnly = false, types, page = 1, pageSize = 30 } = options;

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
    .order("created_at", { ascending: false })
    .range(from, to);

  if (orgId) {
    query = query.eq("organization_id", orgId);
  }

  if (unreadOnly) {
    query = query.eq("is_read", false);
  }

  if (types && types.length > 0) {
    query = query.in("type", types);
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
 * Mark all notifications as read for the current user.
 * When orgId is provided, only that org's notifications are marked.
 * When null, all notifications across every org are marked.
 */
export async function markAllNotificationsRead(orgId: string | null): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let query = (supabase as any)
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (orgId) {
    query = query.eq("organization_id", orgId);
  }

  const { error } = await query;
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
  const { data: rows, error } = await (supabase as any)
    .from("notifications")
    .insert({
      organization_id: data.orgId,
      user_id: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      link: data.link || null,
      metadata: data.metadata || null,
    })
    .select()
    .single();

  if (error) throw error;
  return rows as Notification;
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await (supabase as any)
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", user.id);

  if (error) throw error;
}
