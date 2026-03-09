-- Add JSON columns for delivery_method and client_receipt as file arrays
ALTER TABLE public.cases 
  ADD COLUMN IF NOT EXISTS delivery_method_files jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS client_receipt_files jsonb DEFAULT '[]'::jsonb;