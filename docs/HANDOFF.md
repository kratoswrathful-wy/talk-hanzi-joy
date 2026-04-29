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

## CAT：提問整合（客戶表單 / LMS 案件綁定）維運硬規則

### 條件式按鈕與不可受影響按鈕

- 條件式按鈕僅限：**`客戶表單`**、**`內部註記`**。
  - `客戶表單`：僅在專案已設定客戶表單 URL 時顯示。
  - `內部註記`：僅在目前檔案已綁定 `LMS 案件` 時顯示。
- **`AI 輔助` 按鈕不得連帶隱藏**：無論情境 A/B，都維持原本顯示邏輯（例如權限、模式、設定），不可被「客戶表單 / 內部註記」條件一併包住。

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
