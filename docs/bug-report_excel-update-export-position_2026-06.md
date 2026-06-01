# Bug Report：Excel 更新作業檔後匯出譯文錯列（rowIdx keep 短路）

> **建立**：2026-06-02  
> **狀態**：**已修**（待部署後使用者再跑一次「更新作業檔」驗收）  
> **相關**：[`bug-report_team-large-file-editor-stuck-loading_2026-05-26.md`](./bug-report_team-large-file-editor-stuck-loading_2026-05-26.md) §2.11（歷史 orphan／底稿替換）、[`CAT_EXCEL_EXPORT_COLTGT_STRING_BUG_2026-05.md`](./CAT_EXCEL_EXPORT_COLTGT_STRING_BUG_2026-05.md)（寫錯**欄**）

---

## 1. 症狀

- CAT 編輯器內原文／譯文**顯示正確**（依 String Key 比對）。
- 執行「匯出檔案」後，Excel **F 欄（譯文）與對應列原文錯位**——譯文出現在錯誤的列上。
- 使用者以新版底稿執行「**更新作業檔**」（譯文欄可空白以保留 CAT 譯文）後再匯出，**問題仍存在**。
- 確認視窗範例：`保留 1841`／`更新 4082`／`新增 0`／`刪除 0`；**同一底稿再跑一次**，數字幾乎不變。

---

## 2. 時間軸

| 日期 | 事項 |
|------|------|
| 2026-05-26 | 初次匯入 `…132851.xlsx`；團隊版 Storage orphan 導致底稿與 `rowIdx` 失步（見 team bug §2.11） |
| 2026-05-08 | `colTgt` 字串型別導致寫錯**欄**已修（`02ef3f4`）；與本 bug（寫錯**列**）不同 |
| 2026-06-02 | `52afb0b`：`mergeSegments` update 路徑補 `rowIdx/colTgt`；migration `20260602120000` 讓 batch patch 可寫位置欄位 |
| 2026-06-02 | 使用者以 `…21619.xlsx` 更新後匯出仍錯位 → 發現 **keep 短路**與 **假陽性更新** 根因 |
| 2026-06-02 | 本輪修正：`segmentsContentEqual`／`segmentPositionEqual`／position-only patch |

---

## 3. 根因

### 3.1 `keep` 短路未同步位置（約 1841 句）

[`cat-tool/js/file-update.js`](../cat-tool/js/file-update.js) 舊版 `segmentsFullyEqual` 只比對原文／譯文／Key 等**內容**，不比對 `rowIdx`、`colTgt`、`colSrc`、`sheetName`。

內容相同 → `keep` → **直接 `continue`，不寫 DB** → 匯出時底稿已是新版 Excel，但句段仍指向舊列號。

### 3.2 假陽性「更新」（約 4082 句）

Excel 解析句段固定 `status: 'unconfirmed'`（[`cat-tool/app.js`](../cat-tool/app.js) `extractSegmentIntoBackup`），且**不帶** `globalId`。

舊版 `segmentsFullyEqual` 比對 `status` 與 `globalId`：

| 欄位 | DB | incoming | 結果 |
|------|-----|----------|------|
| `status` | `confirmed` | `unconfirmed` | 永遠不相等 |
| `globalId` | `4014` | `null` | 永遠不相等 |

→ 已確認句段每次更新都進 `update`，統計虛高；同一檔重跑仍顯示「更新四千句」**不代表內容真的變了**。

### 3.3 與 `52afb0b` 的關係

`52afb0b` 只在 **update** 路徑 patch 位置欄位；**無法修正走 keep 的句段**。且若使用者更新時前端已新、RPC migration 未部署，update 路徑的位置 patch 也不會寫入 DB。

---

## 4. 修正方案（已實作）

### 4.1 [`cat-tool/js/file-update.js`](../cat-tool/js/file-update.js)

- **`segmentsContentEqual`**：比對內容欄位；**不比對** incoming 的 `status`／`globalId`。
- **`segmentPositionEqual`**：比對 `rowIdx`、`colSrc`、`colTgt`、`sheetName`。
- **`buildPositionPatch`**：僅位置欄位（含 `baseRprXml`，Dexie 用）。
- **分流**：
  - 內容相同且位置相同 → `keep`
  - 內容相同但位置不同 → **position-only update**（**不含** `targetText`，避免 bump `segment_revision`）
  - 內容有變 → 完整 update（含位置）
- **`stats.updatedPositionOnly`**：供確認視窗顯示「位置同步（內容不變）：N 句」。

### 4.2 [`cat-tool/app.js`](../cat-tool/app.js)

- `fileUpdatePositionSyncLine(stats)`；更新確認／完成摘要四處引用。

### 4.3 不需再改

- [`cat-tool/db.js`](../cat-tool/db.js) `refreshFileSegments`（已接受位置欄位）
- [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)（已映射 `row_idx` 等）
- [`supabase/migrations/20260602120000_cat_segments_batch_patch_position.sql`](../supabase/migrations/20260602120000_cat_segments_batch_patch_position.sql)

---

## 5. 與 colTgt 字串 bug 的區別

| 項目 | [`CAT_EXCEL_EXPORT_COLTGT_STRING_BUG_2026-05.md`](./CAT_EXCEL_EXPORT_COLTGT_STRING_BUG_2026-05.md) | 本 bug |
|------|---------------------------------------------------------------------------------------------------|--------|
| 現象 | 譯文完全沒寫入目標欄（仍為匯入舊值） | 譯文有寫入，但在**錯誤的列** |
| 根因 | `colTgt` 字串 `"2"` → SheetJS 寫到 U 欄 | `rowIdx` 未隨更新作業檔同步 |
| 修正 | `Number(s.colTgt ?? 0)` | `mergeSegments` 位置同步 |

---

## 6. 驗收步驟（白話）

1. 部署含本修正的 commit 至正式站。
2. 開啟受影響的 Excel 作業檔（例如 `…132851.xlsx`）。
3. **再跑一次「更新作業檔」**，上傳正確底稿（譯文欄可空白）；**欄位設定須與初次匯入一致**（起始列、原文欄、譯文欄、Key 欄）。
4. 確認視窗預期：
   - 第一次（位置曾錯）：可能顯示「**位置同步（內容不變）：N 句**」。
   - **同一檔再跑一次**：「保留」應接近總句數，「更新」應接近 0。
5. 匯出 → 用 Key 搜尋 3～5 句，確認 F 欄譯文與同列原文對應。

---

## 7. 維運注意

- CAT **尚未**持久化 Excel 匯入欄位設定；更新作業檔時須手動填與初次匯入相同的精靈設定。
- 歷史已錯位的 DB **不會**自動修復；須在修正部署後**再跑一次更新作業檔**。

---

## 8. 程式觸點速查

| 符號 | 檔案 |
|------|------|
| `mergeSegments`、`segmentsContentEqual`、`segmentPositionEqual` | [`cat-tool/js/file-update.js`](../cat-tool/js/file-update.js) |
| `excelApplyTranslatedSegmentsToWorkbook` | [`cat-tool/app.js`](../cat-tool/app.js) |
| `db.refreshFileSegments` | [`cat-tool/db.js`](../cat-tool/db.js)、[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) |
| `apply_cat_segments_patch_batch` | [`supabase/migrations/20260602120000_cat_segments_batch_patch_position.sql`](../supabase/migrations/20260602120000_cat_segments_batch_patch_position.sql) |
