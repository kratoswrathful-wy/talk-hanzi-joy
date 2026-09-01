-- P0-C 補丁：security-definer view owner 須能 EXECUTE 私有 helper；
-- 譯者資格須 trim(display_name) 非空（對齊 UI，不得僅靠 email 後備）。

alter function private.public_tool_structure(jsonb) owner to postgres;
alter function private.case_field_permission_allowed(text, text) owner to postgres;

grant execute on function private.public_tool_structure(jsonb) to postgres;
grant execute on function private.case_field_permission_allowed(text, text) to postgres;

create or replace function private.p0_assert_translator_eligible(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_user_id is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if public.is_admin(p_user_id) then
    raise exception using errcode = '42501', message = 'admin_use_management_path';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role = 'member'
  ) then
    raise exception using errcode = '42501', message = 'not_translator_eligible';
  end if;

  perform private.p0b_require_profile(p_user_id);

  if not exists (
    select 1
    from public.profiles pr
    where pr.id = p_user_id
      and nullif(trim(pr.display_name), '') is not null
  ) then
    raise exception using errcode = '42501', message = 'profile_display_name_required';
  end if;

  if exists (
    select 1
    from public.profiles pr
    join public.member_translator_settings mts
      on lower(mts.email) = lower(pr.email)
    where pr.id = p_user_id
      and coalesce(mts.frozen, false) is true
  ) then
    raise exception using errcode = '42501', message = 'translator_frozen';
  end if;
end;
$$;

revoke all on function private.p0_assert_translator_eligible(uuid)
  from public, anon, authenticated;

comment on function private.p0_assert_translator_eligible(uuid) is
  'P0-C：公開承接／婉拒／協作承接前驗證；member＋trim(display_name)＋非凍結＋同 env。';
