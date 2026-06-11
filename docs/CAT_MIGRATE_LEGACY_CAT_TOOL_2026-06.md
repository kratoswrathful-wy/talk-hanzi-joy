# 自研工具 → 1UP CAT 遷移（legacy `cases.tools[]`）

將案件詳情頁「工具」區塊中 **`tool === "自研工具"`** 的舊列，遷移至：

- `cat_files.related_lms_case_id` / `related_lms_case_title` 綁定 LMS 案件
- `cases.cat_tool_enabled = true`
- （僅 `--apply`）自 `cases.tools[]` 移除已成功遷移的「自研工具」筆

與 Phase A「1UP CAT 工具區子區塊」規格對照：[`CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md`](./CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md) §4.1。

## 腳本

| 項目 | 路徑／指令 |
|------|------------|
| 主腳本 | [`scripts/migrate-case-tools-to-cat-links.mjs`](../scripts/migrate-case-tools-to-cat-links.mjs) |
| npm | `npm run migrate:case-cat-links` |
| 報告輸出 | `scripts/.cache/migrate-case-tools-report-{timestamp}.json` 與同內容 `.md` |

### 環境變數（連線 Supabase 時必填）

```powershell
$env:SUPABASE_URL="https://<project-ref>.supabase.co"
# 或沿用 VITE_SUPABASE_URL
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role JWT>"
```

與 [`scripts/backfill-cat-original-files.mjs`](../scripts/backfill-cat-original-files.mjs) 相同；**service_role** 取自 Dashboard → Project Settings → API → Legacy → `service_role`。

### CLI

```powershell
# dry-run（預設，不寫入）
npm run migrate:case-cat-links

# 單案試跑
node scripts/migrate-case-tools-to-cat-links.mjs --case-id <uuid>

# 套用（審閱 dry-run 報告後才執行）
node scripts/migrate-case-tools-to-cat-links.mjs --apply

# 離線 dry-run（無 service_role 時，需先組裝 prefetch JSON）
node scripts/migrate-case-tools-to-cat-links.mjs --prefetch scripts/.cache/migrate-prefetch.json
```

**Prefetch 組裝**（選用）：以 Supabase SQL 或 MCP `execute_sql` 匯出 `cases`／`cat_projects`／`cat_files` 後，執行 `node scripts/compose-migrate-prefetch.mjs <mcp-result.json>`。

## 解析規則

每筆「自研工具」`ToolEntry` 從 `entry.fields` 的 **label**（非固定 field id）讀值：

| Label | 用途 |
|-------|------|
| `專案名稱` | 與 `cat_projects.name` 比對 |
| `檔案名稱` | 與同專案內 `cat_files.name` 比對 |
| `連結` | 文字欄位或 **file 型** `fileValues` 中的 CAT 深連結 URL |

**解析優先序**：

1. **URL**：regex 擷取 `/cat/team/files/{fileId}` 與 query `p={projectId}`；驗證 `cat_files.id` 存在。
2. **專案名 + 檔名**：精確或 trim 比對；同專案多筆同名 → `ambiguous`。
3. 皆失敗 → `unresolved`。

## 衝突與狀態（方案 B）

| 狀態 | 說明 |
|------|------|
| `would_link` | dry-run：將寫入 `related_lms_case_id` 並啟用 `cat_tool_enabled` |
| `already_linked` | 目標檔案已連到**本案**；`--apply` 時僅移除舊 tool 列 |
| `skip_conflict` | 目標檔案已連到**其他案件** → **不改連結** |
| `unresolved` | 無法解析檔案（缺欄位、檔名不符、URL 失效等） |
| `ambiguous` | 專案或檔名對到多筆，需人工 |

## 2026-06-11 dry-run 摘要

（`scripts/.cache/migrate-case-tools-report-2026-06-11T21-27-02-236Z.*`）

| 狀態 | 筆數 |
|------|------|
| `unresolved` | 40 |
| `already_linked` | 20 |
| `would_link` | 5 |
| `ambiguous` | 1 |

掃描 **66** 案、**66** 筆自研工具。多數 `unresolved` 源於：檔名為說明文字／多檔換行、CAT 專案名與 LMS 填寫不一致（如 `WIZA - 00144063 - …` vs `WIZA`）、或尚未建立對應 `cat_files`。

**尚未執行 `--apply`**；請審閱報告明細後再決定是否套用。

## 驗收（套用前／後）

1. 執行 dry-run，確認 `skip_conflict`／`ambiguous` 筆數可接受。
2. 抽查 `would_link` 案件：LMS 案件頁應出現 1UP 子區塊與正確檔名連結。
3. `--apply` 後：已成功遷移案的「自研工具」列應自 `tools[]` 消失；`cat_tool_enabled` 為 true。
4. `already_linked` 案：僅移除重複 legacy 列，不變更既有 `cat_files` 連結。
