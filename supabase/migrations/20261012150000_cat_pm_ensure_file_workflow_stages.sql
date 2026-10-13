-- TASK-002：未指派／缺階段可由 PM 經有檢查的入口補齊。
-- 內層 ensure 仍只給 service_role 與其他 SECURITY DEFINER 呼叫；
-- 登入者改走 cat_pm_ensure_file_workflow_stages（is_admin + 同 env）。
-- 部分缺漏只插入缺少的步驟，不覆寫既有狀態、日期或指派。
-- idempotent。本檔尚未套用正式庫。

CREATE OR REPLACE FUNCTION public.ensure_cat_file_workflow_stages(p_file_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_project_id uuid;
  v_now timestamptz := now();
  v_has_prep boolean;
  v_has_translate boolean;
  v_has_review boolean;
  v_prep_status text;
  v_prep_completed_at timestamptz;
BEGIN
  SELECT project_id INTO v_project_id
  FROM public.cat_files
  WHERE id = p_file_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM public.cat_file_workflow_stages
      WHERE file_id = p_file_id AND stage_kind = 'prep'
    ),
    EXISTS (
      SELECT 1 FROM public.cat_file_workflow_stages
      WHERE file_id = p_file_id AND stage_kind = 'translate'
    ),
    EXISTS (
      SELECT 1 FROM public.cat_file_workflow_stages
      WHERE file_id = p_file_id AND stage_kind = 'review'
    )
  INTO v_has_prep, v_has_translate, v_has_review;

  IF v_has_prep AND v_has_translate AND v_has_review THEN
    RETURN;
  END IF;

  PERFORM public.ensure_cat_project_default_workflow_template(v_project_id);

  IF NOT v_has_prep THEN
    IF EXISTS (
      SELECT 1 FROM public.cat_file_workflow_stages
      WHERE file_id = p_file_id
        AND stage_kind IN ('translate', 'review')
        AND status IS DISTINCT FROM 'pending'
    ) THEN
      v_prep_status := 'completed';
      v_prep_completed_at := v_now;
    ELSE
      v_prep_status := 'active';
      v_prep_completed_at := NULL;
    END IF;

    INSERT INTO public.cat_file_workflow_stages (
      file_id, stage_order, stage_kind, label, status, started_at, completed_at, created_at, updated_at
    ) VALUES (
      p_file_id, 0, 'prep', '檔案準備', v_prep_status, v_now, v_prep_completed_at, v_now, v_now
    );
  END IF;

  IF NOT v_has_translate THEN
    INSERT INTO public.cat_file_workflow_stages (
      file_id, stage_order, stage_kind, label, status, started_at, completed_at, created_at, updated_at
    ) VALUES (
      p_file_id, 1, 'translate', '翻譯', 'pending', NULL, NULL, v_now, v_now
    );
  END IF;

  IF NOT v_has_review THEN
    INSERT INTO public.cat_file_workflow_stages (
      file_id, stage_order, stage_kind, label, status, started_at, completed_at, created_at, updated_at
    ) VALUES (
      p_file_id, 2, 'review', '審稿', 'pending', NULL, NULL, v_now, v_now
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_cat_file_workflow_stages(uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_cat_file_workflow_stages(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cat_pm_ensure_file_workflow_stages(p_file_id uuid)
RETURNS SETOF public.cat_file_workflow_stages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_env text := public.current_env();
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'not_authorized';
  END IF;
  IF p_file_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.cat_files f
       WHERE f.id = p_file_id AND f.env = v_env
     ) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'not_authorized';
  END IF;

  PERFORM public.ensure_cat_file_workflow_stages(p_file_id);

  RETURN QUERY
    SELECT s.*
    FROM public.cat_file_workflow_stages s
    WHERE s.file_id = p_file_id
    ORDER BY s.stage_order;
END;
$$;

REVOKE ALL ON FUNCTION public.cat_pm_ensure_file_workflow_stages(uuid)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cat_pm_ensure_file_workflow_stages(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.ensure_cat_file_workflow_stages(uuid) IS
  '內層補齊 prep／translate／review；缺哪步補哪步，不覆寫既有列。不開放 authenticated。';
COMMENT ON FUNCTION public.cat_pm_ensure_file_workflow_stages(uuid) IS
  'PM／執行長同 env 補齊檔案流程階段；不新增指派。';
