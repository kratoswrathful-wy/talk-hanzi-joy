-- Additive: PM/executive 代完成任務 + 單檔派出須有有效 translator participant。
-- 不修改已套用的舊 migration；正式庫未授權前不得 db push。
-- 維護寫入閘門：新 RPC 以 install_maintenance_write_wrapper 包裝；
-- private.*_impl 不對 authenticated 開放。

-- ── 1) 單檔派出閘門（交易結束時檢查，允許同交易內先 UPDATE status 再 INSERT participant）──
create or replace function private.assert_single_dispatch_has_translator()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
  v_multi boolean;
begin
  if tg_op <> 'UPDATE' then
    return null;
  end if;
  -- 以交易最終列為準，避免同交易後續合法變更仍用事件當下 NEW 誤擋。
  select c.status, coalesce(c.multi_collab, false)
    into v_status, v_multi
  from public.cases c
  where c.id = new.id;

  if not found then
    return null;
  end if;

  -- 僅在「最終仍為單檔 dispatched」且「本次事件曾自非 dispatched 進入」時檢查。
  if v_status is distinct from 'dispatched' then
    return null;
  end if;
  if old.status is not distinct from 'dispatched' then
    return null;
  end if;
  if v_multi then
    return null;
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
  return null;
end;
$$;

revoke all on function private.assert_single_dispatch_has_translator()
  from public, anon, authenticated;

drop trigger if exists trg_assert_single_dispatch_has_translator on public.cases;
-- CONSTRAINT + DEFERRABLE：在交易 commit 前檢查，不擋同交易中間態。
create constraint trigger trg_assert_single_dispatch_has_translator
  after update of status on public.cases
  deferrable initially deferred
  for each row
  execute function private.assert_single_dispatch_has_translator();

comment on function private.assert_single_dispatch_has_translator() is
  '保護範圍：cases.status 自非 dispatched 進入 dispatched 的 UPDATE（交易最終仍為單檔 dispatched 時）。'
  '不涵蓋：純 INSERT cases、已在 dispatched 的改派／撤銷、多人協作。'
  '不得詮釋為全面防再發；既有問題案的合法修復路徑仍可用 PM 代完成等。';

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

-- 包裝進維護寫入閘門：缺少前置時必須失敗，不可靜默略過卻標示已保護
do $$
begin
  if to_regprocedure('private.install_maintenance_write_wrapper(text, text)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'maintenance_wrapper_missing: install_maintenance_write_wrapper required before pm_complete_case_translation';
  end if;
  perform private.install_maintenance_write_wrapper(
    'pm_complete_case_translation',
    'uuid, bigint'
  );
end;
$$;
