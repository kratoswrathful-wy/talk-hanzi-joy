# CAT 工具（內嵌於 1UP TMS）

此目錄為 **Vanilla JS + IndexedDB** 的 CAT 編輯器靜態資產來源，與 TMS 的 React 程式碼（`src/`）分開維護，便於日後獨立授權或對外釋出。

## 與 TMS 的銜接

- 開發／建置前執行：`npm run sync:cat`，會將本目錄複製到 `public/cat/`。
- 使用者由 TMS 側欄進入路由 **`/cat`**，主畫面以 iframe 載入 **`/cat/index.html`**。
- 整合決策與後續 API 方向見專案根目錄 [`docs/CAT 轉移.md`](../docs/CAT%20%E8%BD%89%E7%A7%BB.md)。

## 更新資產

若你在外部儲存庫維護完整 CAT 專案，請將執行所需檔案同步至此目錄（至少包含 `index.html`、`app.js`、`db.js`、`style.css`、`js/`、`lib/`），再執行 `npm run sync:cat` 並提交變更。
