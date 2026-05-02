# CAT：XLIFF／mqxliff／sdlxliff 匯入翻譯記憶庫（TM）

> 建立日期：2026-05-03  
> 專案：1UP TMS — Vanilla CAT（[`cat-tool/`](../cat-tool/)）  
> 相關：`docs/XLIFF_TAG_PIPELINE.md`、[`cat-tool/js/xliff-import.js`](../cat-tool/js/xliff-import.js)（作業檔匯入）、[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)

本文件記錄**產品討論、設計決策與實作方案**；核准後依 [`AGENTS.md`](../AGENTS.md) 執行 `npm run sync:cat`、一併提交 `public/cat/`。

---

## 1. 背景與範圍

- 既有 TM 匯入僅支援 **TMX**、**Excel／CSV**（[`cat-tool/app.js`](../cat-tool/app.js) `tmImportInput` change 處理）。
- XLIFF 解析與標籤管線已存在（[`cat-tool/js/xliff-import.js`](../cat-tool/js/xliff-import.js)、[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)），但用途是**開啟作業檔**寫入 `cat_segments`，**不是**寫入 TM。
- **本功能**：在 TM 詳情頁，使用者可直接選取 `.xliff`、`.mqxliff`、`.sdlxliff`，將符合條件的句段以**純文字**寫入 `cat_tm_segments`（與 TMX 匯入同一條 `DBService.bulkAddTMSegments` 路徑）。

---

## 2. 設計決策（已確認）

| 主題 | 決策 |
|------|------|
| **重複句段** | **Append**（與現有 TMX 一致）：跨次匯入**不去重**。同一次匯入內，以 `key`（`trans-unit` 之 `id`／`resname` 等；sdlxliff 多段為 `{tuId}:{mid}`）去重，**同 key 只保留第一筆**。 |
| **篩選條件（嚴格）** | **譯文非空**（`target` 經 `extractTaggedText` 後之 `.text` 去空白後非空）。**mqxliff**：跳過 `mq:locked="Locked"` 或 `locked="true"` 之 `trans-unit`。**sdlxliff**：僅匯入 `sdl:seg` 之 `conf` 為 `Translated`、`ApprovedTranslation`、`ApprovedSignOff` 者。**一般 XLIFF 1.2／mqxliff 非 locked**：譯文非空即匯入（不要求 `state`）。 |
| **標籤** | 僅存**純文字**（`CatToolXliffTags.extractTaggedText(node, opts).text`）。`cat_tm_segments` **無** `source_tags`／`target_tags`；若日後需 tag 感知 TM，另開 migration 與規格。 |

---

## 3. 資料映射（`trans-unit`／`unit` → `cat_tm_segments`）

| 來源 | TM 欄位（camelCase） | 備註 |
|------|----------------------|------|
| `<source>`／`<mrk>` 去標籤後文字 | `sourceText` | 見 §2 |
| `<target>`／對應 `mrk` 去標籤後文字 | `targetText` | |
| `trans-unit` 之 `id`／`resname`／`mq:unitId` | `key` | sdlxliff 多 `mrk`：`{fallbackId}:{mid}` |
| `<file original="…">`；XLIFF 2 可退用 `@id` | `writtenFile` | |
| 匯入檔之檔名 | `writtenProject` | XLIFF 無專案名稱欄位時之慣例 |
| `<file source-language>`／`<xliff srcLang>`（2.0） | `sourceLang` | 空則退用 TM 第一個 `sourceLangs` |
| `<file target-language>`／`<xliff trgLang>`（2.0） | `targetLang` | 空則退用 TM 第一個 `targetLangs` |
| 目前使用者＋匯入標記 | `createdBy`、`changeLog` | 與 TMX 匯入慣例一致 |

其餘：`prevSegment`、`nextSegment` 空字串；`tmId`、`createdAt`、`lastModified` 由呼叫端／模組填入。

---

## 4. 實作方案

### 4.1 新增 [`cat-tool/js/xliff-to-tm.js`](../cat-tool/js/xliff-to-tm.js)

- 掛在 **`window.CatToolXliffToTm`**，匯出 **`parseXliffForTm(file, options)`**（`async`）。
- `options`：`tmId`（必填）、`tmSourceLang`、`tmTargetLang`（選填，檔內無語言時後援）、`creatorBase`（選填，預設讀 `localStorage.localCatUserProfile`）。
- 內部：`DOMParser`、`parsererror` 檢查；依副檔名與命名空間判斷 **mqxliff**／**sdlxliff**；依根元素 **`version`／命名空間** 區分 **XLIFF 2.0**（`<unit>`）與 **1.2**（`<trans-unit>`）。
- **sdlxliff** 多段／單段／無 `mrk` 分支與 [`xliff-import.js`](../cat-tool/js/xliff-import.js) 對齊（`collectSegMrks`、`transparentG` 規則見 `docs/XLIFF_TAG_PIPELINE.md`）；僅輸出欄位改為 TM draft。
- 回傳陣列元素形狀與 TMX 匯入 `parsedSegments` 相同，可直接餵 `DBService.bulkAddTMSegments`。

### 4.2 修改 [`cat-tool/app.js`](../cat-tool/app.js)

- `tmImportInput` 的 `change`：副檔名為 `xliff`／`xlf`／`mqxliff`／`sdlxliff` 時呼叫 `CatToolXliffToTm.parseXliffForTm`；`getTM` 取語言後援。
- 筆數為 0：`alert` 文案 **「找不到可匯入句段」**（或等價說明：無符合篩選之譯文）。
- 筆數大於 0：與 TMX 相同**直接** `bulkAdd`（使用者已於檔案選擇器確認檔案）。
- 成功後沿用既有 `patchTM`、`appendTMChangeLog`、`addModuleLog`、`loadTmSegments`。

### 4.3 修改 [`cat-tool/index.html`](../cat-tool/index.html)

- `#tmImportInput` 之 `accept` 加入 XLIFF 系副檔名；`#btnImportTmFile` 文案反映新格式。
- 於 `xliff-import.js` 之後載入 **`js/xliff-to-tm.js`**。

### 4.4 建置

- 根目錄執行 **`npm run sync:cat`**，提交 `cat-tool/` 與 `public/cat/`。

---

## 5. 驗收清單

1. 標準 XLIFF 1.2：譯文非空之句段正確匯入筆數。
2. mqxliff：`locked`／`mq:locked` 之句段不匯入；其餘非空譯文可匯入。
3. sdlxliff：`conf` 非已譯者不匯入；`Translated` 等可匯入；多 `<mrk mtype="seg">` 各自成一筆。
4. XLIFF 2.0：`srcLang`／`trgLang` 自根元素讀取；`<unit>`／`<segment>` 有譯文者可匯入。
5. 同一次匯入重複 `key` 只保留一筆。
6. 整檔無可匯入句段時有明確提示，不得靜默成功。
7. 團隊模式：`bulkAddTMSegments` 後 TM 詳情重新整理可見新列。

---

## 6. 範圍外（本次不做）

- `cat_tm_segments` 新增 tag 欄位。
- 跨次匯入之自動去重或 upsert。
- TM 匯出為 XLIFF（現有仍為 TMX／Excel）。

---

## 7. 修訂紀錄

| 日期 | 摘要 |
|------|------|
| 2026-05-03 | 初版：討論收斂、映射表、實作錨點與驗收。 |
