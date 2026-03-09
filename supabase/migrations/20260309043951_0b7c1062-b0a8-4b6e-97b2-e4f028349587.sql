ALTER TABLE public.cases
ADD COLUMN IF NOT EXISTS work_groups jsonb NOT NULL DEFAULT '[]'::jsonb;