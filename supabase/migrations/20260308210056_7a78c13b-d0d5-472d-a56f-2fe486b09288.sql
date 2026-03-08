-- Allow all authenticated users to update cases (needed for translator accepting cases)
DROP POLICY IF EXISTS "Admins can update cases" ON public.cases;
CREATE POLICY "Anyone authenticated can update cases"
  ON public.cases FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);