import { supabase } from "../supabase";

// =====================================================
// Project Update Operations
// =====================================================

/**
 * Update project details (name, description, status, dates, visibility)
 * Caller must be project owner or lead (enforced via RLS or checked in UI)
 */
export async function updateProjectDetails(
  projectId: string,
  data: {
    name?: string;
    description?: string;
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
  }
) {
  // Filter out undefined values
  const updateData: Record<string, any> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.start_date !== undefined) updateData.start_date = data.start_date;
  if (data.end_date !== undefined) updateData.end_date = data.end_date;

  if (Object.keys(updateData).length === 0) {
    throw new Error("No fields to update");
  }

  updateData.updated_at = new Date().toISOString();

  const { data: project, error } = await (supabase as any)
    .from("projects")
    .update(updateData)
    .eq("id", projectId)
    .select()
    .single();

  if (error) throw error;
  return project;
}

/**
 * Remove a member from a project
 */
export async function removeProjectMember(memberId: string) {
  const { error } = await (supabase as any)
    .from("project_members")
    .delete()
    .eq("id", memberId);

  if (error) throw error;
}

/**
 * Add an org member to a project
 */
export async function addMemberToProject(
  projectId: string,
  userId: string,
  role: string = "contributor",
  customRole?: string
) {
  const { data, error } = await (supabase as any)
    .from("project_members")
    .insert({
      project_id: projectId,
      user_id: userId,
      role,
      custom_role: customRole || null,
    })
    .select("*, users(id, email, full_name, avatar_url)")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a project permanently
 */
export async function deleteProject(projectId: string) {
  const { error } = await (supabase as any)
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (error) throw error;
}

/**
 * Transfer project ownership to another member.
 * Demotes current owner to "lead", promotes new member to "owner".
 */
export async function transferProjectOwnership(
  currentOwnerMemberId: string,
  newOwnerMemberId: string
) {
  const { error: demoteError } = await (supabase as any)
    .from("project_members")
    .update({ role: "lead" })
    .eq("id", currentOwnerMemberId);

  if (demoteError) throw demoteError;

  const { error: promoteError } = await (supabase as any)
    .from("project_members")
    .update({ role: "owner" })
    .eq("id", newOwnerMemberId);

  if (promoteError) throw promoteError;
}
