"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Reply,
  Forward,
  Archive,
  ArchiveRestore,
  Trash2,
  Star,
  Download,
  FileText,
  Image,
  Film,
  Loader2,
  Paperclip,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  getMail,
  markAsRead,
  starMail,
  unstarMail,
  archiveMail,
  unarchiveMail,
  trashMail,
  trashSentMail,
  deleteSentMail,
  getAttachmentUrl,
  type MailMessage,
} from "@/lib/mail/mail";

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mime: string) {
  if (mime.startsWith("image/")) return Image;
  if (mime.startsWith("video/")) return Film;
  return FileText;
}

function sanitizeHtml(html: string): string {
  // Basic sanitization: strip script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\bon\w+\s*=/gi, "data-removed=");
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function MailDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  const folder = params.folder as string;
  const mailId = params.mailId as string;

  const [mail, setMail] = useState<MailMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStarred, setIsStarred] = useState(false);

  const loadMail = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getMail(mailId);
      setMail(data);

      // Check if current user has starred this mail
      const {
        data: { user },
      } = await (await import("@/lib/supabase")).supabase.auth.getUser();
      if (user && data.recipients) {
        const myRecipient = data.recipients.find(
          (r: any) => r.user?.id === user.id || r.recipient_id === user.id
        );
        setIsStarred(myRecipient?.is_starred || false);
      }

      // Mark as read
      markAsRead(mailId).catch(() => {});
    } catch (err) {
      console.error("Error loading mail:", err);
      toast.error("Failed to load mail");
    } finally {
      setLoading(false);
    }
  }, [mailId]);

  useEffect(() => {
    loadMail();
  }, [loadMail]);

  const handleStar = async () => {
    try {
      if (isStarred) {
        await unstarMail(mailId);
        setIsStarred(false);
      } else {
        await starMail(mailId);
        setIsStarred(true);
      }
    } catch {
      toast.error("Failed to update star");
    }
  };

  const handleArchive = async () => {
    try {
      await archiveMail(mailId);
      toast.success("Mail archived");
      router.push(`/dashboard/organizations/${orgId}/mail/archived`);
    } catch {
      toast.error("Failed to archive mail");
    }
  };

  const handleTrash = async () => {
    try {
      if (folder === "sent") {
        await trashSentMail(mailId);
        toast.success("Moved to trash");
        router.push(`/dashboard/organizations/${orgId}/mail/sent`);
      } else {
        await trashMail(mailId);
        toast.success("Moved to trash");
        router.push(`/dashboard/organizations/${orgId}/mail/trash`);
      }
    } catch {
      toast.error("Failed to move to trash");
    }
  };

  const handleUnarchive = async () => {
    try {
      await unarchiveMail(mailId);
      toast.success("Moved back to inbox");
      router.push(`/dashboard/organizations/${orgId}/mail/inbox`);
    } catch {
      toast.error("Failed to unarchive mail");
    }
  };

  const handleDeletePermanently = async () => {
    try {
      await deleteSentMail(mailId);
      toast.success("Deleted permanently");
      router.push(`/dashboard/organizations/${orgId}/mail/trash`);
    } catch {
      toast.error("Failed to delete mail");
    }
  };

  const handleDownloadAttachment = async (storagePath: string, fileName: string) => {
    try {
      const url = await getAttachmentUrl(storagePath, fileName);
      window.open(url, "_blank");
    } catch {
      toast.error("Failed to download attachment");
    }
  };

  const handleReply = () => {
    const replySubject = mail?.subject?.startsWith("Re: ")
      ? mail.subject
      : `Re: ${mail?.subject || ""}`;
    const replyTo = mail?.sender?.id || "";
    const quotedBody = `\n\n--- Original Message ---\n${mail?.sender?.full_name || "Unknown"} wrote:\n\n${mail?.body || ""}`;
    const params = new URLSearchParams({
      replyTo,
      subject: replySubject,
      quotedBody: quotedBody,
    });
    router.push(`/dashboard/organizations/${orgId}/mail/compose?${params.toString()}`);
  };

  const handleForward = () => {
    const fwdSubject = mail?.subject?.startsWith("Fwd: ")
      ? mail.subject
      : `Fwd: ${mail?.subject || ""}`;
    const quotedBody = `\n\n--- Forwarded Message ---\nFrom: ${mail?.sender?.full_name || "Unknown"}\nSubject: ${mail?.subject || ""}\n\n${mail?.body || ""}`;
    const params = new URLSearchParams({
      subject: fwdSubject,
      quotedBody: quotedBody,
    });
    router.push(`/dashboard/organizations/${orgId}/mail/compose?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!mail) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p className="text-lg font-medium text-muted-foreground">Mail not found</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => router.push(`/dashboard/organizations/${orgId}/mail/${folder}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to {folder}
        </Button>
      </div>
    );
  }

  const toRecipients = (mail.recipients || []).filter((r: any) => r.recipient_type === "to");
  const ccRecipients = (mail.recipients || []).filter((r: any) => r.recipient_type === "cc");
  const attachments = mail.attachments || [];

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/dashboard/organizations/${orgId}/mail/${folder}`)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleReply} className="gap-2">
            <Reply className="h-4 w-4" />
            Reply
          </Button>
          <Button variant="ghost" size="sm" onClick={handleForward} className="gap-2">
            <Forward className="h-4 w-4" />
            Forward
          </Button>
          <Button variant="ghost" size="sm" onClick={handleStar}>
            <Star
              className={`h-4 w-4 ${isStarred ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
            />
          </Button>
          {folder === "archived" ? (
            <Button variant="ghost" size="sm" onClick={handleUnarchive} className="gap-2">
              <ArchiveRestore className="h-4 w-4 text-muted-foreground" />
              Unarchive
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={handleArchive}>
              <Archive className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
          {folder === "trash" ? (
            <Button variant="ghost" size="sm" onClick={handleDeletePermanently} className="gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete Forever
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={handleTrash}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Mail content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
          {/* Subject */}
          <div className="flex items-start gap-3">
            <h1 className="text-xl font-bold text-foreground flex-1">{mail.subject}</h1>
            {mail.type !== "direct" && (
              <Badge variant="outline" className="shrink-0 capitalize">
                {mail.type}
              </Badge>
            )}
          </div>

          {/* Sender info */}
          <div className="flex items-start gap-4">
            <Avatar
              src={mail.sender?.avatar_url || undefined}
              alt={mail.sender?.full_name || ""}
              fallback={mail.sender?.full_name?.[0]?.toUpperCase() || "?"}
              className="h-10 w-10 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  {mail.sender?.full_name || mail.sender?.email || "Unknown"}
                </span>
                <span className="text-xs text-muted-foreground">
                  &lt;{mail.sender?.email || ""}&gt;
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                <p>
                  To:{" "}
                  {toRecipients
                    .map((r: any) => r.user?.full_name || r.user?.email || "Unknown")
                    .join(", ") || "—"}
                </p>
                {ccRecipients.length > 0 && (
                  <p>
                    CC:{" "}
                    {ccRecipients
                      .map((r: any) => r.user?.full_name || r.user?.email || "Unknown")
                      .join(", ")}
                  </p>
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {mail.sent_at ? formatDate(mail.sent_at) : formatDate(mail.created_at)}
            </span>
          </div>

          <Separator />

          {/* Body */}
          <div
            className="mail-body-content max-w-none text-foreground text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(mail.body) }}
          />
          <style jsx global>{`
            .mail-body-content ul {
              list-style-type: disc;
              padding-left: 1.5rem;
              margin: 0.5rem 0;
            }
            .mail-body-content ol {
              list-style-type: decimal;
              padding-left: 1.5rem;
              margin: 0.5rem 0;
            }
            .mail-body-content li {
              margin: 0.25rem 0;
            }
            .mail-body-content a {
              color: hsl(var(--primary));
              text-decoration: underline;
            }
            .mail-body-content p {
              margin: 0.5rem 0;
            }
          `}</style>

          {/* Attachments */}
          {attachments.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  {attachments.length} Attachment{attachments.length > 1 ? "s" : ""}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {attachments.map((att) => {
                    const FileIcon = getFileIcon(att.mime_type);
                    return (
                      <button
                        key={att.id}
                        onClick={() => handleDownloadAttachment(att.storage_path, att.file_name)}
                        className="flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted/50">
                          <FileIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{att.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(att.size_bytes)}
                          </p>
                        </div>
                        <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
