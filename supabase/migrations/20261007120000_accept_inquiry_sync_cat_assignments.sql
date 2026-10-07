-- TASK-002 A：譯者承接後於同一交易呼叫私有 CAT 同步。
-- 有綁定檔卻寫入 0 筆、找不到案件或結果不明則整筆回滾，避免 LMS 承接成功、CAT 沒有權限。
-- 只呼叫 private.sync_cat_*_impl，不放寬 public.lms_sync_* 給譯者。
-- 不含留言遷移、不含 20261006*。

CREATE OR REPLACE FUNCTION private.accept_sync_cat_assignments_after_inquiry(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_file_count integer;
  v_wf jsonb;
  v_written integer;
BEGIN
  PERFORM private.sync_cat_file_assignments_for_case_impl(p_case_id);
  v_wf := private.sync_cat_workflow_assignments_for_case_impl(p_case_id);

  IF v_wf IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0003', message = 'cat_sync_unknown_result';
  END IF;

  IF coalesce((v_wf->>'found')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION USING errcode = 'P0003', message = 'cat_sync_case_not_found';
  END IF;

  IF (v_wf ? 'written') IS NOT TRUE THEN
    RAISE EXCEPTION USING errcode = 'P0003', message = 'cat_sync_unknown_result';
  END IF;

  SELECT count(*)::integer
    INTO v_file_count
  FROM public.cat_files f
  WHERE f.related_lms_case_id = p_case_id;

  v_written := coalesce((v_wf->>'written')::integer, 0);

  IF v_file_count > 0 AND v_written = 0 THEN
    RAISE EXCEPTION
      USING errcode = 'P0003',
            message = 'cat_sync_wrote_zero',
            detail = v_wf::text;
  END IF;

  RETURN v_wf || jsonb_build_object('linkedFileCount', v_file_count);
END;
$function$;

REVOKE ALL ON FUNCTION private.accept_sync_cat_assignments_after_inquiry(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.accept_public_inquiry_case_impl(p_case_id uuid, p_expected_revision bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_case public.cases%rowtype;
  v_name text;
  v_revision bigint;
  v_cat_sync jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'not_authorized';
  END IF;
  PERFORM private.p0_assert_translator_eligible(v_actor);

  SELECT * INTO v_case
  FROM public.cases c
  WHERE c.id = p_case_id AND c.env = v_env
  FOR UPDATE;
  IF NOT FOUND OR v_case.status <> 'inquiry' OR v_case.multi_collab THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'case_unavailable';
  END IF;
  IF v_case.revision <> p_expected_revision THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'case_revision_conflict';
  END IF;

  v_name := private.case_actor_display_name(v_actor);

  IF jsonb_typeof(v_case.translator) = 'array'
     AND jsonb_array_length(v_case.translator) > 0
     AND NOT (v_case.translator @> jsonb_build_array(v_name))
  THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'other_translator_pending';
  END IF;

  UPDATE public.cases c SET
    status = 'dispatched',
    translator = CASE
      WHEN jsonb_typeof(c.translator) = 'array' AND c.translator @> jsonb_build_array(v_name) THEN c.translator
      WHEN jsonb_typeof(c.translator) = 'array' THEN c.translator || jsonb_build_array(v_name)
      ELSE jsonb_build_array(v_name)
    END,
    updated_at = now()
  WHERE c.id = p_case_id AND c.env = v_env AND c.revision = p_expected_revision
  RETURNING c.revision INTO v_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'case_revision_conflict';
  END IF;

  INSERT INTO public.case_participants(
    case_id, user_id, role, work_status, source, created_by, updated_by
  ) VALUES (
    p_case_id, v_actor, 'translator', 'active', 'public_inquiry_accept', v_actor, v_actor
  )
  ON CONFLICT (case_id, user_id, role) DO UPDATE SET
    work_status = 'active',
    source = 'public_inquiry_accept',
    access_revoked_at = NULL,
    access_revoked_by = NULL,
    updated_by = v_actor,
    updated_at = now();

  PERFORM private.record_case_mutation(
    p_case_id, v_env, v_actor, 'accept_public_inquiry_case',
    ARRAY['status', 'translator'], p_expected_revision, v_revision
  );

  v_cat_sync := private.accept_sync_cat_assignments_after_inquiry(p_case_id);

  RETURN jsonb_build_object(
    'caseId', p_case_id,
    'revision', v_revision,
    'status', 'dispatched',
    'catSync', v_cat_sync
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.accept_inquiry_collab_row_impl(p_case_id uuid, p_collab_row_id text, p_expected_revision bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_case public.cases%rowtype;
  v_row jsonb;
  v_rows jsonb;
  v_name text;
  v_status text;
  v_revision bigint;
  v_cat_sync jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'not_authorized';
  END IF;
  PERFORM private.p0_assert_translator_eligible(v_actor);

  SELECT * INTO v_case
  FROM public.cases c
  WHERE c.id = p_case_id AND c.env = v_env
  FOR UPDATE;
  IF NOT FOUND OR v_case.status <> 'inquiry' OR NOT v_case.multi_collab THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'case_unavailable';
  END IF;

  SELECT r.value INTO v_row
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_case.collab_rows) = 'array'
      THEN v_case.collab_rows ELSE '[]'::jsonb END
  ) r
  WHERE r.value->>'id' = p_collab_row_id;
  IF NOT FOUND OR coalesce((v_row->>'accepted')::boolean, false) THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'collab_row_unavailable';
  END IF;

  IF nullif(v_row->>'translatorUserId', '') IS NOT NULL
     AND v_row->>'translatorUserId' <> v_actor::text
  THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'collab_row_not_assigned_to_actor';
  END IF;

  IF v_case.revision <> p_expected_revision THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'case_revision_conflict';
  END IF;

  v_name := private.case_actor_display_name(v_actor);

  SELECT jsonb_agg(
    CASE WHEN r.value->>'id' = p_collab_row_id THEN r.value || jsonb_build_object(
      'accepted', true, 'translator', v_name, 'translatorUserId', v_actor
    ) ELSE r.value END
    ORDER BY r.ordinality
  ) INTO v_rows
  FROM jsonb_array_elements(v_case.collab_rows) WITH ORDINALITY r(value, ordinality);

  v_status := CASE WHEN NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_rows) r
    WHERE NOT coalesce((r.value->>'accepted')::boolean, false)
  ) THEN 'dispatched' ELSE 'inquiry' END;

  UPDATE public.cases c SET
    collab_rows = v_rows,
    translator = (
      SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb)
      FROM (
        SELECT DISTINCT nullif(r.value->>'translator', '') AS name
        FROM jsonb_array_elements(v_rows) r
      ) names
      WHERE name IS NOT NULL
    ),
    status = v_status,
    updated_at = now()
  WHERE c.id = p_case_id AND c.env = v_env AND c.revision = p_expected_revision
  RETURNING c.revision INTO v_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'case_revision_conflict';
  END IF;

  INSERT INTO public.case_participants(
    case_id, user_id, role, work_status, source, created_by, updated_by
  ) VALUES (
    p_case_id, v_actor, 'translator', 'active', 'collab_accept', v_actor, v_actor
  )
  ON CONFLICT (case_id, user_id, role) DO UPDATE SET
    work_status = 'active',
    source = 'collab_accept',
    access_revoked_at = NULL,
    access_revoked_by = NULL,
    updated_by = v_actor,
    updated_at = now();

  PERFORM private.record_case_mutation(
    p_case_id, v_env, v_actor, 'accept_inquiry_collab_row',
    ARRAY['collab_rows', 'translator', 'status'], p_expected_revision, v_revision
  );

  v_cat_sync := private.accept_sync_cat_assignments_after_inquiry(p_case_id);

  RETURN jsonb_build_object(
    'caseId', p_case_id,
    'revision', v_revision,
    'status', v_status,
    'rowId', p_collab_row_id,
    'catSync', v_cat_sync
  );
END;
$function$;
