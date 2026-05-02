-- memoQ XLIFF：檔案預設作業身分（與 CAT 前端 defaultMqRole 一致）
alter table public.cat_files
  add column if not exists default_mq_role text not null default '';

comment on column public.cat_files.default_mq_role is
  'mqxliff 預設身分：T_ALLOW_R1 | T_DENY_R1 | R1 | R2（舊資料 T 由前端視為 T_ALLOW_R1）';

-- 將目前所有 mqxliff 檔統一設為「T / 可編 R1」
update public.cat_files
set
  default_mq_role = 'T_ALLOW_R1',
  last_modified = now()
where lower(name) like '%.mqxliff';
