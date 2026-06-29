# CAT 右欄 TB 比對：子字串壓制、合併、隱藏與復原

**日期**：2026-06  
**狀態**：已驗收（`6261102` 起含 UI 微調；即時同步與編輯器內改刪見 [`CAT_TB_EDITOR_LIVE_SYNC_PLAN_2026-06.md`](CAT_TB_EDITOR_LIVE_SYNC_PLAN_2026-06.md)）  
**程式觸點**：[`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/index.html`](../cat-tool/index.html)、[`cat-tool/style.css`](../cat-tool/style.css)

## 背景

編輯器右欄「TM／片段／術語比對」在掛載多個 TB 或術語彼此為子字串時，會列出過多列，干擾譯者閱讀。本變更在**不改變比對規則**（`termMatches`／`findTermHitRangesInPlainText`）的前提下，於結果整理與 UI 層處理：

1. **子字串壓制**：較短術語若所有命中範圍都被較長術語涵蓋，則不顯示。
2. **同原文同譯文合併**：多筆 TB 記錄合併為一列；同一術語庫內重複列僅顯示一次 TB 名稱。
3. **工作階段隱藏／復原**：譯者可暫時隱藏特定「原文＋譯文」比對；QA 仍檢查；AI 批次可選是否帶入。

## 規格

### 1. 子字串壓制

- 收集每筆 TB hit 時儲存 `ranges`（`findTermHitRangesInPlainText` 回傳值）。
- 依術語原文長度**由大到小**處理候選壓制。
- 對較短術語 `hit`：僅當**每一個** `hit.ranges[i]` 同時滿足下列條件才**壓制**：
  1. 存在已接受術語 `acceptedHit`
  2. `acceptedHit.entry.sourceText !== hit.entry.sourceText`（精確字串不同）
  3. `acceptedHit.srcLen > hit.srcLen`（嚴格較長）
  4. `acceptedHit.entry.sourceText.includes(hit.entry.sourceText)`（**區分大小寫**之子字串）
  5. `acceptedHit` 的某 range 涵蓋該 `r`
- **僅 ranges 重疊不壓制**：例如 `Card` 與 `card` 在不區分大小寫比對下命中同一位置，但互非嚴格子字串 → **兩列**。
- **不壓制**邊界：短術語在句中另有獨立位置時仍顯示（且無符合上列條件之較長術語涵蓋該處）。

### 2. 同原文 + 同譯文合併

- groupBy key：`sourceText + '\x00' + targetText`（**精確字串**）；`Anthony` 與 `anthony` 為兩列；`Base→基地` 與 `Base→根據` 為兩列。
- 同組內依 `firstStart` 排序；第一筆為主列，其餘經 **tbId 去重** 後放入 `_tbDupes`。
- 主列顯示第一筆譯文；合併多筆時分數欄上方顯示 **`N 筆命中`**（`N > 1` 時），下方為 **TB** 標籤。
- footer 依序顯示主列 + `_tbDupes` 的 metadata（每 TB 最多一段）。

### 2.1 同一術語庫名稱只顯示一次

合併組內若同一 `tbId`（fallback `tbName`）有多筆相同原文+譯文重複登錄：

- footer metadata、隱藏 Modal 的「術語庫」欄：**該 TB 名稱只顯示一次**。
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
| N 筆命中 | 比對表 TB 列分數欄 | 同原文同譯文合併且 N>1 時，於 TB 標籤上方顯示筆數 |
| 精確比對 ? | TB footer 精確比對列右側 | hover 顯示無延遲黑色 tooltip（精確比對白話說明） |
| 編輯術語／刪除此術語 | TB footer 各段 metadata 下方（僅寫入目標 TB） | 編輯器內改刪術語；見 live sync 規劃檔 |
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

**狀態**：下列 1～12 項均已驗收（含 2026-06-29 Accelerate 合併列、「N 筆命中」、精確比對 `?` tooltip）。

1. `Base→基地` 與 `Base→根據`：右欄兩列。
2. 兩個 TB 皆 `Base→基地`：一列；分數欄顯示「2 筆命中」；footer 各 TB 名只出現一次。
3. `Mark Anthony` 壓制 `Anthony`／`Ant`；句尾獨立 `ant` 不壓制。
4. 點「將此術語隱藏」：右欄與原文提示消失；QA 仍報「術語未套用」。
5. 「已隱藏的術語 (1)」開 Modal；取消勾選後比對恢復。
6. 無隱藏時按鈕反灰。
7. AI 批次預設含隱藏術語；取消勾選後 prompt 不含。
8. 關檔重開：隱藏清空。
9. **Card／card**：Riftbound 有 `Card→卡牌`、另一 TB 有 `card→卡牌`；點含 `card` 句段 → 右欄 **兩列** TB；分別點選，footer 顯示不同術語庫與備註。
10. **Accelerate 等多 TB 合併**：同原文同譯文兩筆 → 比對表一列、分數欄「2 筆命中」、無黃底附加列；點選 footer 仍兩段 metadata。
11. **單筆 TB**：分數欄只顯示「TB」，不顯示「1 筆命中」。
12. **精確比對說明**：footer 無灰色大段文字；游標移上「?」見黑色 tooltip（無精確比對／有精確比對白話說明）。

## 6. 開發與驗收時序

| commit | 內容 |
|--------|------|
| `5d96a34` | 子字串壓制、同原文同譯文合併、`_tbDupes` inline 初版 |
| `c560167` | 合併 key 改原文+譯文、tbId 去重、工作階段隱藏／復原、AI 批次選項 |
| `1304299` | **除錯**：Card/card 誤壓制 — 壓制須嚴格區分大小寫子字串 |
| `6261102` | UI：「N 筆命中」堆疊於 TB、精確比對圈問號 tooltip — **使用者驗收通過** |

### 6.1 除錯紀錄：Card／card 誤壓制

- **症狀**：Riftbound `Card→卡牌` 與另一 TB `card→卡牌` 應為兩列，卻只剩一列。
- **根因**：舊壓制只看 range 涵蓋，未檢查原文是否為**嚴格**（區分大小寫）子字串。
- **修正**：`isTbSourceStrictSubstring` + `shouldSuppressTbHit` 五條件全滿才壓制（`1304299`）。
- **驗收**：含 `card` 句段右欄兩列 TB，footer 各一段 metadata。

## 維護邊界

- 修改後須執行 `npm run sync:cat` 並提交 `cat-tool/` 與 `public/cat/`。
