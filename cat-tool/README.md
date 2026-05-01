# CAT 工具（內嵌於 1UP TMS）

此目錄為 **Vanilla JS + IndexedDB** 的 CAT 編輯器靜態資產來源，與 TMS 的 React 程式碼（`src/`）分開維護，便於日後獨立授權或對外釋出。

## 與 TMS 的銜接

- **批次匯入作業檔精靈**（多選、mqxliff 角色、Excel 欄位、進度）：構想與驗收備忘見 [`docs/CAT_BATCH_IMPORT_WIZARD_SESSION.md`](../docs/CAT_BATCH_IMPORT_WIZARD_SESSION.md)。
- 開發／建置前執行：`npm run sync:cat`，會將本目錄複製到 `public/cat/`。
- 使用者由 TMS 側欄進入路由 **`/cat`**，主畫面以 iframe 載入 **`/cat/index.html`**。
- 整合決策與後續 API 方向見專案根目錄 [`docs/CAT 轉移.md`](../docs/CAT%20%E8%BD%89%E7%A7%BB.md)。

## 更新資產

若你在外部儲存庫維護完整 CAT 專案，請將執行所需檔案同步至此目錄（至少包含 `index.html`、`app.js`、`db.js`、`style.css`、`js/`、`lib/`），再執行 `npm run sync:cat` 並提交變更。

## 風險與單一來源

- **`public/cat/` 不是第二套原始碼**：專案根的 `scripts/sync-cat.mjs` 會刪除整個 `public/cat` 再從本目錄複製。只手改 `public/cat` 而未回寫此處的變更，在下次 `npm run sync:cat` 或 CI `prebuild` 時**會被覆寫**。
- **建議提交流程**：只在此目錄與關聯靜態檔修改 → 在專案根執行 `npm run sync:cat` → 提交**本目錄**與 **`public/cat` 的變更**一併入庫。正式建置已透過 `prebuild` 自動 sync。更多捷徑見專案根目錄 [`AGENTS.md`](../AGENTS.md)。

## 防殘影與深連結載入（維運備忘）

- **驗收**：此批行為經手動驗收狀況良好；細項與已知後續風險（父頁／iframe 網址不同步）見 [`docs/HANDOFF.md`](../docs/HANDOFF.md)。
- **同一 view 內換 id**：導向詳情／編輯器時應在 **await DB 前**清空列表或顯示「載入中」，並先切到目標 `view-section`，避免上一筆 DOM 殘留。實作集中於 `app.js` 內 `beginOpenProjectDetailLoading` 等 helper。
- **深連結**：`index.html` 的 `#catMainRouteLoading` 供首屏顯示；`app.js` 於路由還原結束後務必隱藏（`hideCatMainRouteLoadingEl`），詳見 [`docs/HANDOFF.md`](../docs/HANDOFF.md)「CAT：防殘影、深連結載入」。
- **TMS 嵌入**：若父頁網址已變而 iframe 仍舊內容，屬 **CatToolPage** 與 iframe URL／`postMessage` 同步議題，不在此目錄單獨修；見 `HANDOFF.md`「已知後續風險」。

## 下拉選單樣式範本（CAT）

為避免同功能選單出現不同視覺與互動，CAT 統一下拉樣式代號如下。新開發請先選代號，不要另外做一套。

- **`DD-A`（原生精簡）**：原生 `select` 單選，白底灰框。用於一般篩選列（如「全部類別 / 全部群組 / 依建立順序」）。
- **`DD-B`（多選標籤）**：`ai-multiselect-trigger` + `ai-multiselect-dropdown`，清單內為 checkbox，可含 `button.ai-multiselect-add-new-row`（如「+ 新增標籤」）。
- **`DD-C`（單選互斥）**：沿用 `DD-B` 的觸發列與面板，但清單為 radio；互斥群組選取列採主色高亮。建議透過 `js/cat-mutex-dropdown.js` 的 `catMutexDropdownBind()` 綁定原生 select。

### 視覺契約（DD-B / DD-C）

- 觸發列 class：`ai-multiselect-trigger`
- 箭頭 class：`ai-multiselect-chevron`（不要再使用文字 `▼`）
- 展開態 class：`ai-multiselect-trigger--open`
- 浮層 class：`ai-multiselect-dropdown`
- 列項 class：`ai-multiselect-option`
- 尾端新增列：`button.ai-multiselect-add-new-row`

### 套用原則

- 新增「標籤多選」優先用 `DD-B`。
- 新增「互斥單選」優先用 `DD-C`。
- 僅在非常簡單的固定篩選器使用 `DD-A`。
- 若舊畫面改版，優先對齊到上述代號之一，避免混搭。
