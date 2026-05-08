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
- 編輯器進入（檔案）：`cat-tool/app.js` `openEditor(fileId)`
- 目前全量載入 TM 的位置：`openEditorWithSegments()` 內 `for (tmId of project.readTms/writeTms) await DBService.getTMSegments(tmId)`
- **檔案模式仍同步載入 TM（需補齊）**：`openEditor(fileId)` 內同樣有 `await DBService.getTMSegments(tmId)`（讀取 TM + 僅寫入 TM 兩段）
- 雲端 RPC：`src/lib/cat-cloud-rpc.ts` `case "db.getTMSegments"`（分頁拉滿後回傳全部）

## 本次實作進度／過程紀錄（截至 2026-05-08）

### 使用者回報與關鍵證據（白話）

- 使用者多次回報：**進入編輯器後有時會空白/卡住**，並提供 DevTools 訊息：`CAT cloud RPC timeout: db.getTMSegments`。
- 這代表：進編輯器時 **TM 在句段渲染之前被同步載入**，只要 TM 太大或網路/DB 慢，就可能讓畫面「看起來什麼都沒顯示」。

### 已完成的變更（目前「句段集」已正常）

- 句段集模式（`openEditorWithSegments()`）已改成：
  - **句段先 render**（讓使用者先看到內容、可開始工作）
  - TM 改為 **背景逐一分頁載入**（不再 `await getTMSegments` 一次拉完）
  - 底部狀態列加入 **TM 載入進度 + 失敗可重試**

### 為什麼使用者會覺得「什麼都沒改到」

- 使用者實際操作多為「檔案模式」（URL 形態常見 `.../cat/team/files/...`）。
- 檔案模式走 `openEditor(fileId)`，而該路徑 **目前仍同步載入 TM**，因此大型 TM 時仍可能卡在「正在載入檔案…」，視覺上就像「沒有改善」。

## 更新後的實作範圍（選擇 B：一次補完整）

目標：避免任何主要工作流因同步載入 TM 而卡住，並讓 TM 載入行為一致（背景分頁 + 進度 + 重試）。

### 0) 待修清單：所有仍「同步全量載入 TM」的位置（本文件作為日後依據）

以下位置在 `cat-tool/app.js` 仍可看到 `await DBService.getTMSegments(...)`，代表「會一次把整個 TM 拉回來」，大型 TM 時就可能 timeout 或卡住 UI。B 方案的目標是把這些點（依情境）改成「分頁背景載入」或「可接受的延後載入」。

#### A. 會影響「主要工作流」的卡頓（優先級最高）

- **檔案模式進編輯器**：`openEditor(fileId)`
  - 情境：開啟 `.../cat/team/files/...` 的檔案編輯器
  - 風險：進編輯器前同步載入 read/write TM，會卡在「正在載入檔案…」或空白
  - 目標：比照句段集，先渲染句段，再背景載入 TM（保留語言對過濾）
- **專案掛載 TM 後的補載快取**：TM picker 確認後的「補載未 ready TM」
  - 情境：在專案內掛載新 TM、按「確認」後立即補載 TM 快取
  - 風險：掛載大型 TM 時 UI 雖回到頁面，但補載仍可能卡住或造成長時間無回應
  - 目標：改成背景分頁載入 + 進度；若失敗不影響使用者立刻回到工作

#### B. 會影響「常用輔助功能」的等待（優先級中）

- **專案 TM 正規化清單快取**：`getProjectTmNormListCached(projectId)`
  - 情境：字數引擎/加權或其他需要 TM norm list 的計算
  - 風險：同步載入所有 readTms 會拖慢分析開啟或運算
  - 目標：改用分頁/逐步累積，或沿用背景已載入的 TM cache（可降級）
- **字數統計（Word Count）分析讀取 TM**：`runWordCountAnalysis()` 內「讀取 TM 資料」
  - 情境：使用者在字數統計視窗勾選 TM 後執行分析
  - 風險：大型 TM 時分析會長時間停在「讀取 TM 資料…」
  - 目標：用分頁累積 norm list；UI 進度可沿用既有 `setProg(...)`
- **拆分提示（Split Hint）讀取 TM**：
  - `runSplitHintWeightedPreview(fileIds, parts)`
  - `runSplitHintWeightedPreviewBySegIds(segIds, parts)`
  - 情境：用 TM 折扣估算拆分份量
  - 風險：大型 TM 時「計算中…」卡很久
  - 目標：用分頁累積 norm list，或提供「不勾 TM 也能先算」的降級提示

#### C. 影響「TM 管理頁」的等待（優先級較低，但仍需一致性）

- **TM 詳細頁載入句段**：`openTmDetail(tmId)` → `loadTmSegments()`
  - 情境：打開某 TM 詳細頁看句段列表/去重顯示
  - 風險：大型 TM 進入詳細頁卡住
  - 目標：TM 詳細頁本身也改成分頁載入（並顯示進度/載入更多）
- **TM 匯出**：匯出對話框確認後（`btnConfirmExportResource`）在匯出 TM 時
  - 情境：匯出 TMX/Excel
  - 風險：必然需要讀全量 TM；大型 TM 可能卡住瀏覽器
  - 目標：明確顯示「匯出準備中」進度，必要時分頁串流組裝（或提供「背景產檔」替代方案）
- **清空 TM 前的既有量讀取**：`btnClearTmSegments`（讀取 existing 長度）
  - 情境：清空前要記錄刪除筆數到 changelog
  - 風險：這裡其實不需要全量句段，只需要 count
  - 目標：改用 `countTMSegments` 取得 total

#### D. 已有「快取就用快取、否則回退全量」的點（需改成分頁回退）

- **確認句段後同步到寫入 TM**：`syncSegmentToWriteTmsOnConfirm(seg, rowIdx)`
  - 情境：快取未 ready（例如開檔後才掛載 TM）時，回退 `getTMSegments(tmId)` 查 DB
  - 風險：一旦回退撞到大型 TM，確認動作可能卡住
  - 目標：回退查詢改成「分頁掃描直到找到 match」或「改用後端查詢（依 sourceText/key/語言對）」避免全量拉回

### 1) 檔案模式：比照句段集改成先顯示句段、TM 背景載入

- 位置：`cat-tool/app.js` 的 `openEditor(fileId)`
- 重點：
  - 把「讀取 TM / 僅寫入 TM」兩段 `await DBService.getTMSegments(...)` 移出主流程
  - 改成背景載入（與句段集共用同一套 `loadProjectTmCacheInBackground` 或抽共用 helper）
  - 保留檔案模式既有的「語言對過濾」需求（若檔案有 source/target lang，TM 句段需做相符過濾）

### 2) 其他仍同步載入 TM 的點：一併改成分頁背景載入

目前 `cat-tool/app.js` 仍可找到多處 `await DBService.getTMSegments(...)`，常見情境包含：

- **專案 TM 掛載/變更後的補載快取**（例如按下 TM picker 的確認後）
- **TM 管理/檢視頁**（載入列表或檢視某個 TM 內容時）

這些點若不一起處理，仍可能出現「某些操作會卡、但進編輯器不會卡」的落差。

處理原則：

- 任何會拉大量 TM 句段的路徑都應改成：
  - `countTMSegments` → 顯示總數
  - `getTMSegmentsPage` → 逐頁載入、逐頁更新 UI
  - 失敗不阻斷主要工作（能翻譯優先）

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

