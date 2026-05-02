# CAT AI 批次翻譯 Token UX 改版紀錄（2026-05）

## 背景與動機

使用者在討論 AI 批次翻譯設定畫面時，發現幾個問題：

1. **參照來源的 token 估算是全範圍加總**，而非每批的量。設了句數和字元上限後，每批實際 token 數比顯示的數字小很多，造成數字失真。
2. **TB（術語庫）全部送出**，不管該批句段有無命中，浪費 token。
3. **黃框長度建議和統計行順序錯置**，建議數字和要對照的實際概算沒有放在一起。
4. 沒有「每批概算是多少 token」的直觀資訊，也沒有辦法一次看到所有批次的用量分布。

---

## 改版內容

### 1. 候選條目池加準則與指示合計

`_renderAiBatchCandidatePool` 結尾新增：遍歷已勾選的 trans / style / pg / si，加總字元換算 token，更新 `#aiBatchCandidatePoolTotal`。

### 2. 參照來源分項改為每批概算

`_computeAiBatchRefTokens(rangeSegs, firstBatch)` 新增 `firstBatch` 參數：

| 分項 | 改前 | 改後 |
|---|---|---|
| TM | `rangeSegs.length * 48` | `firstBatch.length * 48` |
| TB | 全部術語字元 | 用 `termMatches` 過濾命中 firstBatch 的術語 |
| 句段 Key | 全範圍加總 | firstBatch 加總 |
| 句段額外資訊 | 全範圍加總 | firstBatch 加總 |
| 同檔案已確認句段 | 全範圍已確認 | 不變（每批都是同一份） |

`_updateBatchStats` 計算 `firstBatch = _nextBatchByRowsAndChars(rangeSegs, 0, rowLimit, charLimit)`，傳入 `_renderAiBatchRefTokens`。

### 3. TB 實際送出改為命中過濾

`_buildAiOptions` 的 TB 輸出增加 `_matchFlags` 欄位，在批次翻譯迴圈中，每批送 AI 之前過濾：

```js
batchOptions.tbTerms = options.tbTerms.filter(t =>
    batch.some(s => termMatches(s.sourceText, t.source, t._matchFlags))
);
```

### 4. 統計行 + 每批概算 + 黃框重新排列（後續調整：黃框移除）

順序改為：

1. 統計行（`aiBatchStats`）：範圍共 N 句、預估 N 批
2. 每批 token 概算（`aiBatchPerBatchEst`）：System X + User Y + 400 overhead = Z tokens，下方加一行灰色小字「加總 = 提示語 + 翻譯內容 + 系統開銷；請以「預覽提示語」中的約略估算為準。」
3. ~~黃框長度建議（`aiBatchTokenGuidance`）~~ → **已移除**，建議閾值改整合進「概算各批用量」表格底部的 `<tfoot>`

每批 token 概算以 debounce 400ms 非同步更新（`_debouncedUpdateBatchPerBatchEst`），取第一批組真實 prompt 算字元。

### 5. 「概算各批用量」按鈕 + 右側面板

**按鈕**：放在「預覽提示語」旁邊（`btnAiBatchBreakdown`）。

**右側面板**（`aiBatchBreakdownPanel`，寬 360px）：
- modal box 改為 flex row，面板展開時 max-width 從 600px 擴到 960px。
- 點按鈕後：按鈕 disabled + 面板顯示轉圈「計算中…」。
- 計算完成後顯示每批一列的表格（`#`, `句段`, `提示語`, `翻譯內容`），數字依閾值上色。
- 表格底部 `<tfoot>` 以細線分隔，列出三列閾值說明，句段欄帶色點（■）標示「建議 / 可接受（可能變慢）/ 不建議」，對應欄位顯示各自的 token 上限。此設計取代原黃框。

**顏色閾值**：

| | 綠（建議） | 黃（可接受） | 紅（不建議） |
|---|---|---|---|
| 提示語 | ≤ 4,000 | 4,001–6,000 | > 6,000 |
| 翻譯內容 | ≤ 2,500 | 2,501–4,000 | > 4,000 |

**精確計算**：每批都實際跑 TM 相似度比對、用 `termMatches` 過濾 TB，然後組真實 prompt 量字元，和實際送出完全一致。

---

## 相關函式索引（`cat-tool/app.js`）

| 函式 | 異動 |
|---|---|
| `_computeAiBatchRefTokens` | 新增 `firstBatch` 參數 |
| `_renderAiBatchRefTokens` | 新增 `firstBatch` 參數 |
| `_updateBatchStats` | 計算 firstBatch；觸發 debounced 每批概算 |
| `_renderAiBatchCandidatePool` | 結尾加準則合計 |
| `_buildAiOptions` | tbTerms 增加 `_matchFlags` |
| `runAiBatchTranslate` | 批次迴圈中 per-batch TB filter |
| `_debouncedUpdateBatchPerBatchEst` | 新增 |
| `_updateBatchPerBatchEst` | 新增（async，組 prompt 算 token） |
| `_runAiBatchBreakdown` | 新增（各批精確用量） |
