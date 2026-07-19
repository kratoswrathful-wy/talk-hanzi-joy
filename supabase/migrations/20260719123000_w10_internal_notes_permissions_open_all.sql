-- 工項 E（2026-07-19）：內部註記 Permissions 對齊定稿「全員可見可編」
--
-- 前端預設已不再對 non-executive 擋 internal_notes；本 migration 強制把
-- permission_settings 內 member（及缺設定的角色）的 internal_notes 開成可見可編，
-- 避免舊 JSON 把 visible／items 關死。不改 pm／executive 既有開權。
-- idempotent。

do $$
declare
  r record;
  cfg jsonb;
  role_key text;
  inotes jsonb;
  item_keys text[] := array[
    'inotes_list_view',
    'inotes_list_create',
    'inotes_list_delete',
    'inotes_detail_title',
    'inotes_detail_relatedCase',
    'inotes_detail_noteType',
    'inotes_detail_status',
    'inotes_detail_assignee',
    'inotes_detail_content',
    'inotes_detail_resolution',
    'inotes_detail_remarks'
  ];
  k text;
  items jsonb;
begin
  for r in select id, config from public.permission_settings
  loop
    cfg := coalesce(r.config, '{}'::jsonb);

    -- 確保 module_permissions.member.internal_notes 存在且全開
    if cfg -> 'module_permissions' is null then
      cfg := jsonb_set(cfg, '{module_permissions}', '{}'::jsonb, true);
    end if;
    if cfg -> 'module_permissions' -> 'member' is null then
      cfg := jsonb_set(cfg, '{module_permissions,member}', '{}'::jsonb, true);
    end if;

    inotes := jsonb_build_object('visible', true, 'items', '{}'::jsonb);
    items := '{}'::jsonb;
    foreach k in array item_keys
    loop
      items := items || jsonb_build_object(k, jsonb_build_object('view', true, 'edit', true));
    end loop;
    inotes := jsonb_set(inotes, '{items}', items, true);

    cfg := jsonb_set(cfg, '{module_permissions,member,internal_notes}', inotes, true);

    -- 自訂角色（非 pm／executive／member）：若 visible=false 或尚無設定，改為全開
    for role_key in
      select * from jsonb_object_keys(coalesce(cfg -> 'module_permissions', '{}'::jsonb))
    loop
      if role_key in ('pm', 'executive', 'member') then
        continue;
      end if;
      if (cfg -> 'module_permissions' -> role_key -> 'internal_notes' ->> 'visible') = 'false'
         or cfg -> 'module_permissions' -> role_key -> 'internal_notes' is null
      then
        cfg := jsonb_set(
          cfg,
          array['module_permissions', role_key, 'internal_notes'],
          inotes,
          true
        );
      end if;
    end loop;

    update public.permission_settings
    set config = cfg, updated_at = now()
    where id = r.id;
  end loop;
end $$;

comment on table public.permission_settings is
  '權限設定 JSON。工項 E：member.internal_notes 強制全員開（可見可編）。';
