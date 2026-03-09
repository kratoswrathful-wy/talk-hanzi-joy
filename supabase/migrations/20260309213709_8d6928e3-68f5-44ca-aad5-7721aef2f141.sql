
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS client_case_link jsonb DEFAULT '{"url":"","label":""}'::jsonb;
