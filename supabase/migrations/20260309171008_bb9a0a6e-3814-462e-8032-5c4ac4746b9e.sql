ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS keyword text NOT NULL DEFAULT '';
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS client_po_number text NOT NULL DEFAULT '';