
-- Drop existing defaults first
ALTER TABLE public.cases ALTER COLUMN custom_guidelines_url DROP DEFAULT;
ALTER TABLE public.cases ALTER COLUMN client_guidelines DROP DEFAULT;
ALTER TABLE public.cases ALTER COLUMN track_changes DROP DEFAULT;

-- Migrate text columns to jsonb
ALTER TABLE public.cases
  ALTER COLUMN custom_guidelines_url TYPE jsonb USING CASE WHEN custom_guidelines_url = '' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('name', custom_guidelines_url, 'url', custom_guidelines_url)) END;
ALTER TABLE public.cases ALTER COLUMN custom_guidelines_url SET DEFAULT '[]'::jsonb;

ALTER TABLE public.cases
  ALTER COLUMN client_guidelines TYPE jsonb USING CASE WHEN client_guidelines = '' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('name', client_guidelines, 'url', client_guidelines)) END;
ALTER TABLE public.cases ALTER COLUMN client_guidelines SET DEFAULT '[]'::jsonb;

ALTER TABLE public.cases
  ALTER COLUMN track_changes TYPE jsonb USING CASE WHEN track_changes = '' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('name', track_changes, 'url', track_changes)) END;
ALTER TABLE public.cases ALTER COLUMN track_changes SET DEFAULT '[]'::jsonb;

-- Create storage bucket for case files
INSERT INTO storage.buckets (id, name, public) VALUES ('case-files', 'case-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload case files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'case-files');

-- Allow anyone to read (public bucket)
CREATE POLICY "Public read access for case files"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'case-files');

-- Allow authenticated users to delete case files
CREATE POLICY "Authenticated users can delete case files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'case-files');
