-- Repair `case-files` storage RLS: uploads fail with
-- "new row violates row-level security policy" when INSERT on storage.objects
-- is denied (missing policy, renamed bucket, or drift vs local migrations).
-- Idempotent: safe to re-run.

INSERT INTO storage.buckets (id, name, public)
VALUES ('case-files', 'case-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Authenticated users can upload case files" ON storage.objects;
CREATE POLICY "Authenticated users can upload case files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'case-files');

DROP POLICY IF EXISTS "Public read access for case files" ON storage.objects;
CREATE POLICY "Public read access for case files"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'case-files');

DROP POLICY IF EXISTS "Authenticated users can delete case files" ON storage.objects;
CREATE POLICY "Authenticated users can delete case files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'case-files');

DROP POLICY IF EXISTS "Authenticated users can update case files" ON storage.objects;
CREATE POLICY "Authenticated users can update case files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'case-files')
  WITH CHECK (bucket_id = 'case-files');
