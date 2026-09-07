狀態：實作中

# CAT／LMS P0-B 安全收斂開發紀錄（2026-08）

## 摘要

本分支 `feat/p0b-security-20260830` 實作 **P0-B 本機安全硬化**（在 P0-A recovery 之上）：

- **B-1** `apply_case_update`：僅 PM／執行長、需 `p_expected_revision`、剝除憑證／工具鍵；`cases` 基表 UPDATE 僅 admin 同 env。
- **B-2** 撤回內層 workflow／指派 helper 的 `authenticated` EXECUTE；改經外層 ACL RPC。
- **B-3** `cat_stage_assignments`／`cat_file_workflow_stages` 僅 SELECT；file／view assignment 的 assignee 直寫 UPDATE 移除。
- 前端：`applyCaseUpdate` 必帶 revision、iframe `origin + source` 守衛、指派狀態／PM 指派走外層 RPC。

## 明確狀態

| 項目 | 狀態 |
|------|------|
| 本機程式／migration 草稿 | 已寫入 |
| `supabase db push`／MCP DB | **未執行** |
| SQL ACL 測試 | **draft；NOT run；unverified** |
| Preview／正式部署 | **not deployable** |
| `types.ts` | 手補 RPC 簽名（provisional；正式須 migration 乾淨重放後重生） |

## Migration 檔

1. `supabase/migrations/20260831043141_p0b_apply_case_update_admin_only.sql`
2. `supabase/migrations/20260831043143_p0b_workflow_rpc_acl.sql`
3. `supabase/migrations/20260831043145_p0b_assignment_rls.sql`

## 外層 RPC（authenticated 可 EXECUTE）

- `lms_sync_cat_workflow_for_case`
- `lms_sync_cat_file_assignments_for_case`
- `cat_update_file_assignment_status`／`cat_update_view_assignment_status`
- `cat_pm_assign_file`／`cat_pm_unassign_file`
- `cat_pm_upsert_translate_stage_assignment`／`cat_pm_upsert_review_stage_assignment`
- `cat_update_stage_assignment_workflow_status`／`cat_pm_update_file_workflow_stage_status`

## 前端觸點

- `src/lib/apply-case-update.ts`（+ unit test）
- `src/lib/cat-iframe-message-guard.ts`（+ unit test）
- `src/pages/CatToolPage.tsx`
- `src/lib/cat-wf-lms-sync.ts`／`cat-workflow-dispatch.ts`／`cat-cloud-rpc.ts`
- `src/stores/case-store.ts`

## 未驗證／後續

1. 隔離庫套用三支 migration 並跑 `supabase/tests/p0_*_check.sql`。
2. advisors／definer 威脅模型覆核。
3. 正式 `supabase gen types` 重生。
4. Preview Playwright（可加 skip-by-default spec）。
5. 與 P0-A 合併後才可能進入部署候選；**單獨 P0-B 不可部署**。

## 與 P0-A 關係

保留 PR #80 Auth recovery、`loadVersion`／stale guards、Bridge get／getFresh；**不**重開 authenticated 全表 CRUD。
