-- AI 批次翻譯「提示語開頭」：專案級共用（Team 模式雲端同步）
alter table public.cat_ai_project_settings
  add column if not exists batch_introduction text not null default '';

comment on column public.cat_ai_project_settings.batch_introduction is
  'AI 批次翻譯提示語開頭（introduction）；專案內所有有權限使用者共用，最後儲存者為準。';
