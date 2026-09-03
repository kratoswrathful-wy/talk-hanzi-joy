狀態：P0-D 最終隔離 **未全綠停止**（2026-09-03）；等待測試修正後重新核准唯一一次 Micro

# 第一關／P0-D 隔離驗收報告（更新 2026-09-03）

分支：`feat/isolation-replay-20260901` @ **`4de7a195`**  
正式庫 `wshsmerltcakffllgyul`：**未修改**。  
PR #81：維持 Draft／DO NOT MERGE。

---

## 1. 第五次 Micro（歷史；不含 P0-D）

| 項目 | 值 |
|---|---|
| ref | `enexnghinsnyzmezxphk`（已刪） |
| migration | **164/164**（加入 P0-D **以前**） |
| SQL | **10/10** |
| 雙 client 競態 | PASS |
| Data API | PASS |
| types | PASS |
| 說明 | 結果**不包含** `20260902054823` P0-D |

**不得**將第五次結果寫成「0/10 SQL、0 race」。

---

## 2. P0-D 最終隔離 Micro（本次；已刪除）

| 項目 | 值 |
|---|---|
| 名稱 | `p0d-isolation-final-20260903` |
| ref | `ixdpldfbgetcrgxkmgjd` |
| 建立 | 2026-09-03T12:30:14Z |
| 刪除 | 2026-09-03 ≈12:48Z（失敗規則：刪除並停止） |
| Git SHA | **`4de7a195`** |
| 預期／實際 migration | **165／165** 從零重放成功（含 P0-D） |
| Preview Branch | **未建立** |
| production | **未接觸** |
| 專案清單收尾 | 僅剩 `wshsmerltcakffllgyul` |
| 費用估算 | 存活 ≈18 分鐘；Micro Compute ≈ US$0.01 量級（硬頂 US$1 內） |

### 2.1 已通過

| 步驟 | 結果 |
|---|---|
| 165/165 migration replay | **PASS**（含 `20260902054823`） |
| Advisors security ERROR | **僅 2**：`cases_visible`、`fees_visible` `security_definer_view`（既有核准例外）；無新 ERROR |
| 診斷：P0-D 核心同名改派（postgres + JWT claims） | **PASS**（create → participant → reassign UUID → revoke prior） |

### 2.2 未通過（阻擋）— P0 SQL 安全測試組 8／11

| 檔名 | 結果 | 根因分類 |
|---|---|---|
| `p0_pm_assign_participants_check.sql` | **FAIL** | 測試在 `SET LOCAL ROLE authenticated` 後直接 `SELECT public.cases`；P0-C 已 `REVOKE SELECT ON cases FROM authenticated`（僅 `cases_visible`）。**測試裝配錯誤**，非 RPC 產品邏輯失敗。 |
| `p0_admin_create_case_check.sql` | **FAIL** | T3 仍用姓名-only `reviewer`／`review_rows`；P0-D 正確回 `missing_reviewer_user_id`。**既有測試未對齊 P0-D UUID 契約**。 |
| `p0_case_field_acl_check.sql` | **FAIL** | 測試欲再插入同 `env='test'` 列以觸發 55000；P0-D 已建 `UNIQUE(env)`，INSERT 先被 unique_violation 擋住。**既有測試未對齊 UNIQUE(env)**。 |
| 其餘 8 支（見下） | **PASS** | — |

通過的 8 支：

1. `p0_apply_case_update_admin_only_check.sql`
2. `p0_case_credentials_acl_check.sql`
3. `p0_case_mutation_acl_check.sql`
4. `p0_cat_workflow_acl_check.sql`
5. `p0_definer_view_contract_check.sql`
6. `p0_slack_edge_only_contract_check.sql`
7. `p0b_acl_harden_check.sql`
8. `p0c_translator_eligibility_check.sql`

### 2.3 未執行（因 SQL 組失敗依規則停止）

- 雙 client 競態
- Data API／definer view 腳本
- 隔離環境案件指派 RPC Playwright 冒煙
- types 與 repo 比對（未跑，避免在失敗路徑宣稱通過）

---

## 3. Playwright

| Run | 結果 |
|---|---|
| [33632836928](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/33632836928) @ `daf31a58` | **success** — P2-L7 結案為非 P0-D 阻擋 |

---

## 4. 最小修正建議（待重新核准後再建唯一一次 Micro）

1. **`p0_pm_assign_participants_check.sql`**：在診斷用 `SELECT public.cases`／participant 計數前 `RESET ROLE`（或改讀 `cases_visible`／security definer），RPC 呼叫時再 `SET LOCAL ROLE authenticated` + JWT claims。
2. **`p0_admin_create_case_check.sql`**：所有含 reviewer／translator／collab／review_rows 的建案案例改為帶可信 `*_user_id`／`translatorUserId`／`reviewerUserId`；姓名-only 改為獨立負向案例。
3. **`p0_case_field_acl_check.sql`**：重複 `permission_settings` 段比照 P0-D 測試：交易內暫降 `UNIQUE(env)` → 插入衝突列 → 驗證 55000／fail-closed → 還原索引；不得假設可直接插入第二筆同 env。

**不得**在失敗的 Micro 上修 DB 後重跑宣稱從零全綠。  
**不得**自行再建下一個 Micro（需重新核准）。

---

## 5. 部署判定

**not deployable** — P0-D 定性尚未達到  
`isolated verification passed / ready for controlled maintenance-window review`。

未 merge、未部署、未操作正式資料、未開始維護窗口。
