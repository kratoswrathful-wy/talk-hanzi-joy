ALTER TABLE public.cases 
  ADD COLUMN IF NOT EXISTS common_links jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS series_reference_materials jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS case_reference_materials jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comments jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS internal_comments jsonb DEFAULT '[]'::jsonb;