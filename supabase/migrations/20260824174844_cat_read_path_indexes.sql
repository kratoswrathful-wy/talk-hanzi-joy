-- CAT read-path composite indexes for ORDER BY id pagination
-- Supports: WHERE file_id = ? ORDER BY id / WHERE tm_id = ? ORDER BY id
-- Keep existing cat_segments_file_idx, cat_tm_segments_tm_idx, cat_segments_file_global_id_idx.

CREATE INDEX IF NOT EXISTS cat_segments_file_id_id_idx
  ON public.cat_segments (file_id, id);

CREATE INDEX IF NOT EXISTS cat_tm_segments_tm_id_id_idx
  ON public.cat_tm_segments (tm_id, id);
