狀態：P0-D 驗證還原 **已推送**；GitHub PG17 隔離 **一次執行失敗（測試裝配）**；停止等 Codex（不得自動第二次 workflow）

# 第一關／P0-D 隔離驗收報告（更新 2026-09-04）

分支：`feat/isolation-replay-20260901` @ **`28638c15`**  
正式庫：**未修改**（僅唯讀 status 統計）。  
PR #81：Draft／DO NOT MERGE。  
Micro／Preview：**未建立**。

---

## 1. 修正內容（產品）

| 項目 | 值 |
|---|---|
| Migration | `supabase/migrations/20260904004224_p0d_restore_admin_create_payload_validation.sql` |
| Commit | **`28638c15`** |
| 預期鏈 | **166／166**；max=`20260904004224` |

還原 `private.p0_admin_create_validate_payload`：P0-C 完整欄位／status／型別／長度／timestamp ＋ P0-D UUID／`*_payload_key` 錯誤碼；`REVOKE`；`IMMUTABLE`＋`search_path=pg_catalog`。

## 2. Production status 唯讀統計

| status | n |
|---|---|
| draft | 1885 |
| delivered | 953 |
| inquiry | 144 |
| task_completed | 88 |
| dispatched | 16 |
| feedback／feedback_completed | 0 |
| **非法（七態外）** | **0** |

→ 已在同一 migration 加入 `cases_status_allowed_check`（NOT VALID → VALIDATE）。  
統計細節：`scripts/.cache/prod-cases-status-readonly-20260904.txt`（gitignore）。

## 3. 本機品質閘門（推送前）

encoding／sql-identifiers／forbidden-casts／typecheck／lint／vitest 513／build：**全過**。

## 4. GitHub PG17 一次隔離

| Run | 結果 |
|---|---|
| [33823340304](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/33823340304) @ `28638c15` | **FAIL** 於 P0 SQL |
| 166/166 replay | **PASS**（步驟成功後才進 SQL） |
| SQL | **10／11** |

### SQL 逐檔

| 檔名 | 結果 |
|---|---|
| `p0_pm_assign_participants_check.sql` | PASS |
| `p0_admin_create_case_check.sql` | **FAIL** |
| 其餘 9 支 | PASS |

### 失敗分類：**2. 測試裝配錯誤**（非產品／migration）

| 欄位 | 值 |
|---|---|
| 檔案 | `supabase/tests/p0_admin_create_case_check.sql` |
| 錯誤 | `permission denied for table cases` |
| 根因 | 在 `SET LOCAL ROLE authenticated` 下以 `EXISTS (SELECT … FROM public.cases …)` 斷言失敗路徑未落庫；P0-C 已 `REVOKE SELECT ON cases FROM authenticated` |
| 產品驗證 | private validator／T7 invalid_status／CHECK 等在失敗前路徑未證明失敗；**不得**據此宣稱產品仍壞 |
| 最小修正（待 Codex 核准後再推） | 凡直查 `cases`／`case_participants`／audit 細節一律先 `RESET ROLE`；RPC 呼叫再切回 `authenticated`。**不自動啟動第二次 workflow** |

未執行：競態、Data API、Playwright、types、Advisors（SQL 失敗即停）。

## 5. 部署判定

**not deployable** — **尚未**達到  
`combined isolated verification passed / ready for controlled maintenance-window review`。

**明確停止點**：等待 Codex 核准「僅測裝配 RESET ROLE 修正」後，才允許再推一次並**另行核准**第二次 workflow（本輪已用掉「只執行一次」配額）。
