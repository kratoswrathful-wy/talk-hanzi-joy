-- Per-bucket single-object size limit (bytes). NULL = inherit project global default.
-- 52428800 = 50 MiB (common Free-tier global cap; cannot exceed Dashboard → Storage → global limit).
-- Does not fix RLS errors; use together with case-files storage policies migrations.
UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'case-files';
