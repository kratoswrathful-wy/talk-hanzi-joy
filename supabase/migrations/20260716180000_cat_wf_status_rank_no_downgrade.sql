-- 工項 D：workflow_status 三態等級防降級（assigned < in_progress < completed）
-- 對齊 cat-tool/js/wf-assignment-sync-policy.js
-- p_allow_downgrade DEFAULT false；LMS sync 永不傳 true（僅 PM 重開可 true）
-- CHECK 已含 in_progress（20260612120000）；本檔僅改 upsert 函式，idempotent REPLACE

CREATE OR REPLACE FUNCTION public.cat_wf_status_rank(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(p_status, '')))
    WHEN 'completed' THEN 2
    WHEN 'in_progress' THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.cat_resolve_effective_upsert_workflow_status(
  p_stage_status text,
  p_existing_status text,
  p_requested_status text,
  p_allow_downgrade boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_existing text := coalesce(nullif(trim(p_existing_status), ''), '');
  v_requested text := coalesce(nullif(trim(p_requested_status), ''), 'assigned');
  v_stage text := coalesce(nullif(trim(p_stage_status), ''), '');
  v_allow boolean := coalesce(p_allow_downgrade, false);
BEGIN
  -- 2026-07-14：stage 仍 completed 時禁止洗回
  IF v_existing = 'completed'
     AND v_requested IS DISTINCT FROM 'completed'
     AND v_stage = 'completed'
     AND NOT v_allow THEN
    RETURN 'completed';
  END IF;

  -- 等級防降級；反向路徑：stage 已非 completed 時允許自 completed 降回
  IF public.cat_wf_status_rank(v_requested) < public.cat_wf_status_rank(v_existing)
     AND NOT v_allow THEN
    IF v_existing = 'completed' AND v_stage IS DISTINCT FROM 'completed' THEN
      RETURN v_requested;
    END IF;
    RETURN v_existing;
  END IF;

  RETURN v_requested;
END;
$$;

CREATE OR REPLACE FUNCTION public.cat_upsert_translate_stage_assignment(
  p_file_id uuid,
  p_assignee_user_id uuid,
  p_collab_row_id text,
  p_view_id uuid,
  p_scope_label text,
  p_line_start integer,
  p_line_end integer,
  p_workflow_status text,
  p_allow_downgrade boolean DEFAULT false
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

  v_effective := public.cat_resolve_effective_upsert_workflow_status(
    v_stage_status,
    v_existing_status,
    coalesce(nullif(trim(p_workflow_status), ''), 'assigned'),
    p_allow_downgrade
  );

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
  p_collab_row_id text,
  p_view_id uuid,
  p_scope_label text,
  p_line_start integer,
  p_line_end integer,
  p_workflow_status text,
  p_allow_downgrade boolean DEFAULT false
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

  IF nullif(trim(coalesce(p_collab_row_id, '')), '') IS NOT NULL THEN
    SELECT id, workflow_status INTO v_existing_id, v_existing_status
    FROM public.cat_stage_assignments
    WHERE collab_row_id = trim(p_collab_row_id)
    LIMIT 1;
  ELSE
    SELECT id, workflow_status INTO v_existing_id, v_existing_status
    FROM public.cat_stage_assignments
    WHERE file_id = p_file_id
      AND file_workflow_stage_id = v_review_stage_id
      AND assignee_user_id = p_assignee_user_id
      AND collab_row_id IS NULL
      AND coalesce(view_id::text, '') = coalesce(p_view_id::text, '')
      AND coalesce(line_start, -1) = coalesce(p_line_start, -1)
      AND coalesce(line_end, -1) = coalesce(p_line_end, -1)
    LIMIT 1;
  END IF;

  v_effective := public.cat_resolve_effective_upsert_workflow_status(
    v_stage_status,
    v_existing_status,
    coalesce(nullif(trim(p_workflow_status), ''), 'assigned'),
    p_allow_downgrade
  );

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
      p_file_id, p_view_id, v_review_stage_id, p_assignee_user_id,
      p_line_start, p_line_end, nullif(trim(coalesce(p_scope_label, '')), ''),
      v_effective, nullif(trim(coalesce(p_collab_row_id, '')), ''), now(), now()
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.cat_resolve_effective_upsert_workflow_status IS
  '工項 D：upsert 實際寫入 workflow_status；sync 不傳 p_allow_downgrade（DEFAULT false）';
