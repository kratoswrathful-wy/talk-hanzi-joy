-- Batch patch updates for cat_segments (reduce client round-trips)
-- Used by src/lib/cat-cloud-rpc.ts: db.refreshFileSegments
--
-- p_updates format: jsonb array of { id: <uuid>, patch: <jsonb> }
-- patch keys are snake_case column names (e.g. source_text, target_text, source_tags, target_tags, match_value, is_locked_user, is_locked_system, is_locked, status, id_value, extra_value, source_change_info)

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
      -- If target_text is patched, bump revision to invalidate any in-flight writes from older snapshots.
      segment_revision = case when patch ? 'target_text' then s.segment_revision + 1 else s.segment_revision end
    where s.id = sid;
  end loop;
end;
$$;

grant execute on function public.apply_cat_segments_patch_batch(jsonb) to authenticated;
grant execute on function public.apply_cat_segments_patch_batch(jsonb) to service_role;

comment on function public.apply_cat_segments_patch_batch is 'Batch patch cat_segments rows in one RPC call (reduces network round-trips).';

