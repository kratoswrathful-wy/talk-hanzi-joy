-- 稿費請款內部備註附件：獨立私有桶。不得把全站 case-files 改成私有。
-- 僅 is_admin（PM／執行長）可讀寫；一般留言仍走 case-files。

insert into storage.buckets (id, name, public)
values ('invoice-internal-files', 'invoice-internal-files', false)
on conflict (id) do update set public = false;

drop policy if exists invoice_internal_files_select on storage.objects;
create policy invoice_internal_files_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'invoice-internal-files'
    and is_admin((select auth.uid()))
  );

drop policy if exists invoice_internal_files_insert on storage.objects;
create policy invoice_internal_files_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'invoice-internal-files'
    and is_admin((select auth.uid()))
  );

drop policy if exists invoice_internal_files_update on storage.objects;
create policy invoice_internal_files_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'invoice-internal-files'
    and is_admin((select auth.uid()))
  )
  with check (
    bucket_id = 'invoice-internal-files'
    and is_admin((select auth.uid()))
  );

drop policy if exists invoice_internal_files_delete on storage.objects;
create policy invoice_internal_files_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'invoice-internal-files'
    and is_admin((select auth.uid()))
  );
