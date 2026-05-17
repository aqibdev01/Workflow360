"use client";

import { useState } from "react";
import { Check, X, Clock, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { toast } from "sonner";
import { reviewJoinRequest, getOrganizationMembers } from "@/lib/database";
import { notifyJoinRequestReviewed, notifyMemberJoined } from "@/lib/notifications/triggers";

export type JoinRequest = {
  id: string;
  user_id: string;
  status: string;
  requested_at: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
};

type Props = {
  orgId: string;
  orgName: string;
  requests: JoinRequest[];
  onRequestsChanged: () => void;
};

export function JoinRequestsPanel({ orgId, orgName, requests, onRequestsChanged }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleReview = async (request: JoinRequest, action: "approved" | "rejected") => {
    setLoadingId(request.id);
    try {
      const result = await reviewJoinRequest(request.id, action);
      if (!result.success) {
        toast.error("Action failed", { description: result.error });
        return;
      }

      const displayName = request.full_name || request.email;
      toast.success(
        action === "approved"
          ? `${displayName} has been added to ${orgName}`
          : `${displayName}'s request to join ${orgName} has been denied`
      );

      // Notify the requester of the outcome
      notifyJoinRequestReviewed(orgId, request.user_id, orgName, action === "approved").catch(() => {});

      // On approval, notify all existing org members that someone new joined
      if (action === "approved") {
        getOrganizationMembers(orgId)
          .then((members) => {
            const memberIds = (members || []).map((m: any) => m.users?.id || m.user_id).filter(Boolean);
            const newMemberName = request.full_name || request.email;
            notifyMemberJoined(orgId, { id: request.user_id, name: newMemberName }, memberIds).catch(() => {});
          })
          .catch(() => {});
      }

      onRequestsChanged();
    } catch (err: any) {
      toast.error("Action failed", { description: err.message });
    } finally {
      setLoadingId(null);
    }
  };

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-3 text-muted-foreground">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          <UserPlus className="h-5 w-5" />
        </div>
        <p className="text-sm">No pending membership requests</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => {
        const displayName = req.full_name || req.email;
        const initials = displayName
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);
        const isLoading = loadingId === req.id;

        return (
          <div
            key={req.id}
            className="flex items-center gap-4 p-3 rounded-lg border bg-background hover:bg-muted/30 transition-colors"
          >
            <Avatar
              src={req.avatar_url || undefined}
              alt={displayName}
              fallback={initials}
              className="h-9 w-9 rounded-full shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
              {req.full_name && (
                <p className="text-xs text-muted-foreground truncate">{req.email}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" />
                {new Date(req.requested_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20 shrink-0">
              Pending
            </Badge>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-green-700 border-green-300 hover:bg-green-50 dark:hover:bg-green-950/20"
                disabled={isLoading}
                onClick={() => handleReview(req, "approved")}
              >
                <Check className="h-3.5 w-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20"
                disabled={isLoading}
                onClick={() => handleReview(req, "rejected")}
              >
                <X className="h-3.5 w-3.5" />
                Decline
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
