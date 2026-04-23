-- 句段目標寫入樂觀鎖：以 segment_revision 做 CAS，避免 in-flight 舊寫入覆寫新內容
alter table public.cat_segments
  add column if not exists segment_revision bigint not null default 0;

-- 以 segmentExtraCamelToSnake 產出之 jsonb（match_value, is_locked_*, is_locked, target_tags）與 updateSegmentTarget 行為一致
create or replace function public.apply_cat_segment_target_update(
  p_segment_id uuid,
  p_new_target_text text,
  p_expected_segment_revision bigint,
  p_extras jsonb default '{}'::jsonb
) returns setof public.cat_segments
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  update public.cat_segments s
  set
    target_text = p_new_target_text,
    last_modified = now(),
    match_value = case
      when p_extras ? 'match_value' then
        case
          when p_extras->'match_value' is null
            or jsonb_typeof(p_extras->'match_value') = 'null' then null
          when jsonb_typeof(p_extras->'match_value') = 'string'
            and length(btrim(p_extras->>'match_value')) = 0 then null
          else (p_extras->>'match_value')::double precision
        end
      else s.match_value
    end,
    is_locked_user = case
      when p_extras ? 'is_locked_user' then coalesce((p_extras->>'is_locked_user')::boolean, false)
      else s.is_locked_user
    end,
    is_locked_system = case
      when p_extras ? 'is_locked_system' then coalesce((p_extras->>'is_locked_system')::boolean, false)
      else s.is_locked_system
    end,
    is_locked = case
      when p_extras ? 'is_locked' then coalesce((p_extras->>'is_locked')::boolean, false)
      when p_extras ? 'is_locked_user' or p_extras ? 'is_locked_system' then
        coalesce((p_extras->>'is_locked_user')::boolean, false)
        or coalesce((p_extras->>'is_locked_system')::boolean, false)
      else s.is_locked
    end,
    target_tags = case
      when p_extras ? 'target_tags' then coalesce(p_extras->'target_tags', '[]'::jsonb)
      else s.target_tags
    end,
    segment_revision = s.segment_revision + 1
  where s.id = p_segment_id
    and s.segment_revision = p_expected_segment_revision
  returning *;
end;
$$;

grant execute on function public.apply_cat_segment_target_update(uuid, text, bigint, jsonb) to authenticated;
grant execute on function public.apply_cat_segment_target_update(uuid, text, bigint, jsonb) to service_role;

comment on function public.apply_cat_segment_target_update is 'CAS update of cat_segments target; returns 0 or 1 row.';
