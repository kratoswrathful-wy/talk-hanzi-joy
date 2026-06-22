-- Phase C-2: annotation options + segment annotations

CREATE TABLE IF NOT EXISTS public.cat_annotation_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_type text NOT NULL CHECK (option_type IN ('issue_type', 'severity')),
  label       text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cat_annotation_options_type_sort_idx
  ON public.cat_annotation_options (option_type, sort_order);

ALTER TABLE public.cat_annotation_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat_annotation_options_read_authenticated"
  ON public.cat_annotation_options FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "cat_annotation_options_write_pm"
  ON public.cat_annotation_options FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('pm', 'executive')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.role IN ('pm', 'executive')
    )
  );

-- Seed default options
INSERT INTO public.cat_annotation_options (option_type, label, sort_order) VALUES
  ('issue_type', '術語錯誤', 1),
  ('issue_type', '語法錯誤', 2),
  ('issue_type', '漏譯', 3),
  ('issue_type', '語感不佳', 4),
  ('severity', '輕微', 1),
  ('severity', '中等', 2),
  ('severity', '嚴重', 3);

CREATE TABLE IF NOT EXISTS public.cat_segment_annotations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id            uuid NOT NULL REFERENCES public.cat_segments(id) ON DELETE CASCADE,
  file_id               uuid NOT NULL REFERENCES public.cat_files(id) ON DELETE CASCADE,
  parent_annotation_id  uuid REFERENCES public.cat_segment_annotations(id) ON DELETE CASCADE,
  issue_type            text,
  severity              text,
  note                  text NOT NULL DEFAULT '',
  author_user_id        uuid REFERENCES public.profiles(id),
  responder_role        text NOT NULL CHECK (responder_role IN ('reviewer', 'translator')),
  is_translator_ack     boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cat_segment_annotations_file_idx
  ON public.cat_segment_annotations (file_id);

CREATE INDEX IF NOT EXISTS cat_segment_annotations_segment_idx
  ON public.cat_segment_annotations (segment_id);

ALTER TABLE public.cat_segment_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat_segment_annotations_rw_authenticated"
  ON public.cat_segment_annotations FOR ALL
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- Save annotation (root or reply)
CREATE OR REPLACE FUNCTION public.cat_save_segment_annotation(
  p_segment_id uuid,
  p_file_id uuid,
  p_parent_annotation_id uuid,
  p_issue_type text,
  p_severity text,
  p_note text,
  p_responder_role text,
  p_is_translator_ack boolean DEFAULT false
)
RETURNS public.cat_segment_annotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.cat_segment_annotations;
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.cat_segment_annotations (
    segment_id, file_id, parent_annotation_id, issue_type, severity, note,
    author_user_id, responder_role, is_translator_ack
  ) VALUES (
    p_segment_id, p_file_id, p_parent_annotation_id,
    NULLIF(trim(p_issue_type), ''), NULLIF(trim(p_severity), ''),
    COALESCE(p_note, ''), v_uid, p_responder_role, COALESCE(p_is_translator_ack, false)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cat_save_segment_annotation(uuid, uuid, uuid, text, text, text, text, boolean) TO authenticated;

-- Update translator ack on root annotation
CREATE OR REPLACE FUNCTION public.cat_update_annotation_translator_ack(
  p_annotation_id uuid,
  p_ack boolean
)
RETURNS public.cat_segment_annotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.cat_segment_annotations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.cat_segment_annotations
  SET is_translator_ack = COALESCE(p_ack, false)
  WHERE id = p_annotation_id AND parent_annotation_id IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'annotation not found or not root';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cat_update_annotation_translator_ack(uuid, boolean) TO authenticated;
