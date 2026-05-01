-- Performance indexes to reduce full-table scans identified in pg_stat_statements.
-- 使用一般 CREATE INDEX（非 CONCURRENTLY），以便 `supabase db push` 可在單一 transaction 內套用。

-- cases: list query filters by env then sorts by created_at DESC
CREATE INDEX IF NOT EXISTS idx_cases_env_created
  ON public.cases (env, created_at DESC);

-- cat_files: project view filters by project_id then sorts by created_at ASC
CREATE INDEX IF NOT EXISTS idx_cat_files_project_created
  ON public.cat_files (project_id, created_at ASC);

-- cat_files: workspace list sorts by last_modified DESC (no filter)
CREATE INDEX IF NOT EXISTS idx_cat_files_last_modified
  ON public.cat_files (last_modified DESC);
