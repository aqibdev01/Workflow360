-- Migration: Allow re-sending a join request when one is already pending.
-- Previously the function returned success=false for duplicate pending requests,
-- which silently blocked re-sends. Now it updates the timestamp instead,
-- so the owner always sees the freshest request.

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

  -- Already a confirmed member?
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
      -- so the owner sees it as a new/updated request
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

  -- First-time request — insert
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

-- Also add an INSERT policy so the RPC (SECURITY DEFINER) isn't the only
-- write path — direct inserts from authenticated users are also permitted.
-- (The function itself is the recommended path, but this keeps RLS consistent.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'organization_join_requests'
      AND policyname = 'Users can insert their own join requests'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can insert their own join requests"
        ON public.organization_join_requests FOR INSERT
        WITH CHECK (user_id = auth.uid())
    $policy$;
  END IF;
END$$;
