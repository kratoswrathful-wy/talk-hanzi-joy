-- TASK-001 0356：公開入口 apply_internal_note_update 版本推進與防覆寫。
-- 以真實測試身分（test-t1／test-t2／test-pm）走 public RPC，不是 mock、不是只測 private。
-- 執行：隔離庫 MCP execute_sql 或具 BYPASSRLS 連線。全程清理 [0356-RPC] 列。禁止對正式庫執行。

create temp table if not exists _0356_rpc(chk text, outcome text, detail text);
delete from _0356_rpc;

do $$
declare
  v_t1 uuid := '10000000-0000-4000-8000-000000000003';
  v_t2 uuid := '10000000-0000-4000-8000-000000000004';
  v_pm uuid := '10000000-0000-4000-8000-000000000002';
  v_n1 uuid := '03560000-0001-4000-8000-000000000001';
  v_n2 uuid := '03560000-0001-4000-8000-000000000002';
  v_nprod uuid := '03560000-0001-4000-8000-000000000003';
  v_t0 timestamptz;
  v_t1_at timestamptz;
  v_prev timestamptz;
  v_next timestamptz;
  v_r jsonb;
  v_r2 jsonb;
  v_body jsonb;
  v_long text;
  v_i int;
  v_src text;
  v_ok_count int;
  v_stale_count int;
begin
  delete from public.internal_notes where id in (v_n1, v_n2, v_nprod)
    or title like '[0356-RPC]%';

  insert into public.internal_notes (
    id, title, related_case, creator, status, note_type, env, created_by,
    question_or_note, question_or_note_blocks, comments, created_at, updated_at
  ) values
    (
      v_n1, '[0356-RPC] N1', '[0356-RPC] case', '譯者一', 'open', 'question', 'test', v_t1,
      'NE 初稿短句', '[{"type":"paragraph","content":[{"type":"text","text":"NE 初稿短句"}]}]'::jsonb,
      '[]'::jsonb, clock_timestamp(), clock_timestamp()
    ),
    (
      v_n2, '[0356-RPC] N2', '[0356-RPC] case', '譯者一', 'open', 'question', 'test', v_t1,
      'NF 佔位', '[{"type":"paragraph","content":[{"type":"text","text":"NF 佔位"}]}]'::jsonb,
      '[]'::jsonb, clock_timestamp(), clock_timestamp()
    ),
    (
      v_nprod, '[0356-RPC] PROD', '[0356-RPC] case', '系統', 'open', 'question', 'production', v_pm,
      '正式環境列', '[]'::jsonb, '[]'::jsonb, clock_timestamp(), clock_timestamp()
    );

  select pg_get_functiondef('public.apply_internal_note_update(uuid,jsonb,timestamptz)'::regprocedure)
    into v_src;
  if v_src is null or position('assert_maintenance_write_allowed' in v_src) = 0 then
    insert into _0356_rpc values ('wrapper', 'FAIL', 'public wrapper missing maintenance assert');
  else
    insert into _0356_rpc values ('wrapper', 'PASS', 'assert still present');
  end if;

  select pg_get_functiondef('private.apply_internal_note_update_impl(uuid,jsonb,timestamptz)'::regprocedure)
    into v_src;
  if v_src is null or position('clock_timestamp()' in v_src) = 0 then
    insert into _0356_rpc values ('impl_clock', 'FAIL', 'impl missing clock_timestamp');
  else
    insert into _0356_rpc values ('impl_clock', 'PASS', 'clock_timestamp present');
  end if;

  if has_function_privilege('anon', 'public.apply_internal_note_update(uuid, jsonb, timestamptz)', 'EXECUTE')
     or has_function_privilege('public', 'public.apply_internal_note_update(uuid, jsonb, timestamptz)', 'EXECUTE') then
    insert into _0356_rpc values ('grant_anon', 'FAIL', 'PUBLIC/anon still has EXECUTE');
  else
    insert into _0356_rpc values ('grant_anon', 'PASS', 'anon/public revoked');
  end if;

  if not has_function_privilege('authenticated', 'public.apply_internal_note_update(uuid, jsonb, timestamptz)', 'EXECUTE') then
    insert into _0356_rpc values ('grant_auth', 'FAIL', 'authenticated missing EXECUTE');
  else
    insert into _0356_rpc values ('grant_auth', 'PASS', 'authenticated can execute');
  end if;

  select updated_at into v_t0 from public.internal_notes where id = v_n1;
  v_long := repeat('長文段落甲。', 40) || repeat('長文段落乙。', 40);
  v_body := jsonb_build_array(
    jsonb_build_object(
      'type', 'paragraph',
      'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', v_long))
    ),
    jsonb_build_object(
      'type', 'image',
      'props', jsonb_build_object('url', 'https://example.test/0356-rpc.png', 'name', '0356-rpc.png')
    )
  );

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_r := public.apply_internal_note_update(
    v_n1,
    jsonb_build_object('question_or_note_blocks', v_body, 'question_or_note', v_long),
    v_t0
  );
  reset role;

  v_t1_at := (v_r->'note'->>'updated_at')::timestamptz;
  if coalesce((v_r->>'ok')::boolean, false)
     and v_t1_at is not null
     and v_t1_at > v_t0
     and v_r#>>'{note,question_or_note_blocks,1,props,url}' = 'https://example.test/0356-rpc.png'
     and length(v_r#>>'{note,question_or_note}') > 200
     and exists (
       select 1 from public.internal_notes n
       where n.id = v_n1
         and n.updated_at is not distinct from v_t1_at
         and n.question_or_note_blocks is not distinct from v_body
     ) then
    insert into _0356_rpc values (
      'save_ok', 'PASS',
      format('expected=%s returned=%s', v_t0, v_t1_at)
    );
  else
    insert into _0356_rpc values (
      'save_ok', 'FAIL',
      coalesce(v_r::text, 'null')
    );
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_r := public.apply_internal_note_update(
    v_n1,
    jsonb_build_object(
      'question_or_note_blocks', jsonb_build_array(
        jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'A窗舊短句覆寫'))
        )
      )
    ),
    v_t0
  );
  reset role;

  if v_r->>'ok' = 'false'
     and v_r->>'error' = 'stale_updated_at'
     and exists (
       select 1 from public.internal_notes n
       where n.id = v_n1
         and n.updated_at is not distinct from v_t1_at
         and n.question_or_note_blocks is not distinct from v_body
     ) then
    insert into _0356_rpc values ('stale_reject', 'PASS', v_r->>'error');
  else
    insert into _0356_rpc values ('stale_reject', 'FAIL', coalesce(v_r::text, 'null'));
  end if;

  v_ok_count := 0;
  v_stale_count := 0;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_r := public.apply_internal_note_update(
    v_n1,
    jsonb_build_object('status', 'concurrent-a'),
    v_t1_at
  );
  reset role;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_r2 := public.apply_internal_note_update(
    v_n1,
    jsonb_build_object('status', 'concurrent-b'),
    v_t1_at
  );
  reset role;
  if coalesce((v_r->>'ok')::boolean, false) then v_ok_count := v_ok_count + 1; end if;
  if coalesce((v_r2->>'ok')::boolean, false) then v_ok_count := v_ok_count + 1; end if;
  if v_r->>'error' = 'stale_updated_at' then v_stale_count := v_stale_count + 1; end if;
  if v_r2->>'error' = 'stale_updated_at' then v_stale_count := v_stale_count + 1; end if;
  if v_ok_count = 1 and v_stale_count = 1
     and exists (
       select 1 from public.internal_notes n
       where n.id = v_n1
         and n.question_or_note_blocks is not distinct from v_body
         and n.status = 'concurrent-a'
     ) then
    insert into _0356_rpc values (
      'concurrent', 'PASS',
      format('ok=%s stale=%s r1=%s r2=%s', v_ok_count, v_stale_count, v_r->>'ok', v_r2->>'error')
    );
  else
    insert into _0356_rpc values (
      'concurrent', 'FAIL',
      format('ok=%s stale=%s r1=%s r2=%s', v_ok_count, v_stale_count, v_r::text, v_r2::text)
    );
  end if;

  select updated_at into v_prev from public.internal_notes where id = v_n1;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  for v_i in 1..5 loop
    set local role authenticated;
    v_r := public.apply_internal_note_update(
      v_n1,
      jsonb_build_object('question_or_note', 'rapid-' || v_i::text),
      v_prev
    );
    reset role;
    v_next := (v_r->'note'->>'updated_at')::timestamptz;
    if not coalesce((v_r->>'ok')::boolean, false) or v_next is null or v_next <= v_prev then
      insert into _0356_rpc values (
        'rapid', 'FAIL',
        format('i=%s prev=%s next=%s r=%s', v_i, v_prev, v_next, v_r::text)
      );
      v_prev := null;
      exit;
    end if;
    v_prev := v_next;
  end loop;
  if v_prev is not null then
    insert into _0356_rpc values ('rapid', 'PASS', format('final=%s', v_prev));
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_r := public.apply_internal_note_update(
    v_n1,
    '{}'::jsonb,
    v_prev
  );
  reset role;
  if v_r->>'ok' = 'false' and v_r->>'error' = 'empty_patch'
     and exists (select 1 from public.internal_notes n where n.id = v_n1 and n.updated_at is not distinct from v_prev) then
    insert into _0356_rpc values ('fail_empty', 'PASS', v_r->>'error');
  else
    insert into _0356_rpc values ('fail_empty', 'FAIL', coalesce(v_r::text, 'null'));
  end if;

  select question_or_note, updated_at into v_long, v_prev
  from public.internal_notes where id = v_n1;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_r := public.apply_internal_note_update(
    v_n1,
    jsonb_build_object('title', '[0356-RPC] N1 改標題'),
    v_prev
  );
  reset role;
  v_next := (v_r->'note'->>'updated_at')::timestamptz;
  if coalesce((v_r->>'ok')::boolean, false)
     and v_next > v_prev
     and v_r->'note'->>'question_or_note' = v_long
     and v_r->'note'->>'title' = '[0356-RPC] N1 改標題' then
    insert into _0356_rpc values ('field_title', 'PASS', format('%s -> %s', v_prev, v_next));
  else
    insert into _0356_rpc values ('field_title', 'FAIL', coalesce(v_r::text, 'null'));
  end if;

  v_prev := v_next;
  select question_or_note into v_long from public.internal_notes where id = v_n1;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_r := public.apply_internal_note_update(
    v_n1,
    jsonb_build_object(
      'comments', jsonb_build_array(
        jsonb_build_object('id', 'c1', 'author', '譯者二', 'content', '留言不覆蓋本文', 'createdAt', '2026-11-13T00:00:00Z')
      )
    ),
    v_prev
  );
  reset role;
  if coalesce((v_r->>'ok')::boolean, false)
     and v_r->'note'->>'question_or_note' = v_long
     and v_r#>>'{note,comments,0,content}' = '留言不覆蓋本文'
     and (v_r->'note'->>'updated_at')::timestamptz > v_prev then
    insert into _0356_rpc values ('field_comments', 'PASS', v_r->'note'->>'updated_at');
  else
    insert into _0356_rpc values ('field_comments', 'FAIL', coalesce(v_r::text, 'null'));
  end if;

  select updated_at into v_t0 from public.internal_notes where id = v_n2;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_r := public.apply_internal_note_update(
    v_n1,
    jsonb_build_object('related_case', '[0356-RPC] case-renamed'),
    (select updated_at from public.internal_notes where id = v_n1)
  );
  reset role;
  if coalesce((v_r->>'ok')::boolean, false)
     and exists (
       select 1 from public.internal_notes n
       where n.id = v_n2
         and n.updated_at is not distinct from v_t0
         and n.question_or_note = 'NF 佔位'
     )
     and v_r->'note'->>'related_case' = '[0356-RPC] case-renamed'
     and v_r->'note'->>'id' = v_n1::text then
    insert into _0356_rpc values ('two_notes', 'PASS', 'n2 unchanged');
  else
    insert into _0356_rpc values ('two_notes', 'FAIL', coalesce(v_r::text, 'null'));
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_r := public.apply_internal_note_update(
    v_n1,
    jsonb_build_object('question_or_note', (select question_or_note from public.internal_notes where id = v_n1)),
    (select updated_at from public.internal_notes where id = v_n1)
  );
  reset role;
  if coalesce((v_r->>'ok')::boolean, false)
     and coalesce((v_r->>'noop')::boolean, false)
     and (v_r->'note'->>'updated_at')::timestamptz is not distinct from
         (select updated_at from public.internal_notes where id = v_n1) then
    insert into _0356_rpc values ('noop', 'PASS', 'same version');
  else
    insert into _0356_rpc values ('noop', 'FAIL', coalesce(v_r::text, 'null'));
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );
  begin
    set local role anon;
    v_r := public.apply_internal_note_update(
      v_n1,
      jsonb_build_object('title', 'anon-should-fail'),
      (select updated_at from public.internal_notes where id = v_n1)
    );
    reset role;
    insert into _0356_rpc values ('anon', 'FAIL', coalesce(v_r::text, 'anon executed'));
  exception when others then
    reset role;
    insert into _0356_rpc values ('anon', 'PASS', sqlerrm);
  end;

  select updated_at into v_prev from public.internal_notes where id = v_nprod;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_r := public.apply_internal_note_update(
    v_nprod,
    jsonb_build_object('title', 'cross-env'),
    v_prev
  );
  reset role;
  if v_r->>'ok' = 'false' and v_r->>'error' = 'note_unavailable'
     and exists (select 1 from public.internal_notes n where n.id = v_nprod and n.title = '[0356-RPC] PROD') then
    insert into _0356_rpc values ('cross_env', 'PASS', v_r->>'error');
  else
    insert into _0356_rpc values ('cross_env', 'FAIL', coalesce(v_r::text, 'null'));
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_r := public.apply_internal_note_update(
    v_n1,
    jsonb_build_object('title', 'no-uid'),
    (select updated_at from public.internal_notes where id = v_n1)
  );
  reset role;
  if v_r->>'ok' = 'false' and v_r->>'error' = 'not_authorized' then
    insert into _0356_rpc values ('no_uid', 'PASS', v_r->>'error');
  else
    insert into _0356_rpc values ('no_uid', 'FAIL', coalesce(v_r::text, 'null'));
  end if;

  delete from public.internal_notes where id in (v_n1, v_n2, v_nprod)
    or title like '[0356-RPC]%';
end $$;

select chk, outcome, detail from _0356_rpc order by chk;
