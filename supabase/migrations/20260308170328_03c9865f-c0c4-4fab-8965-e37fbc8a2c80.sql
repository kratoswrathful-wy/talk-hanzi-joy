
ALTER TABLE public.cases ALTER COLUMN translator DROP DEFAULT;

ALTER TABLE public.cases 
  ALTER COLUMN translator TYPE jsonb 
  USING CASE 
    WHEN translator = '' THEN '[]'::jsonb 
    ELSE jsonb_build_array(translator) 
  END;

ALTER TABLE public.cases ALTER COLUMN translator SET DEFAULT '[]'::jsonb;
