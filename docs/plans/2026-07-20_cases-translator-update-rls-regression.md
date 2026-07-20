狀態：已落地待驗收

# 工項 2：譯者「改狀態」類流程回歸（D 基表收權副作用）

日期：2026-07-20  
對應：工項 D（#58）`cases` 基表 SELECT 僅 admin

## 1. 根因（比「寫入後 .select() 回讀」更精確）

PostgreSQL RLS：**UPDATE（含 WHERE）需要能 SELECT 到該列**。  
D 將 `cases_select` 收成僅 `is_admin` 後，譯者對基表：

| 操作 | 結果 |
|---|---|
| `GET /cases` | 200、0 列（預期） |
| `PATCH /cases`（直寫 UPDATE） | **200、靜默 0 列、DB 不變**（無 4xx；optimistic UI／Slack 仍可能先跑） |
| `SELECT cases_visible` | 正常（遮罩後可讀） |

因此「承接改狀態／譯者欄」「任務完成」「協作勾選寫 collab_rows」等凡走 `supabase.from("cases").update(...)` 的路徑，譯者身分全部失效；Slack 若在 `caseStore.update` 之後、不依賴寫入成功回傳，會出現「訊息有發、案件沒變」。

寫入擋 trigger（七敏感欄）**未誤傷**狀態／譯者／collab 欄——問題在「列不可見 → UPDATE 0」，不是 trigger。

## 2. 系統性影響清單（譯者可觸發）

| # | 流程 | 寫入路徑（修前） | 症狀 |
|---|---|---|---|
| A | 單檔確認承接 | `caseStore.update` → 基表 UPDATE | 譯者／狀態不落地；Slack 可能仍發 |
| B | 協作分段確認承接 | 同上（`collabRows`＋必要時 `status`） | 勾選不持久／不升「已派出」 |
| C | 任務完成（按鈕或全段勾選） | 同上 | 狀態不升「任務完成」 |
| D | 無法承接（declineRecords） | 同上 | 紀錄可能不落地 |
| E | 退回修正／退回處理／交件等（若譯者可按） | 同上 | 同類靜默失敗 |
| F | CAT→LMS `taskCompleted` 同步 | `cat-wf-lms-sync` 基表 UPDATE | 雙向完成狀態不落地 |
| G | CAT `lms.updateCaseCollab` | `cat-cloud-rpc` 基表 UPDATE | 協作列回寫失敗 |
| H | CAT 檔案指派（承接第 3 步） | `sync_cat_*` **SECURITY DEFINER** 讀 `cases` | **本身不踩收權**；但上游案件未寫入時同步讀到舊狀態 → 指派不生效 |

讀取面：列表／詳情／realtime 重查已走 `cases_visible`，非本回歸主因。

## 3. 修復策略（一次收斂）

1. Migration：`apply_case_update(p_case_id, p_patch)`（SECURITY DEFINER）  
   - 同 env 檢查；非 admin 剝除七敏感欄；`jsonb_populate_record` 合併後 UPDATE  
   - 基表 SELECT 政策**不變**（仍僅 admin）
2. 共用 helper：`src/lib/apply-case-update.ts`  
3. 全數改接 helper：`case-store.update`、`cat-wf-lms-sync`、`cat-cloud-rpc` `lms.updateCaseCollab`  
4. 禁止新增 `from("cases").update`（譯者路徑）

## 4. 回歸測試缺口（D 上線時）

- 有：基表 SELECT 0 列、view 遮罩、敏感欄 PATCH 不落地（見結案紀錄）  
- **缺**：譯者「允許欄」UPDATE（status／translator／collab_rows／task_completed）冒煙  
- **缺**：承接 → CAT 指派 → Slack 端到端（正式／preview 譯者身分）  
- **缺**：自動化 e2e 覆蓋譯者狀態機（承接／完成／退回）

補上：`supabase/tests/w10_cases_translator_update_rpc_check.sql`＋`apply-case-update.test.ts`。

## 5. 正式環境冒煙／e2e 計畫（建議）

### 5.1 合併後立刻（譯者帳號，正式或等值 preview）

1. 單檔詢案 → 承接本案 → 譯者=本人、狀態=已派出、連結 CAT 檔有指派、Slack 照發  
2. 多人協作詢案 → 勾確認承接（含最後一格升已派出）→ 該段 accepted 持久、狀態正確  
3. 已派出 → 按任務完成（或勾齊分段）→ 狀態=任務完成  
4. 抽測：無法承接、退回修正（若該身分可見）、交件相關按鈕不誤傷  
5. Network：案件寫入應見 `rpc/apply_case_update` 且 `ok:true`；不應再依賴譯者 `PATCH /cases` 成功

### 5.2 後續 e2e（排程）

- Playwright 測試模式：譯者假人跑 A–C；斷言 DB／`cases_visible` 狀態與 `cat_stage_assignments`  
- CI 可選跑 `w10_cases_translator_update_rpc_check.sql`（需 test profiles）

### 5.3 與「共同檢討」對照

工作類型錯鍵、計費單位、承接／完成——多屬 A／D 上線後**缺譯者冒煙**。  
本修復後，凡案件狀態寫入應經 RPC；新權限變更 checklist 應含：**譯者允許寫入欄的 UPDATE 冒煙**（不只 SELECT 遮罩）。
