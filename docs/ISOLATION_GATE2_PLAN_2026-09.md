狀態：規劃中（**未執行**；待第四次 Micro 全綠且 PM 審核後才進行）

# GitHub 第二關計畫（2026-09-02）

**前置**：[`ISOLATION_GATE1_REPORT_2026-09.md`](ISOLATION_GATE1_REPORT_2026-09.md) + 第四次 Micro 從零重放全綠（見本檔 §8）。  
**現階段**：不 push、不開 PR、不 merge、不部署正式庫。

---

## 1. 目標

在 `main` 合併 `feat/isolation-replay-20260901`（**164** 支 migration + P0 收斂）前，完成 GitHub 審核閘門。

**禁止**採用「merge → 一次 `db push` → Vercel 自動部署」——`main` 合併可能觸發 production 部署，會造成前後端版本錯位。

---

## 2. 正式推出：三階段相容部署

### 階段 A — Expand（擴充，**尚未修復漏洞**）

| 項目 | 內容 |
|---|---|
| **目的** | 新增 schema／RPC／revision 相容入口；**暫不**撤銷舊 client 路徑 |
| **Migration 上界** | 套用至 `20260901120300_p0c_slack_meta_rpc_expand.sql`（含 `get_own_slack_meta`） |
| **不含** | `20260901120400_p0c_slack_edge_revoke.sql`（Slack REVOKE）及任何僅 hardening 的 revoke |
| **前端** | **不**部署依賴 RPC、且舊直查仍可用的版本混用 |
| **宣稱** | **不得**宣稱 P0 Slack／建案契約已修復 |

**失敗停止點**：`db push` 至 20300 失敗 → 停止；不進階段 B。  
**回復**：正式庫維持 push 前狀態；若已 push 20300 僅新增 RPC，舊路徑仍可用，可暫緩階段 B。

### 階段 B — Application switch（前端切換）

| 項目 | 內容 |
|---|---|
| **目的** | 部署**已完全改用** `get_own_slack_meta` RPC 的前端（commit ≥ `dcd3741d` 後之 Slack 錯誤處理修正） |
| **部署方式** | 見 §3「避免 main 自動跨越階段」 |
| **驗收** | 冒煙：個人檔案讀取連結狀態、Slack 詢案／註記對話框載入；**無**舊路徑 `from('user_slack_meta')` 呼叫（grep 或 network 抽查） |
| **不含** | Slack 三表 REVOKE |

**失敗停止點**：前端部署後 RPC 失敗率上升 → **暫停階段 C**；可回滾 Vercel 至上一版（階段 A DB 仍相容）。

### 階段 C — Contract／Harden（收緊契約）

| 項目 | 內容 |
|---|---|
| **目的** | 套用撤銷舊入口的 migration；重跑安全負向測試 |
| **Migration** | `20260901120400_p0c_slack_edge_revoke.sql` 及同批 P0 hardening（`20260901120200` 等已於隔離鏈中者，若正式庫尚未套用則一併 push 至鏈尾） |
| **驗收** | `p0_slack_edge_only_contract_check.sql` + 9 支 P0 SQL + live Advisors（2 件 definer view ERROR 標受控例外） |
| **宣稱** | **僅此階段完成後**可宣稱 P0 Slack Edge-only 修復完成 |

**失敗停止點**：REVOKE 後 Edge Function 或 RPC 失敗 → **立即**評估回滾：需還原 grants 或前滾前端（視失敗面）；不得在未驗收下宣稱完成。

### 避免 main 自動部署跨越錯誤階段

1. **合併時暫停 Vercel Production Auto-Deploy**（或僅允許 Preview），直至階段 B 就緒。  
2. **或**：階段 A/B/C 均在 **Preview／手動部署** 驗證後，再以 **單次 production 部署** 搭配對應 DB 狀態（不建議跳過 B 直接 C）。  
3. **DB push 與 Vercel deploy 順序**寫入 runbook checklist；CI 不得隱含「merge = 全上線」。

---

## 3. 合併前必備（blocking）

| # | 項目 | 通過條件 |
|---|---|---|
| G2-1 | **164 支 migration 單次從零重放** | 第四次 Micro `db push` 164/164 |
| G2-2 | **10 支 P0 SQL** | 原 9 支 + `p0_slack_edge_only_contract_check.sql` |
| G2-3 | **建案四入口** | `p0_admin_create_case_check.sql` + Vitest `case-create-payload.test.ts` |
| G2-4 | **雙 client 競態** | `scripts/dual-client-collab-race.mjs` |
| G2-5 | **Data API definer** | `scripts/micro3-definer-view-api-check.mjs` |
| G2-6 | **Live Advisors** | 2 件 `cases_visible`／`fees_visible` ERROR **如實列為受控例外**；**不得**零 ERROR |
| G2-7 | **本機五關 + build** | typecheck／test／lint 0 error／encoding／forbidden-casts／build |
| G2-8 | **types 重生** | `supabase gen types` 與隔離庫一致 |
| G2-9 | **Preview Slack OAuth** | 真實「連結→已連結→解除」；**merge 前阻擋**；不可用正式 token 在臨時 Micro |

---

## 4. GitHub 流程（核准後執行）

1. PR：`feat/isolation-replay-20260901` → `main`（不含 P0-B 凍結 worktree 未提交檔）。  
2. PR 附：本檔三階段表、第四次 Micro 摘要、Advisor 例外說明。  
3. **Merge 不等於上線**：merge 後依 §2 階段 A→B→C 執行；每階段獨立簽核。  
4. 正式庫 `db push` 前：`check-migration-history.mjs --live`、備份（見 [`DEV_PIPELINE.md`](DEV_PIPELINE.md)）。

---

## 5. Migration 鏈（隔離線現況）

| 項目 | 值 |
|---|---|
| 總數 | **164** |
| Expand 上界 | `20260901120300_p0c_slack_meta_rpc_expand.sql` |
| Harden 起點 | `20260901120400_p0c_slack_edge_revoke.sql` |
| 最高版號 | `20260901120400` |

---

## 6. Slack 人工驗收（非 Micro 範圍）

第四次 Micro **不要求**真實 Slack OAuth。以 service role fixture + RPC／client 拒絕測試代替（§6 使用者規格）。

**Merge 前**於 Preview＋測試 Slack App 完成瀏覽器 OAuth 路徑（G2-9）。

---

## 7. 第三次 Micro 紀錄（歷史）

| 項目 | 結果 |
|---|---|
| ref `fzoqmkhqvzqnbaqgeeiv` | 162/162 重放；SQL #2 失敗（Slack grants） |
| 處置 | 已刪除；本輪 `dcd3741d` 後續修正 |

---

## 8. 第四次 Micro 紀錄（2026-09-02）

| 項目 | 結果 |
|---|---|
| ref `vysyjvgkddjwdcwalbee` | **164/164** migration 重放成功 |
| SQL | 9/10 通過；`p0_slack_edge_only` 失敗（測試 bug，已修） |
| 競態／Advisors／types | **未執行**（依規停止） |
| 處置 | 已刪除；**不建第五次** |

**現狀：阻擋修正已落地本機 checkpoint；GitHub／正式庫操作均未執行。**
