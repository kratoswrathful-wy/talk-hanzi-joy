-- 匯入掃描順序（與 CAT 前端 globalId 對應）；舊列維持 NULL，讀取時再以 row_idx 等次要鍵排序。
alter table public.cat_segments
  add column if not exists global_id integer;

comment on column public.cat_segments.global_id is 'Import scan order within file (1-based); null for legacy rows.';

create index if not exists cat_segments_file_global_id_idx
  on public.cat_segments (file_id, global_id nulls last);
