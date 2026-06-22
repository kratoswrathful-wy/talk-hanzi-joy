-- Phase C-1: segment stage snapshots for revision tracking

CREATE TABLE IF NOT EXISTS public.cat_segment_stage_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id       uuid NOT NULL REFERENCES public.cat_segments(id) ON DELETE CASCADE,
  file_id          uuid NOT NULL REFERENCES public.cat_files(id) ON DELETE CASCADE,
  snapshot_reason  text NOT NULL CHECK (snapshot_reason IN (
    'baseline_before_translate', 'post_translate', 'post_review'
  )),
  target_text      text NOT NULL DEFAULT '',
  target_tags      jsonb,
  confirmed_by     uuid REFERENCES public.profiles(id),
  snapshotted_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (segment_id, snapshot_reason)
);

CREATE INDEX IF NOT EXISTS cat_segment_stage_snapshots_file_reason_idx
  ON public.cat_segment_stage_snapshots (file_id, snapshot_reason);

CREATE INDEX IF NOT EXISTS cat_segment_stage_snapshots_segment_idx
  ON public.cat_segment_stage_snapshots (segment_id);

COMMENT ON TABLE public.cat_segment_stage_snapshots IS
  'Phase C: per-segment workflow stage target snapshots for revision tracking';

ALTER TABLE public.cat_segment_stage_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat_segment_stage_snapshots_rw_authenticated"
  ON public.cat_segment_stage_snapshots
  FOR ALL
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- Upsert single segment snapshot
CREATE OR REPLACE FUNCTION public.cat_upsert_segment_snapshot(
  p_segment_id uuid,
  p_file_id uuid,
  p_snapshot_reason text,
  p_target_text text,
  p_target_tags jsonb DEFAULT NULL,
  p_confirmed_by uuid DEFAULT NULL
)
RETURNS public.cat_segment_stage_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.cat_segment_stage_snapshots;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.cat_segment_stage_snapshots (
    segment_id, file_id, snapshot_reason, target_text, target_tags, confirmed_by, snapshotted_at
  ) VALUES (
    p_segment_id, p_file_id, p_snapshot_reason,
    COALESCE(p_target_text, ''), p_target_tags, p_confirmed_by, now()
  )
  ON CONFLICT (segment_id, snapshot_reason) DO UPDATE SET
    target_text = EXCLUDED.target_text,
    target_tags = EXCLUDED.target_tags,
    confirmed_by = EXCLUDED.confirmed_by,
    snapshotted_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cat_upsert_segment_snapshot(uuid, uuid, text, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cat_upsert_segment_snapshot(uuid, uuid, text, text, jsonb, uuid) TO service_role;

-- Batch upsert for baseline / catch-up
CREATE OR REPLACE FUNCTION public.cat_upsert_segment_snapshots_batch(
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_count integer := 0;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public.cat_segment_stage_snapshots (
      segment_id, file_id, snapshot_reason, target_text, target_tags, confirmed_by, snapshotted_at
    ) VALUES (
      (v_item->>'segment_id')::uuid,
      (v_item->>'file_id')::uuid,
      v_item->>'snapshot_reason',
      COALESCE(v_item->>'target_text', ''),
      v_item->'target_tags',
      NULLIF(v_item->>'confirmed_by', '')::uuid,
      now()
    )
    ON CONFLICT (segment_id, snapshot_reason) DO UPDATE SET
      target_text = EXCLUDED.target_text,
      target_tags = EXCLUDED.target_tags,
      confirmed_by = EXCLUDED.confirmed_by,
      snapshotted_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cat_upsert_segment_snapshots_batch(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cat_upsert_segment_snapshots_batch(jsonb) TO service_role;

-- Catch-up: only insert segments missing this reason
CREATE OR REPLACE FUNCTION public.cat_catchup_segment_snapshots(
  p_file_id uuid,
  p_snapshot_reason text,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_count integer := 0;
  v_seg_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_seg_id := (v_item->>'segment_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.cat_segment_stage_snapshots s
      WHERE s.segment_id = v_seg_id AND s.snapshot_reason = p_snapshot_reason
    ) THEN
      INSERT INTO public.cat_segment_stage_snapshots (
        segment_id, file_id, snapshot_reason, target_text, target_tags, confirmed_by, snapshotted_at
      ) VALUES (
        v_seg_id,
        p_file_id,
        p_snapshot_reason,
        COALESCE(v_item->>'target_text', ''),
        v_item->'target_tags',
        NULLIF(v_item->>'confirmed_by', '')::uuid,
        now()
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cat_catchup_segment_snapshots(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cat_catchup_segment_snapshots(uuid, text, jsonb) TO service_role;
