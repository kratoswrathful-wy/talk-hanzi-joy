# CAT：系統跳焦點一律即時捲動（移除 smooth 動畫）— 開發紀錄（2026-06）

> 本文件目的：將「問題症狀、與 2026-05 捲動修正的關係、實作落點、驗收方式」寫成可追溯紀錄，方便日後維運或回頭查找。

---

## 背景與需求緣起

- **使用者回報**：清除篩選條件後跳回特定列、搜尋導覽、確認句段跳行等情境，畫面會從頂部或遠處**平滑捲動**到目標列，體感像「從頭捲下來」，干擾編輯節奏。
- **需求**：每當系統要把焦點移到特定列時，**永遠直接跳到定點**，不要動畫。
- **與先前修正的關係**：
  - 2026-05-08（[小型改動—句段集名稱與捲動行為](9ba56648-f9f0-41f7-9a5a-9e4f0076e76e)）已修「批次確認後整表重建時從頂部捲動」：重建前儲存 `scrollTop`、重建後還原，並在該路徑傳入 `behavior: 'instant'`（commit `fb715d1`）。
  - 2026-05-08（[`CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md`](./CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md)）已修「確認跳行置中被 `focus()` 蓋掉」：`focus({ preventScroll: true })` + 下一 frame `scrollIntoView(center)`（commit `bb324d2`）。
  - **本次**：上述僅覆蓋部分路徑；其餘 `scrollIntoView` 仍使用 `behavior: 'smooth'`，故使用者仍會在其他跳焦點情境看到動畫。

---

## 影響範圍

| 情境 | 觸發點（約略） |
|------|----------------|
| 確認句段後跳下一列 | `focusTargetEditorAtSegmentIndex`（預設參數） |
| 批次確認後整表重建跳焦點 | 同上（原 `'instant'`，統一為 `'auto'`） |
| 清除／套用篩選後跳回已編輯列 | `runSearchAndFilter` 收尾、`applyFilterPreset` |
| 搜尋 F3／Shift+F3 導覽 | `applySearchMatchNavigationFocus` |
| Ctrl+↑／↓ 跳可見句譯文開頭 | `focusTargetEditorStartAtGlobalIndex` |
| QA 結果「跳到句段」 | `_qaJumpToSegment` |
| 假游標／真游標提示恢復焦點 | [`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js) |
| 術語庫／Excel 匯入錯誤訊息捲動 | 精靈錯誤區 `scrollIntoView` |
| 新增私人筆記／待辦後捲到新項目 | 私人筆記列表 |

**不變**：`catToolAfterConfirmScrollBlock` 設定（`center`／`nearest`）仍決定「置中」或「僅捲到可見」；本次只改**有無動畫**，不改置中邏輯。

---

## 方案決策

### 採用方案

將所有系統主動跳焦點的 `scrollIntoView` **`behavior` 統一為 `'auto'`**（瀏覽器預設，無平滑動畫）。

- `focusTargetEditorAtSegmentIndex` 預設參數：`'smooth'` → `'auto'`
- 搜尋導覽：移除「相鄰命中超過 80 列才切 `auto`」的 workaround，固定 `const behavior = 'auto'`
- 其餘寫死 `behavior: 'smooth'` 的呼叫點：全部改為 `'auto'`

### 未採用

- 僅改「清除篩選」單一路徑：無法涵蓋搜尋、QA、假游標等其餘觸發點。
- 改用 CSS `scroll-behavior: auto` 全域覆寫：無法涵蓋 `scrollIntoView` 的 `behavior` 參數，且可能影響使用者手動捲動體感。

---

## 實作落點（已完成）

> 單一來源仍為 `cat-tool/`；變更後以 `npm run sync:cat` 同步至 `public/cat/`。

### 修改檔案

- [`cat-tool/app.js`](../cat-tool/app.js)（同步副本：[`public/cat/app.js`](../public/cat/app.js)）
- [`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)（同步副本：[`public/cat/js/cat-fake-caret.js`](../public/cat/js/cat-fake-caret.js)）

### 主要修改點

| 函式／區塊 | 變更 |
|------------|------|
| `focusTargetEditorAtSegmentIndex` | 預設 `scrollBehavior = 'auto'` |
| `applySearchMatchNavigationFocus` | 固定 `behavior = 'auto'`（移除 80 列門檻） |
| `runSearchAndFilter` 篩選後跳回列 | `behavior: 'auto'` |
| `focusTargetEditorStartAtGlobalIndex` | `behavior: 'auto'` |
| `applyFilterPreset` 跳回目標列 | `behavior: 'auto'` |
| `_qaJumpToSegment` | `behavior: 'auto'` |
| 術語庫／Excel 錯誤、`privateNotes` 新增後捲動 | `behavior: 'auto'` |
| `cat-fake-caret.js` 恢復焦點時 `scrollIntoView` | 3 處 `behavior: 'auto'` |

---

## 驗收清單

1. 開啟句段較多的作業檔，套用篩選後**清除篩選**：畫面直接跳到目標列，無從頂部慢慢捲下來。
2. **Ctrl+Enter** 確認句段跳下一列：目標列瞬間到位（置中或 nearest 依設定）。
3. 搜尋關鍵字後按 **F3**／**Shift+F3**：每次跳轉無平滑動畫。
4. QA 執行後點「跳到句段」：直接顯示該列。
5. 假游標提示點擊恢復焦點：捲動無動畫。

---

## 驗收紀錄

| 項目 | 內容 |
|------|------|
| 驗收日 | 2026-06-10 |
| 驗收結果 | **通過**（產品端確認：清除篩選跳回、確認跳行、搜尋導覽等情境皆為即時到位，無從頭平滑捲動） |
| 程式 commit | `5b5aa3d` |
| 文件 commit | `b9ee63c`（初版開發紀錄）；本節驗收紀錄於後續補登 |

---

## 版本控制

- **程式 Commit**：`5b5aa3d` — `fix(cat): 系統跳焦點一律即時捲動，移除所有 smooth 動畫`
- **文件 Commit**：`b9ee63c` — `docs(cat): 記錄系統跳焦點即時捲動修正（5b5aa3d）`
- **同步**：已執行 `npm run sync:cat`，同步到 `public/cat/`

---

## 延伸與維護邊界

- 日後新增「系統主動跳焦點」路徑時，**預設應使用 `behavior: 'auto'`**；若需置中／nearest，沿用 `getAfterConfirmScrollBlock()`，勿再引入 `smooth`。
- 與置中修正的關係見 [`CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md`](./CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md)；與批次確認重建防從頭捲見 2026-05-08 對話紀錄（commit `fb715d1`）。

---

## 變更時間線

| 日期（約） | 事項 |
|------------|------|
| 2026-06-09 | 使用者回報清除篩選等情境仍有平滑捲動；對照 2026-05 僅部分路徑已修 |
| 2026-06-09 | 規劃並實作：全專案 `scrollIntoView` 系統跳焦點路徑改 `behavior: 'auto'` |
| 2026-06-09 | 初版開發紀錄與索引（`AGENTS.md`、`CODEMAP.md`、[`CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md`](./CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md) 交叉引用）— commit `b9ee63c` |
| 2026-06-10 | 產品端驗收通過；補「驗收紀錄」章節 |
