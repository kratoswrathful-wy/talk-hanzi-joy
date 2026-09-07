狀態：Gate 2B 審核完成；等候 Codex／使用者維護窗口與正式操作授權

# Gate 2B — 正式發布前審核報告（2026-09-04）

審核者：AI 代理（唯讀）  
候選：`28f80509`（驗收）／PR HEAD `724d691c`  
基準 `main`：`724eb886`  
正式專案：`wshsmerltcakffllgyul`  
**未** merge、**未**部署、**未**套用 migration、**未** push 本輪文件（本機 commit only）。

---

## A. 凍結與 main

| 檢查 | 結果 |
|---|---|
| worktree 審核前乾淨 | 是（文件寫入前） |
| PR #81 HEAD | `724d691c`＝Gate1 文件 commit；父級含 `28f80509` |
| `origin/main` | 仍為 `724eb886` — **未改變**；無需列出新增 commits；**未** rebase／merge |
| Gate1 有效性 | **仍有效**（workflow `33848719517`） |

---

## B. dry-run

| 項目 | 結果 |
|---|---|
| ref | `wshsmerltcakffllgyul` |
| remote history | **149**；max `20260825120952` |
| dry-run | **恰好 17 支**；順序正確；不多不少 |
| 輸出 | `scripts/.cache/prod-db-push-dry-run-20260904.txt`（gitignore） |
| SHA-256 | `2C3D421AEB67CF4206E6E1D65D173D74915CE7A6519B395CBC31FCB1948F88AD` |

17 支清單見 [`ISOLATION_GATE2_PLAN_2026-09.md`](./ISOLATION_GATE2_PLAN_2026-09.md) §1.1。

---

## C. PR #81 範圍分類（相對 `origin/main`，約 117 檔）

| 類別 | 約略檔數 | 說明 |
|---|---:|---|
| production 待套用 migration | 17 | dry-run 集合 |
| baseline 歷史修補（已在 remote history） | 5 | 對齊 statements／乾淨重放；**不會**被 `db push` 當新版套用：`20260429234626_*`（含 placeholder）、`20260630130000`、`20260704010000`、`20260704020000` |
| 前端安全切換 | ~32 | 案件 RPC、指派 UUID、憑證、iframe guard、Slack meta 客戶端等 |
| Edge Functions | 2 | Slack 相關 hardening／revoke 路徑 |
| SQL／Playwright／單元測試 | ~30 | P0 契約與冒煙 |
| CI 工具 | ~17 | 隔離 workflow、types 契約、provision 腳本等 |
| 文件 | ~11 | Gate1／Gate2／DEVLOG |
| 其他 | 3 | `.gitignore`、`package.json`、`supabase/config.toml` |

### C.1 審核結論（只回報，本階段不修碼）

1. **無關功能**：未見另開之 CAT 大檔／Excel／虛擬捲動等未核准產品功能混入；CAT 變更限於指派／RPC／iframe 訊息來源守衛等安全收斂。
2. **Secrets**：diff 路徑無 `.env`／token／正式密碼；測試帳密不在 PR。
3. **Debug bypass**：未發現 service_role 前端暴露或權限放寬 bypass；方向為 REVOKE／RPC 收緊。
4. **歷史 migration 修改**：5 支已套用版號之檔案修改屬 baseline 對齊；dry-run **未**列出它們。
5. **正式會執行的集合**：僅上述 **17** 支。

**未發現必須阻擋上線的混入問題。**（若 Codex 另有檔案級異議，再停。）

---

## D. Participant 影響（唯讀）

詳見 gitignore：`scripts/.cache/participant-impact-gate2b-summary-20260904.md`。

| 項目 | 值 |
|---|---|
| 先前 28 筆？ | **否，現為 34** |
| delivered | 959（先前 894；不自動授權） |
| `case_participants` 已存在？ | **否** — 套用後才建立；safe backfill **不**自動建權限列 |
| 部署後立即失權？ | **是（預期）** — 34 筆進行中有指派案件，在 PM 以可信 UUID 重存前 |
| 較快可重存（JSON 有 UserId 訊號） | ~18 |
| 必須人工選人（姓名-only） | ~16 |
| 預估 PM 工時 | **約 2.5–3.5 小時** |
| 禁止 | 依姓名猜 UUID；自動建 participant；把標題／姓名／UUID 進 Git |

894／959 delivered：日後需要時由 PM 對單案重新指派即可。

---

## E. 維護頁（只調查／規劃，未實作）

| 問題 | 結論 |
|---|---|
| repo／Vercel 是否已有 maintenance mode？ | **無**（程式無維護旗標；無既有維護頁路由） |
| 能否擋新使用者？ | 需新增機制後才行（見下） |
| 能否擋已開啟舊分頁直寫 Supabase？ | **純前端維護頁不能**。舊 SPA 仍持有 anon key／session，可直打 API，除非另採 DB 維護鎖、暫時關 Data API、或撤銷 session（皆高風險／需另核准） |
| 文件必須標示 | 維護頁＝阻止**新進站與新分頁工作**＋公告要求舊分頁停止；**不是**硬封鎖所有 API 寫入 |

### 建議最小維護方式（待核准後才做）

1. **顯示**：Vercel Production 環境變數（例如 `VITE_MAINTENANCE_MODE=1`）＋應用啟動時全頁公告；或臨時 `public/maintenance.html`＋Edge Middleware／rewrite（實作屬下一授權）。
2. **管理者入口**：密鑰 query（僅告知執行者）或暫時允許特定 email 白名單；驗收完成後關閉。
3. **避免 merge 提前部署**：窗口前 PR 保持 Draft；**不要**在 DB 完成前 merge `main`；前端以「指定 commit 手動 promote／指定 deployment」與 DB 同窗切換。
4. **恢復**：關閉維護旗標／拿掉 rewrite，公告恢復。

**本階段未改 Vercel 設定、未建 maintenance deployment。**

---

## F. Slack G2-9

恢復服務前仍須完成：`連結 Slack → 顯示已連結 → 解除連結`。

| 項目 | 現況 |
|---|---|
| 專用 Slack 測試 App | **文件未證實已存在** — 需使用者確認是否已另建測試 App（勿用真實客戶工作區正式 App 做破壞性測試） |
| Callback URL（名稱／型式） | `https://<project-ref>.supabase.co/functions/v1/slack-oauth-callback`；正式 ref＝`wshsmerltcakffllgyul` |
| 環境變數**名稱**（禁止寫值） | Edge：`SLACK_CLIENT_ID`、`SLACK_CLIENT_SECRET`、`SLACK_REDIRECT_URI`、`SITE_URL`；前端僅公開站台 URL 類 |
| 測試帳號條件 | 可登入 TMS 的測試使用者；Slack 工作區有對應 email；**非**真實譯者生產帳號 |
| Preview 能否完成？ | **通常不能作為正式 G2-9 證據**：Preview 若仍連正式 Supabase 但 **尚未**部署本 PR 的 Edge／migration，行為與正式窗口後不同；若 Preview 誤連測試後端亦非 production 證據 |
| 安排 | **放在維護窗口內、DB＋Edge 更新後、重新開站前** |

不得把 secret 寫入 Git／文件／PR／shell 紀錄。

---

## G. 備份與回復（只準備步驟，**未**執行 dump）

### G.1 平台備份確認
1. Supabase Dashboard → Project Settings → Database → Backups：記錄最新自動備份時間與 PITR／日備狀態。
2. 確認專案 `ACTIVE_HEALTHY`、ref `wshsmerltcakffllgyul`。

### G.2 Logical dump 順序（窗口前另核准）
1. 自 Dashboard 取得 DB 密碼（不進 Git）。
2. `pg_dump`（roles）→ schema → data（或官方建議之完整 logical）；分檔保存。
3. 計算各檔 SHA-256，寫入**庫外**執行紀錄（時間、操作者、hash）。
4. **保存位置**：不得放 repo、`.env`、可推送目錄；使用加密磁碟／受限雲端。

### G.3 已知良好前端
- commit：`724eb886`
- GitHub Production deployment id：`6155219915`
- Vercel deployment URL 前綴：`talk-hanzi-79kofihv5-1-up-localization-studio.vercel.app`
- 窗口當日再核對是否仍為現行 production。

### G.4 DB 成功但新前端失敗
1. **保持維護頁**。
2. **不可**只切回不相容舊前端。
3. **優先**在固定候選上向前修復（僅具體 P0）。
4. 無法安全修復 → **DB restore（窗口前 dump／平台備份）＋ Vercel rollback** 至 `724eb886` 對應 deployment（另核准）。
5. Restore 期間專案可能長時間不可用；備份通常**不含** Storage 物件本體；回復點＝dump／備份時間，其後寫入可能遺失。

**Gate 2B 未建立或下載正式 dump。**

---

## H. 預估停機

| 區段 | 粗估 |
|---|---|
| 公告＋排空＋備份確認 | 20–40 分 |
| dry-run 複核＋`db push` 17 支 | 15–40 分 |
| Edge＋前端切換 | 15–30 分 |
| 冒煙（含 G2-9） | 30–60 分 |
| PM 指派重建（可與冒煙部分重疊） | 2.5–3.5 小時（關鍵路徑） |
| 監看 | 30 分 |

**建議對外公告維護窗：約 4–5 小時**（含緩衝）；若 PM 指派可於開站後對非急件續做，可縮短對外「全站不可用」至約 **2–3 小時**，但須接受開站後部分譯者仍暫不可編輯直至 PM 重存。

---

## I. 需要使用者決定的事項（僅此）

1. **維護窗口日時**與對外公告文案。
2. 是否核准下一階段**實作／設定最小維護頁**（本階段未做）。
3. 是否已備妥**專用 Slack 測試 App**與 callback／secrets（僅名稱層級配置）。
4. 是否核准窗口前 **logical dump**（仍非 `db push`）。
5. 開站策略：等 34 案指派全數重建再開站，或先開站允許急件優先重存。
6. 正式 **`db push`（非 dry-run）**與 **production 部署**的明確授權（另指令；本報告不構成授權）。
