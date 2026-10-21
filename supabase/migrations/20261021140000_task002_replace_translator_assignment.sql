-- 換譯者時覆寫同一列／同一範圍，不累積舊譯者。
-- 本輪只套隔離庫；正式庫 db push 不在本包。

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
  v_collab_row_id text;
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

  v_collab_row_id := nullif(trim(coalesce(p_collab_row_id, '')), '');

  IF v_collab_row_id IS NOT NULL THEN
    SELECT id, workflow_status INTO v_existing_id, v_existing_status
    FROM public.cat_stage_assignments
    WHERE collab_row_id = v_collab_row_id
      AND file_workflow_stage_id = v_translate_stage_id
    LIMIT 1;
  END IF;

  IF v_existing_id IS NULL THEN
    SELECT id, workflow_status INTO v_existing_id, v_existing_status
    FROM public.cat_stage_assignments
    WHERE file_id = p_file_id
      AND file_workflow_stage_id = v_translate_stage_id
      AND coalesce(view_id::text, '') = coalesce(p_view_id::text, '')
      AND coalesce(line_start, -1) = coalesce(p_line_start, -1)
      AND coalesce(line_end, -1) = coalesce(p_line_end, -1)
    ORDER BY CASE WHEN assignee_user_id = p_assignee_user_id THEN 0 ELSE 1 END
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
        collab_row_id = v_collab_row_id,
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
      v_effective, v_collab_row_id, now(), now()
    );
  END IF;

  IF v_collab_row_id IS NOT NULL THEN
    DELETE FROM public.cat_stage_assignments
    WHERE file_id = p_file_id
      AND file_workflow_stage_id = v_translate_stage_id
      AND collab_row_id = v_collab_row_id
      AND assignee_user_id IS DISTINCT FROM p_assignee_user_id;
  ELSE
    DELETE FROM public.cat_stage_assignments
    WHERE file_id = p_file_id
      AND file_workflow_stage_id = v_translate_stage_id
      AND collab_row_id IS NULL
      AND coalesce(view_id::text, '') = coalesce(p_view_id::text, '')
      AND coalesce(line_start, -1) = coalesce(p_line_start, -1)
      AND coalesce(line_end, -1) = coalesce(p_line_end, -1)
      AND assignee_user_id IS DISTINCT FROM p_assignee_user_id;
  END IF;
END;
$$;
