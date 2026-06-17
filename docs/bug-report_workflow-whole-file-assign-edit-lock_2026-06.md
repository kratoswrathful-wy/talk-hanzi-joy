# Bug 調查：整檔指派卻句段鎖定「不在您受派的列範圍內」（2026-06）

> **狀態**：**根因已釐清**；修復規劃於 **B-7d**（見 [`CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md`](./CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md) §11）。  
> **關聯**：列號語意見 [`CAT_SORT_AND_DISPLAY_ORDER_SPEC_2026-06.md`](./CAT_SORT_AND_DISPLAY_ORDER_SPEC_2026-06.md) §6。

---

## 1. 症狀

| 項目 | 內容 |
|------|------|
| 樣本檔 | `Batch 11 Segment 459-1069_zho-TW.mqxliff` |
| 操作 | PM 在 CAT 將黃惠茹、朱耘廷、威儀等設為**整檔**指派 |
| 譯者體驗 | 朱耘廷可開檔，但編輯譯文時 tooltip：**「禁止編輯：不在您受派的列範圍內」**（例如左欄 ID 221 列） |
| 清單顯示 | 可能顯示「某某（整檔）」 |

---

## 2. 根因（程式缺口，非譯者操作錯誤）

### 2.1 主因：`cat_file_assignments` 與 `cat_stage_assignments` 脫鉤

| 層 | 行為 |
|----|------|
| **指派檔案**（[`CatToolPage.tsx`](../src/pages/CatToolPage.tsx) `CAT_ASSIGN_FILE`） | 僅 upsert **`cat_file_assignments`** |
| **清單顯示**（[`wf-display-status.js`](../cat-tool/js/wf-display-status.js)） | 無 stage 指派時 fallback **`fileAssigneeNames`** → 顯示「整檔」 |
| **開檔權限**（`resolveFileUnassignedReadOnly`） | 有 `cat_file_assignments` → **可開檔** |
| **編輯鎖定**（`computeSegmentEditForbidden`） | 僅查 **`cat_stage_assignments`**；`relevant.length === 0` 或 `mine` 無列 → **全句鎖定** |

**白話**：有「進門鑰匙」（檔案指派），但沒有「座位表」（Workflow 段落指派），畫面卻寫整檔。

### 2.2 次因：列號座標不一致（協作／分割檔）

若 DB 存 `line_start`／`line_end` 為 **459–1069**（檔名或舊全案語意），而鎖定比對用**檔內**列序（例如 221），則 `221 ∉ [459, 1069]` → 誤鎖。

**定案**：列號一律 **檔內**或**句段集內** 1..N，不用全案累加（§6 排序 spec）。

### 2.3 次因：句段集模式快取錯誤（若經句段集開啟）

`_loadViewWorkflowContext` 呼叫 `_buildFullListLineNoCacheForFile`（**母檔**列序），非句段集內 1..N。指派含 `view_id` 時應比對句段集內序。

---

## 3. 定案修復（B-7d）

1. **`CAT_ASSIGN_FILE`**：同步建立整檔 **`cat_stage_assignments`**（translate 步、`line_start`／`line_end` null）。
2. **列號**：鎖定與 LMS `lineRange` 對齊 §6（檔內 vs 句段集內）；必要時 backfill 錯誤 `459–1069` 類資料。
3. **句段集**：`_buildFullListLineNoCacheForView`（或等價）依句段集排序後 1..N 建快取。

觸點：[`computeSegmentEditForbidden`](../cat-tool/app.js)、[`cat-tool/db.js`](../cat-tool/db.js) `upsertTranslateStageAssignment`、[`sync_cat_workflow_assignments_for_case`](../supabase/migrations/20260615120000_fix_collab_row_id_text.sql)。

---

## 4. 驗收（修復後）

1. PM 僅用 CAT「指派檔案」勾選三人整檔 → 三人皆可編輯該檔所有句段（團隊模式、prep 已完成、翻譯 session）。
2. 協作句段集：`lineRange` 1–50 → 僅句段集左欄 1–50 可編（該受派人）。
3. 分割檔檔名含 Segment 區間，但鎖定以**檔內**列序為準，不再誤用 459–1069。

---

## 5. 修訂紀錄

| 日期 | 內容 |
|------|------|
| 2026-06-17 | 初稿：Batch 11 樣本、雙表脫鉤根因、列號／句段集次因、B-7d 修復方向 |
