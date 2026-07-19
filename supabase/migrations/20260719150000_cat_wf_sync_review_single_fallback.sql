-- 工項 F：LMS sync 單人案審稿 fallback＋review 清理掃描比照 translate
-- REPLACE sync_cat_workflow_assignments_for_case；無新表／新欄
-- 1) 非 multi_collab（或 review_rows 非 array）→ 讀 cases.reviewer 建整檔 review 指派
-- 2) review 清理掃描僅在 multi_collab＋review_rows array 分支內執行
--    （多人案仍刪 collab_row_id IS NULL，與 translate 一致；單人案不掃 → 工項 E 手動列可存留）
-- 3) upsert 仍故意不傳 p_allow_downgrade（D5）

CREATE OR REPLACE FUNCTION public.sync_cat_workflow_assignments_for_case(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_multi_collab boolean;
  v_case_status text;
  v_translator_json jsonb;
  v_collab_rows jsonb;
  v_review_rows jsonb;
  v_case_reviewer text;
  v_row jsonb;
  v_file_id uuid;
  v_view_id uuid;
  v_assignee_id uuid;
  v_collab_row_id text;
  v_scope_label text;
  v_line_range text;
  v_line_start integer;
  v_line_end integer;
  v_wf_status text;
  v_task_completed boolean;
  v_translator_name text;
  v_translator_user_id text;
  v_reviewer_name text;
  v_reviewer_user_id text;
  v_file_ids uuid[];
  v_valid_collab_row_ids text[] := ARRAY[]::text[];
  v_valid_review_row_ids text[] := ARRAY[]::text[];
  v_translate_stage_id uuid;
  v_review_stage_id uuid;
  v_translate_stage_status text;
  v_review_stage_status text;
  v_include boolean;
  v_requires_accepted boolean;
  v_unresolved text[] := ARRAY[]::text[];
  v_unresolved_reviewers text[] := ARRAY[]::text[];
  v_rows_without_file integer := 0;
  v_review_rows_without_file integer := 0;
  v_written integer := 0;
  v_review_written integer := 0;
BEGIN
  SELECT multi_collab, status, translator, collab_rows, review_rows, reviewer
    INTO v_multi_collab, v_case_status, v_translator_json, v_collab_rows, v_review_rows, v_case_reviewer
  FROM public.cases
  WHERE id = p_case_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
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

  v_requires_accepted := v_case_status IN ('draft', 'inquiry');

  -- ── translate（collab_rows；行為零變動）──
  IF coalesce(v_multi_collab, false) AND jsonb_typeof(v_collab_rows) = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(v_collab_rows) AS t(value) LOOP
      v_include := (NOT v_requires_accepted) OR coalesce((v_row->>'accepted')::boolean, false);
      IF NOT v_include THEN
        CONTINUE;
      END IF;

      v_translator_name := trim(coalesce(v_row->>'translator', ''));
      v_translator_user_id := nullif(trim(coalesce(v_row->>'translatorUserId', '')), '');
      IF v_translator_name = '' AND v_translator_user_id IS NULL THEN
        CONTINUE;
      END IF;

      v_assignee_id := public.cat_resolve_profile_id_dual(v_translator_user_id, v_translator_name);
      IF v_assignee_id IS NULL THEN
        IF v_translator_name <> '' AND NOT (v_translator_name = ANY (v_unresolved)) THEN
          v_unresolved := array_append(v_unresolved, v_translator_name);
        END IF;
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
        v_rows_without_file := v_rows_without_file + 1;
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

      -- 多人案：刪 stale collab_row_id，並刪 collab_row_id IS NULL（與既有 translate 一致）
      DELETE FROM public.cat_stage_assignments a
      WHERE a.file_id = v_file_id
        AND a.file_workflow_stage_id = v_translate_stage_id
        AND (
          (a.collab_row_id IS NOT NULL AND NOT (a.collab_row_id = ANY (v_valid_collab_row_ids)))
          OR a.collab_row_id IS NULL
        );
    END LOOP;

    FOR v_row IN SELECT value FROM jsonb_array_elements(v_collab_rows) AS t(value) LOOP
      v_include := (NOT v_requires_accepted) OR coalesce((v_row->>'accepted')::boolean, false);
      IF NOT v_include THEN
        CONTINUE;
      END IF;

      v_translator_name := trim(coalesce(v_row->>'translator', ''));
      v_translator_user_id := nullif(trim(coalesce(v_row->>'translatorUserId', '')), '');
      v_assignee_id := public.cat_resolve_profile_id_dual(v_translator_user_id, v_translator_name);
      IF v_assignee_id IS NULL THEN
        CONTINUE;
      END IF;

      v_collab_row_id := nullif(trim(v_row->>'id'), '');
      v_task_completed := coalesce((v_row->>'taskCompleted')::boolean, false);
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

      SELECT s.status INTO v_translate_stage_status
      FROM public.cat_file_workflow_stages s
      WHERE s.file_id = v_file_id AND s.stage_kind = 'translate'
      LIMIT 1;

      IF v_task_completed OR v_translate_stage_status = 'completed' THEN
        v_wf_status := 'completed';
      ELSE
        v_wf_status := 'assigned';
      END IF;

      -- 故意不傳 p_allow_downgrade → DEFAULT false（LMS sync 永不降級）
      PERFORM public.cat_upsert_translate_stage_assignment(
        v_file_id, v_assignee_id, v_collab_row_id, v_view_id,
        v_scope_label, v_line_start, v_line_end, v_wf_status
      );
      v_written := v_written + 1;
    END LOOP;
  ELSE
    IF jsonb_typeof(v_translator_json) = 'array' THEN
      FOR v_translator_name IN
        SELECT trim(jsonb_array_elements_text(v_translator_json))
      LOOP
        IF v_translator_name = '' THEN
          CONTINUE;
        END IF;
        v_assignee_id := public.cat_resolve_profile_id_dual(NULL, v_translator_name);
        IF v_assignee_id IS NULL THEN
          IF NOT (v_translator_name = ANY (v_unresolved)) THEN
            v_unresolved := array_append(v_unresolved, v_translator_name);
          END IF;
          CONTINUE;
        END IF;
        FOREACH v_file_id IN ARRAY v_file_ids LOOP
          SELECT s.status INTO v_translate_stage_status
          FROM public.cat_file_workflow_stages s
          WHERE s.file_id = v_file_id AND s.stage_kind = 'translate'
          LIMIT 1;
          IF v_translate_stage_status = 'completed' THEN
            v_wf_status := 'completed';
          ELSE
            v_wf_status := 'assigned';
          END IF;
          PERFORM public.cat_upsert_translate_stage_assignment(
            v_file_id, v_assignee_id, NULL, NULL,
            NULL, NULL, NULL, v_wf_status
          );
          v_written := v_written + 1;
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  -- ── review：多人讀 review_rows；單人（或 review_rows 非 array）讀 cases.reviewer ──
  IF coalesce(v_multi_collab, false) AND jsonb_typeof(v_review_rows) = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(v_review_rows) AS t(value) LOOP
      v_include := (NOT v_requires_accepted) OR coalesce((v_row->>'accepted')::boolean, true);
      IF NOT v_include THEN
        CONTINUE;
      END IF;

      v_reviewer_name := trim(coalesce(v_row->>'reviewer', ''));
      v_reviewer_user_id := nullif(trim(coalesce(v_row->>'reviewerUserId', '')), '');
      IF v_reviewer_name = '' AND v_reviewer_user_id IS NULL THEN
        CONTINUE;
      END IF;

      v_assignee_id := public.cat_resolve_profile_id_dual(v_reviewer_user_id, v_reviewer_name);
      IF v_assignee_id IS NULL THEN
        IF v_reviewer_name <> '' AND NOT (v_reviewer_name = ANY (v_unresolved_reviewers)) THEN
          v_unresolved_reviewers := array_append(v_unresolved_reviewers, v_reviewer_name);
        END IF;
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
        v_review_rows_without_file := v_review_rows_without_file + 1;
        CONTINUE;
      END IF;

      v_collab_row_id := nullif(trim(v_row->>'id'), '');
      IF v_collab_row_id IS NOT NULL THEN
        v_valid_review_row_ids := array_append(v_valid_review_row_ids, v_collab_row_id);
      END IF;
    END LOOP;

    -- 僅多人案執行清理（與 translate 同構）：stale id 或 collab_row_id IS NULL 皆刪
    FOREACH v_file_id IN ARRAY v_file_ids LOOP
      SELECT id INTO v_review_stage_id
      FROM public.cat_file_workflow_stages
      WHERE file_id = v_file_id AND stage_kind = 'review'
      LIMIT 1;

      IF v_review_stage_id IS NULL THEN
        CONTINUE;
      END IF;

      DELETE FROM public.cat_stage_assignments a
      WHERE a.file_id = v_file_id
        AND a.file_workflow_stage_id = v_review_stage_id
        AND (
          (a.collab_row_id IS NOT NULL AND NOT (a.collab_row_id = ANY (v_valid_review_row_ids)))
          OR a.collab_row_id IS NULL
        );
    END LOOP;

    FOR v_row IN SELECT value FROM jsonb_array_elements(v_review_rows) AS t(value) LOOP
      v_include := (NOT v_requires_accepted) OR coalesce((v_row->>'accepted')::boolean, true);
      IF NOT v_include THEN
        CONTINUE;
      END IF;

      v_reviewer_name := trim(coalesce(v_row->>'reviewer', ''));
      v_reviewer_user_id := nullif(trim(coalesce(v_row->>'reviewerUserId', '')), '');
      v_assignee_id := public.cat_resolve_profile_id_dual(v_reviewer_user_id, v_reviewer_name);
      IF v_assignee_id IS NULL THEN
        CONTINUE;
      END IF;

      v_collab_row_id := nullif(trim(v_row->>'id'), '');
      v_task_completed := coalesce((v_row->>'taskCompleted')::boolean, false);
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

      SELECT s.status INTO v_review_stage_status
      FROM public.cat_file_workflow_stages s
      WHERE s.file_id = v_file_id AND s.stage_kind = 'review'
      LIMIT 1;

      IF v_task_completed OR v_review_stage_status = 'completed' THEN
        v_wf_status := 'completed';
      ELSE
        v_wf_status := 'assigned';
      END IF;

      -- 故意不傳 p_allow_downgrade → DEFAULT false
      PERFORM public.cat_upsert_review_stage_assignment(
        v_file_id, v_assignee_id, v_collab_row_id, v_view_id,
        v_scope_label, v_line_start, v_line_end, v_wf_status
      );
      v_review_written := v_review_written + 1;
    END LOOP;
  ELSE
    -- 單人案 fallback：cases.reviewer（文字）→ 各連結檔整檔 review 指派；不跑清理掃描
    v_reviewer_name := trim(coalesce(v_case_reviewer, ''));
    IF v_reviewer_name <> '' THEN
      v_assignee_id := public.cat_resolve_profile_id_dual(NULL, v_reviewer_name);
      IF v_assignee_id IS NULL THEN
        IF NOT (v_reviewer_name = ANY (v_unresolved_reviewers)) THEN
          v_unresolved_reviewers := array_append(v_unresolved_reviewers, v_reviewer_name);
        END IF;
      ELSE
        FOREACH v_file_id IN ARRAY v_file_ids LOOP
          SELECT s.status INTO v_review_stage_status
          FROM public.cat_file_workflow_stages s
          WHERE s.file_id = v_file_id AND s.stage_kind = 'review'
          LIMIT 1;
          IF v_review_stage_status = 'completed' THEN
            v_wf_status := 'completed';
          ELSE
            v_wf_status := 'assigned';
          END IF;
          -- 故意不傳 p_allow_downgrade → DEFAULT false
          PERFORM public.cat_upsert_review_stage_assignment(
            v_file_id, v_assignee_id, NULL, NULL,
            NULL, NULL, NULL, v_wf_status
          );
          v_review_written := v_review_written + 1;
        END LOOP;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'unresolvedTranslators', to_jsonb(v_unresolved),
    'unresolvedReviewers', to_jsonb(v_unresolved_reviewers),
    'rowsWithoutFile', v_rows_without_file,
    'reviewRowsWithoutFile', v_review_rows_without_file,
    'written', v_written,
    'reviewWritten', v_review_written
  );
END;
$$;

COMMENT ON FUNCTION public.sync_cat_workflow_assignments_for_case(uuid) IS
  '工項 F：多人 review_rows；單人 cases.reviewer fallback；review 清理僅 multi；upsert 不傳 allow_downgrade';

GRANT EXECUTE ON FUNCTION public.sync_cat_workflow_assignments_for_case(uuid) TO authenticated;
