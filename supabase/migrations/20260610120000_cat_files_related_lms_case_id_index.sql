-- Index for LMS case page: cat_files WHERE related_lms_case_id = :caseId
CREATE INDEX IF NOT EXISTS cat_files_related_lms_case_id_idx
  ON public.cat_files (related_lms_case_id)
  WHERE related_lms_case_id IS NOT NULL;
