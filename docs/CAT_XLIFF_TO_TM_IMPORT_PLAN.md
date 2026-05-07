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
| **篩選條件** | **使用者可選**：選檔後開啟 **`#tmXliffImportDialog`**，條件與編輯器進階篩選相同語意（重用 [`cat-tool/app.js`](../cat-tool/app.js) 之 `evaluateSegment`、`segmentPassesSfRowRangePure`）。解析階段 [`CatToolXliffToTm.buildTmImportCandidates`](../cat-tool/js/xliff-to-tm.js) 輸出**全量候選**（含 `status`／`isLocked`／`matchValue`／tags 展開所需欄位），**不再**硬編碼 mq 鎖定／sdl `conf` 刪句。 |
| **標籤** | 僅存**純文字**（`CatToolXliffTags.extractTaggedText(node, opts).text`）。`cat_tm_segments` **無** `source_tags`／`target_tags`；若日後需 tag 感知 TM，另開 migration 與規格。 |

### 2.1 TM XLIFF 篩選 UI：預設值與重置（已定案）

- **每次**開啟「XLIFF 系列 → TM」匯入篩選對話框時，**一律從下列預設開始**；**不**使用 `localStorage` 或其它方式記住上次勾選。
- **預設勾選**之句段狀態 checkbox（值同編輯器 `.sf-status-cb`）：
  - `not_empty`（非空白）
  - `confirmed`（已確認）
  - `locked` **與** `unlocked` **同時**勾選  
  - 未勾選：`empty`、`unconfirmed`
- **「原文、譯文皆非空白」**：編輯器 `evaluateSegment` 之「空白／非空白」維度**僅對譯文**（`isEmpty` 看 `targetText`）。若要符合產品「原文亦不可空白」，於 **TM 匯入篩選流程**中另加條件：**`sourceText.trim()` 非空**（可與 `not_empty` 同時檢查）；Modal 文案宜簡短提示，避免與編輯器「非空白」誤解為僅譯文。
- **`locked` + `unlocked` 同勾**：於鎖定維度內為 OR，**等同不篩鎖定狀態**（任一句必為鎖定或未鎖定其一，兩者皆允許即全通過該維度）。

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

### 4.1 [`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) 與 [`cat-tool/js/xliff-to-tm.js`](../cat-tool/js/xliff-to-tm.js)

- **`CatToolXliffBuildSegments`**：與作業檔匯入共用之 XLIFF 句段列（`parseXliffFileToSegmentRows`），含 XLIFF 1.2／2、mqxliff、sdlxliff 分支。
- **`CatToolXliffToTm.buildTmImportCandidates(file, options)`**：依上列句段組 **`{ evalSeg, tmPayload }[]`**（`evalSeg` 供 `evaluateSegment`；`tmPayload` 同 TMX 匯入列，餵 `bulkAddTMSegments`）。同 key 去重（同次匯入只保留第一筆）。
- **`parseXliffForTm` 已廢止**（改用篩選對話框 + `buildTmImportCandidates`）。

### 4.2 修改 [`cat-tool/app.js`](../cat-tool/app.js)

- `evaluateSegment` 支援可選第八參數 **`evalOpts.sfMode`**（TM 匯入傳 `'filter'`），使「不包含」反轉不依賴編輯器當下搜尋模式。
- `tmImportInput` **XLIFF 系**：選檔後暫存 `File`、開啟 **`#tmXliffImportDialog`**（`resetTmXliffImportDialogDefaults`）；使用者按「匯入」→ `buildTmImportCandidates` → 逐筆 `evaluateSegment`（＋可選原文非空白）→ `segmentPassesSfRowRangePure` → `bulkAddTMSegments`。
- **0 筆**：區分「解析後無候選」與「篩選後無符合」兩種提示。
- 成功後沿用既有 `patchTM`、`appendTMChangeLog`、`addModuleLog`、`loadTmSegments`。

### 4.3 修改 [`cat-tool/index.html`](../cat-tool/index.html)

- `#viewTmDetail` 內 **`#tmXliffImportDialog`**：進階篩選同款欄位（搜尋／scope／正則／反轉／狀態／TM%／句段編號範圍）＋「原文須非空白」。
- 腳本順序：`xliff-tag-pipeline.js` → **`xliff-build-segments.js`** → `xliff-import.js` → **`xliff-to-tm.js`**。

### 4.4 建置

- 根目錄執行 **`npm run sync:cat`**，提交 `cat-tool/` 與 `public/cat/`。

---

## 5. 驗收清單

1. 標準 XLIFF 1.2／2：選檔 → Modal → 預設條件下可匯入預期筆數；調整「句段狀態／搜尋／句段編號」後結果與編輯器同款邏輯一致。
2. mqxliff／sdlxliff：篩選「鎖定／未鎖定」「已確認／未確認」與預期相符（不再依副檔名硬刪句）。
3. 同一次匯入重複 `key` 只保留一筆。
4. 解析後 0 候選 vs. 篩選後 0 筆：兩種 `alert` 文案不同。
5. 團隊模式：`bulkAddTMSegments` 後 TM 詳情重新整理可見新列。

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
| 2026-05-08 | §2.1：Modal 預設勾選（非空白、已確認、鎖定+未鎖定）、每次重置不記憶；原文非空白之補充檢查。 |
| 2026-05-08 | §4／§5：改為 `buildTmImportCandidates` + `#tmXliffImportDialog` + `evaluateSegment`／`segmentPassesSfRowRangePure`；廢止解析端硬編碼篩選。 |
