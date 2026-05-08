-- Fix: cases.translator is jsonb (array of strings), not text[].
-- The previous function version selected translator into text[] and would error,
-- causing all auto-sync attempts (PM/translator) to silently fail.

CREATE OR REPLACE FUNCTION public.sync_cat_file_assignments_for_case(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_translator_json jsonb;
  v_reviewer_name   text;
  v_translator_names text[];
  v_assignee_names  text[];
  v_user_ids        uuid[];
  v_file_ids        uuid[];
BEGIN
  -- Load latest translator/reviewer from the case
  SELECT translator, reviewer
    INTO v_translator_json, v_reviewer_name
    FROM public.cases
    WHERE id = p_case_id;

  -- translator: expect jsonb array of strings; tolerate other shapes by treating as empty
  SELECT COALESCE(
    array_agg(DISTINCT trim(t.v)) FILTER (WHERE trim(t.v) <> ''),
    ARRAY[]::text[]
  )
  INTO v_translator_names
  FROM (
    SELECT jsonb_array_elements_text(v_translator_json) AS v
    WHERE jsonb_typeof(v_translator_json) = 'array'
  ) AS t;

  v_assignee_names := v_translator_names;
  IF v_reviewer_name IS NOT NULL AND trim(v_reviewer_name) <> '' THEN
    v_assignee_names := array_append(v_assignee_names, trim(v_reviewer_name));
  END IF;

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

GRANT EXECUTE ON FUNCTION public.sync_cat_file_assignments_for_case(uuid) TO authenticated;

