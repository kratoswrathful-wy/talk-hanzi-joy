# Bug Report：QA「Tag 檢查」與匯出／譯文佔位語意對齊

> 收錄日期：2026-05-02  
> 專案：1UP TMS — CAT 工具（`cat-tool/`）  
> 關聯格式：mqxliff／任何具 `{N}`／`{/N}` 行內佔位之 XLIFF 句段

## 與其他文件的關係

| 文件 | 本質差異 |
|------|----------|
| [`bug-report_mqxliff-partial-target-tags.md`](./bug-report_mqxliff-partial-target-tags.md) | memoQ「部分編輯」：譯文 XML **只含部分 `<ph>`**，`targetTags` 為 `sourceTags` 之**真子集**；pill 退化、F8 同步等屬**資料不完整**問題。 |
| **本文件** | 譯文 **純文字已含** 應有之 `{1}`、`{2}` 佔位（畫面可顯示藍色 pill、**匯出檔亦正確**），但 **`targetTags` 中繼仍為空或未對齊**；舊 QA **只比 `targetTags` 陣列** → **誤報**「缺少 tag」。 |

## 現象

- QA 結果出現 **「Tag 檢查」**：`缺少 tag：{1}, {2}`（範例）。
- 譯文欄可見與原文對應的 **藍色 tag pill**（與 `buildTaggedHtml` 顯示一致）。
- **重新匯出 mqxliff** 後，用 memoQ 或其他工具檢視，**tag 仍存在**，並非檔案錯誤。

## 根因（概念）

三條路徑語意不一致：

1. **顯示**：[`cat-tool/app.js`](../cat-tool/app.js) 的 `effectiveTags(seg)` 在 **`targetTags` 無筆數**時，會 **fallback 到 `sourceTags`** 供 `buildTaggedHtml` 使用，故畫面仍可畫出 pill。
2. **匯出**：[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js) 單段邏輯中，`tags` 同樣在 **`targetTags` 空時改用 `sourceTags`**，再以 `targetText` 內之佔位符 `replacePlaceholders` 還原 XML → **匯出可正確**。
3. **舊 QA**：`_qaPushSegmentRuleFindings` 僅比對 **`sourceTags` 與 `targetTags` 陣列**的 id／num／index，**未**將譯文純文字中的 `{N}`／`{/N}` 視為已帶入 → **誤判缺 tag**。

## 修正摘要（已落地）

**檔案**：[`cat-tool/app.js`](../cat-tool/app.js)（約 `runQaChecks` 共用路徑之 `_qaPushSegmentRuleFindings` 一帶，約 §18196 起；行號隨版本漂移，以實檔為準）。

| 項目 | 說明 |
|------|------|
| `_qaTagIdForCompare(t)` | 自 tag 物件取可比對之**編號字串**：優先 `id`／`num`／`index`，缺則自 **`ph`**（如 `{1}`、`{/1}`）解析，與 mqxliff 常見結構一致。 |
| `_qaPlainTargetTagNumSet(targetText)` | 自譯文純文字以正則 `\{\/?(\d+)\}` 收集已出現之編號，與 F8／匯出佔位符口徑一致。 |
| **缺少 tag** | 以原文所需編號集合 **減去**（`targetTags` 解析編號 **∪** 譯文掃描編號）。 |
| **多餘 tag** | 同時檢 **`targetTags` 中多出之編號** 與 **譯文純文字中多出、原文未聲明之編號**；若同句段同時缺與多，訊息以 **「；」** 併列兩句。 |

**靜態輸出**：變更 `cat-tool/` 後須 `npm run sync:cat`（或 `node scripts/sync-cat.mjs`），使 [`public/cat/`](../public/cat/) 與來源一致；見根目錄 [`AGENTS.md`](../AGENTS.md)。

## 驗收（可重跑）

1. 部署或本機載入含本修正之 `app.js` 後，對該句段 **強制重新整理**（必要時清快取／Service Worker），避免舊版前端。
2. 開啟原先誤報之檔案，**不重匯入亦可**（邏輯為記憶體內重算 QA）；執行 **QA / Tag 檢查**。
3. 預期：譯文已含對應 `{N}` 佔位時，**不再**出現「缺少 tag：{1}, {2}」類誤報。
4. （選做）在譯文手動加入原文未有的 `{99}` 等 → 應出現 **「多餘 tag」** 類提示（與陣列＋純文字合併邏輯一致）。

**使用者驗收**：2026-05-02 已確認通過（見實作對話紀錄）。

## 相關文件

- [`bug-report_mqxliff-tag-issues.md`](./bug-report_mqxliff-tag-issues.md) — 總表與 Bug #1–#6 對照  
- [`bug-report_mqxliff-partial-target-tags.md`](./bug-report_mqxliff-partial-target-tags.md) — Bug #5 部分 `targetTags` 專文  
- [`CODEMAP.md`](./CODEMAP.md) — 快速路徑至 `runQaChecks`／本專文
