ALTER TABLE public.cat_segments
  ADD COLUMN IF NOT EXISTS mq_inserted_match jsonb;
