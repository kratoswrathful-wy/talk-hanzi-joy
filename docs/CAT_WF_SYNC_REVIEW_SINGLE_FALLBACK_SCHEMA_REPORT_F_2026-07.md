狀態：已落地待驗收

# 工項 F schema 報告——LMS sync 單人案審稿 fallback＋清理掃描對齊

- **日期**：2026-07-19
- **分支**：`feat/wf-sync-review-single-fallback`
- **正式庫**：`wshsmerltcakffllgyul`
- **審核**：2026-07-19 放行；多人案刪 `collab_row_id IS NULL` 可接受
- **已 `db push`**：2026-07-19（`20260719150000`）；live 哨兵綠
- **已知邊角（備查，不改碼）**：多人→單人切換時，舊 `review_rows` 帶 `collab_row_id` 列不會被清（單人不掃），可能與 fallback 整檔列並存——與 translate 對稱現況

---

## 1. 變更摘要

| 項目 | 說明 |
|---|---|
| Migration 檔 | `supabase/migrations/20260719150000_cat_wf_sync_review_single_fallback.sql` |
| 表結構 | **無**新表／新欄 |
| 改寫函式 | `sync_cat_workflow_assignments_for_case(uuid)`（`CREATE OR REPLACE`） |
| upsert | **不改**簽名；仍故意不傳 `p_allow_downgrade`（D5） |

## 2. 行為變更

### 2.1 單人案 review fallback（新）

條件：`NOT multi_collab` **或** `review_rows` 非 jsonb array。

- 讀 `cases.reviewer`（單值文字）→ `cat_resolve_profile_id_dual(NULL, name)`
- 對每個 `related_lms_case_id` 連結檔：`cat_upsert_review_stage_assignment`（整檔、`collab_row_id=NULL`）
- `workflow_status`：review stage `completed` → `completed`，否則 `assigned`（比照 translate fallback）
- resolve 失敗記入回傳 `unresolvedReviewers`
- **不執行** review 清理掃描

### 2.2 多人案 review（`multi_collab` 且 `review_rows` 為 array）

- 行為與工項 A 現行一致：依 `review_rows` upsert；`taskCompleted`／stage completed → `completed`
- **清理掃描仍執行**，且與 translate 同構：刪
  - `collab_row_id` 不在本批 valid id；**或**
  - `collab_row_id IS NULL`

### 2.3 手動列（工項 E）存留策略（請驗收方確認）

| 情境 | `collab_row_id IS NULL` 的手動整檔 review 列 |
|---|---|
| **單人案** sync | **保留**（本工項：清理掃描不跑） |
| **多人案** sync | **仍會被刪**（與 translate 多人清理一致；多人真相為 `review_rows`） |

## 3. 風險與回歸

| 風險 | 緩解 |
|---|---|
| 單人案審稿永遠不同步 | fallback 讀 `cases.reviewer` |
| 工項 E 手動列被 sync 清掉 | 單人案不掃；驗收 Metalstorm＋手動補列 |
| D5 降級 | upsert 不傳 `p_allow_downgrade`；契約 Vitest |
| 多人案行為漂移 | review_rows 路徑本體未改語意；僅把清理包進 IF |
| 重跑 migration | 全 `CREATE OR REPLACE`，可重跑 |

## 4. 放行後步驟（核准後才做）

1. [x] `supabase db push`（已 link 之目錄）  
2. [x] `node scripts/check-migration-history.mjs --live`  
3. [ ] 驗收：Metalstorm 260718 sync → 審稿·威儀；單人手動列 sync 後仍在；多人案 review_rows 迴歸

## 5. 請驗收方勾選

- [x] 核准本 migration 上正式庫  
- [x] 確認多人案仍刪 `collab_row_id IS NULL`（與 translate 一致）可接受  
- [x] 確認無需額外欄位／RLS 變更  
