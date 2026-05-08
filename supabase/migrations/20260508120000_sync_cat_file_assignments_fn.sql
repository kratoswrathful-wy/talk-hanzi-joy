-- Sync CAT file assignments from linked LMS case fields.
-- This is triggered when a case status transitions to "dispatched".
--
-- Why SECURITY DEFINER:
-- - Translators can only self-insert into cat_file_assignments via RLS.
-- - The sync needs to assign BOTH translators and reviewers, which would fail under translator RLS
--   when attempted client-side in a single batch.
-- - Moving the write to a SECURITY DEFINER function makes the sync reliable and consistent.
--
-- Behavior:
-- - Resolve assignees from cases.translator[] + cases.reviewer (by display_name OR email).
-- - Find linked CAT files via cat_files.related_lms_case_id.
-- - Insert missing (file_id, assignee_user_id) rows; do NOT remove or overwrite existing rows.

CREATE OR REPLACE FUNCTION public.sync_cat_file_assignments_for_case(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_translator_names text[];
  v_reviewer_name    text;
  v_assignee_names   text[];
  v_user_ids         uuid[];
  v_file_ids         uuid[];
BEGIN
  -- Load latest translator/reviewer from the case
  SELECT translator, reviewer
    INTO v_translator_names, v_reviewer_name
    FROM public.cases
    WHERE id = p_case_id;

  -- Build assignee names list (dedupe later by profile id)
  v_assignee_names := array_remove(array_cat(COALESCE(v_translator_names, ARRAY[]::text[]), ARRAY[COALESCE(v_reviewer_name, '')]), NULL);
  v_assignee_names := array_remove(v_assignee_names, '');

  IF cardinality(v_assignee_names) = 0 THEN
    RETURN;
  END IF;

  -- Resolve to user ids by display_name OR email (cases store human strings)
  SELECT array_agg(DISTINCT p.id)
    INTO v_user_ids
    FROM public.profiles p
    WHERE p.display_name = ANY (v_assignee_names)
       OR p.email        = ANY (v_assignee_names);

  IF v_user_ids IS NULL OR cardinality(v_user_ids) = 0 THEN
    RETURN;
  END IF;

  -- Find linked CAT files by case id
  SELECT array_agg(f.id)
    INTO v_file_ids
    FROM public.cat_files f
    WHERE f.related_lms_case_id = p_case_id;

  IF v_file_ids IS NULL OR cardinality(v_file_ids) = 0 THEN
    RETURN;
  END IF;

  -- Insert missing rows only (rule A: only add, never remove)
  INSERT INTO public.cat_file_assignments
    (file_id, assignee_user_id, assigned_by, status, assigned_at, updated_at)
  SELECT f.fid, u.uid, NULL, 'assigned', now(), now()
    FROM unnest(v_file_ids) AS f(fid)
    CROSS JOIN unnest(v_user_ids) AS u(uid)
  ON CONFLICT (file_id, assignee_user_id) DO NOTHING;
END;
$$;

-- Allow authenticated clients to invoke the sync.
GRANT EXECUTE ON FUNCTION public.sync_cat_file_assignments_for_case(uuid) TO authenticated;

