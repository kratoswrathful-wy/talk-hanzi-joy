# CAT 右欄 TB 比對：子字串壓制、合併、隱藏與復原

**日期**：2026-06  
**狀態**：已實作，待驗收  
**程式觸點**：[`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/index.html`](../cat-tool/index.html)、[`cat-tool/style.css`](../cat-tool/style.css)

## 背景

編輯器右欄「TM／片段／術語比對」在掛載多個 TB 或術語彼此為子字串時，會列出過多列，干擾譯者閱讀。本變更在**不改變比對規則**（`termMatches`／`findTermHitRangesInPlainText`）的前提下，於結果整理與 UI 層處理：

1. **子字串壓制**：較短術語若所有命中範圍都被較長術語涵蓋，則不顯示。
2. **同原文同譯文合併**：多筆 TB 記錄合併為一列；同一術語庫內重複列僅顯示一次 TB 名稱。
3. **工作階段隱藏／復原**：譯者可暫時隱藏特定「原文＋譯文」比對；QA 仍檢查；AI 批次可選是否帶入。

## 規格

### 1. 子字串壓制

- 收集每筆 TB hit 時儲存 `ranges`（`findTermHitRangesInPlainText` 回傳值）。
- 依術語原文長度**由大到小**處理；較長者先佔地。
- 對較短術語：若**每一個**命中範圍都被更長術語的範圍完整涵蓋 → **壓制**。
- **不壓制**邊界：短術語在句中另有獨立位置時仍顯示。

### 2. 同原文 + 同譯文合併

- groupBy key：`sourceText + '\x00' + targetText`（**精確字串**）；`Anthony` 與 `anthony` 為兩列；`Base→基地` 與 `Base→根據` 為兩列。
- 同組內依 `firstStart` 排序；第一筆為主列，其餘經 **tbId 去重** 後放入 `_tbDupes`。
- 主列顯示第一筆譯文；`_tbDupes` 以 `.cat-tb-dupes-inline` 平鋪於列下方。
- footer 依序顯示主列 + `_tbDupes` 的 metadata（每 TB 最多一段）。

### 2.1 同一術語庫名稱只顯示一次

合併組內若同一 `tbId`（fallback `tbName`）有多筆相同原文+譯文重複登錄：

- footer metadata、inline chip、隱藏 Modal 的「術語庫」欄：**該 TB 名稱只顯示一次**。
- 備註／建立時間不同時：保留排序後第一筆的 metadata。

### 3. 工作階段隱藏

- 狀態：`window._sessionHiddenTbPairs`（`Map`，key 為 `原文\x00譯文`）。
- **不寫 DB**；開啟／切換檔案、離開編輯器、`resetEditorTransientUi()` 時清空。
- 過濾點：收集 `tbHits` 前跳過已隱藏配對 → 影響右欄比對與原文格 TB 上標。
- **QA 不過濾**（`_qaPushSegmentRuleFindings` 仍遍歷完整 `ActiveTbTerms`）。
- 唯讀／審稿模式亦可隱藏。

### 4. UI

| 元素 | 位置 | 行為 |
|------|------|------|
| 將此術語隱藏 | TB metadata 最下方 | `data-tip` 說明效力；隱藏目前列的原文+譯文 |
| 已隱藏的術語 (N) | metadata 上方列左側（與收合資訊同一列） | 無隱藏時 disabled；開啟 Modal |
| 已隱藏的術語 Modal | 全螢幕 overlay | 勾選＝仍隱藏；**取消勾選即復原**；欄：原文／譯文／術語庫 |

編輯器工具列「字數」按鈕**保留**，不取代。

### 5. AI 批次

- 參照來源區新增「**包含已隱藏術語**」（`#aiBatchRefTbIncludeHidden`），**預設勾選**。
- **不持久化**至專案設定；每次開啟 AI 批次 Modal 重設為勾選。
- 取消勾選時，組 `tbTerms` 會排除已隱藏配對。

## 資料流

```
ActiveTbTerms
  → 隱藏過濾（僅比對 UI）
  → tbHits + ranges → 子字串壓制
  → groupBy(原文+譯文) → dedupeByTbId
  → currentTmMatches → 右欄 + 原文上標

ActiveTbTerms → QA（不過濾）
ActiveTbTerms → AI 批次（可選過濾）
```

## 驗收步驟（白話）

1. `Base→基地` 與 `Base→根據`：右欄兩列。
2. 兩個 TB 皆 `Base→基地`：一列；footer／inline 各 TB 名只出現一次。
3. `Mark Anthony` 壓制 `Anthony`／`Ant`；句尾獨立 `ant` 不壓制。
4. 點「將此術語隱藏」：右欄與原文提示消失；QA 仍報「術語未套用」。
5. 「已隱藏的術語 (1)」開 Modal；取消勾選後比對恢復。
6. 無隱藏時按鈕反灰。
7. AI 批次預設含隱藏術語；取消勾選後 prompt 不含。
8. 關檔重開：隱藏清空。

## 維護邊界

- 修改後須執行 `npm run sync:cat` 並提交 `cat-tool/` 與 `public/cat/`。
