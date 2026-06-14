-- Phase B B-4: LMS 協作列 / 單人案件 → cat_stage_assignments 派出同步

CREATE UNIQUE INDEX IF NOT EXISTS cat_stage_assignments_collab_row_uidx
  ON public.cat_stage_assignments (collab_row_id)
  WHERE collab_row_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cat_resolve_profile_id(p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE trim(coalesce(p_name, '')) <> ''
    AND (p.display_name = trim(p_name) OR p.email = trim(p_name))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.cat_parse_line_range(p_range text, OUT line_start integer, OUT line_end integer)
RETURNS record
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := trim(coalesce(p_range, ''));
  parts text[];
BEGIN
  line_start := NULL;
  line_end := NULL;
  IF v = '' THEN
    RETURN;
  END IF;
  IF v ~ '^\d+\s*-\s*\d+$' THEN
    parts := regexp_split_to_array(replace(v, ' ', ''), '-');
    line_start := parts[1]::integer;
    line_end := parts[2]::integer;
  ELSIF v ~ '^\d+$' THEN
    line_start := v::integer;
    line_end := v::integer;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cat_upsert_translate_stage_assignment(
  p_file_id uuid,
  p_assignee_user_id uuid,
  p_collab_row_id uuid,
  p_view_id uuid,
  p_scope_label text,
  p_line_start integer,
  p_line_end integer,
  p_workflow_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_translate_stage_id uuid;
  v_existing_id uuid;
BEGIN
  IF p_file_id IS NULL OR p_assignee_user_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.ensure_cat_file_workflow_stages(p_file_id);

  SELECT id INTO v_translate_stage_id
  FROM public.cat_file_workflow_stages
  WHERE file_id = p_file_id AND stage_kind = 'translate'
  LIMIT 1;

  IF v_translate_stage_id IS NULL THEN
    RETURN;
  END IF;

  IF p_collab_row_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.cat_stage_assignments
    WHERE collab_row_id = p_collab_row_id
    LIMIT 1;
  ELSE
    SELECT id INTO v_existing_id
    FROM public.cat_stage_assignments
    WHERE file_id = p_file_id
      AND file_workflow_stage_id = v_translate_stage_id
      AND assignee_user_id = p_assignee_user_id
      AND collab_row_id IS NULL
      AND coalesce(view_id::text, '') = coalesce(p_view_id::text, '')
      AND coalesce(line_start, -1) = coalesce(p_line_start, -1)
      AND coalesce(line_end, -1) = coalesce(p_line_end, -1)
    LIMIT 1;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.cat_stage_assignments
    SET assignee_user_id = p_assignee_user_id,
        view_id = p_view_id,
        scope_label = nullif(trim(coalesce(p_scope_label, '')), ''),
        line_start = p_line_start,
        line_end = p_line_end,
        workflow_status = p_workflow_status,
        updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.cat_stage_assignments (
      file_id, view_id, file_workflow_stage_id, assignee_user_id,
      line_start, line_end, scope_label, workflow_status, collab_row_id,
      assigned_at, updated_at
    ) VALUES (
      p_file_id, p_view_id, v_translate_stage_id, p_assignee_user_id,
      p_line_start, p_line_end, nullif(trim(coalesce(p_scope_label, '')), ''),
      p_workflow_status, p_collab_row_id, now(), now()
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cat_upsert_review_stage_assignment(
  p_file_id uuid,
  p_assignee_user_id uuid,
  p_workflow_status text DEFAULT 'assigned'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_stage_id uuid;
  v_existing_id uuid;
BEGIN
  IF p_file_id IS NULL OR p_assignee_user_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.ensure_cat_file_workflow_stages(p_file_id);

  SELECT id INTO v_review_stage_id
  FROM public.cat_file_workflow_stages
  WHERE file_id = p_file_id AND stage_kind = 'review'
  LIMIT 1;

  IF v_review_stage_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.cat_stage_assignments
  WHERE file_id = p_file_id
    AND file_workflow_stage_id = v_review_stage_id
    AND assignee_user_id = p_assignee_user_id
    AND collab_row_id IS NULL
    AND view_id IS NULL
    AND line_start IS NULL
    AND line_end IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.cat_stage_assignments
    SET workflow_status = p_workflow_status,
        updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.cat_stage_assignments (
      file_id, file_workflow_stage_id, assignee_user_id,
      workflow_status, assigned_at, updated_at
    ) VALUES (
      p_file_id, v_review_stage_id, p_assignee_user_id,
      p_workflow_status, now(), now()
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_cat_workflow_assignments_for_case(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_multi_collab boolean;
  v_translator_json jsonb;
  v_reviewer_name text;
  v_collab_rows jsonb;
  v_row jsonb;
  v_file_id uuid;
  v_view_id uuid;
  v_assignee_id uuid;
  v_reviewer_id uuid;
  v_collab_row_id uuid;
  v_scope_label text;
  v_line_range text;
  v_line_start integer;
  v_line_end integer;
  v_wf_status text;
  v_task_completed boolean;
  v_translator_name text;
  v_file_ids uuid[];
BEGIN
  SELECT multi_collab, translator, reviewer, collab_rows
    INTO v_multi_collab, v_translator_json, v_reviewer_name, v_collab_rows
  FROM public.cases
  WHERE id = p_case_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT array_agg(f.id)
    INTO v_file_ids
  FROM public.cat_files f
  WHERE f.related_lms_case_id = p_case_id;

  IF v_file_ids IS NULL THEN
    v_file_ids := ARRAY[]::uuid[];
  END IF;

  -- 多人協作：依協作列寫入翻譯段落指派
  IF coalesce(v_multi_collab, false) AND jsonb_typeof(v_collab_rows) = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(v_collab_rows) AS t(value) LOOP
      v_translator_name := trim(coalesce(v_row->>'translator', ''));
      v_assignee_id := public.cat_resolve_profile_id(v_translator_name);
      IF v_assignee_id IS NULL THEN
        CONTINUE;
      END IF;

      v_collab_row_id := NULL;
      BEGIN
        v_collab_row_id := (v_row->>'id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_collab_row_id := NULL;
      END;

      v_task_completed := coalesce((v_row->>'taskCompleted')::boolean, false);
      v_wf_status := CASE WHEN v_task_completed THEN 'completed' ELSE 'assigned' END;

      v_scope_label := coalesce(v_row->>'scopeLabel', v_row->>'segment', '');
      v_line_range := coalesce(v_row->>'lineRange', '');

      BEGIN
        v_file_id := nullif(trim(v_row->>'linkedCatFileId'), '')::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_file_id := NULL;
      END;
      BEGIN
        v_view_id := nullif(trim(v_row->>'linkedCatViewId'), '')::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_view_id := NULL;
      END;

      IF v_file_id IS NULL AND v_view_id IS NOT NULL THEN
        SELECT fid INTO v_file_id
        FROM public.cat_views cv
        CROSS JOIN LATERAL unnest(cv.file_ids) AS fid
        WHERE cv.id = v_view_id
        LIMIT 1;
      END IF;

      IF v_file_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT lr.line_start, lr.line_end
        INTO v_line_start, v_line_end
      FROM public.cat_parse_line_range(v_line_range) AS lr;

      PERFORM public.cat_upsert_translate_stage_assignment(
        v_file_id, v_assignee_id, v_collab_row_id, v_view_id,
        v_scope_label, v_line_start, v_line_end, v_wf_status
      );
    END LOOP;
  ELSE
    -- 單人案件：對所有連結 CAT 檔建立整檔翻譯指派
    IF jsonb_typeof(v_translator_json) = 'array' THEN
      FOR v_translator_name IN
        SELECT trim(jsonb_array_elements_text(v_translator_json))
      LOOP
        IF v_translator_name = '' THEN
          CONTINUE;
        END IF;
        v_assignee_id := public.cat_resolve_profile_id(v_translator_name);
        IF v_assignee_id IS NULL THEN
          CONTINUE;
        END IF;
        FOREACH v_file_id IN ARRAY v_file_ids LOOP
          PERFORM public.cat_upsert_translate_stage_assignment(
            v_file_id, v_assignee_id, NULL, NULL,
            NULL, NULL, NULL, 'assigned'
          );
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  -- 審稿：案件 reviewer → 各連結檔整檔審稿指派
  v_reviewer_id := public.cat_resolve_profile_id(trim(coalesce(v_reviewer_name, '')));
  IF v_reviewer_id IS NOT NULL THEN
    FOREACH v_file_id IN ARRAY v_file_ids LOOP
      PERFORM public.cat_upsert_review_stage_assignment(v_file_id, v_reviewer_id, 'assigned');
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_cat_workflow_assignments_for_case(uuid) TO authenticated;
