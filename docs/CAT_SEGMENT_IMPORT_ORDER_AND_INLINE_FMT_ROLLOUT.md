# CAT：句段匯入順序修正與「行內字型」上架嘗試紀錄

> 摘要：本篇記錄兩件事——（一）句段如何依「匯入當下掃描順序」穩定顯示並與更新作業檔／雲端一致；（二）譯文行內格式（俗稱字體／粗斜體等，`rt-fmt`）嘗試上線後遇到的問題與調查結論，以及已撤回版本的事實紀錄。  
> 驗收：句段順序調整已由產品方手動驗收通過（2026-05）。

---

## 一、句段依匯入順序排序（已落地）

### 1.1 問題背景

Excel 多工作表、多組原文／譯文欄匯入時，**匯入迴圈**（`_importSingleExcelFile`）已依精靈選項產生正確的暫存順序，並為每句賦予 **`globalId`（1 起算）**。但讀取時 **`getSegmentsByFile` 僅依 `rowIdx` 排序**：同一列若對應多欄或多分頁片段，列號無法區分先後，**清單順序與匯入掃描順序不一致**。  
句段集建立與開啟亦曾以 `rowIdx` 為檔內第二排序鍵，加重此現象。

### 1.2 解法概要

- **語意**：列表預設順序＝**有 `globalId` 時依其遞增**；舊資料無此欄時，再以 **`rowIdx` → `sheetName` → `colSrc` → `id`** 做穩定次要排序（舊檔不重算、不強制回填）。
- **雲端持久化**：`public.cat_segments` 新增可空 **`global_id`**（migration：`supabase/migrations/20260507120000_cat_segments_global_id.sql`），新匯入與 **`refreshFileSegments` 插入**會寫入；**更新作業檔**若比對到同一句，將新版掃描的 `globalId` 寫回。
- **團隊 RPC**（[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)）：`mapSegmentRow` 帶出 `globalId`；`addSegments`／`refreshFileSegments`（insert/update）讀寫 `global_id`；`getSegmentsByFile`／`getSegmentsByFileForPreview` 對每檔取回資料後以與本機相同的比較器排序。
- **本機 Dexie**（[`cat-tool/db.js`](../cat-tool/db.js)）：`sortSegmentsByImportOrder`；`getSegmentsByFile`、`getSegmentsByFileForPreview`、`refreshFileSegments`（patch 含 `globalId`）對齊。
- **更新作業檔合併**（[`cat-tool/js/file-update.js`](../cat-tool/js/file-update.js)）：`mergeSegments` 在 update 時帶入 **`patch.globalId`**；`segmentsFullyEqual` 納入 `globalId`，避免「只改順序」卻被判成無變動。
- **句段集 UI**（[`cat-tool/app.js`](../cat-tool/app.js)）：`_cmpSegmentImportOrderWithinFile`；建立句段集與 `openEditorFromView` 組裝清單時，檔內第二鍵改為與 DB 一致的匯入序。

### 1.3 維運與版本

| 項目 | 說明 |
|------|------|
| 代表性 commit | `d7ada85`（`feat(cat): 句段依匯入順序排序（globalId／global_id）與更新檔案同步`） |
| 資料庫 | 須對 Supabase／目標環境執行 migration（CLI：`supabase db push`），否則團隊模式寫入 `global_id` 可能失敗 |
| CAT 資產 | 變更後依慣例 `npm run sync:cat`，提交 `cat-tool/` 與 `public/cat/` |

### 1.4 驗收要點（手動）

- 多工作表、雙欄對、多列之 Excel：**由上往下／由左到右**各匯入一次，開檔左欄序號／列順序須符合精靈掃描預期。
- **更新作業檔**後重開同一檔，順序須與新版檔案掃描一致。
- 團隊模式：資料庫已套用 `global_id` 欄位後重測同案例。

---

## 二、行內字型／格式渲染（rt-fmt）上架嘗試（已撤回）

### 2.1 時序與處置

| 項目 | 說明 |
|------|------|
| 上線 commit | `67d64c3` —「行內格式字型渲染（rt-fmt）與譯文插入」 |
| 撤回方式 | `c72b320` 對 `67d64c3` 做 **git revert**，程式樹回到 **`a1cec83`** 同期內容（歷史仍保留曾有該功能的紀錄） |
| 原規格檔 | 該 wave 附帶的 `docs/CAT_INLINE_FORMATTING_SPEC.md` **隨 revert 自 main 移除**；若重做功能可自歷史還原參考 |

**白話**：曾短暫上架「譯文裡直接看成粗體／斜體等」的版本，後因問題面較廣決定整包撤回，現行 CAT 不包含該 UI／行為。

### 2.2 遭遇問題與調查結論（產品可讀）

1. **Excel 有些列「像沒進 CAT」**  
   - **調查**：匯入條件為「鎖定列 **或** 原文欄 trim 後非空」才建立句段；原文空、譯文有字的列會整列跳過。

2. **句段順序與預期不符（多欄／多分頁）**  
   - **調查**：與本文件**第一節**相同根因——讀取端以 **`rowIdx` 為主排序**不足以還原多欄掃描順序。**已在撤回後另行以 `globalId`／`global_id` 修正**（與 rt-fmt 無依賴）。

3. **Excel 匯出後字型／Rich Text 不見、或出現 `{1}` 這類符號**  
   - **調查**：匯出路徑以「二維陣列＋格值」重建工作表，**未**把 `{N}` 與 tag 資料還原成儲存格 Rich Text；程式庫側曾具備 **`buildRichTextXml` 類能力**但未接在該匯出分支。**屬獨立於 rt-fmt 的匯出走線**，後續若重做格式顯示，匯出仍須另行接軌。

4. **搜尋「明明畫面上有却搜不到」、篩選後整表空白、符合筆數 0／0**  
   - **調查**：搜尋對象是記憶體中的 `sourceText`／`targetText`（含 `{N}` 佔位與 tag 擴展示），簡繁與字面須對得上；篩選模式會 **display:none** 不符合列，無符合時看起來像沒資料。  
   - **與 rt-fmt 疊加時**：DOM 拆成 **`rt-fmt` span、`mark` 高亮**，若「攤平文字長度」與後端字串不一致，程式會略過高亮，出現 **0／0** 或與篩選結果觀感不同步。**譯文疊字**亦與 **contenteditable + mark + 行內 span** 的邊界有關。

5. **部分 tag 仍是藥丸、未變成行內樣式**  
   - **調查**：**設計使然**——無 `ctype`／無法推斷 `fmt` 的標籤維持藥丸，避免誤把結構標籤當格式。

6. **從 Word 等貼上的格式不完整**  
   - **調查**：CAT 提取路徑以 **`rt-tag`／自產結構** 為準；外部 HTML **不自動**對應佔位系統。

7. **緊急關閉開關（僅適用曾有該版程式時）**  
   - 撤回前：`INLINE_FMT_RENDER = false` 可關閉行內渲染；現行 **main** 已無該 feature commit，無需操作。

### 2.3 後續產品／技術方向（備忘）

- 若再行「只做 Excel」「或縮小範圍」的格式／匯入實驗：建議從 **`a1cec83`／revert 後之 main** 起分支，並**另文件**對齊匯出 Rich Text、`mergeSegments` 鍵、`globalId` 已存在的事實。  
- 舊專案的句段集 **`segment_ids` 順序**：匯入序修正後**新建**的句段集會較準；既有句段集若要重排須另行產品決策。

---

## 三、索引

| 想找什麼 | 去哪裡 |
|----------|--------|
| 路徑對照總表 | [`CODEMAP.md`](./CODEMAP.md)（CAT 一節已列本主題連結） |
| CAT 單一來源與 sync | [`AGENTS.md`](../AGENTS.md)、[`cat-tool/README.md`](../cat-tool/README.md) |
