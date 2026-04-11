-- Manual adjustment rows on client invoices (請款額調整 / 費用調整)
ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS adjustment_lines jsonb NOT NULL DEFAULT '[]'::jsonb;
