# CAT 編輯器術語即時同步與編輯器內改刪

**日期**：2026-06  
**狀態**：**已驗收**（即時同步 `bf5beaa`；footer 底列改刪隱藏與團隊版 UUID 熱修 `22ba4b1`；2026-06-29 團隊版驗收通過）  
**程式觸點**：[`cat-tool/app.js`](../cat-tool/app.js)

## 背景

編輯器右欄比對、原文 TB 底線／上標、QA 術語檢查皆讀記憶體快取 **`window.ActiveTbTerms`**（開檔時自 DB 載入）。先前僅「編輯器內新增術語」會更新快取並重畫 UI；術語庫管理頁的修改／刪除只寫 DB，導致譯者須關檔重開才看得到變更。

## 白話說明

| 操作 | 先前行為 | 修正後 |
|------|----------|--------|
| 編輯器「新增術語」 | 寫 DB + 快取 push + 重畫 | 寫 DB + **全量 rebuild 快取** + 重畫 |
| 術語庫頁改／刪 | 只寫 DB | 寫 DB + **rebuild 快取** + 重畫（若編輯器仍開啟） |
| 編輯器 footer | 僅隱藏 | 寫入目標 TB 可 **編輯／刪除**（底列並排） |

## 技術方案

### `rebuildActiveTbTermsFromProject`

- 依 `ActiveReadTbIds` 自 DB 重填 `ActiveTbTerms`（含 `termNumber`、`tabId`／`tabName`）。
- `ActiveWriteTb` 若不在 read 列表，僅補 `ActiveTbNames`（與開檔邏輯一致）。

### `refreshEditorTbUiAfterTermsChange`

- 僅在 `currentFileId` 有值（編輯器開啟）時執行。
- 呼叫 rebuild 後沿用 `refreshTbMatchUiAfterHideChange()`（`scheduleRenderLiveTmMatches` + `decorateTbInlineHintsForActiveRow`）。

### 觸發點

- `submitNewTermFromForm`
- `btnSaveTbTermEdit`／`btnTbDeleteSelected`
- TB Excel／線上分頁匯入寫入 DB 後
- `catEditTbTermFromFooter`／`catDeleteTbTermFromFooter` 完成後

### 編輯器 footer 改刪 UI

- 條件：`entry.tbId === ActiveWriteTb`、有 `termNumber`、非唯讀（`_viewEditorReadOnly`）；`ActiveWriteTb` 為線上擷取 TB 時開檔即為 `null`，不顯示編輯／刪除。
- **底列並排**：**編輯**、**刪除**（僅寫入目標 TB）、**隱藏**（一律顯示；按鈕內 `?` 裝飾，`data-tip` 掛整顆按鈕）。
- 合併列取 `allTbEntries` 中**第一筆可寫入**者之 `tbId` + `termNumber`。
- 點擊經 `#liveFooterContent` **事件委派**（`data-tb-id`／`data-term-number`），**不使用 inline `onclick`**（團隊版 UUID 相容）。
- 複用 `tbTermEditModal`；自 footer 開啟時儲存後自動切回 CAT 分頁並還原焦點。

## 除錯紀錄：團隊版編輯／刪除無反應

- **症狀**：點「編輯術語」「刪除此術語」無 Modal／確認框；主控台 `Uncaught SyntaxError: Invalid or unexpected token`（`index.html:1:25`）。
- **根因**：footer 按鈕 inline `onclick="catEditTbTermFromFooter(${entry.tbId}, …)"` 未為 **UUID 字串**加引號，瀏覽器將 `-` 解析為非法語法。本機 Dexie 數字 ID 不易重現。
- **修正**：移除 inline `onclick`；改 `data-tb-id` + `initLiveFooterTbActionDelegation`；按鈕文案與佈局一併調整為底列 **編輯／刪除／隱藏**。

## 驗收步驟（白話）

**狀態**：下列 1～6 項均已驗收（含 2026-06-29 **團隊版** footer 底列編輯／刪除／隱藏）。

1. 開檔編輯中，到術語庫頁修改某術語譯文 → 回編輯器點同句段，右欄與原文提示**立即**更新。
2. 術語庫頁刪除術語 → 右欄該列與原文底線消失。
3. **團隊版**：右欄選 writeTb 術語 → footer 底列 **編輯** → 跳出 Modal；主控台**無** SyntaxError。
4. **團隊版**：點 **刪除** → 確認對話框。
5. 游標移上 **隱藏** 按鈕（含 `?`）→ 黑色無延遲 tooltip。
6. 線上擷取 TB、唯讀模式：無編輯／刪除；隱藏仍可用。

## 開發與驗收時序（本對話脈絡）

本節記錄 2026-06 末同一對話內，由 TB 比對 UI 微調一路至 footer 熱修驗收之完整歷程。右欄合併／隱藏等前置規格見 [`CAT_TB_DEDUP_AND_SUPPRESS_2026-06.md`](CAT_TB_DEDUP_AND_SUPPRESS_2026-06.md)。

| 階段 | commit | 內容 | 驗收 |
|------|--------|------|------|
| 1 | `6261102` | 右欄合併列「N 筆命中」、移除黃底附加列；footer 精確比對改圈問號 `?` tooltip | 通過 |
| 2 | `bf5beaa` | `rebuildActiveTbTermsFromProject`／`refreshEditorTbUiAfterTermsChange`；術語庫頁改刪後編輯器即時更新；footer 初版「編輯術語／刪除此術語／將此術語隱藏」 | 通過（本機／一般路徑） |
| 3 | — | **團隊版回報**：點 footer 編輯／刪除無反應；主控台 `SyntaxError: Invalid or unexpected token` | 待修 |
| 4 | `22ba4b1` | 根因：inline `onclick` 內 UUID `tbId` 未加引號；改 `data-tb-id` + `#liveFooterContent` 事件委派；底列並排 **編輯／刪除／隱藏 ?**；線上 TB toast 提示 | 推送 |
| 5 | `2a3ef92` | 文件補 commit 編號 | — |
| 6 | — | **團隊版驗收**：編輯開 Modal、刪除出確認框、隱藏 tooltip、主控台無 SyntaxError | **通過** |

### 對話內決策與備註

- **permission 誤命中 Sion**：屬術語比對規則（建議對該條開啟精確比對 `wholeWord: true`），非 footer UI 缺陷。
- **Card／card 誤壓制**（`1304299`）：子字串壓制須嚴格區分大小寫，與本 footer 熱修無關但同對話前期已修。
- **隱藏**按鈕不受 UUID 問題影響（原即無參數 `onclick`），熱修後與編輯／刪除併入同一底列。

## 維護邊界

- 工作階段隱藏 key 為 `原文\x00譯文`；改原文／譯文後舊 key 可能殘留（待 follow-up 清理）。
- 修改後須 `npm run sync:cat` 並提交 `cat-tool/` 與 `public/cat/`。
