-- 派案重構 P2：同步統一 + UUID 雙寫配對 + 不靜默失敗
-- 規劃：docs/CAT_LMS_ASSIGN_REDESIGN_PLAN_2026-06.md
--
-- 變更重點：
--  1. 新增 cat_resolve_profile_id_dual(user_id, name)：優先用帳號編號（UUID），配不到才退回名字。
--  2. sync_cat_workflow_assignments_for_case 改寫：
--     - 不再單純依賴 accepted；草稿／詢案中才要求 accepted，已派出（含之後）視同全員生效，
--       修正「已派出後改派工卻不同步、譯者顯示整檔且無法編輯」的根因。
--     - 譯者改用 dual 解析（translatorUserId 優先）。
--     - 回傳 jsonb 失敗報告（配不到帳號的譯者名單、有譯者卻無連結檔的列數、寫入筆數），供前端提示 PM。

-- ── 1. 雙重解析（UUID 優先，名字後備）──────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_resolve_profile_id_dual(p_user_id text, p_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_id uuid;
BEGIN
  BEGIN
    IF nullif(trim(coalesce(p_user_id, '')), '') IS NOT NULL THEN
      SELECT p.id INTO v_id
      FROM public.profiles p
      WHERE p.id = trim(p_user_id)::uuid
      LIMIT 1;
      IF v_id IS NOT NULL THEN
        RETURN v_id;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_id := NULL;
  END;
  RETURN public.cat_resolve_profile_id(p_name);
END;
$$;

-- ── 2. 同步函式改寫（回傳型別改 jsonb，需先 DROP）──────────────────
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
  v_include boolean;
  v_requires_accepted boolean;
  -- 失敗報告
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

  -- 草稿／詢案中／已派出 → 連結檔 workflow 步驟退回翻譯進行中
  IF v_case_status IN ('draft', 'inquiry', 'dispatched') THEN
    PERFORM public.cat_revert_workflow_stages_for_case(p_case_id);
  END IF;

  -- 僅在草稿／詢案中要求「確認承接」；已派出（含之後）視同全員生效
  v_requires_accepted := v_case_status IN ('draft', 'inquiry');

  IF coalesce(v_multi_collab, false) AND jsonb_typeof(v_collab_rows) = 'array' THEN
    -- (a) 收集有效 collab_row_id
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

    -- (b) 清除過期翻譯指派
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

    -- (c) 寫入翻譯段落指派
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
      v_written := v_written + 1;
    END LOOP;
  ELSE
    -- 單人案件：所有連結檔整檔翻譯指派
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
          PERFORM public.cat_upsert_translate_stage_assignment(
            v_file_id, v_assignee_id, NULL, NULL,
            NULL, NULL, NULL, 'assigned'
          );
          v_written := v_written + 1;
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  -- 審稿：案件 reviewer → 各連結檔整檔審稿指派（維持既有案件層級語意）
  v_reviewer_id := public.cat_resolve_profile_id_dual(NULL, trim(coalesce(v_reviewer_name, '')));
  IF v_reviewer_id IS NOT NULL THEN
    FOREACH v_file_id IN ARRAY v_file_ids LOOP
      PERFORM public.cat_upsert_review_stage_assignment(v_file_id, v_reviewer_id, 'assigned');
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

GRANT EXECUTE ON FUNCTION public.cat_resolve_profile_id_dual(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cat_workflow_assignments_for_case(uuid) TO authenticated;

-- ── 3. 回填既有協作列的譯者／審稿 UUID（只新增 translatorUserId / reviewerUserId）──
UPDATE public.cases c
SET collab_rows = (
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof(elem) = 'object' THEN
            elem
            || CASE
                 WHEN public.cat_resolve_profile_id(elem->>'translator') IS NOT NULL
                 THEN jsonb_build_object('translatorUserId', public.cat_resolve_profile_id(elem->>'translator')::text)
                 ELSE '{}'::jsonb
               END
            || CASE
                 WHEN public.cat_resolve_profile_id(elem->>'reviewer') IS NOT NULL
                 THEN jsonb_build_object('reviewerUserId', public.cat_resolve_profile_id(elem->>'reviewer')::text)
                 ELSE '{}'::jsonb
               END
          ELSE elem
        END
      )
      FROM jsonb_array_elements(c.collab_rows) AS elem
    ),
    updated_at = now()
WHERE coalesce(c.multi_collab, false) = true
  AND c.collab_rows IS NOT NULL
  AND jsonb_typeof(c.collab_rows) = 'array'
  AND jsonb_array_length(c.collab_rows) > 0;

-- ── 4. 重新同步所有多人協作案件，修正既有幽靈／缺漏指派 ────────────
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
