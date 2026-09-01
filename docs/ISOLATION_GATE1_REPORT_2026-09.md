狀態：已落地待驗收（本機 checkpoint）；**整體仍 not deployable**

# 第一關隔離驗收報告（2026-09-02）

分支：`feat/isolation-replay-20260901`（worktree `C:\Homemade Apps\1UP-TMS-isolation-20260901`）  
正式庫 `wshsmerltcakffllgyul`：**未修改**。

GitHub 第二關計畫（**未執行**）：[`ISOLATION_GATE2_PLAN_2026-09.md`](ISOLATION_GATE2_PLAN_2026-09.md)

---

## 1. 臨時專案生命週期

| 次序 | ref | 結果 | 處置 |
|---|---|---|---|
| 1–3 | （見前版） | 第三次 162/162；SQL 失敗 | 已刪 |
| **4** | `vysyjvgkddjwdcwalbee` | **164/164** 重放成功；9/10 SQL 通過；`p0_slack_edge_only` **失敗**（測試在 authenticated 角色插入 `auth.users`） | **已刪除** |

**不得建立第五次 Micro**（依核准條款）。Slack SQL 測試已在本機修正（fixture 於 superuser 階段建立使用者 C）。

---

## 2. 本 checkpoint 變更（`dcd3741d` 後阻擋修正）

### Slack Edge-only（三表）

- `20260901120300`：`get_own_slack_meta()` Expand
- `20260901120400`：`slack_oauth_states`／`user_slack_meta`／`user_slack_credentials` REVOKE `PUBLIC`／`anon`／`authenticated`
- `p0_slack_edge_only_contract_check.sql`（10 項契約 + service_role 操作）

### 前端

- `fetchOwnSlackMeta` 改為 `{ ok, meta | error }`；`useOwnSlackMetaStatus`（stale guard）
- `ProfileSlackCard`／詢案／註記對話框錯誤處理；`maybeSendTranslatorCaseReplySlack` 捕捉 RPC 失敗

### Edge Functions

- `slack-oauth-callback`：meta 失敗不回 `connected`、回滾 credentials、log 不輸出 token
- `slack-disconnect`：檢查刪除結果，失敗不回 `{ ok: true }`

### Gate 2

- 三階段部署：Expand → Application switch → Contract／Harden（禁止 merge 後一次 push+deploy）

---

## 3. Migration 鏈

| 項目 | 值 |
|---|---|
| 總數 | **164** |
| Expand | `20260901120300` |
| Harden | `20260901120400` |

---

## 4. 第四次 Micro SQL（部分）

| 測試 | 結果 |
|---|---|
| 原 9 支 P0 | **全通過** |
| `p0_slack_edge_only_contract_check.sql` | **失敗**（已修測試；未能在同一專案重跑） |

---

## 5. 本機閘門

| 關卡 | 結果 |
|---|---|
| typecheck | 通過 |
| test | **487** 通過（含 `get-own-slack-meta.test.ts` 6 項） |
| lint | 0 error |
| encoding／forbidden-casts／build | 通過 |

---

## 6. 部署判定

**not deployable** — 第四次 Micro 未全綠；不得建第五次。待 PM 決定是否核准再一輪隔離重放。

**未 push、未開 PR、未部署。**
