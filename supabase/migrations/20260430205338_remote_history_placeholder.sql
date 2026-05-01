-- 對齊遠端 schema_migrations：此版本已在 Supabase 正式庫套用，本地先前無檔案導致 db push 拒絕。
-- 若遠端曾含 DDL，應已存在於資料庫；此檔不重複執行語意變更。
SELECT 1;
