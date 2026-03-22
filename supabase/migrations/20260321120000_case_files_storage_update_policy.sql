-- case-files：補上 UPDATE，與 case-icons 一致。
-- 部分上傳流程（含 upsert 覆寫、或 SDK 內部行為）會需要對既有 object 列做 UPDATE；
-- 僅有 INSERT 時，可能出現「進度跑完仍失敗」或特定檔型／大檔失敗。

DROP POLICY IF EXISTS "Authenticated users can update case files" ON storage.objects;

CREATE POLICY "Authenticated users can update case files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'case-files')
  WITH CHECK (bucket_id = 'case-files');
