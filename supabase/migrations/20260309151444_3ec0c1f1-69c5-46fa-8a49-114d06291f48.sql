ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS multi_collab boolean NOT NULL DEFAULT false;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS collab_rows jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS collab_count integer NOT NULL DEFAULT 0;