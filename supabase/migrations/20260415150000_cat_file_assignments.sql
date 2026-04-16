-- CAT team mode file-level assignments (replaces legacy case-level CAT assignment flow).
CREATE TABLE IF NOT EXISTS public.cat_file_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.cat_files(id) ON DELETE CASCADE,
  assignee_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
  assigned_by uuid REFERENCES public.profiles(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(file_id, assignee_user_id)
);

CREATE INDEX IF NOT EXISTS cat_file_assignments_file_idx
  ON public.cat_file_assignments(file_id);
CREATE INDEX IF NOT EXISTS cat_file_assignments_assignee_idx
  ON public.cat_file_assignments(assignee_user_id);
CREATE INDEX IF NOT EXISTS cat_file_assignments_status_idx
  ON public.cat_file_assignments(status);

ALTER TABLE public.cat_file_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cat_file_assignments_manage_admin" ON public.cat_file_assignments;
CREATE POLICY "cat_file_assignments_manage_admin" ON public.cat_file_assignments
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "cat_file_assignments_read_own" ON public.cat_file_assignments;
CREATE POLICY "cat_file_assignments_read_own" ON public.cat_file_assignments
  FOR SELECT
  USING (assignee_user_id = auth.uid());

DROP POLICY IF EXISTS "cat_file_assignments_update_own_status" ON public.cat_file_assignments;
CREATE POLICY "cat_file_assignments_update_own_status" ON public.cat_file_assignments
  FOR UPDATE
  USING (assignee_user_id = auth.uid())
  WITH CHECK (assignee_user_id = auth.uid());

