# CAT：Excel 可逆 inline tag（匯入→編輯→匯出）— 開發／驗收紀錄（2026-05）

> 本文件目的：將「需求怎麼來、規格怎麼定、程式改在哪、怎麼驗收」寫成可追溯紀錄，與工程規格／計畫文件互補。

## 相關文件

- 工程規格：[EXCEL_IMPORT_TAGS_SPEC.md](./EXCEL_IMPORT_TAGS_SPEC.md)（§5–§6、§9.2）
- 實作計畫：[EXCEL_IMPORT_REVERSIBLE_INLINE_TAGS_IMPLEMENTATION_PLAN.md](./EXCEL_IMPORT_REVERSIBLE_INLINE_TAGS_IMPLEMENTATION_PLAN.md)
- 高層摘要：[EXCEL_IMPORT_TAG_WARNING_PLAN.md](./EXCEL_IMPORT_TAG_WARNING_PLAN.md)
- 程式對照：[CODEMAP.md](./CODEMAP.md)（「Excel 匯入警語 + inline tag（可逆）」列）

## 背景與目標

Excel 匯入若僅把儲存格內的標記轉成編輯器佔位符 `{N}`／`{/N}`，但 **`tags[].xml` 未保存原始字元**，且匯出時 **未將佔位符換回原始 token**，匯出檔會殘留 `{1}` 等無法交件的內容。

**目標**：

1. 匯入後編輯器內可照常以 pill／佔位符編輯，且展開時能看到**原始 token**（例如 `<color=…>`、`[i]`）。
2. 匯出 Excel（含批次 ZIP 內試算表）時，譯文欄能 **還原為匯入前的標記字串**，不保留 `{N}`。

## 規格定案（摘要）

- **管線順序**（每格）：Rich Text 萃取（[`cat-tool/js/xlsx-rich-tags.js`](../cat-tool/js/xlsx-rich-tags.js) `extractCellRichTags`）→ 純文字層 **可逆 inline tag**（[`cat-tool/js/excel-import-string-tags.js`](../cat-tool/js/excel-import-string-tags.js)）→ 可選自訂 regex。
- **成對優先，否則 standalone**：依 token **內容**判斷（例如 `<tag>` 與 `</tag>`、`[tag]` 與 `[/tag]` 成對；`[i]`、`<br/>`、字面 `\n` 等為 standalone）。
- **不合法結構**：缺關閉、交錯等 → **允許但不轉換**（整段維持原字，不插入 `{N}`）。
- **`tags[].xml`**：字串層產生的 tag 必須保存**匯出時要還原的字串**（原始 token）。

## 實作落點

| 區塊 | 檔案與要點 |
|------|------------|
| 字串層解析與匯入管線 | [`cat-tool/js/excel-import-string-tags.js`](../cat-tool/js/excel-import-string-tags.js)：`applyPipeline`（角／方／`{}`／字面 `\n`、自訂 regex standalone）、`restorePlaceholdersForExport(text, tags)` |
| 匯入掛載 | [`cat-tool/app.js`](../cat-tool/app.js)：`extractSegmentIntoBackup`（Rich Text 後呼叫 `CatToolExcelImportStringTags.applyPipeline`）；精靈選項 `_activeExcelStringTagRules`／`stringTagRules` |
| 匯出還原 | [`cat-tool/app.js`](../cat-tool/app.js)：`excelExportPlainTargetCell`；單檔匯出 Excel 分支、`_batchExportBuildBlob` 試算表分支、Google Sheet 列組裝 |
| 靜態資產同步 | 變更 `cat-tool/` 後執行 `npm run sync:cat` → [`public/cat/`](../public/cat/) |

## 驗收紀錄（已通過）

1. **匯入形狀**：含 `<color=…>#4[i]</color>` 類內容時，句段呈現為 `{1}#4{2}{/1}`（編號可隨 Rich Text 既有 tag 遞延）。
2. **展開／中繼**：各 pill 能對應到正確之 **`xml`**（open／standalone／close）。
3. **匯出可逆**：匯出後用 Excel 開啟譯文格，為原始標記字串，**不**殘留 `{N}`；字面 `\n`、方括號 token 等同理。
4. **容錯**：僅有開頭角括號無配對關閉時，**不轉成**佔位符，維持原字。

## 編輯器延伸：Tag 檢視三態（同波或緊接實作）

使用者需求：在 CAT 編輯器內將 **inline tag 的顯示**分為三層（僅編號／摘要／全文），以 **Alt+S 循環** 與 **工具列下拉** 切換；全文優先顯示 `tags[].xml`（與 Excel 可逆一致）。實作見 [`cat-tool/app.js`](../cat-tool/app.js) `tagViewMode`／`setTagViewMode`、`buildTaggedHtml` 之 `.tag-label`／`.tag-full`，以及 [`cat-tool/style.css`](../cat-tool/style.css) `#editorGrid.tag-view-*`。

## 版本／追溯

- **可逆 inline tag 核心**：commit `9bd0173`（`main`，訊息：`feat(cat): Excel 可逆 inline tag 解析與匯出 placeholder 還原`）
- **Tag 三態（Alt+S 循環／工具列下拉）+ 本紀錄文件**：commit `a19b6ad`（`main`）。

---

## 2026-05-08 波次：Excel 富文本匯出、上／下標、與 `<color><SpriteName>…</color>` 匯入缺口

### 背景（現象）

1. **匯出 xlsx 後原文欄出現 `<sz`、`<color theme=` 等字面 XML**  
   根因：整張工作表 `sheet_to_json` → `aoa_to_sheet` 重蓋，非譯文欄富文本被破壞。  
   **修正**：僅以 `sheet_add_aoa` patch 譯文格；見 `5e84fae`（`main`）。

2. **譯文欄富文本／`{n}` 併存時匯出失真**  
   **修正**：`tagLayer: 'xlsxRpr'` 區隔 Rich Text 佔位與字串層佔位；匯出先 `restorePlaceholdersForExport`（僅字串層）再 `buildRichTextXml`；同見 `5e84fae`。

3. **上／下標匯入即不見**  
   **修正**：`xlsx-rich-tags.js` 的 `parseRpr`／`styleEq` 等納入 `vertAlign`；同見 `5e84fae`。

4. **大量句段含 `<color=…><SpriteName=…>…</color>` 卻完全沒有 `tags`（雲端可查）**  
   根因（第一階段）：角括號 stack 驗證把「尾端未關閉的 `<tag>`」導致整段放棄 → **部分緩解**：`61da2f6` 將尾端殘留 open 降級 standalone。  
   **仍殘留**：當 `</color>` 出現時 stack 頂為 `SpriteName`（內層無 `</SpriteName>`）→ 仍判定不合法 → **整段不轉換**。此為 **§6.5** 規格要補的演算法（文件已寫入 [EXCEL_IMPORT_TAGS_SPEC.md](./EXCEL_IMPORT_TAGS_SPEC.md) §6.5；程式待落地）。

5. **`col_tgt` 以字串型別寫入導致寫錯欄**  
   **修正**：`02ef3f4`（`main`）；事後紀錄見 [CAT_EXCEL_EXPORT_COLTGT_STRING_BUG_2026-05.md](./CAT_EXCEL_EXPORT_COLTGT_STRING_BUG_2026-05.md)（若檔案已存在於 repo）。

### 後端對照（範例檔名）

以 Supabase `public.cat_files`／`public.cat_segments` 抽查兩個檔名（2026-05-08 匯入）：

- `P1_2026年4月W4_V4.3_尘灵+飞机大巴扎等活动_繁体中文+zh-TW_翻译_source+target_20260508145511.xlsx`
- `P1_2026年5月W1_V4.3_活动+狸狸周刊与任务文本迭代_繁体中文+zh-TW_翻译_source+target_20260508144827.xlsx`

曾觀測到：含 `<color=` 的句段中，**多數** `source_tags`／`target_tags` 仍為空（代表匯入時整段未 tag 化），與 UI「整段仍是 `<color=...>` 字面」一致。

### 驗收要點（本波）

- **重新匯入**上述檔案後（或任意含 `<color><SpriteName>…</color>` 之格）：在 §6.5 實作完成前，**不可**要求「全部句段必有 tags」；完成後應可 tag 化。
- **匯出**：非譯文欄富文本不被破壞；譯文含 Rich 佔位者能寫回 `cell.r`。
- **部署**：Vercel 可能只顯示最新 Production deployment；中間 commit 未必各列一筆，但 **`main` 歷史**仍可追溯。

### 追溯（`main`，依時間大致順序）

- `5e84fae` — `fix(cat): Excel export keeps rich text; xlsxRpr tags and vertAlign import`
- `61da2f6` — `fix(cat): tolerate unpaired <tag> placeholders in Excel import`（**僅尾端未關閉**；**不含** §6.5 之 close 不匹配）
- `02ef3f4` — `fix(cat): Excel export colTgt string type writes to wrong column`
- `bb324d2` — `fix(cat): keep centered scroll after confirm focus`（與本波 Excel 無直接關係，常為 Production 清單可見之最新部署）
