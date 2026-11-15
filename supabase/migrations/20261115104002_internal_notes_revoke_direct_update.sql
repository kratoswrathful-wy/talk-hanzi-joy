-- TASK-001 1632：封住舊前端直接 UPDATE internal_notes。
-- 新頁走 apply_internal_note_update（SECURITY DEFINER，所有者仍可寫）。
-- 客戶端仍可 SELECT／INSERT／DELETE；不撤整張表。正式庫本輪不套用。
-- 本檔版號對齊隔離庫 MCP apply_migration 實際紀錄；REVOKE 可重跑。

REVOKE UPDATE ON TABLE public.internal_notes FROM anon;
REVOKE UPDATE ON TABLE public.internal_notes FROM authenticated;
REVOKE UPDATE ON TABLE public.internal_notes FROM PUBLIC;
