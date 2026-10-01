-- STATUS: draft for isolated / local DB only; NOT run against production; unverified
--
-- 1C：一般留言可追加、不可整包刪別人的；提問勾選僅本案譯者或 admin。
-- 對齊 migration：20260930120300_case_social_fields.sql
--
-- 覆蓋（註解＋斷言）：
--   - 未登入拒絕
--   - 一般成員可追加留言；整包刪舊則 → comment_not_deletable，原列不變
--   - 非譯者改提問勾選 → field_not_permitted
--   - 本案譯者可改提問勾選
--   - comments／clientQuestionForm 不得走 update_case_permitted_fields
--   - 主管可整包覆寫留言
--
-- 執行：隔離／本機 DB；全程 BEGIN…ROLLBACK。本檔未對任何遠端庫執行。

begin;

do $$
declare
  v_t1 uuid := gen_random_uuid();
  v_viewer uuid := gen_random_uuid();
  v_pm uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_denied boolean := false;
  v_result jsonb;
  v_comments jsonb;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_t1, 'p0-1c-t1@test.local', '{"display_name":"1C 譯者"}'),
    (v_viewer, 'p0-1c-viewer@test.local', '{"display_name":"1C 一般"}'),
    (v_pm, 'p0-1c-pm@test.local', '{"display_name":"1C PM"}');
  update public.profiles set is_test = true where id in (v_t1, v_viewer, v_pm);
  delete from public.user_roles where user_id = v_pm;
  insert into public.user_roles(user_id, role) values (v_pm, 'pm');

  insert into public.cases (
    id, title, status, client, translator, env, created_by,
    comments, client_question_form, created_at, updated_at
  ) values (
    v_case, '[P0-1C] social fixture', 'dispatched', 'c', '[]'::jsonb, 'test', v_pm,
    jsonb_build_array(jsonb_build_object(
      'id','old','author','PM','content','舊則','createdAt','2026-09-30T00:00:00.000Z'
    )),
    false,
    now(), now()
  );
  insert into public.case_participants (
    case_id, user_id, role, source, created_by, updated_by
  ) values (
    v_case, v_t1, 'translator', 'pm_assign', v_pm, v_pm
  );

  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  begin
    perform public.update_case_social_fields(
      v_case, 0, jsonb_build_object('clientQuestionForm', true)
    );
  exception
    when insufficient_privilege or sqlstate '42501' then
      v_denied := true;
  end;
  reset role;
  if not v_denied then
    raise exception 'anon social write was not blocked';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_viewer::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.update_case_social_fields(
    v_case,
    (select revision from public.cases where id = v_case),
    jsonb_build_object(
      'comments',
      jsonb_build_array(
        jsonb_build_object('id','old','author','PM','content','舊則','createdAt','2026-09-30T00:00:00.000Z'),
        jsonb_build_object('id','n1','author','一般','content','新則','createdAt','2026-09-30T01:00:00.000Z')
      )
    )
  );
  reset role;
  select comments into v_comments from public.cases where id = v_case;
  if jsonb_array_length(v_comments) <> 2 then
    raise exception 'member could not append comment: %', v_comments;
  end if;

  v_denied := false;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_viewer::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.update_case_social_fields(
      v_case,
      (select revision from public.cases where id = v_case),
      jsonb_build_object(
        'comments',
        jsonb_build_array(
          jsonb_build_object('id','n1','author','一般','content','只留新的')
        )
      )
    );
  exception
    when sqlstate '42501' then
      v_denied := true;
  end;
  reset role;
  if not v_denied then
    raise exception 'member comment wipe was not blocked';
  end if;
  if (select jsonb_array_length(comments) from public.cases where id = v_case) <> 2 then
    raise exception 'refused wipe changed stored comments';
  end if;

  v_denied := false;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_viewer::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.update_case_social_fields(
      v_case,
      (select revision from public.cases where id = v_case),
      jsonb_build_object('clientQuestionForm', true)
    );
  exception
    when sqlstate '42501' then
      v_denied := true;
  end;
  reset role;
  if not v_denied then
    raise exception 'non-translator toggle was not blocked';
  end if;
  if (select client_question_form from public.cases where id = v_case) is distinct from false then
    raise exception 'refused toggle changed stored checkbox';
  end if;

  v_denied := false;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_viewer::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case,
      (select revision from public.cases where id = v_case),
      jsonb_build_object('comments', '[]'::jsonb)
    );
  exception
    when sqlstate '42501' then
      v_denied := true;
  end;
  reset role;
  if not v_denied then
    raise exception 'comments via permitted_fields was not blocked';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  perform public.update_case_social_fields(
    v_case,
    (select revision from public.cases where id = v_case),
    jsonb_build_object('clientQuestionForm', true)
  );
  reset role;
  if (select client_question_form from public.cases where id = v_case) is distinct from true then
    raise exception 'case translator could not toggle checkbox';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  perform public.update_case_social_fields(
    v_case,
    (select revision from public.cases where id = v_case),
    jsonb_build_object(
      'comments',
      jsonb_build_array(
        jsonb_build_object('id','only','author','PM','content','主管覆寫')
      )
    )
  );
  reset role;
  if (select comments -> 0 ->> 'id' from public.cases where id = v_case) <> 'only' then
    raise exception 'admin could not replace comments';
  end if;
end;
$$;

rollback;
