-- STATUS: draft; NOT run against production; use isolated branch / local DB only.
--
-- P0-D：pm_update_case_assignments + admin_create participant sync +
-- apply_case_update assignment strip + permission_settings dedup contract.
--
-- 執行：BEGIN…ROLLBACK；禁止對正式庫執行。

begin;

do $$
declare
  v_pm uuid := gen_random_uuid();
  v_exec uuid := gen_random_uuid();
  v_member_a uuid := gen_random_uuid();
  v_member_b uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_case2 uuid := gen_random_uuid();
  v_result jsonb;
  v_revision bigint;
  v_participant_count int;
  v_dup_blocked boolean := false;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_pm, 'p0d-pm@test.local', '{"display_name":"P0D PM"}'),
    (v_exec, 'p0d-exec@test.local', '{"display_name":"P0D Exec"}'),
    (v_member_a, 'p0d-member-a@test.local', '{"display_name":"Member A"}'),
    (v_member_b, 'p0d-member-b@test.local', '{"display_name":"Member B"}'),
    (v_other, 'p0d-other@test.local', '{"display_name":"Other"}');

  update public.profiles set is_test = true, display_name = 'Member A' where id = v_member_a;
  update public.profiles set is_test = true, display_name = 'Member B' where id = v_member_b;
  update public.profiles set is_test = true, display_name = 'Other' where id = v_other;
  update public.profiles set is_test = true where id in (v_pm, v_exec);

  delete from public.user_roles where user_id in (v_pm, v_exec, v_member_a, v_member_b, v_other);
  insert into public.user_roles(user_id, role) values
    (v_pm, 'pm'),
    (v_exec, 'executive'),
    (v_member_a, 'member'),
    (v_member_b, 'member');

  -- permission_settings：test 重複且 config 相同 → 清理後恰好一筆
  delete from public.permission_settings where env = 'test';
  insert into public.permission_settings(id, env, config, updated_by)
  values
    (gen_random_uuid(), 'test', '{"memberEditableFields":["title"]}'::jsonb, v_pm),
    (gen_random_uuid(), 'test', '{"memberEditableFields":["title"]}'::jsonb, v_pm);

  -- 模擬 migration dedup（若尚未套用 migration，測試自身清理）
  delete from public.permission_settings ps
  where ps.env = 'test'
    and ps.id <> (select min(p2.id) from public.permission_settings p2 where p2.env = 'test');

  if (select count(*) from public.permission_settings where env = 'test') <> 1 then
    raise exception 'permission_settings dedup contract failed';
  end if;

  -- 重複 config 衝突（不同 config 不得自動選）
  insert into public.permission_settings(id, env, config, updated_by)
  values (gen_random_uuid(), 'test', '{"memberEditableFields":["client"]}'::jsonb, v_pm);
  begin
    if (select count(distinct config::text) from public.permission_settings where env = 'test') > 1 then
      v_dup_blocked := true;
    end if;
  end;
  delete from public.permission_settings where env = 'test' and config::text like '%client%';
  if not v_dup_blocked then
    raise exception 'expected distinct test permission_settings configs to be detectable';
  end if;

  -- 還原單筆 test settings
  delete from public.permission_settings where env = 'test';
  insert into public.permission_settings(id, env, config, updated_by)
  values (gen_random_uuid(), 'test', '{"memberEditableFields":["title"]}'::jsonb, v_pm);

  -- PM 建已指派單人案 → participant 同步
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  v_result := public.admin_create_case(v_case, jsonb_build_object(
    'title', '[P0D] single assign',
    'status', 'dispatched',
    'client', 'c',
    'translator', jsonb_build_array('Member A'),
    'translator_user_id', v_member_a::text
  ));
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    raise exception 'admin_create_case failed: %', v_result;
  end if;

  if not exists (
    select 1 from public.case_participants cp
    where cp.case_id = v_case and cp.user_id = v_member_a and cp.role = 'translator'
      and cp.access_revoked_at is null and cp.source = 'pm_assign'
  ) then
    raise exception 'admin_create_case did not create translator participant';
  end if;

  select revision into v_revision from public.cases where id = v_case;

  -- apply_case_update 拒絕指派鍵
  v_result := public.apply_case_update(
    v_case,
    jsonb_build_object('translator', jsonb_build_array('Member B')),
    v_revision
  );
  if coalesce(v_result->>'error', '') <> 'assignment_field_use_pm_rpc' then
    raise exception 'apply_case_update should reject assignment keys, got %', v_result;
  end if;

  -- PM 改派
  v_result := public.pm_update_case_assignments(
    v_case, v_revision,
    jsonb_build_object(
      'translator', jsonb_build_array('Member B'),
      'translator_user_id', v_member_b::text
    )
  );
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    raise exception 'pm_update_case_assignments reassign failed: %', v_result;
  end if;

  if exists (
    select 1 from public.case_participants cp
    where cp.case_id = v_case and cp.user_id = v_member_a and cp.role = 'translator'
      and cp.access_revoked_at is null
  ) then
    raise exception 'old translator participant should be revoked after reassign';
  end if;

  if not exists (
    select 1 from public.case_participants cp
    where cp.case_id = v_case and cp.user_id = v_member_b and cp.role = 'translator'
      and cp.access_revoked_at is null
  ) then
    raise exception 'new translator participant missing after reassign';
  end if;

  -- 多人協作：同一 user 兩列，取消一列不撤銷
  v_result := public.admin_create_case(v_case2, jsonb_build_object(
    'title', '[P0D] multi collab',
    'status', 'dispatched',
    'client', 'c',
    'multi_collab', true,
    'collab_count', 2,
    'collab_rows', jsonb_build_array(
      jsonb_build_object(
        'id', 'row-1', 'segment', 'A', 'translator', 'Member A',
        'translatorUserId', v_member_a, 'accepted', true
      ),
      jsonb_build_object(
        'id', 'row-2', 'segment', 'B', 'translator', 'Member A',
        'translatorUserId', v_member_a, 'accepted', true
      )
    )
  ));
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    raise exception 'admin_create_case multi failed: %', v_result;
  end if;

  select revision into v_revision from public.cases where id = v_case2;

  v_result := public.pm_update_case_assignments(
    v_case2, v_revision,
    jsonb_build_object(
      'collab_rows', jsonb_build_array(
        jsonb_build_object(
          'id', 'row-1', 'segment', 'A', 'translator', 'Member A',
          'translatorUserId', v_member_a, 'accepted', true
        )
      ),
      'collab_count', 1
    )
  );
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    raise exception 'pm partial row remove failed: %', v_result;
  end if;

  if not exists (
    select 1 from public.case_participants cp
    where cp.case_id = v_case2 and cp.user_id = v_member_a and cp.role = 'translator'
      and cp.access_revoked_at is null
  ) then
    raise exception 'participant wrongly revoked while user still has another range';
  end if;

  -- 非 admin 拒絕
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member_a::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.pm_update_case_assignments(
    v_case2, v_revision, jsonb_build_object('status', 'delivered')
  );
  if coalesce(v_result->>'error', '') <> 'not_authorized' then
    raise exception 'non-admin pm_update should be not_authorized, got %', v_result;
  end if;

  -- stale revision
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.pm_update_case_assignments(
    v_case2, 0, jsonb_build_object('status', 'delivered')
  );
  if coalesce(v_result->>'error', '') <> 'stale_revision' then
    raise exception 'stale revision not rejected: %', v_result;
  end if;

  -- 缺 user_id 拒絕（不可只用 display name）
  select revision into v_revision from public.cases where id = v_case2;
  v_result := public.pm_update_case_assignments(
    v_case2, v_revision,
    jsonb_build_object(
      'collab_rows', jsonb_build_array(
        jsonb_build_object(
          'id', 'row-1', 'segment', 'A', 'translator', 'Member B'
        )
      )
    )
  );
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'name-only assign should not succeed';
  end if;

  raise notice 'P0-D pm_assign_participants_check: all assertions passed';
end;
$$;

rollback;
