import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role key to bypass RLS — this runs as a server-side cron job
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/cron/sprint-deadlines
 *
 * Checks for active sprints ending within 48 hours and notifies all
 * project members. Designed to be called daily (e.g., via Vercel Cron
 * or any external cron service).
 *
 * Requires a CRON_SECRET env var for authentication.
 */
export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Find active sprints ending within 48 hours
    const { data: sprints, error: sprintError } = await (supabaseAdmin as any)
      .from("sprints")
      .select(`
        id,
        name,
        end_date,
        project_id,
        projects!inner (
          id,
          name,
          org_id
        )
      `)
      .eq("status", "active")
      .gte("end_date", now.toISOString())
      .lte("end_date", in48Hours.toISOString());

    if (sprintError) {
      console.error("Error fetching sprints:", sprintError);
      return NextResponse.json({ error: "Failed to fetch sprints" }, { status: 500 });
    }

    if (!sprints || sprints.length === 0) {
      return NextResponse.json({ message: "No sprints ending soon", notified: 0 });
    }

    let totalNotifications = 0;

    for (const sprint of sprints) {
      const project = sprint.projects;
      if (!project) continue;

      // Get all project members
      const { data: members, error: memberError } = await (supabaseAdmin as any)
        .from("project_members")
        .select("user_id")
        .eq("project_id", sprint.project_id);

      if (memberError || !members) continue;

      const memberIds = members.map((m: any) => m.user_id);
      if (memberIds.length === 0) continue;

      // Check if we already sent deadline notifications for this sprint today
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const { count } = await (supabaseAdmin as any)
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", "sprint_deadline")
        .gte("created_at", todayStart.toISOString())
        .contains("metadata", { sprintId: sprint.id });

      if (count && count > 0) continue; // Already notified today

      // Create notifications for all project members
      const notifications = memberIds.map((userId: string) => ({
        organization_id: project.org_id,
        user_id: userId,
        type: "sprint_deadline",
        title: `Sprint ending soon: ${sprint.name}`,
        body: `"${sprint.name}" in ${project.name} ends on ${new Date(sprint.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        link: `/dashboard/projects/${sprint.project_id}?tab=kanban`,
        metadata: {
          sprintId: sprint.id,
          sprintName: sprint.name,
          projectId: sprint.project_id,
          projectName: project.name,
          endDate: sprint.end_date,
        },
      }));

      const { error: insertError } = await (supabaseAdmin as any)
        .from("notifications")
        .insert(notifications);

      if (!insertError) {
        totalNotifications += notifications.length;
      }
    }

    return NextResponse.json({
      message: `Sprint deadline check complete`,
      sprints: sprints.length,
      notified: totalNotifications,
    });
  } catch (error) {
    console.error("Sprint deadline cron error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
