-- Change log gates and case / internal note edit_logs
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS edit_logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS change_log_enabled_at timestamptz NULL;

ALTER TABLE public.internal_notes
  ADD COLUMN IF NOT EXISTS edit_logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS edit_log_started_at timestamptz NULL;

ALTER TABLE public.fees
  ADD COLUMN IF NOT EXISTS edit_log_phases jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS edit_log_started_at timestamptz NULL;

ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS edit_log_started_at timestamptz NULL;
