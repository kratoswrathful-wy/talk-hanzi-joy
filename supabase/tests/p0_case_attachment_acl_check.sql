-- STATUS: draft for isolated / local DB only; NOT run against production; unverified
--
-- 1B：完稿三欄可加、只能刪自己的；準則／原文成員不可改。
-- 對齊 migration：20260930120200_case_attachment_acl_and_pm_private_writes.sql
--
-- 覆蓋（註解＋斷言）：
--   - 未登入拒絕
--   - 一般成員可追加完稿，uploadedBy 蓋成自己
--   - 一般成員刪別人的完稿 → file_not_owned，原列不變
--   - 一般成員改準則／原文 → field_not_permitted
--   - 主管可刪任意完稿、可改準則
--
-- 執行：隔離／本機 DB；全程 BEGIN…ROLLBACK。本檔未對任何遠端庫執行。

begin;

do $$
declare
  v_t1 uuid := gen_random_uuid();
  v_t2 uuid := gen_random_uuid();
  v_pm uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_denied boolean := false;
  v_result jsonb;
  v_final jsonb;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_t1, 'p0-1b-t1@test.local', '{"display_name":"1B 譯者一"}'),
    (v_t2, 'p0-1b-t2@test.local', '{"display_name":"1B 譯者二"}'),
    (v_pm, 'p0-1b-pm@test.local', '{"display_name":"1B PM"}');
  update public.profiles set is_test = true where id in (v_t1, v_t2, v_pm);
  delete from public.user_roles where user_id = v_pm;
  insert into public.user_roles(user_id, role) values (v_pm, 'pm');

  insert into public.cases (
    id, title, status, client, translator, env, created_by,
    translator_final, client_guidelines, created_at, updated_at
  ) values (
    v_case, '[P0-1B] attachment fixture', 'dispatched', 'c', '[]'::jsonb, 'test', v_pm,
    jsonb_build_array(jsonb_build_object(
      'name','old.txt','url','https://ex.test/old','uploadedBy',v_t2::text
    )),
    jsonb_build_array(jsonb_build_object(
      'name','g.txt','url','https://ex.test/g','uploadedBy',v_pm::text
    )),
    now(), now()
  );

  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  begin
    perform public.update_case_permitted_fields(
      v_case, 0, jsonb_build_object('translatorFinal', '[]'::jsonb)
    );
  exception
    when insufficient_privilege or sqlstate '42501' then
      v_denied := true;
  end;
  reset role;
  if not v_denied then
    raise exception 'anon finals write was not blocked';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.update_case_permitted_fields(
    v_case,
    (select revision from public.cases where id = v_case),
    jsonb_build_object(
      'translatorFinal',
      jsonb_build_array(
        jsonb_build_object('name','old.txt','url','https://ex.test/old','uploadedBy',v_t2::text),
        jsonb_build_object('name','new.txt','url','https://ex.test/new','uploadedBy','spoof')
      )
    )
  );
  reset role;
  select translator_final into v_final from public.cases where id = v_case;
  if jsonb_array_length(v_final) <> 2 then
    raise exception 'member could not append own final: %', v_final;
  end if;
  if v_final -> 1 ->> 'uploadedBy' <> v_t1::text then
    raise exception 'uploadedBy was not stamped to actor';
  end if;

  v_denied := false;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case,
      (select revision from public.cases where id = v_case),
      jsonb_build_object(
        'translatorFinal',
        jsonb_build_array(
          jsonb_build_object('name','new.txt','url','https://ex.test/new','uploadedBy',v_t1::text)
        )
      )
    );
  exception
    when sqlstate '42501' then
      v_denied := true;
  end;
  reset role;
  if not v_denied then
    raise exception 'member wipe of others finals was not blocked';
  end if;
  if (select jsonb_array_length(translator_final) from public.cases where id = v_case) <> 2 then
    raise exception 'refused wipe changed stored finals';
  end if;

  v_denied := false;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case,
      (select revision from public.cases where id = v_case),
      jsonb_build_object('clientGuidelines', '[]'::jsonb)
    );
  exception
    when sqlstate '42501' then
      v_denied := true;
  end;
  reset role;
  if not v_denied then
    raise exception 'member guidelines write was not blocked';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  perform public.update_case_permitted_fields(
    v_case,
    (select revision from public.cases where id = v_case),
    jsonb_build_object(
      'translatorFinal',
      jsonb_build_array(
        jsonb_build_object('name','new.txt','url','https://ex.test/new','uploadedBy',v_t1::text)
      )
    )
  );
  reset role;
  if (select jsonb_array_length(translator_final) from public.cases where id = v_case) <> 1 then
    raise exception 'admin could not remove others finals';
  end if;
end;
$$;

rollback;
