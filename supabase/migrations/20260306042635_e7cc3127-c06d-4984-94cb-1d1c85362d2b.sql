
-- Invoices table
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  translator text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  transfer_date timestamptz,
  note text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Junction table
CREATE TABLE public.invoice_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  fee_id uuid NOT NULL REFERENCES public.fees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invoice_id, fee_id)
);

-- Updated_at trigger for invoices
CREATE TRIGGER handle_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_fees ENABLE ROW LEVEL SECURITY;

-- Invoices: PM+ can CRUD, authenticated can read
CREATE POLICY "Authenticated users can read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete invoices" ON public.invoices FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- Invoice_fees: same policies
CREATE POLICY "Authenticated users can read invoice_fees" ON public.invoice_fees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert invoice_fees" ON public.invoice_fees FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update invoice_fees" ON public.invoice_fees FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete invoice_fees" ON public.invoice_fees FOR DELETE TO authenticated USING (is_admin(auth.uid()));
