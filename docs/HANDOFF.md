# 1UP TMS — 交接與維運說明

本文件協助新對話中的 AI、其他工程師或未來的你快速理解專案邊界、資料流與**已踩過的坑**（請勿輕易還原這些修正）。

## 技術棧

- **Vite + React 18 + TypeScript**
- **React Router**（`src/App.tsx`）
- **Tailwind + shadcn/ui**
- **TanStack Query**（`QueryClientProvider`）
- 後端多為 **Supabase**（`src/integrations/supabase`），部分資料在 **local 持久化**（見下）

## 目錄導覽（精簡）

| 路徑 | 用途 |
|------|------|
| **`cat-tool/`**、**`public/cat/`** | 內嵌 CAT（`/cat`）；**只改 `cat-tool`**，改後 `npm run sync:cat` 並一併提交（見根目錄 **`AGENTS.md`**） |
| `src/App.tsx` | 路由、認證後版面、`initSettings()` |
| `src/pages/` | 各功能頁（案件、費用、設定等） |
| `src/stores/` | 前端狀態與持久化（設定、選項、UI 按鈕樣式等） |
| `src/hooks/` | `useAuth`、`use-case-store`、權限等 |
| `src/lib/` | 純函式、工具（重複標題比對、設定共用工具等） |
| `src/components/settings/` | 設定頁拆出之區塊（工具列按鈕、**狀態標籤**等）；Slack 連結在 **個人檔案**（`ProfileSlackCard`） |
| `docs/` | 本文件與 `CODEMAP.md` |
| **`ops_incidents`（Supabase）** | 重大故障／維運紀錄時間線（與本文件分工：文件管「怎麼修」、表管「何時／結論」）；管理員於**設定**頁可唯讀瀏覽 |

更細的對照表見 [CODEMAP.md](./CODEMAP.md)。

- **Slack 承接／無法承接**：譯者於個人檔案可編輯預設文案（欄位 `profiles.slack_message_defaults`，migration `20260324120000_profiles_slack_message_defaults.sql`）；部署後請 `supabase db push`。行為見 [SLACK_SETUP.md](./SLACK_SETUP.md)。
- **Supabase 不健康／連線池滿／Auth 504**：見 [SUPABASE_HEALTH_RUNBOOK.md](./SUPABASE_HEALTH_RUNBOOK.md)；`profiles` 欄位 **`receive_translator_case_reply_slack_dms`**（**dms**）請與 [`src/lib/profile-columns.ts`](../src/lib/profile-columns.ts) 一致，勿拼成 `...slack_cms`。

## CAT：團隊模式原始檔（Storage）

- **存放位置**：Supabase Storage bucket **`cat-original-files`**（private），物件路徑 **`{project_id}/{file_id}/original`**。
- **行為摘要**：列表 RPC **不**再帶出巨大 **`original_file_base64`**；開單檔時由父頁 RPC 自 Storage 取檔後再餵給 iframe 內既有 hydrate（詳見 [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)）。
- **完整過程、migration、`db push` 曲折、驗收數字與後續可選步驟**：見 [incident-report_2026-05-01_rls-and-db-load.md](./incident-report_2026-05-01_rls-and-db-load.md)。
- **回填既有資料**（僅需做一次／新環境類比）：本機 PowerShell 設定 **`SUPABASE_URL`** 與 **`SUPABASE_SERVICE_ROLE_KEY`**（Dashboard → API → Legacy **`service_role`**），於專案根執行 **`npm run backfill:cat-original-files`**。**金鑰切勿進 Git。**

## CAT：線上 TB 分頁（online tabs）維運重點

### 資料模型與升級規則

- 線上 TB 由單一來源升級為 `onlineTabs` 陣列；每個分頁包含 `id`、`name`、`url`、`config`、`lastFetched`、`lastError`。
- 術語列新增來源識別 `tabId`，同一 TB 可整併多來源術語，仍視為同一術語庫。
- Supabase 對應欄位為 `cat_tbs.online_tabs`（JSONB），由 migration `20260429210000_cat_tbs_online_tabs.sql` 建立。
- 既有舊資料（僅 `googleSheetUrl`）會在開啟 TB 詳細頁時自動升級為單一分頁模型（避免人工遷移）。

### 操作流程（UI 與行為）

- 新增分頁與更新分頁都走同一流程：先開設定 modal，按「確認並擷取」後才真正寫入。
- 刪除分頁時，會同步刪除該分頁全部術語，並重新編號 `termNumber`／`nextTermNumber`。
- 分頁卡支援拖曳排序，排序結果直接回寫 `onlineTabs`。
- 搜尋欄旁提供分頁勾選框（`全部` + 各分頁），術語列表即時依關鍵字與分頁條件交集過濾。
- 術語表高度採「50 筆上限」邏輯：超過時表格內捲動；少於時自然高度。

### 本次踩坑與排查紀錄

- `renderOnlineTabsSection` 曾呼叫未定義 `escHtml`，造成 TB 詳細頁崩潰；修正為區域 escape helper，避免全頁卡死。
- `openCatConfirmModal` 屬 Promise 介面，需用 `.then()` 或 `await` 處理，不能當 callback 參數直接傳入。
- 分頁擷取進度 spinner 曾誤用 `animation: spin`，實際需對齊既有 `cat-loading-spin`。
- 文字規範已統一：錯誤訊息與提示文字中的「儲格」全面修正為「儲存格」。

### 變更時的實務提醒

- 線上 TB 分頁功能主要落在 [`cat-tool/app.js`](../cat-tool/app.js) 與 [`cat-tool/index.html`](../cat-tool/index.html)；修改後務必執行 `npm run sync:cat` 同步到 `public/cat` 並一併提交。
- 雲端團隊版欄位映射在 [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)；若新增/調整 `onlineTabs` 欄位鍵名，需同步更新讀寫映射。

## CAT：防殘影、深連結載入、TMS 詳情頁 key（已落地）

### Vanilla CAT（[`cat-tool/`](../cat-tool/)）

- **問題**：在同一個 `view-section` 內切換不同 id（專案／TM／TB／檔案）時，若先 `await` DB 再切 view／填 DOM，使用者會短暫看到上一筆 DOM。
- **作法（fetch 前先換殼）**：[`cat-tool/app.js`](../cat-tool/app.js) 集中使用 helper，於 **await 前**清空標題與列表區、必要時先 `switchView`：  
  `beginOpenProjectDetailLoading`、`beginOpenTmDetailLoading`、`beginOpenTbDetailLoading`、`beginEditorViewLoadingShell`（編輯器會清空 `#gridBody`、標題改為「載入中…」、切入 `viewEditor` 並收合側欄）。
- **深連結首屏**：[`cat-tool/index.html`](../cat-tool/index.html) 於 `<main>` 內 **`#catMainRouteLoading`**（預設使用 `.hidden`）；頁尾深連結 inline script 在 **`catView` 存在且非 `viewDashboard`** 時，除隱藏所有 `.view-section` 外**顯示**該區，避免主區全白。[`restoreCatRouteFromSession`](../cat-tool/app.js) 的 **`finally`** 呼叫 **`hideCatMainRouteLoadingEl()`**，避免還原後仍遮住內容。樣式見 [`cat-tool/style.css`](../cat-tool/style.css)（`.cat-main-route-loading`，刻意低於全螢幕 `#catLoadingOverlay` 的 z-index）。
- **TB 詳情取不到 TB**：`openTbDetail` 失敗時回到 **`viewTB`**（避免卡在空白詳情頁）。
- **編輯器**：檔案不存在或 mqxliff **取消身分**時會將 **`currentFileId` 清空**並回到儀表板或專案詳情，避免停在空白編輯 view。

### TMS React（[`App.tsx`](../src/App.tsx)）

- **問題**：詳情頁只改網址 **`id`** 時，若不強制重掛，可能短暫顯示上一筆資料。
- **作法**：比照既有 **`TranslatorFeeDetailWrapper`**，對案件／請款／客戶請款／頁面範本編輯／內部註記包一層 **`CaseDetailPageWrapper`** 等，`**key={id}`**；內部註記列表與單筆並存路由使用 **`key={noteId ?? '__list'}`**，讓 **`noteId` 有無切換**時也會重置。
- **驗收**：手動驗收（CAT 專案／TM／TB／編輯器換 id、深連結首屏有載入提示；TMS 各詳情頁僅改 id／note）狀況良好；新版部署後若有環境差異可再抽樣回歸。

### 已知後續風險（尚未實作）：嵌入 CAT 與父頁網址不同步

此項與「同一 CAT view 內換 id」**不同維度**：CAT 內已處理深連結與 session restore，但若 **TMS 父頁** React 路由或 query 已變（例如 `/cat/offline?catView=…`），而 **iframe 未重新載入或未取得新 URL**，使用者仍可能看到 **iframe 內舊畫面**。

- **評估與修改入口**：[`src/pages/CatToolPage.tsx`](../src/pages/CatToolPage.tsx)（既有 `postMessage`、與 iframe 內 `CAT_NAVIGATE` 等契約）。
- **可能方向（擇一或並用）**：父頁監聽 **`location.pathname`／`search`** 變更時更新 iframe **`src`**（強制載入新 URL）；或對 iframe **`postMessage`** 請內部執行等同 **`restoreCatRouteFromSession`** 的邏輯。須避免與現有雙向同步互相造成 **無限 reload** 或訊息風暴，改動前建議先梳理 **誰是路由真相來源**（父頁 URL vs iframe `sessionStorage`）。

## CAT：提問整合（客戶表單 / LMS 案件綁定）維運硬規則

### 條件式按鈕與不可受影響按鈕

- 條件式按鈕僅限：**`客戶表單`**、**`內部註記`**。
  - `客戶表單`：僅在專案已設定客戶表單 URL 時顯示。
  - `內部註記`：僅在目前檔案已綁定 `LMS 案件` 時顯示。
- **`AI 輔助` 按鈕不得連帶隱藏**：無論情境 A/B，都維持原本顯示邏輯（例如權限、模式、設定），不可被「客戶表單 / 內部註記」條件一併包住。
- 編輯器按鈕文案以 **`提問表單`** 為準；專案頁欄位文案以 **`外部提問表單連結`** 為準（兩者語意一致、呈現位置不同）。

### 版位規則（避免回歸）

- 專案頁檔案清單：
  - 欄位標題使用 **`LMS 案件`**。
  - 案件名稱應為可點連結（原地跳到 LMS 案件頁）。
  - 進度條顯示在**檔案名稱下方**，不放在 `LMS 案件` 欄。
- 編輯器底部資訊列：
  - 開檔人員標籤文案統一為 **`使用者`**。
  - 顯示位置在進度條右側（非檔名旁上方區塊）。

### 廢棄功能

- `#btnTagGroupMode`（`T⁺`）為已廢棄功能，實作時需移除按鈕與相關提示文案，避免造成仍可用的錯覺。

### 資料持久化與重整不遺失（必守）

- `外部提問表單連結` 與檔案 `LMS 案件` 綁定均屬持久化資料，重整頁面後必須回填既有設定，不得退回空值。
- 專案頁儲存外部連結後，應在原輸入區 **inline 保留可點連結**；不可改為僅顯示在其他區塊，造成「看似遺失」。
- 若同時有本機暫存與雲端資料，畫面最終顯示應以成功寫入後的資料來源為準，避免 UI 顯示舊值。

### 提問表單分割按鈕、欄位對應與剪貼簿（2026-05）

- **編輯器工具列**：`提問表單` 改為分割按鈕——**主按鈕**依專案設定的 Google Sheets（或其他）URL：將目前焦點／錨點句段與檔名等資料組成 **Tab 分隔**列寫入剪貼簿後開新分頁；**▾** 直接開啟與專案頁相同的 **欄位對應設定** Dialog（譯者模式下會顯示「個人設定」說明）。
- **欄位對應資料**：管理者預設存在 IndexedDB／團隊版 **`cat_projects.client_question_form_columns`**（camelCase：`project.clientQuestionFormColumns`，見 migration `20260501140000_cat_projects_question_form_columns.sql`）；[`cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) 的 `db.patchProject` 須能讀寫此欄。
- **譯者個人覆寫**：僅存 **`localStorage`**，鍵名 `catQfColOverride_{projectId}`；**不覆寫**管理者存進專案的預設。首次開啟欄位設定（尚無有效 LS 內容）時會先向 DB 取最新專案列，以**管理者當下預設**填入並寫入 LS 快照，故不需按「儲存」也會沿用該組對應；之後譯者若另存則以 LS 為準。開啟對話框與「提問表單」複製前皆會 **`getProject` 刷新**，避免編輯器閉包內的舊 `project` 造成畫面與剪貼簿不一致。
- **專案頁**：「外部提問表單連結」列新增綠色 **欄位設定** 按鈕，開啟同一 Dialog 並寫入專案預設。
- **內部註記**：改為分割按鈕：主按鈕與「建立新註記」維持既有 `CAT_OPEN_INTERNAL_NOTE`；**▾** 向父頁請求 **`CAT_FETCH_NOTES`**（payload：`requestId`、`caseTitle`），父頁 [`CatToolPage.tsx`](../src/pages/CatToolPage.tsx) 查詢 `internal_notes`（`env` + `related_case` 等於案件標題）後回 **`TMS_NOTES_LIST_RESULT`**（離線／團隊嵌入共用同一 listener）。
- **實作位置**：[`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/index.html`](../cat-tool/index.html)、[`cat-tool/style.css`](../cat-tool/style.css)；改後 **`npm run sync:cat`**。

### 案件狀態驅動 CAT 指派同步（硬規則）

- 觸發條件僅限案件狀態 **`詢案中` -> `已派出`** 的轉換。
- 同步來源為案件頁的 **`譯者`** 與 **`審稿人員`**。
- 同步動作採 **只新增、不移除**：既有 CAT 檔案指派成員保留，不因案件頁變更而刪除。
- 若指定人員無法對應到 CAT 可指派帳號，該筆採 **跳過**，不得中斷整體流程。

### 排錯重點（本機模式與型別）

- 本機／雲端混合流程常見 `id` 型別不一致（字串 vs 數字），比對使用者或案件時需先做一致化轉型。
- 若發生「畫面有資料但按鈕不顯示」，先檢查：
  - 專案 `external form url` 是否實際存在且非空白字串
  - 檔案 `case binding` 是否已成功回寫
  - 條件渲染是否誤把 `AI 輔助` 一起包進條件判斷
- 若發生「重整後不見」，優先檢查讀取順序是否先以空本機狀態覆蓋已載入資料。

## 案件資料量與詳情頁

- **`case-store`** 仍會在背景執行**全表** `cases` 載入（列表／同步用）。  
- **案件詳情頁**改為優先呼叫 **`loadCaseIfMissing(id)`**：只向 DB 取**單一列**，避免在案件極多時卡在「全表載入」導致黑畫面或長時間載入。  
- **案件列表頁 `/cases`**：在 **`caseStore.isLoaded()`** 為真之前顯示**載入中**（`useCaseStoreReady`），避免**任何身分**在**新工作階段第一次開列表**（或本機尚無快取、案件總筆數很大）時，在**尚未載入完成**就繪製超大表格，主執行緒被同步處理／渲染塞滿，瀏覽器出現**網頁無回應**或**灰／黑畫面**（**不僅限 member／譯者**）。列表 tbody 對篩選結果使用 **`useDeferredValue`**，降低單次更新阻塞。  
- 若全表載入**失敗**，`case-store` 會將 **`loaded = true`** 並清空列表，避免永遠卡在載入中。  
- 登入後 **`initSettings`** 將 **`loadAssignees`** 與其餘設定分開，減少首屏同時打多個重查詢的阻塞。
- **`mergeIncomingCase`** 對 `tools`／`questionTools` 使用安全讀取，避免異常快取導致整頁 React 崩潰（閃一下後黑屏）。  
- **案件說明**（BlockNote）以 **`CaseBodyEditorBoundary`** 包住；`body_content` 若非陣列會先正規化為 `[]`，編輯器錯誤時顯示提示而非整頁黑屏。

## 設定載入流程（重要）

1. 使用者登入後，`AuthenticatedRoutes`（`App.tsx`）在 `user` 就緒時呼叫 **`initSettings()`**（`src/stores/settings-init.ts`）。
2. 各 store 的 `loadSettings()` 會從 **IndexedDB / local 後端**還原設定（依專案實作）。
3. **工具列按鈕樣式**：`ui-button-style-store`（key: `ui_button_styles`）  
   - 持久化格式 **v3**：`overrides`、`layout.widthRem`、`layout.groupsByModule`。  
   - 舊的 `cases_detail_neutral` 會在載入時遷移到 5 個灰色按鈕 id（見 store 內註解）。

## 已修正且須保留的行為

### React Hooks（案件詳情頁）

- **`CaseDetailPage`**：`useToolbarButtonUiProps` / `useUiButtonLabel` 等 **必須寫在** `loading` / `!caseData` 的 early return **之前**，否則載入完成後 hook 數量變化會導致執行期錯誤與**整頁黑屏**。

### 內部註記詳情

- **`InternalNotesPage`** 的 `NoteDetailView`：`lbLinkMsg` 等須有 **`useUiButtonLabel` 對應變數**，否則執行期 `ReferenceError`、黑屏。

### 個人檔案 `/profile` 黑屏（或主內容全黑、短暫像閃登入）

- **曾發生原因**：[`ProfilePage`](src/pages/ProfilePage.tsx) 在 **PM／Executive 專用區塊**（承接／無法承接 Slack 通知開關）與 **`handleSave`** 使用 **`isAdmin`**，但**未從 `useAuth()` 解構**，執行期出現 **`ReferenceError: isAdmin is not defined`**，React 渲染中斷 → **主區域黑畫面**；若同時伴隨 auth／路由重繪，可能**誤以為閃一下登入頁**。
- **修正**（須保留）：`const { user, profile, refetchProfile, isAdmin } = useAuth();`
- **預防**：改動頁面後請執行 **`npx tsc -p tsconfig.app.json --noEmit`**。專案根目錄單獨執行 `tsc` 可能只走空的 solution 參考，**不會檢查到 `src/`，易漏掉此類錯誤**。

### Windows / PowerShell 建置

- 在 PowerShell 中請使用：  
  `Set-Location "專案路徑"; npm run build`  
  避免單行使用 `&&`（部分環境會解析失敗）。

### 工具列按鈕 registry

- 灰色操作已拆為 5 個 id（`cases_detail_revert_to_draft` 等），請勿再使用已移除的 `cases_detail_neutral`。

### 檔案欄位（`FileField`）上傳後「看不到檔案」

- **原因**：多為**顯示／版面**問題，非上傳必敗。展開「上傳／拖曳」面板時，**已加入的檔案列在區塊上方**；進度條在下方，使用者若未往上捲，會以為沒加入。
- **修正**（須保留）：上傳成功後 **toast** 提示、**自動收合**新增面板，且全螢幕 backdrop 在上傳中**不**因點擊而關閉；內層面板 `stopPropagation` 避免誤觸。若 Storage 回傳錯誤，會 **toast 錯誤**（真正上傳失敗）。

### `case-files` Storage 上傳失敗（進度跑完仍失敗）

- **曾發生原因**：`storage.objects` 對 **`case-files`** 僅有 INSERT／SELECT／DELETE，**缺少 UPDATE**；與 **`case-icons`** 不同。部分上傳流程（含 **`upsert: true`** 或 SDK 對既有物件的更新）需要 UPDATE 權限，否則可能失敗。
- **修正**：migration `20260321120000_case_files_storage_update_policy.sql` 新增 **Authenticated users can update case files**（`USING` + `WITH CHECK` 皆限 `bucket_id = 'case-files'`）。部署後請在 Supabase 執行該 migration。
- **前端**（須保留）：[`buildCaseFileObjectPath`](src/lib/storage-case-files.ts) 產生路徑；`upload(..., { upsert: true, contentType, cacheControl })`；失敗 **toast 會帶出 Supabase 回傳的 `error.message`** 便於排查（檔案過大、權限、網路等）。
- **仍失敗時**：請看 toast 內文；若為 **檔案超過專案上限**，需在 Supabase Dashboard → Storage → `case-files` → 調高 **Global file size limit**（或縮小檔案）。

#### 如何分辨「權限 (RLS)」與「檔案太大」

| 現象 | 代表 |
|------|------|
| 錯誤含 **`new row violates row-level security policy`** 或 **RLS** | **Storage 政策／migration 未套到遠端**，與單檔幾 MB **無關**。請執行 **`20260322140000_repair_case_files_storage_rls.sql`**（及前述 UPDATE policy migration），並在 Supabase **SQL Editor** 跑完或 `supabase db push`。 |
| 錯誤含 **size** / **maximum** / **413** / **payload** | 才可能是 **單檔或專案上限**：Dashboard → **Project Settings → Storage**（全域）與 **Storage → `case-files` bucket**（`file_size_limit`）；**單一 bucket 上限不得高於專案全域上限**（見 [官方說明](https://supabase.com/docs/guides/storage/uploads/file-limits)）。 |
| 約 **20MB** 的檔案 | 通常低於免費方案常見 **50MB** 全域上限；若仍見 **RLS** 字樣，請**優先修政策**，不要只調容量。 |

- **Migration** `20260323120000_case_files_bucket_file_size_limit.sql`：將 `case-files` bucket 的 **`file_size_limit`** 設為 **50 MiB**（與常見上限對齊）；若專案全域更小，實際仍以 Dashboard 為準。

### 費用總表：篩選器與欄位顯示對齊（2026-04）

**現象（曾發生）**

- 詳情頁「營收內容」已勾選「請款完成」，但總表篩選「未勾選請款完成」仍會列出該筆。
- 非 TWD 客戶時，依「利潤」排序／數值篩選結果與畫面上以 TWD 顯示的利潤不一致。
- 「無須開立稿費」譯者：詳情頁「費率無誤」視為已勾選，總表欄位與篩選曾僅讀 `clientInfo.rateConfirmed`，與詳情頁不一致。

**根本原因**

- **`請款完成`**：詳情頁 [`ClientInfoSection.tsx`](../src/components/ClientInfoSection.tsx) 顯示為 `clientInfo.invoiced || isInClientInvoice`（已收錄客戶請款單即視為勾選）；總表篩選僅讀 `clientInfo.invoiced`，未納入「已在客戶請款單」。
- **`利潤`**：總表與頁尾統計以「客戶幣別營收 × 對 TWD 匯率 − 稿費（TWD）」計算；[`use-table-views.ts`](../src/hooks/use-table-views.ts) 的 `getFieldValue("profit")` 曾用「未換算營收 − 稿費」，排序／篩選與畫面數值不同維度。
- **`費率無誤`**：詳情頁對無稿費譯者強制顯示已勾選；篩選與總表欄位僅讀 `rateConfirmed`，未納入 [`member_translator_settings.no_fee`](../src/integrations/supabase/types.ts)（無須開立稿費）。

**已落地修正（須保留）**

| 項目 | 作法 |
|------|------|
| 請款完成 | [`use-table-views.ts`](../src/hooks/use-table-views.ts)：`invoiced` 為 true 若 `clientInfo.invoiced` **或** `FeeFilterContext.clientInvoices` 任一納入該 `fee.id`。總表 [`TranslatorFees.tsx`](../src/pages/TranslatorFees.tsx)「請款完成」欄同步：勾選狀態為「資料已勾選」或「已列入任一客戶請款單」（讀 [`clientInvoiceStore.getInvoices()`](../src/stores/client-invoice-store.ts)）。 |
| 利潤 | `getFieldValue("profit")` 與列顯示一致：依客戶選項幣別 [`currencyStore.getTwdRate`](../src/stores/currency-store.ts) 換算後再減稿費。 |
| 費率無誤 | [`select-options-store.ts`](../src/stores/select-options-store.ts)：`SelectOption` 增加 **`noFee`**（由 `loadAssignees` 回填 `member_translator_settings.no_fee`）。`getFieldValue("rateConfirmed")`：`rateConfirmed` 為 true 若 DB 已勾選 **或** `assignee` 對應選項 `noFee === true`。總表「費率無誤」欄：`checked` 與 **`editable && !noFee`** 與上述一致。 |

**維運注意**

- **`noFee`** 依賴 [`loadAssignees`](../src/stores/select-options-store.ts)；登入後 [`initSettings`](../src/stores/settings-init.ts) 會載入譯者選項。若極端情境下選項尚未載入，`noFee` 可能暫缺，行為會退回僅看 `rateConfirmed`（與舊版相近）。
- 篩選／排序用的費用欄位集中於 **`getFieldValue`**（[`use-table-views.ts`](../src/hooks/use-table-views.ts)）；新增「衍生顯示」欄位時，應同步檢查總表 `ColumnDef.render` 與 `getFieldValue`，避免再出現維度不一致。

**驗收（已通過）**

1. 費用僅因收錄客戶請款單而視為請款完成：總表勾選與「請款完成」篩選（含未勾選）一致。
2. 非 TWD 客戶：依利潤排序／篩選與畫面 TWD 利潤合理對齊。
3. 無須開立稿費譯者：總表「費率無誤」顯示勾選；篩選「已勾選費率無誤」包含該列。

## CAT：編輯器非列印字元、IME、確認跳行修復（2026-04-30）

### 問題緣由

開啟「顯示非列印字元」後，連續點選含空格的句段會累積重複空格點（·），且注音輸入法在特定句段會不斷自動提交未完成的組字內容；同時確認句段（Ctrl+Enter）偶有延遲。

### 解決方案（`cat-tool/app.js`、`cat-tool/style.css`）

| 項目 | 原因 | 作法 |
|------|------|------|
| **空格點重複疊加（Bug 1）** | `applyNonPrintMarkers` 被重複呼叫時未先清除舊 span，造成多個 span 殘留。 | 新增 `stripNonPrintMarkers`（清除舊 span + normalize）與 `refreshNonPrintMarkers`（先 strip 再 apply），所有重新套用處改用 `refreshNonPrintMarkers`。 |
| **空格無法退格刪除（Bug 1 衍生）** | `non-print-marker` span 設為 `contentEditable="false"`，瀏覽器退格遇到 span 時無法同步刪除相鄰空格字元。 | `keydown` 事件攔截 Backspace / Delete；偵測游標與 span 的相鄰關係，手動同步移除 span 與空格字元，再 dispatch `input` 觸發正常後續流程。 |
| **注音不斷自動輸入（Bug 2）** | `refreshNonPrintMarkers` 內的 `normalize()` 在 IME 組字期間被 RAF 觸發，干擾組字狀態造成循環提交。 | 加 `_isComposing` flag；`compositionstart` 設為 true、`compositionend` 設為 false 並補一次 refresh。`input` handler 的 RAF 以 `!_isComposing` 為門檻，組字期間不觸發 DOM 操作。 |
| **段落符號 ¶ 行為異常** | 曾用 DOM span 插入，後改 CSS `::after`，最終決定完全移除。 | 刪除 `.show-non-print .rt-editor::after` CSS 規則及對應 JS 插入邏輯。 |
| **確認跳行延遲** | Ctrl+Enter / 狀態圖示確認時，`await applyUpdateSegmentTarget()` 阻塞了 UI 更新與跳行。 | **方案 B（fire-and-forget）**：立刻更新 UI 狀態並跳行，目標寫入（`applyUpdateSegmentTarget`）與狀態／TM 寫入一起排入 `enqueueConfirmSideEffects`。衝突時以新增的 `showCatToast` 通知並透過 `_revertConfirmAndToast` 還原樂觀 UI。 |

### 新增輔助

- `showCatToast(msg, type)` — 固定右下角 3 秒 toast（`cat-toast` / `cat-toast-error`）。
- `_revertConfirmAndToast(seg, row, statusIcon, effectiveLocked, failureKind?)` — 確認失敗時統一還原 `seg.status`、statusIcon 與進度，並顯示 toast。第五參數 `'revision' \| 'other'`（Phase D）：樂觀鎖衝突與連線／伺服器等其他錯誤分別提示。

### 維運注意

- 手動刪空格的 `keydown` 攔截只在 `show-non-print` 模式下生效，一般模式不受影響。
- 衝突 toast 顯示後，使用者需回到該句段重新確認；衝突路徑已移除原本的 `alert()` 阻斷彈窗。
- `isConfirming = true` 必須在 `focusTargetEditorAtSegmentIndex`（觸發 blur）之前設好，以確保 blur handler 的 `wasConfirming` 能正確取到 `true`，防止 blur 重複寫庫。
- `clearTimeout(targetDebounceTimer)` 無法取消已開始執行的 debounce async 寫庫；與確認鏈並行時**曾**造成句段 revision 競態（單人亦可能）。已於 [`cat-tool/app.js`](../cat-tool/app.js) 以串行化／確認前 flush／衝突後重試／toast 分類緩解；緣起與細節見 [CAT_SEGMENT_REVISION_CONFLICT_PLAN.md](./CAT_SEGMENT_REVISION_CONFLICT_PLAN.md)。

## CAT：編輯器待修清單（2026-05 更新）

維護時以 [`cat-tool/app.js`](../cat-tool/app.js) 為主，樣式見 [`cat-tool/style.css`](../cat-tool/style.css)，改後依 [`AGENTS.md`](../AGENTS.md) 執行 `npm run sync:cat` 並一併提交 `public/cat`。

文中 **待定案（游標／焦點）** 將於優先處理其他議題後再接；已定稿之落地變更見下「近期已落地變更紀錄」與「已落地」表格。

### 句段 revision／確認衝突（已落地 Phase A–D）

| 項目 | 說明 |
|------|------|
| **句段 revision 並行寫庫衝突** | 方案 B 下曾發生 debounce 與確認鏈並行寫同句。已於 [`cat-tool/app.js`](../cat-tool/app.js) 串行化寫庫、確認前 flush、團隊模式衝突後重試一次、確認失敗 toast 分 revision／其他錯誤。細節見 [CAT_SEGMENT_REVISION_CONFLICT_PLAN.md](./CAT_SEGMENT_REVISION_CONFLICT_PLAN.md)。 |

**假游標模組**：[`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)；`app.js` 薄封裝含 `restoreOrShowFakeCatCaret`、`setSavedCaret`（經 `moveCaretToEndAndShowFakeInTarget` 等呼叫）。

### 近期已落地變更紀錄（摘要）

以下為可與 git 核對之摘要（使用者驗收通過之批次）。

| 主題 | 使用者可感知效果 | 實作位置（維運） |
|------|------------------|------------------|
| 非列印「空格點」結構 | 空格類字元改為單一可編輯 wrapper（`.np-inline-char`），符號以 CSS `::after` 顯示，較不易出現方向鍵須連按兩次 | [`cat-tool/app.js`](../cat-tool/app.js) `applyNonPrintMarkers`、`stripNonPrintMarkers`、`getNpCaretOffset`／`setNpCaretOffset` walker；[`cat-tool/style.css`](../cat-tool/style.css) |
| 非列印鍵盤與 overlay | 區分「空白 wrapper」與換行箭頭等 overlay（`isNpOverlayMarker`）；Backspace／Delete／Arrow 行為對應調整 | 同上 `app.js` 譯文欄 `keydown` |
| `confirmOp` 還原／重做與後台 | **Ctrl+Z／Ctrl+Y** 觸發批次確認類還原／重做時：**畫面先更新**，寫庫與 TM 操作排入 `enqueueConfirmSideEffects`（與確認句段「先有感再跟上」一致） | [`cat-tool/app.js`](../cat-tool/app.js) `applyEditorUndo`／`applyEditorRedo` 之 `confirmOp` 分支 |
| 句段 revision 寫庫競態（團隊模式） | 較少出現「伺服器版本較新」類確認失敗 toast；方案 B 仍為先更新 UI 再寫庫 | [`cat-tool/app.js`](../cat-tool/app.js) `segmentTargetWriteTails`、`awaitPendingSegmentTargetWritesForSeg`、`hydrateSegmentRevisionFromDb`、`applyUpdateSegmentTarget`（內含重試）、`_revertConfirmAndToast(..., failureKind)`、`enqueueConfirmSideEffects`；commit `77a1fcc` |
| 編輯器底欄進度與「調整統計範圍」 | 「調整統計範圍」為獨立白底黑字按鈕，綠色進度填色僅在軌道內 | [`cat-tool/index.html`](../cat-tool/index.html) `#progressFill`、`#btnProgressRange`、`.editor-status-bar-progress-wrap`、`.btn-progress-range-adjust`；[`cat-tool/style.css`](../cat-tool/style.css)；commit `153069d` |

**Commit 參考**：`03cadc7`（np-inline-char、`confirmOp` 樂觀重繪等較早批次）；**另見上表最後兩列**與下「其他近期落地（維運備查）」。實際範圍請以 `git show` 為準。

### 其他近期落地（維運備查）

| Commit | 摘要 |
|--------|------|
| `e11bbe0` | 批次 Excel 欄位設定按鈕修正未定義 `label`（`ReferenceError`） |
| `3a887b9` | CAT tag pill：`equiv-text`、`bpt`／`ept` displaytext、`{0}` textContent fallback |
| `3348922` | 批次匯入 CAT 作業檔（多選、mqxliff 角色、Excel 欄位、進度摘要）；細節與驗收見 [CAT_BATCH_IMPORT_WIZARD_SESSION.md](./CAT_BATCH_IMPORT_WIZARD_SESSION.md) |
| `7eb8062` | TM 相符度：大小寫不同、內容相同時給 99% 相似度 |
| `9f7b2bc` | [`CAT_VIEW_SPEC.md`](./CAT_VIEW_SPEC.md) 版面／用語；[`previews/cat-view-spec-ui-preview.html`](./previews/cat-view-spec-ui-preview.html) HTML 預覽 |

### 已落地（近期）

| 項目 | 摘要 |
|------|------|
| **搜尋導覽** | `runSearchAndFilter` 結尾不再自動搶焦點；計數為 `— / n`。上一個／下一個（及 **F3**／**Shift+F3**）依真選取、假游標、或（焦點在搜尋列／導覽按鈕時）**目前高亮 `mark`** 為錨找下一／上一命中。**原文／額外／Key** 命中時亦對該 `mark` **選取並 `focus` 宿主格**（`tabIndex=-1`），避免選取留在譯文導致再按「下一個」卡住；`isSfNavAnchorUiActive` 涵蓋 `#btnSfPrev`／`#btnSfNext`／`#btnSfClearNav`，與 `isSfSearchControlActive` 分開以免抑制 `scrollIntoView`。 |
| **取代這個** | 譯文格內正在命中 mark 上則取代該次 occurrence；否則自錨點找下一譯文命中。取代後跳到下一譯文命中；已移除句尾 `focus/blur` 假游標路徑。 |
| **F4 全部取代** | （先前）不清篩選、可選回到暫存游標。 |
| **非列印空格（np-inline-char）** | 見「近期已落地變更紀錄」表；`extractTextFromEditor`、搜尋高亮對應、`countEditorChars` 等已將 wrapper 內文字納入線性順序。 |
| **§1 退格／§2 方向鍵** | 非列印模式下：**空白類**已改 **`.np-inline-char`**（單一節點 + `::after`）；**換行箭頭**等仍為 overlay `.non-print-marker`。退格／刪除／箭頭分支區分 overlay（`isNpOverlayMarker`）與 inline-char；`container.nodeType === 1` 時可刪緊鄰 overlay／`.rt-tag`／inline-char；**ArrowLeft/Right**「一次跳過」**僅針對 overlay**（不再誤解為舊版「文字 + dot 雙節點」）。 |
| **§4 Ctrl+F8** | 非列印模式下 `getNpCaretOffset` → `setEditorHtml` 後雙 RAF `setNpCaretOffset` 還原。 |
| **§5 批次確認 undo** | 多選批次確認（工具列快捷與右鍵 `ctxBatchConfirm`）在 `enqueueConfirmSideEffects` **之前**即 `pushUndoEntry(confirmOp)`，async 尾端只更新同一物件之 `tmUndo`／`tmRedo`／`afterSnapshots`。單句 Ctrl+Enter／狀態圖示確認仍僅在快照有差異時同步入堆疊。 |
| **confirmOp 還原／重做樂觀重繪** | **Ctrl+Z／Ctrl+Y** 執行 `confirmOp`：**先** `renderEditorSegments`、`runSearchAndFilter`、TM 區更新與 `updateProgress`，**再**於 `enqueueConfirmSideEffects` 內 `persistSegStateToDb` 與 TM undo/redo。與 §5 分工：§5 為 **undo 堆疊 push 時機**；本列為 **按下 Z／Y 當下**畫面與寫庫順序。 |
| **§6 Ctrl+K** | 有選取文字觸發 TM 後，雙 RAF 改呼叫 `restoreOrShowFakeCatCaret()`。 |
| **§7 `.rt-tag` 視覺** | `.col-target .grid-textarea .rt-tag { margin-right: 0.18em; }`。 |
| **§8 `moveCaretToEndAndShowFakeInTarget`** | 改為 `catFakeCaret.setSavedCaret` + `show()`，無 `focus/blur`。 |
| **Ctrl+Z／Y（target undo）** | `applyOneTargetUndo` 於 `setEditorHtml` 後以字串前後綴 diff 計算結尾偏移，`scheduleNpCaretAfterTargetUndo` + `setNpCaretOffset`；`compound` 逐筆套用時以最後一次排程為準。 |

### 搜尋／取代語意（文件備忘）

- **輸入搜尋字重繪**：只更新高亮與 `— / 總數`，不變更使用中命中索引與焦點。
- **全域命中順序（`sfSearchMatches`）**：同一列內為 **原文 → 額外資訊 → 譯文 → Key0 → Key1 → …**；`collectSearchMatchesFromExistingRowMarks` 與完整重畫路徑一致。
- **取代這個**：與「下一個譯文命中」共用錨點；命中選取時取代該 DOM mark 對應之第 k 次字面 occurrence（`replaceOccurrenceInPlain`）。

### 待定案事項（游標／焦點；尚未實作）

以下項目尚未實作；**還原（Ctrl+Z）與重做（Ctrl+Y）須採同一套規則**，避免「退一步順、進一步又亂」。

1. **`confirmOp`／`segmentState` 還原與重做後的輸入位置**  
   - **現象**：整表重繪或整列重設譯文後，游標／閱讀位置未必留在使用者預期那句、那句的字後；反覆 Z／Y 試錯時特別打斷。  
   - **技術錨點**：目前僅 **kind: target**（與 **compound** 內逐筆 target）有「變更後偏移」排程；`confirmOp`、`segmentState` 尚未套用。  
   - **待定**：批次／多列時 **以哪一句為「主句」**（例如作用列若仍在變更集合內則優先）待拍板。

2. **`compound`（多句譯文同一步還原／重做）**  
   - **現象**：若維持「只排程一次」游標補位，結果等同 **只跟最後一句**，與使用者心里「我正在改這句」可能不符。  
   - **待定**：列為**已知限制**或另訂規則（例如僅主句、或接受最後一句）。

3. **`focusTargetEditorAtSegmentIndex` 與假游標 API**  
   - **現象**：「跳到下一句立刻能打」需要真焦點；「只標位置、避免 blur 連鎖」適合假游標。情境不同。  
   - **待定**：**不宜一律**把真焦點路徑換成假游標；逐一路徑收斂時應註明使用者情境（須能打字 vs 僅視覺錨點）。原先「仍混用 `setCaretAtEditorStart`」之路徑亦同，併入此項評估。

### 補充：已確認無需改動之行為（盤點結論）

- **FRG 與 TB**：`handleCatResultApply` 之非 `TM` 分支皆走 `insertPlainTextAtCaret`，雙擊／Ctrl+1–9 套用後游標在插入文字之後，行為一致。
- **單句複製原文／清除譯文、單句確認**：焦點與 undo 行為符合預期。

## 延伸閱讀

- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) — 本機／遠端 Supabase 部署步驟、case-files 與 Slack、驗收與 `db push` 失敗排除
- [CAT_BATCH_IMPORT_WIZARD_SESSION.md](./CAT_BATCH_IMPORT_WIZARD_SESSION.md) — 批次匯入 CAT 作業檔精靈（構想、程式錨點、`label` 修正、「全部相同」勾選與「開始匯入」啟用條件、手動驗收）
- [CODEMAP.md](./CODEMAP.md) — 模組對照
- `data-migration/README.md` — 資料遷移（若存在）
- `.cursor/plans/` — 歷史計畫檔（若使用 Cursor 計畫功能）

## 建議的修改方式

1. **先跑** `npm run build` 再交 PR。  
2. **`SettingsPage.tsx` 已精簡**：僅負責排版與 `canViewSection`／`isAdmin`；實際 UI 在 `src/components/settings/*.tsx`。  
3. **譯者備註**（`TranslatorNotesSection`）與 **譯者單價級距**（`TranslatorTierSection`）皆受 **`translator_tiers`** 設定區塊權限控制（同區塊一併顯示）。  
4. 共用的小工具放 `src/lib/`（例如 `settings-color-usage.ts`、`settings-editable-cells.ts`）。
