狀態：第五次 Micro 全綠；**待 GitHub 第二關審核**（正式庫仍 not deployable）

# GitHub 第二關計畫（2026-09-02）

**前置**：[`ISOLATION_GATE1_REPORT_2026-09.md`](ISOLATION_GATE1_REPORT_2026-09.md) + **第五次** Micro 從零重放全綠（見 Gate 1 §1）。  
**現階段**：不 push、不開 PR、不 merge、不部署正式庫。

---

## 1. 目標

在 `main` 合併 `feat/isolation-replay-20260901`（**164** 支 migration + P0 收斂）前，完成 GitHub 審核閘門。

**禁止**採用「merge 整條隔離分支 → 一次 `db push` → Vercel 自動部署」——`supabase db push` **沒有** `--up-to`／版號上界參數；它會套用 repo 中**所有**本機尚未在遠端登記的 migration 檔。因此正式推出必須拆成**三個可獨立 merge 的 release unit**（各含自己的 migration 檔子集 + 對應前端／Edge 步驟）。

---

## 2. 部署機制（強制理解）

| 誤解 | 事實 |
|---|---|
| 「db push 至 20300」 | **不可執行**；CLI 無版號上界 |
| 單 PR merge 164 支 | 等同一次 push 全鏈；**禁止**直接 merge 到會自動部署 production 的 `main` |
| 正確做法 | 每個 release unit = **獨立 PR** 只新增該 unit 列出的 migration 檔 → merge → `db push` → 驗收 → 下一 unit |

**正式庫 baseline**：merge 前執行 `node scripts/check-migration-history.mjs --live`，以 Remote 已套用版號為起點；下列「尚未在正式庫」的 migration 才進下一 unit。

---

## 3. P0 全批分類（14 支；不可只列 Slack）

隔離鏈 P0 區間：`20260830122351`～`20260901120400`（14 檔）。分類依**是否含會使舊前端失效的 authenticated 直寫／直讀 REVOKE**（同一檔內若混有 REVOKE，整檔歸 Harden unit，不得拆檔名）。

| # | Migration 檔 | 分類 | 說明 |
|---|---|---|---|
| 1 | `20260830122351_p0a_case_participants_revision_audit.sql` | **Harden** | `case_participants`／audit 等 REVOKE authenticated 直寫 |
| 2 | `20260830122353_p0a_case_participant_backfill_safe.sql` | **Expand** | 僅 backfill／安全補資料；不撤銷舊 client 路徑 |
| 3 | `20260830122356_p0a_case_action_rpcs.sql` | **Harden** | 新 action RPC + REVOKE 舊入口 |
| 4 | `20260830122359_p0a_case_field_acl.sql` | **Harden** | 欄位 ACL + REVOKE `update_case_permitted_fields` 舊路徑 |
| 5 | `20260830122401_p0a_case_credentials.sql` | **Harden** | REVOKE `cases` SELECT；改走 credentials RPC |
| 6 | `20260831043141_p0b_apply_case_update_admin_only.sql` | **Harden** | `apply_case_update` ACL 收緊 |
| 7 | `20260831043143_p0b_workflow_rpc_acl.sql` | **Harden** | Workflow RPC REVOKE／重導 |
| 8 | `20260831043145_p0b_assignment_rls.sql` | **Harden** | 指派表 REVOKE authenticated 直寫 |
| 9 | `20260831151322_p0b_acl_harden.sql` | **Harden** | CAT／cases 大批 REVOKE |
| 10 | `20260901120000_p0c_security_convergence.sql` | **Harden** | `admin_create_case`、cases／fees REVOKE 等收斂 |
| 11 | `20260901120100_p0c_view_helper_grants_and_display_name.sql` | **Harden** | private helper REVOKE（含 `p0_assert_translator_eligible`） |
| 12 | `20260901120200_p0c_privileged_function_hardening.sql` | **Harden** | 特權函式 REVOKE |
| 13 | `20260901120300_p0c_slack_meta_rpc_expand.sql` | **Expand** | 新增 `get_own_slack_meta()`；僅 REVOKE PUBLIC／anon 執行 RPC；**不** REVOKE 三表 client grants |
| 14 | `20260901120400_p0c_slack_edge_revoke.sql` | **Harden** | Slack 三表 REVOKE `PUBLIC`／`anon`／`authenticated` |

**Expand 僅 2 支 P0**：`22353`、`20300`。其餘 **12 支 P0 全屬 Harden unit**。

**Pre-P0（150 支，版號 `< 20260830122351`）**：隔離鏈中已存在、若正式庫尚未套用則**預設歸 Expand unit**（scheme A 合併內容以 additive 為主）。完整檔名清單見 [`supabase/migrations/`](../../supabase/migrations/) 排序後前 150 檔，或執行：

```powershell
Get-ChildItem supabase\migrations\*.sql | Sort-Object Name |
  Where-Object { $_.Name -lt "20260830122351" } | ForEach-Object Name
```

---

## 4. Release Unit 1 — Expand

| 項目 | 內容 |
|---|---|
| **目的** | 只新增與**目前 production 前端**相容的 schema／RPC；**不**撤銷舊 client 直寫／直讀 |
| **Git／PR** | 分支 `release/p0-expand` ← `main`；PR **僅**含下列 migration 檔（不得夾帶 Harden 檔） |
| **Migration 清單** | ① 正式庫 baseline 至 `20260830122351` 之間**尚未套用**的全部 pre-P0 檔（見 §3 指令）；② `20260830122353_p0a_case_participant_backfill_safe.sql`；③ `20260901120300_p0c_slack_meta_rpc_expand.sql` |
| **不含** | §3 表中 12 支 **Harden** P0；尤其 **不含** `20260901120400` |
| **Vercel** | **禁止** Production 自動部署；可維持現行 production 前端 |
| **順序** | ① merge PR → ② `check-migration-history.mjs --live` → ③ `supabase db push`（正式庫）→ ④ 冒煙：舊前端核心流程仍可用 |
| **停止點** | `db push` 失敗或舊前端冒煙失敗 → **停止**；不進 Unit 2 |
| **回復** | 無自動 down migration；需從備份還原或人工還原 grants（見 [`DEV_PIPELINE.md`](DEV_PIPELINE.md)） |
| **宣稱** | **不得**宣稱 P0 安全修復完成 |

---

## 5. Release Unit 2 — Application switch

| 項目 | 內容 |
|---|---|
| **目的** | 部署**已完全改用**新 RPC／新寫入路徑的前端與必要 Edge Functions |
| **Git／PR** | 分支 `release/p0-app-switch`；含 `feat/isolation-replay-20260901` 上 isolation checkpoint 起之 **src/**、**supabase/functions/** 等應用變更；**不含新 migration 檔** |
| **Migration 清單** | **（無）** — DB 維持 Unit 1 狀態 |
| **Vercel** | Production：**手動**或受控 Preview 驗收後再 promote；**暫停** merge 觸發的自動 production deploy |
| **順序** | ① Unit 1 已全綠 → ② 部署前端＋Edge → ③ 驗證 network／log **無**舊寫入入口（例如 `from('user_slack_meta')`、直寫 `cases`、舊 CAT 指派直寫等） |
| **停止點** | RPC 錯誤率上升或冒煙失敗 → **暫停 Unit 3** |
| **回復** | **僅回滾 Vercel** 至上一版；Expand DB 仍與舊版前端相容 |
| **宣稱** | 仍**不得**宣稱 P0 Harden 完成 |

**Slack OAuth（G2-9，merge 前阻擋）**：Preview + **專用測試 Slack App** 完成「連結 → 已連結 → 解除」；callback 須原子消耗 state、meta 失敗不得誤刪既有 credentials（見 isolation checkpoint Edge 修正）。

---

## 6. Release Unit 3 — Contract／Harden

| 項目 | 內容 |
|---|---|
| **目的** | 套用 REVOKE／RLS 收緊／舊 RPC 關閉；達 P0 契約 |
| **Git／PR** | 分支 `release/p0-harden` ← `main`（已含 Unit 1）；PR **僅**含 12 支 Harden P0 migration 檔 |
| **Migration 清單** | `20260830122351`、`20260830122356`、`20260830122359`、`20260830122401`、`20260831043141`、`20260831043143`、`20260831043145`、`20260831151322`、`20260901120000`、`20260901120100`、`20260901120200`、`20260901120400` |
| **Vercel** | 須已為 Unit 2 前端；push 後可允許 production deploy |
| **順序** | ① 確認 Unit 2 前端已上線 → ② merge PR → ③ `db push` → ④ 重跑 10 支 P0 SQL + live Advisors |
| **停止點** | REVOKE 後 Edge／RPC 失敗 → **立即**評估還原 grants 或暫停宣稱 |
| **回復** | 需還原 migration 影響的 grants／policies（無一鍵 down）；必要時暫時 re-grant 並記錄事故 |
| **宣稱** | **僅此 unit 驗收全綠後**可宣稱 P0 修復完成 |

---

## 7. 合併前必備（blocking）

| # | 項目 | 通過條件 |
|---|---|---|
| G2-1 | **164 支 migration 單次從零重放** | 第五次 Micro `db push` 164/164 |
| G2-2 | **10 支 P0 SQL** | 原 9 支 + `p0_slack_edge_only_contract_check.sql` |
| G2-3 | **建案四入口** | `p0_admin_create_case_check.sql` + Vitest `case-create-payload.test.ts` |
| G2-4 | **雙 client 競態** | `scripts/dual-client-collab-race.mjs` |
| G2-5 | **Data API definer** | `scripts/micro3-definer-view-api-check.mjs` |
| G2-6 | **Live Advisors** | 2 件 `cases_visible`／`fees_visible` ERROR **如實列為受控例外**；**不得**零 ERROR |
| G2-7 | **本機五關 + build** | typecheck／test／lint 0 error／encoding／forbidden-casts／build |
| G2-8 | **types 重生** | `supabase gen types` 與隔離庫一致 |
| G2-9 | **Preview Slack OAuth** | 真實「連結→已連結→解除」；**merge 前阻擋**；專用測試 Slack App |

---

## 8. GitHub 流程（核准後執行）

1. PR：`feat/isolation-replay-20260901` → `main`（**規劃用**；實際正式推出仍走 §4–§6 三 unit，不得一次 merge 164 支到會 auto-deploy 的 `main`）。
2. PR 附：本檔三 release unit、第五次 Micro 摘要、Advisor 例外說明。
3. **Merge 不等於上線**：依 §4→§5→§6 順序；每 unit 獨立簽核。
4. 正式庫 `db push` 前：`check-migration-history.mjs --live`、備份（見 [`DEV_PIPELINE.md`](DEV_PIPELINE.md)）。

---

## 9. Migration 鏈（隔離線現況）

| 項目 | 值 |
|---|---|
| 總數 | **164** |
| P0 Expand（2） | `20260830122353`、`20260901120300` |
| P0 Harden（12） | 見 §3 表 |
| 最高版號 | `20260901120400` |

---

## 10. 第五次 Micro 紀錄（2026-09-02，最終）

| 項目 | 結果 |
|---|---|
| ref `enexnghinsnyzmezxphk` | **164/164** migration 重放成功 |
| SQL | **10/10** 通過 |
| 競態 | `dual-client-collab-race.mjs` PASS |
| Data API definer | `micro3-definer-view-api-check.mjs` PASS |
| Advisors | 2 件 ERROR（`cases_visible`／`fees_visible`）— **受控例外** |
| types | 已重生並通過 typecheck |
| 處置 | **已刪除**；不得建第六次 |

**現狀：隔離驗收全綠；等待 GitHub 審核。未 push、未開 PR、未部署正式庫。**

---

## 11. 第四次 Micro 紀錄（歷史）

| 項目 | 結果 |
|---|---|
| ref `vysyjvgkddjwdcwalbee` | **164/164** migration 重放成功 |
| SQL | 9/10 通過；`p0_slack_edge_only` 失敗（測試 bug，已修） |
| 競態／Advisors／types | **未執行** |
| 處置 | 已刪除 |
