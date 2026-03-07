
-- Create client_invoices table mirroring invoices but with 'client' instead of 'translator'
CREATE TABLE public.client_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL DEFAULT ''::text,
  client text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'pending'::text,
  transfer_date timestamp with time zone,
  note text NOT NULL DEFAULT ''::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  payments jsonb NOT NULL DEFAULT '[]'::jsonb,
  comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  edit_logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  env text NOT NULL DEFAULT 'production'::text
);

-- Create client_invoice_fees link table
CREATE TABLE public.client_invoice_fees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_invoice_id uuid NOT NULL REFERENCES public.client_invoices(id) ON DELETE CASCADE,
  fee_id uuid NOT NULL REFERENCES public.fees(id) ON DELETE CASCADE,
  env text NOT NULL DEFAULT 'production'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invoice_fees ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_invoices (admin-only management)
CREATE POLICY "Admins can select client_invoices" ON public.client_invoices FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert client_invoices" ON public.client_invoices FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update client_invoices" ON public.client_invoices FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete client_invoices" ON public.client_invoices FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- RLS policies for client_invoice_fees
CREATE POLICY "Admins can select client_invoice_fees" ON public.client_invoice_fees FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert client_invoice_fees" ON public.client_invoice_fees FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update client_invoice_fees" ON public.client_invoice_fees FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete client_invoice_fees" ON public.client_invoice_fees FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER handle_client_invoices_updated_at BEFORE UPDATE ON public.client_invoices FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
