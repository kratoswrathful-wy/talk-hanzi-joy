-- Phase B B-4 v4: replace 同步、列範圍 N-、LMS 狀態退回、collab_rows 遷移

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
  ELSIF v ~ '^\d+\s*-\s*$' THEN
    parts := regexp_split_to_array(regexp_replace(v, '\s+', '', 'g'), '-');
    line_start := parts[1]::integer;
    line_end := NULL;
  ELSIF v ~ '^\d+$' THEN
    line_start := v::integer;
    line_end := v::integer;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cat_revert_workflow_stages_for_case(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_file_id uuid;
BEGIN
  FOR v_file_id IN
    SELECT f.id
    FROM public.cat_files f
    WHERE f.related_lms_case_id = p_case_id
  LOOP
    PERFORM public.ensure_cat_file_workflow_stages(v_file_id);

    UPDATE public.cat_file_workflow_stages
    SET status = 'active', updated_at = now()
    WHERE file_id = v_file_id AND stage_kind = 'translate';

    UPDATE public.cat_file_workflow_stages
    SET status = 'pending', updated_at = now()
    WHERE file_id = v_file_id AND stage_kind = 'review';
  END LOOP;
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
  v_collab_row_id uuid;
  v_scope_label text;
  v_line_range text;
  v_line_start integer;
  v_line_end integer;
  v_wf_status text;
  v_task_completed boolean;
  v_translator_name text;
  v_file_ids uuid[];
  v_valid_collab_row_ids uuid[] := ARRAY[]::uuid[];
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

  -- 案件為草稿／詢案中／已派出時，連結檔 workflow 步驟退回翻譯進行中
  IF v_case_status IN ('draft', 'inquiry', 'dispatched') THEN
    PERFORM public.cat_revert_workflow_stages_for_case(p_case_id);
  END IF;

  -- 多人協作：先收集有效 collab_row_id，再清除過期翻譯指派
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

      BEGIN
        v_collab_row_id := (v_row->>'id')::uuid;
        IF v_collab_row_id IS NOT NULL THEN
          v_valid_collab_row_ids := array_append(v_valid_collab_row_ids, v_collab_row_id);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
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

    -- 依協作列寫入翻譯段落指派
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

GRANT EXECUTE ON FUNCTION public.cat_revert_workflow_stages_for_case(uuid) TO authenticated;

-- 遷移：舊有 CAT 綁定協作列 → 不使用 1UP CAT（保留 segment 文字）
UPDATE public.cases c
SET collab_rows = (
      SELECT COALESCE(jsonb_agg(
        CASE
          WHEN (elem->>'linkedCatFileId') IS NOT NULL OR (elem->>'linkedCatViewId') IS NOT NULL THEN
            (
              CASE
                WHEN trim(coalesce(elem->>'segment', '')) = ''
                  AND trim(coalesce(elem->>'scopeLabel', '')) <> '' THEN
                  elem || jsonb_build_object('segment', elem->>'scopeLabel')
                ELSE elem
              END
            )
            - 'linkedCatFileId'
            - 'linkedCatViewId'
            - 'scopeLabel'
          ELSE elem
        END
      ), '[]'::jsonb)
      FROM jsonb_array_elements(c.collab_rows) AS elem
    ),
    updated_at = now()
WHERE coalesce(c.multi_collab, false) = true
  AND c.collab_rows IS NOT NULL
  AND jsonb_typeof(c.collab_rows) = 'array'
  AND c.collab_rows @? '$[*] ? (@.linkedCatFileId != null || @.linkedCatViewId != null)';

-- 遷移後同步受影響案件，清除 CAT 端幽靈指派
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
