
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS decline_records JSONB NOT NULL DEFAULT '[]'::jsonb;
