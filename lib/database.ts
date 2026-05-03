// Database utility functions for Workflow360
// Common database operations with type safety

import { supabase } from "./supabase";
import type {
  Organization,
  OrganizationInsert,
  Project,
  ProjectInsert,
  Task,
  TaskInsert,
  Sprint,
  SprintInsert,
  SprintEventInsert,
  NotificationInsert,
  OrganizationMemberInsert,
  ProjectMemberInsert,
} from "@/types";

// =====================================================
// ORGANIZATION OPERATIONS
// =====================================================

/**
 * Create a new organization
 */
export async function createOrganization(data: OrganizationInsert): Promise<Organization> {
  console.log("createOrganization called with data:", data);

  const { data: org, error } = await supabase
    .from("organizations")
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error("Error creating organization:", error);
    throw error;
  }

  console.log("Organization created successfully:", org);
  return org as unknown as Organization;
}

/**
 * Get organizations for the current user
 */
export async function getUserOrganizations(userId?: string) {
  let query = supabase
    .from("organizations")
    .select(
      `
      *,
      organization_members!inner(role, user_id)
    `
    );

  if (userId) {
    query = query.eq("organization_members.user_id", userId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;

  if (!data || data.length === 0) return [];

  // Fetch member and project counts in parallel
  const orgIds = (data as any[]).map((o: any) => o.id);
  const [memberCounts, projectCounts] = await Promise.all([
    (supabase as any).from("organization_members").select("org_id").in("org_id", orgIds),
    (supabase as any).from("projects").select("org_id").in("org_id", orgIds),
  ]);

  const memberCountMap: Record<string, number> = {};
  const projectCountMap: Record<string, number> = {};
  ((memberCounts.data || []) as any[]).forEach((r: any) => {
    memberCountMap[r.org_id] = (memberCountMap[r.org_id] || 0) + 1;
  });
  ((projectCounts.data || []) as any[]).forEach((r: any) => {
    projectCountMap[r.org_id] = (projectCountMap[r.org_id] || 0) + 1;
  });

  return (data as any[]).map((org: any) => ({
    ...org,
    member_count: memberCountMap[org.id] || 1,
    project_count: projectCountMap[org.id] || 0,
  }));
}

/**
 * Get organization with members
 */
export async function getOrganizationWithMembers(orgId: string) {
  const { data, error } = await supabase
    .from("organizations")
    .select(
      `
      *,
      organization_members(
        id,
        role,
        joined_at,
        users(id, email, full_name, avatar_url)
      )
    `
    )
    .eq("id", orgId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Add member to organization
 */
export async function addOrganizationMember(data: OrganizationMemberInsert) {
  console.log("addOrganizationMember called with data:", data);

  const { data: member, error } = await supabase
    .from("organization_members")
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error("Error adding organization member:", error);
    throw error;
  }

  console.log("Member added successfully:", member);
  return member;
}

/**
 * Update organization member role
 */
export async function updateOrganizationMemberRole(
  memberId: string,
  role: "admin" | "manager" | "member"
) {
  const { data, error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("id", memberId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Remove member from organization
 */
export async function removeOrganizationMember(memberId: string) {
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", memberId);

  if (error) throw error;
}

/**
 * Find organization by invite code
 * Uses a SECURITY DEFINER function to bypass RLS
 */
export async function getOrganizationByInviteCode(inviteCode: string) {
  const { data, error } = await supabase
    .rpc("get_organization_by_invite_code", { p_invite_code: inviteCode } as any);

  if (error) throw error;
  const result = data as any[] | null;
  return result && result.length > 0 ? result[0] : null;
}

/**
 * Join organization by invite code
 * Uses a SECURITY DEFINER function to bypass RLS
 */
export async function joinOrganizationByInviteCode(inviteCode: string, userId: string) {
  const { data, error } = await supabase
    .rpc("join_organization_by_invite_code", {
      p_invite_code: inviteCode,
      p_user_id: userId
    } as any);

  if (error) throw error;
  return data as { success: boolean; error?: string; org_id?: string; org_name?: string };
}

/**
 * Check if user is already member of organization
 */
export async function isUserOrganizationMember(orgId: string, userId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
  return !!data;
}

/**
 * Get all members of an organization
 */
export async function getOrganizationMembers(orgId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select(
      `
      id,
      user_id,
      role,
      joined_at,
      users(id, email, full_name, avatar_url)
    `
    )
    .eq("org_id", orgId)
    .order("joined_at", { ascending: false });

  if (error) throw error;
  return data;
}

// =====================================================
// PROJECT OPERATIONS
// =====================================================

/**
 * Create a new project
 */
export async function createProject(data: ProjectInsert): Promise<Project> {
  const { data: project, error } = await supabase
    .from("projects")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return project as unknown as Project;
}

/**
 * Get projects for an organization
 */
export async function getOrganizationProjects(orgId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select(
      `
      *,
      created_by_user:users!created_by(id, full_name, avatar_url),
      project_members(count)
    `
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Get project with full details
 */
export async function getProjectDetails(projectId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select(
      `
      *,
      organizations(id, name),
      project_members(
        id,
        role,
        custom_role,
        assigned_at,
        users(id, email, full_name, avatar_url)
      )
    `
    )
    .eq("id", projectId)
    .single();

  if (error) throw error;
  if (!data) return null;

  // Cast to access created_by field
  const projectData = data as { created_by?: string; [key: string]: unknown };

  // If we have a created_by user ID, fetch the user separately
  // This avoids potential RLS issues with the join
  if (projectData.created_by) {
    const { data: createdByUser } = await supabase
      .from("users")
      .select("id, full_name, avatar_url")
      .eq("id", projectData.created_by)
      .single();

    return {
      ...data,
      created_by_user: createdByUser
    };
  }

  return data;
}

/**
 * Update project status
 */
export async function updateProjectStatus(
  projectId: string,
  status: "planning" | "active" | "on_hold" | "completed" | "archived"
) {
  const { data, error } = await supabase
    .from("projects")
    .update({ status })
    .eq("id", projectId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Add member to project
 */
export async function addProjectMember(data: ProjectMemberInsert) {
  const { data: member, error } = await supabase
    .from("project_members")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return member;
}

// =====================================================
// TASK OPERATIONS
// =====================================================

/**
 * Create a new task
 */
export async function createTask(data: TaskInsert) {
  const { data: task, error } = await supabase
    .from("tasks")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return task;
}

/**
 * Get tasks for a project
 */
export async function getProjectTasks(projectId: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
      *,
      assignee:users!assignee_id(id, full_name, avatar_url, email),
      created_by_user:users!created_by(id, full_name, avatar_url, email),
      sprints(id, name)
    `
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Get tasks by status
 */
export async function getTasksByStatus(
  projectId: string,
  status: "todo" | "in_progress" | "review" | "done" | "blocked"
) {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
      *,
      assignee:users!assignee_id(id, full_name, avatar_url, email)
    `
    )
    .eq("project_id", projectId)
    .eq("status", status)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Get tasks assigned to a user
 */
export async function getUserTasks(userId: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
      *,
      projects(id, name, organizations(id, name))
    `
    )
    .eq("assignee_id", userId)
    .neq("status", "done")
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Update task status
 */
export async function updateTaskStatus(
  taskId: string,
  status: "todo" | "in_progress" | "review" | "done" | "blocked"
) {
  const updatePayload: any = { status };
  if (status === "done") {
    updatePayload.completed_at = new Date().toISOString();
  } else {
    updatePayload.completed_at = null;
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(updatePayload)
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Assign task to user
 */
export async function assignTask(taskId: string, assigneeId: string | null) {
  const { data, error } = await supabase
    .from("tasks")
    .update({ assignee_id: assigneeId })
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update task priority
 */
export async function updateTaskPriority(
  taskId: string,
  priority: "low" | "medium" | "high" | "urgent"
) {
  const { data, error } = await supabase
    .from("tasks")
    .update({ priority })
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update task (full update)
 */
export async function updateTask(
  taskId: string,
  updates: {
    title?: string;
    description?: string | null;
    status?: "todo" | "in_progress" | "review" | "done" | "blocked";
    priority?: "low" | "medium" | "high" | "urgent";
    assignee_id?: string | null;
    sprint_id?: string | null;
    due_date?: string | null;
  }
) {
  const { data, error } = await (supabase
    .from("tasks") as any)
    .update(updates)
    .eq("id", taskId)
    .select(
      `
      *,
      assignee:users!assignee_id(id, full_name, avatar_url, email),
      created_by_user:users!created_by(id, full_name, avatar_url)
    `
    )
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) throw error;
}

/**
 * Get a single task by ID
 */
export async function getTask(taskId: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
      *,
      assignee:users!assignee_id(id, full_name, avatar_url, email),
      created_by_user:users!created_by(id, full_name, avatar_url)
    `
    )
    .eq("id", taskId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get project members for task assignment
 */
export async function getProjectMembersForAssignment(projectId: string) {
  const { data, error } = await supabase
    .from("project_members")
    .select(
      `
      id,
      role,
      custom_role,
      user_id,
      users(id, email, full_name, avatar_url)
    `
    )
    .eq("project_id", projectId)
    .order("assigned_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get current user's role in a project
 */
export async function getUserProjectRole(projectId: string, userId: string) {
  const { data, error } = await supabase
    .from("project_members")
    .select("id, role, custom_role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // No rows found
    throw error;
  }
  return data;
}

// =====================================================
// SPRINT OPERATIONS
// =====================================================

/**
 * Create a new sprint
 */
export async function createSprint(data: SprintInsert) {
  const { data: sprint, error } = await supabase
    .from("sprints")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return sprint;
}

/**
 * Get sprints for a project
 */
export async function getProjectSprints(projectId: string) {
  const { data, error } = await supabase
    .from("sprints")
    .select(
      `
      *,
      tasks(count)
    `
    )
    .eq("project_id", projectId)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Get active sprint for a project
 */
export async function getActiveSprint(projectId: string) {
  const { data, error } = await supabase
    .from("sprints")
    .select(
      `
      *,
      tasks(
        *,
        assignee:users!assignee_id(id, full_name, avatar_url)
      )
    `
    )
    .eq("project_id", projectId)
    .eq("status", "active")
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // No active sprint
    throw error;
  }
  return data;
}

/**
 * Update sprint status
 */
export async function updateSprintStatus(
  sprintId: string,
  status: "planned" | "active" | "completed" | "cancelled"
) {
  const { data, error } = await supabase
    .from("sprints")
    .update({ status })
    .eq("id", sprintId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Add task to sprint
 */
export async function addTaskToSprint(taskId: string, sprintId: string | null) {
  const { data, error } = await supabase
    .from("tasks")
    .update({ sprint_id: sprintId })
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update sprint details
 */
export async function updateSprint(
  sprintId: string,
  updates: {
    name?: string;
    goal?: string | null;
    start_date?: string;
    end_date?: string;
    status?: "planned" | "active" | "completed" | "cancelled";
  }
): Promise<Sprint> {
  const { data, error } = await (supabase.from("sprints") as any)
    .update(updates)
    .eq("id", sprintId)
    .select()
    .single();

  if (error) throw error;
  return data as Sprint;
}

/**
 * Delete a sprint
 */
export async function deleteSprint(sprintId: string) {
  // First, remove sprint_id from all tasks in this sprint
  await (supabase.from("tasks") as any)
    .update({ sprint_id: null })
    .eq("sprint_id", sprintId);

  const { error } = await supabase.from("sprints").delete().eq("id", sprintId);
  if (error) throw error;
}

/**
 * Get sprint with full details including tasks and events
 */
export async function getSprintWithDetails(sprintId: string) {
  const { data, error } = await supabase
    .from("sprints")
    .select(
      `
      *,
      tasks(
        *,
        assignee:users!assignee_id(id, full_name, avatar_url, email),
        created_by_user:users!created_by(id, full_name, avatar_url)
      )
    `
    )
    .eq("id", sprintId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get sprint tasks
 */
export async function getSprintTasks(sprintId: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
      *,
      assignee:users!assignee_id(id, full_name, avatar_url, email),
      created_by_user:users!created_by(id, full_name, avatar_url)
    `
    )
    .eq("sprint_id", sprintId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Start a sprint (change status to active)
 */
export async function startSprint(sprintId: string) {
  // First check if there's already an active sprint in the project
  const { data: sprint } = await (supabase.from("sprints") as any)
    .select("project_id")
    .eq("id", sprintId)
    .single();

  if (sprint) {
    const { data: activeSprint } = await (supabase.from("sprints") as any)
      .select("id")
      .eq("project_id", sprint.project_id)
      .eq("status", "active")
      .single();

    if (activeSprint && activeSprint.id !== sprintId) {
      throw new Error("There is already an active sprint in this project");
    }
  }

  const { data, error } = await (supabase.from("sprints") as any)
    .update({ status: "active" })
    .eq("id", sprintId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Stop/Complete a sprint
 */
export async function stopSprint(sprintId: string) {
  const { data, error } = await (supabase.from("sprints") as any)
    .update({ status: "completed" })
    .eq("id", sprintId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// =====================================================
// SPRINT EVENTS OPERATIONS
// =====================================================

/**
 * Create a sprint event
 */
export async function createSprintEvent(data: SprintEventInsert) {
  const { data: event, error } = await (supabase.from("sprint_events") as any)
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return event;
}

/**
 * Get events for a sprint
 */
export async function getSprintEvents(sprintId: string) {
  const { data, error } = await (supabase.from("sprint_events") as any)
    .select(
      `
      *,
      created_by_user:users!created_by(id, full_name, avatar_url, email)
    `
    )
    .eq("sprint_id", sprintId)
    .order("event_date", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Update a sprint event
 */
export async function updateSprintEvent(
  eventId: string,
  updates: {
    title?: string;
    description?: string | null;
    event_type?: string;
    event_date?: string;
    start_time?: string | null;
    end_time?: string | null;
  }
) {
  const { data, error } = await (supabase.from("sprint_events") as any)
    .update(updates)
    .eq("id", eventId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a sprint event
 */
export async function deleteSprintEvent(eventId: string) {
  const { error } = await (supabase.from("sprint_events") as any)
    .delete()
    .eq("id", eventId);

  if (error) throw error;
}

// =====================================================
// NOTIFICATION OPERATIONS
// =====================================================

/**
 * Create a notification
 */
export async function createNotification(data: NotificationInsert) {
  const { data: notification, error } = await (supabase.from("notifications") as any)
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return notification;
}

/**
 * Create notifications for all project members
 */
export async function notifyProjectMembers(
  projectId: string,
  notification: Omit<NotificationInsert, "user_id">
) {
  // Get all project members
  const { data: members, error: membersError } = await (supabase
    .from("project_members") as any)
    .select("user_id")
    .eq("project_id", projectId);

  if (membersError) throw membersError;
  if (!members || members.length === 0) return [];

  // Create notifications for all members
  const notifications = members.map((member: any) => ({
    ...notification,
    user_id: member.user_id,
  }));

  const { data, error } = await (supabase.from("notifications") as any)
    .insert(notifications)
    .select();

  if (error) throw error;
  return data || [];
}

/**
 * Get notifications for a user
 */
export async function getUserNotifications(userId: string, limit = 20) {
  const { data, error } = await (supabase.from("notifications") as any)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Get unread notification count
 */
export async function getUnreadNotificationCount(userId: string) {
  const { count, error } = await (supabase.from("notifications") as any)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);

  if (error) throw error;
  return count || 0;
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string) {
  const { data, error } = await (supabase.from("notifications") as any)
    .update({ read: true })
    .eq("id", notificationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string) {
  const { data, error } = await (supabase.from("notifications") as any)
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false)
    .select();

  if (error) throw error;
  return data || [];
}

// =====================================================
// USER OPERATIONS
// =====================================================

/**
 * Search users by email (for invitations)
 * Only returns users who have signed up in the system
 */
export async function searchUsersByEmail(email: string) {
  if (!email || email.trim().length < 3) {
    return [];
  }

  console.log("🔍 Searching for users with email containing:", email.trim());

  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, avatar_url")
    .ilike("email", `%${email.trim()}%`)
    .limit(10);

  if (error) {
    console.error("❌ Error searching users:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    return [];
  }

  console.log("✅ Search results:", data);
  console.log("📊 Found", data?.length || 0, "users");

  return data || [];
}

/**
 * Get user by exact email
 */
export async function getUserByEmail(email: string) {
  if (!email) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, avatar_url")
    .eq("email", email.trim().toLowerCase())
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // No rows found
    console.error("Error getting user by email:", error);
    return null;
  }

  return data;
}

/**
 * Get or create user profile
 */
export async function getOrCreateUserProfile(userId: string, email: string, fullName?: string) {
  console.log("👤 Getting or creating user profile for:", userId);

  // First try to get existing profile
  const { data: existingUser } = await supabase
    .from("users")
    .select()
    .eq("id", userId)
    .single();

  if (existingUser) {
    // Backfill full_name if we now have one but the row doesn't
    if (fullName && fullName.trim() && !existingUser.full_name) {
      const { data: updated } = await (supabase as any)
        .from("users")
        .update({ full_name: fullName.trim() })
        .eq("id", userId)
        .select()
        .single();
      return updated || existingUser;
    }
    return existingUser;
  }

  console.log("📝 Creating new user profile");

  const insertPayload: any = { id: userId, email };
  if (fullName && fullName.trim()) insertPayload.full_name = fullName.trim();

  const { data: newUser, error: createError } = await supabase
    .from("users")
    .insert(insertPayload)
    .select()
    .single();

  if (createError) {
    console.error("❌ Error creating user profile:", createError);
    throw createError;
  }

  console.log("✅ User profile created successfully");
  return newUser;
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  updates: { full_name?: string; avatar_url?: string }
) {
  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// =====================================================
// ANALYTICS & REPORTING
// =====================================================

/**
 * Get project task statistics
 */
export async function getProjectTaskStats(projectId: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select("status, priority")
    .eq("project_id", projectId);

  if (error) throw error;

  const stats = {
    total: data.length,
    byStatus: {
      todo: data.filter((t) => t.status === "todo").length,
      in_progress: data.filter((t) => t.status === "in_progress").length,
      review: data.filter((t) => t.status === "review").length,
      done: data.filter((t) => t.status === "done").length,
      blocked: data.filter((t) => t.status === "blocked").length,
    },
    byPriority: {
      low: data.filter((t) => t.priority === "low").length,
      medium: data.filter((t) => t.priority === "medium").length,
      high: data.filter((t) => t.priority === "high").length,
      urgent: data.filter((t) => t.priority === "urgent").length,
    },
  };

  return stats;
}

/**
 * Get user's task count by project
 */
export async function getUserTasksByProject(userId: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
      id,
      status,
      projects(id, name)
    `
    )
    .eq("assignee_id", userId)
    .neq("status", "done");

  if (error) throw error;
  return data;
}

// =====================================================
// CUSTOM ROLES
// =====================================================

/**
 * Create a custom role for a project
 */
export async function createCustomRole(
  projectId: string,
  name: string,
  description?: string
) {
  console.log("📝 Creating custom role:", name, "for project:", projectId);

  const { data, error } = await supabase
    .from("project_custom_roles")
    .insert({
      project_id: projectId,
      name,
      description: description || null,
    })
    .select()
    .single();

  if (error) {
    console.error("❌ Error creating custom role:", error);
    throw error;
  }

  console.log("✅ Custom role created:", data);
  return data;
}

/**
 * Get all custom roles for a project
 */
export async function getProjectCustomRoles(projectId: string) {
  const { data, error } = await supabase
    .from("project_custom_roles")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Delete a custom role
 */
export async function deleteCustomRole(roleId: string) {
  const { error } = await supabase
    .from("project_custom_roles")
    .delete()
    .eq("id", roleId);

  if (error) throw error;
}

// =====================================================
// ENHANCED PROJECT OPERATIONS
// =====================================================

/**
 * Get a single organization by ID
 */
export async function getOrganization(orgId: string): Promise<{
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  invite_code: string;
  created_at: string;
  updated_at: string;
}> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .single();

  if (error) throw error;
  return data as any;
}

/**
 * Get all projects for a user (across all organizations)
 */
export async function getUserProjects(userId: string) {
  console.log("📂 Getting projects for user:", userId);

  const { data, error } = await supabase
    .from("project_members")
    .select(
      `
      id,
      role,
      custom_role,
      projects(
        id,
        name,
        description,
        status,
        start_date,
        end_date,
        created_at,
        organizations(id, name),
        project_members(count)
      )
    `
    )
    .eq("user_id", userId)
    .order("assigned_at", { ascending: false });

  if (error) {
    console.error("❌ Error getting user projects:", error);
    throw error;
  }

  console.log("✅ User project memberships:", data);
  const projects = data?.map((item: any) => item.projects).filter(Boolean) || [];
  console.log("📊 Mapped projects:", projects);

  return projects;
}

/**
 * Add a project member with custom role support
 */
export async function addProjectMemberWithRole(data: {
  project_id: string;
  user_id: string;
  role: string;
  custom_role?: string;
}) {
  console.log("👥 Adding project member with role:", data);

  const { data: member, error } = await supabase
    .from("project_members")
    .insert({
      project_id: data.project_id,
      user_id: data.user_id,
      role: data.role as any,
      custom_role: data.custom_role || null,
    })
    .select()
    .single();

  if (error) {
    console.error("❌ Error adding project member:", error);
    throw error;
  }

  console.log("✅ Project member added:", member);
  return member;
}

/**
 * Update a project member's role
 */
export async function updateMemberRole(
  memberId: string,
  role: string,
  customRole?: string
) {
  const { data, error } = await supabase
    .from("project_members")
    .update({
      role: role as any,
      custom_role: customRole || null,
    })
    .eq("id", memberId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// =====================================================
// ANALYTICS
// =====================================================

/**
 * Get comprehensive analytics data for a project
 * Fetches tasks (with assignee + sprint), members, and sprints in parallel
 */
export async function getProjectAnalyticsData(projectId: string) {
  const [tasksResult, membersResult, sprintsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        `id, title, status, priority, created_at, completed_at, due_date,
         assignee_id, sprint_id,
         assignee:users!assignee_id(id, full_name, email)`
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_members")
      .select(`id, role, custom_role, users(id, full_name, email)`)
      .eq("project_id", projectId),
    supabase
      .from("sprints")
      .select("id, name, status, start_date, end_date")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
  ]);

  if (tasksResult.error) throw tasksResult.error;
  if (membersResult.error) throw membersResult.error;
  if (sprintsResult.error) throw sprintsResult.error;

  return {
    tasks: (tasksResult.data || []) as any[],
    members: (membersResult.data || []) as any[],
    sprints: (sprintsResult.data || []) as any[],
  };
}

// =====================================================
// CALENDAR
// =====================================================

/**
 * Get tasks assigned to a user that have due dates in a given range.
 * Used for the personal calendar view.
 */
export async function getCalendarTasks(
  userId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const { data, error } = await (supabase.from("tasks") as any)
    .select(
      `id, title, status, priority, due_date, assignee_id, project_id,
       projects (id, name)`
    )
    .eq("assignee_id", userId)
    .not("due_date", "is", null)
    .gte("due_date", startDate)
    .lte("due_date", endDate)
    .order("due_date", { ascending: true });

  if (error) throw error;
  return (data || []) as any[];
}

/**
 * Get all tasks (with assignee info) in projects where the user is a PM.
 * Used for the manager calendar view with member filtering.
 */
export async function getCalendarTasksForManager(
  userId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  // Step 1: find projects where this user is owner/lead/Project Manager
  const { data: memberRows } = await (supabase.from("project_members") as any)
    .select("project_id, role, custom_role")
    .eq("user_id", userId);

  const projectIds = ((memberRows || []) as any[])
    .filter(
      (m: any) =>
        m.role === "owner" ||
        m.role === "lead" ||
        m.custom_role === "Project Manager"
    )
    .map((m: any) => m.project_id);

  if (projectIds.length === 0) return [];

  // Step 2: get all tasks with due dates in those projects
  const { data, error } = await (supabase.from("tasks") as any)
    .select(
      `id, title, status, priority, due_date, assignee_id, project_id,
       projects (id, name),
       assignee:users!assignee_id (id, full_name, email)`
    )
    .in("project_id", projectIds)
    .not("due_date", "is", null)
    .gte("due_date", startDate)
    .lte("due_date", endDate)
    .order("due_date", { ascending: true });

  if (error) throw error;
  return (data || []) as any[];
}

/**
 * Get all unique members across projects managed by a user.
 * Used to populate the PM member filter on the calendar.
 */
export async function getManagedProjectMembers(userId: string): Promise<any[]> {
  const { data: memberRows } = await (supabase.from("project_members") as any)
    .select("project_id, role, custom_role")
    .eq("user_id", userId);

  const projectIds = ((memberRows || []) as any[])
    .filter(
      (m: any) =>
        m.role === "owner" ||
        m.role === "lead" ||
        m.custom_role === "Project Manager"
    )
    .map((m: any) => m.project_id);

  if (projectIds.length === 0) return [];

  const { data, error } = await (supabase.from("project_members") as any)
    .select("user_id, users!inner (id, full_name, email)")
    .in("project_id", projectIds);

  if (error) return [];

  // Deduplicate by user_id
  const seen = new Set<string>();
  return ((data || []) as any[]).filter((m: any) => {
    if (seen.has(m.user_id)) return false;
    seen.add(m.user_id);
    return true;
  });
}

/**
 * Get all tasks for a specific project that have due dates in a given range.
 * Includes assignee info for PM view. Used for project-level calendar.
 */
export async function getProjectCalendarTasks(
  projectId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const { data, error } = await (supabase.from("tasks") as any)
    .select(
      `id, title, status, priority, due_date, assignee_id, project_id,
       assignee:users!assignee_id (id, full_name, email)`
    )
    .eq("project_id", projectId)
    .not("due_date", "is", null)
    .gte("due_date", startDate)
    .lte("due_date", endDate)
    .order("due_date", { ascending: true });

  if (error) throw error;
  return (data || []) as any[];
}

/**
 * Get all members of a specific project for calendar member filter.
 */
export async function getProjectMembersForCalendar(projectId: string): Promise<any[]> {
  const { data, error } = await (supabase.from("project_members") as any)
    .select(`user_id, role, custom_role, users (id, full_name, email)`)
    .eq("project_id", projectId);

  if (error) return [];
  return (data || []) as any[];
}

// =====================================================
// CALENDAR SPRINT EVENTS & SPRINTS
// =====================================================

/**
 * Get all sprint events across user's projects for a date range.
 * Used by the global calendar to show meetings, standups, etc.
 */
export async function getCalendarSprintEvents(
  userId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  // Get projects this user belongs to
  const { data: memberRows } = await (supabase.from("project_members") as any)
    .select("project_id")
    .eq("user_id", userId);

  const projectIds = ((memberRows || []) as any[]).map((m: any) => m.project_id);
  if (projectIds.length === 0) return [];

  // Get sprints in those projects
  const { data: sprints } = await (supabase.from("sprints") as any)
    .select("id")
    .in("project_id", projectIds);

  const sprintIds = ((sprints || []) as any[]).map((s: any) => s.id);
  if (sprintIds.length === 0) return [];

  // Get sprint events in date range
  const { data, error } = await (supabase.from("sprint_events") as any)
    .select(
      `*,
       created_by_user:users!created_by(id, full_name, email),
       sprints!inner(id, name, project_id, projects(id, name))`
    )
    .in("sprint_id", sprintIds)
    .gte("event_date", startDate)
    .lte("event_date", endDate)
    .order("event_date", { ascending: true });

  if (error) {
    console.error("Error fetching calendar sprint events:", error);
    return [];
  }
  return (data || []) as any[];
}

/**
 * Get all sprints (with date ranges) for user's projects.
 * Used to highlight sprint periods on the calendar.
 */
export async function getCalendarSprints(
  userId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const { data: memberRows } = await (supabase.from("project_members") as any)
    .select("project_id")
    .eq("user_id", userId);

  const projectIds = ((memberRows || []) as any[]).map((m: any) => m.project_id);
  if (projectIds.length === 0) return [];

  const { data, error } = await (supabase.from("sprints") as any)
    .select(`id, name, start_date, end_date, status, project_id, projects(id, name)`)
    .in("project_id", projectIds)
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date", { ascending: true });

  if (error) {
    console.error("Error fetching calendar sprints:", error);
    return [];
  }
  return (data || []) as any[];
}

/**
 * Get sprint events for a specific project in a date range.
 * Used by the project-level calendar.
 */
export async function getProjectCalendarEvents(
  projectId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  // Get sprints for this project
  const { data: sprints } = await (supabase.from("sprints") as any)
    .select("id")
    .eq("project_id", projectId);

  const sprintIds = ((sprints || []) as any[]).map((s: any) => s.id);
  if (sprintIds.length === 0) return [];

  const { data, error } = await (supabase.from("sprint_events") as any)
    .select(
      `*,
       created_by_user:users!created_by(id, full_name, email),
       sprints(id, name)`
    )
    .in("sprint_id", sprintIds)
    .gte("event_date", startDate)
    .lte("event_date", endDate)
    .order("event_date", { ascending: true });

  if (error) return [];
  return (data || []) as any[];
}

/**
 * Get sprints for a specific project overlapping a date range.
 */
export async function getProjectCalendarSprints(
  projectId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const { data, error } = await (supabase.from("sprints") as any)
    .select(`id, name, start_date, end_date, status, project_id`)
    .eq("project_id", projectId)
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date", { ascending: true });

  if (error) return [];
  return (data || []) as any[];
}

/**
 * Get upcoming deadlines (tasks due in next N days) for a user.
 * Used for the reminders/deadline tracking panel.
 */
export async function getUpcomingDeadlines(
  userId: string,
  daysAhead: number = 7
): Promise<any[]> {
  const today = new Date().toISOString().slice(0, 10);
  const futureDate = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);

  const { data, error } = await (supabase.from("tasks") as any)
    .select(
      `id, title, status, priority, due_date, assignee_id, project_id,
       projects (id, name)`
    )
    .eq("assignee_id", userId)
    .not("due_date", "is", null)
    .neq("status", "done")
    .gte("due_date", today)
    .lte("due_date", futureDate)
    .order("due_date", { ascending: true });

  if (error) return [];
  return (data || []) as any[];
}

/**
 * Get overdue tasks for a user (due_date < today, not done).
 */
export async function getOverdueTasks(userId: string): Promise<any[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await (supabase.from("tasks") as any)
    .select(
      `id, title, status, priority, due_date, assignee_id, project_id,
       projects (id, name)`
    )
    .eq("assignee_id", userId)
    .not("due_date", "is", null)
    .neq("status", "done")
    .lt("due_date", today)
    .order("due_date", { ascending: true });

  if (error) return [];
  return (data || []) as any[];
}

/**
 * Get upcoming sprint events for a user (next N days).
 */
export async function getUpcomingSprintEvents(
  userId: string,
  daysAhead: number = 7
): Promise<any[]> {
  const today = new Date().toISOString().slice(0, 10);
  const futureDate = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);

  const { data: memberRows } = await (supabase.from("project_members") as any)
    .select("project_id")
    .eq("user_id", userId);

  const projectIds = ((memberRows || []) as any[]).map((m: any) => m.project_id);
  if (projectIds.length === 0) return [];

  const { data: sprints } = await (supabase.from("sprints") as any)
    .select("id")
    .in("project_id", projectIds);

  const sprintIds = ((sprints || []) as any[]).map((s: any) => s.id);
  if (sprintIds.length === 0) return [];

  const { data, error } = await (supabase.from("sprint_events") as any)
    .select(
      `*,
       sprints(id, name, project_id, projects(id, name))`
    )
    .in("sprint_id", sprintIds)
    .gte("event_date", today)
    .lte("event_date", futureDate)
    .order("event_date", { ascending: true });

  if (error) return [];
  return (data || []) as any[];
}
