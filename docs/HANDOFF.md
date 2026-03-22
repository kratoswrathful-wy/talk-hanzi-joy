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

- [CODEMAP.md](./CODEMAP.md) — 模組對照
- `data-migration/README.md` — 資料遷移（若存在）
- `.cursor/plans/` — 歷史計畫檔（若使用 Cursor 計畫功能）

## 建議的修改方式

1. **先跑** `npm run build` 再交 PR。  
2. **`SettingsPage.tsx` 已精簡**：僅負責排版與 `canViewSection`／`isAdmin`；實際 UI 在 `src/components/settings/*.tsx`。  
3. **譯者備註**（`TranslatorNotesSection`）與 **譯者單價級距**（`TranslatorTierSection`）皆受 **`translator_tiers`** 設定區塊權限控制（同區塊一併顯示）。  
4. 共用的小工具放 `src/lib/`（例如 `settings-color-usage.ts`、`settings-editable-cells.ts`）。
