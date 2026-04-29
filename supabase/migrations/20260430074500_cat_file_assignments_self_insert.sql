-- Allow authenticated users to insert their own cat_file_assignments (self-assign).
-- This is needed for the "承接本案" flow: when a translator accepts a case,
-- case-store.ts tries to upsert into cat_file_assignments with the translator's
-- user_id, which was previously blocked by RLS (only admins could INSERT).
-- The WITH CHECK constraint ensures a user can only insert records where
-- assignee_user_id matches their own auth.uid().

DROP POLICY IF EXISTS "cat_file_assignments_self_insert" ON public.cat_file_assignments;
CREATE POLICY "cat_file_assignments_self_insert"
  ON public.cat_file_assignments
  FOR INSERT
  WITH CHECK (assignee_user_id = auth.uid());
