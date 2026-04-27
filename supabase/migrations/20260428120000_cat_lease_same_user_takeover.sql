-- 同帳號不同 session（多分頁／重載）可從自己手中奪回句段租約，避免僅顯示名相同卻被擋
create or replace function public.try_acquire_cat_segment_edit_lease(
  p_file_id uuid,
  p_segment_id uuid,
  p_session_id text,
  p_holder_user_id uuid,
  p_holder_name text,
  p_ttl_seconds integer default 20
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_exp timestamptz := v_now + make_interval(secs => greatest(coalesce(p_ttl_seconds, 20), 3));
  v_row public.cat_segment_edit_leases%rowtype;
begin
  insert into public.cat_segment_edit_leases (
    segment_id, file_id, session_id, holder_user_id, holder_name, created_at, updated_at, expires_at
  )
  values (
    p_segment_id, p_file_id, p_session_id, p_holder_user_id, p_holder_name, v_now, v_now, v_exp
  )
  on conflict (segment_id) do update
    set
      file_id = excluded.file_id,
      session_id = excluded.session_id,
      holder_user_id = excluded.holder_user_id,
      holder_name = excluded.holder_name,
      updated_at = v_now,
      expires_at = v_exp
    where
      public.cat_segment_edit_leases.expires_at < v_now
      or public.cat_segment_edit_leases.session_id = p_session_id
      or (
        p_holder_user_id is not null
        and public.cat_segment_edit_leases.holder_user_id is not distinct from p_holder_user_id
      )
  returning * into v_row;

  if found then
    return jsonb_build_object(
      'acquired', true,
      'segmentId', v_row.segment_id,
      'sessionId', v_row.session_id,
      'holderName', coalesce(v_row.holder_name, ''),
      'expiresAt', v_row.expires_at
    );
  end if;

  select * into v_row
  from public.cat_segment_edit_leases
  where segment_id = p_segment_id;

  return jsonb_build_object(
    'acquired', false,
    'segmentId', p_segment_id,
    'sessionId', coalesce(v_row.session_id, ''),
    'holderName', coalesce(v_row.holder_name, ''),
    'expiresAt', v_row.expires_at
  );
end;
$$;
