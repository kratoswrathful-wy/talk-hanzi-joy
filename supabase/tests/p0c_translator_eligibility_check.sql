-- STATUS: draft; NOT run against production; unverified
--
-- P0-C：譯者承接資格（對齊 UI）— accept_public / accept_inquiry_collab_row / decline。
-- 對齊 migration：20260901120000_p0c_security_convergence.sql
--
-- 覆蓋：
--   - 合格 member 公開承接（空 translator）
--   - PM → admin_use_management_path
--   - 凍結譯者 → translator_frozen
--   - 無 display_name → profile_display_name_required
--   - 單案他人譯者 → other_translator_pending
--   - 協作空白 translatorUserId：另一合格 member 可承接
--   - 協作已指派他人 → collab_row_not_assigned_to_actor
--   - 公開承接競態（stale revision）
--
-- 執行：隔離 branch／本機 DB；全程 BEGIN…ROLLBACK。

begin;

do $$
declare
  v_t1 uuid := gen_random_uuid();
  v_t2 uuid := gen_random_uuid();
  v_t3 uuid := gen_random_uuid();
  v_pm uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_case_other_tr uuid := gen_random_uuid();
  v_case_collab uuid := gen_random_uuid();
  v_collab_row_id text := 'p0c-collab-row-1';
  v_revision bigint;
  v_result jsonb;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_t1, 'p0c-t1@test.local', '{"display_name":"P0C 譯者一"}'),
    (v_t2, 'p0c-t2@test.local', '{"display_name":"P0C 譯者二"}'),
    (v_t3, 'p0c-t3@test.local', '{}'),
    (v_pm, 'p0c-pm@test.local', '{"display_name":"P0C PM"}');

  update public.profiles set is_test = true
  where id in (v_t1, v_t2, v_t3, v_pm);
  update public.profiles set display_name = null where id = v_t3;

  delete from public.user_roles where user_id in (v_t1, v_t2, v_t3, v_pm);
  insert into public.user_roles(user_id, role)
  values
    (v_t1, 'member'),
    (v_t2, 'member'),
    (v_t3, 'member'),
    (v_pm, 'pm');

  insert into public.member_translator_settings(email, frozen)
  values ('p0c-t2@test.local', true)
  on conflict (email) do update set frozen = true;

  insert into public.cases (
    id, title, status, client, translator, env, created_by, created_at, updated_at
  ) values
    (
      v_case, '[P0-C] open inquiry', 'inquiry', 'c',
      '[]'::jsonb, 'test', v_pm, now(), now()
    ),
    (
      v_case_other_tr, '[P0-C] other translator', 'inquiry', 'c',
      '["P0C 譯者二"]'::jsonb, 'test', v_pm, now(), now()
    ),
    (
      v_case_collab, '[P0-C] collab inquiry', 'inquiry', 'c',
      '[]'::jsonb, 'test', v_pm, now(), now()
    );

  update public.cases
  set multi_collab = true,
      collab_rows = jsonb_build_array(
        jsonb_build_object(
          'id', v_collab_row_id,
          'segment', 'seg1',
          'translator', '',
          'unitCount', 100,
          'accepted', false,
          'reviewer', '',
          'taskCompleted', false,
          'delivered', false
        ),
        jsonb_build_object(
          'id', 'p0c-collab-row-assigned',
          'segment', 'seg2',
          'translator', 'P0C 譯者二',
          'translatorUserId', v_t2::text,
          'unitCount', 50,
          'accepted', false,
          'reviewer', '',
          'taskCompleted', false,
          'delivered', false
        )
      )
  where id = v_case_collab;

  select revision into v_revision from public.cases where id = v_case;

  -- PM 不得公開承接
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.accept_public_inquiry_case(v_case, v_revision);
    raise exception 'PM accept should fail';
  exception
    when sqlstate '42501' then null;
  end;
  reset role;

  -- 凍結譯者
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.accept_public_inquiry_case(v_case, v_revision);
    raise exception 'frozen translator accept should fail';
  exception
    when sqlstate '42501' then null;
  end;
  reset role;

  -- 無 display_name
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t3::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.accept_public_inquiry_case(v_case, v_revision);
    raise exception 'no display_name accept should fail';
  exception
    when sqlstate '42501' then null;
  end;
  reset role;

  -- 單案他人譯者
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.accept_public_inquiry_case(
      v_case_other_tr,
      (select revision from public.cases where id = v_case_other_tr)
    );
    raise exception 'other_translator_pending should block t1';
  exception
    when sqlstate '42501' then null;
  end;

  -- 合格公開承接
  v_result := public.accept_public_inquiry_case(v_case, v_revision);
  if v_result ->> 'status' <> 'dispatched' then
    raise exception 't1 accept failed: %', v_result;
  end if;

  -- 競態：同 revision 再承接
  begin
    perform public.accept_public_inquiry_case(v_case, v_revision);
    raise exception 'race accept should fail';
  exception
    when sqlstate 'P0002' or sqlstate '40001' then null;
  end;
  reset role;

  -- 協作：空白 translatorUserId，t1 可承接
  select revision into v_revision from public.cases where id = v_case_collab;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.accept_inquiry_collab_row(
    v_case_collab, v_collab_row_id, v_revision
  );
  if coalesce(v_result ->> 'rowId', '') <> v_collab_row_id then
    raise exception 'collab blank assignee accept failed: %', v_result;
  end if;

  -- 協作：已指派他人列，t1 不得承接
  reset role;
  select revision into v_revision from public.cases where id = v_case_collab;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.accept_inquiry_collab_row(
      v_case_collab, 'p0c-collab-row-assigned', v_revision
    );
    raise exception 'collab assigned row should block t1';
  exception
    when sqlstate '42501' then null;
  end;
  reset role;

  raise notice 'p0c_translator_eligibility_check: draft assertions would pass';
end $$;

rollback;
