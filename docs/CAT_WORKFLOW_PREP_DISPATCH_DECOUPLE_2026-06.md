# Prep 閘門移除 + LMS 派出與 CAT 準備狀態解耦（2026-06）

> **狀態**：**待驗收**（2026-06-23 實作）。  
> **上層**：Phase B-6 [`CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md`](./CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md) §4.3 派出閘門（**本變更取代阻擋式閘門**）。  
> **關聯**：Workflow 同步 [`20260615120000_fix_collab_row_id_text.sql`](../supabase/migrations/20260615120000_fix_collab_row_id_text.sql)；[`src/stores/case-store.ts`](../src/stores/case-store.ts)。

---

## 1. 問題摘要

| # | 症狀 | 根因 |
|---|------|------|
| A | 多人案件最後一格「確認承接」失敗，勾選彈回；toast「無法更新為已派出」 | `CaseDetailPage` 在 `allAccepted` 時呼叫 `assertCaseLinkedFilesPrepReady`，gate 失敗則 **不執行 `save`** |
| B | 非最後一格「確認承接」後 CAT 無段落指派 | `sync_cat_workflow_assignments_for_case` 僅在案件 → `dispatched` 時由 `case-store` 觸發 |
| C | 單人「確定指派」被 prep 閘門擋下 | `handleFinalize` 同樣呼叫 `assertCaseLinkedFilesPrepReady` |
| D | SQL 同步未過濾 `accepted` | 多人路徑僅看譯者名稱，未勾選承接的列也可能建指派 |

**CAT 工具端**（準備中句段鎖定、`禁止編輯，檔案準備中` tooltip）**已符合預期**，本次不修改 `cat-tool/`。

---

## 2. 產品決策（2026-06-23）

| # | 議題 | 定案 |
|---|------|------|
| 1 | LMS 派出 vs CAT prep | **完全解耦**：派出不將 prep 改為完成；prep 也不阻擋派出 |
| 2 | 派出前提示 | **非阻擋** toast：列出尚未準備完成的 CAT 檔名；PM／譯者文案分開 |
| 3 | 多人「確認承接」 | **每格**勾選後即同步 CAT 段落指派（`case-store` 在 `inquiry` + `accepted` 觸發 sync） |
| 4 | SQL 過濾 | 多人同步僅處理 `collab_rows[].accepted = true` 的列 |
| 5 | `cat-prep-dispatch-gate.ts` | **刪除**；RPC `cat_case_linked_files_not_prep_ready` 改由 `CaseDetailPage` 直接呼叫（僅警示用） |

---

## 3. 實作觸點

| 檔案 | 變更 |
|------|------|
| [`supabase/migrations/20260623131500_cat_workflow_prep_dispatch_decouple.sql`](../supabase/migrations/20260623131500_cat_workflow_prep_dispatch_decouple.sql) | `sync_cat_workflow_assignments_for_case` 多人路徑加 `accepted` 過濾 |
| [`src/stores/case-store.ts`](../src/stores/case-store.ts) | `shouldSyncCatWorkflowAssignments`：`inquiry` 且 `collabRows` 含 `accepted` 時觸發 |
| [`src/pages/CaseDetailPage.tsx`](../src/pages/CaseDetailPage.tsx) | 移除 prep gate；派出後非阻擋 toast |
| ~~`src/lib/cat-prep-dispatch-gate.ts`~~ | 已刪除 |

### 3.1 非阻擋 toast 文案

**PM 以上：**

> 以下 CAT 檔案尚未標記準備完成：{檔名}。指派已完成，但譯者開啟後將看到句段鎖定。確認就緒後，請至 CAT 工具標記準備完成。

**譯者：**

> 本案 CAT 作業檔尚未準備完成，開啟後句段為鎖定狀態，暫時無法編輯。如有疑問，請通知專案管理人員至 CAT 工具完成標記。

### 3.2 `sync_cat_workflow_assignments_for_case` 行為（不變部分）

案件為 `draft`／`inquiry`／`dispatched` 時仍呼叫 `cat_revert_workflow_stages_for_case`（translate → active、review → pending），**不修改 prep 步驟**。故派出後 prep 仍為 `active`，譯者開檔句段鎖定。

---

## 4. 驗收步驟

1. **多人／準備中／最後一格**：全員勾選「確認承接」→ 案件「已派出」→ 出現警示 toast（不阻擋）→ 勾選不彈回。
2. **多人／個別承接**：非最後一格勾選後，CAT 儀表板該譯者已見段落指派。
3. **單人／確定指派**：CAT 仍準備中，PM 可成功派出 → 警示 toast。
4. **accepted 過濾**：協作列已填譯者但未勾選承接 → CAT 無該人指派。
5. **CAT 鎖定**：派出後 prep 仍 active，非 PM 開檔全句段 tooltip「禁止編輯，檔案準備中」。

---

## 5. 開發紀錄

| 日期 | 項目 |
|------|------|
| 2026-06-23 | 調查 B-6 prep 閘門與理想體驗落差；定案解耦 + 即時 sync + 非阻擋 toast |
| 2026-06-23 | migration `20260623131500`；`case-store`／`CaseDetailPage`；刪除 `cat-prep-dispatch-gate.ts` |
