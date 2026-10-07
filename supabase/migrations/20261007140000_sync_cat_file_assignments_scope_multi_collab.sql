-- TASK-002 A 補修：多人協作不得把 cases.translator 交叉掛到本案所有 CAT 檔。
-- 詢案／草稿只寫已承接列的 linkedCatFileId；已派出寫各列自己的檔。
-- 單人案維持「譯者／審稿名稱 × 本案所有檔」只新增不刪。
-- 不含留言遷移。

CREATE OR REPLACE FUNCTION private.sync_cat_file_assignments_for_case_impl(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_translator_json jsonb;
  v_reviewer_name   text;
  v_multi_collab    boolean;
  v_case_status     text;
  v_collab_rows     jsonb;
  v_row             jsonb;
  v_requires_accepted boolean;
  v_file_id         uuid;
  v_view_id         uuid;
  v_assignee_id     uuid;
  v_translator_name text;
  v_translator_user_id text;
  v_translator_names text[];
  v_assignee_names  text[];
  v_user_ids        uuid[];
  v_file_ids        uuid[];
BEGIN
  SELECT translator, reviewer, multi_collab, status, collab_rows
    INTO v_translator_json, v_reviewer_name, v_multi_collab, v_case_status, v_collab_rows
    FROM public.cases
    WHERE id = p_case_id;

  IF coalesce(v_multi_collab, false) AND jsonb_typeof(v_collab_rows) = 'array' THEN
    v_requires_accepted := v_case_status IN ('draft', 'inquiry');

    FOR v_row IN SELECT value FROM jsonb_array_elements(v_collab_rows) AS t(value) LOOP
      IF v_requires_accepted AND NOT coalesce((v_row->>'accepted')::boolean, false) THEN
        CONTINUE;
      END IF;

      v_translator_name := trim(coalesce(v_row->>'translator', ''));
      v_translator_user_id := nullif(trim(coalesce(v_row->>'translatorUserId', '')), '');
      IF v_translator_name = '' AND v_translator_user_id IS NULL THEN
        CONTINUE;
      END IF;

      v_assignee_id := public.cat_resolve_profile_id_dual(v_translator_user_id, v_translator_name);
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

      INSERT INTO public.cat_file_assignments
        (file_id, assignee_user_id, assigned_by, status, assigned_at, updated_at)
      VALUES (v_file_id, v_assignee_id, NULL, 'assigned', now(), now())
      ON CONFLICT (file_id, assignee_user_id) DO NOTHING;
    END LOOP;

    RETURN;
  END IF;

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

  SELECT array_agg(DISTINCT p.id)
    INTO v_user_ids
    FROM public.profiles p
    WHERE p.display_name = ANY (v_assignee_names)
       OR p.email        = ANY (v_assignee_names);

  IF v_user_ids IS NULL OR cardinality(v_user_ids) = 0 THEN
    RETURN;
  END IF;

  SELECT array_agg(f.id)
    INTO v_file_ids
    FROM public.cat_files f
    WHERE f.related_lms_case_id = p_case_id;

  IF v_file_ids IS NULL OR cardinality(v_file_ids) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.cat_file_assignments
    (file_id, assignee_user_id, assigned_by, status, assigned_at, updated_at)
  SELECT f.fid, u.uid, NULL, 'assigned', now(), now()
    FROM unnest(v_file_ids) AS f(fid)
    CROSS JOIN unnest(v_user_ids) AS u(uid)
  ON CONFLICT (file_id, assignee_user_id) DO NOTHING;
END;
$function$;
