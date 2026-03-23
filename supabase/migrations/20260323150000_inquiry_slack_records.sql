ALTER TABLE public.cases
ADD COLUMN IF NOT EXISTS inquiry_slack_records JSONB NOT NULL DEFAULT '[]'::jsonb;

