import { supabase } from "../supabase";

// =====================================================
// Types
// =====================================================

export interface MailMessage {
  id: string;
  organization_id: string;
  subject: string;
  body: string;
  sender_id: string;
  type: "direct" | "announcement" | "newsletter";
  is_draft: boolean;
  is_sender_trashed: boolean;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  sender?: { id: string; full_name: string; email: string; avatar_url: string | null };
  recipients?: MailRecipient[];
  attachments?: MailAttachment[];
}

export interface MailRecipient {
  id: string;
  mail_id: string;
  recipient_id: string;
  recipient_type: "to" | "cc";
  is_read: boolean;
  read_at: string | null;
  is_starred: boolean;
  is_archived: boolean;
  folder: "inbox" | "archived" | "trash";
  received_at: string;
  // Joined
  user?: { id: string; full_name: string; email: string; avatar_url: string | null };
  mail?: MailMessage;
}

export interface MailAttachment {
  id: string;
  mail_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}

export type MailFolder = "inbox" | "archived" | "trash";

interface ComposeMailData {
  subject: string;
  body: string;
  to: string[];
  cc?: string[];
  type?: "direct" | "announcement" | "newsletter";
  attachments?: File[];
}

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB

// =====================================================
// Inbox / Folders
// =====================================================

/**
 * Get received mails for current user in a given folder.
 */
export async function getInboxMails(
  orgId: string,
  options: { folder?: MailFolder; page?: number; pageSize?: number } = {}
): Promise<{ mails: MailRecipient[]; total: number }> {
  const { folder = "inbox", page = 1, pageSize = 25 } = options;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await (supabase as any)
    .from("mail_recipients")
    .select(
      `*, mail:mail_messages!mail_id(
        id, organization_id, subject, body, sender_id, type, is_draft, sent_at, created_at, updated_at,
        sender:users!sender_id(id, full_name, email, avatar_url)
      )`
    )
    .eq("recipient_id", user.id)
    .eq("folder", folder)
    .order("received_at", { ascending: false });

  if (error) throw error;

  // Filter client-side by org and exclude drafts (avoids unreliable PostgREST embedded-resource filters)
  const filtered = (data || []).filter(
    (r: any) =>
      r.mail !== null &&
      r.mail.is_draft === false &&
      r.mail.organization_id === orgId
  );

  const paginated = filtered.slice(from, from + pageSize);

  return { mails: paginated as MailRecipient[], total: filtered.length };
}

// =====================================================
// Starred Mails
// =====================================================

/**
 * Get starred mails for current user in an org.
 */
export async function getStarredMails(
  orgId: string,
  page = 1,
  pageSize = 25
): Promise<{ mails: MailRecipient[]; total: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await (supabase as any)
    .from("mail_recipients")
    .select(
      `*, mail:mail_messages!mail_id(
        id, organization_id, subject, body, sender_id, type, is_draft, sent_at, created_at, updated_at,
        sender:users!sender_id(id, full_name, email, avatar_url)
      )`
    )
    .eq("recipient_id", user.id)
    .eq("is_starred", true)
    .neq("folder", "trash")
    .order("received_at", { ascending: false });

  if (error) throw error;

  const filtered = (data || []).filter(
    (r: any) =>
      r.mail !== null &&
      r.mail.is_draft === false &&
      r.mail.organization_id === orgId
  );

  const paginated = filtered.slice(from, from + pageSize);
  return { mails: paginated as MailRecipient[], total: filtered.length };
}

// =====================================================
// Sent Mails
// =====================================================

/**
 * Get sent mails by current user.
 */
export async function getSentMails(
  orgId: string,
  page = 1,
  pageSize = 25
): Promise<{ mails: MailMessage[]; total: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await (supabase as any)
    .from("mail_messages")
    .select(
      `*, sender:users!sender_id(id, full_name, email, avatar_url),
       recipients:mail_recipients(id, recipient_id, recipient_type, is_read,
         user:users!recipient_id(id, full_name, email, avatar_url))`,
      { count: "exact" }
    )
    .eq("sender_id", user.id)
    .eq("organization_id", orgId)
    .eq("is_draft", false)
    .eq("is_sender_trashed", false)
    .order("sent_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { mails: (data || []) as MailMessage[], total: count || 0 };
}

// =====================================================
// Drafts
// =====================================================

/**
 * Get drafts for current user.
 */
export async function getDrafts(orgId: string): Promise<MailMessage[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await (supabase as any)
    .from("mail_messages")
    .select("*")
    .eq("sender_id", user.id)
    .eq("organization_id", orgId)
    .eq("is_draft", true)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data || []) as MailMessage[];
}

// =====================================================
// Get Single Mail (full details)
// =====================================================

/**
 * Get a full mail with sender, recipients, and attachments.
 */
export async function getMail(mailId: string): Promise<MailMessage> {
  const { data, error } = await (supabase as any)
    .from("mail_messages")
    .select(
      `*, sender:users!sender_id(id, full_name, email, avatar_url),
       recipients:mail_recipients(id, recipient_id, recipient_type, is_read, read_at,
         user:users!recipient_id(id, full_name, email, avatar_url)),
       attachments:mail_attachments(id, file_name, storage_path, mime_type, size_bytes, created_at)`
    )
    .eq("id", mailId)
    .single();

  if (error) throw error;
  return data as MailMessage;
}

// =====================================================
// Compose & Send
// =====================================================

/**
 * Upload attachments to Supabase Storage.
 */
async function uploadMailAttachments(
  mailId: string,
  files: File[],
  userId: string
): Promise<void> {
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      throw new Error(`"${file.name}" exceeds the 25 MB limit.`);
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileId = crypto.randomUUID();
    const storagePath = `${mailId}/${fileId}-${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from("mail-attachments")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { error: dbErr } = await (supabase as any)
      .from("mail_attachments")
      .insert({
        mail_id: mailId,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        uploaded_by: userId,
      });

    if (dbErr) throw dbErr;
  }
}

/**
 * Compose and send a mail immediately.
 */
export async function composeMail(
  orgId: string,
  data: ComposeMailData
): Promise<MailMessage> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (!data.subject.trim()) throw new Error("Subject is required");
  if (data.to.length === 0) throw new Error("At least one recipient is required");

  // 1. Insert mail_messages
  const { data: mail, error: mailErr } = await (supabase as any)
    .from("mail_messages")
    .insert({
      organization_id: orgId,
      subject: data.subject.trim(),
      body: data.body,
      sender_id: user.id,
      type: data.type || "direct",
      is_draft: false,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (mailErr) throw mailErr;

  // 2. Insert recipients
  const recipients = [
    ...data.to.map((uid) => ({
      mail_id: mail.id,
      recipient_id: uid,
      recipient_type: "to",
    })),
    ...(data.cc || []).map((uid) => ({
      mail_id: mail.id,
      recipient_id: uid,
      recipient_type: "cc",
    })),
  ];

  if (recipients.length > 0) {
    const { error: recipErr } = await (supabase as any)
      .from("mail_recipients")
      .insert(recipients);

    if (recipErr) throw recipErr;
  }

  // 3. Upload attachments
  if (data.attachments && data.attachments.length > 0) {
    await uploadMailAttachments(mail.id, data.attachments, user.id);
  }

  // 4. Create notifications for each recipient
  const { createNotification } = await import("../notifications/notifications");
  const allRecipientIds = [...data.to, ...(data.cc || [])];
  const uniqueRecipients = [...new Set(allRecipientIds)];

  // Get sender name for notification
  const { data: senderProfile } = await (supabase as any)
    .from("users")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  const senderName = senderProfile?.full_name || senderProfile?.email?.split("@")[0] || user.email?.split("@")[0] || "Someone";

  for (const recipientId of uniqueRecipients) {
    await createNotification({
      orgId,
      userId: recipientId,
      type: "mail_received",
      title: `New mail from ${senderName}`,
      body: data.subject,
      link: `/dashboard/organizations/${orgId}/mail/${mail.id}`,
      metadata: { mailId: mail.id, senderId: user.id, senderName },
    }).catch(() => {}); // Don't fail the send if notification fails
  }

  return mail as MailMessage;
}

// =====================================================
// Drafts Management
// =====================================================

/**
 * Save a new draft.
 */
export async function saveDraft(
  orgId: string,
  data: Partial<ComposeMailData>
): Promise<MailMessage> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: draft, error } = await (supabase as any)
    .from("mail_messages")
    .insert({
      organization_id: orgId,
      subject: data.subject?.trim() || "(No subject)",
      body: data.body || "",
      sender_id: user.id,
      type: data.type || "direct",
      is_draft: true,
      sent_at: null,
    })
    .select()
    .single();

  if (error) throw error;

  // Upload attachments if any
  if (data.attachments && data.attachments.length > 0) {
    await uploadMailAttachments(draft.id, data.attachments, user.id);
  }

  return draft as MailMessage;
}

/**
 * Update an existing draft.
 */
export async function updateDraft(
  draftId: string,
  data: Partial<ComposeMailData>
): Promise<MailMessage> {
  const { data: updated, error } = await (supabase as any)
    .from("mail_messages")
    .update({
      subject: data.subject?.trim() || "(No subject)",
      body: data.body || "",
      type: data.type || "direct",
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("is_draft", true)
    .select()
    .single();

  if (error) throw error;
  return updated as MailMessage;
}

/**
 * Send an existing draft: set is_draft=false, sent_at, insert recipients + notifications.
 */
export async function sendDraft(
  draftId: string,
  recipientData: { to: string[]; cc?: string[]; attachments?: File[] }
): Promise<MailMessage> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (recipientData.to.length === 0) {
    throw new Error("At least one recipient is required");
  }

  // Update mail to sent
  const { data: mail, error: updateErr } = await (supabase as any)
    .from("mail_messages")
    .update({
      is_draft: false,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("sender_id", user.id)
    .eq("is_draft", true)
    .select()
    .single();

  if (updateErr) throw updateErr;

  // Insert recipients
  const recipients = [
    ...recipientData.to.map((uid) => ({
      mail_id: draftId,
      recipient_id: uid,
      recipient_type: "to",
    })),
    ...(recipientData.cc || []).map((uid) => ({
      mail_id: draftId,
      recipient_id: uid,
      recipient_type: "cc",
    })),
  ];

  const { error: recipErr } = await (supabase as any)
    .from("mail_recipients")
    .insert(recipients);

  if (recipErr) throw recipErr;

  // Upload attachments if provided
  if (recipientData.attachments && recipientData.attachments.length > 0) {
    await uploadMailAttachments(draftId, recipientData.attachments, user.id);
  }

  // Notifications
  const { createNotification } = await import("../notifications/notifications");
  const { data: senderProfile } = await (supabase as any)
    .from("users")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  const senderName = senderProfile?.full_name || senderProfile?.email?.split("@")[0] || "Someone";
  const allRecipientIds = [...new Set([...recipientData.to, ...(recipientData.cc || [])])];

  for (const recipientId of allRecipientIds) {
    await createNotification({
      orgId: mail.organization_id,
      userId: recipientId,
      type: "mail_received",
      title: `New mail from ${senderName}`,
      body: mail.subject,
      link: `/dashboard/organizations/${mail.organization_id}/mail/${mail.id}`,
      metadata: { mailId: mail.id, senderId: user.id, senderName },
    }).catch(() => {});
  }

  return mail as MailMessage;
}

// =====================================================
// Mail Actions (Read, Star, Archive, Trash, Delete)
// =====================================================

/**
 * Mark a mail as read for the current user.
 */
export async function markAsRead(mailId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await (supabase as any)
    .from("mail_recipients")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("mail_id", mailId)
    .eq("recipient_id", user.id);

  if (error) throw error;
}

/**
 * Mark all mails as read for the current user in an org.
 */
export async function markAllAsRead(orgId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get all unread mail_ids in this org
  const { data: unread, error: fetchErr } = await (supabase as any)
    .from("mail_recipients")
    .select("id, mail:mail_messages!mail_id(organization_id)")
    .eq("recipient_id", user.id)
    .eq("is_read", false)
    .eq("folder", "inbox");

  if (fetchErr) throw fetchErr;

  const idsToUpdate = (unread || [])
    .filter((r: any) => r.mail?.organization_id === orgId)
    .map((r: any) => r.id);

  if (idsToUpdate.length === 0) return;

  const { error } = await (supabase as any)
    .from("mail_recipients")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .in("id", idsToUpdate);

  if (error) throw error;
}

/**
 * Star a mail.
 */
export async function starMail(mailId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await (supabase as any)
    .from("mail_recipients")
    .update({ is_starred: true })
    .eq("mail_id", mailId)
    .eq("recipient_id", user.id);

  if (error) throw error;
}

/**
 * Unstar a mail.
 */
export async function unstarMail(mailId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await (supabase as any)
    .from("mail_recipients")
    .update({ is_starred: false })
    .eq("mail_id", mailId)
    .eq("recipient_id", user.id);

  if (error) throw error;
}

/**
 * Archive a mail (move to 'archived' folder).
 */
export async function archiveMail(mailId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Find the recipient row first
  const { data: row, error: findErr } = await (supabase as any)
    .from("mail_recipients")
    .select("id")
    .eq("mail_id", mailId)
    .eq("recipient_id", user.id)
    .maybeSingle();

  if (findErr) throw findErr;
  if (!row) throw new Error("Mail not found in your mailbox");

  const { error } = await (supabase as any)
    .from("mail_recipients")
    .update({ folder: "archived", is_archived: true })
    .eq("id", row.id);

  if (error) throw error;
}

/**
 * Trash a mail (move to 'trash' folder).
 */
export async function trashMail(mailId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Find the recipient row first
  const { data: row, error: findErr } = await (supabase as any)
    .from("mail_recipients")
    .select("id")
    .eq("mail_id", mailId)
    .eq("recipient_id", user.id)
    .maybeSingle();

  if (findErr) throw findErr;
  if (!row) throw new Error("Mail not found in your mailbox");

  const { error } = await (supabase as any)
    .from("mail_recipients")
    .update({ folder: "trash" })
    .eq("id", row.id);

  if (error) throw error;
}

/**
 * Permanently delete a mail from trash. Removes the recipient row
 * and any associated storage attachments if no other recipients remain.
 */
export async function deletePermanently(mailId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Delete the recipient row
  const { error: delErr } = await (supabase as any)
    .from("mail_recipients")
    .delete()
    .eq("mail_id", mailId)
    .eq("recipient_id", user.id)
    .eq("folder", "trash");

  if (delErr) throw delErr;

  // Check if any recipients remain
  const { data: remaining } = await (supabase as any)
    .from("mail_recipients")
    .select("id")
    .eq("mail_id", mailId)
    .limit(1);

  // If no recipients remain and the sender is the current user, clean up
  if (!remaining || remaining.length === 0) {
    // Get attachments for storage cleanup
    const { data: attachments } = await (supabase as any)
      .from("mail_attachments")
      .select("storage_path")
      .eq("mail_id", mailId);

    if (attachments && attachments.length > 0) {
      const paths = attachments.map((a: any) => a.storage_path);
      await supabase.storage.from("mail-attachments").remove(paths);
    }

    // Delete the mail message (cascades to attachments and remaining recipients)
    await (supabase as any)
      .from("mail_messages")
      .delete()
      .eq("id", mailId)
      .eq("sender_id", user.id);
  }
}

/**
 * Soft-trash a sent mail (move to sender's trash view).
 */
export async function trashSentMail(mailId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await (supabase as any)
    .from("mail_messages")
    .update({ is_sender_trashed: true })
    .eq("id", mailId)
    .eq("sender_id", user.id);

  if (error) throw error;
}

/**
 * Get sent mails that the sender has moved to trash.
 */
export async function getTrashedSentMails(orgId: string): Promise<MailMessage[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await (supabase as any)
    .from("mail_messages")
    .select(
      `*, sender:users!sender_id(id, full_name, email, avatar_url),
       recipients:mail_recipients(id, recipient_id, recipient_type, is_read,
         user:users!recipient_id(id, full_name, email, avatar_url))`
    )
    .eq("sender_id", user.id)
    .eq("organization_id", orgId)
    .eq("is_draft", false)
    .eq("is_sender_trashed", true)
    .order("sent_at", { ascending: false });

  if (error) throw error;
  return (data || []) as MailMessage[];
}

/**
 * Unarchive a mail — move it back to inbox.
 */
export async function unarchiveMail(mailId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: row, error: findErr } = await (supabase as any)
    .from("mail_recipients")
    .select("id")
    .eq("mail_id", mailId)
    .eq("recipient_id", user.id)
    .maybeSingle();

  if (findErr) throw findErr;
  if (!row) throw new Error("Mail not found in your mailbox");

  const { error } = await (supabase as any)
    .from("mail_recipients")
    .update({ folder: "inbox", is_archived: false })
    .eq("id", row.id);

  if (error) throw error;
}

/**
 * Delete a sent mail. Only the sender can delete their own sent mail.
 * This permanently removes the mail message and cascades to recipients/attachments.
 */
export async function deleteSentMail(mailId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Clean up storage attachments first
  const { data: attachments } = await (supabase as any)
    .from("mail_attachments")
    .select("storage_path")
    .eq("mail_id", mailId);

  if (attachments && attachments.length > 0) {
    const paths = attachments.map((a: any) => a.storage_path);
    await supabase.storage.from("mail-attachments").remove(paths);
  }

  // Delete the mail message (cascades to recipients and attachments)
  const { error } = await (supabase as any)
    .from("mail_messages")
    .delete()
    .eq("id", mailId)
    .eq("sender_id", user.id);

  if (error) throw error;
}

// =====================================================
// Unread Count
// =====================================================

/**
 * Get count of unread inbox mails for current user in an org.
 */
export async function getUnreadMailCount(orgId: string): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  // Fetch unread inbox recipient rows with their mail's org, filter by org client-side
  // (Supabase PostgREST cannot filter by joined-table columns in a count query)
  const { data: rows, error } = await (supabase as any)
    .from("mail_recipients")
    .select("id, mail:mail_messages!mail_id(organization_id, is_draft)")
    .eq("recipient_id", user.id)
    .eq("is_read", false)
    .eq("folder", "inbox");

  if (error) {
    console.error("Error fetching unread mail count:", error);
    return 0;
  }

  return (rows || []).filter(
    (r: any) => r.mail?.organization_id === orgId && r.mail?.is_draft === false
  ).length;
}

// =====================================================
// Attachment Download
// =====================================================

/**
 * Get a signed download URL for a mail attachment.
 */
export async function getAttachmentUrl(
  storagePath: string,
  fileName: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("mail-attachments")
    .createSignedUrl(storagePath, 3600, { download: fileName });

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Failed to generate download URL");

  return data.signedUrl;
}
