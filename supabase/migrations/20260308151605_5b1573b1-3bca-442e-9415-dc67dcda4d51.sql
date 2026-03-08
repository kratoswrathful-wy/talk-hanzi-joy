
CREATE TABLE public.cases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  work_type text NOT NULL DEFAULT '',
  process_note text NOT NULL DEFAULT '',
  billing_unit text NOT NULL DEFAULT '',
  unit_count numeric NOT NULL DEFAULT 0,
  inquiry_note text NOT NULL DEFAULT '',
  translator text NOT NULL DEFAULT '',
  translation_deadline timestamptz,
  reviewer text NOT NULL DEFAULT '',
  review_deadline timestamptz,
  task_status text NOT NULL DEFAULT '',
  execution_tool text NOT NULL DEFAULT '',
  delivery_method text NOT NULL DEFAULT '',
  client_receipt text NOT NULL DEFAULT '',
  custom_guidelines_url text NOT NULL DEFAULT '',
  client_guidelines text NOT NULL DEFAULT '',
  common_info jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_note_form boolean NOT NULL DEFAULT false,
  client_question_form boolean NOT NULL DEFAULT false,
  working_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  other_login_info text NOT NULL DEFAULT '',
  login_account text NOT NULL DEFAULT '',
  login_password text NOT NULL DEFAULT '',
  online_tool_project text NOT NULL DEFAULT '',
  online_tool_filename text NOT NULL DEFAULT '',
  source_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  reference_materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  question_form text NOT NULL DEFAULT '',
  translator_final jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_review_final jsonb NOT NULL DEFAULT '[]'::jsonb,
  track_changes text NOT NULL DEFAULT '',
  fee_entry text NOT NULL DEFAULT '',
  internal_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  env text NOT NULL DEFAULT 'production'
);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select cases" ON public.cases FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert cases" ON public.cases FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update cases" ON public.cases FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete cases" ON public.cases FOR DELETE TO authenticated USING (is_admin(auth.uid()));
