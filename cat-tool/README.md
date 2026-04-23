# CAT 工具（內嵌於 1UP TMS）

此目錄為 **Vanilla JS + IndexedDB** 的 CAT 編輯器靜態資產來源，與 TMS 的 React 程式碼（`src/`）分開維護，便於日後獨立授權或對外釋出。

## 與 TMS 的銜接

- 開發／建置前執行：`npm run sync:cat`，會將本目錄複製到 `public/cat/`。
- 使用者由 TMS 側欄進入路由 **`/cat`**，主畫面以 iframe 載入 **`/cat/index.html`**。
- 整合決策與後續 API 方向見專案根目錄 [`docs/CAT 轉移.md`](../docs/CAT%20%E8%BD%89%E7%A7%BB.md)。

## 更新資產

若你在外部儲存庫維護完整 CAT 專案，請將執行所需檔案同步至此目錄（至少包含 `index.html`、`app.js`、`db.js`、`style.css`、`js/`、`lib/`），再執行 `npm run sync:cat` 並提交變更。

## 風險與單一來源

- **`public/cat/` 不是第二套原始碼**：專案根的 `scripts/sync-cat.mjs` 會刪除整個 `public/cat` 再從本目錄複製。只手改 `public/cat` 而未回寫此處的變更，在下次 `npm run sync:cat` 或 CI `prebuild` 時**會被覆寫**。
- **建議提交流程**：只在此目錄與關聯靜態檔修改 → 在專案根執行 `npm run sync:cat` → 提交**本目錄**與 **`public/cat` 的變更**一併入庫。正式建置已透過 `prebuild` 自動 sync。更多捷徑見專案根目錄 [`AGENTS.md`](../AGENTS.md)。
