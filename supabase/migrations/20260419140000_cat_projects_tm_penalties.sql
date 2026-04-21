ALTER TABLE public.cat_projects
  ADD COLUMN IF NOT EXISTS tm_penalties jsonb NOT NULL DEFAULT '{}'::jsonb;
