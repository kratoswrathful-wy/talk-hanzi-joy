-- cat_files: 新增 Google Sheet 作業檔所需欄位
-- google_sheet_url: 記錄原始 Google Sheet 連結
-- file_format:      記錄格式識別碼（'excel' | 'xliff' | 'mqxliff' | 'sdlxliff' | 'po' | 'googlesheet'）

alter table public.cat_files
  add column if not exists google_sheet_url text not null default '',
  add column if not exists file_format      text not null default '';
