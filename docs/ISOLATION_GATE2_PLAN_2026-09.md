狀態：Gate 2B 正式發布前審核完成；等候 Codex／使用者決定維護窗口與正式操作授權

# Gate 2：P0 安全修正正式發布計畫（更新 2026-09-04 Gate 2B）

**權威候選（已凍結，Gate 1 全綠）**

| 項目 | 值 |
|---|---|
| 功能／驗收 commit | `28f80509` |
| Gate1 文件 commit（PR HEAD） | `724d691c` |
| 隔離 workflow | [33848719517](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/33848719517) |
| 定性 | `combined isolated verification passed / ready for controlled maintenance-window review` |
| 基準 `main` | **`724eb886`（未變動）** |
| Draft PR | #81（DO NOT MERGE） |

**本文件授權範圍（Gate 2B）**：唯讀查證、更新規劃文件、本機 commit。  
**禁止**：重跑 Gate 1、merge、部署、修改 production schema／資料、push（避免再觸發 CI／Vercel）。

---

## 0. 歷史紀錄（舊結果，不可當現況部署條件）

> 以下為 **2026-09-02 前後**過程紀錄，**不得**與目前 Gate 1 通過狀態混用。

| 舊事件 | 說明 |
|---|---|
| 第五次 Micro（`enexnghinsnyzmezxphk`） | **舊**：164/164、10/10 SQL；**當時不含 P0-D**；Micro 已刪 |
| 「P0-D 未經隔離驗證」 | **已過時** — 現況見 §1 |
| dry-run「恰好 16 支」 | **已過時** — 現況為 **17 支**（含 `20260904004224`） |

---

## 1. 現況（Gate 2B）

- Gate 1：**完整通過**（166/166、P0 SQL 11/11、競態、Data API、Playwright、Advisors、品質閘門、public schema types contract）。
- P0-D（`20260902054823`）與 payload validation（`20260904004224`）：**已完成隔離驗證**。
- repo migration：**166** 支；候選最高：`20260904004224`。
- production history：**149** 個已登錄版本；最高：`20260825120952`；專案 ref：`wshsmerltcakffllgyul`（ACTIVE_HEALTHY）。
- Advisors 受控例外（契約測試接受）：`cases_visible`、`fees_visible`（兩件 security_definer_view ERROR）。

### 1.1 正式待套用（精確 17 支）

**不得**只用「高於 production 最大版號」計算（會漏掉 backdated 前置）。

| # | 檔名 |
|---|---|
| 1 | `20260610135900_cat_workflow_phase_b_prereq.sql` |
| 2 | `20260830122351_p0a_case_participants_revision_audit.sql` |
| 3 | `20260830122353_p0a_case_participant_backfill_safe.sql` |
| 4 | `20260830122356_p0a_case_action_rpcs.sql` |
| 5 | `20260830122359_p0a_case_field_acl.sql` |
| 6 | `20260830122401_p0a_case_credentials.sql` |
| 7 | `20260831043141_p0b_apply_case_update_admin_only.sql` |
| 8 | `20260831043143_p0b_workflow_rpc_acl.sql` |
| 9 | `20260831043145_p0b_assignment_rls.sql` |
| 10 | `20260831151322_p0b_acl_harden.sql` |
| 11 | `20260901120000_p0c_security_convergence.sql` |
| 12 | `20260901120100_p0c_view_helper_grants_and_display_name.sql` |
| 13 | `20260901120200_p0c_privileged_function_hardening.sql` |
| 14 | `20260901120300_p0c_slack_meta_rpc_expand.sql` |
| 15 | `20260901120400_p0c_slack_edge_revoke.sql` |
| 16 | `20260902054823_p0d_pm_assign_participants_sync.sql` |
| 17 | `20260904004224_p0d_restore_admin_create_payload_validation.sql` |

### 1.2 Gate 2B dry-run（唯讀）

| 項目 | 值 |
|---|---|
| 指令 | `supabase db push --project-ref wshsmerltcakffllgyul --include-all --dry-run` |
| 結果 | **恰好 17 支**；順序與上表一致；`dryRun: true`；未套用 |
| 完整輸出 | Git-ignored：`scripts/.cache/prod-db-push-dry-run-20260904.txt` |
| SHA-256 | `2C3D421AEB67CF4206E6E1D65D173D74915CE7A6519B395CBC31FCB1948F88AD` |
| 查證時間 | 2026-09-04（Gate 2B） |

---

## 2. 為何採單次維護窗口

（理由不變）Expand → Application → Harden 不可拆：RPC／REVOKE／RLS 與新前端互相依賴；`db push` 無版號上界。正式發布：

> **公告維護 → 阻止新操作 → 備份 → 一次套用已驗證 17 支 → 部署同一候選前端與 Edge → 冒煙（含 Slack G2-9）→ 恢復服務。**

DB Harden 後**不可**只回滾舊前端。

---

## 3. Gate 2A（已完成）

Draft PR #81、隔離 workflow 全綠、候選凍結於 `28f80509`／`724d691c`。

---

## 4. 正式維護窗口前置條件（blocking）

| # | 條件 | 通過證據 |
|---|---|---|
| M-1 | Draft PR CI／Preview | 既有；正式窗口前再確認未紅 |
| M-2 | 候選 commit 固定 | `28f80509`（文件 `724d691c`）；窗口中不得換碼 |
| M-3 | history／dry-run | 149 支；dry-run **恰好 17**（Gate 2B 已核） |
| M-4 | 正式庫 ACTIVE_HEALTHY | 已核 |
| M-5 | 備份 | **尚未執行 dump**；步驟見 readiness §備份 |
| M-6 | 已知良好 production 前端 | commit `724eb886`；GitHub Production deployment `6155219915`（Vercel URL `talk-hanzi-79kofihv5-…`）；窗口前再確認仍為現行 |
| M-7 | 維護頁 | **repo 尚無既有 maintenance mode**；最小方案見 readiness（需使用者核准後才實作／設定） |
| M-8 | 執行者／觀察者 | 待排 |
| M-9 | Slack G2-9 條件 | 專用測試 App／callback／secrets；見 readiness |
| M-10 | 明確核准 | 使用者核准窗口時間、停機與正式 DB／Vercel 操作 |

---

## 5. 正式發布順序（摘要）

Phase 0 維護公告 → Phase 1 備份＋再跑 dry-run（須仍 17）→ Phase 2 `db push --linked --include-all`（**無** dry-run 才允許，且另核准）→ Phase 3 Edge＋前端 → Phase 4 冒煙（含 G2-9）→ Phase 5 恢復。  
成功後遠端 history 應新增恰好 **17** 支，最高 `20260904004224`。

---

## 6. 成功標準

- history +17；前端／Edge 對應固定候選；
- 維護中冒煙全綠；30 分鐘監看無 P0；
- Advisors 僅保留兩件受控 definer ERROR；
- 無其他 worktree 混入。

---

## 7. 失敗與回復

- DB 前失敗：不改庫，恢復頁面即可。
- DB 後失敗：**保持維護頁**；優先向前修復；不可只 Instant Rollback 舊前端；必要時 DB restore＋Vercel rollback（另核准）。詳見 readiness。

---

## 8. GitHub／Vercel

- Draft 不可 merge 直至窗口核准。
- 避免 merge `main` 自動部署與手動 promotion 重複發版。

---

## 9. 下一個停止點

Gate 2B 文件與唯讀查證完成。**停止**，等待 Codex 審核與使用者決定：

1. 維護窗口時間；
2. 維護頁實作／設定授權；
3. 備份與正式 `db push`／部署授權；
4. Slack 測試 App 是否已備妥。

**現況：Gate 1 通過；production 尚未變更。**
