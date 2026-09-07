-- P0-A2：P0-A0 證實現有候選均缺不可變 provenance。
-- 本 migration 不建立任何 participant，只把候選列入 unresolved 供人工核對。

insert into public.case_participant_backfill_unresolved (
  case_id, env, candidate_user_id, candidate_role,
  source_kind, source_record_id, reason
)
select distinct
  c.id,
  c.env,
  p.id,
  source_rows.candidate_role,
  'cases.collab_rows_uuid',
  source_rows.source_record_id,
  'legacy_uuid_without_immutable_provenance'
from public.cases c
cross join lateral (
  select
    nullif(r.value ->> 'translatorUserId', '') as candidate_user_id,
    'translator'::text as candidate_role,
    r.value ->> 'id' as source_record_id
  from jsonb_array_elements(
    case when jsonb_typeof(c.collab_rows) = 'array'
      then c.collab_rows else '[]'::jsonb end
  ) r
  union all
  select
    nullif(r.value ->> 'reviewerUserId', ''),
    'reviewer',
    r.value ->> 'id'
  from jsonb_array_elements(
    case when jsonb_typeof(c.collab_rows) = 'array'
      then c.collab_rows else '[]'::jsonb end
  ) r
) source_rows
join public.profiles p on p.id::text = source_rows.candidate_user_id
where source_rows.candidate_user_id is not null
on conflict do nothing;

insert into public.case_participant_backfill_unresolved (
  case_id, env, candidate_user_id, candidate_role,
  source_kind, source_record_id, reason
)
select distinct
  c.id,
  c.env,
  null::uuid,
  source_rows.candidate_role,
  'cases_name_only',
  source_rows.source_record_id,
  'name_only_not_an_authorization_identity'
from public.cases c
cross join lateral (
  select 'translator'::text, 'case.translator'::text
  where exists (
    select 1
    from jsonb_array_elements_text(
      case when jsonb_typeof(c.translator) = 'array'
        then c.translator else '[]'::jsonb end
    ) t(value)
    where nullif(trim(t.value), '') is not null
  )
  union all
  select 'reviewer', 'case.reviewer'
  where nullif(trim(c.reviewer), '') is not null
) source_rows(candidate_role, source_record_id)
on conflict do nothing;

insert into public.case_participant_backfill_unresolved (
  case_id, env, candidate_user_id, candidate_role,
  source_kind, source_record_id, reason
)
select distinct
  a.case_id,
  c.env,
  a.translator_user_id,
  'translator',
  'cat_assignments',
  a.id::text,
  'uuid_fk_without_immutable_assignment_provenance'
from public.cat_assignments a
join public.cases c on c.id = a.case_id
on conflict do nothing;

insert into public.case_participant_backfill_unresolved (
  case_id, env, candidate_user_id, candidate_role,
  source_kind, source_record_id, reason
)
select distinct
  f.related_lms_case_id,
  c.env,
  a.assignee_user_id,
  null,
  'cat_file_assignments',
  a.id::text,
  'uuid_relation_without_immutable_assignment_provenance'
from public.cat_file_assignments a
join public.cat_files f on f.id = a.file_id
join public.cases c
  on c.id = f.related_lms_case_id
  and c.env = f.env
where f.related_lms_case_id is not null
on conflict do nothing;

insert into public.case_participant_backfill_unresolved (
  case_id, env, candidate_user_id, candidate_role,
  source_kind, source_record_id, reason
)
select distinct
  f.related_lms_case_id,
  c.env,
  a.assignee_user_id,
  case when s.stage_kind = 'review' then 'reviewer' else 'translator' end,
  'cat_stage_assignments',
  a.id::text,
  'uuid_relation_without_immutable_assignment_provenance'
from public.cat_stage_assignments a
join public.cat_files f on f.id = a.file_id
join public.cat_file_workflow_stages s on s.id = a.file_workflow_stage_id
join public.cases c
  on c.id = f.related_lms_case_id
  and c.env = f.env
where f.related_lms_case_id is not null
on conflict do nothing;

comment on table public.case_participant_backfill_unresolved is
  '舊資料只供人工核對；本 migration 不把 unresolved 列轉成授權 participant。';