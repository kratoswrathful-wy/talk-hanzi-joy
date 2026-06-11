-- LMS case page: 1UP CAT sub-block enabled flag (方案 B)
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS cat_tool_enabled boolean NOT NULL DEFAULT false;

-- Backfill: cases that already have CAT files linked
UPDATE public.cases c
SET cat_tool_enabled = true
WHERE EXISTS (
  SELECT 1 FROM public.cat_files f
  WHERE f.related_lms_case_id = c.id
);

-- When a CAT file is linked to a case, auto-enable 1UP CAT on that case (CAT-side link sync)
CREATE OR REPLACE FUNCTION public.sync_case_cat_tool_enabled_on_file_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.related_lms_case_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.related_lms_case_id IS DISTINCT FROM NEW.related_lms_case_id) THEN
    UPDATE public.cases
    SET cat_tool_enabled = true
    WHERE id = NEW.related_lms_case_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cat_files_sync_case_cat_tool_enabled ON public.cat_files;
CREATE TRIGGER cat_files_sync_case_cat_tool_enabled
  AFTER INSERT OR UPDATE OF related_lms_case_id ON public.cat_files
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_case_cat_tool_enabled_on_file_link();
