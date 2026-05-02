# Bug Report：mqxliff／XLIFF 匯入匯出與顯示（精簡維運版）

> 更新：2026（階 1–3：CSS 緩衝、零 tag 匯出、譯文 mq: 補 target_tags、**階 3 搜尋不覆寫原／譯文 tag pill**、`normalizeXmlForSig` 加強、副檔名 `.mxliff` 說明；**Bug #5** 部分 targetTags 見專文）

本檔在復原/重建流程中作為**對照清單**；與大改版、回溯脈絡見 [`CAT-rollback-recovery-notes-2026-04.md`](CAT-rollback-recovery-notes-2026-04.md)。

## 實作對照

| 項目 | 狀態 | 說明（原理級） | 相關檔案 |
|------|------|----------------|----------|
| **Bug #1 緩衝** | 已實作 | 原文欄在 tag pill 就緒前，用最小高度減少版面一閃 | [`cat-tool/style.css`](../cat-tool/style.css) `.col-source .rt-editor` |
| **Bug #2 匯出** | 已實作 | **無** `targetTags` 或**兩邊 tag 陣列皆空**則以 `textContent` 寫入；若僅有 `sourceTags` 但譯文**沒有** `{N}` 佔位、純字串內有裸 `</>`，也強制 `textContent`（避免誤用 XML 解析） | [`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js) `setExportTargetPlainOrFragment`、`usePlainTextForExportTarget` |
| **Bug #3A 匯入** | 已實作（heuristic） | 譯文內可見行內 `<mq:…>` 純字元、但 `targetTags` 空時，從含 `mq:` 的 `sourceTags` 補欄 | [`cat-tool/js/xliff-import.js`](../cat-tool/js/xliff-import.js) `augmentTargetTagsForPlainInlineMemoQ` |
| **Bug #4 搜尋** | 已實作 | 篩選/高亮前以 `buildTaggedHtml` 重畫原／譯 `.rt-editor` 並 `updateTagColors`；`applyRtEditorSearchHighlights`（`source` / `target` 範圍）在內部依與內文一致的索引只包文字／換行、不跨 tag 佔位 | [`cat-tool/app.js`](../cat-tool/app.js) `runSearchAndFilter`、`getRtEditorTextSegmentsForHighlightMap`、`collectFieldSearchRangesOwned`、`applyRtEditorSearchHighlights` |
| **Tag 簽名正規化** | 已實作 | `normalizeXmlForSig` 去 BOM、統一斷行與可見節點內多餘空白，利於佔位成對比對 | [`cat-tool/app.js`](../cat-tool/app.js) `normalizeXmlForSig` |
| **副檔名 `.mxliff`** | 已實作（**僅副檔名 / 路徑**） | 與 `.xlf`／`.xliff` 一樣列為可選副檔名、設 `currentFileFormat === 'xliff'`，不彈 mq 身分。**內文仍須是匯入器能解析的 XLIFF**；若 memoQ 產出格式與解析器假設不合，匯入會失敗，此屬內文相容，非本列可單獨保證 | [`cat-tool/app.js`](../cat-tool/app.js) 開檔、精靈 |
| **Bug #5 部分 targetTags** | 未修（見專文） | memoQ「部分編輯」句段：譯文 `<target>` 僅含部分 `<ph>`，匯入後 `targetTags` 為 `sourceTags` 真子集；`effectiveTags` 全採譯文側陣列 → `buildTaggedHtml` 無法為 `{3}`… 建 pill；F8 插入後若未同步 `seg.targetTags`／寫庫，重畫即退成純文字。與 **Bug #3A**（targetTags 全空）互補 | [`xliff-import.js`](../cat-tool/js/xliff-import.js)、[`app.js`](../cat-tool/app.js) `insertNextMissingTag`、`effectiveTags` |

**Bug #5 完整調查、白話摘要、修正建議與 mq:ch 換行 display 增強**：[`bug-report_mqxliff-partial-target-tags.md`](bug-report_mqxliff-partial-target-tags.md)。

**靜態部署**：變更 `cat-tool/` 後執行 `node scripts/sync-cat.mjs`，使 `public/cat/` 一致。

## 建議測試（階 1–2）

1. **#1 / CSS**：開啟任意有句段的檔，看表格式原文欄在初次繪製時列高是否**較不突兀**（主觀即可）。  
2. **#2 / 匯出**：（a）`source_tags` 與 `target_tags` **皆空**、內文含**純字串**如 `Press <input id="x"/>` 與譯文同型，匯出後用**記事本**可見 `&lt;` 實體、**memoQ** 應能當成文字讀到。（b）`target_tags` 空、僅有 `source_tags`（ph）、譯文**未**帶 `{1}` 但內有裸 `</`…`/>`，匯出後在 memoQ 不應再丟字。  
3. **#3A / 匯入**：用「原文有 `<ph>` 包 `mq:…`、譯文為**實體純文字**行內 `mq:…`」的 mqxliff 範例匯入，確認**譯文**欄能出現 tag pill 或行為好於匯入前。  
4. **`.mxliff`（可選）**：目的只有驗證**副檔名**走一般 xliff、**不**問 mq 身分（`*.mqxliff` 才會）。實測建議用**內文已是有效 XLIFF、僅把副檔名改成** `.mxliff` 的檔；若用 memoQ 原生 `.mxliff` 而匯入器報錯，**可略過**—代表內文尚未支援，不強制你為此修檔。若仍要回報，請註明檔名與內文是否為標準 XLIFF 結構。  
5. **階 3 / 搜尋**：原、譯欄含 `{1}` 等 tag pill 時，在**搜尋範圍含該欄**且**該欄有命中**時，pill 仍應**完整**（不應退成純字元 `{1}` 字串）；`normalizeXmlForSig` 不影響你手動比對的步驟，屬內部標籤成對用。
