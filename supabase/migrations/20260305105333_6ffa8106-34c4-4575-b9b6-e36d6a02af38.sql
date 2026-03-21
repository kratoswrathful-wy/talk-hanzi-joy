
-- Fees table: stores all translator fee records
CREATE TABLE IF NOT EXISTS public.fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  assignee text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  internal_note text NOT NULL DEFAULT '',
  internal_note_url text NOT NULL DEFAULT '',
  task_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_info jsonb,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edit_logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finalized_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read fees
DROP POLICY IF EXISTS "Authenticated users can read fees" ON public.fees;
CREATE POLICY "Authenticated users can read fees"
  ON public.fees FOR SELECT TO authenticated USING (true);

-- Admins (PM/executive) can insert fees
DROP POLICY IF EXISTS "Admins can insert fees" ON public.fees;
CREATE POLICY "Admins can insert fees"
  ON public.fees FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Admins can update fees
DROP POLICY IF EXISTS "Admins can update fees" ON public.fees;
CREATE POLICY "Admins can update fees"
  ON public.fees FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Admins can delete fees
DROP POLICY IF EXISTS "Admins can delete fees" ON public.fees;
CREATE POLICY "Admins can delete fees"
  ON public.fees FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Auto-update updated_at
DROP TRIGGER IF EXISTS update_fees_updated_at ON public.fees;
CREATE TRIGGER update_fees_updated_at
  BEFORE UPDATE ON public.fees
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
