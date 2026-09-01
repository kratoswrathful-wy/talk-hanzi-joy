狀態：規劃中

# Privileged Functions WARN 分類（2026-09-01）

來源：隔離 Gate 1 報告 §5（Advisor **WARN 60**）；本檔由 `scripts/advisor-classify.mjs` 對 162 支 migration 累積 ACL 反推，**非 live get_advisors**（臨時專案已刪除）。

## 摘要

| 分類 | 約略數量 | 部署意義 |
|---|---:|---|
| **P0 deploy blocker** | ~22 | 寫入／副作用／憑證／權限路徑；`20260901120200` 已批次 REVOKE public/anon EXECUTE + 修正 legacy `search_path=public` |
| **Named exception** | ~34 | 純函式或 ACL 已在 P0-A/B/C 收斂；Advisor 仍可能 WARN search_path，文件化後可接受 |
| **Slack edge-only（INFO）** | 2 | `slack_oauth_states`、`user_slack_meta`：RLS + 無 client table grants；meta 讀取經 RPC |
| **P0-V definer view（ERROR）** | 2 | `cases_visible`、`fees_visible`：受控例外；見 `p0_definer_view_contract_check.sql` |

## P0 deploy blocker（已落地 migration 20260901120200）

| 函式／資產 | WARN 類型 | 動作 |
|---|---|---|
| `public.cat_upsert_segment_snapshot` 等 Phase C snapshot/annotation 系列 | definer + search_path=public | REVOKE public/anon；`search_path → pg_catalog, public` |
| `public.cat_*` workflow／assignment 寫入 RPC | definer + legacy grants | REVOKE public/anon（p0b/p0c 已部分覆蓋；20200 批次補強） |
| `public.apply_case_update`、`admin_*_case` | definer | REVOKE public/anon；authenticated admin-only |
| `public.get_case_credentials`／`update_case_credentials` | 讀取機密 | REVOKE public/anon |
| `public.accept_*`／`decline_*`／`complete_case_*` | 副作用 | REVOKE public/anon |
| `public.current_env` | search_path + anon EXECUTE | REVOKE anon（20200） |
| Storage `case-files` public bucket（若存在） | 公開讀取 | **待第三次 Micro Advisors 再驗**；若仍 public 則 P0 |

## Named exception（具名例外，非 legacy 降 P1）

| 函式 | 理由 |
|---|---|
| `public.has_role`／`public.is_admin` | RLS 純判斷；authenticated 可 EXECUTE；search_path 可後續改 pg_catalog |
| `public.handle_new_user` | Auth trigger；非 Data API |
| `public.cases_emit_change_signal`／`fees_emit_change_signal` | 觸發器內部；無 anon EXECUTE |
| `private.*` helper（除 barrier 兩支） | 無 schema USAGE；無 qualified call |

## security_barrier helper EXECUTE（誠實記載）

- **`authenticated` 具有** `private.public_tool_structure(jsonb)` 與 `private.case_field_permission_allowed(text,text)` 的 **EXECUTE**（`20260901120100`），供 `security_barrier=true` 的 `cases_visible` 評估。
- **`authenticated` 不具有** `private` schema **USAGE**；無法 `SELECT private.*(...)` qualified call（`p0_definer_view_contract_check.sql` §4）。
- 先前 Gate 1 報告「helper 僅內部可 EXECUTE」**不正確**；正確敘述為：**有 EXECUTE、無 USAGE、不可 qualified 直呼**。

## Slack Edge-only 證明

- 表：`slack_oauth_states`、`user_slack_meta`
- RLS：**enabled**
- **Table grants**：`anon`／`authenticated` **無** SELECT／INSERT／UPDATE／DELETE（`20260901120200` REVOKE）
- **Policy**：兩表皆**無** client policy；`user_slack_meta` 讀取改經 `get_own_slack_meta()` RPC
- 驗證：`p0_definer_view_contract_check.sql` catalog 段 + Data API 腳本

## 殘餘 Advisor ERROR（不可聲稱為零）

- `cases_visible`、`fees_visible`：`security_definer_view` ERROR → **P0-V 接受受控例外**（非忽略）
