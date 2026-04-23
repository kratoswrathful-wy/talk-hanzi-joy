# Bug Report：mqxliff／XLIFF 匯入匯出與顯示（精簡維運版）

> 更新：2026（階 1–2 重補：CSS 緩衝、零 tag 匯出、譯文 mq: 補 target_tags、副檔名 `.mxliff`）

本檔在復原/重建流程中作為**對照清單**；與大改版、回溯脈絡見 [`CAT-rollback-recovery-notes-2026-04.md`](CAT-rollback-recovery-notes-2026-04.md)。

## 實作對照

| 項目 | 狀態 | 說明（原理級） | 相關檔案 |
|------|------|----------------|----------|
| **Bug #1 緩衝** | 已實作 | 原文欄在 tag pill 就緒前，用最小高度減少版面一閃 | [`cat-tool/style.css`](../cat-tool/style.css) `.col-source .rt-editor` |
| **Bug #2 匯出** | 已實作 | **無** `targetTags` 或**兩邊 tag 陣列皆空**則以 `textContent` 寫入；若僅有 `sourceTags` 但譯文**沒有** `{N}` 佔位、純字串內有裸 `</>`，也強制 `textContent`（避免誤用 XML 解析） | [`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js) `setExportTargetPlainOrFragment`、`usePlainTextForExportTarget` |
| **Bug #3A 匯入** | 已實作（heuristic） | 譯文內可見行內 `<mq:…>` 純字元、但 `targetTags` 空時，從含 `mq:` 的 `sourceTags` 補欄 | [`cat-tool/js/xliff-import.js`](../cat-tool/js/xliff-import.js) `augmentTargetTagsForPlainInlineMemoQ` |
| **Bug #4 搜尋** | 未實作（下階） | 搜尋後不覆蓋原文 pill，見重建計畫階 3 | [`cat-tool/app.js`](../cat-tool/app.js) |
| **副檔名 `.mxliff`** | 已實作 | 與 `.xlf`／`.xliff` 一樣設為 `currentFileFormat === 'xliff'`，匯入精靈一併接受 | [`cat-tool/app.js`](../cat-tool/app.js) 開檔、精靈 |

**靜態部署**：變更 `cat-tool/` 後執行 `node scripts/sync-cat.mjs`，使 `public/cat/` 一致。

## 建議測試（階 1–2）

1. **#1 / CSS**：開啟任意有句段的檔，看表格式原文欄在初次繪製時列高是否**較不突兀**（主觀即可）。  
2. **#2 / 匯出**：（a）`source_tags` 與 `target_tags` **皆空**、內文含**純字串**如 `Press <input id="x"/>` 與譯文同型，匯出後用**記事本**可見 `&lt;` 實體、**memoQ** 應能當成文字讀到。（b）`target_tags` 空、僅有 `source_tags`（ph）、譯文**未**帶 `{1}` 但內有裸 `</`…`/>`，匯出後在 memoQ 不應再丟字。  
3. **#3A / 匯入**：用「原文有 `<ph>` 包 `mq:…`、譯文為**實體純文字**行內 `mq:…`」的 mqxliff 範例匯入，確認**譯文**欄能出現 tag pill 或行為好於匯入前。  
4. **`.mxliff`**：副檔名 `test.mxliff` 的檔在精靈可入庫、從專案點入後**當成一般 xliff** 流程（不進 mq 身分，除非檔實際為 `*.mqxliff`）。
