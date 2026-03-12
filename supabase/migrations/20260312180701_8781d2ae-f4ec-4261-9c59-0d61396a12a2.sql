
-- Add icon_url column to cases table
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS icon_url TEXT DEFAULT '';

-- Create case-icons storage bucket (public so icons can be displayed)
INSERT INTO storage.buckets (id, name, public)
VALUES ('case-icons', 'case-icons', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Allow authenticated users to upload to case-icons bucket
CREATE POLICY "Authenticated users can upload case icons"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'case-icons');

-- RLS: Allow authenticated users to update case icons
CREATE POLICY "Authenticated users can update case icons"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'case-icons');

-- RLS: Allow anyone to read case icons (public bucket)
CREATE POLICY "Anyone can read case icons"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'case-icons');

-- RLS: Allow authenticated users to delete case icons
CREATE POLICY "Authenticated users can delete case icons"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'case-icons');
