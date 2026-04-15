-- CAT 線上指派系統：儲存 PM 指派給譯者的 CAT 翻譯任務
-- 每筆記錄對應一個案件中的一個原始檔 → 一位譯者的翻譯任務

CREATE TABLE IF NOT EXISTS cat_assignments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                  uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  translator_user_id       uuid NOT NULL REFERENCES profiles(id),
  source_file_name         text NOT NULL,
  source_file_storage_path text NOT NULL,   -- case-files Storage bucket 中的路徑
  source_lang              text NOT NULL DEFAULT '',
  target_lang              text NOT NULL DEFAULT '',
  deadline                 timestamptz,
  notes                    text,
  status                   text NOT NULL DEFAULT 'assigned'
                             CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
  created_by               uuid REFERENCES profiles(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  env                      text NOT NULL DEFAULT 'production'
);

-- 索引：常見查詢模式
CREATE INDEX IF NOT EXISTS cat_assignments_case_id_idx         ON cat_assignments (case_id);
CREATE INDEX IF NOT EXISTS cat_assignments_translator_idx       ON cat_assignments (translator_user_id);
CREATE INDEX IF NOT EXISTS cat_assignments_status_idx          ON cat_assignments (status);

-- RLS
ALTER TABLE cat_assignments ENABLE ROW LEVEL SECURITY;

-- PM / executive：可以讀寫所有指派（利用現有的 is_admin RPC）
DROP POLICY IF EXISTS "pm_can_manage_cat_assignments" ON cat_assignments;
CREATE POLICY "pm_can_manage_cat_assignments" ON cat_assignments
  USING   (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- 譯者：只能看到指派給自己的任務
DROP POLICY IF EXISTS "translator_read_own_cat_assignments" ON cat_assignments;
CREATE POLICY "translator_read_own_cat_assignments" ON cat_assignments
  FOR SELECT
  USING (translator_user_id = auth.uid());

-- 譯者：只能更新自己任務的 status 欄位（不能改其他欄位）
DROP POLICY IF EXISTS "translator_update_own_status" ON cat_assignments;
CREATE POLICY "translator_update_own_status" ON cat_assignments
  FOR UPDATE
  USING   (translator_user_id = auth.uid())
  WITH CHECK (translator_user_id = auth.uid());
