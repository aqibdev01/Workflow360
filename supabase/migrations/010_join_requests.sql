-- Migration: Organization Join Requests
-- Instead of directly adding users as members when they enter an invite code,
-- create a pending request that the org admin must approve or reject.

-- ─── Table ────────────────────────────────────────────────────────────────────

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

-- ─── Replace join function ────────────────────────────────────────────────────
-- Changed: inserts a pending request instead of directly adding a member.

CREATE OR REPLACE FUNCTION public.join_organization_by_invite_code(
  p_invite_code TEXT,
  p_user_id     UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org             RECORD;
  v_already_member  BOOLEAN;
  v_existing        RECORD;
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
    IF v_existing.status = 'pending' THEN
      RETURN json_build_object(
        'success', false,
        'error', 'You already have a pending request to join this organization.'
      );
    ELSIF v_existing.status = 'approved' THEN
      -- Shouldn't reach here (member row exists), but guard anyway
      RETURN json_build_object('success', false, 'error', 'You are already a member of this organization.');
    ELSE
      -- Rejected — allow re-request
      UPDATE public.organization_join_requests
      SET status      = 'pending',
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

-- ─── Get pending requests for an org ─────────────────────────────────────────

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
AS $$
BEGIN
  -- Caller must be admin or manager of this org
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
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
  WHERE r.org_id = p_org_id
    AND r.status  = 'pending'
  ORDER BY r.requested_at ASC;
END;
$$;

-- ─── Approve or reject a request ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.review_join_request(
  p_request_id UUID,
  p_action     TEXT   -- 'approved' | 'rejected'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Caller must be admin or manager of the org
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id   = v_request.org_id
      AND user_id  = v_caller_id
      AND role IN ('admin', 'manager')
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Permission denied.');
  END IF;

  -- Mark reviewed
  UPDATE public.organization_join_requests
  SET status      = p_action,
      reviewed_at = now(),
      reviewed_by = v_caller_id
  WHERE id = p_request_id;

  -- On approval, add to members
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
