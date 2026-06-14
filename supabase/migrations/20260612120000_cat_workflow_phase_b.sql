-- Phase B：Workflow 資料模型（B-1）— 範本、檔案步驟、段落指派、句段 wf_* 欄位

-- ---------------------------------------------------------------------------
-- 1. 專案 Workflow 範本
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cat_workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.cat_projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '預設',
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS cat_workflow_templates_project_idx
  ON public.cat_workflow_templates(project_id);

CREATE TABLE IF NOT EXISTS public.cat_workflow_template_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.cat_workflow_templates(id) ON DELETE CASCADE,
  stage_order integer NOT NULL CHECK (stage_order > 0),
  stage_kind text NOT NULL CHECK (stage_kind IN ('translate', 'review')),
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, stage_order),
  UNIQUE (template_id, stage_kind)
);

CREATE INDEX IF NOT EXISTS cat_workflow_template_stages_template_idx
  ON public.cat_workflow_template_stages(template_id);

-- ---------------------------------------------------------------------------
-- 2. 檔案 Workflow 步驟實例
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cat_file_workflow_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.cat_files(id) ON DELETE CASCADE,
  stage_order integer NOT NULL CHECK (stage_order > 0),
  stage_kind text NOT NULL CHECK (stage_kind IN ('translate', 'review')),
  label text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, stage_order),
  UNIQUE (file_id, stage_kind)
);

CREATE INDEX IF NOT EXISTS cat_file_workflow_stages_file_idx
  ON public.cat_file_workflow_stages(file_id);
CREATE INDEX IF NOT EXISTS cat_file_workflow_stages_status_idx
  ON public.cat_file_workflow_stages(status);

-- ---------------------------------------------------------------------------
-- 3. 段落指派（Phase B；B-2 起 UI 使用）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cat_stage_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.cat_files(id) ON DELETE CASCADE,
  view_id uuid REFERENCES public.cat_views(id) ON DELETE CASCADE,
  file_workflow_stage_id uuid NOT NULL REFERENCES public.cat_file_workflow_stages(id) ON DELETE CASCADE,
  assignee_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  line_start integer,
  line_end integer,
  scope_label text,
  workflow_status text NOT NULL DEFAULT 'assigned'
    CHECK (workflow_status IN ('assigned', 'in_progress', 'completed')),
  collab_row_id uuid,
  assigned_by uuid REFERENCES public.profiles(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cat_stage_assignments_file_idx
  ON public.cat_stage_assignments(file_id);
CREATE INDEX IF NOT EXISTS cat_stage_assignments_view_idx
  ON public.cat_stage_assignments(view_id);
CREATE INDEX IF NOT EXISTS cat_stage_assignments_stage_idx
  ON public.cat_stage_assignments(file_workflow_stage_id);
CREATE INDEX IF NOT EXISTS cat_stage_assignments_assignee_idx
  ON public.cat_stage_assignments(assignee_user_id);

-- ---------------------------------------------------------------------------
-- 4. 句段內部 Workflow 確認（與 memoQ confirmation_role 分開）
-- ---------------------------------------------------------------------------
ALTER TABLE public.cat_segments
  ADD COLUMN IF NOT EXISTS wf_trans_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS wf_trans_confirmed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS wf_review_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS wf_review_confirmed_by uuid REFERENCES public.profiles(id);

-- ---------------------------------------------------------------------------
-- 5. RLS（authenticated；細部角色於 B-2／B-4 擴充）
-- ---------------------------------------------------------------------------
ALTER TABLE public.cat_workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_workflow_template_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_file_workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_stage_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cat_workflow_templates_rw_authenticated" ON public.cat_workflow_templates;
CREATE POLICY "cat_workflow_templates_rw_authenticated" ON public.cat_workflow_templates
  FOR ALL USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "cat_workflow_template_stages_rw_authenticated" ON public.cat_workflow_template_stages;
CREATE POLICY "cat_workflow_template_stages_rw_authenticated" ON public.cat_workflow_template_stages
  FOR ALL USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "cat_file_workflow_stages_rw_authenticated" ON public.cat_file_workflow_stages;
CREATE POLICY "cat_file_workflow_stages_rw_authenticated" ON public.cat_file_workflow_stages
  FOR ALL USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "cat_stage_assignments_rw_authenticated" ON public.cat_stage_assignments;
CREATE POLICY "cat_stage_assignments_rw_authenticated" ON public.cat_stage_assignments
  FOR ALL USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 6. 種子函式與舊檔遷移（§9：兩檔名例外走完整 Workflow）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_workflow_is_exception_file(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_name IN (
    'UI 20260610 - Batch 12 - UI (Localized Strings).csv_pq5mp9ubom3yz_zhHK_2026-06-10_10-05-31.xlsx_zho-TW.mqxliff',
    'CCT6012 ICF CD22CART Amd7_2025-1215.docx_zho-TW.mqxliff'
  );
$$;

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

CREATE OR REPLACE FUNCTION public.ensure_cat_file_workflow_stages(p_file_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_file_name text;
  v_is_exception boolean;
  v_now timestamptz := now();
BEGIN
  SELECT project_id, name INTO v_project_id, v_file_name
  FROM public.cat_files
  WHERE id = p_file_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.cat_file_workflow_stages WHERE file_id = p_file_id) THEN
    RETURN;
  END IF;

  PERFORM public.ensure_cat_project_default_workflow_template(v_project_id);

  v_is_exception := public.cat_workflow_is_exception_file(v_file_name);

  INSERT INTO public.cat_file_workflow_stages (
    file_id, stage_order, stage_kind, label, status, started_at, completed_at, created_at, updated_at
  ) VALUES
    (
      p_file_id, 1, 'translate', '翻譯',
      CASE WHEN v_is_exception THEN 'active' ELSE 'completed' END,
      CASE WHEN v_is_exception THEN v_now ELSE v_now END,
      CASE WHEN v_is_exception THEN NULL ELSE v_now END,
      v_now, v_now
    ),
    (
      p_file_id, 2, 'review', '審稿',
      CASE WHEN v_is_exception THEN 'pending' ELSE 'completed' END,
      NULL,
      CASE WHEN v_is_exception THEN NULL ELSE v_now END,
      v_now, v_now
    );
END;
$$;

-- 既有專案／檔案 backfill
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.cat_projects LOOP
    PERFORM public.ensure_cat_project_default_workflow_template(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.cat_files LOOP
    PERFORM public.ensure_cat_file_workflow_stages(r.id);
  END LOOP;
END;
$$;
