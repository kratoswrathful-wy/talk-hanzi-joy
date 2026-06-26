# Bug Report：句段確認狀態 `status` 與 Workflow 時間戳不一致（2026-06）

> **建立**：2026-06-26  
> **狀態**：**已落地**（2026-06-26）  
> **樣本**：`Pulse Localization - For translators.xlsx_zho-TW.mqxliff`（Team 模式）  
> **關聯**：[`CAT_CONFIRM_FILTER_BATCH_IMPROVEMENT_PLAN_2026-06.md`](./CAT_CONFIRM_FILTER_BATCH_IMPROVEMENT_PLAN_2026-06.md)、[`CAT_WORKFLOW_CONFIRM_STATUS_UX_2026-06.md`](./CAT_WORKFLOW_CONFIRM_STATUS_UX_2026-06.md)

---

## Part 1 — 白話摘要

### 1.1 發生什麼事

部分句段同時出現下列矛盾現象：

1. 右欄狀態圖示有**系統內翻譯確認**（實心綠點），但沒有 memoQ 符號（T／R1／R2）
2. 句列沒有綠色背景套色
3. 篩選「未確認」篩出大量句段，但左下進度卻顯示幾乎全部已翻譯確認
4. 被篩出的句段都有翻譯確認標示，卻沒有任何一個顯示為正常未確認狀態

### 1.2 根本原因（白話）

系統用**兩套欄位**記錄「有沒有確認」：

| 欄位 | 用途 |
|------|------|
| `status` | 檔案／memoQ 層級確認（影響套色、memoQ 符號、舊版篩選） |
| `wfTransConfirmedAt` 等 | 內部 Workflow 確認時間戳（影響進度條、狀態圖示綠點） |

正常情況兩者應同步。當 `status = unconfirmed` 但 `wfTransConfirmedAt` 仍有值時，不同功能讀不同欄位就會出現上述四個症狀。

### 1.3 兩條根因路徑

**路徑 A — 更新作業檔**（[`cat-tool/js/file-update.js`](../cat-tool/js/file-update.js)）

原文或譯文變更時將 `status` 設為 `unconfirmed`，但未清除 `wfTransConfirmedAt` 等 Workflow 欄位。

**路徑 B — Team 模式多人協作**

即時同步只廣播譯文文字，不廣播確認狀態撤銷。使用者本機仍保有舊「已確認」記憶，後續操作可能把 Workflow 時間戳寫回 DB，而 `status` 已被他人設為 `unconfirmed`。

### 1.4 緊急手動修復（產品端已執行）

1. 篩選「未確認」
2. 全選 → 右鍵「設定為未確認」
3. 全選 → Ctrl+Enter 批次確認

---

## Part 2 — 技術細節

### 2.1 矛盾狀態定義

```
status === 'unconfirmed'
AND wfTransConfirmedAt IS NOT NULL
AND wfReviewRevokedPending === false
AND wfReviewConfirmedAt IS NULL（典型案例）
```

`resolveSegmentConfirmDisplayState()` 回傳 `trans_confirmed`（讀時間戳），但 `buildStatusCellHtml`／`syncRowConfirmedStateClass`／舊版 `evaluateSegment` 的 `confirmed` 篩選讀 `status`。

### 2.2 程式觸點

| 區塊 | 路徑 |
|------|------|
| 顯示狀態解析 | [`cat-tool/app.js`](../cat-tool/app.js) `resolveSegmentConfirmDisplayState` |
| 正確取消確認 | `applyWorkflowConfirmToSegment(seg, false)` |
| 更新作業檔漏洞 | [`cat-tool/js/file-update.js`](../cat-tool/js/file-update.js) `mergeSegments` patch |
| Team 遠端同步 | `applyRemoteCommit` |
| 載入時靜默修正 | 開檔後 `reconcileSegmentWfConsistencyOnLoad` |

### 2.3 資料庫稽核查詢

```sql
-- 矛盾狀態句段
SELECT global_id, id, status, wf_trans_confirmed_at, wf_review_confirmed_at
FROM cat_segments
WHERE file_id = '<file_uuid>'
  AND status = 'unconfirmed'
  AND wf_trans_confirmed_at IS NOT NULL
  AND COALESCE(wf_review_revoked_pending, false) = false;

-- 進度未計入的 orig_confirmed（status 已確認但無 wf 時間戳）
SELECT global_id, LEFT(source_text, 60) AS src, status,
       wf_trans_confirmed_at, wf_review_confirmed_at
FROM cat_segments
WHERE file_id = '<file_uuid>'
  AND status = 'confirmed'
  AND wf_trans_confirmed_at IS NULL
  AND wf_review_confirmed_at IS NULL
  AND NOT is_locked_system;
```

### 2.4 修正方案

1. **file-update.js**：`patch.status = 'unconfirmed'` 時一併清除 Workflow 欄位  
2. **開檔載入**：記憶體中靜默修正不一致狀態  
3. **applyRemoteCommit**：遠端譯文變更時本機執行 `applyWorkflowRevokeOnTargetEdit`  
4. **篩選**：改走 `resolveSegmentConfirmDisplayState`（見改善計畫文件）

### 2.5 驗收

1. 矛盾狀態句段開檔後顯示一致（無綠點＋無套色分裂，或載入後自動修正）  
2. 更新作業檔後 `status` 與 Workflow 欄位同步清除  
3. Team 兩人同時編輯：一人改譯文後，另一人畫面確認狀態跟著撤銷  
4. 稽核查詢對樣本檔案回傳 0 筆矛盾列（手動修復後）

---

## 修訂紀錄

| 日期 | 內容 |
|------|------|
| 2026-06-26 | 初稿：調查 Pulse mqxliff 四症狀、兩條根因路徑、稽核查詢 |
