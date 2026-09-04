狀態：實作中（本機草稿；unverified / not deployable）

# P0-B ACL harden 本機摘要（2026-08）

## 本 commit 範圍

- Migration：`supabase/migrations/20260831151322_p0b_acl_harden.sql`
  - Upsert／assign 僅 PM／executive（`p0b_require_admin_*`）；成員不得自指派
  - Status allowlist＋非 admin 僅正向轉移；admin 可設合法任意值
  - Assignee 必須存在於 `profiles` 且與 `current_env()` 一致（`is_test`）
  - 撤銷 `cat_file_assignments`／`cat_view_assignments` 直寫 policy＋authenticated DML；`cases` 收回 UPDATE
  - 新增 `cat_pm_assign_view`／`cat_pm_unassign_view`
  - `apply_case_update`：剝除 `updated_at`；未知 key → `unknown_patch_key`（不突變）
- 前端：`db.assignView`／`db.unassignView` 改走 RPC；客戶端剝除 `updated_at`
- 負向測試草稿：`supabase/tests/p0b_acl_harden_check.sql`（**未執行**）

## 明確未完成／不得宣稱

- 未在乾淨環境套用本 migration；SQL 草稿未跑
- 未建 Preview／未操作正式庫／未 push／未部署
- 定性：**unverified / not deployable**；須併 P0-A 通過部署門檻後才能進候選

## 相關

- 前序：`bd853bf2`（B1–B3）、`13c39820`（CatToolPage 還原）
- 事件：`docs/P0B_UNCOMMITTED_DIFF_INCIDENT_2026-08.md`
