狀態：第五次 Micro 全綠；**Gate 2 改採單次受控維護窗口，待 Draft PR 與正式執行核准**

# Gate 2：P0 安全修正正式發布計畫（2026-09-02）

**權威基準**：`feat/isolation-replay-20260901` @ `cfca5b17`，基於 production `main` @ `724eb886`。
**已完成**：第五次 Micro 164/164 從零重放、10/10 SQL、雙 client 競態、Data API、types、本機品質閘門均通過。
**本文件授權範圍**：可推功能分支、建立 Draft PR、取得 CI／Vercel Preview 證據；**不得 merge、不得操作正式 Supabase、不得部署 production**，直到維護窗口另獲明確核准。

---

## 1. 為何改成單次維護窗口

原三 release unit（Expand → Application switch → Harden）經逐檔核對後不可執行：

1. `20260830122353_p0a_case_participant_backfill_safe.sql` 依賴 `20260830122351_p0a_case_participants_revision_audit.sql` 建立的 unresolved 表，不能先拆出套用。
2. 新前端需要的多個 RPC 與 REVOKE／RLS 收緊位於同一批 migration；若先切前端，RPC 尚不存在；若先套 Harden，舊前端會失效。
3. `supabase db push` 沒有版號上界。拆 PR 會形成一條未在第五次 Micro 驗證過的新 migration 鏈；依既定封頂線，不再建立第六次 Micro。

因此正式發布採用：

> **公告短暫維護 → 阻止新操作 → 備份 → 一次套用第五次 Micro 已驗證的完整待辦 migration → 部署同一候選版本的前端與 Edge Functions → 冒煙驗收 → 恢復服務。**

不再宣稱可在資料庫已 Harden 後「只回滾 Vercel」：舊前端可能與新 ACL 不相容。

---

## 2. 固定範圍與封頂線

### 2.1 本次候選範圍

- 正式 migration history：149 個版本，最高 `20260825120952`。
- repo migration：164 支。
- 正式庫預期待套用：**15 支**：
  - 1 支 backdated Scheme A 前置：`20260610135900_cat_workflow_phase_b_prereq.sql`
  - 14 支 P0：`20260830122351`～`20260901120400`
- 正式執行前以 `supabase db push --linked --include-all --dry-run` 重新列舉；結果必須**恰好等於上述 15 支**，順序以 CLI 顯示為準。
- 不帶 seed、不使用 `db reset --linked`、不使用 Dashboard SQL Editor 或 MCP 直接套 migration。

### 2.2 新問題封頂線

只有下列證據可阻擋本次上線：

- 可重現的權限繞過或敏感資料外洩；
- 可重現的資料遺失／破壞；
- migration 無法完整套用或 history 與預期不同；
- 合法 LMS／CAT 核心流程無法操作；
- Auth 永久 loading／登入循環；
- Slack OAuth 造成既有 credentials 遺失，或 Edge 回傳錯誤成功狀態；
- CI、必要 SQL 契約或正式冒煙出現明確失敗。

一般 warning、尚未改善的舊問題、非本次範圍的最佳化、文件偏好，不得再擴張為新 P0。`cases_visible`／`fees_visible` 的 2 件 definer Advisor ERROR 已有 Data API 負向測試佐證，維持「受控例外」，不得宣稱零 ERROR，也不再因此重開架構。

---

## 3. Gate 2A：GitHub／Preview 候選（現在可執行）

1. 在現有權威分支更新本文件並跑本機品質閘門。
2. 確認 diff 不含其他 worktree、P0-B 舊草稿或 production secret。
3. push `feat/isolation-replay-20260901`。
4. 建立 **Draft PR** 指向 `main`，附上：
   - 第五次 Micro 證據；
   - 2 件 Advisor 受控例外；
   - 本文件的維護窗口與回復限制；
   - 明文標示「不可直接 merge」。
5. 等待 GitHub CI 與 Vercel Preview build 全綠。
6. Preview 只驗證 build、路由、Auth loading fallback 與不依賴新 RPC 的靜態流程。Preview 若連到尚未套 P0 RPC 的正式 Supabase，**不得**以新 RPC 功能失敗判定候選失敗，也不得在正式資料建立測試資料。
7. G2-9 Slack OAuth 使用專用測試 Slack App；若 Preview 缺少安全的測試 App／callback 設定，移至維護窗口內、恢復服務前執行，不因此建立新 Supabase Micro。

### Gate 2A 停止點

Draft PR checks 未全綠、diff 混入其他工作、Vercel Preview build 失敗，立即停止；不得 merge、不得碰正式資料庫。

---

## 4. 正式維護窗口前置條件（全部 blocking）

| # | 條件 | 通過證據 |
|---|---|---|
| M-1 | Draft PR 的 GitHub CI 與 Vercel build 全綠 | PR checks + deployment READY |
| M-2 | 候選 commit 固定 | SHA 記入執行紀錄；窗口中不得換 commit |
| M-3 | 正式 migration history 無漂移 | 遠端仍 149 支；無 only-remote；dry-run 恰好 15 支 |
| M-4 | 正式庫為 ACTIVE_HEALTHY | Supabase 狀態與 SQL 健康檢查 |
| M-5 | 可用備份 | 確認最新平台備份；另取得窗口前的 logical schema／roles／data dump，存於 Git 外受限位置並記錄 hash |
| M-6 | 已知良好 production 前端 | 記錄目前 deployment、commit `724eb886` 與 URL；不得刪除此 deployment |
| M-7 | 維護頁／公告就緒 | 能阻止新使用者開始工作；公告要求已開啟頁面停止操作並重新整理 |
| M-8 | 執行者與觀察者就緒 | 一人操作、一人核對；若只有一人，逐項截圖／記錄後才繼續 |
| M-9 | Slack 測試條件就緒 | 專用測試帳號與 Slack App，不使用真實使用者資料 |
| M-10 | 明確核准 | 使用者核准窗口時間、預估停機與正式 DB／Vercel 操作 |

未滿足任一項，不進入維護窗口。

---

## 5. 正式發布順序（單次維護窗口）

### Phase 0 — 開始維護

1. 宣布維護開始，記錄開始時間。
2. 將 production 網頁切至維護頁；確認 `/cases`、`/cat/team` 不再讓使用者開始新工作。
3. 等候短暫排空時間，提醒現有分頁停止編輯。
4. 再次確認 Supabase 正式專案 ref 必須為 `wshsmerltcakffllgyul`，Vercel project 必須為 `talk-hanzi-joy`。

### Phase 1 — 備份與 dry-run

1. 確認平台備份時間與可還原性；建立 logical roles／schema／data dump。
2. 計算備份檔 hash，保存於 Git／repo／`.env` 外。
3. 唯讀列出正式 migration history。
4. 執行 `supabase db push --linked --include-all --dry-run`。
5. dry-run 必須只顯示 15 支預期 migration；多一支、少一支、順序異常或 project ref 不符，**立即停止**。

### Phase 2 — 套用正式 migration

1. 執行一次 `supabase db push --linked --include-all`；不帶 seed。
2. 保存完整輸出與完成時間，不把密碼或 token 寫入 log／文件。
3. 任一 migration 失敗：維持維護頁，禁止重跑、禁止在 Dashboard 手修後宣稱成功；進入 §7 回復決策。
4. 成功後確認遠端 migration history 新增恰好 15 支，最高 `20260901120400`。

### Phase 3 — 部署應用與 Edge Functions

1. 部署固定候選 commit 對應的 Supabase Edge Functions。
2. 建立／確認同一 commit 的 Vercel production build，切換 production domain。
3. 不以舊 frontend 作為 DB Harden 後的普通回滾目標。

### Phase 4 — 維護中驗收

依序執行；前一項失敗即停：

1. Auth：登入、F5 `/cases`、`/cases` ↔ `/cat/team`、CAT F5，皆須在 bounded time 離開全畫面 loading。
2. Cases：PM 建案、一般 participant 允許欄位更新、未受指派者越權拒絕、公開詢案承接。
3. CAT：合法 assignee 讀寫本人範圍；非 assignee、跨 env、direct assignment mutation 拒絕。
4. Credentials：`cases_visible` 不含敏感值；合法 participant 專用 RPC 可讀；撤銷後新讀取拒絕。
5. Slack G2-9：專用測試帳號完成「連結 → 已連結 → 解除」；callback state 僅消耗一次，meta 失敗不得誤報成功或刪除既有 credentials。
6. Bridge：同步 `fee.get`／`invoice.get`／`clientInvoice.get` 與 `await *.getFresh()` 均相容。
7. Realtime／背景分頁：無 auth loading 循環、無大量重載。
8. Logs：Vercel／Supabase Auth／Edge 無新 P0 級錯誤；不得紀錄 token、完整 session 或 credential value。
9. Advisors：記錄結果；允許既有 2 件受控 definer ERROR，其他新 ERROR 阻擋開站。

### Phase 5 — 恢復服務

只有 Phase 4 全部通過才：

1. 解除維護頁並公告服務恢復。
2. 監看至少 30 分鐘：Auth、Cases、CAT、Slack、Bridge、Vercel error 與 Supabase logs。
3. 30 分鐘無 P0 異常後，才可將 Draft PR 轉正式／依 repo 流程完成 main 對齊；實際順序由執行時避免 main auto-deploy 重複發布。

---

## 6. 成功標準

本次 P0 只有在下列全部成立後才算正式完成：

- 正式 history 精確加入 15 支候選 migration；
- 正式前端與 Edge Functions 均對應固定候選 commit；
- 維護中冒煙全綠；
- 30 分鐘監看無 P0 異常；
- 舊一般寫入面確實關閉，合法 RPC 正常；
- 2 件 definer Advisor ERROR 如實保留為受控例外；
- PR／main／production commit 可追溯且沒有混入其他 worktree。

---

## 7. 失敗與回復策略

### 7.1 在 DB push 前失敗

- 不變更正式資料庫；恢復原 production deployment／移除維護頁即可。

### 7.2 DB push 部分或全部完成後失敗

- **保持維護頁，不單獨 Instant Rollback 到舊 frontend。**
- 先判斷能否在固定候選上小幅向前修復；只有具體 P0 問題可改候選。
- 若無法在維護窗口內安全向前修復：依窗口前備份還原正式 DB，確認 history／資料，再將 Vercel 回復到已知良好 deployment。
- 如採臨時 re-grant／補償 migration 恢復舊版相容，等同暫時重新開放已知漏洞，必須由使用者明確核准並記錄事故；不得當成一般一鍵回滾。
- Supabase restore 期間專案不可用；備份不包含 Storage 物件本體，故本次不得對 Storage 物件做破壞性操作。

### 7.3 回復後

- 重跑 Auth／Cases／CAT 基本冒煙；公告延長維護或回復舊版。
- 不修改已套用 migration；後續修正使用新的 forward／compensation migration。

---

## 8. GitHub／Vercel 操作規則

- `main` 目前會觸發 Vercel production；Draft PR 在正式窗口前**不可 merge**。
- Preview deployment 只作候選 build 證據，不因 Preview URL 存在而視為已部署。
- 正式窗口要避免「merge main 自動上線」和手動 promotion 重複發版；採單一指定操作者、單一固定 commit。
- Vercel Instant Rollback 只改路由／前端部署，不會回復 Supabase schema、grants、RLS 或資料，因此不得脫離 §7 單獨使用。
- production deployment 與備份在驗收結束前不得刪除。

---

## 9. 第五次 Micro 最終證據（封頂）

| 項目 | 結果 |
|---|---|
| ref `enexnghinsnyzmezxphk` | 164/164 migration 從零重放成功 |
| SQL | 10/10 通過 |
| 競態 | `dual-client-collab-race.mjs` PASS |
| Data API definer | `micro3-definer-view-api-check.mjs` PASS |
| Advisors | 2 件 ERROR（`cases_visible`／`fees_visible`）— 受控例外 |
| types | 已重生並通過 typecheck |
| 處置 | 已刪除；**不得建第六次 Micro** |

---

## 10. 下一個明確停止點

先完成 Gate 2A：push 功能分支、建立 Draft PR、等 CI／Preview build。完成後回報：

- PR 與固定 commit；
- checks／Preview 結果；
- 正式 dry-run 預期 15 支清單（尚未執行正式 push）；
- 維護窗口需要使用者提供／確認的時間、Slack 測試 App 與備份安排。

到此必須停止，等待使用者另行核准正式維護窗口。
**現況：Gate 1 通過；production 尚未變更。**
