狀態：第五次 Micro 全綠；**待 GitHub 第二關審核**（仍 not deployable 至 production）

# 第一關隔離驗收報告（2026-09-02）

分支：`feat/isolation-replay-20260901`（worktree `C:\Homemade Apps\1UP-TMS-isolation-20260901`）  
正式庫 `wshsmerltcakffllgyul`：**未修改**。

GitHub 第二關計畫：[`ISOLATION_GATE2_PLAN_2026-09.md`](ISOLATION_GATE2_PLAN_2026-09.md)

---

## 1. 臨時專案生命週期

| 次序 | ref | 結果 | 處置 |
|---|---|---|---|
| 1–3 | （見前版） | 第三次 162/162；SQL 失敗 | 已刪 |
| 4 | `vysyjvgkddjwdcwalbee` | 164/164；9/10 SQL（slack 測試 bug） | 已刪 |
| **5（最終）** | `enexnghinsnyzmezxphk` | **全綠**（見 §2） | **已刪除** |

**不得建立第六次 Micro。**

---

## 2. 第五次 Micro 驗收（2026-09-02）

| 步驟 | 結果 |
|---|---|
| 1. Migration 從零重放 | **164/164** 成功 |
| 2. P0 SQL 契約（10 支） | **10/10** 通過（含 `p0_slack_edge_only_contract_check.sql` 函式 ACL 斷言） |
| 3. 雙 authenticated client 競態 | `dual-client-collab-race.mjs` **PASS** |
| 4. Data API definer 契約 | `micro3-definer-view-api-check.mjs` **PASS** |
| 5. Slack service-role／RPC 隔離 | 含於 SQL #3（三表 grants、RPC A/B 隔離、service_role CRUD） |
| 6. Live Advisors（security） | **2 件 ERROR**（受控例外）：`cases_visible`、`fees_visible` `security_definer_view` |
| 7. Supabase types 重生 | MCP `generate_typescript_types` → `src/integrations/supabase/types.ts` |
| 8. 本機品質閘門 | typecheck／test **492**／lint 0 error／encoding／forbidden-casts／build — **全綠** |

**首次失敗紀錄**：無（第五次首次即全綠；第四次 slack SQL 測試 bug 已於本機修正後納入第五次）。

---

## 3. 本 checkpoint 變更（`faa23f1e` 後）

### Slack 狀態 hook

- `useOwnSlackMetaStatus(enabled, userId)`：`userId` 變更重新查詢；disabled／空白不保留 connected
- `fetchOwnSlackMeta` catch throw → error 狀態
- `ProfileSlackCard`／詢案／註記對話框傳入實際 `user.id`
- Vitest **11 項**（含 A→B、慢請求、reject、登出）

### Slack SQL 測試

- `has_function_privilege('public', …)` PUBLIC 不可執行 RPC
- `authenticated` 可執行；無參數；固定 `search_path`；僅 `auth.uid()` 本人

### Edge（G2-9 前）

- `slack-oauth-callback`：原子 DELETE 消耗 state；meta 失敗還原既有 credentials（非無條件 delete）

### Gate 2

- 三個 **可執行 release unit**（Expand／Application switch／Contract-Harden）；禁止「db push 至版號」表述；P0 全批 14 支分類

---

## 4. Migration 鏈

| 項目 | 值 |
|---|---|
| 總數 | **164** |
| P0 Expand（2） | `20260830122353`、`20260901120300` |
| P0 Harden（12） | 見 Gate 2 §3 |

---

## 5. 本機閘門（checkpoint 提交前）

| 關卡 | 結果 |
|---|---|
| typecheck | 通過 |
| test | **492** 通過 |
| lint | 0 error |
| encoding／forbidden-casts／build | 通過 |

---

## 6. 部署判定

**not deployable（至 production）** — 隔離驗收已全綠，但正式推出須依 Gate 2 **三 release unit** 執行，且 G2-9 Preview Slack OAuth 尚未完成。

**未 push、未開 PR、未 merge、未部署正式庫。**
