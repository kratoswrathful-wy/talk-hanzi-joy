# CAT：TM 延後載入 + 進度提示（避免大 TM 導致編輯器空白）

## 背景與問題

在 CAT 團隊版（`/cat/team`）進入「檔案」或「句段集」編輯器時，現行流程會在畫出句段之前，先把專案掛載的 TM 全量載入到前端快取（`ActiveTmCache`）。當專案有大型 TM（例如 45,000 句）時，`db.getTMSegments` 可能 RPC timeout，導致：

- 編輯器標題未設置、格線未渲染（`hasRows = 0`）
- DevTools 出現：`CAT cloud RPC timeout: db.getTMSegments`
- 使用者誤以為「句段集結合失敗」或「系統壞掉」

## 目標（使用者體驗）

1. **先能工作**：進入編輯器後，句段格線應優先顯示並可編輯，不因 TM 載入而整頁空白。
2. **有進度提示**：TM 改為背景載入，並顯示載入進度：
   - 逐一載入（一次一個 TM）
   - 同時顯示總共有幾個 TM（去重後）
   - 顯示目前正在載哪一個 TM、該 TM 的進度、以及整體進度
3. **去重**：同一個 TM 若同時出現在「讀取 TM」與「寫入 TM」，只載入一次、只算一次。

## 範圍

- 影響：`cat-tool/app.js`（編輯器進入流程、TM cache 載入）、`cat-tool/index.html`（進度 UI 容器）、`src/lib/cat-cloud-rpc.ts`（新增分頁讀取/計數 RPC）、`cat-tool/db.js`（DBService 包裝）、以及同步輸出 `public/cat/`。
- 不改：TM 的比對算法本身、TM 資料表結構（僅新增 RPC action）。

## 現況定位（關鍵路徑）

- 編輯器進入（句段集）：`cat-tool/app.js` `openEditorFromView()` → `openEditorWithSegments()`
- 目前全量載入 TM 的位置：`openEditorWithSegments()` 內 `for (tmId of project.readTms/writeTms) await DBService.getTMSegments(tmId)`
- 雲端 RPC：`src/lib/cat-cloud-rpc.ts` `case "db.getTMSegments"`（分頁拉滿後回傳全部）

## 設計方案（最小改動）

### A. 先顯示句段，再背景載入 TM

在 `openEditorWithSegments()`：

- 先做：
  - 設定 `editorFileName`
  - 設定 `currentSegmentsList`
  - `renderEditorSegments()` + `updateProgress()` + 必要的 `runSearchAndFilter()`
- 再啟動背景工作：
  - `void loadProjectTmCacheInBackground(project)`
  - 背景工作負責逐一載入 TM 並更新進度 UI

### B. 進度提示 UI（建議放兩處）

- **底部狀態列**：不干擾翻譯，永遠可見
- **右側 TM 分頁頂部**：打開 TM 分頁時可看到詳細進度

顯示內容（例）：

- `TM 載入中（1/4）：正在載入「MyBigTM」`
- `此 TM：12,000 / 45,000（26%）`
- `整體：12,000 / 60,000（20%）`

### C. RPC 支援分頁 + 計數

為了能「逐頁更新進度」，需要新增兩個 RPC action（走既有 `handleCatCloudRpc` switch）：

1. `db.countTMSegments`：回傳某 TM 的總句段數
2. `db.getTMSegmentsPage`：回傳某 TM 的一頁句段（例如 1000 筆）+ `nextOffset`

前端背景載入用「一頁一頁拉」，每拉完一頁就更新 UI：

- per-TM：`loadedThisTm += page.length`
- overall：`loadedAll += page.length`

### D. 超時降級（安全網）

如果某 TM 分頁拉取連續 timeout：

- UI 顯示「TM 載入逾時，可先翻譯；稍後可重試」
- 提供「重試載入」按鈕（僅重試當前 TM）
- 不影響句段編輯本體

## 驗收（白話）

1. 專案掛載大型 TM（例如 45,000 句），進入檔案/句段集編輯器：
   - 句段格線應先正常顯示，不會整頁空白
   - 進度提示出現且數字會往上增加
2. TM 全部載入完成後：
   - 進度提示消失或顯示「已載入」
   - TM 搜尋/套用功能可用
3. 同一 TM 同時是讀取/寫入：
   - 進度中的 TM 總數不重複計算

