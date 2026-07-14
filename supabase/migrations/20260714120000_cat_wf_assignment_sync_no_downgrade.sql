-- Workflow assignment sync：防降級 + 髒資料 backfill（idempotent）
-- 計畫：docs/CAT_META_EXTRA_INFO_AND_WF_STATUS_PLAN_2026-07.md
-- 只讀清單：docs/CAT_WF_ASSIGNMENT_BACKFILL_INVENTORY_2026-07-14.md
--
-- 1) upsert：stage 仍 completed 時禁止把 completed 指派洗回 assigned（防 LMS sync 降級）
-- 2) upsert：stage 已非 completed（檔案重開）時允許降回 assigned（反向路徑不得卡死）
-- 3) sync：依 stage 狀態決定建議寫入狀態（與 cat-tool/js/wf-assignment-sync-policy.js 對齊）
-- 4) backfill：stage completed 但 assignment 非 completed → 設為 completed

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
  v_existing_status text;
  v_stage_status text;
  v_effective text;
BEGIN
  IF p_file_id IS NULL OR p_assignee_user_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.ensure_cat_file_workflow_stages(p_file_id);

  SELECT id, status INTO v_translate_stage_id, v_stage_status
  FROM public.cat_file_workflow_stages
  WHERE file_id = p_file_id AND stage_kind = 'translate'
  LIMIT 1;

  IF v_translate_stage_id IS NULL THEN
    RETURN;
  END IF;

  IF nullif(trim(coalesce(p_collab_row_id, '')), '') IS NOT NULL THEN
    SELECT id, workflow_status INTO v_existing_id, v_existing_status
    FROM public.cat_stage_assignments
    WHERE collab_row_id = trim(p_collab_row_id)
    LIMIT 1;
  ELSE
    SELECT id, workflow_status INTO v_existing_id, v_existing_status
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

  v_effective := coalesce(nullif(trim(p_workflow_status), ''), 'assigned');
  IF v_existing_status = 'completed'
     AND v_effective IS DISTINCT FROM 'completed'
     AND v_stage_status = 'completed' THEN
    v_effective := 'completed';
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.cat_stage_assignments
    SET assignee_user_id = p_assignee_user_id,
        view_id = p_view_id,
        scope_label = nullif(trim(coalesce(p_scope_label, '')), ''),
        line_start = p_line_start,
        line_end = p_line_end,
        workflow_status = v_effective,
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
      v_effective, nullif(trim(coalesce(p_collab_row_id, '')), ''), now(), now()
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
  v_existing_status text;
  v_stage_status text;
  v_effective text;
BEGIN
  IF p_file_id IS NULL OR p_assignee_user_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.ensure_cat_file_workflow_stages(p_file_id);

  SELECT id, status INTO v_review_stage_id, v_stage_status
  FROM public.cat_file_workflow_stages
  WHERE file_id = p_file_id AND stage_kind = 'review'
  LIMIT 1;

  IF v_review_stage_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id, workflow_status INTO v_existing_id, v_existing_status
  FROM public.cat_stage_assignments
  WHERE file_id = p_file_id
    AND file_workflow_stage_id = v_review_stage_id
    AND assignee_user_id = p_assignee_user_id
    AND collab_row_id IS NULL
    AND view_id IS NULL
    AND line_start IS NULL
    AND line_end IS NULL
  LIMIT 1;

  v_effective := coalesce(nullif(trim(p_workflow_status), ''), 'assigned');
  IF v_existing_status = 'completed'
     AND v_effective IS DISTINCT FROM 'completed'
     AND v_stage_status = 'completed' THEN
    v_effective := 'completed';
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.cat_stage_assignments
    SET workflow_status = v_effective,
        updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.cat_stage_assignments (
      file_id, file_workflow_stage_id, assignee_user_id,
      workflow_status, assigned_at, updated_at
    ) VALUES (
      p_file_id, v_review_stage_id, p_assignee_user_id,
      v_effective, now(), now()
    );
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.sync_cat_workflow_assignments_for_case(uuid);

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
  v_translator_user_id text;
  v_file_ids uuid[];
  v_valid_collab_row_ids text[] := ARRAY[]::text[];
  v_translate_stage_id uuid;
  v_translate_stage_status text;
  v_review_stage_status text;
  v_include boolean;
  v_requires_accepted boolean;
  v_unresolved text[] := ARRAY[]::text[];
  v_rows_without_file integer := 0;
  v_written integer := 0;
BEGIN
  SELECT multi_collab, status, translator, reviewer, collab_rows
    INTO v_multi_collab, v_case_status, v_translator_json, v_reviewer_name, v_collab_rows
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

      -- 對齊 wf-assignment-sync-policy.resolveRequestedSyncWorkflowStatus
      IF v_task_completed OR v_translate_stage_status = 'completed' THEN
        v_wf_status := 'completed';
      ELSE
        v_wf_status := 'assigned';
      END IF;

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

  v_reviewer_id := public.cat_resolve_profile_id_dual(NULL, trim(coalesce(v_reviewer_name, '')));
  IF v_reviewer_id IS NOT NULL THEN
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
      PERFORM public.cat_upsert_review_stage_assignment(v_file_id, v_reviewer_id, v_wf_status);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'unresolvedTranslators', to_jsonb(v_unresolved),
    'rowsWithoutFile', v_rows_without_file,
    'written', v_written
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_cat_workflow_assignments_for_case(uuid) TO authenticated;

-- 髒資料 backfill（idempotent；執行前須先確認 inventory 文件）
UPDATE public.cat_stage_assignments a
SET workflow_status = 'completed',
    updated_at = now()
FROM public.cat_file_workflow_stages s
WHERE a.file_workflow_stage_id = s.id
  AND s.status = 'completed'
  AND a.workflow_status IS DISTINCT FROM 'completed';
