-- STATUS: draft; NOT run against production; use isolated branch / local DB only.
--
-- P0-D: pm_update_case_assignments + admin_create participant sync +
-- apply_case_update assignment strip + permission_settings dedup contract.
-- PostgreSQL 17: permission_settings dedup uses id::text ordering (not min(uuid)).
--
-- Run inside BEGIN ... ROLLBACK only.

begin;

do $$
declare
  v_pm uuid := gen_random_uuid();
  v_member_a uuid := gen_random_uuid();
  v_member_b uuid := gen_random_uuid();
  v_member_c uuid := gen_random_uuid();
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
  v_translator_name text;
  v_dup_ok boolean := false;
  v_case_translator jsonb;
  v_case_reviewer text;
  v_case_status text;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_pm, 'p0d-pm@test.local', '{"display_name":"P0D PM"}'),
    (v_member_a, 'p0d-member-a@test.local', '{"display_name":"Member A"}'),
    (v_member_b, 'p0d-member-b@test.local', '{"display_name":"Member B"}'),
    (v_member_c, 'p0d-member-c@test.local', '{"display_name":"Member A"}'),
    (v_prod_only, 'p0d-prod@test.local', '{"display_name":"Prod User"}');

  update public.profiles set is_test = true, display_name = 'Member A' where id = v_member_a;
  update public.profiles set is_test = true, display_name = 'Member B' where id = v_member_b;
  update public.profiles set is_test = true, display_name = 'Member A' where id = v_member_c;
  update public.profiles set is_test = true where id = v_pm;
  update public.profiles set is_test = false, display_name = 'Prod User' where id = v_prod_only;

  delete from public.user_roles where user_id in (v_pm, v_member_a, v_member_b, v_member_c);
  insert into public.user_roles(user_id, role) values
    (v_pm, 'pm'),
    (v_member_a, 'member'),
    (v_member_b, 'member'),
    (v_member_c, 'member');

  -- permission_settings: exercise migration helper (not ad-hoc duplicate SQL)
  drop index if exists public.permission_settings_env_unique;
  delete from public.permission_settings where env = 'test';

  insert into public.permission_settings(id, env, config, updated_by)
  values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, 'test', '{"memberEditableFields":["title"]}'::jsonb, v_pm),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'test', '{"memberEditableFields":["title"]}'::jsonb, v_pm);

  perform private.p0_dedupe_permission_settings_env('test');

  if (select count(*) from public.permission_settings where env = 'test') <> 1 then
    raise exception 'permission_settings dedup contract failed';
  end if;

  v_canonical := private.p0_permission_settings_canonical_id('test');
  if v_canonical <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid then
    raise exception 'canonical id must be id::text minimum, got %', v_canonical;
  end if;

  delete from public.permission_settings where env = 'test';
  insert into public.permission_settings(id, env, config, updated_by)
  values
    (gen_random_uuid(), 'test', '{"memberEditableFields":["title"]}'::jsonb, v_pm),
    (gen_random_uuid(), 'test', '{"memberEditableFields":["client"]}'::jsonb, v_pm);

  begin
    perform private.p0_dedupe_permission_settings_env('test');
    raise exception 'different config should fail closed';
  exception
    when sqlstate '22023' then
      v_dup_ok := true;
  end;
  if not v_dup_ok then
    raise exception 'expected permission_settings_test_config_conflict';
  end if;

  delete from public.permission_settings where env = 'test';
  insert into public.permission_settings(id, env, config, updated_by)
  values (gen_random_uuid(), 'test', '{"memberEditableFields":["title"]}'::jsonb, v_pm);

  create unique index if not exists permission_settings_env_unique
    on public.permission_settings (env);

  begin
    insert into public.permission_settings(id, env, config, updated_by)
    values (gen_random_uuid(), 'test', '{"memberEditableFields":["other"]}'::jsonb, v_pm);
    raise exception 'unique(env) should block duplicate test row';
  exception
    when unique_violation then
      null;
  end;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  -- 1) admin_create_case: participant sync (not only ok=true)
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
    where cp.case_id = v_case
      and cp.user_id = v_member_a
      and cp.role = 'translator'
      and cp.work_status = 'active'
      and cp.source = 'pm_assign'
      and cp.access_revoked_at is null
  ) then
    raise exception 'admin_create_case did not create active pm_assign translator participant';
  end if;

  select revision into v_revision from public.cases where id = v_case;

  v_result := public.apply_case_update(
    v_case,
    jsonb_build_object('translator', jsonb_build_array('Member B')),
    v_revision
  );
  if coalesce(v_result->>'error', '') <> 'assignment_field_use_pm_rpc' then
    raise exception 'apply_case_update should reject assignment keys, got %', v_result;
  end if;

  -- 2) same display name: bind selected UUID; revoke prior participant
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
    where cp.case_id = v_case
      and cp.user_id = v_member_c
      and cp.role = 'translator'
      and cp.work_status = 'active'
      and cp.access_revoked_at is null
  ) then
    raise exception 'same-name assign should bind member_c as active translator participant';
  end if;

  if exists (
    select 1 from public.case_participants cp
    where cp.case_id = v_case
      and cp.user_id = v_member_a
      and cp.role = 'translator'
      and cp.access_revoked_at is null
  ) then
    raise exception 'same-name reassign should revoke member_a participant';
  end if;

  select translator->>0 into v_translator_name from public.cases where id = v_case;
  if v_translator_name <> 'Member A' then
    raise exception 'same-name reassign should server-normalize display name to Member A, got %', v_translator_name;
  end if;

  select revision into v_revision from public.cases where id = v_case;

  -- 5) invalid translator UUID (stable, before normalize)
  v_result := public.pm_update_case_assignments(
    v_case, v_revision,
    jsonb_build_object('translator_user_id', 'not-a-valid-uuid')
  );
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'invalid translator uuid should not succeed';
  end if;
  if coalesce(v_result->>'error', '') <> 'invalid_translator_user_id' then
    raise exception 'expected invalid_translator_user_id, got %', v_result;
  end if;

  -- 5) invalid reviewer UUID
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

  -- server normalizes mismatched display name from profile UUID
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
    raise exception 'server should normalize translator name, got %', v_translator_name;
  end if;

  select revision into v_revision from public.cases where id = v_case;

  -- 5) name-only single translator assignment
  v_result := public.pm_update_case_assignments(
    v_case, v_revision,
    jsonb_build_object('translator', jsonb_build_array('Member A'))
  );
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'name-only assign should not succeed';
  end if;
  if coalesce(v_result->>'error', '') <> 'missing_translator_user_id' then
    raise exception 'expected missing_translator_user_id, got %', v_result;
  end if;

  -- 5) cross-env user
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
  if coalesce(v_result->>'error', '') <> 'invalid_assignee' then
    raise exception 'expected invalid_assignee for cross-env, got %', v_result;
  end if;

  -- 6) failed update atomic rollback: revision, participant, audit unchanged
  select revision into v_revision from public.cases where id = v_case;
  select translator, reviewer, status
    into v_case_translator, v_case_reviewer, v_case_status
  from public.cases where id = v_case;
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
  if coalesce(v_result->>'error', '') <> 'invalid_assignee' then
    raise exception 'atomic rollback setup expected invalid_assignee, got %', v_result;
  end if;

  if (select revision from public.cases where id = v_case) is distinct from v_revision then
    raise exception 'failed assign must not bump revision';
  end if;
  if (select translator from public.cases where id = v_case) is distinct from v_case_translator then
    raise exception 'failed assign must not change cases.translator';
  end if;
  if (select reviewer from public.cases where id = v_case) is distinct from v_case_reviewer then
    raise exception 'failed assign must not change cases.reviewer';
  end if;
  if (select status from public.cases where id = v_case) is distinct from v_case_status then
    raise exception 'failed assign must not change cases.status';
  end if;
  if (select count(*) from public.case_participants cp where cp.case_id = v_case and cp.access_revoked_at is null)
     <> v_participant_count then
    raise exception 'failed assign must not change participants';
  end if;
  if (select count(*) from public.case_mutation_audit where case_id = v_case) <> v_audit_count then
    raise exception 'failed assign must not write audit';
  end if;

  -- multi collab: partial row remove keeps participant
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

  -- 5) hidden translator UUID (blank name + UUID)
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
  if coalesce(v_result->>'error', '') <> 'hidden_translator_participant' then
    raise exception 'expected hidden_translator_participant, got %', v_result;
  end if;

  -- 5) collab name-only (no UUID)
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
  if coalesce(v_result->>'error', '') <> 'missing_translator_user_id' then
    raise exception 'expected missing_translator_user_id for collab, got %', v_result;
  end if;

  -- 5) hidden reviewer UUID
  v_result := public.admin_create_case(gen_random_uuid(), jsonb_build_object(
    'title', '[P0D] hidden reviewer',
    'status', 'dispatched',
    'client', 'c',
    'multi_collab', true,
    'review_rows', jsonb_build_array(
      jsonb_build_object(
        'id', 'rev-h', 'segment', 'R', 'reviewer', '',
        'reviewerUserId', v_member_b
      )
    )
  ));
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'hidden reviewer uuid should not succeed';
  end if;
  if coalesce(v_result->>'error', '') <> 'hidden_reviewer_participant' then
    raise exception 'expected hidden_reviewer_participant, got %', v_result;
  end if;

  -- 3) non-admin member: not_authorized, no side effects
  select revision into v_revision from public.cases where id = v_case;
  select translator, reviewer, status
    into v_case_translator, v_case_reviewer, v_case_status
  from public.cases where id = v_case;
  select count(*) into v_participant_count
  from public.case_participants cp
  where cp.case_id = v_case and cp.access_revoked_at is null;
  select count(*) into v_audit_count from public.case_mutation_audit where case_id = v_case;

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
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'non-admin pm_update must not succeed';
  end if;

  if (select revision from public.cases where id = v_case) is distinct from v_revision then
    raise exception 'not_authorized must not bump revision';
  end if;
  if (select translator from public.cases where id = v_case) is distinct from v_case_translator then
    raise exception 'not_authorized must not change cases.translator';
  end if;
  if (select reviewer from public.cases where id = v_case) is distinct from v_case_reviewer then
    raise exception 'not_authorized must not change cases.reviewer';
  end if;
  if (select status from public.cases where id = v_case) is distinct from v_case_status then
    raise exception 'not_authorized must not change cases.status';
  end if;
  if (select count(*) from public.case_participants cp where cp.case_id = v_case and cp.access_revoked_at is null)
     <> v_participant_count then
    raise exception 'not_authorized must not change participants';
  end if;
  if (select count(*) from public.case_mutation_audit where case_id = v_case) <> v_audit_count then
    raise exception 'not_authorized must not write audit';
  end if;

  -- 4) stale revision: no side effects
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  select revision into v_revision from public.cases where id = v_case;
  select translator, reviewer, status
    into v_case_translator, v_case_reviewer, v_case_status
  from public.cases where id = v_case;
  select count(*) into v_participant_count
  from public.case_participants cp
  where cp.case_id = v_case and cp.access_revoked_at is null;
  select count(*) into v_audit_count from public.case_mutation_audit where case_id = v_case;

  v_result := public.pm_update_case_assignments(
    v_case, 0, jsonb_build_object('status', 'delivered')
  );
  if coalesce(v_result->>'error', '') <> 'stale_revision' then
    raise exception 'stale revision not rejected: %', v_result;
  end if;
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'stale revision must not succeed';
  end if;

  if (select revision from public.cases where id = v_case) is distinct from v_revision then
    raise exception 'stale_revision must not bump revision';
  end if;
  if (select translator from public.cases where id = v_case) is distinct from v_case_translator then
    raise exception 'stale_revision must not change cases.translator';
  end if;
  if (select reviewer from public.cases where id = v_case) is distinct from v_case_reviewer then
    raise exception 'stale_revision must not change cases.reviewer';
  end if;
  if (select status from public.cases where id = v_case) is distinct from v_case_status then
    raise exception 'stale_revision must not change cases.status';
  end if;
  if (select count(*) from public.case_participants cp where cp.case_id = v_case and cp.access_revoked_at is null)
     <> v_participant_count then
    raise exception 'stale_revision must not change participants';
  end if;
  if (select count(*) from public.case_mutation_audit where case_id = v_case) <> v_audit_count then
    raise exception 'stale_revision must not write audit';
  end if;

  raise notice 'P0-D pm_assign_participants_check: all assertions passed';
end;
$$;

rollback;
