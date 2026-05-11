"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Inbox,
  Star,
  Send,
  FileEdit,
  Archive,
  Trash2,
  Megaphone,
  Loader2,
  CheckCheck,
  Mail,
  MoreHorizontal,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getInboxMails,
  getSentMails,
  getDrafts,
  getStarredMails,
  getTrashedSentMails,
  markAsRead,
  markAllAsRead,
  starMail,
  unstarMail,
  archiveMail,
  unarchiveMail,
  trashMail,
  trashSentMail,
  deletePermanently,
  deleteSentMail,
  type MailRecipient,
  type MailMessage,
  type MailFolder,
} from "@/lib/mail/mail";

// ── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  if (typeof document !== "undefined") {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  }
  return html.replace(/<[^>]*>/g, "");
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const folderConfig: Record<string, { label: string; icon: React.ElementType }> = {
  inbox: { label: "Inbox", icon: Inbox },
  starred: { label: "Starred", icon: Star },
  sent: { label: "Sent", icon: Send },
  drafts: { label: "Drafts", icon: FileEdit },
  archived: { label: "Archived", icon: Archive },
  trash: { label: "Trash", icon: Trash2 },
  announcements: { label: "Announcements", icon: Megaphone },
};

// ── Unified mail row type ───────────────────────────────────────────────────

interface MailRow {
  id: string;          // mail_id
  recipientRowId?: string; // mail_recipients.id (for inbox/starred/archived/trash)
  subject: string;
  bodyPreview: string;
  senderName: string;
  senderAvatar: string | null;
  recipientNames?: string;
  timestamp: string;
  isRead: boolean;
  isStarred: boolean;
  isDraft: boolean;
  isSentMail?: boolean; // true for sent mails shown in trash
}

function recipientRowToMailRow(r: MailRecipient): MailRow {
  const mail = r.mail;
  return {
    id: mail?.id || r.mail_id,
    recipientRowId: r.id,
    subject: mail?.subject || "(No subject)",
    bodyPreview: stripHtml(mail?.body || "").slice(0, 80),
    senderName: mail?.sender?.full_name || mail?.sender?.email?.split("@")[0] || "Unknown",
    senderAvatar: mail?.sender?.avatar_url || null,
    timestamp: r.received_at || mail?.sent_at || mail?.created_at || "",
    isRead: r.is_read,
    isStarred: r.is_starred,
    isDraft: false,
  };
}

function sentMailToMailRow(m: MailMessage): MailRow {
  const recipientNames = (m.recipients || [])
    .filter((r: any) => r.recipient_type === "to")
    .map((r: any) => r.user?.full_name || r.user?.email?.split("@")[0] || "Unknown")
    .join(", ");
  return {
    id: m.id,
    subject: m.subject || "(No subject)",
    bodyPreview: stripHtml(m.body).slice(0, 80),
    senderName: "To: " + (recipientNames || "Unknown"),
    senderAvatar: null,
    recipientNames,
    timestamp: m.sent_at || m.created_at,
    isRead: true,
    isStarred: false,
    isDraft: false,
  };
}

function draftToMailRow(m: MailMessage): MailRow {
  return {
    id: m.id,
    subject: m.subject || "(No subject)",
    bodyPreview: stripHtml(m.body).slice(0, 80),
    senderName: "Draft",
    senderAvatar: null,
    timestamp: m.updated_at || m.created_at,
    isRead: true,
    isStarred: false,
    isDraft: true,
  };
}

// ── Page Component ──────────────────────────────────────────────────────────

export default function MailFolderPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  const folder = params.folder as string;

  const [rows, setRows] = useState<MailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const config = folderConfig[folder] || folderConfig.inbox;
  const FolderIcon = config.icon;

  // ── Load mails ──────────────────────────────────────────────────────

  const loadMails = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      let mailRows: MailRow[] = [];

      switch (folder) {
        case "inbox": {
          const res = await getInboxMails(orgId, { folder: "inbox" });
          mailRows = res.mails.map(recipientRowToMailRow);
          break;
        }
        case "starred": {
          const res = await getStarredMails(orgId);
          mailRows = res.mails.map(recipientRowToMailRow);
          break;
        }
        case "sent": {
          const res = await getSentMails(orgId);
          mailRows = res.mails.map(sentMailToMailRow);
          break;
        }
        case "drafts": {
          const drafts = await getDrafts(orgId);
          mailRows = drafts.map(draftToMailRow);
          break;
        }
        case "archived": {
          const res = await getInboxMails(orgId, { folder: "archived" });
          mailRows = res.mails.map(recipientRowToMailRow);
          break;
        }
        case "trash": {
          const [recipientRes, sentTrashed] = await Promise.all([
            getInboxMails(orgId, { folder: "trash" }),
            getTrashedSentMails(orgId),
          ]);
          const recipientRows = recipientRes.mails.map(recipientRowToMailRow);
          const sentRows = sentTrashed.map((m) => ({ ...sentMailToMailRow(m), isSentMail: true }));
          mailRows = [...recipientRows, ...sentRows].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          break;
        }
        case "announcements": {
          const res = await getInboxMails(orgId, { folder: "inbox" });
          mailRows = res.mails
            .filter((r) => r.mail?.type === "announcement")
            .map(recipientRowToMailRow);
          break;
        }
        default: {
          const res = await getInboxMails(orgId, { folder: "inbox" });
          mailRows = res.mails.map(recipientRowToMailRow);
        }
      }

      setRows(mailRows);
    } catch (err) {
      console.error("Error loading mail:", err);
      toast.error("Failed to load mail");
    } finally {
      setLoading(false);
    }
  }, [orgId, folder]);

  useEffect(() => {
    loadMails();
  }, [loadMails]);

  // ── Row click ─────────────────────────────────────────────────────────

  const handleRowClick = (row: MailRow) => {
    if (row.isDraft) {
      router.push(`/dashboard/organizations/${orgId}/mail/compose?draft=${row.id}`);
    } else {
      router.push(`/dashboard/organizations/${orgId}/mail/${folder}/${row.id}`);
    }
  };

  // ── Actions ───────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  };

  const handleToggleStar = async (e: React.MouseEvent, row: MailRow) => {
    e.stopPropagation();
    try {
      if (row.isStarred) {
        await unstarMail(row.id);
      } else {
        await starMail(row.id);
      }
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, isStarred: !r.isStarred } : r))
      );
    } catch {
      toast.error("Failed to update star");
    }
  };

  const handleBulkMarkRead = async () => {
    for (const id of selected) {
      await markAsRead(id).catch(() => {});
    }
    setRows((prev) =>
      prev.map((r) => (selected.has(r.id) ? { ...r, isRead: true } : r))
    );
    setSelected(new Set());
    toast.success("Marked as read");
  };

  const handleBulkArchive = async () => {
    try {
      for (const id of selected) await archiveMail(id);
      setRows((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
      toast.success("Archived");
    } catch {
      toast.error("Failed to archive some mails");
      loadMails();
    }
  };

  const handleBulkTrash = async () => {
    try {
      for (const id of selected) await trashMail(id);
      setRows((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
      toast.success("Moved to trash");
    } catch {
      toast.error("Failed to move to trash");
      loadMails();
    }
  };

  const handleBulkTrashSent = async () => {
    try {
      for (const id of selected) await trashSentMail(id);
      setRows((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
      toast.success("Moved to trash");
    } catch {
      toast.error("Failed to move to trash");
      loadMails();
    }
  };

  const handleBulkUnarchive = async () => {
    try {
      for (const id of selected) await unarchiveMail(id);
      setRows((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
      toast.success("Moved back to inbox");
    } catch {
      toast.error("Failed to unarchive some mails");
      loadMails();
    }
  };

  const handleBulkDeleteTrash = async () => {
    try {
      const selectedRows = rows.filter((r) => selected.has(r.id));
      for (const row of selectedRows) {
        if (row.isSentMail) {
          await deleteSentMail(row.id);
        } else {
          await deletePermanently(row.id);
        }
      }
      setRows((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
      toast.success("Deleted permanently");
    } catch {
      toast.error("Failed to delete some mails");
      loadMails();
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead(orgId).catch(() => {});
    setRows((prev) => prev.map((r) => ({ ...r, isRead: true })));
    toast.success("All marked as read");
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0">
        <div className="flex items-center gap-3">
          <FolderIcon className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">{config.label}</h2>
          <span className="text-sm text-muted-foreground">({rows.length})</span>
        </div>
        {folder === "inbox" && (
          <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="gap-2 text-muted-foreground">
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-6 py-2 border-b bg-muted/20 shrink-0">
          <span className="text-sm text-muted-foreground">{selected.size} selected</span>
          {folder !== "sent" && folder !== "drafts" && (
            <Button variant="ghost" size="sm" onClick={handleBulkMarkRead}>Mark Read</Button>
          )}
          {folder !== "archived" && folder !== "trash" && folder !== "sent" && folder !== "drafts" && (
            <Button variant="ghost" size="sm" onClick={handleBulkArchive}>Archive</Button>
          )}
          {folder === "archived" && (
            <Button variant="ghost" size="sm" onClick={handleBulkUnarchive}>Move to Inbox</Button>
          )}
          {folder !== "trash" && folder !== "sent" && folder !== "drafts" && (
            <Button variant="ghost" size="sm" onClick={handleBulkTrash}>Trash</Button>
          )}
          {folder === "trash" && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={handleBulkDeleteTrash}>
              Delete Forever
            </Button>
          )}
          {folder === "sent" && (
            <Button variant="ghost" size="sm" onClick={handleBulkTrashSent}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Trash
            </Button>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            Clear
          </button>
        </div>
      )}

      {/* Select all checkbox */}
      {rows.length > 0 && (
        <div className="flex items-center px-6 py-2 border-b dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 shrink-0">
          <Checkbox
            checked={selected.size === rows.length && rows.length > 0}
            onCheckedChange={toggleSelectAll}
          />
          <span className="ml-3 text-xs text-muted-foreground">Select all</span>
        </div>
      )}

      {/* Mail list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Mail className="h-12 w-12 text-muted-foreground/20 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No mail here</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {folder === "inbox"
                ? "Your inbox is empty"
                : folder === "drafts"
                  ? "No saved drafts"
                  : `No mail in ${config.label.toLowerCase()}`}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div
                key={row.id}
                onClick={() => handleRowClick(row)}
                className={`group flex items-center gap-3 px-6 py-3.5 cursor-pointer transition-colors hover:bg-muted/30 ${
                  !row.isRead ? "bg-blue-50/30 border-l-[3px] border-l-blue-500" : "border-l-[3px] border-l-transparent"
                } ${selected.has(row.id) ? "bg-indigo-600/5" : ""}`}
              >
                {/* Checkbox */}
                <div onClick={(e) => { e.stopPropagation(); toggleSelect(row.id); }}>
                  <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleSelect(row.id)} />
                </div>

                {/* Star */}
                {folder !== "sent" && folder !== "drafts" && (
                  <button
                    onClick={(e) => handleToggleStar(e, row)}
                    className="shrink-0"
                  >
                    <Star
                      className={`h-4 w-4 transition-colors ${
                        row.isStarred
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/30 hover:text-amber-400"
                      }`}
                    />
                  </button>
                )}

                {/* Avatar */}
                {!row.isDraft && folder !== "sent" && (
                  <Avatar
                    src={row.senderAvatar || undefined}
                    alt={row.senderName}
                    fallback={row.senderName[0]?.toUpperCase() || "?"}
                    className="h-8 w-8 shrink-0"
                  />
                )}

                {/* Content */}
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <span className={`w-36 shrink-0 truncate text-sm ${!row.isRead ? "font-semibold text-foreground" : "text-foreground"}`}>
                    {row.senderName}
                  </span>
                  <span className={`shrink-0 text-sm truncate max-w-[250px] ${!row.isRead ? "font-semibold text-foreground" : "text-foreground"}`}>
                    {row.subject}
                  </span>
                  <span className="text-sm text-muted-foreground truncate">
                    {row.bodyPreview ? `— ${row.bodyPreview}` : ""}
                  </span>
                </div>

                {/* Timestamp */}
                <span className="text-xs text-muted-foreground/70 shrink-0 whitespace-nowrap">
                  {relativeTime(row.timestamp)}
                </span>

                {/* Unread dot */}
                {!row.isRead && (
                  <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
