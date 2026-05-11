-- =====================================================
-- Workflow360 Complete Database Schema
-- Version: 2.0.0
-- Run this single migration file to set up the entire database
-- Includes: Core, Communication Hub, Invite Codes, Project Templates, File Management, Internal Mail, Notifications
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- ENUM TYPES
-- =====================================================
DO $$ BEGIN
    CREATE TYPE member_role AS ENUM ('admin', 'manager', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE project_role AS ENUM ('owner', 'lead', 'contributor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'review', 'done', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE sprint_status AS ENUM ('planned', 'active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE decomposition_status AS ENUM ('none','suggested','partially_accepted','fully_accepted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE skill_level AS ENUM ('beginner','intermediate','expert');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE decomposition_review_status AS ENUM ('pending','accepted','partially_accepted','rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE risk_level AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);

-- =====================================================
-- ORGANIZATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    invite_code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organizations_owner_id_idx ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS organizations_invite_code_idx ON public.organizations(invite_code);

-- =====================================================
-- ORGANIZATION MEMBERS TABLE
-- NOTE: Column is "org_id" (not "organization_id")
-- =====================================================
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role member_role NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_members_org_id_idx ON public.organization_members(org_id);
CREATE INDEX IF NOT EXISTS organization_members_user_id_idx ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS organization_members_role_idx ON public.organization_members(role);

-- =====================================================
-- ORGANIZATION JOIN REQUESTS TABLE
-- Pending membership requests submitted via invite code.
-- Admins/managers approve or reject before the user
-- becomes a full member.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.organization_join_requests (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID        NOT NULL REFERENCES public.organizations(id)  ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES public.users(id)          ON DELETE CASCADE,
    status       TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at  TIMESTAMPTZ,
    reviewed_by  UUID        REFERENCES public.users(id),
    UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_join_requests_org_id_idx    ON public.organization_join_requests(org_id);
CREATE INDEX IF NOT EXISTS org_join_requests_user_id_idx   ON public.organization_join_requests(user_id);
CREATE INDEX IF NOT EXISTS org_join_requests_status_idx    ON public.organization_join_requests(status);

ALTER TABLE public.organization_join_requests ENABLE ROW LEVEL SECURITY;

-- Requester can see their own requests
CREATE POLICY "Users can view their own join requests"
    ON public.organization_join_requests FOR SELECT
    USING (user_id = auth.uid());

-- Org admins/managers can see requests for their org
CREATE POLICY "Org admins can view join requests"
    ON public.organization_join_requests FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM public.organization_members
            WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- Authenticated users can insert their own join requests
CREATE POLICY "Users can insert their own join requests"
    ON public.organization_join_requests FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- =====================================================
-- PROJECTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status project_status NOT NULL DEFAULT 'planning',
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_org_id_idx ON public.projects(org_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON public.projects(status);
CREATE INDEX IF NOT EXISTS projects_created_by_idx ON public.projects(created_by);

-- =====================================================
-- PROJECT CUSTOM ROLES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.project_custom_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS project_custom_roles_project_id_idx ON public.project_custom_roles(project_id);

-- =====================================================
-- PROJECT MEMBERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role project_role NOT NULL DEFAULT 'contributor',
    custom_role TEXT,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_members_project_id_idx ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS project_members_user_id_idx ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS project_members_role_idx ON public.project_members(role);
CREATE INDEX IF NOT EXISTS project_members_custom_role_idx ON public.project_members(custom_role);

-- =====================================================
-- SPRINTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    goal TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status sprint_status NOT NULL DEFAULT 'planned',
    velocity NUMERIC(5,1),
    capacity NUMERIC(5,1),
    ai_risk_score NUMERIC(3,2),
    ai_risk_factors JSONB,
    ai_analyzed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_date_range CHECK (end_date > start_date),
    CONSTRAINT sprints_ai_risk_score_range CHECK (ai_risk_score IS NULL OR (ai_risk_score >= 0.00 AND ai_risk_score <= 1.00))
);

CREATE INDEX IF NOT EXISTS sprints_project_id_idx ON public.sprints(project_id);
CREATE INDEX IF NOT EXISTS sprints_status_idx ON public.sprints(status);
CREATE INDEX IF NOT EXISTS sprints_dates_idx ON public.sprints(start_date, end_date);

-- =====================================================
-- TASKS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    sprint_id UUID REFERENCES public.sprints(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'todo',
    priority task_priority NOT NULL DEFAULT 'medium',
    assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    story_points SMALLINT,
    estimated_days NUMERIC(4,1),
    actual_days NUMERIC(4,1),
    tags TEXT[] DEFAULT '{}',
    complexity_score NUMERIC(3,2),
    ai_suggested_assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ai_assignee_confidence NUMERIC(3,2),
    parent_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    decomposition_status decomposition_status DEFAULT 'none',
    CONSTRAINT tasks_story_points_fibonacci CHECK (story_points IS NULL OR story_points IN (1,2,3,5,8,13)),
    CONSTRAINT tasks_complexity_score_range CHECK (complexity_score IS NULL OR (complexity_score >= 0.00 AND complexity_score <= 1.00)),
    CONSTRAINT tasks_ai_assignee_confidence_range CHECK (ai_assignee_confidence IS NULL OR (ai_assignee_confidence >= 0.00 AND ai_assignee_confidence <= 1.00))
);

CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS tasks_sprint_id_idx ON public.tasks(sprint_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);
CREATE INDEX IF NOT EXISTS tasks_priority_idx ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS tasks_assignee_id_idx ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS tasks_created_by_idx ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS tasks_parent_task_id_idx ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS tasks_assignee_status_idx ON public.tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS tasks_sprint_status_idx ON public.tasks(sprint_id, status);

-- =====================================================
-- USER SKILLS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    skill TEXT NOT NULL,
    level skill_level NOT NULL DEFAULT 'intermediate',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT user_skills_unique UNIQUE (user_id, skill)
);

CREATE INDEX IF NOT EXISTS user_skills_user_id_idx ON public.user_skills(user_id);
CREATE INDEX IF NOT EXISTS user_skills_skill_idx ON public.user_skills(skill);

ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own skills"
    ON public.user_skills FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Project members can view teammate skills"
    ON public.user_skills FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.project_members pm1
            JOIN public.project_members pm2 ON pm1.project_id = pm2.project_id
            WHERE pm1.user_id = auth.uid()
              AND pm2.user_id = user_skills.user_id
        )
    );

-- =====================================================
-- AI TASK DECOMPOSITIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ai_task_decompositions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    suggested_subtasks JSONB NOT NULL,
    model_version TEXT NOT NULL,
    confidence_score NUMERIC(3,2),
    status decomposition_review_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT ai_decompositions_confidence_range CHECK (confidence_score IS NULL OR (confidence_score >= 0.00 AND confidence_score <= 1.00))
);

CREATE INDEX IF NOT EXISTS ai_decompositions_parent_task_idx ON public.ai_task_decompositions(parent_task_id);

ALTER TABLE public.ai_task_decompositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view decompositions"
    ON public.ai_task_decompositions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.project_members pm ON pm.project_id = t.project_id
            WHERE t.id = ai_task_decompositions.parent_task_id
              AND pm.user_id = auth.uid()
        )
    );

CREATE POLICY "Project leads can manage decompositions"
    ON public.ai_task_decompositions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.project_members pm ON pm.project_id = t.project_id
            WHERE t.id = ai_task_decompositions.parent_task_id
              AND pm.user_id = auth.uid()
              AND pm.role IN ('owner', 'lead')
        )
    );

-- =====================================================
-- AI ASSIGNMENT LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ai_assignment_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    suggested_assignee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    confidence_score NUMERIC(3,2),
    scoring_breakdown JSONB,
    was_accepted BOOLEAN,
    final_assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    model_version TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT ai_assignment_confidence_range CHECK (confidence_score IS NULL OR (confidence_score >= 0.00 AND confidence_score <= 1.00))
);

CREATE INDEX IF NOT EXISTS ai_assignment_task_id_idx ON public.ai_assignment_logs(task_id);

ALTER TABLE public.ai_assignment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view assignment logs"
    ON public.ai_assignment_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.project_members pm ON pm.project_id = t.project_id
            WHERE t.id = ai_assignment_logs.task_id
              AND pm.user_id = auth.uid()
        )
    );

CREATE POLICY "Project leads can manage assignment logs"
    ON public.ai_assignment_logs FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.project_members pm ON pm.project_id = t.project_id
            WHERE t.id = ai_assignment_logs.task_id
              AND pm.user_id = auth.uid()
              AND pm.role IN ('owner', 'lead')
        )
    );

-- =====================================================
-- AI BOTTLENECK REPORTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ai_bottleneck_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sprint_id UUID NOT NULL REFERENCES public.sprints(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    risk_level risk_level NOT NULL,
    risk_score NUMERIC(3,2),
    bottlenecks JSONB NOT NULL,
    recommendations JSONB,
    model_version TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT ai_bottleneck_risk_score_range CHECK (risk_score IS NULL OR (risk_score >= 0.00 AND risk_score <= 1.00))
);

CREATE INDEX IF NOT EXISTS ai_bottleneck_sprint_id_idx ON public.ai_bottleneck_reports(sprint_id);
CREATE INDEX IF NOT EXISTS ai_bottleneck_project_id_idx ON public.ai_bottleneck_reports(project_id);

ALTER TABLE public.ai_bottleneck_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view bottleneck reports"
    ON public.ai_bottleneck_reports FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = ai_bottleneck_reports.project_id
              AND pm.user_id = auth.uid()
        )
    );

CREATE POLICY "Project leads can manage bottleneck reports"
    ON public.ai_bottleneck_reports FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = ai_bottleneck_reports.project_id
              AND pm.user_id = auth.uid()
              AND pm.role IN ('owner', 'lead')
        )
    );

-- =====================================================
-- SPRINT EVENTS TABLE (for meetings, milestones, etc.)
-- =====================================================
DO $$ BEGIN
    CREATE TYPE sprint_event_type AS ENUM ('planning', 'daily_standup', 'review', 'retrospective', 'meeting', 'milestone', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.sprint_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sprint_id UUID NOT NULL REFERENCES public.sprints(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    event_type sprint_event_type NOT NULL DEFAULT 'meeting',
    event_date TIMESTAMPTZ NOT NULL,
    start_time TIME,
    end_time TIME,
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sprint_events_sprint_id_idx ON public.sprint_events(sprint_id);
CREATE INDEX IF NOT EXISTS sprint_events_event_date_idx ON public.sprint_events(event_date);

-- =====================================================
-- NOTIFICATIONS TABLE (legacy enum kept for backward compat, new table below in NOTIFICATION CENTRE section)
-- =====================================================
DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM ('info', 'success', 'warning', 'error', 'event');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- NOTE: notifications table is now defined in the NOTIFICATION CENTRE section below
-- with expanded columns (organization_id, metadata, is_read, etc.)

-- =====================================================
-- ORGANIZATION INVITE CODES TABLE (advanced multi-code system)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.organization_invite_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES public.users(id),
    default_role TEXT NOT NULL DEFAULT 'member' CHECK (default_role IN ('manager', 'member')),
    max_uses INT,
    use_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON public.organization_invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_org ON public.organization_invite_codes(organization_id);

-- =====================================================
-- =====================================================
-- COMMUNICATION HUB: ENUM TYPES
-- =====================================================
DO $$ BEGIN
    CREATE TYPE channel_type AS ENUM ('public', 'private', 'announcement');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE channel_member_role AS ENUM ('admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE message_type AS ENUM ('text', 'system', 'task_ref', 'file');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE dm_message_type AS ENUM ('text', 'file', 'task_ref');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- CHANNELS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    type channel_type NOT NULL DEFAULT 'public',
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
);

-- Org-level channels (no project): unique name per org
CREATE UNIQUE INDEX IF NOT EXISTS channels_org_name_unique ON public.channels(organization_id, name) WHERE project_id IS NULL;
-- Project-level channels: unique name per project
CREATE UNIQUE INDEX IF NOT EXISTS channels_project_name_unique ON public.channels(project_id, name) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS channels_org_id_idx ON public.channels(organization_id);
CREATE INDEX IF NOT EXISTS channels_project_id_idx ON public.channels(project_id);
CREATE INDEX IF NOT EXISTS channels_type_idx ON public.channels(type);
CREATE INDEX IF NOT EXISTS channels_created_by_idx ON public.channels(created_by);

-- =====================================================
-- CHANNEL MEMBERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.channel_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role channel_member_role NOT NULL DEFAULT 'member',
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    is_muted BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS channel_members_channel_id_idx ON public.channel_members(channel_id);
CREATE INDEX IF NOT EXISTS channel_members_user_id_idx ON public.channel_members(user_id);

-- =====================================================
-- MESSAGES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type message_type NOT NULL DEFAULT 'text',
    metadata JSONB,
    parent_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    reply_count INTEGER DEFAULT 0,
    is_edited BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_channel_id_created_at_idx ON public.messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS messages_parent_message_id_idx ON public.messages(parent_message_id);

-- =====================================================
-- MESSAGE REACTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS message_reactions_message_id_idx ON public.message_reactions(message_id);

-- =====================================================
-- DIRECT MESSAGE THREADS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.direct_message_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dm_threads_org_id_idx ON public.direct_message_threads(organization_id);

-- =====================================================
-- DIRECT MESSAGE PARTICIPANTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.direct_message_participants (
    thread_id UUID NOT NULL REFERENCES public.direct_message_threads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS dm_participants_user_id_idx ON public.direct_message_participants(user_id);

-- =====================================================
-- DIRECT MESSAGES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.direct_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES public.direct_message_threads(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type dm_message_type NOT NULL DEFAULT 'text',
    metadata JSONB,
    is_edited BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dm_thread_id_created_at_idx ON public.direct_messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dm_sender_id_idx ON public.direct_messages(sender_id);

-- =====================================================
-- FILE & DOCUMENT MANAGEMENT
-- =====================================================

-- File Folders
CREATE TABLE IF NOT EXISTS public.file_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    parent_folder_id UUID REFERENCES public.file_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    position INT NOT NULL DEFAULT 0,
    color TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Files
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES public.file_folders(id) ON DELETE SET NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    description TEXT,
    version INT NOT NULL DEFAULT 1,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- File Versions
CREATE TABLE IF NOT EXISTS public.file_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    storage_path TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- File Shares
CREATE TABLE IF NOT EXISTS public.file_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    shared_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    share_type TEXT NOT NULL CHECK (share_type IN ('org', 'project', 'member')),
    shared_with_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'download', 'edit')),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- File Stars
CREATE TABLE IF NOT EXISTS public.file_stars (
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (file_id, user_id)
);

-- File Management Indexes
CREATE INDEX IF NOT EXISTS idx_files_org_project_folder ON public.files (organization_id, project_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON public.files (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_file_shares_file_id ON public.file_shares (file_id);
CREATE INDEX IF NOT EXISTS idx_file_folders_org_project_parent ON public.file_folders (organization_id, project_id, parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_file_versions_file_id ON public.file_versions (file_id);
CREATE INDEX IF NOT EXISTS idx_file_stars_user_id ON public.file_stars (user_id);
CREATE INDEX IF NOT EXISTS idx_files_task_id ON public.files (task_id) WHERE task_id IS NOT NULL;

-- =====================================================
-- INTERNAL MAIL SYSTEM
-- =====================================================

-- Mail Messages
CREATE TABLE IF NOT EXISTS public.mail_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'announcement', 'newsletter')),
    is_draft BOOLEAN NOT NULL DEFAULT FALSE,
    is_sender_trashed BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mail Recipients
CREATE TABLE IF NOT EXISTS public.mail_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mail_id UUID NOT NULL REFERENCES public.mail_messages(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    recipient_type TEXT NOT NULL DEFAULT 'to' CHECK (recipient_type IN ('to', 'cc')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    is_starred BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    folder TEXT NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox', 'archived', 'trash')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mail Attachments
CREATE TABLE IF NOT EXISTS public.mail_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mail_id UUID NOT NULL REFERENCES public.mail_messages(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- NOTIFICATION CENTRE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'task_assigned', 'task_status_changed', 'mentioned',
        'sprint_deadline', 'mail_received', 'member_joined',
        'project_invite', 'comment', 'file_shared'
    )),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    link TEXT,
    metadata JSONB,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Internal Mail & Notification Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_recipients_user_read_folder ON public.mail_recipients (recipient_id, is_read, folder);
CREATE INDEX IF NOT EXISTS idx_mail_messages_org_sender_sent ON public.mail_messages (organization_id, sender_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_recipients_mail_id ON public.mail_recipients (mail_id);
CREATE INDEX IF NOT EXISTS idx_mail_attachments_mail_id ON public.mail_attachments (mail_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org_id ON public.notifications (organization_id);

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sprints_updated_at ON public.sprints;
CREATE TRIGGER update_sprints_updated_at BEFORE UPDATE ON public.sprints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sprint_events_updated_at ON public.sprint_events;
CREATE TRIGGER update_sprint_events_updated_at BEFORE UPDATE ON public.sprint_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TRIGGER FOR TASK COMPLETION
-- =====================================================
CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
        NEW.completed_at = NOW();
    ELSIF NEW.status != 'done' THEN
        NEW.completed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_completion_trigger ON public.tasks;
CREATE TRIGGER task_completion_trigger BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION set_task_completed_at();

-- =====================================================
-- COMMUNICATION HUB TRIGGERS
-- =====================================================
DROP TRIGGER IF EXISTS update_channels_updated_at ON public.channels;
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON public.channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_messages_updated_at ON public.messages;
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_direct_messages_updated_at ON public.direct_messages;
CREATE TRIGGER update_direct_messages_updated_at BEFORE UPDATE ON public.direct_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mail_messages_updated_at BEFORE UPDATE ON public.mail_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Reply count auto-increment
CREATE OR REPLACE FUNCTION public.increment_reply_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.parent_message_id IS NOT NULL THEN
        UPDATE public.messages
        SET reply_count = reply_count + 1
        WHERE id = NEW.parent_message_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS increment_message_reply_count ON public.messages;
CREATE TRIGGER increment_message_reply_count
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.increment_reply_count();

-- Reply count auto-decrement
CREATE OR REPLACE FUNCTION public.decrement_reply_count()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.parent_message_id IS NOT NULL THEN
        UPDATE public.messages
        SET reply_count = GREATEST(reply_count - 1, 0)
        WHERE id = OLD.parent_message_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS decrement_message_reply_count ON public.messages;
CREATE TRIGGER decrement_message_reply_count
    AFTER DELETE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.decrement_reply_count();

-- =====================================================
-- ENABLE ROW LEVEL SECURITY (all tables)
-- =====================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprint_events ENABLE ROW LEVEL SECURITY;
-- notifications RLS enabled in NOTIFICATION CENTRE section below
ALTER TABLE public.organization_invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_message_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_stars ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECURITY DEFINER HELPER FUNCTIONS
-- All use org_id (the actual column name in organization_members)
-- =====================================================

-- Check if user is member of an organization
CREATE OR REPLACE FUNCTION public.user_is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE org_id = p_org_id AND user_id = auth.uid()
    );
$$;

-- Alias for project operations
CREATE OR REPLACE FUNCTION public.user_is_org_member_for_project(p_org_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE org_id = p_org_id AND user_id = auth.uid()
    );
$$;

-- Check if user is an org admin or manager
CREATE OR REPLACE FUNCTION public.user_is_org_admin_or_manager(p_org_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE org_id = p_org_id AND user_id = auth.uid()
        AND role IN ('admin', 'manager')
    );
$$;

-- Check if user is member of a project
CREATE OR REPLACE FUNCTION public.user_is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = p_project_id AND user_id = auth.uid()
    );
$$;

-- Check if user is a project contributor or above
CREATE OR REPLACE FUNCTION public.user_is_project_contributor(p_project_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = p_project_id AND user_id = auth.uid()
        AND role IN ('owner', 'lead', 'contributor')
    );
$$;

-- Check if user is a member of a channel
CREATE OR REPLACE FUNCTION public.user_is_channel_member(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.channel_members
        WHERE channel_id = p_channel_id AND user_id = auth.uid()
    );
$$;

-- Check if user can access a channel (member OR public channel in their org)
CREATE OR REPLACE FUNCTION public.user_can_access_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.channel_members
        WHERE channel_id = p_channel_id AND user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.channels c
        JOIN public.organization_members om ON om.org_id = c.organization_id
        WHERE c.id = p_channel_id
        AND c.type = 'public'
        AND om.user_id = auth.uid()
        AND c.is_archived = false
    );
$$;

-- Check if user is a DM thread participant
CREATE OR REPLACE FUNCTION public.user_is_dm_participant(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.direct_message_participants
        WHERE thread_id = p_thread_id AND user_id = auth.uid()
    );
$$;

-- Helper: get organization_id from a file (bypasses RLS to avoid circular refs)
CREATE OR REPLACE FUNCTION public.file_org_id(p_file_id uuid)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT organization_id FROM public.files WHERE id = p_file_id;
$$;

-- Helper: get project_id from a file (bypasses RLS to avoid circular refs)
CREATE OR REPLACE FUNCTION public.file_project_id(p_file_id uuid)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT project_id FROM public.files WHERE id = p_file_id;
$$;

-- =====================================================
-- RLS POLICIES: USERS
-- =====================================================
DROP POLICY IF EXISTS "users_view_all" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;

CREATE POLICY "users_view_all"
    ON public.users FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "users_insert_own"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_own"
    ON public.users FOR UPDATE
    TO authenticated
    USING (id = auth.uid());

-- =====================================================
-- RLS POLICIES: ORGANIZATIONS
-- =====================================================
DROP POLICY IF EXISTS "Users can view organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Org owners can update" ON public.organizations;
DROP POLICY IF EXISTS "Org owners can delete" ON public.organizations;

CREATE POLICY "Users can view organizations"
    ON public.organizations FOR SELECT
    TO authenticated
    USING (
        owner_id = auth.uid()
        OR id IN (
            SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create organizations"
    ON public.organizations FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Org owners can update"
    ON public.organizations FOR UPDATE
    TO authenticated
    USING (owner_id = auth.uid());

CREATE POLICY "Org owners can delete"
    ON public.organizations FOR DELETE
    TO authenticated
    USING (owner_id = auth.uid());

-- =====================================================
-- RLS POLICIES: ORGANIZATION MEMBERS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own org memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Users can view org members" ON public.organization_members;
DROP POLICY IF EXISTS "Users can join or owners can add members" ON public.organization_members;
DROP POLICY IF EXISTS "Org owners can update members" ON public.organization_members;
DROP POLICY IF EXISTS "Org owners can remove members" ON public.organization_members;

CREATE POLICY "Users can view own org memberships"
    ON public.organization_members FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can view org members"
    ON public.organization_members FOR SELECT
    TO authenticated
    USING (public.user_is_org_member(org_id));

CREATE POLICY "Users can join or owners can add members"
    ON public.organization_members FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.organizations
            WHERE id = org_id AND owner_id = auth.uid()
        )
    );

CREATE POLICY "Org owners can update members"
    ON public.organization_members FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.organizations
            WHERE id = org_id AND owner_id = auth.uid()
        )
    );

CREATE POLICY "Org owners can remove members"
    ON public.organization_members FOR DELETE
    TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.organizations
            WHERE id = org_id AND owner_id = auth.uid()
        )
    );

-- =====================================================
-- RLS POLICIES: PROJECTS
-- =====================================================
DROP POLICY IF EXISTS "Users can view organization projects" ON public.projects;
DROP POLICY IF EXISTS "Org members can create projects" ON public.projects;
DROP POLICY IF EXISTS "Project creators can update" ON public.projects;
DROP POLICY IF EXISTS "Project creators can delete" ON public.projects;
DROP POLICY IF EXISTS "Project managers can delete" ON public.projects;

CREATE POLICY "Users can view organization projects"
    ON public.projects FOR SELECT
    TO authenticated
    USING (public.user_is_org_member_for_project(org_id));

CREATE POLICY "Org members can create projects"
    ON public.projects FOR INSERT
    TO authenticated
    WITH CHECK (
        public.user_is_org_member_for_project(org_id)
        AND created_by = auth.uid()
    );

CREATE POLICY "Project creators can update"
    ON public.projects FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "Project managers can delete"
    ON public.projects FOR DELETE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_members.project_id = projects.id
              AND project_members.user_id = auth.uid()
              AND project_members.role IN ('owner', 'lead')
        )
    );

-- =====================================================
-- RLS POLICIES: PROJECT MEMBERS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own project memberships" ON public.project_members;
DROP POLICY IF EXISTS "Users can view project members" ON public.project_members;
DROP POLICY IF EXISTS "Project creators can add members" ON public.project_members;
DROP POLICY IF EXISTS "Project creators can update members" ON public.project_members;
DROP POLICY IF EXISTS "Project creators can remove members" ON public.project_members;

CREATE POLICY "Users can view own project memberships"
    ON public.project_members FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can view project members"
    ON public.project_members FOR SELECT
    TO authenticated
    USING (public.user_is_project_member(project_id));

CREATE POLICY "Project creators can add members"
    ON public.project_members FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE id = project_id AND created_by = auth.uid()
        )
        OR user_id = auth.uid()
    );

CREATE POLICY "Project creators can update members"
    ON public.project_members FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE id = project_id AND created_by = auth.uid()
        )
    );

CREATE POLICY "Project creators can remove members"
    ON public.project_members FOR DELETE
    TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.projects
            WHERE id = project_id AND created_by = auth.uid()
        )
    );

-- =====================================================
-- RLS POLICIES: PROJECT CUSTOM ROLES
-- =====================================================
DROP POLICY IF EXISTS "Users can view project custom roles" ON public.project_custom_roles;
DROP POLICY IF EXISTS "Project creators can manage custom roles" ON public.project_custom_roles;

CREATE POLICY "Users can view project custom roles"
    ON public.project_custom_roles FOR SELECT
    TO authenticated
    USING (public.user_is_project_member(project_id));

CREATE POLICY "Project creators can manage custom roles"
    ON public.project_custom_roles FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE id = project_id AND created_by = auth.uid()
        )
    );

-- =====================================================
-- RLS POLICIES: TASKS
-- =====================================================
DROP POLICY IF EXISTS "Users can view project tasks" ON public.tasks;
DROP POLICY IF EXISTS "Project members can create tasks" ON public.tasks;
DROP POLICY IF EXISTS "Project members can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Task creators can delete tasks" ON public.tasks;

CREATE POLICY "Users can view project tasks"
    ON public.tasks FOR SELECT
    TO authenticated
    USING (public.user_is_project_member(project_id));

CREATE POLICY "Project members can create tasks"
    ON public.tasks FOR INSERT
    TO authenticated
    WITH CHECK (public.user_is_project_member(project_id));

CREATE POLICY "Project members can update tasks"
    ON public.tasks FOR UPDATE
    TO authenticated
    USING (public.user_is_project_member(project_id));

CREATE POLICY "Task creators can delete tasks"
    ON public.tasks FOR DELETE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_id = tasks.project_id
            AND user_id = auth.uid()
            AND role IN ('owner', 'lead')
        )
    );

-- =====================================================
-- RLS POLICIES: SPRINTS
-- =====================================================
DROP POLICY IF EXISTS "Users can view project sprints" ON public.sprints;
DROP POLICY IF EXISTS "Project leads can create sprints" ON public.sprints;
DROP POLICY IF EXISTS "Project leads can update sprints" ON public.sprints;
DROP POLICY IF EXISTS "Project leads can delete sprints" ON public.sprints;

CREATE POLICY "Users can view project sprints"
    ON public.sprints FOR SELECT
    TO authenticated
    USING (public.user_is_project_member(project_id));

CREATE POLICY "Project leads can create sprints"
    ON public.sprints FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_id = sprints.project_id
            AND user_id = auth.uid()
            AND role IN ('owner', 'lead')
        )
    );

CREATE POLICY "Project leads can update sprints"
    ON public.sprints FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_id = sprints.project_id
            AND user_id = auth.uid()
            AND role IN ('owner', 'lead')
        )
    );

CREATE POLICY "Project leads can delete sprints"
    ON public.sprints FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_id = sprints.project_id
            AND user_id = auth.uid()
            AND role IN ('owner', 'lead')
        )
    );

-- =====================================================
-- RLS POLICIES: SPRINT EVENTS
-- =====================================================
DROP POLICY IF EXISTS "Users can view sprint events" ON public.sprint_events;
DROP POLICY IF EXISTS "Project leads can manage sprint events" ON public.sprint_events;

CREATE POLICY "Users can view sprint events"
    ON public.sprint_events FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.sprints s
            JOIN public.project_members pm ON pm.project_id = s.project_id
            WHERE s.id = sprint_events.sprint_id
            AND pm.user_id = auth.uid()
        )
    );

CREATE POLICY "Project leads can manage sprint events"
    ON public.sprint_events FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.sprints s
            JOIN public.project_members pm ON pm.project_id = s.project_id
            WHERE s.id = sprint_events.sprint_id
            AND pm.user_id = auth.uid()
            AND pm.role IN ('owner', 'lead')
        )
    );

-- (Old notifications RLS policies removed — see NOTIFICATION CENTRE RLS section below)

-- =====================================================
-- RLS POLICIES: ORGANIZATION INVITE CODES
-- Uses org_id column via join to organizations
-- =====================================================
CREATE POLICY "Org admins/managers can view invite codes"
    ON public.organization_invite_codes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_members.org_id = organization_invite_codes.organization_id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Org admins/managers can create invite codes"
    ON public.organization_invite_codes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_members.org_id = organization_invite_codes.organization_id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Org admins/managers can update invite codes"
    ON public.organization_invite_codes FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_members.org_id = organization_invite_codes.organization_id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role IN ('admin', 'manager')
        )
    );

-- =====================================================
-- =====================================================
-- RLS POLICIES: CHANNELS
-- =====================================================
DROP POLICY IF EXISTS "Users can view channels in their org" ON public.channels;
DROP POLICY IF EXISTS "Org members can create channels" ON public.channels;
DROP POLICY IF EXISTS "Channel creators can update channels" ON public.channels;
DROP POLICY IF EXISTS "Channel creators can delete channels" ON public.channels;

CREATE POLICY "Users can view channels in their org"
    ON public.channels FOR SELECT
    TO authenticated
    USING (
        created_by = auth.uid()
        OR (type IN ('public', 'announcement') AND public.user_is_org_member(organization_id))
        OR public.user_is_channel_member(id)
    );

CREATE POLICY "Org members can create channels"
    ON public.channels FOR INSERT
    TO authenticated
    WITH CHECK (
        public.user_is_org_member(organization_id)
        AND created_by = auth.uid()
    );

CREATE POLICY "Channel creators can update channels"
    ON public.channels FOR UPDATE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE org_id = channels.organization_id
            AND user_id = auth.uid()
            AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Channel creators can delete channels"
    ON public.channels FOR DELETE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE org_id = channels.organization_id
            AND user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- =====================================================
-- RLS POLICIES: CHANNEL MEMBERS
-- =====================================================
DROP POLICY IF EXISTS "Users can view channel members" ON public.channel_members;
DROP POLICY IF EXISTS "Users can join public channels" ON public.channel_members;
DROP POLICY IF EXISTS "Channel admins can add members" ON public.channel_members;
DROP POLICY IF EXISTS "Channel admins can update members" ON public.channel_members;
DROP POLICY IF EXISTS "Users can leave or admins can remove" ON public.channel_members;

CREATE POLICY "Users can view channel members"
    ON public.channel_members FOR SELECT
    TO authenticated
    USING (public.user_can_access_channel(channel_id));

CREATE POLICY "Users can join public channels"
    ON public.channel_members FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.channels c
            JOIN public.organization_members om ON om.org_id = c.organization_id
            WHERE c.id = channel_id
            AND om.user_id = auth.uid()
            AND c.type = 'public'
        )
    );

CREATE POLICY "Channel admins can add members"
    ON public.channel_members FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.channel_members cm
            WHERE cm.channel_id = channel_members.channel_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'admin'
        )
        OR EXISTS (
            SELECT 1 FROM public.channels c
            WHERE c.id = channel_members.channel_id
            AND c.created_by = auth.uid()
        )
    );

CREATE POLICY "Channel admins can update members"
    ON public.channel_members FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.channel_members cm
            WHERE cm.channel_id = channel_members.channel_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'admin'
        )
    );

CREATE POLICY "Users can leave or admins can remove"
    ON public.channel_members FOR DELETE
    TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.channel_members cm
            WHERE cm.channel_id = channel_members.channel_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'admin'
        )
    );

-- =====================================================
-- RLS POLICIES: MESSAGES
-- =====================================================
DROP POLICY IF EXISTS "Users can view messages in accessible channels" ON public.messages;
DROP POLICY IF EXISTS "Channel members can send messages" ON public.messages;
DROP POLICY IF EXISTS "Senders can update own messages" ON public.messages;
DROP POLICY IF EXISTS "Senders can delete own messages" ON public.messages;

CREATE POLICY "Users can view messages in accessible channels"
    ON public.messages FOR SELECT
    TO authenticated
    USING (public.user_can_access_channel(channel_id));

CREATE POLICY "Channel members can send messages"
    ON public.messages FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND public.user_can_access_channel(channel_id)
    );

CREATE POLICY "Senders can update own messages"
    ON public.messages FOR UPDATE
    TO authenticated
    USING (sender_id = auth.uid());

CREATE POLICY "Senders can delete own messages"
    ON public.messages FOR DELETE
    TO authenticated
    USING (sender_id = auth.uid());

-- =====================================================
-- RLS POLICIES: MESSAGE REACTIONS
-- =====================================================
DROP POLICY IF EXISTS "Users can view reactions in accessible channels" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can add reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can remove own reactions" ON public.message_reactions;

CREATE POLICY "Users can view reactions in accessible channels"
    ON public.message_reactions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = message_reactions.message_id
            AND public.user_can_access_channel(m.channel_id)
        )
    );

CREATE POLICY "Users can add reactions"
    ON public.message_reactions FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = message_reactions.message_id
            AND public.user_can_access_channel(m.channel_id)
        )
    );

CREATE POLICY "Users can remove own reactions"
    ON public.message_reactions FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- =====================================================
-- RLS POLICIES: DIRECT MESSAGE THREADS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own DM threads" ON public.direct_message_threads;
DROP POLICY IF EXISTS "Org members can create DM threads" ON public.direct_message_threads;

CREATE POLICY "Users can view own DM threads"
    ON public.direct_message_threads FOR SELECT
    TO authenticated
    USING (public.user_is_dm_participant(id));

CREATE POLICY "Org members can create DM threads"
    ON public.direct_message_threads FOR INSERT
    TO authenticated
    WITH CHECK (public.user_is_org_member(organization_id));

-- =====================================================
-- RLS POLICIES: DIRECT MESSAGE PARTICIPANTS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own DM participants" ON public.direct_message_participants;
DROP POLICY IF EXISTS "Users can add DM participants" ON public.direct_message_participants;
DROP POLICY IF EXISTS "Users can update own DM read status" ON public.direct_message_participants;

CREATE POLICY "Users can view own DM participants"
    ON public.direct_message_participants FOR SELECT
    TO authenticated
    USING (public.user_is_dm_participant(thread_id));

CREATE POLICY "Users can add DM participants"
    ON public.direct_message_participants FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        OR public.user_is_dm_participant(thread_id)
    );

CREATE POLICY "Users can update own DM read status"
    ON public.direct_message_participants FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

-- =====================================================
-- RLS POLICIES: DIRECT MESSAGES
-- =====================================================
DROP POLICY IF EXISTS "Users can view DMs in their threads" ON public.direct_messages;
DROP POLICY IF EXISTS "Participants can send DMs" ON public.direct_messages;
DROP POLICY IF EXISTS "Senders can update own DMs" ON public.direct_messages;
DROP POLICY IF EXISTS "Senders can delete own DMs" ON public.direct_messages;

CREATE POLICY "Users can view DMs in their threads"
    ON public.direct_messages FOR SELECT
    TO authenticated
    USING (public.user_is_dm_participant(thread_id));

CREATE POLICY "Participants can send DMs"
    ON public.direct_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND public.user_is_dm_participant(thread_id)
    );

CREATE POLICY "Senders can update own DMs"
    ON public.direct_messages FOR UPDATE
    TO authenticated
    USING (sender_id = auth.uid());

CREATE POLICY "Senders can delete own DMs"
    ON public.direct_messages FOR DELETE
    TO authenticated
    USING (sender_id = auth.uid());

-- =====================================================
-- RLS POLICIES: FILE FOLDERS
-- =====================================================
CREATE POLICY "View org-level folders" ON public.file_folders FOR SELECT
    USING (project_id IS NULL AND public.user_is_org_member(organization_id));
CREATE POLICY "View project-level folders" ON public.file_folders FOR SELECT
    USING (project_id IS NOT NULL AND public.user_is_project_member(project_id));
CREATE POLICY "Create org-level folders" ON public.file_folders FOR INSERT
    WITH CHECK (project_id IS NULL AND public.user_is_org_admin_or_manager(organization_id));
CREATE POLICY "Create project-level folders" ON public.file_folders FOR INSERT
    WITH CHECK (project_id IS NOT NULL AND public.user_is_project_contributor(project_id));
CREATE POLICY "Update org-level folders" ON public.file_folders FOR UPDATE
    USING (project_id IS NULL AND (created_by = auth.uid() OR public.user_is_org_admin_or_manager(organization_id)));
CREATE POLICY "Update project-level folders" ON public.file_folders FOR UPDATE
    USING (project_id IS NOT NULL AND (created_by = auth.uid() OR public.user_is_project_contributor(project_id)));
CREATE POLICY "Delete org-level folders" ON public.file_folders FOR DELETE
    USING (project_id IS NULL AND (created_by = auth.uid() OR public.user_is_org_admin_or_manager(organization_id)));
CREATE POLICY "Delete project-level folders" ON public.file_folders FOR DELETE
    USING (project_id IS NOT NULL AND (created_by = auth.uid() OR public.user_is_project_contributor(project_id)));

-- =====================================================
-- RLS POLICIES: FILES
-- =====================================================
CREATE POLICY "View org-level files" ON public.files FOR SELECT
    USING (project_id IS NULL AND public.user_is_org_member(organization_id));
CREATE POLICY "View project-level files" ON public.files FOR SELECT
    USING (project_id IS NOT NULL AND public.user_is_project_member(project_id));
CREATE POLICY "View files shared with user" ON public.files FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.file_shares WHERE file_shares.file_id = files.id
        AND file_shares.share_type = 'member' AND file_shares.shared_with_user_id = auth.uid()
        AND (file_shares.expires_at IS NULL OR file_shares.expires_at > now())
    ));
CREATE POLICY "Upload org-level files" ON public.files FOR INSERT
    WITH CHECK (project_id IS NULL AND public.user_is_org_admin_or_manager(organization_id));
CREATE POLICY "Upload project-level files" ON public.files FOR INSERT
    WITH CHECK (project_id IS NOT NULL AND public.user_is_project_contributor(project_id));
CREATE POLICY "Update org-level files" ON public.files FOR UPDATE
    USING (project_id IS NULL AND (uploaded_by = auth.uid() OR public.user_is_org_admin_or_manager(organization_id)));
CREATE POLICY "Update project-level files" ON public.files FOR UPDATE
    USING (project_id IS NOT NULL AND (uploaded_by = auth.uid() OR public.user_is_project_contributor(project_id)));
CREATE POLICY "Delete org-level files" ON public.files FOR DELETE
    USING (project_id IS NULL AND (uploaded_by = auth.uid() OR public.user_is_org_admin_or_manager(organization_id)));
CREATE POLICY "Delete project-level files" ON public.files FOR DELETE
    USING (project_id IS NOT NULL AND (uploaded_by = auth.uid() OR public.user_is_project_contributor(project_id)));

-- Task-attached files
CREATE POLICY "View task-attached files" ON public.files FOR SELECT
    USING (task_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.tasks t
        JOIN public.project_members pm ON pm.project_id = t.project_id AND pm.user_id = auth.uid()
        WHERE t.id = files.task_id
    ));
CREATE POLICY "Upload task-attached files" ON public.files FOR INSERT
    WITH CHECK (task_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.tasks t
        JOIN public.project_members pm ON pm.project_id = t.project_id
            AND pm.user_id = auth.uid()
            AND pm.role IN ('owner', 'lead', 'contributor')
        WHERE t.id = files.task_id
    ));

-- =====================================================
-- RLS POLICIES: FILE VERSIONS
-- =====================================================
CREATE POLICY "View file versions" ON public.file_versions FOR SELECT
    USING (
        public.user_is_org_member(public.file_org_id(file_id))
        OR public.user_is_project_member(public.file_project_id(file_id))
    );
CREATE POLICY "Create file versions" ON public.file_versions FOR INSERT
    WITH CHECK (
        public.user_is_org_member(public.file_org_id(file_id))
    );
CREATE POLICY "Delete file versions" ON public.file_versions FOR DELETE
    USING (
        public.user_is_org_member(public.file_org_id(file_id))
    );

-- =====================================================
-- RLS POLICIES: FILE SHARES
-- =====================================================
CREATE POLICY "View org-wide shares" ON public.file_shares FOR SELECT
    USING (share_type = 'org' AND public.user_is_org_member(public.file_org_id(file_id)));
CREATE POLICY "View project shares" ON public.file_shares FOR SELECT
    USING (share_type = 'project' AND public.user_is_project_member(public.file_project_id(file_id)));
CREATE POLICY "View member shares" ON public.file_shares FOR SELECT
    USING (share_type = 'member' AND (shared_with_user_id = auth.uid() OR shared_by = auth.uid()));
CREATE POLICY "Create file shares" ON public.file_shares FOR INSERT
    WITH CHECK (
        shared_by = auth.uid()
        OR public.user_is_org_admin_or_manager(public.file_org_id(file_id))
    );
CREATE POLICY "Delete file shares" ON public.file_shares FOR DELETE
    USING (
        shared_by = auth.uid()
        OR public.user_is_org_member(public.file_org_id(file_id))
    );

-- =====================================================
-- RLS POLICIES: FILE STARS
-- =====================================================
CREATE POLICY "View own stars" ON public.file_stars FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Create own stars" ON public.file_stars FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own stars" ON public.file_stars FOR DELETE USING (user_id = auth.uid());

-- =====================================================
-- RLS POLICIES: MAIL MESSAGES
-- =====================================================
ALTER TABLE public.mail_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sender can view own messages" ON public.mail_messages FOR SELECT
    USING (sender_id = auth.uid());
CREATE POLICY "Recipients can view received messages" ON public.mail_messages FOR SELECT
    USING (is_draft = FALSE AND EXISTS (
        SELECT 1 FROM public.mail_recipients WHERE mail_recipients.mail_id = mail_messages.id
        AND mail_recipients.recipient_id = auth.uid()
    ));
CREATE POLICY "Org members can view announcements" ON public.mail_messages FOR SELECT
    USING (type = 'announcement' AND is_draft = FALSE AND EXISTS (
        SELECT 1 FROM public.organization_members WHERE org_id = mail_messages.organization_id AND user_id = auth.uid()
    ));
CREATE POLICY "Org members can create messages" ON public.mail_messages FOR INSERT
    WITH CHECK (sender_id = auth.uid() AND EXISTS (
        SELECT 1 FROM public.organization_members WHERE org_id = mail_messages.organization_id AND user_id = auth.uid()
    ));
CREATE POLICY "Sender can update own messages" ON public.mail_messages FOR UPDATE
    USING (sender_id = auth.uid());
CREATE POLICY "Sender can delete own drafts" ON public.mail_messages FOR DELETE
    USING (sender_id = auth.uid() AND is_draft = TRUE);

-- =====================================================
-- RLS POLICIES: MAIL RECIPIENTS
-- =====================================================
ALTER TABLE public.mail_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own recipient rows" ON public.mail_recipients FOR SELECT
    USING (recipient_id = auth.uid());
CREATE POLICY "Mail sender can add recipients" ON public.mail_recipients FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.mail_messages WHERE mail_messages.id = mail_recipients.mail_id AND mail_messages.sender_id = auth.uid()
    ));
CREATE POLICY "Recipients can update own rows" ON public.mail_recipients FOR UPDATE
    USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());
CREATE POLICY "Recipients can delete own rows" ON public.mail_recipients FOR DELETE
    USING (recipient_id = auth.uid());

-- =====================================================
-- RLS POLICIES: MAIL ATTACHMENTS
-- =====================================================
ALTER TABLE public.mail_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View mail attachments" ON public.mail_attachments FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.mail_messages WHERE mail_messages.id = mail_attachments.mail_id
        AND (mail_messages.sender_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.mail_recipients WHERE mail_recipients.mail_id = mail_messages.id AND mail_recipients.recipient_id = auth.uid()
        ))
    ));
CREATE POLICY "Sender can upload attachments" ON public.mail_attachments FOR INSERT
    WITH CHECK (uploaded_by = auth.uid() AND EXISTS (
        SELECT 1 FROM public.mail_messages WHERE mail_messages.id = mail_attachments.mail_id AND mail_messages.sender_id = auth.uid()
    ));
CREATE POLICY "Sender can delete draft attachments" ON public.mail_attachments FOR DELETE
    USING (uploaded_by = auth.uid() AND EXISTS (
        SELECT 1 FROM public.mail_messages WHERE mail_messages.id = mail_attachments.mail_id
        AND mail_messages.sender_id = auth.uid() AND mail_messages.is_draft = TRUE
    ));

-- =====================================================
-- RLS POLICIES: NOTIFICATIONS
-- =====================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT
    USING (user_id = auth.uid());
CREATE POLICY "Authenticated users can create notifications" ON public.notifications FOR INSERT
    TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE
    USING (user_id = auth.uid());
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE
    USING (user_id = auth.uid());

-- =====================================================
-- INVITE CODE FUNCTIONS
-- =====================================================

-- Function to request joining an organization via invite code.
-- Creates a pending request instead of directly adding the user as a member.
-- Admins/managers must approve via review_join_request().
CREATE OR REPLACE FUNCTION public.join_organization_by_invite_code(
    p_invite_code TEXT,
    p_user_id     UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org            RECORD;
    v_already_member BOOLEAN;
    v_existing       RECORD;
BEGIN
    -- Resolve org from invite code (case-insensitive)
    SELECT id, name INTO v_org
    FROM public.organizations
    WHERE UPPER(invite_code) = UPPER(p_invite_code);

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid invite code. Please check and try again.');
    END IF;

    -- Already a member?
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE org_id = v_org.id AND user_id = p_user_id
    ) INTO v_already_member;

    IF v_already_member THEN
        RETURN json_build_object('success', false, 'error', 'You are already a member of this organization.');
    END IF;

    -- Check for an existing request row
    SELECT * INTO v_existing
    FROM public.organization_join_requests
    WHERE org_id = v_org.id AND user_id = p_user_id;

    IF FOUND THEN
        IF v_existing.status = 'approved' THEN
            -- Shouldn't reach here (member row exists), but guard anyway
            RETURN json_build_object('success', false, 'error', 'You are already a member of this organization.');
        ELSE
            -- Pending OR rejected — refresh the request with a new timestamp
            -- so the owner always sees the freshest request
            UPDATE public.organization_join_requests
            SET status       = 'pending',
                requested_at = now(),
                reviewed_at  = NULL,
                reviewed_by  = NULL
            WHERE id = v_existing.id;

            RETURN json_build_object(
                'success',  true,
                'org_id',   v_org.id::text,
                'org_name', v_org.name,
                'status',   'pending'
            );
        END IF;
    END IF;

    -- Insert new request
    INSERT INTO public.organization_join_requests (org_id, user_id)
    VALUES (v_org.id, p_user_id);

    RETURN json_build_object(
        'success',  true,
        'org_id',   v_org.id::text,
        'org_name', v_org.name,
        'status',   'pending'
    );
END;
$$;

-- Function to retrieve pending join requests for an org (admin/manager only).
CREATE OR REPLACE FUNCTION public.get_org_join_requests(p_org_id UUID)
RETURNS TABLE (
    id           UUID,
    user_id      UUID,
    status       TEXT,
    requested_at TIMESTAMPTZ,
    email        TEXT,
    full_name    TEXT,
    avatar_url   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE org_id   = p_org_id
          AND user_id  = auth.uid()
          AND role IN ('admin', 'manager')
    ) THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    RETURN QUERY
    SELECT
        r.id,
        r.user_id,
        r.status,
        r.requested_at,
        u.email,
        u.full_name,
        u.avatar_url
    FROM public.organization_join_requests r
    JOIN public.users u ON u.id = r.user_id
    WHERE r.org_id  = p_org_id
      AND r.status  = 'pending'
    ORDER BY r.requested_at ASC;
END;
$$;

-- Function to approve or reject a pending join request.
-- On approval the user is inserted into organization_members.
CREATE OR REPLACE FUNCTION public.review_join_request(
    p_request_id UUID,
    p_action     TEXT   -- 'approved' | 'rejected'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request   RECORD;
    v_caller_id UUID := auth.uid();
BEGIN
    IF p_action NOT IN ('approved', 'rejected') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid action.');
    END IF;

    SELECT * INTO v_request
    FROM public.organization_join_requests
    WHERE id = p_request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Request not found or already reviewed.');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE org_id  = v_request.org_id
          AND user_id = v_caller_id
          AND role IN ('admin', 'manager')
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Permission denied.');
    END IF;

    UPDATE public.organization_join_requests
    SET status      = p_action,
        reviewed_at = now(),
        reviewed_by = v_caller_id
    WHERE id = p_request_id;

    IF p_action = 'approved' THEN
        INSERT INTO public.organization_members (org_id, user_id, role)
        VALUES (v_request.org_id, v_request.user_id, 'member')
        ON CONFLICT (org_id, user_id) DO NOTHING;
    END IF;

    RETURN json_build_object(
        'success', true,
        'action',  p_action,
        'user_id', v_request.user_id::text,
        'org_id',  v_request.org_id::text
    );
END;
$$;

-- Function to get organization by invite code (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_organization_by_invite_code(p_invite_code TEXT)
RETURNS TABLE(
    id UUID,
    name TEXT,
    description TEXT,
    owner_id UUID,
    invite_code TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT o.id, o.name, o.description, o.owner_id, o.invite_code, o.created_at, o.updated_at
    FROM public.organizations o
    WHERE UPPER(o.invite_code) = UPPER(p_invite_code);
END;
$$;

-- Advanced invite code join function (multi-code system)
CREATE OR REPLACE FUNCTION public.join_org_via_invite_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite organization_invite_codes%ROWTYPE;
    v_org_name TEXT;
    v_user_id UUID;
    v_existing UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT * INTO v_invite
    FROM organization_invite_codes
    WHERE UPPER(code) = UPPER(p_code);

    IF v_invite IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid invite code');
    END IF;

    IF NOT v_invite.is_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'This invite code has been revoked');
    END IF;

    IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'This invite code has expired');
    END IF;

    IF v_invite.max_uses IS NOT NULL AND v_invite.use_count >= v_invite.max_uses THEN
        RETURN jsonb_build_object('success', false, 'error', 'This invite code has reached its usage limit');
    END IF;

    SELECT id INTO v_existing
    FROM organization_members
    WHERE org_id = v_invite.organization_id AND user_id = v_user_id;

    IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'You are already a member of this organization');
    END IF;

    SELECT name INTO v_org_name FROM organizations WHERE id = v_invite.organization_id;

    INSERT INTO organization_members (org_id, user_id, role)
    VALUES (v_invite.organization_id, v_user_id, v_invite.default_role);

    UPDATE organization_invite_codes SET use_count = use_count + 1 WHERE id = v_invite.id;

    RETURN jsonb_build_object(
        'success', true,
        'org_id', v_invite.organization_id,
        'org_name', v_org_name,
        'role', v_invite.default_role
    );
END;
$$;

-- =====================================================
-- SECURITY QUESTION COLUMNS (for password reset)
-- =====================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS security_question TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS security_answer TEXT;

-- =====================================================
-- TRIGGER: AUTO-CREATE DEFAULT ORG CHANNEL
-- =====================================================
CREATE OR REPLACE FUNCTION public.auto_create_org_default_channel()
RETURNS TRIGGER AS $$
DECLARE
    v_channel_id UUID;
BEGIN
    SELECT id INTO v_channel_id
    FROM public.channels
    WHERE organization_id = NEW.org_id
    AND project_id IS NULL
    AND name = 'general'
    LIMIT 1;

    IF v_channel_id IS NULL THEN
        INSERT INTO public.channels (organization_id, name, display_name, description, type, created_by)
        VALUES (
            NEW.org_id, 'general', 'General',
            'Default channel for organization-wide discussions',
            'public', NEW.user_id
        )
        RETURNING id INTO v_channel_id;
    END IF;

    INSERT INTO public.channel_members (channel_id, user_id, role)
    VALUES (v_channel_id, NEW.user_id, 'member')
    ON CONFLICT (channel_id, user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_create_org_channel ON public.organization_members;
CREATE TRIGGER auto_create_org_channel
    AFTER INSERT ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.auto_create_org_default_channel();

-- =====================================================
-- TRIGGER: AUTO-CREATE DEFAULT PROJECT CHANNEL
-- =====================================================
CREATE OR REPLACE FUNCTION public.auto_create_project_default_channel()
RETURNS TRIGGER AS $$
DECLARE
    v_channel_id UUID;
    v_org_id UUID;
BEGIN
    SELECT org_id INTO v_org_id
    FROM public.projects
    WHERE id = NEW.project_id;

    SELECT id INTO v_channel_id
    FROM public.channels
    WHERE project_id = NEW.project_id
    AND name = 'general'
    LIMIT 1;

    IF v_channel_id IS NULL THEN
        INSERT INTO public.channels (organization_id, project_id, name, display_name, description, type, created_by)
        VALUES (
            v_org_id, NEW.project_id, 'general', 'General',
            'Default channel for project discussions',
            'public', NEW.user_id
        )
        RETURNING id INTO v_channel_id;
    END IF;

    INSERT INTO public.channel_members (channel_id, user_id, role)
    VALUES (v_channel_id, NEW.user_id, 'member')
    ON CONFLICT (channel_id, user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_create_project_channel ON public.project_members;
CREATE TRIGGER auto_create_project_channel
    AFTER INSERT ON public.project_members
    FOR EACH ROW EXECUTE FUNCTION public.auto_create_project_default_channel();

-- =====================================================
-- =====================================================
-- ENABLE SUPABASE REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mail_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_join_requests;

-- =====================================================
-- STORAGE BUCKETS
-- =====================================================

-- Chat attachments (10MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-attachments', 'chat-attachments', false, 10485760)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload chat files"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Authenticated users can view chat files"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'chat-attachments');

CREATE POLICY "Users can delete own chat files"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Org files (25MB limit, private — access via signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('org-files', 'org-files', FALSE, 26214400)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload to org-files"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'org-files');

CREATE POLICY "Authenticated users can read org-files"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'org-files');

CREATE POLICY "Authenticated users can update org-files"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'org-files');

CREATE POLICY "Authenticated users can delete org-files"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'org-files');

-- Mail attachments (25MB limit, private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('mail-attachments', 'mail-attachments', FALSE, 26214400)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload to mail-attachments"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'mail-attachments');

CREATE POLICY "Authenticated users can read mail-attachments"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'mail-attachments');

CREATE POLICY "Authenticated users can delete mail-attachments"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'mail-attachments');

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_organization_by_invite_code(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_by_invite_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_join_requests(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_join_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_org_via_invite_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_org_member_for_project(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_org_admin_or_manager(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_project_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_project_contributor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_channel_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_channel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_dm_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_reply_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_reply_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_create_org_default_channel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_create_project_default_channel() TO authenticated;

-- =====================================================
-- AUTO-DELETE OLD NOTIFICATIONS (older than 60 days)
-- =====================================================
CREATE OR REPLACE FUNCTION public.delete_old_notifications()
RETURNS void AS $$
  DELETE FROM public.notifications WHERE created_at < NOW() - INTERVAL '60 days';
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.delete_old_notifications() TO authenticated;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
