狀態：P0-D 封頂驗證 **停止於 Codex**（2026-09-04）；遠端 Micro 證據＋GitHub 本機 PG17 部分通過；發現 P0-D 產品回歸

# 第一關／P0-D 隔離驗收報告（更新 2026-09-04 封頂）

分支：`feat/isolation-replay-20260901` @ **`54268e39`**  
正式庫 `wshsmerltcakffllgyul`：**未修改**。  
PR #81：維持 Draft／DO NOT MERGE。  
**未**建立第七次 Micro／Preview Branch。

---

## 合併證據架構

本輪採「遠端 Micro 歷史證據 ＋ GitHub 本機 PostgreSQL 17」；**因本機安全 SQL 暴露產品回歸，不得宣稱全綠。**

### A. 遠端 Micro（歷史；已刪）

| 項目 | 結果 |
|---|---|
| final2 `knbnftjrsshfhfyqxlgo` @ `99ef5b0b` | 165/165 PASS；Advisors 僅既有 2 ERROR；SQL **10/11**（當時 T5 舊錯誤碼） |
| T5 實際回傳 | `unknown_payload_key`（已用於對齊測試） |

### B. GitHub 本機 PostgreSQL 17

| Run | SHA | 結果 |
|---|---|---|
| [33820012349](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/33820012349) | `a2236cda` | **環境失敗**：`db query --local -f` 無法多語句 → 0/11 |
| [33821223966](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/33821223966) | `54268e39` | PG17 start＋165/165 reset **PASS**；SQL **10/11**（T7 產品失敗） |

環境修正次數：**1／2**（改 `psql` 執行多語句）。第二次失敗**非**環境問題。

---

## 本機 PG17 已通過

| 步驟 | 結果 |
|---|---|
| Guard（無 production token／ref） | PASS |
| CLI 2.116.0 + `major_version = 17` | PASS |
| PostgreSQL major | **17** |
| 165/165 migration；max=`20260902054823` | PASS |
| SQL（除 T7） | 見下 |

### SQL 逐檔（run 33821223966）

| 檔名 | 結果 |
|---|---|
| `p0_pm_assign_participants_check.sql` | PASS |
| `p0_admin_create_case_check.sql` | **FAIL（T7）** |
| `p0_apply_case_update_admin_only_check.sql` | PASS |
| `p0_case_credentials_acl_check.sql` | PASS |
| `p0_case_field_acl_check.sql` | PASS |
| `p0_case_mutation_acl_check.sql` | PASS |
| `p0_cat_workflow_acl_check.sql` | PASS |
| `p0_definer_view_contract_check.sql` | PASS |
| `p0_slack_edge_only_contract_check.sql` | PASS |
| `p0b_acl_harden_check.sql` | PASS |
| `p0c_translator_eligibility_check.sql` | PASS |
| **合計** | **10／11** |

T5／T6（`unknown_payload_key`／`forbidden_payload_key`）在本輪 **已通過**。

### 未執行（因 SQL 失敗停止）

競態、Data API、Playwright 冒煙、types、Advisors、品質閘門。

---

## 阻擋項：T7 `invalid_status`（產品／migration）

| 欄位 | 值 |
|---|---|
| 檔案 | `supabase/tests/p0_admin_create_case_check.sql` |
| 行號 | ≈307–313（T7） |
| 呼叫 | `admin_create_case(..., { title, status: 'not_a_real_status' })` |
| 預期 | `error = invalid_status` |
| 實際 | `{"ok": true, "revision": 0, "id": ...}` |
| SQLSTATE | `P0001`（測試 `raise exception`） |
| 分類 | **1. 產品／migration 真錯誤** |

**根因（程式證據）**

- P0-C `private.p0_admin_create_validate_payload`（`20260901120000`）含 status 白名單 → `invalid_status`，並含型別檢查。
- P0-D `20260902054823` **重寫**同一函式時，只保留 forbidden／unknown key 與 user_id UUID 檢查，**未移植** `invalid_status`／`invalid_field_type` 等。
- `admin_create_case` 直接 `coalesce(nullif(trim(status),''),'draft')` 寫入；`cases.status` 無 CHECK 約束 → 非法字串可入庫。

**依規則**：不得弱化 T7；不得為配合測試改測試期望；停止交 Codex（是否補 additive migration 還原驗證）。

---

## 本輪已落地的測試／基礎設施（非產品）

| Commit | 內容 |
|---|---|
| `a2236cda` | T5／T6 錯誤碼對齊；空白協作 Playwright；`.github/workflows/p0-isolated-db.yml`；本機 helpers |
| `54268e39` | SQL 改 `psql`（環境修正 #1） |

Playwright 空白協作：產品 RPC 明確允許空白 `translatorUserId` 承接（P0-C）；測試已改為空白列＋承接後比對 UUID／`case_participants`（本輪尚未跑到該步）。

---

## 部署判定

**not deployable** — **尚未**達到  
`combined isolated verification passed / ready for controlled maintenance-window review`。

未 merge、未部署、未操作正式資料、未開維護窗口。  
**停止等待 Codex。**
