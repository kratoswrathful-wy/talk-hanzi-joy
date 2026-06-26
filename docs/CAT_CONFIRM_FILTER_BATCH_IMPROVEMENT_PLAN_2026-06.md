# CAT 確認狀態修復、篩選重構與批次確認優化 — 實作規格（2026-06）

> **狀態**：**已落地並初步驗收**（`9ef343b`，2026-06-26）  
> **關聯 bug-report**：[`bug-report_segment-confirm-status-wf-inconsistency_2026-06.md`](./bug-report_segment-confirm-status-wf-inconsistency_2026-06.md)  
> **關聯 Workflow**：[`CAT_WORKFLOW_CONFIRM_STATUS_UX_2026-06.md`](./CAT_WORKFLOW_CONFIRM_STATUS_UX_2026-06.md)

---

## 1. 範圍概述

三大類別改善：

| 類別 | 摘要 |
|------|------|
| A. Bug 修正 | `status` 與 Workflow 時間戳不一致 |
| B. 篩選重構 | 進階篩選改用顯示狀態、新增檔內重複 |
| C. 批次確認 | UI 瞬間更新、背景 DB／TM、範圍外重複 Modal |

---

## 2. A — 確認狀態一致性

### A1. 更新作業檔（file-update.js）

`patch.status = 'unconfirmed'` 時同步清除：

- `wfTransConfirmedAt` / `wfTransConfirmedBy`
- `wfReviewConfirmedAt` / `wfReviewConfirmedBy`
- `wfReviewRevokedPending = false`

### A2. 載入時靜默修正

開檔後掃描 `currentSegmentsList`：若 `status === 'unconfirmed'` 且 `wfTransConfirmedAt` 有值且非 `wfReviewRevokedPending` 合法中間態，在記憶體清除 Workflow 時間戳（不寫回 DB）。

### A3. Team 即時同步（輕量版 A）

`applyRemoteCommit` 套用遠端譯文時，若與本機不同，呼叫 `applyWorkflowRevokeOnTargetEdit(seg)`，避免本機舊確認狀態覆寫 DB。

### A4. 衛兵策略（決策）

- **必做**：所有取消確認走 `applyWorkflowConfirmToSegment(seg, false)`
- **附帶**：載入時靜默修正（選項三）
- **暫不做**：DB 層 trigger（審稿後再編輯需保留 review 時間戳，規則複雜）

---

## 3. B — 篩選工具重構

### 3.1 UI（index.html `#sfAdvancedPanel`）

**移除**

- `value="confirmed"` / `value="unconfirmed"` 勾選項
- `#sfMqRoleFilterHint` 說明段落

**內部流程區（原「內部 Workflow」）**

| 變更 | 內容 |
|------|------|
| 標題 | `內部 Workflow` → `內部流程` |
| 新增 | `wf_unconfirmed` → 未確認 |
| 改名 | 翻譯已確認 → 翻譯確認；審稿已確認 → 審稿確認 |
| 新增 | `wf_review_revoked` → 審稿後再編輯 |
| 保留 | `wf_post_review_trans` → 審稿後譯者再編輯並確認 |

**檔內重複（新增區塊）**

- `repetition_any` — 全部
- `repetition_first` — 首句
- `repetition_dup` — 後續

**顯示規則**：內部流程列 Solo／Team 皆可見（不再僅 Team）。

### 3.2 邏輯（evaluateSegment）

- 從 `dims` 移除 `confirmKeys`（`confirmed`／`unconfirmed`）
- `wfConfirmKeys` 擴充五態 + `repetitionKeys` 新維度
- `_segmentMatchesWfFilterKey` 新增 `wf_unconfirmed`、`wf_review_revoked`
- `statusNames` 補齊新 key 供篩選 chip 顯示

---

## 4. C — 批次確認速度與 UX

### 4.1 新流程

```
1. 同步更新所有選取句段記憶體（applyWorkflowConfirmToSegment）
2. 立刻 updateProgress + renderEditorSegments（使用者瞬間看到結果）
3. 若有範圍外重複句 → 立刻顯示 Modal
4. 背景 DB 寫入：
   - Solo：Dexie transaction 批次更新
   - Team：Promise.all 並行 updateSegmentStatus
5. 背景 TM：並行最多 5 筆；完成後 toast 成功／失敗列號
```

**不再**於批次確認時自動傳播檔內重複句（與單句 Ctrl+Enter 行為區隔）。

### 4.2 範圍外重複句 Modal（`#outOfRangeRepModal`）

**觸發**：批次確認後，選取範圍內有句段之原文在範圍外尚有重複句。

**內容**（以原文分組）：

- 剛確認的譯文（取同組內最大 `global_id` 的譯文）
- 未同步句段列表（列號 + 目前譯文）
- 已確認的範圍外句段標示「已確認」，排除於套用範圍
- 每組「套用此譯文至本群組」按鈕（支援 Ctrl+Z）

**Modal 非強制阻擋**：不擋背景編輯。

### 4.3 TM 寫入通知

- 成功：「TM 寫入完成：N 筆」
- 有失敗：「TM 寫入：成功 N 筆，失敗 M 筆（第 X、Y 句）」— toast 不自動消失

### 4.4 DB 批次 API

`DBService.batchUpdateSegmentStatuses(items[])`

- Solo：`db.transaction` 內迴圈 `db.segments.update`
- Team：`cat-cloud-rpc` `db.batchUpdateSegmentStatuses` 或並行單筆 RPC

---

## 5. 決策紀錄

| 項目 | 決策 |
|------|------|
| Team 同步方案 | 輕量版 A（遠端譯文變更時本機撤銷確認） |
| 批次確認重複傳播 | 不傳播；範圍外以 Modal 提示 |
| Modal 同步按鈕 | 每原文群組獨立按鈕 |
| Modal 譯文基準 | 同組內最大 global_id 的已確認譯文 |
| Solo DB | Dexie transaction 批次 |
| Team DB | 並行單筆更新 |
| TM 並行上限 | 5 |
| memoQ 符號（orig_confirmed） | 維持現狀：status=confirmed 即顯示 |

---

## 6. 驗收步驟

### 6.1 狀態一致性

1. 開啟曾有不一致資料的 mqxliff → 無綠點／無套色分裂  
2. 更新作業檔改譯文 → status 與 wf 欄位皆清除  

### 6.2 篩選

1. 進階篩選無「已確認／未確認」舊選項  
2. 「內部流程 → 未確認」可篩出真正未確認句段  
3. 「檔內重複 → 首句／後續」正確列出  

### 6.3 批次確認

1. 全選 100+ 句 → Ctrl+Enter → 畫面瞬間全綠（不等 TM）  
2. 範圍內確認但範圍外有重複 → Modal 列出原文與各譯文  
3. 點「套用此譯文至本群組」→ 範圍外句段更新且可 Ctrl+Z  
4. TM 失敗時 toast 列出失敗列號  

---

## 7. 程式觸點

| 檔案 | 變更 |
|------|------|
| [`cat-tool/js/file-update.js`](../cat-tool/js/file-update.js) | A1 |
| [`cat-tool/app.js`](../cat-tool/app.js) | A2、A3、B2、C1、C2 |
| [`cat-tool/index.html`](../cat-tool/index.html) | B1、C2 Modal |
| [`cat-tool/db.js`](../cat-tool/db.js) | C batch API |
| [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) | C Team batch RPC |

---

## 8. 開發與驗收紀錄

| 欄位 | 內容 |
|------|------|
| Commit | `9ef343b` |
| 驗收日期 | 2026-06-26 |
| 驗收結論 | **初步驗收通過**（產品端） |
| 樣本 | `Pulse Localization - For translators.xlsx_zho-TW.mqxliff`（Team；手動修復 165 句矛盾狀態後） |
| 已驗項目 | 批次確認瞬間 UI；範圍外重複 Modal；內部流程／檔內重複篩選；矛盾狀態不再復現 |
| 待驗項目 | 更新作業檔 wf 清除；Team 雙人協作；全庫 backfill — 見 Phase 2 |

---

## 修訂紀錄

| 日期 | 內容 |
|------|------|
| 2026-06-26 | 初稿：彙整對話決策與實作規格 |
| 2026-06-26 | Phase 1 初步驗收紀錄（`9ef343b`）；Phase 2 見 [`CAT_CONFIRM_STATUS_PHASE2_PLAN_2026-06.md`](./CAT_CONFIRM_STATUS_PHASE2_PLAN_2026-06.md) |
