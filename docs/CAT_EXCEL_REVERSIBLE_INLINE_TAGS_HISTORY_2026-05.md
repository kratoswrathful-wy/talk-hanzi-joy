# CAT：Excel 可逆 inline tag（匯入→編輯→匯出）— 開發／驗收紀錄（2026-05）

> 本文件目的：將「需求怎麼來、規格怎麼定、程式改在哪、怎麼驗收」寫成可追溯紀錄，與工程規格／計畫文件互補。

## 相關文件

- 工程規格：[EXCEL_IMPORT_TAGS_SPEC.md](./EXCEL_IMPORT_TAGS_SPEC.md)（§5–§7 匯入管線；§6.5 角括號巢狀；§9 Excel 匯出富文本與可逆）
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
| 匯出還原 | [`cat-tool/app.js`](../cat-tool/app.js)：`excelExportPlainTargetCell`（純字串格）、`excelExportTargetCellForSheet`／`excelApplyTranslatedSegmentsToWorkbook`（`tagLayer: 'xlsxRpr'` + `sheet_add_aoa` 僅 patch 譯文格）；單檔匯出 Excel 分支、`_batchExportBuildBlob` 試算表分支、Google Sheet 列組裝 |
| 角括號巢狀容錯 | [`cat-tool/js/excel-import-string-tags.js`](../cat-tool/js/excel-import-string-tags.js)：`validateAngleStack`（`</outer>` 與 stack 頂不符時，將擋路之 `angle_open` 降級為 `angle_stand`） |
| 靜態資產同步 | 變更 `cat-tool/` 後執行 `npm run sync:cat` → [`public/cat/`](../public/cat/) |

## 驗收紀錄（已通過）

1. **匯入形狀**：含 `<color=…>#4[i]</color>` 類內容時，句段呈現為 `{1}#4{2}{/1}`（編號可隨 Rich Text 既有 tag 遞延）。
2. **展開／中繼**：各 pill 能對應到正確之 **`xml`**（open／standalone／close）。
3. **匯出可逆**：匯出後用 Excel 開啟譯文格，為原始標記字串，**不**殘留 `{N}`；字面 `\n`、方括號 token 等同理。
4. **容錯**：僅有開頭角括號無配對關閉時，**不轉成**佔位符，維持原字。
5. **巢狀遊戲占位**（2026-05-08 波次）：`<color=…><SpriteName=…>文字</color>` 匯入後可 tag 化（`SpriteName` 為 standalone，`color` 成對）；見 §「驗收紀錄（本波）」與 commit `b8da3d0`。
6. **Excel 匯出不破壞非譯文欄富文本**：不再整表 `aoa_to_sheet` 重蓋；見 commit `5e84fae`。
7. **譯文格 Rich Text 寫回**：含 `xlsxRpr` 佔位時以 `buildRichTextXml` 組 `cell.r`；見 `5e84fae`。
8. **`col_tgt` 型別**：寫入位址時使用 `Number(colTgt)`，避免寫錯欄；見 `02ef3f4` 與 [CAT_EXCEL_EXPORT_COLTGT_STRING_BUG_2026-05.md](./CAT_EXCEL_EXPORT_COLTGT_STRING_BUG_2026-05.md)。

## 編輯器延伸：Tag 檢視三態（同波或緊接實作）

使用者需求：在 CAT 編輯器內將 **inline tag 的顯示**分為三層（僅編號／摘要／全文），以 **Alt+S 循環** 與 **工具列下拉** 切換；全文優先顯示 `tags[].xml`（與 Excel 可逆一致）。實作見 [`cat-tool/app.js`](../cat-tool/app.js) `tagViewMode`／`setTagViewMode`、`buildTaggedHtml` 之 `.tag-label`／`.tag-full`，以及 [`cat-tool/style.css`](../cat-tool/style.css) `#editorGrid.tag-view-*`。

## 版本／追溯

- **可逆 inline tag 核心**：commit `9bd0173`（`main`，訊息：`feat(cat): Excel 可逆 inline tag 解析與匯出 placeholder 還原`）
- **Tag 三態（Alt+S 循環／工具列下拉）+ 本紀錄文件**：commit `a19b6ad`（`main`）。

---

## 2026-05-08 波次：Excel 富文本匯出、`tagLayer`、上／下標、`col_tgt`、與 `<color><SpriteName>…</color>` 匯入

本節為**完整開發過程紀錄**（現象 → 調查 → 實作 → commit → 驗收 → 限制），作為日後同類問題的實做依據。

### 1. 問題發現（現象與根因摘要）

| # | 現象（使用者／驗收） | 根因（技術一句） |
|---|----------------------|------------------|
| A | 匯出 xlsx 後，**原文欄**出現 `<sz val=…>`、`<color theme=…>` 等**字面 XML**，富文本「不見」 | 匯出時對整張表 `sheet_to_json` → 改譯文 → `aoa_to_sheet` **重蓋整表**，非譯文格之 `cell.r`／呈現被破壞 |
| B | 譯文欄含 Rich Text 佔位 `{n}` 時，匯出後格式錯亂或 rPr 碎片當純文字 | 僅走 `restorePlaceholdersForExport`，把 `xlsxRpr` 的 `xml`（rPr 內層）誤當字串塞回；**未**呼叫 `buildRichTextXml` 組 `cell.r` |
| C | 上／下標一匯入就沒了 | `xlsx-rich-tags.js` 的 `parseRpr` 未讀 `vertAlign`，run 被誤合併 |
| D | 大量句段含 `<color=…><SpriteName=…>…</color>`，**整段沒有** `tags`（雲端 `cat_segments` 可見 `tags` 為空） | 角括號 stack：`</color>` 出現時 stack 頂為 `SpriteName`（無 `</SpriteName>`），舊版 **整段判定不合法** → 不插入 `{n}` |
| E | 匯出寫入欄位「飄掉」、寫到錯欄 | `colTgt` 以**字串**參與 `encode_cell` 等運算，欄索引錯位 |

**補充**：此處**不是**「等號 `=`」造成 tag 名稱錯誤；`=` 在 `<color=…>` 內為內文。問題在 **close 與 stack 順序**（見規格 [EXCEL_IMPORT_TAGS_SPEC.md](./EXCEL_IMPORT_TAGS_SPEC.md) §6.5）。

### 2. 調查路徑（可重現）

1. **本機 xlsx 結構掃描**（對照 SheetJS 0.20.1 與瀏覽器 CDN 一致）  
   - `scripts/cache-sheetjs.mjs`：快取 `xlsx.full.min.js` 供 Node 讀檔。  
   - `scripts/inspect-xlsx-import.mjs`：掃描各 sheet 儲存格是否含角括號樣式字串、`cell.r` 是否存在等（輸出 JSON 供比對）。  
2. **雲端資料對照**（團隊 Supabase）  
   - 以 `public.cat_files` 依檔名找到 `file_id`，再對 `public.cat_segments` 統計：含 `<color=` 的列中 `source_tags`／`target_tags` 仍為空的比例，確認「匯入即未 tag 化」而非僅 UI。  
3. **程式碼對照**  
   - 匯出：`cat-tool/app.js` 內舊註解「整表 AoA 重建」路徑。  
   - 匯入：`cat-tool/js/excel-import-string-tags.js` 的 `validateAngleStack` → `transformAngleSquareLit` 早退行為。

### 3. 實作與 commit 對照（`main`）

| Commit | 訊息（摘要） | 解決哪一項 |
|--------|----------------|------------|
| `5e84fae` | Excel export keeps rich text; `xlsxRpr` tags and `vertAlign` import | A、B、C：`sheet_add_aoa` 僅 patch 譯文格；`tagLayer: 'xlsxRpr'` + `excelExportTargetCellForSheet`；`vertAlign` |
| `61da2f6` | tolerate unpaired `<tag>` placeholders（尾端殘留 open） | D 之**子集**：僅尾端未關閉的 open 降級 `angle_stand`；**未**解 `</color>` 與 stack 頂不符 |
| `02ef3f4` | Excel export `colTgt` string type writes to wrong column | E：`encode_cell` 前 `Number(colTgt)` |
| `1cd2d80` | docs: Excel import §6.5 / export §9 / 本歷史檔初稿 | 規格與本檔第一次補齊敘事（當時 §6.5 仍標「待落地」） |
| `b8da3d0` | import tolerates nested `<color><SpriteName>... </color>` | D **完整**：`validateAngleStack` 遇 `</outer>` 與 stack 頂不符時，將擋路之 `angle_open` 改為 `angle_stand` 直至可關閉外層 |

**輔助回歸**：[`scripts/test-excel-import-angle-tolerance.mjs`](../scripts/test-excel-import-angle-tolerance.mjs)（Node 直接載入 `excel-import-string-tags.js`，驗證典型字串與負例 `TEXT</color>`）。

### 4. 程式錨點（維護者速查）

- 匯入巢狀角括號：[`cat-tool/js/excel-import-string-tags.js`](../cat-tool/js/excel-import-string-tags.js) — `validateAngleStack`、`transformAngleSquareLit`、`applyPipeline`  
- Rich Text 萃取／上標下標：[`cat-tool/js/xlsx-rich-tags.js`](../cat-tool/js/xlsx-rich-tags.js) — `extractCellRichTags`、`parseRpr`、`buildRichTextXml`；匯入時 tag 加 `tagLayer: 'xlsxRpr'`  
- 匯出寫格：[`cat-tool/app.js`](../cat-tool/app.js) — `excelExportTargetCellForSheet`、`excelApplyTranslatedSegmentsToWorkbook`、批次 `_batchExportBuildBlob` 與單檔匯出分支（共用 helper）

### 5. 驗收紀錄（本波，已通過）

以下為產品／維運可重複執行的步驟（**須重新匯入**含問題句段之檔案，舊雲端句段不會因部署自動長出 `tags`）。

1. 部署後開啟線上 CAT，**強制重新整理**（Ctrl+F5），確認載入最新 `public/cat`。  
2. 重新匯入（擇一或兩者）：  
   - `P1_2026年4月W4_V4.3_尘灵+飞机大巴扎等活动_繁体中文+zh-TW_翻译_source+target_20260508145511.xlsx`  
   - `P1_2026年5月W1_V4.3_活动+狸狸周刊与任务文本迭代_繁体中文+zh-TW_翻译_source+target_20260508144827.xlsx`  
3. 開啟 **`ChenLingFesItem.txt`**（或先前統計中 `tags` 為空比例高之 sheet），抽查含  
   `<color=…><SpriteName=…>…</color>`  
   之句段：應出現 **pill／佔位符**（`color` open／`SpriteName` standalone／`color` close），而非整段字面 `<color=`。  
4. **匯出** xlsx，用 Excel 開啟：  
   - **非譯文欄**不應出現整串 OOXML 字面垃圾字串；  
   - **譯文欄**可逆 token 與 Rich 佔位行為符合預期。  
5. （可選）本機執行：`node scripts/test-excel-import-angle-tolerance.mjs` 應全數通過。

### 6. 已知限制與後續工作

- **舊已匯入句段**：若當時已寫成「無 `tags` 的純文字」，**僅升級前端／部署不會回填**；須 **重新匯入**原檔，或另案做「批次重算 `source_tags`／`target_tags`」工具／RPC。  
- **整格儲存格樣式 `cell.s`**：目前匯出寫入新 cell 物件時**未**合併舊格之 `cell.s`；若來源檔「整格粗體／整格字型」僅存在於 `cell.s` 而非 `cell.r`，匯出後仍可能與原檔視覺不完全一致——**待另案**（規格追溯註見 [EXCEL_IMPORT_TAGS_SPEC.md](./EXCEL_IMPORT_TAGS_SPEC.md) §9 末段）。  
- **Vercel Deployments 清單**：連續 push 時可能只顯示最新一筆 Production；中間 commit 請以 **`git log origin/main`** 為準。

### 7. 追溯（`main`，本波相關 commit 精簡列表）

- `5e84fae` — `fix(cat): Excel export keeps rich text; xlsxRpr tags and vertAlign import`
- `61da2f6` — `fix(cat): tolerate unpaired <tag> placeholders in Excel import`
- `02ef3f4` — `fix(cat): Excel export colTgt string type writes to wrong column`
- `1cd2d80` — `docs: Excel import §6.5 nested placeholders; export §9; 2026-05-08 history`
- `b8da3d0` — `fix(cat): import tolerates nested <color><SpriteName>... </color>`
