-- 句段原文變更追蹤資訊
-- 用於「更新作業檔」功能：當原文在更新中有改變，記錄舊原文與變更日期
-- 只存最新一次變動，格式：{ "changedAt": "2026-05-04", "previousSource": "舊版原文" }
ALTER TABLE public.cat_segments
  ADD COLUMN IF NOT EXISTS source_change_info jsonb;
