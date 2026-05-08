# CAT：Excel 匯出 `col_tgt` 字串型別導致譯文寫入錯誤欄位 — 開發紀錄（2026-05）

> 本文件目的：將「問題症狀、調查過程、根因、修正方案、驗收方式」寫成可追溯紀錄，方便日後維運或回頭查找。

---

## 問題症狀

- **使用者回報**：在 CAT 團隊模式下編輯 Excel 作業檔（`source+target` 格式），確認 CAT 編輯器畫面中所有譯文**顯示正確**，執行批次匯出（ZIP）後，解開的 `.xlsx` 檔案內容**與最初匯入的原始版本完全相同**，所有在 CAT 中修改過的譯文均未反映在輸出檔案中。
- **受影響功能**：批次匯出（`batchExportSelectedFiles`）及單檔匯出（Editor 內的「匯出」按鈕）的 **Excel 格式輸出**。
- **不受影響**：XLIFF、mqXLIFF、sdlXLIFF、PO、Google Sheet 格式的匯出；XLIFF 系列走獨立路徑，不經過 `excelApplyTranslatedSegmentsToWorkbook`。

---

## 調查過程

### 1. 確認 Supabase 資料正確

查詢 `cat_segments` 資料表，確認兩個受影響檔案（`d6dd523f-...` 與 `276c55c4-...`）：

| 指標 | 結果 |
|------|------|
| 全部句段狀態 | `confirmed`（670 / 1051 筆） |
| `segment_revision > 0` | 大多數句段（代表已透過 `updateSegmentTarget` 更新過） |
| `target_text` 抽樣 | 確認含有在 CAT 中改過的繁體詞（如 `透過`，而原始匯入值為 `通過`） |

→ **Supabase 資料正確**，問題出在「讀取正確→寫入錯誤」的中間環節。

### 2. 確認匯出檔案的目標欄內容

以 Node.js + SheetJS 讀取匯出的 xlsx 檔案，比對欄 C（`col_tgt = 2`）的實際儲存格值：

- **匯出 xlsx C2**：`通過`（原始匯入版本）
- **Supabase `target_text`**：`透過`（CAT 中已修改）

→ 匯出檔案**完全沒有反映 CAT 編輯內容**，等同原始匯入檔案被原封不動輸出。

### 3. 找出差異——`encode_cell` 的字串欄號行為

以下測試直接確認根因：

```js
XLSX.utils.encode_cell({ r: 1, c: 2 })    // → "C2"  ← 正確
XLSX.utils.encode_cell({ r: 1, c: "2" })  // → "U2"  ← 錯誤！
```

SheetJS 的 `encode_cell` 對 `c` 欄位沒有顯式型別強制：
- 傳入**數字** `2` → 正確計算為第 3 欄（欄 C，0-indexed）
- 傳入**字串** `"2"` → 字串參與 base-26 字元運算，最終對應到第 21 欄（**欄 U**）

此欄 U 在原始 xlsx 中不存在，`sheet_add_aoa` 的寫入被靜默忽略或寫入空白區域，**欄 C 的原始內容完全不被覆蓋**，因此輸出等同原始檔案。

### 4. 確認 `col_tgt` 的資料型別

查詢 Supabase：

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'cat_segments'
  AND column_name IN ('col_src', 'col_tgt', 'row_idx');
```

| 欄位 | 資料型別 |
|------|----------|
| `col_src` | `text` |
| `col_tgt` | `text` |
| `row_idx` | `integer` |

`col_tgt` 在 Postgres 中為 `text`，從 Supabase 取回後是 JavaScript 字串 `"2"`，而非數字 `2`。`row_idx` 為 `integer`，JSON 取回後仍是數字，所以列號（`r`）計算正確；欄號（`c`）則因型別而出錯。

### 5. 解釋為什麼離線模式不受影響

離線（Dexie IndexedDB）模式下：
- 匯入時 `colTgt` 由 JavaScript 陣列索引直接賦值，型別為數字
- Dexie 取回時同樣為數字
- → `encode_cell` 收到數字，行為正確

**只有在雲端（團隊）模式** 從 Supabase 取回句段時，`col_tgt` 才以字串回傳，觸發此 bug。

---

## 根因分析

```
匯入 Excel → col_tgt 存入 Supabase（text 型別） → 批次匯出讀回（字串 "2"）
        ↓
excelApplyTranslatedSegmentsToWorkbook
        ↓
XLSX.utils.encode_cell({ r: rowIdx, c: "2" })
        ↓
"U2"（欄 U，不存在）← 應為 "C2"（欄 C）
        ↓
sheet_add_aoa 寫入無效位置，欄 C 原始內容不動
        ↓
XLSX.write 輸出 → 等同原始匯入檔案
```

**直接原因**：`excelApplyTranslatedSegmentsToWorkbook` 在對 `encode_cell` 傳入 `c` 值時，未先轉為數字型別。  
**結構原因**：`col_tgt`（以及 `col_src`）欄位在 Postgres schema 設計為 `text`，而非 `integer`；從 Supabase JSON 取回後型別不同於離線模式，但程式碼未加以正規化。

---

## 修正方案

### 修改位置

**`cat-tool/app.js`** — `excelApplyTranslatedSegmentsToWorkbook` 函式（約第 6148 行）：

```js
// 修正前
const addr = XLSX.utils.encode_cell({ r: s.rowIdx, c: s.colTgt });

// 修正後
const addr = XLSX.utils.encode_cell({ r: s.rowIdx, c: Number(s.colTgt ?? 0) });
```

`Number(s.colTgt ?? 0)` 的型別安全說明：
- `s.colTgt = "2"` → `Number("2") = 2` ✓
- `s.colTgt = 2` → `Number(2) = 2` ✓（離線模式已是數字，無副作用）
- `s.colTgt = null` → `null ?? 0` → `Number(0) = 0`（fallback 至 A 欄，不崩潰）
- `s.colTgt = undefined` → `undefined ?? 0` → `Number(0) = 0`（同上）

此單一修正同時修復**批次匯出**與**單檔匯出**，因為兩者共用同一 `excelApplyTranslatedSegmentsToWorkbook` 函式。

### 未修改項目

- `row_idx` 為 `integer` 型別，取回後已是數字，不需轉換。
- `col_src` 在匯出路徑中未參與儲存格定址，暫不處理（匯入路徑亦與此 bug 無關）。
- Supabase schema 的 `col_tgt` / `col_src` 欄位型別維持 `text`，不進行 migration（改 DB 型別影響面大，且程式端加 `Number()` 轉換更可靠，可同時相容現有舊式字串資料）。

---

## 實作落點

> 變更已透過 `npm run sync:cat` 同步至 `public/cat/`；**單一來源仍為 `cat-tool/`**。

### 修改檔案

- [`cat-tool/app.js`](../cat-tool/app.js)（同步副本：[`public/cat/app.js`](../public/cat/app.js)）

### 版本控制

- **Commit**：`02ef3f4` — `fix(cat): Excel export colTgt string type writes to wrong column`

---

## 驗收清單（已回報成功）

1. 在 CAT 工具打開任意 Excel 格式的作業檔（`source+target` 格式），編輯並儲存至少一個譯文句段。
2. 回到專案檔案清單，勾選該檔案，點「匯出所選」下載 ZIP。
3. 解開 ZIP，以 Excel 開啟輸出檔。
4. 確認目標欄（`col_tgt` 對應的欄）中，**在 CAT 修改過的字串已反映在輸出檔**，而非顯示匯入時的原始內容。

---

## 延伸與未來注意

- **離線 ↔ 雲端型別差異**：除 `col_tgt` / `col_src` 外，若未來有其他整數語義欄位也以 `text` 儲存（例如 `row_idx` 若改為 `text`），應在讀回後一律以 `Number()` 正規化，避免 SheetJS 等不做隱式強制轉型的函式庫誤解。
- **此 bug 只影響雲端模式 Excel 匯出**：XLIFF／PO 格式不走 `encode_cell`，不受影響。Google Sheet 格式的匯出走 `aoa_to_sheet` 全重建路徑，也不受影響。
- **文件索引**：本檔為單次修正紀錄；若希望從 [`AGENTS.md`](../AGENTS.md) 主索引一鍵連入，可後續於「領域與深文件」區塊自行增列連結。

---

## 變更時間線

| 日期 | 事項 |
|------|------|
| 2026-05-08 | 使用者回報：批次匯出 Excel 結果與匯入原始版本相同，CAT 編輯未反映 |
| 2026-05-08 | 確認 Supabase `target_text` 資料正確；以 Node.js + SheetJS 比對匯出 xlsx，發現目標欄（C）仍為舊值 |
| 2026-05-08 | 確認 SheetJS `encode_cell` 對字串欄號的行為差異（`"2"` → U2 而非 C2） |
| 2026-05-08 | 確認 Supabase `col_tgt` 為 `text` 型別，為根因 |
| 2026-05-08 | 修正 `excelApplyTranslatedSegmentsToWorkbook`，加入 `Number()` 轉換；執行 `sync:cat`、提交 `02ef3f4`、推送 |
| 2026-05-08 | 使用者驗收成功；補本開發紀錄文件 |
