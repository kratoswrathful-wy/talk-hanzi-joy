# 給 AI / 新協作者的捷徑

## 文件索引

### (A) 給 AI／協作者的行為規則

- **本檔** — 對話語言、推送慣例、CAT 單一來源、工作評估與文件、對話與執行（含資料庫操作）與下列章節。
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
- 除非使用者另有明確指示，否則每次完成可提交的變更後，預設流程為：**直接推送**，並依下方「變更完成並推送後的回報」結構回覆。

## 與專案擁有者溝通

- **背景**：專案擁有者**不具程式背景**為預設假設。使用者若要求「白話」或「白話文」，意指**外行也能理解**的說明，不預設對方懂分支、API、migration 等詞彙。
- **技術名詞**：**可以**出現；每次出現後須用白話說明**該術語**或**整句技術語句**在講什麼、與對方有何關係。同一則對話中，同一術語**解釋過一次即可**，後續不再重複定義。
- **行內程式碼**（以反引號標示、介面常顯示為灰底等寬字，例如 `main`、`AGENTS.md`）：**不必**為了「少用」而避免，可用來標示檔名、分支名、指令等；重點是搭配白話說明讓對方知道在講什麼。

## 新需求或新任務時的回覆

當使用者提出**一項新的需求或新任務**（有明確要做的事）時，回覆中**務必**附加條列：

- **需要你決定的事項**：選擇、取捨、優先順序等。
- **需要你注意的事項**：風險、限制、後續影響、是否需手動操作等。

一般閒聊、確認或延續同一任務的細節追問，不強制條列；若仍涉及重大取捨，建議仍條列決策點。

## 變更完成並推送後的回報

每次變更已提交並推送後，請依序提供：

1. **推送／版本**：分支名稱（通常 `main`）與 commit 編號（至少 7 字元短碼），必要時附 commit 訊息一行，方便在 GitHub 或本機比對。
2. **變更摘要**：極短說明改了什麼（檔案或行為層級），不以大段程式碼當唯一說明。
3. **預計體驗變更**：使用者實際會感受到什麼（畫面、流程、效能、誰受影響）；若幾乎無 UI 變化亦請註明。
4. **如何驗收（白話）**：以外行能跟著做的步驟寫成清單（開哪個畫面、點哪裡、預期看到什麼）；後端或純設定變更則說明「你會注意到什麼現象」或「無需操作時如何確認已完成」。

## 工作評估與文件

- **實作與規劃**：本專案目前由 AI 承擔實作；評估工項、排程、取捨或技術方案時，**不必**預設「人類工程師的產能、熟悉度或可用工時」。
- **文件**：撰寫或維護供留存之文件（例如 `docs/`、`README`、以及註解中預期日後由人閱讀的說明）時，**仍應**假設日後可能由人類（含維運者或專案主人）閱讀，維持清楚脈絡與可讀性。

## 對話與執行

### 說明與交付（避免請使用者從對話複製貼上）

- 優先**直接改檔**或透過工具套用變更；向使用者說明時以**檔案路徑、行為摘要、驗收方式**為主。
- **避免**把大段程式碼或長串終端機指令當成「請自行複製貼上」的唯一交付方式。
- 僅在環境無法代為寫入或執行時，才附上**最短**必要內容，並說明為何無法代做。

### Supabase 與資料庫操作

- 變更若伴隨 **migration**（資料庫結構版本變更）、種子資料或專案慣例中的 Supabase／Postgres 步驟，**預設由代理在權限與環境允許時直接執行完畢**（例如新增或修改 `supabase/migrations/*.sql` 後執行 **`supabase db push`**；實際指令與部署順序以 [`docs/HANDOFF.md`](docs/HANDOFF.md)、[`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md) 為準）。
- **不要**預設把整串流程留給使用者執行；結尾不應以「請執行以下 bash」當成預設交付。
- 若執行失敗（未 link、缺憑證、無法連線、僅 Dashboard 可完成等），應簡述**錯誤與阻擋原因**，並只請使用者補**無法代辦的那一步**。

## CAT 內嵌編譯器（`/cat`）

- **僅在 [`cat-tool/`](cat-tool/) 修改** Vanilla CAT 的 `app.js`、`db.js`、`index.html`、`js/` 等。
- **不要**以 `public/cat/` 當第二套原始碼長期手改。
- 改完在**專案根目錄**執行 **`npm run sync:cat`**，再一併提交 `cat-tool` 與 `public/cat` 的變更。
- `npm run build` 的 **`prebuild` 會自動**跑 `sync:cat`；靜預覽與他人 clone 仍建議手動 sync 後提交，避免 `public/cat` 落後。

細節與風險：[`cat-tool/README.md`](cat-tool/README.md)、[`.cursor/rules/cat-tool-source.mdc`](.cursor/rules/cat-tool-source.mdc)。

## 在 VS Code / Cursor 裡

- **Command Palette**（`Ctrl+Shift+P` / `Cmd+Shift+P`）→ **Tasks: Run Task** → **「Sync CAT (cat-tool → public/cat)」**（定義在 [`.vscode/tasks.json`](.vscode/tasks.json)）。
