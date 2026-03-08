
-- Allow all authenticated users to read cases
DROP POLICY IF EXISTS "Admins can select cases" ON public.cases;
CREATE POLICY "Anyone authenticated can read cases"
  ON public.cases FOR SELECT
  TO authenticated
  USING (true);
