狀態：已落地待驗收

# 工項 4 schema 報告——completed→in_progress 防降級收緊

- **日期**：2026-07-22
- **分支**：`fix/wf-unlock-no-translate-downgrade`
- **正式庫**：`wshsmerltcakffllgyul`
- **起因**：審稿離開 completed（解鎖）或 LMS 重指派後，反向路徑允許任意降級，導致翻譯指派誤寫成 `in_progress`／stage 重開。
- **計畫核准**：2026-07-22 使用者核准實作計畫，本工項隨 PR 執行 `db push`。

---

## 1. 變更摘要

| 項目 | 說明 |
|---|---|
| Migration 檔 | `supabase/migrations/20260722170000_cat_wf_block_completed_to_in_progress.sql` |
| 表結構 | **無**新表／新欄 |
| 改寫函式 | `cat_resolve_effective_upsert_workflow_status`（`CREATE OR REPLACE`） |
| upsert 簽名 | **不變**；仍含 `p_allow_downgrade DEFAULT false` |

## 2. 行為變更

### 2.1 收緊（新）

`existing=completed` 且 `requested=in_progress` 且 `allow_downgrade=false` → 維持 `completed`（**即使** stage 已非 completed）。

### 2.2 保留

| 語意 | 狀態 |
|---|---|
| stage 仍 completed → 禁止洗回非 completed | 保留 |
| stage 已非 completed → completed→**assigned**（反向路徑／檔案重開） | 保留 |
| `p_allow_downgrade=true`（PM 重開）→ 可降含 in_progress | 保留 |
| LMS sync 不傳 allow_downgrade | 保留 |

### 2.3 前端（同 PR，非 schema）

- 解鎖＝僅 UI（`_isTranslateLockedByAnyReviewComplete`）；禁止因解鎖自動改翻譯狀態
- `_updateAssignmentWorkflowStatusLocal` 走同一套 resolve；PM 重開／調整 modal 傳 `allowDowngrade: true`

## 3. 風險與回歸

- PM「改回翻譯執行中」必須帶 `allowDowngrade`（已接）
- 反向路徑 completed→assigned 行為不變

## 4. 放行後步驟

1. `supabase db push`
2. `node scripts/check-migration-history.mjs --live`
3. Vitest：`wf-assignment-sync-policy` 工項 4 案例
4. 驗收：LMS 重指派審稿後翻譯指派維持 `completed`
