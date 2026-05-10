-- mqxliff: persist memoQ-derived roles on segments (Team / Supabase).
-- original_role: last commitinfo / mq:status inference at import (T | R1 | R2).
-- confirmation_role: current confirmation level for UI / locks (T | R1 | R2).

ALTER TABLE public.cat_segments
  ADD COLUMN IF NOT EXISTS original_role text,
  ADD COLUMN IF NOT EXISTS confirmation_role text;
