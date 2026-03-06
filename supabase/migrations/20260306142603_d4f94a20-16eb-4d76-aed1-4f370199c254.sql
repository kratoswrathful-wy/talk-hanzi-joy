
-- Drop existing SELECT policy for fees
DROP POLICY IF EXISTS "Authenticated users can read fees" ON public.fees;

-- New SELECT policy: admins see all, translators only see finalized fees assigned to them
CREATE POLICY "Users can read appropriate fees"
ON public.fees
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN is_admin(auth.uid()) THEN true
    ELSE (
      status = 'finalized'
      AND assignee = (SELECT display_name FROM public.profiles WHERE id = auth.uid())
    )
  END
);

-- Drop existing SELECT policy for invoices
DROP POLICY IF EXISTS "Authenticated users can read invoices" ON public.invoices;

-- New SELECT policy: admins see all, translators only see invoices for themselves
CREATE POLICY "Users can read appropriate invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN is_admin(auth.uid()) THEN true
    ELSE (
      translator = (SELECT display_name FROM public.profiles WHERE id = auth.uid())
    )
  END
);

-- Drop existing SELECT policy for invoice_fees  
DROP POLICY IF EXISTS "Authenticated users can read invoice_fees" ON public.invoice_fees;

-- New SELECT policy: admins see all, translators only see links for their invoices
CREATE POLICY "Users can read appropriate invoice_fees"
ON public.invoice_fees
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN is_admin(auth.uid()) THEN true
    ELSE (
      EXISTS (
        SELECT 1 FROM public.invoices
        WHERE invoices.id = invoice_fees.invoice_id
        AND invoices.translator = (SELECT display_name FROM public.profiles WHERE id = auth.uid())
      )
    )
  END
);
