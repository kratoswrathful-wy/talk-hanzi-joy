
-- Add env column to fees, invoices, and invoice_fees tables
-- Default to 'production' so all existing data stays in production

ALTER TABLE public.fees
  ADD COLUMN IF NOT EXISTS env text NOT NULL DEFAULT 'production';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS env text NOT NULL DEFAULT 'production';

ALTER TABLE public.invoice_fees
  ADD COLUMN IF NOT EXISTS env text NOT NULL DEFAULT 'production';

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_fees_env ON public.fees (env);
CREATE INDEX IF NOT EXISTS idx_invoices_env ON public.invoices (env);
CREATE INDEX IF NOT EXISTS idx_invoice_fees_env ON public.invoice_fees (env);
