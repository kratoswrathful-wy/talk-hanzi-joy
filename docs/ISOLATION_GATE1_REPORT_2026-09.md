狀態：已驗收（第一關隔離重放）；**整體仍 not deployable**（見 §8）

# 第一關隔離驗收報告（2026-09-01）

分支：`feat/isolation-replay-20260901`（worktree `C:\Homemade Apps\1UP-TMS-isolation-20260901`）  
正式庫 `wshsmerltcakffllgyul`：**未修改**（刪除臨時專案後僅剩此專案）。

---

## 1. 臨時專案生命週期

| 次序 | 專案 ref | 名稱 | 結果 | 處置 |
|---|---|---|---|---|
| **1** | `qxqhixmzhzudakxvlfbv` | isolation-replay-20260901 | 159/160 migration；`20260901120000` COMMENT 語法錯誤 | 已刪除（先前階段） |
| **2** | `hkumqnbuxsvscnmwlnpj` | isolation-replay-v2-20260901 | 160/160 乾淨重放成功；驗收 SQL 暴露缺口 → 補丁 201–205 後全測通過 | **2026-09-01 已刪除** |

**費用估算（Micro，ap-southeast-1）**  
- 生命週期 1＋2 合計約 **2–3 小時**（含兩次 `db push`、SQL 測試、types 重生）。  
- 以 Supabase Micro 計費粗估 **＜ US$0.15**（遠低於 US$1 硬頂）。  
- 未啟用 Branch、PITR、IPv4、自訂網域或額外 add-on。

**重要限制**  
依核准「最多兩次生命週期」：生命週期 2 在 **160 支 migration 全鏈成功後**，因驗收測試失敗而 **追加補丁 201–205**（非從零重跑）。因此 **不得宣稱「165 支從零一次全綠」**；補丁邏輯已入 repo，待 GitHub 第二關或另案第三次乾淨重放驗證。

---

## 2. 方案 A 修改矩陣

詳見 [`SCHEME_A_MODIFICATION_MATRIX_2026-09.md`](../1UP-TMS-baseline-repair-20260830/docs/SCHEME_A_MODIFICATION_MATRIX_2026-09.md)（分支 `feat/scheme-a-replay-fixes-20260901`）。

| 項目 | 內容 |
|---|---|
| 新增 prereq | `20260610135900`（解 `20260610140000` forward reference） |
| token 異文修正 | 4 支 + 1 placeholder 替換 |
| R2.1 修正後 | token 異文 **0**、順序洞 **0** |
| 合併後 migration 總數 | 基線 150 + P0 鏈 + p0c 補丁 → **165** |

---

## 3. 全鏈重放結果

| 階段 | migration 上限 | 結果 |
|---|---|---|
| 生命週期 2 從零 | `20260901120000`（160 支） | **全成功** |
| 驗收後補丁 | `20260901120500`（+5 支） | 生命週期 2 上 **db push 成功**（非從零） |

P0 鏈含：P0-A、P0-B（B1–B3）、`p0c_security_convergence`、補丁 201–205。

---

## 4. SQL ACL 與競態測試（生命週期 2，補丁 205 後）

| 測試檔 | 結果 |
|---|---|
| `p0_case_field_acl_check.sql` | 通過 |
| `p0_case_credentials_acl_check.sql` | 通過（補丁 202：security_barrier 須 grant authenticated EXECUTE 私有 helper） |
| `p0_case_mutation_acl_check.sql` | 通過（含公開詢案 stale revision 競態） |
| `p0b_acl_harden_check.sql` | 通過（補丁 205：admin_create_case 最小 INSERT；測試修正基表 SELECT 時機） |
| `p0c_translator_eligibility_check.sql` | 通過（空白協作列、display_name、凍結、PM 拒絕、stale revision） |

**空白協作分段產品規則（server）**  
- `private.p0_assert_translator_eligible`：`user_roles.member` + `trim(display_name)` 非空 + 同 env + 非 frozen；PM/executive → `admin_use_management_path`。  
- `accept_inquiry_collab_row`：空白 `translatorUserId` 先搶先得；列鎖 + expected revision + 條件更新。

---

## 5. Advisors（隔離庫，補丁後）

| 等級 | 數量 | 備註 |
|---|---:|---|
| ERROR | **2** | `cases_visible`、`fees_visible` security definer view |
| WARN | **60** | 含 legacy `search_path`、anon 可 EXECUTE 之 definer RPC 等 |
| INFO | **2** | Slack 表 RLS 無 policy（Edge 專用，既有設計） |

**ERROR 威脅模型（刻意保留，非「結案忽略」）**  
- **資產**：`cases`／`fees` 基表 SELECT 已限 admin／service_role；一般讀取僅 `*_visible`。  
- **控制**：view owner=postgres、`security_invoker=false`、`security_barrier=true`；欄位 allowlist／遮罩；`private.*` helper 僅 schema 內可 EXECUTE；負向 SQL 測試（anon、未指派、跨 env、基表直讀）。  
- **殘餘風險**：Advisor 泛用規則不辨識「definer view + 基表撤權」模式；待 P1 評估 RPC 化或 policy 等價替代。

---

## 6. Schema inventory（隔離 vs 正式，唯讀比對）

**隔離獨有（正式尚未部署 P0）**  
- 表：`case_participants`、`case_participant_backfill_unresolved`、`case_mutation_audit`  
- RPC／函式：P0-A/B/C 全套（`accept_*`、`apply_case_update`、`admin_*_case`、`get_case_credentials` 等）  
- migration 版號：正式最高約 `20260825120952`；候選鏈至 `20260901120500`

**非 SQL 差異**  
- Auth 使用者、Storage 物件、Edge Secrets、Realtime、Vercel env：**未複製**（見 `NON_SQL_REBUILD_CHECKLIST_2026-09.md`）。

---

## 7. 本機閘門（隔離 worktree，補丁後）

| 關卡 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `npm run test` | 475 通過 |
| `npm run lint` | 0 error（40 warnings 既有） |
| `npm run check:encoding` | 通過 |
| `npm run check:forbidden-casts` | 通過 |
| `npm run build` | 通過 |
| `supabase gen types` → `types.ts` | 已重生 |

---

## 8. 部署判定與剩餘工項

### 判定：**not deployable**

1. 165 支 migration **未在單次從零重放中驗證**（生命週期額度已用盡）。  
2. GitHub 第二關 **未核准**（無 push／PR／CI／Vercel）。  
3. 正式庫 **未套用** P0 鏈。

### 剩餘 P0（阻塞正式部署）

| ID | 項目 |
|---|---|
| P0-R | **165 支 migration 從零乾淨重放**（需另案核准第三次臨時專案，或第二關後 staging） |
| P0-V | `cases_visible`／`fees_visible` Advisor ERROR：威脅模型已文件化；是否 RPC 化待產品／工程決策 |
| P0-T | 雙 **client 連線**競態（目前 SQL 單 session 模擬 stale revision；Playwright 或雙連線 SQL 待補） |

### P1

- 收斂 legacy definer RPC 之 anon EXECUTE WARN（非 P0 路徑盤點後批次 revoke）。  
- `cat_*` helper 固定 `search_path`（Advisor WARN 批次）。  
- 合併 p0c 補丁 201–205 為較少檔案（可選，合併前不得 mark-applied 偽造）。

### P2

- GitHub 第二關計畫（repository、branch、PR、CI、production 隔離保證）。  
- 非 SQL 重建清單逐項勾驗。

---

## 9. 相關 commit／分支

| worktree | 分支 | 用途 |
|---|---|---|
| `1UP-TMS-isolation-20260901` | `feat/isolation-replay-20260901` | 本報告 checkpoint |
| `1UP-TMS-p0b-20260830` | `feat/p0b-security-20260830` | P0-B + p0c 本機收斂 |
| `1UP-TMS-baseline-repair-20260830` | `feat/scheme-a-replay-fixes-20260901` | 方案 A 候選 |

**未 push、未開 PR、未部署。**
