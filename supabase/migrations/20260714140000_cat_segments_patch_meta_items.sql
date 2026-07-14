-- 更新作業檔 batch patch：同步 meta_items（階段 B／混合舊句段刷新用）
-- 依賴：20260714130000_cat_meta_items_display_map（已有欄位）

CREATE OR REPLACE FUNCTION public.apply_cat_segments_patch_batch(
  p_updates jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  u jsonb;
  sid uuid;
  patch jsonb;
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RETURN;
  END IF;

  FOR u IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    sid := (u->>'id')::uuid;
    patch := coalesce(u->'patch', '{}'::jsonb);

    UPDATE public.cat_segments s
    SET
      last_modified = now(),
      source_text = CASE WHEN patch ? 'source_text' THEN coalesce(patch->>'source_text', '') ELSE s.source_text END,
      target_text = CASE WHEN patch ? 'target_text' THEN coalesce(patch->>'target_text', '') ELSE s.target_text END,
      source_tags = CASE WHEN patch ? 'source_tags' THEN coalesce(patch->'source_tags', '[]'::jsonb) ELSE s.source_tags END,
      target_tags = CASE WHEN patch ? 'target_tags' THEN coalesce(patch->'target_tags', '[]'::jsonb) ELSE s.target_tags END,
      id_value = CASE WHEN patch ? 'id_value' THEN patch->>'id_value' ELSE s.id_value END,
      extra_value = CASE WHEN patch ? 'extra_value' THEN patch->>'extra_value' ELSE s.extra_value END,
      xliff_tu_id = CASE WHEN patch ? 'xliff_tu_id' THEN patch->>'xliff_tu_id' ELSE s.xliff_tu_id END,
      status = CASE WHEN patch ? 'status' THEN coalesce(patch->>'status', '') ELSE s.status END,
      editor_note = CASE WHEN patch ? 'editor_note' THEN coalesce(patch->>'editor_note', '') ELSE s.editor_note END,
      global_id = CASE WHEN patch ? 'global_id' THEN (patch->>'global_id')::bigint ELSE s.global_id END,
      row_idx = CASE WHEN patch ? 'row_idx' THEN coalesce((patch->>'row_idx')::integer, 0) ELSE s.row_idx END,
      col_src = CASE WHEN patch ? 'col_src' THEN patch->>'col_src' ELSE s.col_src END,
      col_tgt = CASE WHEN patch ? 'col_tgt' THEN patch->>'col_tgt' ELSE s.col_tgt END,
      sheet_name = CASE WHEN patch ? 'sheet_name' THEN coalesce(patch->>'sheet_name', 'Sheet1') ELSE s.sheet_name END,
      is_locked_user = CASE WHEN patch ? 'is_locked_user' THEN coalesce((patch->>'is_locked_user')::boolean, false) ELSE s.is_locked_user END,
      is_locked_system = CASE WHEN patch ? 'is_locked_system' THEN coalesce((patch->>'is_locked_system')::boolean, false) ELSE s.is_locked_system END,
      is_locked = CASE
        WHEN patch ? 'is_locked' THEN coalesce((patch->>'is_locked')::boolean, false)
        WHEN patch ? 'is_locked_user' OR patch ? 'is_locked_system' THEN
          coalesce((patch->>'is_locked_user')::boolean, false)
          OR coalesce((patch->>'is_locked_system')::boolean, false)
        ELSE s.is_locked
      END,
      match_value = CASE
        WHEN patch ? 'match_value' THEN
          CASE
            WHEN patch->'match_value' IS NULL
              OR jsonb_typeof(patch->'match_value') = 'null' THEN NULL
            WHEN jsonb_typeof(patch->'match_value') = 'string'
              AND length(btrim(patch->>'match_value')) = 0 THEN NULL
            ELSE (patch->>'match_value')::double precision
          END
        ELSE s.match_value
      END,
      source_change_info = CASE WHEN patch ? 'source_change_info' THEN patch->'source_change_info' ELSE s.source_change_info END,
      meta_items = CASE
        WHEN patch ? 'meta_items' THEN coalesce(patch->'meta_items', '[]'::jsonb)
        ELSE s.meta_items
      END,
      segment_revision = CASE WHEN patch ? 'target_text' THEN s.segment_revision + 1 ELSE s.segment_revision END
    WHERE s.id = sid;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.apply_cat_segments_patch_batch IS
  'Batch patch cat_segments；含 xliff_tu_id 與 meta_items（更新作業檔）。';
