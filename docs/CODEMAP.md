# 程式碼對照（CODEMAP）

> 快速查「功能在哪個檔案」。非完整列表，以維運最常碰到的為主。

## 路由與版面

| 項目 | 位置 |
|------|------|
| 路由表 | `src/App.tsx` |
| 側欄 / 外層 | `src/components/AppLayout.tsx`、`AppSidebar.tsx` |

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
| 設定主頁（仍較大） | `src/pages/SettingsPage.tsx` |
| 狀態標籤區塊 | `src/components/settings/StatusStyleSection.tsx` |
| 工具列按鈕樣式 | `src/components/settings/ToolbarButtonStyleSection.tsx` |
| Slack 設定 | `src/components/settings/SlackSettingsSection.tsx` |
| ColorPicker 使用顏色聚合 | `src/lib/settings-color-usage.ts` |

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
