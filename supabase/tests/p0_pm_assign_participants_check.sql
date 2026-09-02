-- STATUS: draft; NOT run against production; use isolated branch / local DB only.
--
-- P0-D嚗m_update_case_assignments + admin_create participant sync +
-- apply_case_update assignment strip + permission_settings dedup contract.
-- PostgreSQL 17嚗ermission_settings ?駁?雿輻 id::text ??嚗?甇?min(uuid)??
--
-- ?瑁?嚗EGIN?吐OLLBACK嚗?甇Ｗ?甇??摨怠銵?

begin;

do $$
declare
  v_pm uuid := gen_random_uuid();
  v_exec uuid := gen_random_uuid();
  v_member_a uuid := gen_random_uuid();
  v_member_b uuid := gen_random_uuid();
  v_member_c uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_prod_only uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_case2 uuid := gen_random_uuid();
  v_case3 uuid := gen_random_uuid();
  v_case4 uuid := gen_random_uuid();
  v_result jsonb;
  v_revision bigint;
  v_participant_count int;
  v_audit_count bigint;
  v_canonical uuid;
  v_dup_blocked boolean := false;
  v_translator_name text;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_pm, 'p0d-pm@test.local', '{"display_name":"P0D PM"}'),
    (v_exec, 'p0d-exec@test.local', '{"display_name":"P0D Exec"}'),
    (v_member_a, 'p0d-member-a@test.local', '{"display_name":"Member A"}'),
    (v_member_b, 'p0d-member-b@test.local', '{"display_name":"Member B"}'),
    (v_member_c, 'p0d-member-c@test.local', '{"display_name":"Member A"}'),
    (v_other, 'p0d-other@test.local', '{"display_name":"Other"}'),
    (v_prod_only, 'p0d-prod@test.local', '{"display_name":"Prod User"}');

  update public.profiles set is_test = true, display_name = 'Member A' where id = v_member_a;
  update public.profiles set is_test = true, display_name = 'Member B' where id = v_member_b;
  update public.profiles set is_test = true, display_name = 'Member A' where id = v_member_c;
  update public.profiles set is_test = true, display_name = 'Other' where id = v_other;
  update public.profiles set is_test = true where id in (v_pm, v_exec);
  update public.profiles set is_test = false, display_name = 'Prod User' where id = v_prod_only;

  delete from public.user_roles where user_id in (v_pm, v_exec, v_member_a, v_member_b, v_member_c, v_other);
  insert into public.user_roles(user_id, role) values
    (v_pm, 'pm'),
    (v_exec, 'executive'),
    (v_member_a, 'member'),
    (v_member_b, 'member'),
    (v_member_c, 'member');

  -- ?? permission_settings嚗? config 蝣箏??批??id::text asc嚗? min(uuid)嚗??
  delete from public.permission_settings where env = 'test';
  insert into public.permission_settings(id, env, config, updated_by)
  values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, 'test', '{"memberEditableFields":["title"]}'::jsonb, v_pm),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'test', '{"memberEditableFields":["title"]}'::jsonb, v_pm);

  delete from public.permission_settings ps
  where ps.env = 'test'
    and ps.id <> (
      select p2.id
      from public.permission_settings p2
      where p2.env = 'test'
      order by p2.id::text asc
      limit 1
    );

  if (select count(*) from public.permission_settings where env = 'test') <> 1 then
    raise exception 'permission_settings dedup contract failed';
  end if;

  v_canonical := private.p0_permission_settings_canonical_id('test');
  if v_canonical <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid then
    raise exception 'canonical id must be id::text minimum, got %', v_canonical;
  end if;

  -- config 銝???migration ?摩??fail closed嚗芋??migration DO block嚗?
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

  delete from public.permission_settings where env = 'test';
  insert into public.permission_settings(id, env, config, updated_by)
  values (gen_random_uuid(), 'test', '{"memberEditableFields":["title"]}'::jsonb, v_pm);

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  -- PM 撱箏歇?晷?桐犖獢???participant ?郊
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

  -- apply_case_update ???晷??
  v_result := public.apply_case_update(
    v_case,
    jsonb_build_object('translator', jsonb_build_array('Member B')),
    v_revision
  );
  if coalesce(v_result->>'error', '') <> 'assignment_field_use_pm_rpc' then
    raise exception 'apply_case_update should reject assignment keys, got %', v_result;
  end if;

  -- ?? display name嚗??詨???UUID ?晷甇?Ⅱ撣唾?嚗ember C 銋? Member A嚗?
  v_result := public.pm_update_case_assignments(
    v_case, v_revision,
    jsonb_build_object(
      'translator', jsonb_build_array('Member A'),
      'translator_user_id', v_member_c::text
    )
  );
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    raise exception 'same-name assign by uuid failed: %', v_result;
  end if;

  if not exists (
    select 1 from public.case_participants cp
    where cp.case_id = v_case and cp.user_id = v_member_c and cp.role = 'translator'
      and cp.access_revoked_at is null
  ) then
    raise exception 'same-name assign should bind member_c uuid';
  end if;

  if exists (
    select 1 from public.case_participants cp
    where cp.case_id = v_case and cp.user_id = v_member_a and cp.role = 'translator'
      and cp.access_revoked_at is null
  ) then
    raise exception 'same-name reassign should revoke member_a';
  end if;

  select revision into v_revision from public.cases where id = v_case;

  -- display name ??UUID 銝泵嚗erver 甇??? profile ?迂
  v_result := public.pm_update_case_assignments(
    v_case, v_revision,
    jsonb_build_object(
      'translator', jsonb_build_array('Wrong Display Name'),
      'translator_user_id', v_member_b::text
    )
  );
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    raise exception 'mismatched display normalize failed: %', v_result;
  end if;

  select translator->>0 into v_translator_name from public.cases where id = v_case;
  if v_translator_name <> 'Member B' then
    raise exception 'server should normalize translator name to profile, got %', v_translator_name;
  end if;

  select revision into v_revision from public.cases where id = v_case;

  -- ?征憪?雿 UUID ??
  v_result := public.pm_update_case_assignments(
    v_case, v_revision,
    jsonb_build_object(
      'translator', jsonb_build_array('Member A')
    )
  );
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'name-only assign should not succeed';
  end if;
  if coalesce(v_result->>'error', '') not like '%missing_translator_user_id%' then
    raise exception 'expected missing_translator_user_id, got %', v_result;
  end if;

  -- ?⊥? reviewer UUID ??
  v_result := public.pm_update_case_assignments(
    v_case, v_revision,
    jsonb_build_object('reviewer_user_id', 'not-a-valid-uuid')
  );
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'invalid reviewer uuid should not succeed';
  end if;
  if coalesce(v_result->>'error', '') <> 'invalid_reviewer_user_id' then
    raise exception 'expected invalid_reviewer_user_id, got %', v_result;
  end if;

  -- 頝?env user ID ??嚗roduction profile ??test env嚗?
  v_result := public.pm_update_case_assignments(
    v_case, v_revision,
    jsonb_build_object(
      'translator', jsonb_build_array('Prod User'),
      'translator_user_id', v_prod_only::text
    )
  );
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'cross-env assign should not succeed';
  end if;
  if coalesce(v_result->>'error', '') not like '%invalid_assignee%' then
    raise exception 'expected invalid_assignee for cross-env, got %', v_result;
  end if;

  -- 憭望???敺?神?伐?revision嚗articipant嚗udit 銝?嚗?
  select revision into v_revision from public.cases where id = v_case;
  select count(*) into v_participant_count
  from public.case_participants cp
  where cp.case_id = v_case and cp.access_revoked_at is null;
  select count(*) into v_audit_count from public.case_mutation_audit where case_id = v_case;

  v_result := public.pm_update_case_assignments(
    v_case, v_revision,
    jsonb_build_object(
      'translator', jsonb_build_array('Prod User'),
      'translator_user_id', v_prod_only::text
    )
  );
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'atomic rollback setup failed';
  end if;

  if (select revision from public.cases where id = v_case) is distinct from v_revision then
    raise exception 'failed assign must not bump revision';
  end if;
  if (select count(*) from public.case_participants cp where cp.case_id = v_case and cp.access_revoked_at is null)
     <> v_participant_count then
    raise exception 'failed assign must not change participants';
  end if;
  if (select count(*) from public.case_mutation_audit where case_id = v_case) <> v_audit_count then
    raise exception 'failed assign must not write audit';
  end if;

  -- 憭犖??嚗?銝 user ?拙?嚗?瘨????日
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

  -- ?敺??宏?斗??日 participant
  select revision into v_revision from public.cases where id = v_case2;
  v_result := public.pm_update_case_assignments(
    v_case2, v_revision,
    jsonb_build_object('collab_rows', '[]'::jsonb, 'collab_count', 0)
  );
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    raise exception 'pm remove last collab row failed: %', v_result;
  end if;

  if exists (
    select 1 from public.case_participants cp
    where cp.case_id = v_case2 and cp.user_id = v_member_a and cp.role = 'translator'
      and cp.access_revoked_at is null
  ) then
    raise exception 'participant should be revoked after last range removed';
  end if;

  -- 蝛箇憪?雿冗撣?UUID 銝?撱箇??梯? participant
  v_result := public.admin_create_case(v_case3, jsonb_build_object(
    'title', '[P0D] hidden uuid',
    'status', 'dispatched',
    'client', 'c',
    'multi_collab', true,
    'collab_rows', jsonb_build_array(
      jsonb_build_object(
        'id', 'row-h', 'segment', 'H', 'translator', '',
        'translatorUserId', v_member_b, 'accepted', true
      )
    )
  ));
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'hidden uuid collab row should not succeed';
  end if;
  if coalesce(v_result->>'error', '') not like '%hidden_translator_participant%' then
    raise exception 'expected hidden_translator_participant, got %', v_result;
  end if;

  -- collab ?征憪?雿 UUID
  v_result := public.admin_create_case(v_case4, jsonb_build_object(
    'title', '[P0D] name only collab',
    'status', 'dispatched',
    'client', 'c',
    'multi_collab', true,
    'collab_rows', jsonb_build_array(
      jsonb_build_object('id', 'row-x', 'segment', 'X', 'translator', 'Member B')
    )
  ));
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'collab name-only should not succeed';
  end if;
  if coalesce(v_result->>'error', '') not like '%missing_translator_user_id%' then
    raise exception 'expected missing_translator_user_id for collab, got %', v_result;
  end if;

  -- ??admin ??
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member_a::text, 'role', 'authenticated')::text,
    true
  );
  v_result := public.pm_update_case_assignments(
    v_case, v_revision, jsonb_build_object('status', 'delivered')
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
    v_case, 0, jsonb_build_object('status', 'delivered')
  );
  if coalesce(v_result->>'error', '') <> 'stale_revision' then
    raise exception 'stale revision not rejected: %', v_result;
  end if;

  raise notice 'P0-D pm_assign_participants_check: all assertions passed';
end;
$$;

rollback;
