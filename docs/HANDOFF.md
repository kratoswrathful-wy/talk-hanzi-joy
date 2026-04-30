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
- `_revertConfirmAndToast(seg, row, statusIcon, effectiveLocked)` — 確認失敗時統一還原 `seg.status`、statusIcon 與進度，並顯示 toast。

### 維運注意

- 手動刪空格的 `keydown` 攔截只在 `show-non-print` 模式下生效，一般模式不受影響。
- 衝突 toast 顯示後，使用者需回到該句段重新確認；衝突路徑已移除原本的 `alert()` 阻斷彈窗。
- `isConfirming = true` 必須在 `focusTargetEditorAtSegmentIndex`（觸發 blur）之前設好，以確保 blur handler 的 `wasConfirming` 能正確取到 `true`，防止 blur 重複寫庫。

## CAT：編輯器待修清單（2026-04-30 盤點）

以下為對話中盤點、**尚未實作**之項目；實作時以 [`cat-tool/app.js`](../cat-tool/app.js) 為主，樣式見 [`cat-tool/style.css`](../cat-tool/style.css)，改後依 [`AGENTS.md`](../AGENTS.md) 執行 `npm run sync:cat` 並一併提交 `public/cat`。

### 1. tag 旁空格仍刪不掉（非列印字元模式）

- **現象**：空格點緊貼 `{N}` 標籤（`.rt-tag`）時，退格有時無法刪除該空格。
- **根因**：Backspace/Delete 攔截只處理 `container.nodeType === 3`（文字節點）。游標落在 `.non-print-marker` span 與 `.rt-tag` span **之間**時，`container` 常為父層 `rt-editor`（元素節點），現有分支皆不命中，瀏覽器對 `contentEditable="false"` span 的退格被靜默忽略。
- **修法**：在 `keydown` 攔截補 `container.nodeType === 1` 分支，依 `offset` 讀 `childNodes[offset-1]` / `childNodes[offset]` 判斷是否為 `.non-print-marker`，手動移除 span 與對應空格。

### 2. 方向鍵需按兩下才能穿過 · 標記

- **現象**：顯示非列印字元時，按左右鍵穿越「空格＋點」要按兩次。
- **根因**：`contentEditable="false"` 的 `.non-print-marker` span 在瀏覽器游標模型中仍是獨立停靠點。
- **修法**：在 `keydown` 攔截 ArrowLeft / ArrowRight，偵測游標緊鄰 span 時一次跳過 span（與其配對之空格邊界）。

### 3. F4 全部取代／「取代這個」：焦點與假游標異常

- **現象**：搜尋／取代列輸入後按 F4（或按「取代這個」），焦點不回到預期處、假游標位置錯亂。
- **根因**：[`moveCaretToEndAndShowFakeInTarget`](../cat-tool/app.js) 使用 `ed.focus()` + `ed.blur()`，觸發譯文欄完整 `focus`／`blur` 鏈（lease、`maybeAutoFillEmptyTarget`、`emitCollabEdit`、`applyUpdateSegmentTarget` 等）；`catSavedCaret` 被覆寫；`blur()` 後焦點常落到 `document.body`。
- **修法**：勿用 `focus()/blur()` 僅為設定假游標；直接 `createRange()`、`selectNodeContents` + `collapse(false)` 寫入 `catSavedCaret`，再 `requestAnimationFrame(showCatFakeCaretFromSaved)`。

### 4. Ctrl+F8 清除標籤後游標跑到譯文開頭

- **根因**：`setEditorHtml` 替換 innerHTML 後游標預設在 offset 0，未還原原位置。
- **修法**：`setEditorHtml` 前後儲存／還原游標（例如沿用 `getNpCaretOffset`／`setNpCaretOffset` 或 `saveCatCaretFromSelection` + `restoreSavedCaretIntoEditor`）。

### 5. 批次確認（右鍵多句確認）與 Ctrl+Z 競態

- **現象**：一次確認多句後立刻復原，似乎只復原「其中一行」或行為不符預期。
- **根因**：`ctxBatchConfirm` 的 `pushUndoEntry({ kind: 'confirmOp', ... })` 在 `enqueueConfirmSideEffects` 的 **async** 尾端才入堆疊；若使用者在該 async 完成前按 Ctrl+Z，堆疊頂端仍是更早的單行紀錄。
- **修法**：將 `confirmOp` 的 `pushUndoEntry` 改為**同步**入堆疊（可先推入 `beforeSnapshots`，TM 結果回來後再補 `afterSnapshots` 與 `tmUndo`／`tmRedo`），或等價保證「批次確認」與「一次 undo」原子對應。

### 6. Ctrl+K（TM 搜尋）結束後回焦應統一至假游標

- **現象**：依有無選取、來自譯文／原文／Key 欄，結束後焦點落在搜尋欄、譯文開頭、選取結尾等，不一致。
- **修法**：TM 分頁切換與（若有）搜尋執行完成後，統一：
  ```javascript
  requestAnimationFrame(() => {
      if (!restoreSavedCaretIntoEditor()) showCatFakeCaretFromSaved();
  });
  ```

### 7. tag 右側邊線吃掉文字游標（視覺）

- **現象**：游標緊貼在標籤右側時，插入游標幾乎被 `.rt-tag` 邊框遮住。
- **修法**：調整 [`cat-tool/style.css`](../cat-tool/style.css) 中 `.rt-tag`（例如右側 `margin`／`padding` 或邊框繪製方式），讓 caret 可見。

### 8. 「回到假游標／儲存游標」行為全面一致化

- **問題**：同類需求混用 `setCaretAtEditorStart`、`setCaretAtEditorEnd`、`restoreSavedCaretIntoEditor`、`moveCaretToEndAndShowFakeInTarget`、直接 `focus/blur` 等，副作用與使用者預期不一。
- **標準 pattern**（與「新增術語」完成後一致）：`restoreSavedCaretIntoEditor()` 失敗則 `showCatFakeCaretFromSaved()`，包在 `requestAnimationFrame`（必要時雙 RAF）內。
- **優先統一入口**：Ctrl+K、F4／取代這個、`moveCaretToEndAndShowFakeInTarget`、Ctrl+F8，以及未來新增之「離開譯文欄後要回到上次編輯點」操作。

### 補充：已確認無需改動之行為（盤點結論）

- **FRG 與 TB**：`handleCatResultApply` 之非 `TM` 分支皆走 `insertPlainTextAtCaret`，雙擊／Ctrl+1–9 套用後游標在插入文字之後，行為一致。
- **單句複製原文／清除譯文、單句確認**：焦點與 undo 行為符合預期。

## 延伸閱讀

- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) — 本機／遠端 Supabase 部署步驟、case-files 與 Slack、驗收與 `db push` 失敗排除
- [CODEMAP.md](./CODEMAP.md) — 模組對照
- `data-migration/README.md` — 資料遷移（若存在）
- `.cursor/plans/` — 歷史計畫檔（若使用 Cursor 計畫功能）

## 建議的修改方式

1. **先跑** `npm run build` 再交 PR。  
2. **`SettingsPage.tsx` 已精簡**：僅負責排版與 `canViewSection`／`isAdmin`；實際 UI 在 `src/components/settings/*.tsx`。  
3. **譯者備註**（`TranslatorNotesSection`）與 **譯者單價級距**（`TranslatorTierSection`）皆受 **`translator_tiers`** 設定區塊權限控制（同區塊一併顯示）。  
4. 共用的小工具放 `src/lib/`（例如 `settings-color-usage.ts`、`settings-editable-cells.ts`）。
