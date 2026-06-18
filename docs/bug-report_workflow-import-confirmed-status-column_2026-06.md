# Bug 調查：匯入 XLIFF 已確認 vs 編輯器狀態欄空心／實心綠圈（2026-06）

> **狀態**：**調查完成**；修復**待排程**（建議波次 **B-7e** 或 B-3 狀態欄回歸，待產品定案）。  
> **關聯**：Phase B 狀態欄 [`CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md`](./CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md) §3；B-7 清單語意 [`CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md`](./CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md) §13。

---

## 1. 症狀

### 1.1 問題 A：匯入後出現實心綠點（mqxliff／sdlxliff）

| 項目 | 內容 |
|------|------|
| 操作 | 新匯入或更新作業檔匯入 **mqxliff**、**sdlxliff** |
| 原檔 | 部分句段在 memoQ／Studio **已確認**（有譯文、100% TM 等） |
| 使用者體驗 | 未在 1UP 按 Ctrl+Enter／點狀態欄確認，狀態欄卻出現**實心綠點**（mqxliff 可能疊白色 ✓） |
| 預期落差 | 與 B-7 清單「待開始」（至首次改譯文前）直覺不一致；使用者認為「匯入不應等於 1UP 內部 Workflow 已完成」 |

### 1.2 問題 B：sdlxliff 缺少「原檔已確認、內部未標」的明確空心圈

| 項目 | 內容 |
|------|------|
| 對照 | **mqxliff** 在檔案仍 **prep 準備中** 時，已確認句段可見 **淡綠空心圓 + 白色 ✓**（memoQ 第三層） |
| sdlxliff | 同條件下僅可能略帶淡綠底的小圓，**無**白 ✓，難以辨識「Studio 已確認、1UP 內部尚未標記」 |
| 預期 | 使用者期望 sdlxliff 也有類似「外檔已確認、我們還沒確認」的專用視覺（與 mqxliff 對稱） |

---

## 2. 根因

### 2.1 匯入寫入 `status: 'confirmed'`

[`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js)：

| 格式 | 觸發條件（摘要） |
|------|------------------|
| **mqxliff** | `<target state>`／`mq:state`；`commitinfo` 角色；`mq:status`（ManuallyConfirmed、Proofread 等） |
| **sdlxliff** | `sdl:seg-defs` 內 `conf="Translated"`／`ApprovedTranslation` 等 |
| **通用 XLIFF** | `target@state` 為 translated、final 等 |

匯入後句段 `status` 為 `confirmed`，**不等於**寫入 `wfTransConfirmedAt`／`wfReviewConfirmedAt`（內部 Workflow 欄位）。

### 2.2 狀態欄：memoQ 已確認 → 內部綠點 fallback（問題 A 主因）

[`cat-tool/app.js`](../cat-tool/app.js) `_isWfTransMarkedEffective`（約 6023 行）：

- 若已有 `wfTransConfirmedAt` → 內部翻譯已標。
- 否則若 `seg.status === 'confirmed'` 且 Workflow 目前步驟為 **translate** 或 **review**（或全步驟 completed）→ **視為內部翻譯已標**。

此為 Phase B **刻意保留**的舊檔 fallback（[`CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md`](./CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md) §282、`fafd1c8`），與進度條、任務完成驗證共用。

**prep 準備中**：`_workflowActiveStage` 回傳 `prep` → fallback **不**點亮實心綠。  
**準備完成後**（`translate` 為 pending 仍被視為「目前步驟」）→ fallback **會**點亮實心綠。

### 2.3 第三層僅 mqxliff（問題 B 主因）

[`buildStatusCellHtml`](../cat-tool/app.js) 僅在 `currentFileFormat === 'mqxliff'` 時渲染 `status-mq-overlay`（白 ✓／✓+／✓✓）。

Phase B §3.2 定案：**僅 mqxliff** 三層疊加；sdlxliff 只有內部綠點／綠外圈。  
`mq-done` CSS 對所有 `status === 'confirmed'` 套用淡綠底，但 sdlxliff **無**疊加圖示。

---

## 3. 與 B-7 的關係（兩套規則並存）

| 位置 | 規則 | B-7 是否涵蓋 |
|------|------|--------------|
| 檔案清單「指派對象」右欄 | 待開始／進行中／完成（`first_edited_at`、PM 階梯） | **是**（B-7a／b） |
| 編輯器狀態欄綠點／綠圈／白勾 | Phase B 三層 + memoQ fallback | **否**（B-7b 未改） |
| 進度條兩段 | 規格寫「不算 memoQ 白勾」，但 effective 規則與狀態欄連動 | 部分一致於 fallback |

**白話**：清單可以寫「待開始」，狀態欄仍可能因原檔已確認而亮綠點——**不是匯入壞掉**，是 B-3 與 B-7 範圍未對齊。

---

## 4. 狀態欄實際組合（prep 中 vs 準備完成後）

引用 Phase B §3.3；補充 **Workflow 階段** 對 fallback 的影響。

| 檔案階段 | T_wf（內部翻譯） | MQ（原檔 confirmed） | mqxliff 畫面 | sdlxliff 畫面 |
|----------|------------------|----------------------|--------------|---------------|
| **prep 準備中** | 未標（無 fallback） | 是 | 淡綠空心 + 白 ✓ | 淡綠底小圓，**無**白勾 |
| **prep 準備中** | 未標 | 否 | 空心灰圓 | 空心灰圓 |
| **準備完成後** | fallback 視為已標 | 是 | 實心綠 + 白 ✓ | 實心綠，無白勾層 |
| 使用者 Ctrl+Enter | `wfTransConfirmedAt` 已寫 | 是／否 | 依 §3.3 組合表 | 同上（無白勾層除非 mqxliff） |

---

## 5. 待定案修復方向（僅規劃，未實作）

產品需先擇一或組合：

1. **狀態欄僅認內部欄位**：`_isWfTransMarkedEffective` 只認 `wfTransConfirmedAt`（及審稿對稱欄位），匯入 `status: 'confirmed'` **不** fallback 實心綠。  
   - 影響：進度條、任務完成驗證、進階篩選第五維須一併調整。
2. **與 B-7 清單對齊**：prep 完成後、受派人 `first_edited_at` 為空前，狀態欄不顯示內部翻譯已標（原檔 confirmed 僅顯示第三層或淡綠空心）。
3. **sdlxliff 第三層**：新增「原檔已確認」圖示（圖示文案待定，不必用 memoQ T／R1／R2）。
4. **匯入策略**（較激進）：XLIFF 匯入不寫 `status: 'confirmed'`，改存 `originalRole`／獨立欄位；影響匯出與篩選，範圍大。

建議波次：**B-7e**（狀態欄與清單語意對齊）或標為 **B-3 回歸**。

---

## 6. 程式觸點（修復時）

| 區塊 | 路徑 |
|------|------|
| 匯入確認狀態 | [`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) |
| 狀態欄 HTML | [`cat-tool/app.js`](../cat-tool/app.js) `buildStatusCellHtml`、`_buildMqSymbolHtml` |
| fallback 邏輯 | `_isWfTransMarkedEffective`、`_isWfReviewMarkedEffective` |
| 進度／任務完成 | `_assignmentRangeConfirmAudit`、`_validateAssignmentForTaskComplete`、進度兩段計算 |
| 篩選 | `evaluateSegment` 第五維（[`CAT_MQXIFF_FILTER_STATUS_IMPLEMENTATION.md`](./CAT_MQXIFF_FILTER_STATUS_IMPLEMENTATION.md)） |
| 樣式 | [`cat-tool/style.css`](../cat-tool/style.css) `.status-icon-stack` |

---

## 7. 驗收草案（修復後）

1. 新匯入 mqxliff／sdlxliff：原檔已確認句段，在 **prep 準備中** 不顯示**實心綠點**（除非使用者已在 1UP 確認）。
2. mqxliff：prep 中已確認句段仍顯示 **淡綠空心 + 白 ✓**（或產品定案之新圖示）。
3. sdlxliff：若產品定案加第三層，prep 中已確認句段有**可辨識**之「原檔已確認、內部未標」圖示。
4. PM 按「準備完成」後、譯者未改句前：清單「待開始」與狀態欄視覺**一致**（依定案方案）。
5. 任務完成、進度條、進階篩選與狀態欄行為一致，無回歸。

---

## 附錄 A：準備完成按鈕右框線（UI，待修）

| 項目 | 內容 |
|------|------|
| 症狀 | `prep` 進行中時工具列顯示「準備完成」，按鈕**右側邊框／圓角缺失** |
| 根因 | 按鈕 class 為 `split-btn-main`（預期右側接 ▾），B-7b 隱藏箭頭後仍套用左半圓角 + 白半透明右框（[`cat-tool/style.css`](../cat-tool/style.css) 503–506 行） |
| 修復方向 | `prep` 單鍵模式改用 `split-btn-solo` 或於 `refreshWfTaskCompleteToolbar` 切換 class |
| 狀態 | **UI 待修**；可與 B-7e 分開或一併處理 |

---

## 8. 修訂紀錄

| 日期 | 內容 |
|------|------|
| 2026-06-17 | 初稿：匯入 confirmed fallback、mqxliff／sdlxliff 空心圈不對稱、與 B-7 落差、B-7e 待排程；附錄 split-btn 框線 |
