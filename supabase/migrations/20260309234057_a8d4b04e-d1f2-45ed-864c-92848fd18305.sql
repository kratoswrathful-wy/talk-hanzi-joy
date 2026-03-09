
ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS is_record_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS record_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_collection_date date,
  ADD COLUMN IF NOT EXISTS actual_collection_date date;

-- Migrate existing statuses: 'paid' → 'collected', 'partial' → 'partial_collected'
UPDATE public.client_invoices SET status = 'collected' WHERE status = 'paid';
UPDATE public.client_invoices SET status = 'partial_collected' WHERE status = 'partial';
