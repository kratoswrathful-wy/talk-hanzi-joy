# 程式碼對照（CODEMAP）

> 快速查「功能在哪個檔案」。非完整列表，以維運最常碰到的為主。

## 路由與版面

| 項目 | 位置 |
|------|------|
| 路由表 | `src/App.tsx` |
| 側欄 / 外層 | `src/components/AppLayout.tsx`、`AppSidebar.tsx` |
| 個人檔案 | `src/pages/ProfilePage.tsx`（`useAuth` 須含 `isAdmin` 等，見 `HANDOFF.md`） |

## 案件

| 項目 | 位置 |
|------|------|
| 案件列表 | `src/pages/CasesPage.tsx` |
| 案件詳情 | `src/pages/CaseDetailPage.tsx` |
| 重複標題邏輯 | `src/lib/case-title-duplicate.ts`、測試 `*.test.ts` |
| 案件資料 store | `src/hooks/use-case-store.ts`、`src/stores/case-store.ts`（依實際 import） |

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
| Slack（連結／說明） | `src/components/profile/ProfileSlackCard.tsx`（個人檔案） |
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
