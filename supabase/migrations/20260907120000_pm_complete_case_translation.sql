-- Additive: PM/executive 代完成任務 + 單檔派出須有有效 translator participant。
-- 不修改已套用的舊 migration；正式庫未授權前不得 db push。
-- 維護寫入閘門：新 RPC 以 install_maintenance_write_wrapper 包裝；
-- private.*_impl 不對 authenticated 開放。

-- ── 1) 單檔派出閘門：inquiry/其他 → dispatched 須已有 active translator participant ──
create or replace function private.assert_single_dispatch_has_translator()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if new.status is distinct from 'dispatched' then
    return new;
  end if;
  if old.status is not distinct from 'dispatched' then
    return new;
  end if;
  if coalesce(new.multi_collab, false) then
    return new;
  end if;
  if not exists (
    select 1
    from public.case_participants p
    where p.case_id = new.id
      and p.role = 'translator'
      and p.access_revoked_at is null
      and p.work_status = 'active'
  ) then
    raise exception using
      errcode = '22023',
      message = 'dispatch_requires_active_translator_participant';
  end if;
  return new;
end;
$$;

revoke all on function private.assert_single_dispatch_has_translator()
  from public, anon, authenticated;

drop trigger if exists trg_assert_single_dispatch_has_translator on public.cases;
create trigger trg_assert_single_dispatch_has_translator
  before update of status on public.cases
  for each row
  execute function private.assert_single_dispatch_has_translator();

comment on function private.assert_single_dispatch_has_translator() is
  '單檔案件轉 dispatched 前必須已有 active translator participant；禁止僅顯示名派出。';

-- ── 2) PM／executive 代完成（不插入假 translator participant）──
create or replace function public.pm_complete_case_translation(
  p_case_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_case public.cases%rowtype;
  v_revision bigint;
  v_completed_translators int := 0;
begin
  if v_actor is null or not public.is_admin(v_actor) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select * into v_case
  from public.cases c
  where c.id = p_case_id
    and c.env = v_env
  for update;

  if not found
    or v_case.status <> 'dispatched'
    or coalesce(v_case.multi_collab, false)
  then
    raise exception using errcode = 'P0002', message = 'case_unavailable';
  end if;

  if v_case.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'case_revision_conflict';
  end if;

  update public.cases c
  set status = 'task_completed',
      updated_at = now()
  where c.id = p_case_id
    and c.env = v_env
    and c.revision = p_expected_revision
  returning c.revision into v_revision;

  if not found then
    raise exception using errcode = '40001', message = 'case_revision_conflict';
  end if;

  -- 若案上已有有效譯者 participant：同步標成 completed（不冒充其 actor；audit 仍記管理者）
  update public.case_participants p
  set work_status = 'completed',
      updated_by = v_actor,
      updated_at = now()
  where p.case_id = p_case_id
    and p.role = 'translator'
    and p.access_revoked_at is null
    and p.work_status = 'active';

  get diagnostics v_completed_translators = row_count;

  perform private.record_case_mutation(
    p_case_id,
    v_env,
    v_actor,
    'pm_complete_case_translation',
    array['status'],
    p_expected_revision,
    v_revision
  );

  return jsonb_build_object(
    'caseId', p_case_id,
    'revision', v_revision,
    'status', 'task_completed',
    'completedTranslatorParticipants', v_completed_translators
  );
end;
$$;

revoke all on function public.pm_complete_case_translation(uuid, bigint)
  from public, anon;
grant execute on function public.pm_complete_case_translation(uuid, bigint)
  to authenticated, service_role;

comment on function public.pm_complete_case_translation(uuid, bigint) is
  'PM／executive 代完成單檔翻譯任務；audit actor 為管理者；不建立假 translator participant。';

-- 包裝進維護寫入閘門（若環境尚未安裝 wrapper 函式則略過，待 Gate2 ACL migration 後再裝）
do $$
begin
  if to_regprocedure('private.install_maintenance_write_wrapper(text, text)') is not null then
    perform private.install_maintenance_write_wrapper(
      'pm_complete_case_translation',
      'uuid, bigint'
    );
  end if;
end;
$$;
