ALTER TABLE public.cases ALTER COLUMN work_type DROP DEFAULT;
ALTER TABLE public.cases ALTER COLUMN work_type TYPE jsonb USING CASE WHEN work_type = '' THEN '[]'::jsonb ELSE jsonb_build_array(work_type) END;
ALTER TABLE public.cases ALTER COLUMN work_type SET DEFAULT '[]'::jsonb;