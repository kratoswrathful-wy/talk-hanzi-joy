狀態：維護 ACL 已結案（`99bc4d20`／CI `33942782337`）；**未**取得集中正式授權；不排施工時段

# Gate 2 — 上線準備（唯一權威清單）

## 0. 完整候選（授權與部署必須對齊此節，不得只引用舊 SHA）

| 層 | 內容 | SHA／識別 |
|---|---|---|
| `main` 凍結基準 | 已部署線 | `724eb886` |
| **P0 安全候選（原 Gate1／PR #81）** | 前端／既有 17 支 pending 之程式基準 | commit **`28f80509`**（PR #81）；Gate1 文件標記 `724d691c` |
| **維護寫入 ACL（已定向驗證結案）** | migration `20260905120000`＋Edge 閘門＋types | 分支 `ops/gate2-maint-write-acl-20260905` 頂端 **`99bc4d20`**；CI run **`33942782337`** |
| 靜態維護頁 | Draft PR #82 | 可 promote／指定 deployment；**不必**永久 merge 進 `main` |
| 正式專案 | — | `wshsmerltcakffllgyul` |

**集中授權與開窗部署的「完整候選」＝ P0 `28f80509` 所含內容 ＋ 維護控制 `99bc4d20`（含其 migration／Edge）。**  
禁止授權文或操作單只寫 `28f80509`／`724d691c` 而漏掉維護控制。  
候選整合進可部署線時：避免意外觸發正式 Vercel／production；**本次仍不 merge、不改正式設定**。

不重跑完整 Gate1；不擴大改善；破壞性 restore／付費加值／擴大修改不在範圍。  
**不排施工日期**；備份核實＋Slack 測試帳＋下方集中授權齊備後即可接續（開始影響網站前簡短告知即可）。

### 0.1 Migration 數量（預期 vs 執行前核對）

| 項目 | 預期（本候選） | 注意 |
|---|---|---|
| 完整候選 repo migration 總數 | **167**（最高版號 `20260905120000`） | 定向 CI 已驗；含 ACL 第 167 支 |
| 正式庫相對本候選**待套用** | **18** 支＝原 dry-run 17 ＋ `20260905120000_gate2_maintenance_write_acl.sql` | 原 17 支清單見下；**執行前須 dry-run 核對實際檔名與順序，不得只比數量** |
| 舊 Gate 2B dry-run | 恰好 17（至 `20260904004224`） | **已過時為「完整候選」數字**；僅作歷史證據 |

原 17 支（順序不得改用「只高於 production 最大版號」推算）：

1. `20260610135900_cat_workflow_phase_b_prereq.sql`  
2. `20260830122351_p0a_case_participants_revision_audit.sql`  
3. `20260830122353_p0a_case_participant_backfill_safe.sql`  
4. `20260830122356_p0a_case_action_rpcs.sql`  
5. `20260830122359_p0a_case_field_acl.sql`  
6. `20260830122401_p0a_case_credentials.sql`  
7. `20260831043141_p0b_apply_case_update_admin_only.sql`  
8. `20260831043143_p0b_workflow_rpc_acl.sql`  
9. `20260831043145_p0b_assignment_rls.sql`  
10. `20260831151322_p0b_acl_harden.sql`  
11. `20260901120000_p0c_security_convergence.sql`  
12. `20260901120100_p0c_view_helper_grants_and_display_name.sql`  
13. `20260901120200_p0c_privileged_function_hardening.sql`  
14. `20260901120300_p0c_slack_meta_rpc_expand.sql`  
15. `20260901120400_p0c_slack_edge_revoke.sql`  
16. `20260902054823_p0d_pm_assign_participants_sync.sql`  
17. `20260904004224_p0d_restore_admin_create_payload_validation.sql`  
18. **`20260905120000_gate2_maintenance_write_acl.sql`**（Gate1 **未**涵蓋；已另以 `99bc4d20`／`33942782337` 定向驗證）

### 0.2 已完成證據（不重複要求）

- Gate1／原 17 支 dry-run／PR #81／維護頁 Preview（#82）  
- **PM 指派 34 案／65 位置確認結案**（執行前只核對相對確認檔之新增／實質變更，**不重選人、不重跑確認**）  
- 維護寫入 ACL：**結案** `99bc4d20`／workflow `33942782337`

---

## 1. 寫入隔離（工程定案摘要）

1. 靜態維護部署（#82）擋新進站／重整後 UI。  
2. 維護寫入 ACL（預設關；開窗啟用＋allowlist UUID）：擋一般使用者（含舊分頁）受保護寫入；不取代角色／env／participant／revision。  
3. Data API 驗收期可開；**不**以「短窗＋請關分頁」當已解決。  
4. 關 Data API **不**假定取消已開始交易；最終 dump 前確認寫入已結束。  
5. 直連指派：真實 PM UUID＋`set_config(request.jwt.claims)`＋`SET LOCAL ROLE authenticated`＋驗證 audit；禁止裸 `UPDATE`／偽造簽章。  
6. 驗收失敗：維持 ACL＋維護頁；不得只留維護頁而關 ACL。

細節仍以本檔先前 §1 定案與 `99bc4d20` 程式為準。

---

## 2. 開窗前你需完成的兩項準備

### 2.1 備份畫面核對（唯讀）

入口：https://supabase.com/dashboard/project/wshsmerltcakffllgyul/database/backups  

請記下（勿貼密文）：最近成功備份**時間**、**COMPLETED／成功**、**類型**、畫面上**可回復／PITR 相關說明**。  
分開：「平台顯示可回復」≠「已做回復演練」（後者本次不要求）。`ACTIVE_HEALTHY` ≠ 備份證據。

### 2.2 Slack 測試帳（開窗前備妥；開窗內才測）

不暫換正式 Slack secrets。準備一組**專用測試** TMS 帳＋正式 Slack workspace 對應成員；確認 Edge secrets **名稱存在**即可。  
開窗內（授權後、測試帳在 allowlist）：該帳連結→已連結→解除；只動該使用者列。

---

## 3. 建議順序（取得 §4 授權後）

維護頁 → 啟用 ACL＋驗證非放行被拒 → 寫入靜止後最終 dump → dry-run **核對 18 支檔名順序** → `db push` → 部署含 `99bc4d20` 閘門之 Edge＋P0 前端 → 指派／G2-9 → 關 ACL → 下架維護頁。

---

## 4. 集中授權文字（請一次核准）

> **我授權執行 Gate 2 正式發布整包**（完整候選＝P0 **`28f80509`**＋維護寫入 ACL **`99bc4d20`**／專案 `wshsmerltcakffllgyul`）：  
> （1）啟用寫入隔離：靜態維護部署＋維護寫入 ACL（allowlist 僅指定操作／測試帳 UUID），並完成非放行舊 session 寫入被拒、放行帳可依既有授權操作之驗證；  
> （2）確認相關寫入結束後建立最終 logical dump 並記錄 hash（不假定關 Data API 會取消已開始交易）；  
> （3）dry-run **核對實際待套用清單（預期 18 支，含 `20260905120000`；須核對檔名與順序，不得只比數量）**後執行 `db push`；  
> （4）部署對應 Edge（含維護閘門，對齊 `99bc4d20`）與前端（對齊 P0 `28f80509`；維護頁可不永久 merge）；避免雙發與意外正式部署；  
> （5）依已確認之 34 案／65 位置，經 `pm_update_case_assignments`（JWT claims＋`authenticated`、真實 PM UUID、重讀 revision、驗證 audit actor）套用；僅對新增／實質變更暫停回報；  
> （6）專用測試帳對既有正式 Slack App 做連結→已連結→解除（測試帳在 allowlist；不暫換 secrets）；並完成約定冒煙；  
> （7）通過後關閉 ACL、下架維護頁、恢復一般存取並短監看。失敗則維持 ACL＋維護頁。  
> **開始影響網站前可先簡短告知；無需再等施工時段／日期確認。**

**不含：** restore／PITR 演練、付費加值、擴大修改、重跑完整 Gate1、暫換 Slack secrets、依姓名重猜指派、直接改表、偽造 JWT。

**失敗即停：** 停寫驗證失敗；閘門不可用卻當可開站；dump／hash 失敗；dry-run 清單不符或 `db push` 錯誤；指派 revision／audit 異常；Slack 影響他人；冒煙 P0 無法在固定候選短修。

回復需**另**授權。

---

## 5. 停止點（現在）

未取得 §4 全文授權前：**不** merge、**不** dump、**不** db push、**不**部署、**不**改正式設定、**不**建立付費資源、**不**執行正式 Slack 連結測試。
