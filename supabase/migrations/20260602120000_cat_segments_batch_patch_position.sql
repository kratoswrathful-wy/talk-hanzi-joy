-- Extend apply_cat_segments_patch_batch to support position fields (row_idx, col_src, col_tgt, sheet_name).
-- Required for Excel export after "更新作業檔" (refreshFileSegments) in team mode.

create or replace function public.apply_cat_segments_patch_batch(
  p_updates jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  u jsonb;
  sid uuid;
  patch jsonb;
begin
  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    return;
  end if;

  for u in select * from jsonb_array_elements(p_updates)
  loop
    sid := (u->>'id')::uuid;
    patch := coalesce(u->'patch', '{}'::jsonb);

    update public.cat_segments s
    set
      last_modified = now(),
      source_text = case when patch ? 'source_text' then coalesce(patch->>'source_text', '') else s.source_text end,
      target_text = case when patch ? 'target_text' then coalesce(patch->>'target_text', '') else s.target_text end,
      source_tags = case when patch ? 'source_tags' then coalesce(patch->'source_tags', '[]'::jsonb) else s.source_tags end,
      target_tags = case when patch ? 'target_tags' then coalesce(patch->'target_tags', '[]'::jsonb) else s.target_tags end,
      id_value = case when patch ? 'id_value' then patch->>'id_value' else s.id_value end,
      extra_value = case when patch ? 'extra_value' then patch->>'extra_value' else s.extra_value end,
      status = case when patch ? 'status' then coalesce(patch->>'status', '') else s.status end,
      editor_note = case when patch ? 'editor_note' then coalesce(patch->>'editor_note', '') else s.editor_note end,
      global_id = case when patch ? 'global_id' then (patch->>'global_id')::bigint else s.global_id end,
      row_idx = case when patch ? 'row_idx' then coalesce((patch->>'row_idx')::integer, 0) else s.row_idx end,
      col_src = case when patch ? 'col_src' then patch->>'col_src' else s.col_src end,
      col_tgt = case when patch ? 'col_tgt' then patch->>'col_tgt' else s.col_tgt end,
      sheet_name = case when patch ? 'sheet_name' then coalesce(patch->>'sheet_name', 'Sheet1') else s.sheet_name end,
      is_locked_user = case when patch ? 'is_locked_user' then coalesce((patch->>'is_locked_user')::boolean, false) else s.is_locked_user end,
      is_locked_system = case when patch ? 'is_locked_system' then coalesce((patch->>'is_locked_system')::boolean, false) else s.is_locked_system end,
      is_locked = case
        when patch ? 'is_locked' then coalesce((patch->>'is_locked')::boolean, false)
        when patch ? 'is_locked_user' or patch ? 'is_locked_system' then
          coalesce((patch->>'is_locked_user')::boolean, false)
          or coalesce((patch->>'is_locked_system')::boolean, false)
        else s.is_locked
      end,
      match_value = case
        when patch ? 'match_value' then
          case
            when patch->'match_value' is null
              or jsonb_typeof(patch->'match_value') = 'null' then null
            when jsonb_typeof(patch->'match_value') = 'string'
              and length(btrim(patch->>'match_value')) = 0 then null
            else (patch->>'match_value')::double precision
          end
        else s.match_value
      end,
      source_change_info = case when patch ? 'source_change_info' then patch->'source_change_info' else s.source_change_info end,
      segment_revision = case when patch ? 'target_text' then s.segment_revision + 1 else s.segment_revision end
    where s.id = sid;
  end loop;
end;
$$;

comment on function public.apply_cat_segments_patch_batch is 'Batch patch cat_segments rows in one RPC call (reduces network round-trips). Supports position fields row_idx/col_src/col_tgt/sheet_name for Excel refresh.';
