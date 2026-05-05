"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  Users,
  Key,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Info,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { joinOrganizationByInviteCode, getOrganizationMembers } from "@/lib/database";
import { notifyJoinRequested } from "@/lib/notifications/triggers";

// Validation schema
const joinCodeSchema = z.object({
  inviteCode: z.string().min(6, "Invite code must be at least 6 characters"),
});

type JoinCodeFormData = z.infer<typeof joinCodeSchema>;

export default function JoinOrganizationPage() {
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const [isJoining, setIsJoining] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<JoinCodeFormData>({
    resolver: zodResolver(joinCodeSchema),
    defaultValues: {
      inviteCode: "",
    },
  });

  const onSubmitCode = async (data: JoinCodeFormData) => {
    if (!user) {
      toast.error("Authentication required", {
        description: "You must be logged in to join an organization.",
      });
      return;
    }

    setIsJoining(true);

    try {
      // Use the secure RPC function to join organization
      const result = await joinOrganizationByInviteCode(data.inviteCode, user.id);

      if (!result.success) {
        toast.error("Failed to join", {
          description: result.error || "Invalid invite code. Please check and try again.",
        });
        setIsJoining(false);
        return;
      }

      toast.success("Request sent!", {
        description: `Your request to join ${result.org_name} has been submitted. You'll be notified once the owner reviews it.`,
      });

      // Notify org admins / managers about the incoming request
      if (result.org_id) {
        getOrganizationMembers(result.org_id).then((members) => {
          const adminIds = (members || [])
            .filter((m: any) => m.role === "admin" || m.role === "manager")
            .map((m: any) => m.users?.id)
            .filter((id: string) => id && id !== user.id);
          const requesterName = userProfile?.full_name || user.email?.split("@")[0] || "Someone";
          notifyJoinRequested(result.org_id!, { id: user.id, name: requesterName }, adminIds).catch(() => {});
        }).catch(() => {});
      }

      reset();

      setIsJoining(false);

      // Stay on dashboard — user is not yet a member
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 2000);
    } catch (error: any) {
      console.error("Error joining organization:", error);
      toast.error("Failed to join organization", {
        description: error.message || "Invalid invite code. Please check and try again.",
      });
      setIsJoining(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={() => router.push("/dashboard")}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Join Organization</h1>
        <p className="text-muted-foreground mt-2">
          Enter an invite code to request membership in an organization
        </p>
      </div>

      {/* Invite Code Input */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <CardTitle>Enter Invite Code</CardTitle>
          </div>
          <CardDescription>
            Ask your team admin for the organization's invite code
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmitCode)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inviteCode">Invite Code</Label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    id="inviteCode"
                    type="text"
                    placeholder="e.g., ABC123XYZ"
                    className="uppercase"
                    {...register("inviteCode")}
                    disabled={isJoining}
                  />
                  {errors.inviteCode && (
                    <p className="text-sm text-destructive mt-1">
                      {errors.inviteCode.message}
                    </p>
                  )}
                </div>
                <Button type="submit" disabled={isJoining}>
                  {isJoining ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      Request to Join
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="bg-secondary/50 border rounded-lg p-4 flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Invite codes are case-insensitive. Submitting a code sends a membership request — the organization owner or manager must approve it before you can access the workspace.
                </p>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold">Don't have an invite code?</h3>
              <p className="text-sm text-muted-foreground">
                You can create your own organization and invite others to join.
                As an organization owner, you'll have full control over projects,
                members, and settings.
              </p>
              <Button
                variant="link"
                className="px-0 h-auto text-primary"
                onClick={() => router.push("/dashboard/organizations/new")}
              >
                Create a new organization
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
