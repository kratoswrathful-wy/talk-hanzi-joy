# Excel 匯入：可逆 inline tag（匯入→編輯→匯出）— 實作計畫

> 本文件為工程實作計畫，與高層摘要互補：  
> - 高層摘要：[`EXCEL_IMPORT_TAG_WARNING_PLAN.md`](./EXCEL_IMPORT_TAG_WARNING_PLAN.md)  
> - 工程規格（本波更新）：[`EXCEL_IMPORT_TAGS_SPEC.md`](./EXCEL_IMPORT_TAGS_SPEC.md) §5–§6、§9.2

## 1. 背景：為什麼要做「可逆」

現行 Excel 匯出路徑多為「把 `targetText` 直接寫回工作表」，若匯入階段把原始標記轉成 `{N}` 佔位符但 **`tags[].xml` 未保存原始 token**、匯出也 **未做 placeholder 反向替換**，就會造成匯出檔充滿 `{1}` 或 UI 顯示的 pill「1」等不可用內容。

目標是讓 Excel 匯入後的 tag **可展開看到原始 token**，且在匯出時能 **還原回原始 token**（不保留 `{N}`）。

## 2. 最終輸出目標（核心例子）

原文：

`我方额外积累<color=ColorSkillParams>#4[i]</color>点…`

匯入後（內容保留、標記轉 tag）：

`我方额外积累{1}#4{2}{/1}点…`

- `{1}` 展開：`<color=ColorSkillParams>`
- `{2}` 展開：`[i]`
- `{/1}` 展開：`</color>`

匯出回 Excel 時：還原為原文標記（`<color...>`、`[i]`、`</color>`），不留 `{N}`。

## 3. 規則：成對優先，否則 standalone（依 token 內容判斷）

### 3.1 Tokenization（候選 token）

在「非既有 `{N}`/`{/N}` 佔位符」的純文字片段中，掃描以下候選 token：

- 角括號：`<...>`（包含 `</...>`、`<.../>`）
- 方括號：`[...]`（包含 `[/...]`）
- 字面 `\\n`（兩字元）

### 3.2 成對（open/close）

- `<tag ...>` 與 `</tag>`：同名配對（stack）
- `[tag]` 與 `[/tag]`：同名配對（stack）
- 成功配對才轉換：
  - open → `{n}`（type: open，xml: 原始 open token）
  - close → `{/n}`（type: close，xml: 原始 close token）

### 3.3 standalone

若 token 不屬於可成對的 open/close（或成對條件不成立），則視為 standalone：

- `[i]`、`[SIGN UP]` 等
- `<br/>` 等自閉合
- 字面 `\\n`

轉換後為單顆 `{n}`（type: standalone，xml: 原始 token）。

### 3.4 不合法容錯：允許但不轉換

若 open/close 無法配對（缺 closing、交錯），則保留原字串，不插入 `{n}`，不新增 `tags[]`。

**補充（作為實做依據）**：

- **尾端未關閉的 `<tag ...>`**：可將剩餘 open 降級為 standalone，避免整格放棄（已落地：`61da2f6`）。
- **`<color=…><SpriteName=…>文字</color>` 類巢狀**：外層 `</color>` 出現時，stack 頂可能是 `SpriteName`；**必須**先將內層無獨立 close 的 open 視為 standalone 再關 `color`，否則整段仍會被 §3.4 整段放棄。規格細節見 [EXCEL_IMPORT_TAGS_SPEC.md](./EXCEL_IMPORT_TAGS_SPEC.md) §6.5。

## 4. 實作落點（建議）

### 4.1 匯入：產生 tags[]（保存可逆 token）

- 檔案：`cat-tool/js/excel-import-string-tags.js`
  - 將目前以「括號包段」為主的實作，改為「token parser」：
    - 產生 `{n}`/`{/n}`/`{n}`（standalone）
    - `tags[]` 的 `xml` 存原始 token 字串（供展開/匯出）
    - `display` 可用縮短版（例如 `<color>`、`</color>`、`[i]`）
  - 需與 Rich Text 既有 `tags[]` 接續編號（利用 `maxTagNum`）。

- 掛載點：`cat-tool/app.js` 的 `extractSegmentIntoBackup` 在 Rich Text 萃取後套用字串層規則（現行已接入管線，需調整為新 parser 的選項/順序）。

### 4.2 匯出：placeholder → xml 反向替換（Excel）

- 檔案：`cat-tool/app.js`
  - Excel（保留原檔）匯出：以 `excelApplyTranslatedSegmentsToWorkbook` 僅 patch 譯文格；單格內容由 `excelExportTargetCellForSheet` 組裝（字串層 `restorePlaceholdersForExport` + 可選 `buildRichTextXml`／`tagLayer: 'xlsxRpr'`），**不再**預設整表 `aoa_to_sheet` 重蓋（見 `5e84fae` 與 [EXCEL_IMPORT_TAGS_SPEC.md](./EXCEL_IMPORT_TAGS_SPEC.md) §9）。
  - 若 `targetTags` 缺失或 map 中找不到某些 placeholder：可保留 placeholder 或記錄 warning（依產品決策）。

### 4.3 同步 public/cat

- 修改 `cat-tool/` 後執行 `npm run sync:cat`，並一併提交 `public/cat/`。

## 5. 驗收清單

### 5.1 匯入顯示與展開

1. 匯入含 `<color=...>#4[i]</color>` 的 Excel。
2. 句段文字應為：`{1}#4{2}{/1}`（或編號接續）。
3. 展開 `{1}` / `{2}` / `{/1}` 能看到原始 token（open、standalone、close）。

### 5.2 匯出可逆

1. 匯出 Excel 後，用 Excel 開啟儲存格內容：
   - 應還原為 `<color=...>#4[i]</color>`（或至少不保留 `{N}`）。
2. 另測 `\\n` 與 `[SIGN UP]` 類型 token：匯出應還原原字串。

### 5.3 容錯

- 若只有 `<color=...>` 沒有 `</color>`：應保留原字串、不轉換、不產生 `{N}`（允許但不轉換）。
- **含 `<SpriteName=…>` 且無 `</SpriteName>`、但外層有 `</color>`**：匯入後應可 tag 化（`SpriteName` 為 standalone，`color` 成對）；見 [EXCEL_IMPORT_TAGS_SPEC.md](./EXCEL_IMPORT_TAGS_SPEC.md) §6.5；**已落地**於 `b8da3d0`（`validateAngleStack`）。
- **已寫入雲端之舊句段**（當時整段未轉換、無 `tags`）：須 **重新匯入**原檔或批次重算，否則線上仍顯示純文字 `<color=...>`。
- **最小回歸（本機 Node）**：`node scripts/test-excel-import-angle-tolerance.mjs`（不依賴瀏覽器）。

---

## 實作完成／追溯

- 核心行為（token 解析、`tags[].xml`、匯出 `restorePlaceholdersForExport`）已落地；驗收紀錄與編輯器 Tag 檢視三態說明見 [CAT_EXCEL_REVERSIBLE_INLINE_TAGS_HISTORY_2026-05.md](./CAT_EXCEL_REVERSIBLE_INLINE_TAGS_HISTORY_2026-05.md)。
- 程式碼追溯：commit `9bd0173` 起（`main`）；詳見該 HISTORY 檔「版本／追溯」小節。
- **2026-05-08 波次（Excel 富文本匯出 + 巢狀角括號）**：`5e84fae`（匯出 patch／`xlsxRpr`／`vertAlign`）、`61da2f6`（尾端未關閉 open）、`02ef3f4`（`col_tgt` 數字化）、`1cd2d80`（規格與歷史文件）、`b8da3d0`（§6.5 巢狀 close 容錯 + 腳本 `scripts/test-excel-import-angle-tolerance.mjs`）。完整過程見 [CAT_EXCEL_REVERSIBLE_INLINE_TAGS_HISTORY_2026-05.md](./CAT_EXCEL_REVERSIBLE_INLINE_TAGS_HISTORY_2026-05.md) §「2026-05-08 波次」。

