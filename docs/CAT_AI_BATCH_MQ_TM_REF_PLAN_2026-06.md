# CAT AI 批次翻譯 — memoQ 預翻譯併入 TM 參考

> 建立：2026-06-27  
> 狀態：**已實作**（待驗收）  
> 相關：[`CAT_AI_BATCH_TOKEN_UX_2026-05.md`](CAT_AI_BATCH_TOKEN_UX_2026-05.md)、[`CAT_AI_BATCH_STABILITY_FIX_PLAN_2026-06.md`](CAT_AI_BATCH_STABILITY_FIX_PLAN_2026-06.md)

---

## 1. 背景

mqxliff 匯入後，句段可帶 **memoQ 預翻譯完整紀錄**（`seg.mqInsertedMatch`，來自 XML `<mq:insertedmatch>`），含成對原文／譯文與檔案上的 `matchrate`。

**現況落差**：

- 右欄 TM 比對已透過 `prependMqInsertedMatch` 將 memoQ 紀錄插在最上方（`MqInserted`）。
- AI 批次翻譯的 **參考門檻**（`tmRefThreshold`）僅掃 `window.ActiveTmCache`，**未**將 memoQ 預翻譯納入候選池。
- 使用者預期：右欄可見的預翻譯參考，送 AI 時也應以單行 `TM 參考（N%）：…` 一併提供。

**資料來源對照**：

| 來源 | 匯入觸點 | 句段欄位 |
|------|----------|----------|
| TM 庫 | 專案掛載 TM | `ActiveTmCache`（執行期） |
| memoQ insertedmatch | [`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) mqxliff 解析 | `seg.mqInsertedMatch` |
| 右欄顯示轉換 | [`buildMqInsertedMatchEntry`](../cat-tool/app.js) | `type: 'MqInserted'` |

---

## 2. 非目標（本次不做）

- **套用門檻**（`tmThreshold`）：自動填譯文／TM 比對詢問確認仍只認 TM 庫。
- **多片段 TM**：維持每句**單行**參考，不展開 Fragment／重疊對齊。
- **僅 `matchValue`／`mq:percent`**：無 `insertedmatch` 完整成對原文／譯文者不進候選池。
- **非 mqxliff** 格式（xlsx、mxliff 等）：行為與改前相同。
- **`cat-tool/js/ai-translate.js`**：`buildPrompt` 格式不變，仍讀 `seg._tmHint`。

---

## 3. 已定案規格

| 項目 | 決定 |
|------|------|
| 範圍 | 僅 **mqxliff**（`mqInsertedMatch` 於匯入時寫入） |
| 觸及路徑 | **僅參考門檻**（勾選 TM 參照 + `tmRefThreshold`） |
| memoQ 來源 | 僅 **`seg.mqInsertedMatch`** 且含 `sourceText` |
| 比賽規則 | TM 庫與 memoQ **同一候選池**；取最高分 |
| 計分 | 一律 **`calculateSimilarity(句段原文, 候選原文)`**；TM 庫扣 `ActiveTmPenalties`；memoQ **不扣懲罰** |
| 顯示％ | **不用** memoQ 檔案 `matchrate`；prompt 內 N% 為算法結果 |
| 輸出 | 單行 **`TM 參考（N%）：譯文`**（贏家為 memoQ 亦同文案） |
| 門檻 | 最高分 &lt; `tmRefThreshold` → 不附參考行 |
| 譯文欄 | **不修改** `seg.targetText`；僅影響送 AI 的 prompt |

### 3.1 單句解析邏輯（偽碼）

```
function resolveTmHint(seg, tmRefThreshold):
  if tmRefThreshold <= 0: return null
  bestScore = 0
  bestTarget = null

  for tm in ActiveTmCache:
    raw = calculateSimilarity(seg.sourceText, tm.sourceText)
    score = max(0, raw - (ActiveTmPenalties[tm._tmId] ?? 0))
    if score > bestScore:
      bestScore = score
      bestTarget = tm.targetText

  mqi = seg.mqInsertedMatch
  if mqi?.sourceText:
    mqScore = calculateSimilarity(seg.sourceText, mqi.sourceText)
    if mqScore > bestScore:
      bestScore = mqScore
      bestTarget = mqi.targetText

  if bestScore >= tmRefThreshold && bestTarget:
    return { score: round(bestScore), targetText: bestTarget }
  return null
```

---

## 4. 程式觸點

| 路徑 | 角色 |
|------|------|
| [`cat-tool/app.js`](../cat-tool/app.js) `_resolveAiBatchTmHintForSegment` | 單句候選池解析（新增） |
| [`cat-tool/app.js`](../cat-tool/app.js) `_attachAiBatchTmHints` | 批次寫入 `seg._tmHint`（擴充） |
| [`cat-tool/app.js`](../cat-tool/app.js) `runAiBatchTranslate` | 送 AI 前附加參考 |
| [`cat-tool/app.js`](../cat-tool/app.js) 預覽提示語、`_updateBatchPerBatchEst`、`_renderBatchBreakdown` | 概算／預覽與主流程一致 |
| [`cat-tool/app.js`](../cat-tool/app.js) `_segmentSourceCharCount` | 切批字元（先 attach 再切批即含 memoQ 勝出譯文） |
| [`cat-tool/js/ai-translate.js`](../cat-tool/js/ai-translate.js) `buildPrompt` | 讀 `seg.tmHint` 輸出單行（無需修改） |

**重構**：原先 4 處內聯 TM 掃描迴圈收斂為呼叫 `_attachAiBatchTmHints`，避免預覽與實際翻譯不一致。

---

## 5. 與穩定修正 A–D 的關係

[`CAT_AI_BATCH_STABILITY_FIX_PLAN_2026-06.md`](CAT_AI_BATCH_STABILITY_FIX_PLAN_2026-06.md) 之 prompt 結構、切批字元、詢問路徑分批、blur 與本項**獨立**；本項不改 `buildPrompt` 欄位順序，僅擴充 `_tmHint` 的來源。

---

## 6. 驗收（白話）

1. **memoQ 勝出**：開 mqxliff；選一句右欄最上方為 `MqInserted`、且我們算法對 memoQ 原文相似度**高於** TM 庫者。勾選 TM 參照、設參考門檻。「預覽提示語」應有 `TM 參考（N%）：` 且譯文與 `mqInsertedMatch.targetText` 一致（N 為我們算法，不必等於檔案 `matchrate`）。
2. **TM 庫勝出**：同檔另選一句 TM 庫分數較高者；預覽應為 TM 庫譯文。
3. **門檻以下**：調高參考門檻使兩邊皆不過 → 該句**無** `TM 參考` 行。
4. **僅 matchValue**：有句只有 `mq:percent`、無 `insertedmatch` → 僅 TM 庫（與改前相同）。
5. **非 mqxliff**：xlsx／mxliff 行為與改前相同。
6. **套用門檻迴歸**：`tmThreshold < 102` 執行批次 → 自動填／詢問仍只來自 TM 庫。
7. **概算一致**：「各批用量概算」與「預覽提示語」對同一批第一句的 TM 參考一致。

---

## 7. 風險與注意

- **效能**：每句多 0～1 次相似度計算（有 `mqInsertedMatch` 時）；相對整庫掃描可忽略。
- **原文已改**：算法分數可能低於 memoQ 檔案標示％ — 屬預期（產品選用我們算法）。
- 實作後須執行 `npm run sync:cat` 同步 `public/cat/`。

---

## 8. 開發紀錄

| 日期 | 說明 |
|------|------|
| 2026-06-27 | 建立規劃：產品定案單行參考、算法計分、僅參考門檻、insertedmatch 完整紀錄 |
| 2026-06-27 | **已實作**：`_resolveAiBatchTmHintForSegment`、`_attachAiBatchTmHints` 擴充、三處內聯收斂 |
