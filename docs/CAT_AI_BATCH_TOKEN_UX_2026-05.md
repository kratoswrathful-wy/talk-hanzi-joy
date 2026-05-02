# CAT AI 批次翻譯 Token UX 改版紀錄（2026-05）

## 背景補充：TM / TB 送入 prompt 的方式

此改版的討論起點是釐清 TM 和 TB 目前如何送入模型。

**TB（術語庫）**：全部術語放進 **system message** 的 `【術語規範（原文 → 譯文）】` 區塊，每筆格式為 `- "原文" → "譯文"（備註）`。來源是記憶體中的 `window.ActiveTbTerms`，由 `_buildAiOptions` 組裝。

**TM（翻譯記憶）**：每個句段送出前，用 `calculateSimilarity` 找 `window.ActiveTmCache` 中分數最高且 ≥ 門檻的那一筆，附在 **user message** 每個句段下方，格式為 `TM 參考（N%）：[譯文]`。只送一筆，且已和 CAT 欄的比對邏輯一致。

**TB 命中比對**：沿用 CAT 欄現有的 `termMatches(haystack, needle, flags)` 函式，支援大小寫不分（預設）與全詞比對，各術語的 `matchFlags` 儲存於 `window.ActiveTbTerms` 每筆之中。

---

## 改版動機

使用者在討論 AI 批次翻譯設定畫面時，發現幾個問題：

1. **參照來源的 token 估算是全範圍加總**，而非每批的量。設了句數和字元上限後，每批實際 token 數比顯示的數字小很多，造成數字失真。
2. **TB（術語庫）全部送出**，不管該批句段有無命中，浪費 token。
3. **黃框長度建議和統計行順序錯置**，建議數字和要對照的實際概算沒有放在一起。
4. 沒有「每批概算是多少 token」的直觀資訊，也沒有辦法一次看到所有批次的用量分布。

---

## 改版內容

### 1. 候選條目池加準則與指示合計

`_renderAiBatchCandidatePool` 結尾新增：遍歷已勾選的 trans / style / pg / si，加總字元換算 token，更新 `#aiBatchCandidatePoolTotal`。

注意：「專案 AI 指示」和候選條目池裡的「本案特殊指示」是同一份資料（都來自 `__aiBatchProjectInstructions`），不重複計算，只算 `pool.si` 中已勾選的項目。

### 2. 參照來源分項改為每批概算

`_computeAiBatchRefTokens(rangeSegs, firstBatch)` 新增 `firstBatch` 參數：

| 分項 | 改前 | 改後 |
|---|---|---|
| TM | `rangeSegs.length * 48` | `firstBatch.length * 48` |
| TB | 全部術語字元 | 用 `termMatches` 過濾命中 firstBatch 的術語 |
| 句段 Key | 全範圍加總 | firstBatch 加總 |
| 句段額外資訊 | 全範圍加總 | firstBatch 加總 |
| 同檔案已確認句段 | 全範圍已確認 | 不變（每批都是同一份，原本就正確） |

`_updateBatchStats` 計算 `firstBatch = _nextBatchByRowsAndChars(rangeSegs, 0, rowLimit, charLimit)`，傳入 `_renderAiBatchRefTokens`。

### 3. TB 實際送出改為命中過濾

`_buildAiOptions` 的 TB 輸出增加 `_matchFlags` 欄位（保留各術語的原始比對旗標），在批次翻譯迴圈中，每批送 AI 之前過濾：

```js
batchOptions.tbTerms = options.tbTerms.filter(t =>
    batch.some(s => termMatches(s.sourceText, t.source, t._matchFlags))
);
```

重試（降載後重組批次）路徑也同樣套用此過濾。

**已知限制**：以下兩條路徑目前仍送出全部 TB，未做 per-batch 過濾：
- `_openAiBatchPromptPreview`（「預覽提示語」）：批次組完但未過濾 TB，預覽中顯示的術語規範可能多於實際送出的量。
- `confirmAskSegs`（「逐批詢問」確認路徑）：傳入 `_buildAiOptions` 時未帶批次句段，TB 為完整術語庫。

### 4. 統計行 + 每批概算 + 黃框重新排列（後續調整：黃框移除）

順序改為：

1. 統計行（`aiBatchStats`）：範圍共 N 句、預估 N 批
2. 每批 token 概算（`aiBatchPerBatchEst`）：System X + User Y + 400 overhead = Z tokens，下方加一行灰色小字「加總 = 提示語 + 翻譯內容 + 系統開銷；請以「預覽提示語」中的約略估算為準。」
3. ~~黃框長度建議（`aiBatchTokenGuidance`）~~ → **已移除**，建議閾值改整合進「概算各批用量」表格底部的 `<tfoot>`

每批 token 概算以 debounce 400ms 非同步更新（`_debouncedUpdateBatchPerBatchEst`），取第一批組真實 prompt 算字元。

System / User 分開顯示的設計理由：超出建議範圍時，兩者的調整方式不同——System 偏大要精簡準則/TB/範例，User 偏大要縮小每批字元/句數上限，合計相同但成因可能完全不一樣。

### 5. 「概算各批用量」按鈕 + 右側面板

**按鈕**：放在「預覽提示語」旁邊（`btnAiBatchBreakdown`）。

**右側面板**（`aiBatchBreakdownPanel`，寬 360px）：
- modal box 改為 flex row，面板展開時 max-width 從 600px 擴到 960px。
- 點按鈕後：按鈕 disabled + 面板顯示轉圈「計算中…」。
- 計算完成後顯示每批一列的表格（`#`, `句段`, `提示語`, `翻譯內容`），數字依閾值上色。
- 表格底部 `<tfoot>` 以細線分隔，列出三列閾值說明，句段欄帶色點（■）標示「建議 / 可接受（可能變慢）/ 不建議」，對應欄位顯示各自的 token 上限。此設計取代原黃框。
- 面板不提供獨立關閉按鈕，隨 modal 關閉一起消失。
- 使用 `_batchBreakdownToken` cancellation token，新一次計算發起時自動棄用前次結果。

**顏色閾值**：

| | 綠（建議） | 黃（可接受） | 紅（不建議） |
|---|---|---|---|
| 提示語 | ≤ 4,000 | 4,001–6,000 | > 6,000 |
| 翻譯內容 | ≤ 2,500 | 2,501–4,000 | > 4,000 |

**精確計算**：每批都實際跑 TM 相似度比對、用 `termMatches` 過濾 TB，然後組真實 prompt 量字元，和實際送出完全一致。系統開銷固定加 400 tokens（同「預覽提示語」的計算方式）。

---

## 相關函式索引（`cat-tool/app.js`）

| 函式 | 異動 |
|---|---|
| `_computeAiBatchRefTokens` | 新增 `firstBatch` 參數 |
| `_renderAiBatchRefTokens` | 新增 `firstBatch` 參數 |
| `_updateBatchStats` | 計算 firstBatch；觸發 debounced 每批概算 |
| `_renderAiBatchCandidatePool` | 結尾加準則合計（含 `_matchFlags` 保留說明） |
| `_buildAiOptions` | tbTerms 增加 `_matchFlags` |
| `runAiBatchTranslate` | 批次迴圈中 per-batch TB filter（含重試路徑） |
| `_debouncedUpdateBatchPerBatchEst` | 新增 |
| `_updateBatchPerBatchEst` | 新增（async，組 prompt 算 token） |
| `_runAiBatchBreakdown` | 新增（各批精確用量） |
