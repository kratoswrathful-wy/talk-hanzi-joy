-- TASK-001 1632：撤銷 authenticated／anon 對 internal_notes 的直接 UPDATE 後，
-- 舊頁等效直寫須可辨識拒絕且不改資料；新頁公開 RPC、INSERT、DELETE、留言仍可用。
-- 以真實測試身分（test-t1／test-t2／test-pm）走 public 路徑。
-- 執行：隔離庫 MCP execute_sql。全程清理 [1632-REV]／[1632-OLD] 列。禁止對正式庫執行。

create temp table if not exists _1632_rev(chk text, outcome text, detail text);
delete from _1632_rev;

do $$
declare
  v_t1 uuid := '10000000-0000-4000-8000-000000000003';
  v_t2 uuid := '10000000-0000-4000-8000-000000000004';
  v_pm uuid := '10000000-0000-4000-8000-000000000002';
  v_n1 uuid := '16320000-0002-4000-8000-000000000001';
  v_n2 uuid := '16320000-0002-4000-8000-000000000002';
  v_nins uuid := '16320000-0002-4000-8000-000000000003';
  v_t0 timestamptz;
  v_t1_at timestamptz;
  v_r jsonb;
  v_long text;
  v_body jsonb;
  v_old_rows int;
  v_old_err text;
  v_ins_ok boolean := false;
  v_del_ok boolean := false;
begin
  delete from public.internal_notes
   where id in (v_n1, v_n2, v_nins)
      or id = '16320000-0001-4000-8000-000000000001'
      or title like '[1632-OLD]%'
      or title like '[1632-REV]%';

  if has_table_privilege('authenticated', 'public.internal_notes', 'UPDATE') then
    insert into _1632_rev values ('priv_auth_update', 'FAIL', 'authenticated still has UPDATE');
  else
    insert into _1632_rev values ('priv_auth_update', 'PASS', 'authenticated UPDATE revoked');
  end if;

  if has_table_privilege('anon', 'public.internal_notes', 'UPDATE') then
    insert into _1632_rev values ('priv_anon_update', 'FAIL', 'anon still has UPDATE');
  else
    insert into _1632_rev values ('priv_anon_update', 'PASS', 'anon UPDATE revoked');
  end if;

  if not has_table_privilege('authenticated', 'public.internal_notes', 'SELECT')
     or not has_table_privilege('authenticated', 'public.internal_notes', 'INSERT')
     or not has_table_privilege('authenticated', 'public.internal_notes', 'DELETE') then
    insert into _1632_rev values (
      'priv_auth_sid', 'FAIL',
      format('select=%s insert=%s delete=%s',
        has_table_privilege('authenticated', 'public.internal_notes', 'SELECT'),
        has_table_privilege('authenticated', 'public.internal_notes', 'INSERT'),
        has_table_privilege('authenticated', 'public.internal_notes', 'DELETE'))
    );
  else
    insert into _1632_rev values ('priv_auth_sid', 'PASS', 'SELECT/INSERT/DELETE kept');
  end if;

  insert into public.internal_notes (
    id, title, related_case, creator, status, note_type, env, created_by,
    question_or_note, question_or_note_blocks, comments, created_at, updated_at
  ) values (
    v_n1, '[1632-REV] N1', '[1632-REV] case', '譯者二', 'open', 'question', 'test', v_t2,
    '初稿短句', '[{"type":"paragraph","content":[{"type":"text","text":"初稿短句"}]}]'::jsonb,
    '[]'::jsonb, clock_timestamp(), clock_timestamp()
  );

  select updated_at into v_t0 from public.internal_notes where id = v_n1;
  v_long := repeat('長文段落甲。', 40) || repeat('長文段落乙。', 40);
  v_body := jsonb_build_array(
    jsonb_build_object(
      'type', 'paragraph',
      'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', v_long))
    )
  );

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
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
     and length(v_r#>>'{note,question_or_note}') > 200
     and exists (
       select 1 from public.internal_notes n
       where n.id = v_n1
         and n.updated_at is not distinct from v_t1_at
         and n.question_or_note is not distinct from v_long
     ) then
    insert into _1632_rev values ('new_page_rpc', 'PASS', format('%s -> %s', v_t0, v_t1_at));
  else
    insert into _1632_rev values ('new_page_rpc', 'FAIL', coalesce(v_r::text, 'null'));
  end if;

  v_old_rows := -1;
  v_old_err := null;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  begin
    set local role authenticated;
    update public.internal_notes
       set question_or_note = 'OLD-PAGE-OVERWRITE',
           updated_at = clock_timestamp()
     where id = v_n1;
    get diagnostics v_old_rows = row_count;
    reset role;
  exception when others then
    v_old_err := sqlerrm;
    reset role;
  end;

  if v_old_err is not null
     and v_old_rows < 1
     and exists (
       select 1 from public.internal_notes n
       where n.id = v_n1
         and n.question_or_note is not distinct from v_long
         and n.updated_at is not distinct from v_t1_at
     ) then
    insert into _1632_rev values (
      'old_page_direct_update', 'PASS',
      format('rejected err=%s', v_old_err)
    );
    insert into _1632_rev values ('overwrite', 'PASS', 'NO; long body kept');
  else
    insert into _1632_rev values (
      'old_page_direct_update', 'FAIL',
      format('rows=%s err=%s', v_old_rows, coalesce(v_old_err, 'none'))
    );
    if exists (
      select 1 from public.internal_notes n
      where n.id = v_n1 and n.question_or_note = 'OLD-PAGE-OVERWRITE'
    ) then
      insert into _1632_rev values ('overwrite', 'FAIL', 'YES');
    else
      insert into _1632_rev values ('overwrite', 'FAIL', 'body unclear');
    end if;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_r := public.apply_internal_note_update(
    v_n1,
    jsonb_build_object(
      'comments', jsonb_build_array(
        jsonb_build_object(
          'id', 'c-1632',
          'author', '譯者一',
          'content', '留言不覆蓋本文',
          'createdAt', '2026-11-15T00:00:00Z'
        )
      )
    ),
    v_t1_at
  );
  reset role;

  if coalesce((v_r->>'ok')::boolean, false)
     and v_r->'note'->>'question_or_note' = v_long
     and v_r#>>'{note,comments,0,content}' = '留言不覆蓋本文' then
    insert into _1632_rev values ('comments_rpc', 'PASS', v_r->'note'->>'updated_at');
  else
    insert into _1632_rev values ('comments_rpc', 'FAIL', coalesce(v_r::text, 'null'));
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  begin
    set local role authenticated;
    insert into public.internal_notes (
      id, title, related_case, creator, status, note_type, env, created_by,
      question_or_note, question_or_note_blocks, comments
    ) values (
      v_nins, '[1632-REV] CAT-INSERT', '[1632-REV] case', '專案經理', 'open', 'question', 'test', v_pm,
      'CAT 新增提問', '[]'::jsonb, '[]'::jsonb
    );
    v_ins_ok := found;
    reset role;
  exception when others then
    reset role;
    insert into _1632_rev values ('insert_auth', 'FAIL', sqlerrm);
    v_ins_ok := false;
  end;
  if v_ins_ok and exists (select 1 from public.internal_notes where id = v_nins) then
    insert into _1632_rev values ('insert_auth', 'PASS', 'CAT-style INSERT kept');
  elsif not exists (select 1 from _1632_rev where chk = 'insert_auth') then
    insert into _1632_rev values ('insert_auth', 'FAIL', 'row missing');
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  begin
    set local role authenticated;
    delete from public.internal_notes where id = v_nins;
    get diagnostics v_old_rows = row_count;
    v_del_ok := v_old_rows = 1;
    reset role;
  exception when others then
    reset role;
    insert into _1632_rev values ('delete_auth', 'FAIL', sqlerrm);
    v_del_ok := false;
  end;
  if v_del_ok and not exists (select 1 from public.internal_notes where id = v_nins) then
    insert into _1632_rev values ('delete_auth', 'PASS', 'DELETE kept');
  elsif not exists (select 1 from _1632_rev where chk = 'delete_auth') then
    insert into _1632_rev values ('delete_auth', 'FAIL', format('rows=%s', v_old_rows));
  end if;

  delete from public.internal_notes
   where id in (v_n1, v_n2, v_nins)
      or id = '16320000-0001-4000-8000-000000000001'
      or title like '[1632-OLD]%'
      or title like '[1632-REV]%';
end $$;

select chk, outcome, detail from _1632_rev order by chk;
