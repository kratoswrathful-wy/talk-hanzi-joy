ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS comments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS edit_logs jsonb NOT NULL DEFAULT '[]'::jsonb;