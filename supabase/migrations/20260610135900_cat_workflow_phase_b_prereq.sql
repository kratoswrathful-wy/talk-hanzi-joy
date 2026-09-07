-- Scheme A：Phase B workflow 表前置（順序洞修補）
-- 20260610140000_sync_cat_workflow_assignments 於本檔之前引用
-- cat_stage_assignments／cat_file_workflow_stages；完整 Phase B（含 RLS、函式、種子）
-- 仍由 20260612120000_cat_workflow_phase_b.sql 負責。
-- 本檔僅 CREATE TABLE IF NOT EXISTS + 索引（冪等；正式庫已存在時為 no-op）。

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
