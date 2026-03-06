
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payments jsonb NOT NULL DEFAULT '[]'::jsonb;
