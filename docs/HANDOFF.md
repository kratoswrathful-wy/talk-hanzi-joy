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
| `src/components/settings/` | 設定頁拆出之區塊（Slack、工具列按鈕、**狀態標籤**等） |
| `docs/` | 本文件與 `CODEMAP.md` |
| **`ops_incidents`（Supabase）** | 重大故障／維運紀錄時間線（與本文件分工：文件管「怎麼修」、表管「何時／結論」）；管理員於**設定**頁可唯讀瀏覽 |

更細的對照表見 [CODEMAP.md](./CODEMAP.md)。

## 案件資料量與詳情頁

- **`case-store`** 仍會在背景執行**全表** `cases` 載入（列表／同步用）。  
- **案件詳情頁**改為優先呼叫 **`loadCaseIfMissing(id)`**：只向 DB 取**單一列**，避免在案件極多時卡在「全表載入」導致黑畫面或長時間載入。  
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

### Windows / PowerShell 建置

- 在 PowerShell 中請使用：  
  `Set-Location "專案路徑"; npm run build`  
  避免單行使用 `&&`（部分環境會解析失敗）。

### 工具列按鈕 registry

- 灰色操作已拆為 5 個 id（`cases_detail_revert_to_draft` 等），請勿再使用已移除的 `cases_detail_neutral`。

## 延伸閱讀

- [CODEMAP.md](./CODEMAP.md) — 模組對照
- `data-migration/README.md` — 資料遷移（若存在）
- `.cursor/plans/` — 歷史計畫檔（若使用 Cursor 計畫功能）

## 建議的修改方式

1. **先跑** `npm run build` 再交 PR。  
2. **`SettingsPage.tsx` 已精簡**：僅負責排版與 `canViewSection`／`isAdmin`；實際 UI 在 `src/components/settings/*.tsx`。  
3. **譯者備註**（`TranslatorNotesSection`）與 **譯者單價級距**（`TranslatorTierSection`）皆受 **`translator_tiers`** 設定區塊權限控制（同區塊一併顯示）。  
4. 共用的小工具放 `src/lib/`（例如 `settings-color-usage.ts`、`settings-editable-cells.ts`）。
