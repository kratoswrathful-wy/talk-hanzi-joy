-- Phase B B-4 v5-a: collab_row_id 改為 text（LMS 協作列 ID 為 cr-{timestamp}-{i} 非 UUID）

ALTER TABLE public.cat_stage_assignments
  ALTER COLUMN collab_row_id TYPE text;

CREATE OR REPLACE FUNCTION public.cat_upsert_translate_stage_assignment(
  p_file_id uuid,
  p_assignee_user_id uuid,
  p_collab_row_id text,
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

  IF nullif(trim(coalesce(p_collab_row_id, '')), '') IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.cat_stage_assignments
    WHERE collab_row_id = trim(p_collab_row_id)
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
        collab_row_id = nullif(trim(coalesce(p_collab_row_id, '')), ''),
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
      p_workflow_status, nullif(trim(coalesce(p_collab_row_id, '')), ''), now(), now()
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
  v_case_status text;
  v_translator_json jsonb;
  v_reviewer_name text;
  v_collab_rows jsonb;
  v_row jsonb;
  v_file_id uuid;
  v_view_id uuid;
  v_assignee_id uuid;
  v_reviewer_id uuid;
  v_collab_row_id text;
  v_scope_label text;
  v_line_range text;
  v_line_start integer;
  v_line_end integer;
  v_wf_status text;
  v_task_completed boolean;
  v_translator_name text;
  v_file_ids uuid[];
  v_valid_collab_row_ids text[] := ARRAY[]::text[];
  v_translate_stage_id uuid;
BEGIN
  SELECT multi_collab, status, translator, reviewer, collab_rows
    INTO v_multi_collab, v_case_status, v_translator_json, v_reviewer_name, v_collab_rows
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

  IF v_case_status IN ('draft', 'inquiry', 'dispatched') THEN
    PERFORM public.cat_revert_workflow_stages_for_case(p_case_id);
  END IF;

  IF coalesce(v_multi_collab, false) AND jsonb_typeof(v_collab_rows) = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(v_collab_rows) AS t(value) LOOP
      v_translator_name := trim(coalesce(v_row->>'translator', ''));
      IF v_translator_name = '' THEN
        CONTINUE;
      END IF;
      v_assignee_id := public.cat_resolve_profile_id(v_translator_name);
      IF v_assignee_id IS NULL THEN
        CONTINUE;
      END IF;

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

      v_collab_row_id := nullif(trim(v_row->>'id'), '');
      IF v_collab_row_id IS NOT NULL THEN
        v_valid_collab_row_ids := array_append(v_valid_collab_row_ids, v_collab_row_id);
      END IF;
    END LOOP;

    FOREACH v_file_id IN ARRAY v_file_ids LOOP
      SELECT id INTO v_translate_stage_id
      FROM public.cat_file_workflow_stages
      WHERE file_id = v_file_id AND stage_kind = 'translate'
      LIMIT 1;

      IF v_translate_stage_id IS NULL THEN
        CONTINUE;
      END IF;

      DELETE FROM public.cat_stage_assignments a
      WHERE a.file_id = v_file_id
        AND a.file_workflow_stage_id = v_translate_stage_id
        AND (
          (a.collab_row_id IS NOT NULL AND NOT (a.collab_row_id = ANY (v_valid_collab_row_ids)))
          OR a.collab_row_id IS NULL
        );
    END LOOP;

    FOR v_row IN SELECT value FROM jsonb_array_elements(v_collab_rows) AS t(value) LOOP
      v_translator_name := trim(coalesce(v_row->>'translator', ''));
      v_assignee_id := public.cat_resolve_profile_id(v_translator_name);
      IF v_assignee_id IS NULL THEN
        CONTINUE;
      END IF;

      v_collab_row_id := nullif(trim(v_row->>'id'), '');

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

  v_reviewer_id := public.cat_resolve_profile_id(trim(coalesce(v_reviewer_name, '')));
  IF v_reviewer_id IS NOT NULL THEN
    FOREACH v_file_id IN ARRAY v_file_ids LOOP
      PERFORM public.cat_upsert_review_stage_assignment(v_file_id, v_reviewer_id, 'assigned');
    END LOOP;
  END IF;
END;
$$;

-- 回填現有指派的 collab_row_id
DO $$
DECLARE
  v_case_id uuid;
BEGIN
  FOR v_case_id IN
    SELECT id FROM public.cases
    WHERE coalesce(multi_collab, false) = true
  LOOP
    PERFORM public.sync_cat_workflow_assignments_for_case(v_case_id);
  END LOOP;
END;
$$;
