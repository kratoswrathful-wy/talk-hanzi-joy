
CREATE TABLE public.internal_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  related_case TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  creator TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  note_type TEXT NOT NULL DEFAULT '',
  internal_assignee JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_name TEXT NOT NULL DEFAULT '',
  id_row_count TEXT NOT NULL DEFAULT '',
  source_text TEXT NOT NULL DEFAULT '',
  translated_text TEXT NOT NULL DEFAULT '',
  question_or_note TEXT NOT NULL DEFAULT '',
  question_or_note_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  reference_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  invalidated BOOLEAN NOT NULL DEFAULT false,
  invalidated_by TEXT,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  env TEXT NOT NULL DEFAULT 'test',
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view internal notes"
  ON public.internal_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert internal notes"
  ON public.internal_notes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update internal notes"
  ON public.internal_notes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete internal notes"
  ON public.internal_notes FOR DELETE TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_notes;
