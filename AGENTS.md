# 給 AI / 新協作者的捷徑

## 回覆與推送慣例

- 永遠使用標準台灣正體中文與使用者對話。
- 除非使用者另有明確指示，否則每次完成可提交的變更後，預設流程為：直接推送、簡述修改內容、列出驗收方式。

## CAT 內嵌編譯器（`/cat`）

- **僅在 [`cat-tool/`](cat-tool/) 修改** Vanilla CAT 的 `app.js`、`db.js`、`index.html`、`js/` 等。
- **不要**以 `public/cat/` 當第二套原始碼長期手改。
- 改完在**專案根目錄**執行 **`npm run sync:cat`**，再一併提交 `cat-tool` 與 `public/cat` 的變更。
- `npm run build` 的 **`prebuild` 會自動**跑 `sync:cat`；靜預覽與他人 clone 仍建議手動 sync 後提交，避免 `public/cat` 落後。

細節與風險：[`cat-tool/README.md`](cat-tool/README.md)、[`.cursor/rules/cat-tool-source.mdc`](.cursor/rules/cat-tool-source.mdc)。

## 在 VS Code / Cursor 裡

- **Command Palette**（`Ctrl+Shift+P` / `Cmd+Shift+P`）→ **Tasks: Run Task** → **「Sync CAT (cat-tool → public/cat)」**（定義在 [`.vscode/tasks.json`](.vscode/tasks.json)）。

## 專案其他文件

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — TMS 本體（React / Vite）
- [`docs/CODEMAP.md`](docs/CODEMAP.md) — 功能與路徑對照
