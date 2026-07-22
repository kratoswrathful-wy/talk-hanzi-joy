狀態：已落地待驗收

# 工項 1 schema 報告——sync review 閘門改為 review_rows 非空

- **日期**：2026-07-22
- **分支**：`fix/wf-sync-review-rows-gate`
- **正式庫**：`wshsmerltcakffllgyul`
- **起因**：WIZA 260721B 等單人案（`multi_collab=false`）已有 `review_rows`，但工項 F sync 閘門要求 `multi_collab`，落入 `cases.reviewer` fallback 寫出 `collab_row_id=NULL`，分段 UI 對不上。
- **計畫核准**：2026-07-22 使用者核准實作計畫，本工項隨 PR 執行 `db push`。

---

## 1. 變更摘要

| 項目 | 說明 |
|---|---|
| Migration 檔 | `supabase/migrations/20260722160000_cat_wf_sync_review_rows_gate.sql` |
| 表結構 | **無**新表／新欄 |
| 改寫函式 | `sync_cat_workflow_assignments_for_case(uuid)`（`CREATE OR REPLACE`） |
| upsert | **不改**簽名；仍故意不傳 `p_allow_downgrade` |

## 2. 行為變更

### 2.1 review 閘門（新）

條件：`jsonb_typeof(v_review_rows)='array' AND jsonb_array_length(v_review_rows)>0`（**不再要求** `multi_collab`）。

- 依 `review_rows` 迴圈 upsert；`collab_row_id = row.id`
- 清理：刪 stale id **或** `collab_row_id IS NULL`（含單人案——覆寫工項 F「單人不掃」）
- `workflow_status`：`taskCompleted` 或 review stage `completed` → `completed`，否則 `assigned`

### 2.2 review_rows 空／非 array

- **不**再從 `cases.reviewer` 建指派（`reviewer` 僅顯示鏡像）

### 2.3 translate

- **零變動**

## 3. 風險與回歸

| 風險 | 緩解 |
|---|---|
| 單人案工項 E 手動 `NULL` 列被清 | 預期：`review_rows` 為真相；sync 後以帶 id 列取代 |
| D5 降級 | upsert 不傳 `p_allow_downgrade`；契約 Vitest |
| 空 review_rows 舊案僅有 reviewer 文字 | 不再自動建指派；須由 LMS 寫入 `review_rows`（既有 write-through） |
| 重跑 migration | 全 `CREATE OR REPLACE`，可重跑 |

## 4. 放行後步驟（核准後才做）

1. [x] `supabase db push`（已 link 之目錄）
2. [x] `node scripts/check-migration-history.mjs --live`
3. [ ] 驗收：WIZA 260721B／260720 重跑 sync → `collab_row_id = review_rows[0].id`

## 5. 請驗收方勾選

- [x] 核准本 migration 上正式庫（計畫實作核准）
- [x] 確認單人案亦刪 `collab_row_id IS NULL`（走 review_rows 路徑時）可接受
- [x] 確認無需額外欄位／RLS 變更
