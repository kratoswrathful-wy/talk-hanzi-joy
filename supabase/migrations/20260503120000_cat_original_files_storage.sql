-- CAT 原始檔改存 Supabase Storage（bucket cat-original-files），避免 cat_files 列表 SELECT 帶出巨大 base64。
-- 應用程式會 dual-read：優先 original_file_path，若無則 fallback original_file_base64（舊資料）。
-- 舊資料請於部署後執行：npm run backfill:cat-original-files（需 SUPABASE_SERVICE_ROLE_KEY）。

insert into storage.buckets (id, name, public)
values ('cat-original-files', 'cat-original-files', false)
on conflict (id) do update set public = excluded.public;

alter table public.cat_files
  add column if not exists original_file_path text;

comment on column public.cat_files.original_file_path is
  'Object path inside storage bucket cat-original-files (format {project_id}/{file_id}/original). Legacy rows may use original_file_base64 until backfilled.';

-- Storage：與 cat_files 一致，已登入使用者可讀寫此 bucket（initplan 寫法）
drop policy if exists "cat_original_files_select_authenticated" on storage.objects;
create policy "cat_original_files_select_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'cat-original-files');

drop policy if exists "cat_original_files_insert_authenticated" on storage.objects;
create policy "cat_original_files_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cat-original-files');

drop policy if exists "cat_original_files_update_authenticated" on storage.objects;
create policy "cat_original_files_update_authenticated"
  on storage.objects for update to authenticated
  using (bucket_id = 'cat-original-files')
  with check (bucket_id = 'cat-original-files');

drop policy if exists "cat_original_files_delete_authenticated" on storage.objects;
create policy "cat_original_files_delete_authenticated"
  on storage.objects for delete to authenticated
  using (bucket_id = 'cat-original-files');
