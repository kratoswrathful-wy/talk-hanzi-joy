# 給 AI / 新協作者的捷徑

## 文件索引

### (A) 給 AI／協作者的行為規則

- **本檔** — 對話語言、推送慣例、CAT 單一來源與下列章節。
- **[`.cursor/rules/`](.cursor/rules/)** — 依你正在編輯的檔案路徑自動套用（例如 [`cat-tool-source.mdc`](.cursor/rules/cat-tool-source.mdc)、[`xliff-tag-export.mdc`](.cursor/rules/xliff-tag-export.mdc)）；預設非全域常駐，觸及對應 glob 時才注入。

### (B) 功能與路徑

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — TMS 本體（React / Vite）、維運邊界
- [`docs/CODEMAP.md`](docs/CODEMAP.md) — 功能與路徑對照
- [`cat-tool/README.md`](cat-tool/README.md) — CAT 維護說明（含下拉選單樣式代號 `DD-A / DD-B / DD-C`）

### (C) 領域與深文件（非「Cursor 一律遵守的編輯總規則」）

- [`docs/CAT_VIEW_SPEC.md`](docs/CAT_VIEW_SPEC.md) — 介面用語與檢視行為
- [`docs/XLIFF_TAG_PIPELINE.md`](docs/XLIFF_TAG_PIPELINE.md) — XLIFF／tag 管線（與 [`xliff-tag-export.mdc`](.cursor/rules/xliff-tag-export.mdc) 呼應）
- [`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md) — 部署檢核
- [`docs/CAT_AI_GUIDELINES_AND_PROJECT_RULES.md`](docs/CAT_AI_GUIDELINES_AND_PROJECT_RULES.md) — **產品**內 CAT 團隊版「AI 準則」資料與 Supabase 流程；**不是**教編輯器如何改程式的通用規範

## 回覆與推送慣例

- 永遠使用標準台灣正體中文與使用者對話。
- **介面用語**：使用者可見文案不得使用簡中慣用詞「**匹配**」；與 TM 相關之否定表述用「**無相符**」等（詳見 [`docs/CAT_VIEW_SPEC.md`](docs/CAT_VIEW_SPEC.md) §1.3）。不確定時請先與產品確認。
- 除非使用者另有明確指示，否則每次完成可提交的變更後，預設流程為：直接推送、簡述修改內容、列出驗收方式。

## CAT 內嵌編譯器（`/cat`）

- **僅在 [`cat-tool/`](cat-tool/) 修改** Vanilla CAT 的 `app.js`、`db.js`、`index.html`、`js/` 等。
- **不要**以 `public/cat/` 當第二套原始碼長期手改。
- 改完在**專案根目錄**執行 **`npm run sync:cat`**，再一併提交 `cat-tool` 與 `public/cat` 的變更。
- `npm run build` 的 **`prebuild` 會自動**跑 `sync:cat`；靜預覽與他人 clone 仍建議手動 sync 後提交，避免 `public/cat` 落後。

細節與風險：[`cat-tool/README.md`](cat-tool/README.md)、[`.cursor/rules/cat-tool-source.mdc`](.cursor/rules/cat-tool-source.mdc)。

## 在 VS Code / Cursor 裡

- **Command Palette**（`Ctrl+Shift+P` / `Cmd+Shift+P`）→ **Tasks: Run Task** → **「Sync CAT (cat-tool → public/cat)」**（定義在 [`.vscode/tasks.json`](.vscode/tasks.json)）。
