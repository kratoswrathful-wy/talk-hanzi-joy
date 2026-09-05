狀態：工程定案已修訂（2026-09-05）；維護寫入 ACL 本機實作中；**未**取得集中正式授權；不排施工時段

# Gate 2 — 上線準備（權威）

固定候選：**本工項合併後**須含 PR #81 `28f80509`（Gate1 文件 `724d691c`）＋維護寫入 ACL（本分支 `ops/gate2-maint-write-acl-20260905`，migration `20260905120000`）。  
`main` 凍結基準仍為 `724eb886`。  
正式專案：`wshsmerltcakffllgyul`。  
不重跑完整 Gate1；不擴大安全重構；破壞性 restore／新增費用／擴大修改**不在**授權範圍。

**開窗節奏**：不排定時段。安全條件與下方「集中授權」齊備後即可執行；開始影響網站使用前簡短告知即可。「可隨時做」≠ 已授權正式操作。

---

## 1. 可執行的寫入隔離方案（工程定案）

### 1.1 本系統實際相關寫入入口（有限盤點）

| 入口 | 現況 | 與本次窗口 |
|---|---|---|
| 瀏覽器 → PostgREST **RPC／REST**（案件、指派、CAT sync 等） | 幾乎全部一般寫入 | **必須擋**（維護 ACL 包覆已盤點寫入 RPC） |
| Realtime | 僅訂閱／觸發重讀 | 不另開寫入面 |
| Edge（`slack-*` 等） | JWT 路徑查 `maintenance_write_gate`；callback 以 state 的 `user_id` 查 `maintenance_actor_allowed_for_service`；**非**一律放行 service_role | G2-9 必要路徑僅 allowlist；`slack-send-dm` 維護期整路拒絕 |
| Storage | 附件／圖示等 | 與指派重存無關；不保證由本 ACL 覆蓋 |
| 背景 cron／DB webhook | repo **無** pg_cron／內建 webhook 寫案件 | 不納入 |
| GitHub nightly E2E | 打測試環境／CI | 正式窗避免誤觸正式 |
| Postgres 直連（Dashboard SQL、`db push`、dump、psql） | 操作者路徑 | 隔離期間仍可用；指派仍須走 RPC＋模擬 JWT（§1.6） |

**不採**：維護頁＋接受舊分頁殘餘寫入；不以顯示名稱／前端旗標／使用者可填欄位決定放行。

### 1.2 定案架構（可逆；取代「P3 短窗＋請關分頁」）

兩層措施（核准後才動正式設定）：

1. **靜態維護部署**（Draft PR #82）：正式網域 rewrite 到無 SPA 維護頁 → 擋**新進站與重新整理後的 UI**。可 promote／指定 deployment，**不必**永久 merge #82 進 `main`。  
2. **維護寫入 ACL**（migration `20260905120000_gate2_maintenance_write_acl.sql`，**預設關閉**）：  
   - `private.maintenance_access_control.enabled`  
   - `private.maintenance_operator_allowlist`（**僅** `auth.users.id`）  
   - 公開寫入 RPC 外包 `assert_maintenance_write_allowed()`（不取代 `is_admin`／env／participant／revision）  
   - Edge：必要驗收路徑（oauth start／callback／disconnect）僅 allowlist；其他（如 send-dm）維護期拒絕  
   - 閘門 RPC 失敗 → Edge **503**，**不得**當成「可開站／已停寫完成」

**Data API**：驗收／冒煙期間**可保持開啟**，讓 allowlist 帳號走既有 REST／RPC；一般使用者（含未重整舊分頁）對受保護寫入仍被拒。  
關 Data API **可選**用於最終 dump 前的額外停寫層，但：

- **不假定**關閉 Data API 會取消所有**已開始**的交易；須確認相關寫入已結束，再取最終備份基準。  
- 關 Data API ≠ 關 Realtime／Storage／直連 Postgres。

**明確不接受（已否決）**：P3 全面恢復 Data API 後，僅靠「縮短時間＋請關分頁」處理舊分頁寫入，並標為已解決。

### 1.3 三階段

| 階段 | 狀態 | 做什麼 | 不做什麼 |
|---|---|---|---|
| **P1 停寫＋改庫** | 維護頁 ON＋**維護 ACL 啟用**（allowlist 含操作／測試帳）；可選短暫關 Data API 僅為 dump | 確認進行中寫入結束 → 最終 logical dump＋hash；dry-run＝**待套用清單實際支數**（見 §1.7）→ `db push`；部署 Edge（含閘門）與候選前端 | 不對一般使用者開正式 SPA；不以「平台顯示可回復」代替 dump |
| **P2 操作／測試** | 維護頁仍 ON；**Data API 開**；ACL 仍啟用 | allowlist PM／測試帳：指派 UI 或直連 RPC（§1.6）；Slack G2-9 測試帳路徑 | 一般帳／舊 session 寫入；非 allowlist 冒充；暫換正式 Slack secrets |
| **P3 驗收後恢復** | 冒煙通過後：**先確認 ACL 仍擋一般寫入** → 再停用 ACL → 下架維護頁 | 抽樣一般合法流程恢復 | 驗收失敗時**維持 ACL＋維護頁**；禁止「只留維護頁、API／ACL 全開」 |

**驗收失敗**：維持一般寫入隔離（ACL 啟用＋維護頁），不得只靠維護頁而放著 API 全開且 ACL 關閉。

### 1.4 啟用／驗證／恢復

**啟用**  
1. 簡短告知。  
2. 維護頁上正式網域。  
3. `db push` 含 ACL migration 後：以 **service_role／Dashboard** 將操作／測試帳 UUID 寫入 allowlist，再 `maintenance_set_enabled(true)`。  
4. 驗證：  
   - 非 allowlist 舊 session：受保護 RPC → `maintenance_write_denied`，無副作用；  
   - allowlist PM：既有授權下指派成功；  
   - 閘門 RPC 失敗時**不**宣稱停寫完成、**不**開站。

**既有請求**：不假定關 Data API／啟用 ACL 會取消已開始交易。最終 dump 前須確認寫入面已靜止（或僅 allowlist 可控操作已結束）。

**恢復**  
1. 冒煙／G2-9 通過。  
2. `maintenance_set_enabled(false)`（或清空後關閉）。  
3. 下架維護部署／切正式前端。  
4. 抽樣一般合法讀寫。  

「平台備份畫面顯示可回復」與「實際完成回復演練」**分開記錄**；開窗僅要求前者（見 §2.1），restore 需另授權。

### 1.5 限制

| 限制 | 說明 |
|---|---|
| Storage／未包覆之 REST 直寫基表 | 不在本次 RPC 包裝範圍；案件寫入主路徑已收斂至 RPC |
| 直連 Postgres | 操作者仍可繞過 ACL；正式窗紀律約束，不當一般使用者路徑 |
| Gate1 範圍 | **不**宣稱原 Gate1 已涵蓋 `20260905120000`；該支須另做接續基準後的定向驗證 |

### 1.6 直連指派（Dashboard／psql）— 補正

若保留直連呼叫 `pm_update_case_assignments`：

1. **解析真實 PM UUID**（開窗時查 `auth.users`／`profiles`，以登入 email 為準；**不**用顯示名稱當身分）。  
2. **env**：案件列之 `env`（正式窗為 `prod` 案）；確認檔與案件 ID 對齊。  
3. **執行角色**：必須  
   `select set_config('request.jwt.claims', json_build_object('sub', '<PM_UUID>', 'role', 'authenticated')::text, true);`  
   然後 `set local role authenticated;`  
   再呼叫 `public.pm_update_case_assignments(case_id, expected_revision, patch)`。  
4. **結束後** `reset role;`（必要時清 jwt claims）。  
5. **驗證 audit**：`case_mutation_audit.actor_user_id`＝該 PM UUID；revision 遞增；**不可**僅因 `postgres` 角色裸呼成功就宣稱 PM 權限通過。  
6. **禁止**：偽造 JWT 簽章冒充、開放一般使用者自填授權身分、直接 `UPDATE` 基表。

維護 ACL 啟用時：該 PM UUID **須在 allowlist**；否則直連亦會 `maintenance_write_denied`。

### 1.7 候選版本與待套用清單

| 項目 | 值 |
|---|---|
| Gate1 已驗證基準（17 支／166 migrations 至 `20260904004224`） | 見既有 dry-run |
| **本工項新增** | `20260905120000_gate2_maintenance_write_acl.sql` |
| 本分支本地／定向 CI 預期 | migration **167**；最高版號 **`20260905120000`** |
| 正式開窗 dry-run | 必須重跑；預期含本支；**禁止**硬寫死舊「17／166」 |

Edge／前端候選須含本分支閘門程式，不可只推舊 #81 前端而漏 Edge。

---

## 2. 使用者只需完成的兩類準備

### 2.1 備份畫面核對（唯讀）

代理側 Backups API **查不到**（已記錄；不重複嘗試）。`ACTIVE_HEALTHY` ≠ 備份證據。

**入口：** https://supabase.com/dashboard/project/wshsmerltcakffllgyul/database/backups  

| 需要 | 不需要 |
|---|---|
| 最近成功備份時間／狀態／類型 | 密碼、連線字串、token |
| 畫面上可回復／PITR **相關說明**（僅作「平台顯示」記錄） | 完整下載；在聊天貼 secret |

**分開記錄：**

- **平台顯示可回復**＝畫面上有成功列與可回復相關說明。  
- **實際完成回復演練**＝曾做 restore／PITR 演練——**本次不要求、不授權**。  
- **最終 dump 基準**＝停寫確認結束後、改庫前的 logical dump＋hash（集中授權內）。

### 2.2 Slack 測試帳號

**定案：不暫換正式 Slack secrets。** 正式 App＋專用測試帳。  
開窗內（授權後）：該測試帳連結→確認→解除；只動該使用者列；不影響他人連結。  
維護期：測試帳 UUID 須在 allowlist，G2-9 start／callback／disconnect 才會過；`slack-send-dm` 維護期關閉（不影響他人既有連結資料）。

---

## 3. 已完成（無需你再做）

- Gate1／dry-run 17（**其後**另加 ACL 第 18 支，見 §1.7）／維護頁 Preview（#82）／PR #81 候選  
- **PM 指派：34 案／65 位置確認結案**  
- 維護寫入 ACL：**本機分支實作**（預設關閉）；定向 SQL 腳本已備（執行環境見回報）

---

## 4. 建議執行順序（取得 §5 集中授權後）

1. 簡短告知。  
2. 維護頁上正式網域。  
3. 啟用 ACL＋allowlist（操作／測試 UUID）；驗證非放行寫入被拒。  
4. 確認進行中寫入結束 → 最終 dump＋hash（可選再關 Data API 作雙重靜止）。  
5. dry-run＝實際 pending（預期含第 18 支）→ `db push`。  
6. 部署含閘門之 Edge＋候選前端。  
7. P2：allowlist 指派／G2-9。  
8. 通過後關閉 ACL → 下架維護頁 → 監看。  

失敗：維持 ACL＋維護頁；不擅自開站。

---

## 5. 集中授權文字（請一次核准）

請在準備好 §2.1 與 §2.2 後，以明確一句授權下列**整包**。授權前不得執行任何一項。

> **我授權執行 Gate 2 正式發布整包**（候選含 PR #81 `28f80509`＋維護寫入 ACL `20260905120000`／專案 `wshsmerltcakffllgyul`）：  
> （1）啟用寫入隔離：靜態維護部署＋**維護寫入 ACL（allowlist 僅指定操作／測試帳 UUID）**，並完成「非放行舊 session 寫入被拒、放行帳可依既有授權操作」之停寫驗證；  
> （2）確認相關寫入結束後建立最終 logical dump 並記錄 hash（庫外保存；不假定關 Data API 會取消已開始交易）；  
> （3）dry-run 確認**當時實際待套用清單**（含 ACL migration，不得硬套舊「17 支」數字）後執行 `db push`；  
> （4）部署對應 Edge（含維護閘門）與前端（含必要時 promote；維護頁可不永久 merge）；  
> （5）依已確認之 34 案／65 位置 UUID，經 `pm_update_case_assignments`（JWT claims＋`SET LOCAL ROLE authenticated`、真實 PM UUID、重讀 revision、驗證 `case_mutation_audit.actor_user_id`）套用指派；僅對新增／實質變更暫停並回報；  
> （6）以專用測試帳對**既有正式 Slack App**做連結→已連結→解除（測試帳在 allowlist；不暫換 secrets；不影響他人連結）；並完成約定冒煙；  
> （7）驗收通過後關閉 ACL、下架維護頁、恢復一般使用者存取並短監看。驗收失敗則**維持 ACL 與維護頁**，不得只留維護頁而關閉 ACL。  
> **開始影響網站前可先簡短告知，無需再等施工時段確認。**

**本授權不含：** 破壞性 restore／PITR 演練、啟用付費加值、擴大修改、重跑完整 Gate1、暫換正式 Slack secrets、依姓名重猜指派、直接改表繞過 RPC、偽造 JWT 簽章。

**失敗即停（保持維護頁＋ACL，不擅自擴大修復）：**

- 停寫驗證失敗（非放行帳仍能寫入受保護 RPC）  
- 閘門 RPC 不可用卻被當成「可開站」  
- 最終 dump／hash 失敗  
- dry-run 與預期 pending 不符或 `db push` 錯誤  
- 指派 RPC revision 衝突、audit actor 不符、或以 postgres 裸呼冒充 PM 驗證  
- Slack 測試影響其他成員憑證／workspace 安裝  
- 冒煙發現 P0 且無法在固定候選上短修  

回復（需**另**授權）：最終 dump／平台備 restore、前端回 `724eb886` 對應 deployment 等——**不在**上段整包內。

---

## 6. 停止點（現在）

未取得 §5 全文授權前：**不** push／merge、**不** dump、**不** db push、**不**部署、**不**改正式設定、**不**建立付費資源、**不**執行正式 Slack 連結測試。
