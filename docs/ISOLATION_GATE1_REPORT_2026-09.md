狀態：已落地待驗收（本機 checkpoint）；**整體仍 not deployable**

# 第一關隔離驗收報告（2026-09-01）

分支：`feat/isolation-replay-20260901`（worktree `C:\Homemade Apps\1UP-TMS-isolation-20260901`）  
正式庫 `wshsmerltcakffllgyul`：**未修改**。

GitHub 第二關計畫（**未執行**）：[`ISOLATION_GATE2_PLAN_2026-09.md`](ISOLATION_GATE2_PLAN_2026-09.md)

---

## 1. 臨時專案生命週期

| 次序 | 專案 ref | 結果 | 處置 |
|---|---|---|---|
| **1** | `qxqhixmzhzudakxvlfbv` | 159/160；COMMENT 語法錯 | 已刪除 |
| **2** | `hkumqnbuxsvscnmwlnpj` | 160/160 重放；補丁後驗收 | 已刪除 |
| **3** | `fzoqmkhqvzqnbaqgeeiv` | **162/162 migration 重放成功**；SQL 第 2 支失敗（Slack grants）→ 本機補 `20200` REVOKE 後刪專案 | **已刪除** |

**重要**：第三次 Micro **不得**在同一專案修 DB 後宣稱乾淨成功；失敗後已刪除，**不建立第四次**（待 PM 審核下一輪）。

---

## 2. 本 checkpoint 變更摘要

### 2.1 建案 RPC 契約（§一）

| 項目 | 內容 |
|---|---|
| `caseStore.create` | `id`／`env`／`created_by` **不**入 `p_payload`；`p_case_id` 獨立參數 |
| `toDb` | 移除 `created_by` 映射；刪除復原 snapshot 不信任 `created_by` |
| `case-create-payload.ts` | forbidden key **throw**（不靜默剝除） |
| Vitest | `case-create-payload.test.ts`（6 項）：`toDb` → payload → `adminCreateCase` RPC |

### 2.2 雙 client 競態腳本（§二）

- 成功契約：`error === null` + `data.caseId`／revision／rowId（**無** `data.ok`）
- `assertIdentity` 真正斷言；競態後 participant／audit 殘留檢查
- 憑證：stdin／`MICRO3_RACE_CREDS_FILE`；**不讀** `.env`；`finally` 登出

### 2.3 Definer view 契約（§四）

- `p0_definer_view_contract_check.sql`：catalog 段 superuser 執行；authenticated qualified call 失敗；fees／cases join／filter
- `scripts/micro3-definer-view-api-check.mjs`：Data API 確認 private helper 不可 RPC 直呼

### 2.4 Slack Edge-only（§四 + migration 補強）

- `20260901120200`：`REVOKE` `slack_oauth_states`／`user_slack_meta` client grants；`get_own_slack_meta()` RPC
- 前端：`fetchOwnSlackMeta()` 取代直查表

---

## 3. 最終 migration 鏈

| 項目 | 值 |
|---|---|
| 總數 | **162** |
| 最高版號 | `20260901120200_p0c_privileged_function_hardening.sql`（含 Slack REVOKE + RPC） |
| 從零重放 | 第三次 **162/162 成功**；**驗收 SQL 未全綠** |

---

## 4. 第三次 Micro SQL 測試

| 測試檔 | 結果 |
|---|---|
| `p0_admin_create_case_check.sql` | **PASS** |
| `p0_definer_view_contract_check.sql` | **FAIL** → 根因：`slack_oauth_states` 仍有 anon/authenticated SELECT grant；本機已補 REVOKE |
| 其餘 7 支 | **未跑**（第 2 支失敗即停止） |

---

## 5. Advisors

| 等級 | 數量 | 備註 |
|---|---:|---|
| ERROR | **2** | `cases_visible`、`fees_visible` → **P0-V 經測試核准的受控例外**（**不得**聲稱零 ERROR） |
| WARN | **~60** | 見 [`PRIVILEGED_FUNCTIONS_WARN_CLASSIFICATION_2026-09.md`](PRIVILEGED_FUNCTIONS_WARN_CLASSIFICATION_2026-09.md)；第三次 live 分類**未完成**（專案已刪） |
| INFO | **2** | Slack Edge-only |

---

## 6. 本機閘門（最新 checkpoint）

| 關卡 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `npm run test` | **481** 通過 |
| `npm run lint` | 0 error |
| `npm run check:encoding` | 通過 |
| `npm run check:forbidden-casts` | 通過 |
| `npm run build` | 通過 |

---

## 7. 部署判定

**not deployable**

1. 162 支雖在第三次 Micro **migration 重放成功**，但 **9 支 SQL／競態／live Advisors 未全綠**。  
2. 失敗專案已刪；**不建立第四次**（待審核）。  
3. GitHub 第二關 **僅提交計畫、未執行**。  
4. 正式庫 **未套用** P0 鏈。

### 剩餘 P0

| ID | 項目 |
|---|---|
| P0-R | 162 支 + **全套驗收**再跑一輪（需 PM 核准新隔離專案或替代路徑） |
| P0-T | 雙 client 競態（腳本已備；第三次未執行） |
| P0-V | definer view 契約（本機 SQL 已修；待重跑） |

---

## 8. 相關 worktree

| worktree | 分支 | 備註 |
|---|---|---|
| `1UP-TMS-isolation-20260901` | `feat/isolation-replay-20260901` | **權威整合線** |
| `1UP-TMS-p0b-20260830` | `feat/p0b-security-20260830` | 未提交檔**勿動** |

**未 push、未開 PR、未部署。**
