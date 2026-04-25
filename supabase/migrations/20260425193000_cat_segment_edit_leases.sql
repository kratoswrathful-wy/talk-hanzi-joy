-- 句段編輯權威鎖（lease）
create table if not exists public.cat_segment_edit_leases (
  segment_id uuid primary key references public.cat_segments(id) on delete cascade,
  file_id uuid not null references public.cat_files(id) on delete cascade,
  session_id text not null,
  holder_user_id uuid,
  holder_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_cat_segment_edit_leases_file on public.cat_segment_edit_leases(file_id);
create index if not exists idx_cat_segment_edit_leases_expires on public.cat_segment_edit_leases(expires_at);

alter table public.cat_segment_edit_leases enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cat_segment_edit_leases'
      and policyname = 'cat_segment_edit_leases_authenticated_all'
  ) then
    create policy cat_segment_edit_leases_authenticated_all
      on public.cat_segment_edit_leases
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

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

create or replace function public.release_cat_segment_edit_lease(
  p_segment_id uuid,
  p_session_id text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.cat_segment_edit_leases
  where segment_id = p_segment_id
    and session_id = p_session_id;
  return found;
end;
$$;

grant execute on function public.try_acquire_cat_segment_edit_lease(uuid, uuid, text, uuid, text, integer) to authenticated;
grant execute on function public.try_acquire_cat_segment_edit_lease(uuid, uuid, text, uuid, text, integer) to service_role;
grant execute on function public.release_cat_segment_edit_lease(uuid, text) to authenticated;
grant execute on function public.release_cat_segment_edit_lease(uuid, text) to service_role;
