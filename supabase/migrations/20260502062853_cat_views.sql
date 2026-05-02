-- CAT 句段集（cat_views）與句段集指派（cat_view_assignments）
-- 對應 docs/CAT_VIEW_SPEC.md §2、§13
-- （此版本號與遠端 migration 歷史對齊；內容與舊檔 20260503150000 相同。）

-- ── cat_views ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cat_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.cat_projects(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES public.profiles(id),
  name text NOT NULL DEFAULT '未命名句段集',
  file_ids uuid[] NOT NULL DEFAULT '{}',
  segment_ids uuid[] NOT NULL DEFAULT '{}',
  filter_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_roles jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cat_views_project_idx ON public.cat_views(project_id);
CREATE INDEX IF NOT EXISTS cat_views_project_created_idx ON public.cat_views(project_id, created_at);
CREATE INDEX IF NOT EXISTS cat_views_owner_idx ON public.cat_views(owner_user_id);

ALTER TABLE public.cat_views ENABLE ROW LEVEL SECURITY;

-- 已登入使用者可讀所有 cat_views（§2.1.1：專案內全成員可見）
DROP POLICY IF EXISTS "cat_views_rw_authenticated" ON public.cat_views;
CREATE POLICY "cat_views_rw_authenticated" ON public.cat_views
  FOR ALL
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_view_assignments ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cat_view_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  view_id uuid NOT NULL REFERENCES public.cat_views(id) ON DELETE CASCADE,
  assignee_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
  assigned_by uuid REFERENCES public.profiles(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(view_id, assignee_user_id)
);

CREATE INDEX IF NOT EXISTS cat_view_assignments_view_idx ON public.cat_view_assignments(view_id);
CREATE INDEX IF NOT EXISTS cat_view_assignments_assignee_idx ON public.cat_view_assignments(assignee_user_id);
CREATE INDEX IF NOT EXISTS cat_view_assignments_status_idx ON public.cat_view_assignments(status);

ALTER TABLE public.cat_view_assignments ENABLE ROW LEVEL SECURITY;

-- 管理員（PM+）可全部操作
DROP POLICY IF EXISTS "cat_view_assignments_manage_admin" ON public.cat_view_assignments;
CREATE POLICY "cat_view_assignments_manage_admin" ON public.cat_view_assignments
  FOR ALL
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

-- 受派者可讀自己的列
DROP POLICY IF EXISTS "cat_view_assignments_read_own" ON public.cat_view_assignments;
CREATE POLICY "cat_view_assignments_read_own" ON public.cat_view_assignments
  FOR SELECT
  USING (assignee_user_id = (SELECT auth.uid()));

-- 受派者可更新自己的狀態
DROP POLICY IF EXISTS "cat_view_assignments_update_own_status" ON public.cat_view_assignments;
CREATE POLICY "cat_view_assignments_update_own_status" ON public.cat_view_assignments
  FOR UPDATE
  USING (assignee_user_id = (SELECT auth.uid()))
  WITH CHECK (assignee_user_id = (SELECT auth.uid()));
