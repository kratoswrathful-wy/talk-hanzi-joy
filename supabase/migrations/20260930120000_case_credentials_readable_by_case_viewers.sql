-- 1A：工具憑證讀取對齊「能看此案的已登入成員可讀、可複製；寫入仍僅 PM／admin」。
-- 不再以受派／participant 作為讀取門檻。寫入契約不變。
-- 本檔只進本機候選；不准自行套用正式庫。

create or replace function public.get_case_credentials(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode='42501', message='not_authorized';
  end if;
  -- 與 cases_visible 同一範圍：本 env 已登入且案件存在即可讀。
  if not exists (
    select 1 from public.cases c
    where c.id = p_case_id and c.env = v_env
  ) then
    raise exception using errcode='P0002', message='case_unavailable';
  end if;
  select jsonb_build_object(
    'caseId',c.id,'revision',c.revision,
    'loginAccount',c.login_account,'loginPassword',c.login_password,
    'otherLoginInfo',c.other_login_info,'toolFieldValues',c.tool_field_values,
    'tools',c.tools,'questionTools',c.question_tools
  ) into v_result
  from public.cases c where c.id=p_case_id and c.env=v_env;
  if v_result is null then
    raise exception using errcode='P0002', message='case_unavailable';
  end if;
  return v_result;
end;
$$;

revoke all on function public.get_case_credentials(uuid) from public, anon;
grant execute on function public.get_case_credentials(uuid) to authenticated, service_role;

comment on function public.get_case_credentials(uuid) is
  '本 env 已登入且能見該案者可讀憑證；不以受派或 participant 設讀取門檻。寫入仍走 update_case_credentials（僅 admin）。';
