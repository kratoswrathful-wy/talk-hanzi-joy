-- Prep dispatch decouple: multi-collab sync only accepted rows

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
    FOR v_row IN
      SELECT value FROM jsonb_array_elements(v_collab_rows) AS t(value)
      WHERE coalesce((value->>'accepted')::boolean, false)
    LOOP
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

    FOR v_row IN
      SELECT value FROM jsonb_array_elements(v_collab_rows) AS t(value)
      WHERE coalesce((value->>'accepted')::boolean, false)
    LOOP
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
