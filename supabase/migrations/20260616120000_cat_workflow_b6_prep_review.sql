-- Phase B-6：檔案準備（prep）步驟、派出閘門、審稿任務完成鋪路

-- ---------------------------------------------------------------------------
-- 1. 擴充 stage_kind / stage_order
-- ---------------------------------------------------------------------------
ALTER TABLE public.cat_workflow_template_stages
  DROP CONSTRAINT IF EXISTS cat_workflow_template_stages_stage_kind_check;
ALTER TABLE public.cat_file_workflow_stages
  DROP CONSTRAINT IF EXISTS cat_file_workflow_stages_stage_kind_check;
ALTER TABLE public.cat_workflow_template_stages
  DROP CONSTRAINT IF EXISTS cat_workflow_template_stages_stage_order_check;
ALTER TABLE public.cat_file_workflow_stages
  DROP CONSTRAINT IF EXISTS cat_file_workflow_stages_stage_order_check;

ALTER TABLE public.cat_workflow_template_stages
  ADD CONSTRAINT cat_workflow_template_stages_stage_kind_check
  CHECK (stage_kind IN ('prep', 'translate', 'review'));
ALTER TABLE public.cat_file_workflow_stages
  ADD CONSTRAINT cat_file_workflow_stages_stage_kind_check
  CHECK (stage_kind IN ('prep', 'translate', 'review'));
ALTER TABLE public.cat_workflow_template_stages
  ADD CONSTRAINT cat_workflow_template_stages_stage_order_check
  CHECK (stage_order >= 0);
ALTER TABLE public.cat_file_workflow_stages
  ADD CONSTRAINT cat_file_workflow_stages_stage_order_check
  CHECK (stage_order >= 0);

-- ---------------------------------------------------------------------------
-- 2. 範本：插入 prep（order 0）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_cat_project_default_workflow_template(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template_id uuid;
BEGIN
  SELECT id INTO v_template_id
  FROM public.cat_workflow_templates
  WHERE project_id = p_project_id AND is_default = true
  LIMIT 1;

  IF v_template_id IS NULL THEN
    INSERT INTO public.cat_workflow_templates (project_id, name, is_default)
    VALUES (p_project_id, '預設', true)
    RETURNING id INTO v_template_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cat_workflow_template_stages
    WHERE template_id = v_template_id AND stage_kind = 'prep'
  ) THEN
    INSERT INTO public.cat_workflow_template_stages (template_id, stage_order, stage_kind, label)
    VALUES (v_template_id, 0, 'prep', '檔案準備');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cat_workflow_template_stages
    WHERE template_id = v_template_id AND stage_order = 1
  ) THEN
    INSERT INTO public.cat_workflow_template_stages (template_id, stage_order, stage_kind, label)
    VALUES (v_template_id, 1, 'translate', '翻譯');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cat_workflow_template_stages
    WHERE template_id = v_template_id AND stage_order = 2
  ) THEN
    INSERT INTO public.cat_workflow_template_stages (template_id, stage_order, stage_kind, label)
    VALUES (v_template_id, 2, 'review', '審稿');
  END IF;

  RETURN v_template_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. 新檔三步驟；既有檔僅在無任何步驟時建立
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_cat_file_workflow_stages(p_file_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_now timestamptz := now();
BEGIN
  SELECT project_id INTO v_project_id
  FROM public.cat_files
  WHERE id = p_file_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.cat_file_workflow_stages WHERE file_id = p_file_id) THEN
    RETURN;
  END IF;

  PERFORM public.ensure_cat_project_default_workflow_template(v_project_id);

  INSERT INTO public.cat_file_workflow_stages (
    file_id, stage_order, stage_kind, label, status, started_at, completed_at, created_at, updated_at
  ) VALUES
    (p_file_id, 0, 'prep', '檔案準備', 'active', v_now, NULL, v_now, v_now),
    (p_file_id, 1, 'translate', '翻譯', 'pending', NULL, NULL, v_now, v_now),
    (p_file_id, 2, 'review', '審稿', 'pending', NULL, NULL, v_now, v_now);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. 既有檔 backfill prep
-- ---------------------------------------------------------------------------
INSERT INTO public.cat_file_workflow_stages (
  file_id, stage_order, stage_kind, label, status, started_at, completed_at, created_at, updated_at
)
SELECT
  f.id,
  0,
  'prep',
  '檔案準備',
  CASE
    WHEN f.related_lms_case_id IS NOT NULL THEN 'completed'
    WHEN EXISTS (
      SELECT 1 FROM public.cat_file_workflow_stages t
      WHERE t.file_id = f.id AND t.stage_kind = 'translate' AND t.status <> 'pending'
    ) THEN 'completed'
    ELSE 'active'
  END,
  now(),
  CASE
    WHEN f.related_lms_case_id IS NOT NULL THEN now()
    WHEN EXISTS (
      SELECT 1 FROM public.cat_file_workflow_stages t
      WHERE t.file_id = f.id AND t.stage_kind = 'translate' AND t.status <> 'pending'
    ) THEN now()
    ELSE NULL
  END,
  now(),
  now()
FROM public.cat_files f
WHERE NOT EXISTS (
  SELECT 1 FROM public.cat_file_workflow_stages s
  WHERE s.file_id = f.id AND s.stage_kind = 'prep'
);

-- 範本 backfill
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.cat_projects LOOP
    PERFORM public.ensure_cat_project_default_workflow_template(r.id);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. 派出閘門 RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_case_linked_files_not_prep_ready(p_case_id uuid)
RETURNS TABLE(file_id uuid, file_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.name
  FROM public.cat_files f
  INNER JOIN public.cat_file_workflow_stages s
    ON s.file_id = f.id AND s.stage_kind = 'prep'
  WHERE f.related_lms_case_id = p_case_id
    AND s.status <> 'completed';
$$;

CREATE OR REPLACE FUNCTION public.cat_case_all_linked_files_prep_ready(p_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.cat_case_linked_files_not_prep_ready(p_case_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.cat_case_linked_files_not_prep_ready(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cat_case_all_linked_files_prep_ready(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. 派出同步：僅 prep 已完成且案件已派出時啟動翻譯步
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_revert_workflow_stages_for_case(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_file_id uuid;
  v_case_status text;
  v_prep_ok boolean;
BEGIN
  SELECT status INTO v_case_status FROM public.cases WHERE id = p_case_id;

  FOR v_file_id IN
    SELECT f.id FROM public.cat_files f WHERE f.related_lms_case_id = p_case_id
  LOOP
    PERFORM public.ensure_cat_file_workflow_stages(v_file_id);

    SELECT (
      NOT EXISTS (
        SELECT 1 FROM public.cat_file_workflow_stages
        WHERE file_id = v_file_id AND stage_kind = 'prep'
      )
      OR EXISTS (
        SELECT 1 FROM public.cat_file_workflow_stages
        WHERE file_id = v_file_id AND stage_kind = 'prep' AND status = 'completed'
      )
    ) INTO v_prep_ok;

    IF v_prep_ok AND v_case_status = 'dispatched' THEN
      UPDATE public.cat_file_workflow_stages
      SET status = 'active', started_at = coalesce(started_at, now()), updated_at = now()
      WHERE file_id = v_file_id AND stage_kind = 'translate' AND status = 'pending';
    END IF;

    UPDATE public.cat_file_workflow_stages
    SET status = 'pending', updated_at = now()
    WHERE file_id = v_file_id AND stage_kind = 'review' AND status = 'active';
  END LOOP;
END;
$$;
