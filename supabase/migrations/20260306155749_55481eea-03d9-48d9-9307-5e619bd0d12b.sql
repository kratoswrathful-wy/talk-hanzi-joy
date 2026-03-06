
-- Allow translators to UPDATE their own invoices (where translator matches their display_name)
CREATE POLICY "Translators can update own invoices"
ON public.invoices
FOR UPDATE
TO authenticated
USING (
  translator = (SELECT display_name FROM profiles WHERE id = auth.uid())
);

-- Allow translators to INSERT their own invoices
CREATE POLICY "Translators can insert own invoices"
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (
  translator = (SELECT display_name FROM profiles WHERE id = auth.uid())
);

-- Allow translators to INSERT invoice_fees for their own invoices
CREATE POLICY "Translators can insert own invoice_fees"
ON public.invoice_fees
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.id = invoice_fees.invoice_id
    AND invoices.translator = (SELECT display_name FROM profiles WHERE id = auth.uid())
  )
);

-- Allow translators to DELETE invoice_fees for their own invoices
CREATE POLICY "Translators can delete own invoice_fees"
ON public.invoice_fees
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.id = invoice_fees.invoice_id
    AND invoices.translator = (SELECT display_name FROM profiles WHERE id = auth.uid())
  )
);
