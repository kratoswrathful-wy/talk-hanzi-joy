# 程式碼對照（CODEMAP）

> 快速查「功能在哪個檔案」。非完整列表，以維運最常碰到的為主。

## 路由與版面

| 項目 | 位置 |
|------|------|
| 路由表 | `src/App.tsx` |
| 側欄 / 外層 | `src/components/AppLayout.tsx`、`AppSidebar.tsx` |
| 個人檔案 | `src/pages/ProfilePage.tsx`（`useAuth` 須含 `isAdmin` 等，見 `HANDOFF.md`） |

## CAT 內嵌編譯器（`/cat`）

| 項目 | 位置 |
|------|------|
| **唯一原始碼目錄** | `cat-tool/`（`app.js`、`db.js`、`index.html`、`js/`、`style.css` 等） |
| 靜態輸出（勿單獨當真相長改） | `public/cat/`（由 `npm run sync:cat`、腳本 `scripts/sync-cat.mjs` 覆寫；`prebuild` 會跑） |
| 捷徑說明 | 根目錄 `AGENTS.md`、`.cursor/rules/cat-tool-source.mdc` |
| 準則／專案準則／團隊版雲端 AI 變更與部署 | [CAT_AI_GUIDELINES_AND_PROJECT_RULES.md](./CAT_AI_GUIDELINES_AND_PROJECT_RULES.md) |

### CAT：防殘影、深連結載入、詳情頁 key

手動驗收已通過（見 [`HANDOFF.md`](./HANDOFF.md)「CAT：防殘影…」小節）。

| 項目 | 位置 |
|------|------|
| fetch 前清空／切 view（專案／TM／TB／編輯器） | `cat-tool/app.js`：`beginOpenProjectDetailLoading`、`beginOpenTmDetailLoading`、`beginOpenTbDetailLoading`、`beginEditorViewLoadingShell` |
| 深連結首屏主區「載入中」 | `cat-tool/index.html`：`#catMainRouteLoading`；頁尾 inline script 與 `restoreCatRouteFromSession` 之 `finally`（`hideCatMainRouteLoadingEl`） |
| 樣式（主區載入 vs 全螢幕 overlay） | `cat-tool/style.css`：`.cat-main-route-loading` |
| TMS 詳情頁 **`key={id}`** | `src/App.tsx`：`CaseDetailPageWrapper`、`InvoiceDetailPageWrapper`、`ClientInvoiceDetailPageWrapper`、`PageTemplateEditorPageWrapper`、`InternalNotesPageWrapper` |
| 父頁／iframe 網址不同步（待評估） | `src/pages/CatToolPage.tsx`（見 `HANDOFF.md`「已知後續風險」） |

### CAT：線上 TB 分頁（online tabs）關鍵對照

| 項目 | 位置 |
|------|------|
| 分頁資料升級（舊單一 URL → `onlineTabs`） | `cat-tool/app.js`：`migrateOnlineTbToTabs` |
| 分頁卡渲染與拖曳排序 | `cat-tool/app.js`：`renderOnlineTabsSection` |
| 分頁新增/更新流程（確認並擷取） | `cat-tool/app.js`：`openTbTabModal`、`_runTbTabFetch`、`_tbTabFetchFailed` |
| 分頁刪除與術語重編號 | `cat-tool/app.js`：`deleteTbTab` |
| 術語列表來源欄與分頁篩選 | `cat-tool/app.js`：`loadTbTermsList`、`renderTbTabFilters` |
| 分頁管理區與 modal DOM | `cat-tool/index.html`：`#tbOnlineTabsSection`、`#tbTabModal` |
| 術語來源欄表頭 | `cat-tool/index.html`：`#tbTermSourceHeader` |
| Supabase 結構（分頁欄位） | `supabase/migrations/20260429210000_cat_tbs_online_tabs.sql`：`online_tabs` |
| 雲端 RPC 讀寫映射 | `src/lib/cat-cloud-rpc.ts`：`onlineTabs` ↔ `online_tabs` |

> 維運提醒：CAT 功能只改 `cat-tool`；任何異動後都要 `npm run sync:cat` 並同步提交 `public/cat`。

### CAT：提問整合（客戶表單 / LMS 案件綁定）

| 項目 | 位置 |
|------|------|
| 專案詳情（檔案清單、LMS 案件欄位） | `cat-tool/index.html`：`#viewProjectDetail`、`#filesListBody` |
| 編輯器工具列（客戶表單 / 內部註記按鈕顯示） | `cat-tool/index.html`：`#viewEditor`、`.editor-toolbar` |
| 編輯器底部資訊列（進度條與「使用者」標籤） | `cat-tool/index.html`：`.editor-status-bar` |
| 使用者標籤渲染與顯隱 | `cat-tool/app.js`：`collabPresenceBar` 相關邏輯 |
| 提問表單 / 內部註記按鈕條件顯示主邏輯 | `cat-tool/app.js`（依專案 URL、檔案 `LMS 案件` 綁定狀態判斷） |
| 專案外部連結儲存後 inline 顯示與可點擊 | `cat-tool/app.js`（專案設定渲染與保存流程） |
| 檔案批次連結案件、批次指派 | `cat-tool/app.js`（檔案清單勾選批次操作） |
| iframe 與主站通訊橋接（開啟內部註記 / 帶入預填） | `src/pages/CatToolPage.tsx`（`postMessage` bridge） |
| 由編輯器建立註記的預填與命名規則收斂 | `src/pages/InternalNotesPage.tsx`、`src/pages/CatToolPage.tsx` |
| 既有內部註記建立入口（對照 `relatedCase` 語意） | `src/pages/CaseDetailPage.tsx`：`handleCreateInternalNote` |
| 內部註記 `relatedCase` 映射 | `src/stores/internal-notes-store.ts`：`relatedCase` ↔ `related_case` |
| 案件狀態驅動 CAT 指派同步（`詢案中 -> 已派出`） | `src/stores/case-store.ts`（狀態轉換偵測與同步） |
| CAT 資料表（提問/綁案/指派） | `cat_projects`、`cat_files`、`cat_file_assignments` |
| 內部註記資料表 | `internal_notes` |

> 實作注意：僅「客戶表單」「內部註記」屬條件式按鈕；`AI 輔助` 必須維持原顯示規則，不可連帶隱藏。

## 案件

| 項目 | 位置 |
|------|------|
| 案件列表 | `src/pages/CasesPage.tsx` |
| 案件詳情 | `src/pages/CaseDetailPage.tsx` |
| 重複標題邏輯 | `src/lib/case-title-duplicate.ts`、測試 `*.test.ts` |
| 案件資料 store | `src/hooks/use-case-store.ts`、`src/stores/case-store.ts`（依實際 import） |

## 費用管理（稿費總表／請款）

| 項目 | 位置 |
|------|------|
| 費用總表頁 | `src/pages/TranslatorFees.tsx`（欄位定義 `allColumnDefs`、篩選上下文 `filterCtx`） |
| 費用詳情頁 | `src/pages/TranslatorFeeDetail.tsx` |
| 總表篩選／排序取值（**須與欄位顯示同一維度**） | `src/hooks/use-table-views.ts`：`getFieldValue`、`FeeFilterContext`（`invoices`、`clientInvoices`） |
| 營收區（對帳／請款完成 checkbox） | `src/components/ClientInfoSection.tsx` |
| 稿費資料 store | `src/stores/fee-store.ts`、`src/hooks/use-fee-store.ts` |
| 客戶請款單 store（總表「請款完成」欄衍生顯示） | `src/stores/client-invoice-store.ts` |
| 譯者選項含 **`noFee`**（無須開立稿費，`member_translator_settings.no_fee`） | `src/stores/select-options-store.ts`：`loadAssignees` |
| 客戶幣別 → TWD 匯率（利潤換算） | `src/stores/currency-store.ts` |

> 維運：`請款完成`／`利潤`／`費率無誤` 曾發生「詳情與總表篩選不一致」；修正紀錄與驗收見 [`HANDOFF.md`](./HANDOFF.md)「費用總表：篩選器與欄位顯示對齊」。

## 設定頁

| 項目 | 位置 |
|------|------|
| 設定主頁（版面／權限 gate） | `src/pages/SettingsPage.tsx` |
| 任務類型／計費單位／派案來源／客戶報價 | `TaskTypeOrderSection.tsx`、`BillingUnitOrderSection.tsx`、`DispatchRouteSection.tsx`、`ClientPricingSection.tsx`（皆在 `src/components/settings/`） |
| 譯者備註（拖曳排序、DB） | `src/components/settings/TranslatorNotesSection.tsx` |
| 譯者單價級距（含 modal／驗證） | `src/components/settings/TranslatorTierSection.tsx` |
| 圖示庫 | `src/components/settings/IconLibrarySection.tsx` |
| 狀態標籤區塊 | `src/components/settings/StatusStyleSection.tsx` |
| 內部註記狀態／性質 | `src/components/settings/NoteSelectSection.tsx` |
| 請款管道 | `src/components/settings/BillingChannelSection.tsx` |
| 內容性質 | `src/components/settings/CaseCategorySection.tsx` |
| 貨幣設定 | `src/components/settings/CurrencySettingsSection.tsx` |
| 工具列按鈕樣式 | `src/components/settings/ToolbarButtonStyleSection.tsx` |
| Slack（連結／說明／承接預設文案） | `src/components/profile/ProfileSlackCard.tsx`（個人檔案）；承接／無法承接通知 `src/lib/slack-case-reply-notify.ts`、`src/lib/slack-case-reply-defaults.ts` |
| 重大故障／維運紀錄（DB `ops_incidents`，管理員） | `src/components/settings/OpsIncidentsSection.tsx` |
| ColorPicker 使用顏色聚合 | `src/lib/settings-color-usage.ts` |
| `case-files` 上傳路徑／檔名 | `src/lib/storage-case-files.ts`（`buildCaseFileObjectPath`） |
| 報價格／級距 Tab 切換可編輯格 | `src/lib/settings-editable-cells.ts`（`handleTabKeyDown`、`focusNextEditableCell`） |

## 工具列按鈕（顏色 / 文案 / 圖示 / 群組）

| 項目 | 位置 |
|------|------|
| 按鈕註冊表 | `src/lib/ui-button-registry.ts` |
| 狀態與持久化 | `src/stores/ui-button-style-store.ts` |
| 預設群組版面 | `src/lib/ui-toolbar-groups-defaults.ts` |
| 圖示渲染 | `src/lib/ui-button-icon-render.tsx` |

## 下拉選項與標籤樣式

| 項目 | 位置 |
|------|------|
| 選項（含狀態標籤、客戶等） | `src/stores/select-options-store.ts`（`STATUS_TABLE_MAP`、`ALL_STATUS_TABLES`） |
| 標籤字色等 | `src/stores/label-style-store.ts` |

## 新增設定區塊的建議步驟

1. 在 `src/components/settings/MySection.tsx` 實作 UI。  
2. 在 `SettingsPage.tsx` import 並插入版面。  
3. 若需跨區塊共用小函式，放 `src/lib/` 並補一句 JSDoc。
