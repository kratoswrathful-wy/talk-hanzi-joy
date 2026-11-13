-- TASK-001 0356：成功寫入必須推進伺服器版本（clock_timestamp），
-- 無實質變更不製造新版本。公開入口與授權維持不變。正式庫本輪不套用。

CREATE OR REPLACE FUNCTION private.apply_internal_note_update_impl(
  p_note_id uuid,
  p_patch jsonb,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_row public.internal_notes%rowtype;
  v_unknown text;
  v_updated int;
  v_material boolean := false;
  v_next_updated_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF p_expected_updated_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_updated_at');
  END IF;

  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_patch');
  END IF;

  IF p_patch ? 'id'
     OR p_patch ? 'env'
     OR p_patch ? 'created_by'
     OR p_patch ? 'created_at'
     OR p_patch ? 'updated_at' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server_owned_key');
  END IF;

  SELECT k INTO v_unknown
  FROM jsonb_object_keys(p_patch) AS t(k)
  WHERE k NOT IN (
    'title',
    'related_case',
    'creator',
    'status',
    'note_type',
    'internal_assignee',
    'file_name',
    'id_row_count',
    'source_text',
    'translated_text',
    'question_or_note',
    'question_or_note_blocks',
    'reference_files',
    'comments',
    'invalidated',
    'invalidated_by',
    'invalidated_at',
    'invalidation_reason',
    'edit_logs',
    'edit_log_started_at',
    'consultation_slack_records'
  )
  LIMIT 1;

  IF v_unknown IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_patch_key');
  END IF;

  SELECT * INTO v_row
  FROM public.internal_notes n
  WHERE n.id = p_note_id AND n.env = v_env
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'note_unavailable');
  END IF;

  IF v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_updated_at');
  END IF;

  IF p_patch ? 'title' AND coalesce(p_patch->>'title', '') IS DISTINCT FROM v_row.title THEN
    v_material := true;
  ELSIF p_patch ? 'related_case' AND coalesce(p_patch->>'related_case', '') IS DISTINCT FROM v_row.related_case THEN
    v_material := true;
  ELSIF p_patch ? 'creator' AND coalesce(p_patch->>'creator', '') IS DISTINCT FROM v_row.creator THEN
    v_material := true;
  ELSIF p_patch ? 'status' AND coalesce(p_patch->>'status', '') IS DISTINCT FROM v_row.status THEN
    v_material := true;
  ELSIF p_patch ? 'note_type' AND coalesce(p_patch->>'note_type', '') IS DISTINCT FROM v_row.note_type THEN
    v_material := true;
  ELSIF p_patch ? 'internal_assignee' AND p_patch->'internal_assignee' IS DISTINCT FROM v_row.internal_assignee THEN
    v_material := true;
  ELSIF p_patch ? 'file_name' AND coalesce(p_patch->>'file_name', '') IS DISTINCT FROM v_row.file_name THEN
    v_material := true;
  ELSIF p_patch ? 'id_row_count' AND coalesce(p_patch->>'id_row_count', '') IS DISTINCT FROM v_row.id_row_count THEN
    v_material := true;
  ELSIF p_patch ? 'source_text' AND coalesce(p_patch->>'source_text', '') IS DISTINCT FROM v_row.source_text THEN
    v_material := true;
  ELSIF p_patch ? 'translated_text' AND coalesce(p_patch->>'translated_text', '') IS DISTINCT FROM v_row.translated_text THEN
    v_material := true;
  ELSIF p_patch ? 'question_or_note' AND coalesce(p_patch->>'question_or_note', '') IS DISTINCT FROM v_row.question_or_note THEN
    v_material := true;
  ELSIF p_patch ? 'question_or_note_blocks' AND p_patch->'question_or_note_blocks' IS DISTINCT FROM v_row.question_or_note_blocks THEN
    v_material := true;
  ELSIF p_patch ? 'reference_files' AND p_patch->'reference_files' IS DISTINCT FROM v_row.reference_files THEN
    v_material := true;
  ELSIF p_patch ? 'comments' AND p_patch->'comments' IS DISTINCT FROM v_row.comments THEN
    v_material := true;
  ELSIF p_patch ? 'invalidated' AND coalesce((p_patch->>'invalidated')::boolean, false) IS DISTINCT FROM v_row.invalidated THEN
    v_material := true;
  ELSIF p_patch ? 'invalidated_by' THEN
    IF (
      CASE
        WHEN p_patch->'invalidated_by' = 'null'::jsonb THEN NULL
        ELSE p_patch->>'invalidated_by'
      END
    ) IS DISTINCT FROM v_row.invalidated_by THEN
      v_material := true;
    END IF;
  END IF;

  IF NOT v_material THEN
    IF p_patch ? 'invalidated_at' THEN
      IF (
        CASE
          WHEN p_patch->'invalidated_at' = 'null'::jsonb OR nullif(p_patch->>'invalidated_at', '') IS NULL THEN NULL
          ELSE (p_patch->>'invalidated_at')::timestamptz
        END
      ) IS DISTINCT FROM v_row.invalidated_at THEN
        v_material := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_material THEN
    IF p_patch ? 'invalidation_reason' THEN
      IF (
        CASE
          WHEN p_patch->'invalidation_reason' = 'null'::jsonb THEN NULL
          ELSE p_patch->>'invalidation_reason'
        END
      ) IS DISTINCT FROM v_row.invalidation_reason THEN
        v_material := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_material AND p_patch ? 'edit_logs' AND p_patch->'edit_logs' IS DISTINCT FROM v_row.edit_logs THEN
    v_material := true;
  END IF;

  IF NOT v_material AND p_patch ? 'edit_log_started_at' THEN
    IF (
      CASE
        WHEN p_patch->'edit_log_started_at' = 'null'::jsonb OR nullif(p_patch->>'edit_log_started_at', '') IS NULL THEN NULL
        ELSE (p_patch->>'edit_log_started_at')::timestamptz
      END
    ) IS DISTINCT FROM v_row.edit_log_started_at THEN
      v_material := true;
    END IF;
  END IF;

  IF NOT v_material
     AND p_patch ? 'consultation_slack_records'
     AND p_patch->'consultation_slack_records' IS DISTINCT FROM v_row.consultation_slack_records THEN
    v_material := true;
  END IF;

  IF NOT v_material THEN
    RETURN jsonb_build_object('ok', true, 'note', to_jsonb(v_row), 'noop', true);
  END IF;

  v_next_updated_at := clock_timestamp();

  UPDATE public.internal_notes n SET
    title = CASE WHEN p_patch ? 'title' THEN coalesce(p_patch->>'title', '') ELSE n.title END,
    related_case = CASE WHEN p_patch ? 'related_case' THEN coalesce(p_patch->>'related_case', '') ELSE n.related_case END,
    creator = CASE WHEN p_patch ? 'creator' THEN coalesce(p_patch->>'creator', '') ELSE n.creator END,
    status = CASE WHEN p_patch ? 'status' THEN coalesce(p_patch->>'status', '') ELSE n.status END,
    note_type = CASE WHEN p_patch ? 'note_type' THEN coalesce(p_patch->>'note_type', '') ELSE n.note_type END,
    internal_assignee = CASE WHEN p_patch ? 'internal_assignee' THEN p_patch->'internal_assignee' ELSE n.internal_assignee END,
    file_name = CASE WHEN p_patch ? 'file_name' THEN coalesce(p_patch->>'file_name', '') ELSE n.file_name END,
    id_row_count = CASE WHEN p_patch ? 'id_row_count' THEN coalesce(p_patch->>'id_row_count', '') ELSE n.id_row_count END,
    source_text = CASE WHEN p_patch ? 'source_text' THEN coalesce(p_patch->>'source_text', '') ELSE n.source_text END,
    translated_text = CASE WHEN p_patch ? 'translated_text' THEN coalesce(p_patch->>'translated_text', '') ELSE n.translated_text END,
    question_or_note = CASE WHEN p_patch ? 'question_or_note' THEN coalesce(p_patch->>'question_or_note', '') ELSE n.question_or_note END,
    question_or_note_blocks = CASE WHEN p_patch ? 'question_or_note_blocks' THEN p_patch->'question_or_note_blocks' ELSE n.question_or_note_blocks END,
    reference_files = CASE WHEN p_patch ? 'reference_files' THEN p_patch->'reference_files' ELSE n.reference_files END,
    comments = CASE WHEN p_patch ? 'comments' THEN p_patch->'comments' ELSE n.comments END,
    invalidated = CASE WHEN p_patch ? 'invalidated' THEN coalesce((p_patch->>'invalidated')::boolean, false) ELSE n.invalidated END,
    invalidated_by = CASE
      WHEN NOT (p_patch ? 'invalidated_by') THEN n.invalidated_by
      WHEN p_patch->'invalidated_by' = 'null'::jsonb THEN NULL
      ELSE p_patch->>'invalidated_by'
    END,
    invalidated_at = CASE
      WHEN NOT (p_patch ? 'invalidated_at') THEN n.invalidated_at
      WHEN p_patch->'invalidated_at' = 'null'::jsonb OR nullif(p_patch->>'invalidated_at', '') IS NULL THEN NULL
      ELSE (p_patch->>'invalidated_at')::timestamptz
    END,
    invalidation_reason = CASE
      WHEN NOT (p_patch ? 'invalidation_reason') THEN n.invalidation_reason
      WHEN p_patch->'invalidation_reason' = 'null'::jsonb THEN NULL
      ELSE p_patch->>'invalidation_reason'
    END,
    edit_logs = CASE WHEN p_patch ? 'edit_logs' THEN p_patch->'edit_logs' ELSE n.edit_logs END,
    edit_log_started_at = CASE
      WHEN NOT (p_patch ? 'edit_log_started_at') THEN n.edit_log_started_at
      WHEN p_patch->'edit_log_started_at' = 'null'::jsonb OR nullif(p_patch->>'edit_log_started_at', '') IS NULL THEN NULL
      ELSE (p_patch->>'edit_log_started_at')::timestamptz
    END,
    consultation_slack_records = CASE
      WHEN p_patch ? 'consultation_slack_records' THEN p_patch->'consultation_slack_records'
      ELSE n.consultation_slack_records
    END,
    updated_at = v_next_updated_at
  WHERE n.id = p_note_id
    AND n.env = v_env
    AND n.updated_at IS NOT DISTINCT FROM p_expected_updated_at;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_updated_at');
  END IF;

  SELECT * INTO v_row
  FROM public.internal_notes n
  WHERE n.id = p_note_id AND n.env = v_env;

  IF v_row.updated_at IS NOT DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_not_advanced');
  END IF;

  RETURN jsonb_build_object('ok', true, 'note', to_jsonb(v_row));
END;
$function$;

REVOKE ALL ON FUNCTION private.apply_internal_note_update_impl(uuid, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_internal_note_update(
  p_note_id uuid,
  p_patch jsonb,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM private.assert_maintenance_write_allowed();
  RETURN private.apply_internal_note_update_impl(p_note_id, p_patch, p_expected_updated_at);
END;
$function$;

COMMENT ON FUNCTION public.apply_internal_note_update(uuid, jsonb, timestamptz) IS
  'TASK-001 0356：內部註記條件更新公開入口；成功實質寫入推進 updated_at';

COMMENT ON FUNCTION private.apply_internal_note_update_impl(uuid, jsonb, timestamptz) IS
  'TASK-001 0356：只改 patch 欄；成功推進 clock_timestamp()；不符回 stale_updated_at；不授予 authenticated';

REVOKE ALL ON FUNCTION public.apply_internal_note_update(uuid, jsonb, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_internal_note_update(uuid, jsonb, timestamptz)
  TO authenticated, service_role;
