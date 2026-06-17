-- B-7a：cat_stage_assignments.first_edited_at（受派範圍內首次改譯文）

ALTER TABLE public.cat_stage_assignments
  ADD COLUMN IF NOT EXISTS first_edited_at timestamptz;

COMMENT ON COLUMN public.cat_stage_assignments.first_edited_at IS
  '受派人在指派範圍內首次修改譯文時間；顯示層「待開始／進行中」依此與 workflow_status 判定。';

-- 僅受派人本人、且尚未寫入時可設值
CREATE OR REPLACE FUNCTION public.cat_mark_stage_assignment_first_edited(
  p_assignment_id uuid
)
RETURNS public.cat_stage_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.cat_stage_assignments;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.cat_stage_assignments AS a
  SET
    first_edited_at = now(),
    updated_at = now()
  WHERE a.id = p_assignment_id
    AND a.assignee_user_id = v_uid
    AND a.first_edited_at IS NULL
  RETURNING a.* INTO v_row;

  IF v_row.id IS NOT NULL THEN
    RETURN v_row;
  END IF;

  SELECT * INTO v_row
  FROM public.cat_stage_assignments
  WHERE id = p_assignment_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'assignment not found';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cat_mark_stage_assignment_first_edited(uuid) TO authenticated;
