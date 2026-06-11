# 1UP CAT／LMS 整合實作紀錄（2026-06）

> **主紀錄**：本聊天室脈絡下「案件頁 1UP CAT」從第二波 UX → 方案 B+D2 → UX 微調與遷移腳本 → 加號樣式統一之完整開發與驗收歷程。  
> 上層計畫對照：[`CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md`](./CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md) §4.1。  
> 自研工具批次遷移細節：[`CAT_MIGRATE_LEGACY_CAT_TOOL_2026-06.md`](./CAT_MIGRATE_LEGACY_CAT_TOOL_2026-06.md)。

---

## 1. 背景

Phase A 目標是在 LMS 案件詳情頁，以 **`cases.cat_tool_enabled` + `cat_files.related_lms_case_id`** 取代舊「自研工具」手動填專案名／檔名／連結的流程。

本紀錄涵蓋四個已推送 commit，依時間先後：

| 順序 | Commit | 摘要 |
|------|--------|------|
| 1 | `7ae0fc5` | CAT／LMS UX **第二波** |
| 2 | `a4acbc1` | **方案 B + D2**（`cat_tool_enabled`、工具總數、移除解綁） |
| 3 | `3fc97f1` | **UX 微調**（按鈕並列、專案名連結）+ **遷移腳本 dry-run** |
| 4 | `27d0585` | **加號圖示**與「新增工具」統一（已驗收） |

---

## 2. 第二波 UX（`7ae0fc5`）

### 產品行為

- 案件頁 **1UP CAT** 子區塊：PM 永遠可見；譯者僅有綁檔時顯示。
- **兩行版面**：第一行專案名 · 語言對 + 變更／移除；第二行檔名為同分頁深連結（移除「在 CAT 開啟」與 `target="_blank"`）。
- **選檔**：`CatProjectFilePickerModal` 即時搜尋專案／檔案，取代 Select。
- **同分頁導覽**：CAT 內「連結案件」→ LMS 案件頁；LMS 檔名連結 → `/cat/team/files/{id}?p={projectId}`。
- **LMS／CAT 側欄**：`CatToolPage` + `TMS_SIDEBAR_MODE=lms`；CAT iframe 內側欄與 LMS 殼層對稱收合。
- **專案清單搜尋**：`cat-tool` 專案清單 `projectSearchInput`（初版位置；B+D2 後移至變更紀錄與表格之間）。
- **工具清單**：允許 `tools[]` 空陣列、每筆 legacy 工具可刪。

### 主要觸點

| 區域 | 檔案 |
|------|------|
| LMS 案件頁 | `src/pages/CaseDetailPage.tsx` |
| 1UP 子區塊 | `src/components/case/CaseCatToolsPanel.tsx` |
| 選檔 Modal | `src/components/case/CatProjectFilePickerModal.tsx` |
| CAT 殼層 | `src/pages/CatToolPage.tsx` |
| CAT 內嵌 | `cat-tool/app.js`、`cat-tool/index.html` → `npm run sync:cat` |

### 刻意延後

第二波計畫原將「自研工具 → `cat_files`」遷移標為延後；於 `3fc97f1` 以腳本 + dry-run 落地（見 §5）。

---

## 3. 方案 B + D2（`a4acbc1`）

### 產品規格（已拍板）

| 項目 | 行為 |
|------|------|
| **顯示條件（D2）** | `cases.cat_tool_enabled = true` 時才渲染 1UP 子區塊（PM／譯者同規則） |
| **空白態** | 已啟用、尚無綁檔：顯示「**待指定**」；**不顯示檔名列** |
| **PM 啟用** | `cat_tool_enabled = false` 時，工具區顯示啟用按鈕 → 設 `true` 並存 Supabase |
| **移除 1UP** | 工具總數 > 1 時，子區塊右上角 **X**；執行時 `cat_tool_enabled=false` **且** 解除本案全部 `cat_files.related_lms_case_id` |
| **至少一種工具** | 總數 = legacy `tools[]` 筆數 + (`cat_tool_enabled` ? 1 : 0)；總數 = 1 時不可刪最後一種 |
| **複製本頁** | `duplicate` 複製 `cat_tool_enabled`；新案無 cat 綁定 → 空白「待指定」 |
| **專案清單搜尋** | 順序：標題 → 按鈕 → 變更紀錄 → **搜尋** → 表格 |

### 資料庫

- Migration：[`supabase/migrations/20260610200000_cases_cat_tool_enabled.sql`](../supabase/migrations/20260610200000_cases_cat_tool_enabled.sql)
  - 新增 `cases.cat_tool_enabled`（預設 `false`）
  - Backfill：已有 `cat_files.related_lms_case_id` 指向該案的，設 `true`
  - Trigger：`cat_files` 連結案件時自動將對應 `cases.cat_tool_enabled = true`

### 程式觸點

- `src/stores/case-store.ts` — `catToolEnabled` 映射
- `src/lib/case-tool-count.ts` — `countLegacyTools`、`canRemoveCaseTool` 等
- `src/pages/CaseDetailPage.tsx`、`CaseCatToolsPanel.tsx` — 條件渲染、移除、空白態
- `src/data/case-types.ts`、`src/integrations/supabase/types.ts`

---

## 4. UX 微調 A：啟用按鈕位置（`3fc97f1`）

### 變更

1. **刪除**「工具」標題下方獨立的 `1UP CAT` 按鈕。
2. 在 legacy `ToolInstance` 清單**之後**，與「+ 新增工具」包在同一 `flex flex-wrap gap-2` 容器。
3. PM 且 `!catToolEnabled` 時顯示啟用按鈕；即使 `canAddTool` 為 false 仍顯示。
4. `onClick` 維持 `enableCatTool()`。

### 檔案

- `src/pages/CaseDetailPage.tsx`（約 2750–2800 行）

---

## 5. UX 微調 B：專案名深連結（`3fc97f1`）

### 變更

- 新增 `buildCatProjectLink(projectId)` → `/cat/team/projects/{projectId}`。
- 有綁檔時，**專案名**改為 `<Link>`（`text-primary hover:underline`）；語言對維持純文字，中間保留 ` · `。
- PM 與譯者皆套用；空白「待指定」不連結。
- 檔名仍用 `buildCatDeepLink` → 編輯器。

### 檔案

- `src/components/case/CaseCatToolsPanel.tsx` — `ProjectLangLine` / `ProjectLangLineTranslator`

---

## 6. 自研工具遷移腳本（`3fc97f1`，dry-run only）

### 交付物

| 項目 | 路徑 |
|------|------|
| 主腳本 | `scripts/migrate-case-tools-to-cat-links.mjs` |
| Prefetch 組裝 | `scripts/compose-migrate-prefetch.mjs` |
| npm | `npm run migrate:case-cat-links` |
| 操作說明 | [`CAT_MIGRATE_LEGACY_CAT_TOOL_2026-06.md`](./CAT_MIGRATE_LEGACY_CAT_TOOL_2026-06.md) |

### 解析規則（摘要）

- 掃 `cases.tools[]` 中 `tool === "自研工具"`。
- 依欄位 **label**（非固定 field id）：`專案名稱`、`檔案名稱`、`連結`（含 file 型 `fileValues`）。
- 優先序：CAT 深連結 URL → 專案名 + 檔名比對。
- 衝突：目標檔已連**他案** → `skip_conflict`（不改連結）。

### 2026-06-11 dry-run 摘要

報告（本機，未納入 git）：`scripts/.cache/migrate-case-tools-report-2026-06-11T21-27-02-236Z.json` / `.md`

| 狀態 | 筆數 |
|------|------|
| `unresolved` | 40 |
| `already_linked` | 20 |
| `would_link` | 5 |
| `ambiguous` | 1 |

掃描 **66** 案、**66** 筆自研工具。**尚未執行 `--apply`**。

---

## 7. 加號樣式統一（`27d0585`，已驗收）

### 問題

「1UP CAT」啟用按鈕使用字面 `+`，與「+ 新增工具」的 Lucide `Plus` 圖示不一致。

### 變更

```tsx
<Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={enableCatTool}>
  <Plus className="h-4 w-4" />
  1UP CAT
</Button>
```

- 文案為 **「1UP CAT」**（加號由圖示呈現）。
- `className` 與「新增工具」對齊（`gap-1`，移除多餘 `h-8`）。

### 檔案

- `src/pages/CaseDetailPage.tsx`

---

## 8. 驗收紀錄

| # | 項目 | 狀態 | 備註 |
|---|------|------|------|
| 1 | 移除 1UP 後，「+ 新增工具」旁有啟用按鈕 | 通過 | `3fc97f1` |
| 2 | 點啟用 → 1UP 子區塊出現（待指定或已綁檔） | 通過 | B+D2 + UX 微調 |
| 3 | 有綁檔時專案名可點 → 專案檔案清單 | 通過 | `3fc97f1` |
| 4 | 檔名可點 → 編輯器深連結 | 通過 | 第二波起 |
| 5 | 遷移 dry-run 報告產出 | 通過 | `3fc97f1`；待審閱 `--apply` |
| 6 | 兩顆按鈕加號圖示一致 | 通過 | `27d0585`；使用者確認驗收成功 |

---

## 9. 待辦與維護邊界

| 項目 | 狀態 |
|------|------|
| 遷移 `--apply` | 待審閱 dry-run 報告後另開 |
| A-2 Google Sheet 匯入選填連結 | Phase A 進行中 |
| A-5 未受派譯者全檔唯讀 | Phase A 進行中 |
| UX／LMS 變更 | 僅改 `src/`；**不涉及** `sync:cat`（除非動 CAT 內嵌 UI） |
| 遷移腳本 | 需 `SUPABASE_SERVICE_ROLE_KEY`；無 key 可用 `--prefetch` 離線 dry-run |

---

## 10. 相關文件與計畫整併說明

- 本 devlog 已整併原 Cursor 臨時計畫：CAT LMS UX 第二波、1UP CAT B+D2、加號樣式。
- Cursor 保留主計畫：`1up_ux_與遷移_70701b21.plan.md`（含實作紀錄章節）；其餘臨時 plan 已刪除以免重複。
