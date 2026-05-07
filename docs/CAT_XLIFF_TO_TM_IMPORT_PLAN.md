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
| 2026-05-09 | §8：補登完整開發過程、依賴順序、已知錯誤修復與驗收結果（產品驗收通過後入檔）。 |

---

## 8. 開發過程紀錄（完整）

本章記錄本功能從規格到上線驗收的實作脈絡，供日後維護或擴充（例如多組篩選群組）時對照。**程式真值**仍以 `cat-tool/` 原始碼為準。

### 8.1 規格來源與目標

- 內部計畫：**TM XLIFF 篩選匯入**——選 `.xliff`／`.xlf`／`.mqxliff`／`.sdlxliff` 後，先經與**編輯器進階篩選相同語意**的 UI，再寫入 TM；**不重複實作篩選規則**，改重用既有函式。
- **核心重用點**（皆在 [`cat-tool/app.js`](../cat-tool/app.js)）：
  - **`evaluateSegment`**：文字搜尋（含標籤展開後比對）、句段狀態六維、TM 相符度區間。
  - **`segmentPassesSfRowRangePure`**：句段編號範圍（顯示／排除、表達式），行為與 [`scripts/test-cat-sf-row-range.mjs`](../scripts/test-cat-sf-row-range.mjs) 一致。
- **刻意不做（第一版）**：編輯器 **`sfFilterGroups`** 多組條件 AND／OR 鏈；TM 匯入僅單一條件平面，降低複雜度。

### 8.2 架構：解析與篩選分離

| 階段 | 責任 | 主要檔案／符號 |
|------|------|----------------|
| 解析 | 自 XML 產出與編輯器相容的句段形狀（含 `sourceTags`／`targetTags`、`status`、`isLocked`、`matchValue` 等），**不在此階段**依 mq／sdl 產品規則硬刪句 | [`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) `buildSegmentsFromXliffXml` → `parseXliffFileToSegmentRows` |
| 組候選 | 每筆拆成 **`evalSeg`**（餵 `evaluateSegment`）與 **`tmPayload`**（餵 `bulkAddTMSegments`，形狀同 TMX 匯入列）；同 key 去重 | [`cat-tool/js/xliff-to-tm.js`](../cat-tool/js/xliff-to-tm.js) `buildTmImportCandidates` |
| 篩選 | 讀 Modal → `evaluateSegment(..., { sfMode: 'filter' })` → `segmentPassesSfRowRangePure(i, rowSpec)`；可選 **`tmImpRequireSrcNonEmpty`**（`sourceText.trim()`） | [`cat-tool/app.js`](../cat-tool/app.js) `buildTmImpUiCriteria`、`readTmImpAdvancedSpecFromDom`、`runTmXliffFilteredImport` |
| 寫入 | 與既有 TMX 相同 | `DBService.bulkAddTMSegments` 等 |

作業檔匯入 [`cat-tool/js/xliff-import.js`](../cat-tool/js/xliff-import.js) 改為呼叫 **`CatToolXliffBuildSegments.buildSegmentsFromXliffXml`**，與 TM 路徑共用同一段 trans-unit／unit 解析，避免兩套規則漂移。

### 8.3 `evaluateSegment` 注入 `sfMode`（必做原因）

編輯器內「不包含」（反轉）依 closure 內全域 **`sfMode`** 判定：僅在 **`sfMode === 'filter'`** 時對文字結果取反。TM 詳情頁使用者未必處於編輯器搜尋／篩選上下文，若不改會誤用當前 `sfMode`。

- **作法**：為 `evaluateSegment` 增加可選第八參數 **`evalOpts`**；若傳入 **`evalOpts.sfMode`**，反轉邏輯以該值為準（TM 匯入固定傳 **`'filter'`**），未傳入則維持既有行為，**不影響編輯器**。
- **正則**：TM Modal 自有「.*」按鈕狀態；**`isRegex` 以 criteria 傳入 `evaluateSegment`**，不依賴編輯器 DOM 上的 `sfUseRegexChecked`。

### 8.4 UI：`#tmXliffImportDialog` 與流程

- [`cat-tool/index.html`](../cat-tool/index.html) 於 **`#viewTmDetail`** 內新增 `<dialog id="tmXliffImportDialog">`：搜尋框、四 scope（原文／譯文／Key／額外）、正則、反轉、六個狀態 checkbox、TM%、句段編號範圍、**原文須非空白**。輸入框遵循 **`.form-input`**（見 [`.cursor/rules/ui-conventions.mdc`](../.cursor/rules/ui-conventions.mdc)）。
- **預設勾選**（產品已定案，見 §2.1）：`not_empty`、`confirmed`、`locked` **與** `unlocked` 同勾（鎖定維度等於不篩）；**每次開啟**呼叫 **`resetTmXliffImportDialogDefaults`**，**不**寫入 `localStorage`。
- **`tmImportInput`**：若副檔名為 XLIFF 系 → **暫存 `pendingTmXliffFile`** → 開 Modal → **`return`**（不立即解析）；確認後 **`runTmXliffFilteredImport`**。
- **錯誤文案區分**：**解析後無候選**（檔案空或無有效 TU）vs **篩選後無符合**（條件過嚴），避免使用者以為檔案損毀。

### 8.5 腳本載入順序（必須）

標籤 API **`window.CatToolXliffTags`**（[`xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)）須先於句段建構載入：

`xliff-tag-pipeline.js` → **`xliff-build-segments.js`** → `xliff-import.js` → **`xliff-to-tm.js`**

### 8.6 建置與同步

依 [`AGENTS.md`](../AGENTS.md)：修改 `cat-tool/` 後於專案根目錄執行 **`npm run sync:cat`**，使 [`public/cat/`](../public/cat/) 與內嵌路徑一致，並與 `cat-tool` **一併提交**。

### 8.7 實作過程中的錯誤與修復（mqxliff）

| 現象 | 原因 | 修復 |
|------|------|------|
| 匯入 mqxliff／sdlxliff 單段路徑時 **`ReferenceError: Xliff is not defined`**（或大小寫類似訊息） | [`buildSegmentsFromXliffXml`](../cat-tool/js/xliff-build-segments.js) 在 XLIFF 1.2／mqxliff／sdl 分支內呼叫 **`Xliff.extractTaggedText`**，但函式開頭未宣告 **`const Xliff = global.CatToolXliffTags`**；僅 **`buildXliff2SegmentRows`** 內曾宣告，故 XLIFF 2 路徑正常、其餘副檔名會炸 | 在 **`buildSegmentsFromXliffXml` 開頭**補上與 XLIFF 2 相同之模組檢查與 `Xliff` 綁定；缺模組時拋出與其他入口一致之錯誤訊息 |

修復後再以實際 **mqxliff**（例如 memoQ 匯出檔）於 TM 詳情走 Modal 匯入，可正常解析並進入篩選。

### 8.8 版本對照（Git）

以下為 **main** 上與本功能直接相關之提交訊息，便於 `git show`／blame；若日後 rebase／squash，請以訊息關鍵字搜尋。

| 類型 | 訊息關鍵字（約） |
|------|------------------|
| 功能主體 | `feat(cat): TM XLIFF import dialog shares editor filter semantics`（Modal、`evaluateSegment` 注入、`buildTmImportCandidates`、`xliff-build-segments`、文件與 `sync:cat`） |
| mqxliff 修復 | `fix(cat): define CatToolXliffTags scope in buildSegmentsFromXliffXml for mqxliff/sdl path` |

### 8.9 驗收結果

- **產品驗收**：已通過（含實際 mqxliff 匯入、篩選條件與預設行為符合 §2.1／§5）。
- 後續若擴充 **多組篩選群組**，建議另開規格小節，並評估是否共用 `sfFilterGroups` 序列化格式與 `evaluateSegmentWithGroupRow` 之路徑。
