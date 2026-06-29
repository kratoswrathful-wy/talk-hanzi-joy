# CAT 編輯器術語即時同步與編輯器內改刪

**日期**：2026-06  
**狀態**：已實作  
**程式觸點**：[`cat-tool/app.js`](../cat-tool/app.js)

## 背景

編輯器右欄比對、原文 TB 底線／上標、QA 術語檢查皆讀記憶體快取 **`window.ActiveTbTerms`**（開檔時自 DB 載入）。先前僅「編輯器內新增術語」會更新快取並重畫 UI；術語庫管理頁的修改／刪除只寫 DB，導致譯者須關檔重開才看得到變更。

## 白話說明

| 操作 | 先前行為 | 修正後 |
|------|----------|--------|
| 編輯器「新增術語」 | 寫 DB + 快取 push + 重畫 | 寫 DB + **全量 rebuild 快取** + 重畫 |
| 術語庫頁改／刪 | 只寫 DB | 寫 DB + **rebuild 快取** + 重畫（若編輯器仍開啟） |
| 編輯器 footer | 僅隱藏 | 寫入目標 TB 可 **編輯／刪除** |

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

- 條件：`entry.tbId === ActiveWriteTb`、有 `termNumber`、非唯讀（`_viewEditorReadOnly`）。
- 每段 metadata 下方：**編輯術語**、**刪除此術語**；整列底部保留 **將此術語隱藏**。
- 複用 `tbTermEditModal`；自 footer 開啟時儲存後自動切回 CAT 分頁並還原焦點。

## 驗收步驟（白話）

1. 開檔編輯中，到術語庫頁修改某術語譯文 → 回編輯器點同句段，右欄與原文提示**立即**更新。
2. 術語庫頁刪除術語 → 右欄該列與原文底線消失。
3. 右欄選 writeTb 術語 → footer **編輯術語** → 改精確比對等 → 儲存後比對即時更新。
4. **刪除此術語** 需確認；刪除後比對消失。
5. 線上擷取 TB、唯讀模式：無編輯／刪除；隱藏仍可用。

## 維護邊界

- 工作階段隱藏 key 為 `原文\x00譯文`；改原文／譯文後舊 key 可能殘留（待 follow-up 清理）。
- 修改後須 `npm run sync:cat` 並提交 `cat-tool/` 與 `public/cat/`。
