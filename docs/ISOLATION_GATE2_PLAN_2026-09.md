狀態：規劃中（**未執行**；待審核後才進行）

# GitHub 第二關計畫（2026-09-01）

**前置**：第一關＋第三次 Micro 從零重放 **尚未全綠**（見 [`ISOLATION_GATE1_REPORT_2026-09.md`](ISOLATION_GATE1_REPORT_2026-09.md) §9）。本檔僅列**核准後**步驟，**現階段不 push、不開 PR、不部署正式庫**。

---

## 1. 目標

在 `main` 合併 `feat/isolation-replay-20260901`（162 支 migration + P0-A/B/C 收斂）前，於 GitHub 完成第二關驗證與審核閘門。

---

## 2. 合併前必備（blocking）

| # | 項目 | 通過條件 |
|---|---|---|
| G2-1 | **162 支 migration 單次從零重放** | 新臨時 Micro（或核准之替代隔離庫）`db push` 162/162；**不得**在失敗專案上修 DB 後宣稱成功 |
| G2-2 | **9 支 P0 SQL 測試** | `p0_*`／`p0b_*`／`p0c_*` 全綠（含 definer view 契約） |
| G2-3 | **建案四入口 round-trip** | `p0_admin_create_case_check.sql` + Vitest `case-create-payload.test.ts` |
| G2-4 | **雙 client 競態** | `scripts/dual-client-collab-race.mjs`（專用 temp 帳號；憑證不進 repo） |
| G2-5 | **Data API definer 契約** | `scripts/micro3-definer-view-api-check.mjs` |
| G2-6 | **Live Advisors** | `get_advisors` 逐支分類；**2 件 ERROR**（`cases_visible`／`fees_visible`）標「經測試核准的受控例外」；**不得**聲稱零 ERROR |
| G2-7 | **本機五關 + build** | typecheck／test／lint 0 error／encoding／forbidden-casts／build |
| G2-8 | **types 重生** | `supabase gen types` 與 migration 一致 |

---

## 3. GitHub 流程（核准後執行）

1. **分支**：`feat/isolation-replay-20260901` → PR 至 `main`（一工項一分支；不含 P0-B 凍結 worktree 未提交檔）。
2. **CI**：現有 workflow 跑 typecheck + test（lint 依 R2 設定）。
3. **PR 描述**附：
   - migration 總數 **162**、最高版號
   - Gate 1 報告連結 + 第三次 Micro 重放紀錄（成功時）
   - WARN 分類文件 + Advisor ERROR 例外說明
   - **not deployable → deployable** 判定表
4. **Review**：PM 審核通過後 merge。
5. **Merge 後**（第三關，本計畫**不含**）：
   - `supabase link` 正式庫
   - `supabase db push`（162 支）
   - Vercel 部署 + 煙霧測試

---

## 4. 正式庫 `db push` 前檢查

- `node scripts/check-migration-history.mjs --live` Local／Remote 一致
- 正式庫 **備份**／維護窗口（依 [`DEV_PIPELINE.md`](DEV_PIPELINE.md)）
- 回滾計畫：migration 不可逆段已文件化

---

## 5. 第三次 Micro 失敗後本輪結論（2026-09-02）

| 項目 | 結果 |
|---|---|
| ref `fzoqmkhqvzqnbaqgeeiv` | migration **162/162** 重放成功 |
| SQL 測試 | `p0_admin_create_case_check` 通過；`p0_definer_view_contract_check` **失敗**（Slack 表缺 REVOKE） |
| 處置 | 已刪除臨時專案；**不建立第四次** |
| 本機修正 | `20260901120200` 補 Slack REVOKE + `get_own_slack_meta` RPC；前端改 RPC 讀取 |
| **G2 狀態** | **blocked** — 需審核是否核准**第四次**隔離重放或改以其他驗證路徑 |

---

## 6. 風險與決策點（需 PM）

1. **Micro 生命週期額度**：原核准「第三次」已用盡且未全綠；是否核准再一輪隔離重放？
2. **`user_slack_meta` RPC 化**：已改 `get_own_slack_meta`；merge 前需 PM 確認 Slack 個人檔案 UX 煙霧測試。
3. **definer view ERROR**：維持 P0-V 受控例外，不 RPC 化（本輪決策）。

**現狀：本計畫已提交 repo，不執行任何 GitHub／正式庫操作。**
