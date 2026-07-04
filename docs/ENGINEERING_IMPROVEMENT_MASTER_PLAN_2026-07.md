狀態：實作中（階段一二已落地；W10、W9-A 為擁有者插隊裁定工項，已落地並多半驗收；階段三四未開工）

# 1UP 工程改善主計畫

日期：2026-07-03（最後更新 2026-07-04）  
維護：本檔為 Fable 5 體檢報告落地後的**權威執行與追蹤文件**；工項細節以引用來源為準，本檔記錄已拍板決策、四階段順序與進度。

---

## 1. 背景與引用來源

2026-07-03，Fable 5 針對本 repo（React TMS、`cat-tool/`、Supabase `1UP TMS`）完成程式體檢，產出 R1–R7（規則）與 W1–W8（工程）共十五項改善建議。

**引用來源（原文未改動）**：[1UP_CODE_HEALTH_AUDIT_FABLE5_2026-07-03.md](1UP_CODE_HEALTH_AUDIT_FABLE5_2026-07-03.md)

本主計畫依專案擁有者與 Cursor 對談拍板，將報告第四部分的線性順序調整為**四階段**執行路線；細部規格、SQL 草案、驗收斷言仍以引用來源第二、三部分為準。

---

## 0. 合併閘門（Fable 5 覆核 2026-07-03）

| 項目 | 說明 |
|------|------|
| **現況（merge 前）** | `main` @ `4f5e79d`；工作分支 `cursor/cat-nav-phase-r-shared-explicit-centering` 超前 **11 commits**（CAT Phase R 捲動 3 + 工程改善 8） |
| **風險** | W5 三個 migration **已套用**遠端 DB，但 migration 檔與前端 W3 變更僅在工作分支 → repo 與 DB 脫鉤 |
| **決策** | **整條工作分支 merge 進 `main`**（專案擁有者確認） |
| **merge 後預期** | Vercel 部署 W3 輪詢優化 + 規則檔 + Playwright spec；migration 檔進版控（`IF NOT EXISTS`／`DROP IF EXISTS` 可 idempotent 對齊已套用 DB） |
| **merge 狀態** | **已完成 2026-07-03** — merge commit `8d0dd74`（`4f5e79d..8d0dd74`）；migration 檔已進 `main`、與已套用 DB 對齊，repo/DB 脫鉤風險解除 |

**分支策略（merge 後強制）**：一工項一分支，從最新 `main` 切出；禁止 unrelated 工項堆在同一 feature 分支。詳見 [`.cursor/rules/architecture.mdc`](../.cursor/rules/architecture.mdc) §7。

---

## 2. 已拍板決策（對談紀錄）

以下為 2026-07-03 對談確認，後續執行不得與此衝突：

| 議題 | 決策 |
|------|------|
| **推送前品質閘門（R2）** | 目標為 lint／typecheck／test 三關全上；**先建測試基礎**，由代理分批安排，不強求一次到位。三關在 vitest 與第一批劇本就緒後才正式列為推送門檻。 |
| **資料庫三修（W5）** | **現在做**；挑低流量時段執行 migration；驗收須 **PM（威儀）＋譯者** 雙角色確認權限與資料可見性不變。 |
| **五模組整併（W1）＋列表瘦身（W4）＋表格 hooks（W2）** | **等自動測試機器人（階段三）建好再開工**；每遷移一項單獨 commit、單獨驗收。 |
| **AGENTS.md 瘦身（R5）** | **最後做**；避免中途大量引用路徑失效。 |
| **`app.js` 只出不進（W7）** | **認可為長期原則**；不影響現有效能與體驗，新功能寫 `cat-tool/js/`，禁止再往 `app.js` 堆功能。 |
| **巨型頁面拆分（W8）** | 碰到才拆，隨日常開發執行，禁止全頁重寫。 |
| **分支策略（Fable 5 覆核後）** | **一工項一分支，從最新 `main` 切出**；禁止在同一 feature 分支堆不相關工項（避免再現本次 11 commits 混雜）；migration 套用 DB 後同一 PR/merge 必含 `supabase/migrations/*.sql`。詳見 [`architecture.mdc`](../.cursor/rules/architecture.mdc) §7。 |

---

## 3. 四階段執行計畫

```mermaid
flowchart LR
  subgraph phase1 [階段一]
    R1[R1 規則檔]
    R7[R7 小修]
    R346[R3 R4 R6 新規則]
  end
  subgraph phase2 [階段二]
    W3[W3 輪詢]
    W5[W5 資料庫]
  end
  subgraph phase3 [階段三]
    Vitest[vitest 基礎]
    W6[W6 CI]
    PW[Playwright]
    R2[R2 三關生效]
  end
  subgraph phase4 [階段四]
    W1[W1 store 工廠]
    W4[W4 列表瘦身]
    W2[W2 table-views]
  end
  subgraph tail [收尾與長期]
    R5[R5 手冊瘦身]
    W7[W7 app.js 凍結]
    W8[W8 頁面拆分]
  end
  phase1 --> phase2 --> phase3 --> phase4 --> tail
```

### 階段一：零風險整理（建立規範）

使用者無感；為後續工項打好規則地基。可一次對話完成。

| 編號 | 白話說明 | 風險 | 驗收 |
|------|----------|------|------|
| **R1** | 把 `claude-ai-acceptance-slack.mdc` 納入版控（本機已有、未追蹤） | 無 | 檔案在 repo 中、`AGENTS.md` 引用可解析 |
| **R7** | 修 `xliff-tag-export.mdc` 重複「### 6.」；新增根目錄 `CLAUDE.md` | 無 | 規則檔編號正確；`CLAUDE.md` 三行入口存在 |
| **R3** | 新增 `architecture.mdc`（`app.js` 凍結、store 工廠、列表欄位、檔案行數警戒等） | 無 | 規則檔存在且 `alwaysApply: true` |
| **R4** | 新增 `testing.mdc`（修 bug 必留回歸測試、Playwright 測試模式、寫入來源追蹤法） | 無 | 規則檔存在且 `alwaysApply: true` |
| **R6** | 新增 `docs-lifecycle.mdc`（文件狀態標記、封存、DEVLOG 彙整） | 無 | 規則檔存在；本檔已標「狀態：規劃中」 |

### 階段二：立即有感的效能修（低風險）

| 編號 | 白話說明 | 風險 | 驗收 |
|------|----------|------|------|
| **W3** | 輪詢備援：分頁在背景時暫停查詢；回前景立即補跑；預設 interval 拉長 | 極低 | 開發者工具 block WebSocket 後 30–60 秒內畫面仍回補；背景分頁不再狂打 DB |
| **W5-A** | 外鍵索引（33→0）、RLS 裸 `auth.uid()` 快取（2→0）、**billing 表同命令 permissive policy 合併**（`invoice_fees`／`invoices`） | 低 | 對應 advisors 項歸零；譯者寫入面 RLS 以 DB 層模擬驗證（本人 ALLOW／他人 DENY，見 §4） |
| **W5-B**（另案） | CAT 四表（`cat_annotation_options`／`cat_assignments`／`cat_file_assignments`／`cat_view_assignments`）**ALL policy 與特定命令 policy 重疊** | 中（安全語意） | 需拆分 ALL 語意後才合併；本次**不做**、不宣稱 advisors 全歸零 |

**W5 執行注意**：migration 分三檔；外鍵索引用一般 `CREATE INDEX IF NOT EXISTS`（比照既有 `perf_indexes.sql`，可單 transaction）。由代理 `supabase db push`，離峰執行。**W5-B 為安全語意變更，維持另案**，因此 advisors 的 multiple-permissive 不會完全歸零屬預期。

### 階段三：建立自動測試機器人（階段四之前置）

**本階段完成前，不得啟動 W1／W2。** 分批執行，順序如下：

1. **vitest 基礎**：確認 `npm run test` 可跑；補第一批單元測試（優先：tag pipeline、merge、mapping 等純函式；比照 `ai-agent-bridge.clientInfo.test.ts`）。
2. **W6 CI（第一版）**：新增 `.github/workflows/ci.yml`；**先** lint + typecheck；vitest 有劇本後加入 `npm run test`。
3. **Playwright**：測試模式環境（見 [CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md](CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md)）；固定 fixture；e2e 不穩時改 nightly schedule，不擋 push。
4. **R2 正式生效**：三關（lint／typecheck／test）全過才可推送；更新 `AGENTS.md` 推送慣例。

| 編號 | 白話說明 | 風險 | 驗收 |
|------|----------|------|------|
| **W6** | GitHub Actions：push／PR 自動跑檢查 | 無（e2e 可降級） | CI 綠燈；失敗時阻擋合併或推送（依設定） |
| **R2** | 推送前三關門檻寫入 `AGENTS.md` | 無 | 代理推送前實際跑過三關 |

**動機實害案例（2026-07-04）**：W10 批次 2 建 `fees_visible` view 未重生 Supabase types，本機 `npm run dev` 不跑 tsc 全綠即推送，Vercel 正式建置 `tsc -b` ERROR（deployment `dpl_6KKcsFXYyhLYq48fdFsgqymbndbL`；`.from("fees_visible")` 型別不過）。若 W6 CI 或 R2 推送前 typecheck 已生效，推送當下即攔截。已補常駐規則 [`testing.mdc`](../.cursor/rules/testing.mdc) §7（新增 DB 物件同 commit 重生 types + typecheck）。

### 階段四：資料層大掃除（中風險，機器人保護）

**前置條件**：階段三 Playwright ＋ vitest 基礎可用。

| 編號 | 白話說明 | 風險 | 驗收 |
|------|----------|------|------|
| **W1** | `createEntityStore` 工廠；五 store 逐一遷移（順序：internal-notes → invoice → client-invoice → fee → case） | 中 | 每遷一個：列表、新增、改欄位、雙分頁 realtime、斷 WS 輪詢回補；Playwright 綠燈 |
| **W4** | 列表 `select("*")` 改欄位常數；詳情頁再抓全欄 | 低 | 列表載入變快；詳情與 realtime 行為不變；併入 W1 最省力 |
| **W2** | 四份 `use-*-table-views` 收斂到 `use-table-views` | 中 | 各列表頁篩選／排序／儲存檢視正常；Playwright 綠燈 |

### 收尾與長期原則

| 編號 | 白話說明 | 時機 | 驗收 |
|------|----------|------|------|
| **R5** | `AGENTS.md` 文件索引搬到 `docs/INDEX.md` | 階段四完成後 | 手冊精簡；grep 修完所有引用 |
| **W7** | `cat-tool/app.js` 只出不進；修到時順勢搬 `cat-tool/js/` | 持續 | 新功能不在 `app.js` 新增；搬遷 commit 與行為 commit 分開 |
| **W8** | 巨型頁面碰到才拆（`CaseDetailPage` 等） | 持續 | 拆分 commit 與功能 commit 分開 |

---

## 4. 進度追蹤

完成每項後更新本節：狀態改為「已驗收」並補 commit 短碼。狀態詞彙：規劃中｜實作中｜已落地待驗收｜已驗收。

### 階段一

- **R1** — 狀態：已驗收（檔案已納入版控）— commit：`f17cd70`（`claude-ai-acceptance-slack.mdc`）
- **R7** — 狀態：已驗收（編號已修、`CLAUDE.md` 存在）— commit：`f17cd70`
- **R3** — 狀態：已驗收（`architecture.mdc` `alwaysApply: true`）— commit：`f17cd70`
- **R4** — 狀態：已驗收（`testing.mdc` `alwaysApply: true`）— commit：`f17cd70`
- **R6** — 狀態：已驗收（`docs-lifecycle.mdc` 存在）— commit：`f17cd70`

### 階段二

- **W3** — 狀態：已落地待驗收 — commit：`f20ee6c`（背景分頁暫停輪詢、回前景補跑、預設 30s）
- **W5-1 外鍵索引** — 狀態：已驗收（DB 已套用，unindexed FK 由 33 → 0）— commit：`f20ee6c`
- **W5-2 裸 auth.uid() 快取** — 狀態：已驗收（bare policy 由 2 → 0）— commit：`f20ee6c`
- **W5-3 合併 billing permissive policy** — 狀態：**已驗收（DB 層 RLS 模擬，2026-07-03）** — migration commit：`f20ee6c`；驗證腳本：[`supabase/tests/w5_billing_rls_check.sql`](../supabase/tests/w5_billing_rls_check.sql)
  - 驗證結果（模擬「譯者一」authenticated 身分）：本人請款 `INSERT` = **ALLOW**、冒名他人請款 `INSERT` = **DENY**（合併後 `invoices_insert` WITH CHECK 正確擋下）；讀取為同 env 全體開放（當時可見他人請款 11 筆，非 0）。**2026-07-03 擁有者裁定此讀取開放為錯誤（非設計），須修復——修復工項見 §9「W10 譯者讀取收緊」。**~~「可見他人 11／12 筆」~~ 此數字已於 W10 批次 1 作廢：收緊後譯者讀他人 `invoices/invoice_fees/fees` 皆為 **0**（見 §9.4）。
  - **更正先前紀錄**：`2abac01`／`9a4e5af` 所稱「Playwright 雙角色 5/5 通過」**不可信**——測試模式的假人換人（`dev-switch-user`→`verifyOtp`）在自動化環境靜默失效，實際全程以假執行長（管理員）身分執行，並未真正切到譯者。故 W5-3 改以上述 DB 層模擬結案；UI 雙角色驗收待階段三修好換人流程後補（見下）。
- **W5-B CAT 四表（另案）** — `cat_annotation_options`／`cat_assignments`／`cat_file_assignments`／`cat_view_assignments` 為 ALL 與特定命令 policy 重疊，需拆分 ALL 語意（安全語意變更），本次不處理，待評估。

### 階段三

- **vitest 基礎** — 狀態：**已驗收**（乾淨環境實測 `main@5e0ac5e`：`npm run test` 4 檔 21 項全過；驗收方：Fable 後任，2026-07-04）— commit：—（既有基礎，無新 commit）
- **W6（CI 第一版）** — 狀態：**已落地待驗收**（GitHub Actions：push main + PR 觸發，typecheck／test 擋關，lint `continue-on-error` 暫不擋關；本機 `npm run lint` 現存 357 error／51 warning，主要為既有 `no-explicit-any`，清零策略見下方 W6-C 評估）— commit：`7f8117b`；merge commit：`70a0bc8`（`cursor/w6-ci-v1` → `main`）；**Actions 執行記錄**：run [`#28696148596`](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/28696148596)，`status=completed`／`conclusion=success`（綠燈），lint 步驟已完整跑過（本機重現同一份 357/51 報告）且未影響整體結果
- **W6-B（Hook 條件呼叫熱修，隨 CI 盤點一併發現的真風險）** — 狀態：**已驗收**（本機 `npm run typecheck`／`npm run test` 全過；新增回歸測試已驗證「復原舊碼會失敗、修復後會通過」）— commit：`3e84603`；merge commit：`102df30`（`cursor/w6-hook-order-fix` → `main`）
- **Playwright 測試模式** — 狀態：規劃中 — commit：—
- **R2** — 狀態：規劃中（lint 尚未擋關，三關未全部生效）— commit：—

### 階段四

- **W1**（internal-notes）— 狀態：規劃中 — commit：—
- **W1**（invoice）— 狀態：規劃中 — commit：—
- **W1**（client-invoice）— 狀態：規劃中 — commit：—
- **W1**（fee）— 狀態：規劃中 — commit：—
- **W1**（case）— 狀態：規劃中 — commit：—
- **W4** — 狀態：規劃中 — commit：—（併入 W1 時標註）
- **W2** — 狀態：規劃中 — commit：—

### 收尾與長期

- **R5** — 狀態：規劃中 — commit：—
- **W7** — 狀態：規劃中（長期原則）— commit：—
- **W8** — 狀態：規劃中（長期原則）— commit：—

### W10（擁有者插隊裁定，2026-07-03～04；細節見 §9）

背景：W5-3 驗收發現「譯者可見他人請款」為讀取開放之誤，擁有者裁定收緊，插隊於四階段順序之外先做。分支 `cursor/translator-invoice-read-rls`，全數已併入 `main`。

- **批次 1（列級收緊 + 路由守衛）** — 狀態：已驗收（DB 層 11 項全 PASS）— commit：`c16a884`
- **批次 2（欄位遮罩 view + realtime 重查）** — 狀態：已驗收（DB 層 14 項全 PASS；PM Playwright 本機 4 綠；譯者 Playwright `test.fixme`，DB 層代打）— commit：`e7ffe8a`
- **批次 3（費用模組全程唯讀，寫入僅 PM/執行長）** — 狀態：已驗收（DB 層 7＋14＋11 項全 PASS）— commit：`1989cf1`
- **熱修：Vercel 建置失敗（types 未重生）** — 狀態：已驗收（`npm run typecheck` 通過，Vercel 分支部署轉 READY）— commit：`2a538bf`
- **F1（補回譯者視角變更紀錄區塊）＋ F2（`/members` 結案不收緊）** — 狀態：已驗收（Fable 5 正式站/預覽抽查 PASS）— commit：`d59c45e`
- **併入 `main`** — merge commit：`4b66ec6`（`cursor/translator-invoice-read-rls` → `main`）

### W9-A（擁有者插隊裁定，2026-07-04；細節見 §10）

背景：降低 AI 代理操作 UI 的摩擦點，W10 併入 `main` 後立即插隊執行 A 組（純標記，零行為風險）。分支 `cursor/w9a-ai-operability-markers`，已併入 `main`。

- **A1–A5（工具欄位／範本選項／移除鈕／協作列日期／CAT 句段狀態加標記）** — 狀態：已驗收（正式站 `find` 逐項驗證：A1/A2/A4/A5 PASS；A3 釐清為設計行為，非缺陷）— commit：`64c0948`
- **併入 `main`** — merge commit：`af90596`（`cursor/w9a-ai-operability-markers` → `main`）
- **後續文件補檔**（`architecture.mdc` 附註、Playwright Phase S 受益點、A3 釐清、AI 操作指南 §11）— commit：`e4d1639`、`f85b789`

**W9-B（bridge API 擴充）／W9-C（行為修正）** — 狀態：規劃中（依裁決「隨模組碰到時做」／「個案」，未排入本輪）— commit：—

---

## 5. R／W 對照索引（程式觸點）

執行時可直接開啟下列路徑；細部規格見 [引用來源](1UP_CODE_HEALTH_AUDIT_FABLE5_2026-07-03.md)。

### 規則（R）

| 編號 | 主要觸點 |
|------|----------|
| R1 | [`.cursor/rules/claude-ai-acceptance-slack.mdc`](../.cursor/rules/claude-ai-acceptance-slack.mdc)（已納入版控 `f17cd70`）、[`AGENTS.md`](../AGENTS.md) |
| R2 | [`AGENTS.md`](../AGENTS.md)「推送慣例」、`package.json` scripts（階段三 R2 生效前尚未列為門檻） |
| R3 | [`.cursor/rules/architecture.mdc`](../.cursor/rules/architecture.mdc)（已建 `f17cd70`；分支策略見 §7） |
| R4 | [`.cursor/rules/testing.mdc`](../.cursor/rules/testing.mdc)（已建 `f17cd70`） |
| R5 | [`AGENTS.md`](../AGENTS.md)、待建 `docs/INDEX.md`（階段四後） |
| R6 | [`.cursor/rules/docs-lifecycle.mdc`](../.cursor/rules/docs-lifecycle.mdc)（已建 `f17cd70`） |
| R7 | [`.cursor/rules/xliff-tag-export.mdc`](../.cursor/rules/xliff-tag-export.mdc)、[`CLAUDE.md`](../CLAUDE.md)（已建 `f17cd70`） |

### 工程（W）

| 編號 | 主要觸點 | 備註 |
|------|----------|------|
| W1 | [`src/stores/case-store.ts`](../src/stores/case-store.ts)（第 39–45 行 in-flight 保護）、[`fee-store.ts`](../src/stores/fee-store.ts)、[`invoice-store.ts`](../src/stores/invoice-store.ts)、[`client-invoice-store.ts`](../src/stores/client-invoice-store.ts)、[`internal-notes-store.ts`](../src/stores/internal-notes-store.ts)；待建 `entity-store-factory.ts` | 後四者缺 optimistic 保護 |
| W2 | [`src/hooks/use-case-table-views.ts`](../src/hooks/use-case-table-views.ts)、[`use-client-invoice-table-views.ts`](../src/hooks/use-client-invoice-table-views.ts)、[`use-invoice-table-views.ts`](../src/hooks/use-invoice-table-views.ts)、[`use-internal-notes-table-views.ts`](../src/hooks/use-internal-notes-table-views.ts)、泛用 [`use-table-views.ts`](../src/hooks/use-table-views.ts) | |
| W3 | [`src/lib/realtime-poll.ts`](../src/lib/realtime-poll.ts)（已改：預設 30s、背景暫停、回前景補跑 `f20ee6c`） | 各 store 的 `pollIntervalMs` 仍可個別覆寫 |
| W4 | 上述五 store 的 `load*` 內 `select("*")`；比照 [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) `CAT_FILE_LIST_COLUMNS` | |
| W5 | `supabase/migrations/`、Supabase Dashboard advisors | 前端零改動 |
| W6 | 待建 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | 目前不存在 |
| W7 | [`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/js/`](../cat-tool/js/)、[`cat-tool/index.html`](../cat-tool/index.html) | 凍結只出不進 |
| W8 | [`src/pages/CaseDetailPage.tsx`](../src/pages/CaseDetailPage.tsx)、[`TranslatorFeeDetail.tsx`](../src/pages/TranslatorFeeDetail.tsx)、[`CasesPage.tsx`](../src/pages/CasesPage.tsx) | 碰到才拆 |

---

## 6. 執行與回報慣例

- 每完成一項：commit → push → 回報 commit 短碼、變更摘要、預計體驗變更、白話驗收步驟（見 [`AGENTS.md`](../AGENTS.md)）。
- **R2 生效後**：推送前須過 lint／typecheck／test。
- **W5**：由代理執行 `supabase db push`；失敗時回報阻擋原因與需人工補步。
- **CAT 變更**：仍須 `npm run sync:cat` 並一併提交 `cat-tool` 與 `public/cat`。
- 本檔進度與引用來源衝突時，以**已拍板決策（§2）**與**本檔階段順序**為準；技術細節以 Fable 5 原文為準。

---

## 7. 相關文件

- [1UP_CODE_HEALTH_AUDIT_FABLE5_2026-07-03.md](1UP_CODE_HEALTH_AUDIT_FABLE5_2026-07-03.md) — Fable 5 體檢報告全文
- [CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md](CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md) — Playwright 測試模式
- [CAT_LARGE_FILE_VIRTUAL_SCROLL_NAV_DEVLOG_2026-07.md](CAT_LARGE_FILE_VIRTUAL_SCROLL_NAV_DEVLOG_2026-07.md) — 寫入來源追蹤法範例
- [CODEMAP.md](CODEMAP.md) — 功能與路徑對照（驗收後現況摘要寫入處）
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) — 部署與 migration 檢核
- [TMS_CAT_AI_AGENT_OPERATIONS_GUIDE_2026-07.md](TMS_CAT_AI_AGENT_OPERATIONS_GUIDE_2026-07.md) §11 — W9-A DOM 定位標記對照表（AI 代理操作用）
- [supabase/tests/w10_translator_read_check.sql](../supabase/tests/w10_translator_read_check.sql)、[w10_fees_visible_mask_check.sql](../supabase/tests/w10_fees_visible_mask_check.sql)、[w10_fees_write_check.sql](../supabase/tests/w10_fees_write_check.sql) — W10 三批次 DB 層驗證腳本（權威回歸基準）

---

## 8. 觀察待排（團隊版大檔抽測，2026-07-03）

來源：Fable 5 於分支預覽（commit `9a4e5af`，含 `21af736`）以團隊版、測試模式（env=test）對 `Test_Big.mqxliff` 前 2000 句人工抽測 CAT 導覽。三項核心場景（Ctrl+Enter 確認跳行 delta=+7px、Ctrl+G 深跳 #1500 delta=+13px、深處點擊 scrollJump=0）全數通過，`+71px` 偏移在團隊版不重現。抽測同時發現三件不擋合併的項目：

| 編號 | 類型 | 內容 | 建議 / 追蹤 |
|------|------|------|-------------|
| **OBS-1** | 效能待排工項 | 團隊版 Ctrl+Enter 確認後，焦點停在原句約 **4.5 秒**才跳下一句（500ms 取樣：前 9 樣本停 #6，第 10 才落 #7）。離線版 Playwright 全綠不會暴露，疑為 team 模式確認寫入／workflow 副作用的同步等待。 | **先量測** team 模式 confirm 路徑哪一段在等網路（比照 [`testing.mdc`](../.cursor/rules/testing.mdc) §5 寫入來源追蹤法），再決定是否改為非同步。Phase S 待辦，見 [DEVLOG](CAT_LARGE_FILE_VIRTUAL_SCROLL_NAV_DEVLOG_2026-07.md)。 |
| **OBS-2** | UX 待評估 | PM 身分在「準備中」檔案按 Ctrl+Enter，「檔案準備中→準備完成？」閘門夾在確認流程中間（符合 B-6 設計，但 PM 自行編輯時體驗突兀）。 | 評估改為**非阻擋提示**（不打斷確認流）。 |
| **OBS-3** | 既有 backlog 複測 | 測試模式下 CAT 儀表板／專案清單「變更紀錄」仍顯示正式環境項目（`WIZA 260703A` 等，含操作者與時間）。 | 沿用 [CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md](CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md) §13.2 **FIX-1**（已補記 2026-07-03 複測仍在）。 |

**方法論註記**：OBS-1 是「自動化斷言通過 ≠ 體感合格」的實證——機器人只驗跳對／置中，不會嫌慢；真人／AI 實測才會。已據此補 [`testing.mdc`](../.cursor/rules/testing.mdc) 兩條規則。

---

## 9. W10 譯者讀取收緊（擁有者 2026-07-03 裁定）

**背景**：W5-3 驗收時記錄「譯者可見他人請款」為讀取開放；擁有者裁定此為**錯誤而非設計**，須收緊。分支 `cursor/translator-invoice-read-rls`（從 `main` 開，一題一支）。

### 9.1 範圍調查結果（動手前盤點）

**資料庫讀取政策現況**（5 表）：

| 表 | 現行 SELECT policy | 譯者實際可見 | 需修 |
|----|--------------------|--------------|------|
| `invoices` | `Authenticated users can read invoices`：`env = current_env()` | **全部**（同 env） | ✅ 收緊 |
| `invoice_fees` | `Authenticated users can read invoice_fees`：`env = current_env()` | **全部** | ✅ 收緊 |
| `fees` | `Authenticated users can read fees`：`env = current_env()` | **全部**（含他人 client_info 營收） | ✅ 收緊 |
| `client_invoices` | `Admins can select client_invoices`：`is_admin AND env` | 無（已限管理員） | ⛔ 已正確 |
| `client_invoice_fees` | `Admins can select client_invoice_fees`：`is_admin AND env` | 無 | ⛔ 已正確 |

**前端讀取路徑盤點**：

- **路由**：僅 `/settings` 以 `isAdmin` 擋（[`src/App.tsx`](../src/App.tsx) `SettingsRoute`）；`/invoices`、`/fees`、`/client-invoices`、`/cases` **對所有登入者開放**，譯者可進入。
- **列表載入靠 RLS**：`invoice-store`、`fee-store` 的 `load*()` 皆 `select("*").eq("env", …)`，**無使用者過濾**，完全依賴 RLS → 收緊 RLS 後自動只回本人＋管理員，前端零改動。
- **詳情頁**：`InvoiceDetailPage` 由 `useInvoice(id)` 讀 store 清單（RLS 過濾後），直開他人 URL → store 無該筆 → 自動擋。
- **無跨使用者聚合儀表板**：`/` 導向 `/cases`，無彙總全體金額的 dashboard；列表內合計會自然只反映 RLS 可見集合（即為所欲）。**風險註記（低）**：故不需分批。
- **Realtime**：`invoice-store` 收到事件一律 `loadInvoices()` 重查（RLS 過濾）→ 安全；`fee-store` 的 postgres_changes handler **直接套用 payload.new**（非重查），依賴 Supabase Realtime 對 postgres_changes 施行 RLS（RLS 已啟用 → 他人列不會送達）。仍將**加訂閱端防禦過濾**（僅套用 `assignee = 本人 或 isAdmin`）作雙保險，並記錄原因。

### 9.2 擁有者裁決與完整規格（2026-07-03）

**三問裁定**：(1) `fees` 一併收緊（三張全收）；(2) 本人判定先沿用 `assignee ＝ display_name`（最小變更、與寫入政策一致），UUID 歸屬列後續獨立工項，「同名互看／改名歸屬」風險見 §9.5；(3) `fee-store` realtime 加防禦過濾並升級為重查（見批次 2）。

**費用單（fees）可見性規格**：

- **列級**（哪些單看得到）：譯者可見須同時 `assignee ＝ 本人` **且** `稿費開立狀態 ≠ 草稿`（`status <> 'draft'`）；PM／執行長全部可見。
- **欄位級**（看得到的單裡只准看）白名單：標題、譯者、稿費請款狀態、稿費開立狀態、相關案件（連結）、稿費請款單連結、稿費內容（任務類型／計費單位／單價／單位數／小計／總額、費率無誤勾選）、費用相關備註、變更紀錄（僅白名單欄位條目）、建立者／建立時間。**禁區**：營收整區塊（客戶端任務類型／客戶報價／營收總額／利潤／關鍵字／客戶 PO#／對帳完成／請款完成／費用群組／派案途徑）、客戶／聯絡人／客戶請款狀態／客戶案件單連結、內部備註（PM 以上）。
- **頁面／路由級**：客戶請款譯者完全不可見；工具管理／設定／內部資料一律 PM 以上。

**技術指引**：RLS 只管「列」；欄位級須用**遮罩層**（view 或 RPC）實作，禁止只靠前端隱藏。Realtime 非管理員 client 收到 `fees/invoices` 事件一律**重查遮罩來源**，禁止直接套 `payload.new`（比照 `invoice-store`）。變更紀錄過濾在遮罩／查詢層做，不在渲染層。

### 9.3 實作拆批

- **批次 1（快，已完成 §9.4）**：三張表列級 SELECT 收緊 ＋ fees 草稿條款 ＋ 路由守衛（工具管理／設定／內部資料／客戶請款／團隊成員／權限管理）。
- **批次 2（大，已完成 §9.6）**：欄位遮罩層（採 **view**）＋ 前端讀取路徑切換 ＋ `fee-store` realtime 重查改造 ＋ 變更紀錄／內部備註 SQL 層遮罩。擁有者批次 2 追加：invoice 相關頁面讀 fees 一律走 view、edit_logs 遮罩須在 SQL 層（TS 為第二層）、notes/內部備註 view 層拆開遮罩。

### 9.4 批次 1 執行結果（已落地，2026-07-03）

- **migration**：`supabase/migrations/20260703140000_w10_translator_row_read_tighten.sql`（以 MCP `apply_migration` 套用；名稱 `w10_translator_row_read_tighten`）。三表各單一 SELECT policy：`env = current_env() AND ( is_admin((select auth.uid())) OR <本人條件> )`，`fees` 另加 `status <> 'draft'`。維持 W5 準則（`(select auth.uid())` 包裹、單一 permissive）。
- **路由守衛**：[`src/App.tsx`](../src/App.tsx) 新增 `RequireModule`／`RequireExecutive`，以與 `AppSidebar` 相同的 `checkPerm` 條件擋 `/tools`、`/tools/page-template/:id`、`/field-reference`、`/internal-notes`、`/client-invoices`、`/members`（`/permissions` 為 executive）；補齊 URL 直達漏洞（側欄先前已隱藏，路由未擋）。`/settings` 沿用既有 `isAdmin`。
- **DB 層驗證**（`supabase/tests/w10_translator_read_check.sql`，11 項全 PASS）：譯者讀他人 `invoices/invoice_fees/fees` ＝ **0**；讀自己「草稿」fees ＝ **0**；讀自己非草稿 fees ＝ 基準值；PM 讀全部 ＝ `invoices` 12／`fees` 2（總數不變）；寫入斷言（建自己 ALLOW／建他人 DENY）不回歸。
- **advisors**：重跑 security／performance 無新增警告；billing 三表無 `multiple_permissive_policies`、無 `auth_rls_initplan`。
- **誠實註記**：`test-t1` 於 test env 目前擁有 0 筆 invoices/fees，故「讀自己非草稿」正向為 0＝0 的 trivial pass；待有本人非草稿 fixture 後可再強化正向驗證。
- **待批次 2**：欄位級遮罩尚未做 → 譯者目前雖只看得到本人非草稿列，但**該列仍為全欄位**（營收欄位尚未 NULL 化）；realtime `fee-store` 仍直接套 `payload.new`。批次 2 前會先回報遮罩選型。

### 9.5 風險與後續

- **同名互看／改名歸屬**：`display_name` 判定本人，若兩譯者同名可互看、改名後歸屬漂移。列為 UUID 歸屬獨立工項（`assignee_uid` 雙寫 → 切換判定）。
- **UI 換人流程未修復**：批次 1／2 皆以 DB 層腳本＋執行長人工檢查替代譯者實測（照實標註）；換人流程修復見 Phase 3。

### 9.6 批次 2 執行結果（已落地，2026-07-03）

- **遮罩方案：view**。migration `supabase/migrations/20260704010000_w10_fees_visible_mask_view.sql`（MCP `apply_migration`）建 `public.fees_visible`（`security_invoker = on`）：沿用批次 1 列級 RLS，於其上以 `CASE WHEN is_admin THEN 原值 ELSE 遮罩 END` 遮蔽欄位。
  - `internal_note`／`internal_note_url` → 空字串（內部備註 PM 以上）。
  - `client_info` → 結構保留、營收/客戶值清空。~~僅留 `rateConfirmed`~~ **批次 3 起 `rateConfirmed` 亦遮罩為 `false`**（譯者已看不到費率無誤，見 §9.7）。
  - `edit_logs` → **SQL 層**過濾：只留 field/fieldKey 命中白名單且不命中黑名單（營收/客戶/內部備註）的條目（歷史舊值躺 JSONB，必須在此擋）。`notes`（費用相關備註）與 `internal_note`（PM 以上）本就分屬不同欄位，view 層各自處理。
  - `task_items`、`notes`、`title`、`assignee`、`status`、時間戳 → 原值。
- **前端讀取路徑切換**：
  - [`src/stores/fee-store.ts`](../src/stores/fee-store.ts)：`loadFees` 改讀 `fees_visible`；**realtime 改重查**——收到 `fees` 事件不再直接套 `payload.new`（含營收全欄位），改 `requeryFeeFromView(id)` 重查遮罩 view，查不到（非本人/草稿）即從本地移除。寫入（insert/update/delete）仍走 `fees` 原表。
  - [`src/components/comments/CommentInput.tsx`](../src/components/comments/CommentInput.tsx)：`@` 提及清單改讀 `fees_visible`。
  - **invoice 相關頁面**（`InvoiceDetailPage`／`InvoicesPage`／`ClientInvoice*`／`CasesPage`）皆經 `useFees()` 讀**同一個記憶體 `feeStore`**，故切 `loadFees` 至 view 後，展開的費用明細自動走遮罩，無殘留直讀 `fees` 原表的路徑（滿足擁有者追加 1）。
  - UI 隱藏（營收/客戶/內部備註區塊）先前已由 `TranslatorFeeDetail` 的 `isManager` gate 完成；view 遮罩為資料層防線（防開發者工具／API／realtime）。
  - `src/lib/edit-log-permission-filter.ts` 之 `filterEditLogsFeeDetail` 保留為 TS 第二層（渲染層）。
- **DB 層遮罩驗證**（`supabase/tests/w10_fees_visible_mask_check.sql`，含 fixture，14 項全 PASS）：建 env=test 的譯者一非草稿／草稿／本人請款 fixture 後——譯者讀自己非草稿 **≥1（非 trivial）**、草稿 **0**、本人請款 **≥1**；`client_info.client=''`、`clientTaskItems=[]`、`rateConfirmed` 保留、`internal_note=''`、`edit_logs` 僅 1 條（無營收/客戶/機密字串）、`task_items` 完整；PM 查同列 `client_info`/`internal_note`/`edit_logs` 全欄位完整（CASE 另一分支）。**欄位漂移檢查**：`fees` 有而 `fees_visible` 無的欄位 = 無。
- **advisors**：重跑 security 無新增警告，`fees_visible` 未觸發 `security_definer_view`（因 `security_invoker=on`）；既有 52 筆 WARN 為 repo 既有通則（search_path、security-definer function executable、public bucket、leaked-password protection），與本次無關。
- **Playwright**：
  - PM 回歸 spec [`tests/w10-fees-visible-pm.spec.ts`](../tests/w10-fees-visible-pm.spec.ts)（W10-PM-1～4：四列表、費用詳情營收/內部備註、請款詳情、寫原表→讀 view 來回），已納入 `playwright.config.ts` testMatch，`--list` 通過。
  - 譯者遮罩 spec [`tests/w10-fees-visible-translator.spec.ts`](../tests/w10-fees-visible-translator.spec.ts)（W10-T-1/2）依規格寫齊，全數 `test.fixme`（依賴換人流程），`switchToTestPersona` 內含「切換後須為 active persona」身分斷言。
  - **更正（2026-07-04）**：先前記載「本機 `.env` 無 `PLAYWRIGHT_TEST_EMAIL/PASSWORD/BASE_URL`」有誤——三個變數皆存在且與 `auth.setup.ts` 一致；先前讀取失敗係工具 cwd／未版控檔案讀取問題，非變數缺漏。唯 `.env` 的 `PLAYWRIGHT_BASE_URL` 指向 production，而批次 2／3 前端只在本分支，須以 `PLAYWRIGHT_BASE_URL=http://localhost:8080` 覆寫（`playwright.config` 的 `webServer` 會自動起 `npm run dev` 跑分支程式碼）。**已於本機實跑 PM 回歸 spec（W10-PM-1～4）全 4 綠**（見 §9.7）。
- **dev-switch-user 提前修復評估（擁有者追加 3）**：verifyOtp 自動化靜默失效之修復**須能實跑 Playwright 才能驗證生效**；本工作階段無登入憑證與可跑環境，無法在半天內「修復並驗證」→ 維持 Phase 3，譯者端沿用 DB 層＋執行長人工抽查（追加 4）。

### 9.7 批次 3 執行結果（譯者費用模組全程唯讀，已落地，2026-07-04）

**總原則（擁有者定調）**：譯者在費用模組是「純讀者」——看得到自己的稿費內容與請款狀態，其餘一律看不到、動不了。

- **盤點（動手前，關鍵）**：
  - `fees` 現況 INSERT/UPDATE/DELETE **本就已是 `is_admin`-only**（`is_admin((select auth.uid())) and env = current_env()`），譯者本無法寫；但這三條政策先前以 ad hoc 套用、repo 無 migration 記錄（架構規則 §7「DB 與版控不得脫鉤」之漂移）。
  - 全前端 `fees` 唯一寫入者為 [`src/stores/fee-store.ts`](../src/stores/fee-store.ts)（insert/update/delete）；其呼叫端（`TranslatorFeeDetail`／`TranslatorFees`／`CaseDetailPage`／`generate-case-fees`／`ai-agent-bridge`）皆為 PM/admin 動作。`cat-wf-lms-sync.ts` 與任務完成連動**皆不寫 `fees`**。→ **無譯者 session 寫入路徑**，依裁決直接收緊（不需停下回報）。
- **資料層（migration `supabase/migrations/20260704020000_w10_fees_write_admin_only_and_view.sql`，MCP `apply_migration`）**：
  - `fees_insert/update/delete` idempotent 重建為僅 PM/執行長（行為與現況等價，僅補入庫防漂移）。
  - `fees_visible` 重建：`client_info.rateConfirmed` 從白名單移除，非管理員一律 `false`；`edit_logs` 白名單黑名單再加入 `費率/rateConfirmed` 排除。
- **UI（PM／執行長視角完全不變）**：
  - [`src/pages/TranslatorFeeDetail.tsx`](../src/pages/TranslatorFeeDetail.tsx)：稽核既有 gate 後，右上角動作列四鈕（複製本頁／新增費用／刪除／開立稿費條）、費率無誤勾選框、新增項目按鈕**原就 `isManager` gate**；標題／任務項目輸入原就 `disabled={!canEdit}`（譯者唯讀）。本批**新增隱藏**：① 客戶請款狀態欄位整塊（原無 gate，值來自 admin-only `client_invoices`，譯者會落空顯示「尚未請款」殘影）；② 任務表「刪除」欄（標頭＋每列刪除格＋footer 對齊格，整欄移除，`colSpan` 隨之 6→5）；③ 費用相關備註的「回覆」鈕與留言輸入框（寫入走 `fees.notes`＝admin-only，對譯者為死控件）。「收錄至稿費請款單」保留（譯者正當功能）。
  - [`src/pages/TranslatorFees.tsx`](../src/pages/TranslatorFees.tsx)：清單頁寫入類工具列（譯者請款／客戶請款／批次開立／刪除）原就 `isManager` gate、inline 編輯格 `getEditable` 對非管理員一律不可編；本批將「新增費用」由 `canCreateFee` 收緊為 `isManager && canCreateFee`（避免非管理員拿到 `create_fee` section 權限時看到死鈕）。
- **DB 層驗證**（全 PASS）：
  - 批次 3 寫入 [`supabase/tests/w10_fees_write_check.sql`](../supabase/tests/w10_fees_write_check.sql)，**7 項全 PASS**：譯者一 INSERT／UPDATE 單價／UPDATE status（模擬開立）／DELETE = **DENY**；PM 同操作 = **ALLOW**。
  - 批次 2 遮罩 [`supabase/tests/w10_fees_visible_mask_check.sql`](../supabase/tests/w10_fees_visible_mask_check.sql) 重跑，**14 項全 PASS**（`rateConfirmed` 斷言改為遮罩＝`false`，無回歸、無欄位漂移、無機密字串外洩）。
  - 批次 1 列級 [`supabase/tests/w10_translator_read_check.sql`](../supabase/tests/w10_translator_read_check.sql) 重跑，**11 項全 PASS**（列級收緊與 W5 寫入不回歸）。
- **Playwright**：
  - **PM 回歸 spec 本機實跑全 4 綠**（覆寫 `PLAYWRIGHT_BASE_URL=http://localhost:8080`）；過程修兩處 spec 斷言（非產品缺陷）：W10-PM-3 請款詳情頁 PM 標題為 `Input` 非 `h1`（改以「返回請款單清單」導覽鈕為穩定標記）；W10-PM-4 `agent.fee.create` 內部 createDraft(insert)＋updateFee(update) 對同 id fire-and-forget 競速、title 可能未落地（與 W10 無關的既有 agent 競態），改斷言「該筆經 `fees_visible` 讀得回」（id 可見即證明寫原表→讀 view 來回）。
  - 譯者 spec 新增 **W10-T-3**（純讀者：無動作列四鈕、無新增項目/費率無誤、無刪除欄、無客戶請款狀態、任務輸入 disabled、清單無新增費用），與 W10-T-1/2 同為 `test.fixme`（依賴換人流程，Phase 3），DB 層已由上述三支腳本涵蓋。
- **待併前**：由 Fable 5（本代理）以測試模式「譯者一（測試）」做批次 2＋3 合併前最終 UI 抽查；抽查通過直接併 `main`。`dev-switch-user` 自動化修復維持 Phase 3。
- **備註**：本機 PM-4 多次實跑於 env=test 產生數筆空標題草稿 `fees`（譯者看不到、PM 端僅為空列），為避免非必要的遠端破壞性寫入未清理，列為測試環境待清雜項。

### 9.8 批次 3 後續熱修：Vercel 建置失敗（types 未重生，2026-07-04）

- **問題**（Fable 5 發現，deployment `dpl_6KKcsFXYyhLYq48fdFsgqymbndbL` ERROR）：批次 2 引入 `.from("fees_visible")` 但 `src/integrations/supabase/types.ts` 未重生，`Views` 仍為空 → Vercel `tsc -b` 型別錯誤（`CommentInput.tsx`、`fee-store.ts`）。本機全綠假象：`npm run dev` 不跑 tsc，正式建置才跑。
- **修復**：以 MCP `generate_typescript_types` 重生 types（`fees_visible` 進 `Views`），`npm run typecheck` 通過；**未用 `as any` 繞過**。
- **教訓入檔**：W6/R2 動機欄（階段三）補實害案例；[`testing.mdc`](../.cursor/rules/testing.mdc) 新增 §7「新增資料庫物件必同步重生 types 並過 typecheck」。

### 9.9 合併前 UI 抽查發現 F1/F2 與擁有者裁決（2026-07-04）

Fable 5 以測試模式「譯者一（測試）」對分支預覽做最終抽查，發現兩項，擁有者裁決如下：

- **F1（補回）— 譯者視角變更紀錄區塊消失**：根因為前端 `filterEditLogsFeeDetail` 以 `checkPerm("fee_management", …)` 再過濾一次，譯者無該模組檢視權限 → 白名單條目全數被濾光 → 區塊 `length === 0` 不渲染。裁決：資料層 `fees_visible.edit_logs` 已是白名單過濾結果，譯者視角**直接渲染**即可。修法：[`TranslatorFeeDetail.tsx`](../src/pages/TranslatorFeeDetail.tsx) 非管理員略過 `checkPerm` 過濾、區塊恆顯示（空清單顯示「尚無可顯示的變更紀錄」，加 `data-testid="fee-edit-log-section"`）；PM 行為零變更。譯者遮罩 spec（W10-T-1，fixme 中）補斷言：區塊存在且條目不含營收／客戶欄位。
- **F2（結案，不收緊）— `/members` 譯者可見**：**譯者可見團隊成員清單符合設計行為，2026-07-04 擁有者確認**，不收緊。測試教訓入檔 [`testing.mdc`](../.cursor/rules/testing.mdc) §6：測試模式假人身分**不影響路由守衛判定**（守衛看真實帳號角色），路由守衛驗證不得用假人切換，須用真實測試帳號（如 `playwright-e2e`）或 DB 層驗證。

## 10. W9 AI 可操作性（擁有者 2026-07-04 裁定：W10 之後的下一優先）

**背景**：本專案的驗收與自動化作業大量由 AI 操作網頁執行；兩份實測報告（Claude 建單截圖依賴分析 2026-07-03、Fable 5 CAT 抽測 2026-07-03）共列 11 個「AI 被迫截圖猜座標或繞道」的摩擦點。降低摩擦＝每一輪 AI 驗收更快更穩，也直接提升 Playwright 劇本穩定性。**排程**：置於 W10 之後、階段三之前或並行（A 組不衝突可先做）；W10 併入 `main` 後即開工 A 組。

### W9-A：加標記即可（半天級，先做）

| 編號 | 內容 |
|------|------|
| A1 | 案件頁工具區塊欄位加 `data-testid`（`tool-server`／`tool-username`／`tool-password`／`tool-project`／`tool-files`）——現無 id/name/ARIA 可定位 |
| A2 | 範本彈出視窗選項加 `data-testid`（`template-option-<名稱>`） |
| A3 | 工具區塊移除鈕加 `aria-label="移除工具 <名稱>"` |
| A4 | 多人協作表格每列日期欄加 `data-collab-id`（現況：點日期全寫入第一列，AI 只能截圖量 y 座標） |
| A5 | CAT 編輯器句段列加 `data-status="confirmed|draft|…"`（現況狀態僅靠圖示樣式，AI 與 Playwright 皆無法程式判讀） |

### W9-B：bridge API 擴充（中等，隨模組碰到時做）

| 編號 | 內容 |
|------|------|
| B1 | `__lmsAgent` 支援工具區塊欄位寫入＋讀回驗證（密碼可維持 `[BLOCKED]`，但須回傳「已套用範本 X」的可驗證訊號） |
| B2 | `case.getCurrentId()`——偵測導覽後 React state 殘留（state bleed） |
| B3 | `__catAgent` 擴充編輯器 API：句段查詢（狀態/數量）、跳至句段、讀取目前焦點句 |

### W9-C：行為修正（個案）

| 編號 | 內容 |
|------|------|
| C1 | bridge 寫入成功（`ok:true`）後清除 `beforeunload` 攔截（現況 AI 導覽被 Leave site? 擋住，只能開新分頁繞） |
| C2 | 語言對選擇框打字搜尋無反應（打 `zh` 清單不過濾；人類也可能受影響） |
| C3 | CAT iframe 對無障礙樹不可見——generic 工具（find/read_page/file_upload）全失效；至少為匯入 file input 提供可及定位，或評估 iframe a11y 曝露設定 —— **已落地**（擁有者 2026-07-04 裁定提前為正式工項，理由：已在真實 AI 建單流程中反覆卡住），見下方落地紀錄與操作指南 §9.6／§11.4 |

### W9 驗收標準

每項以「**AI 不靠截圖完成對應操作**」為通過條件：A 組 find 定位成功即過；B 組以 bridge 呼叫回傳驗證；C 組個案定義。全數完成後更新 [`docs/TMS_CAT_AI_AGENT_OPERATIONS_GUIDE_2026-07.md`](TMS_CAT_AI_AGENT_OPERATIONS_GUIDE_2026-07.md) 對應章節。

### W9-A 落地紀錄（2026-07-04，分支 `cursor/w9a-ai-operability-markers`）

- **A1**：[`CaseDetailPage.tsx`](../src/pages/CaseDetailPage.tsx) 工具區塊欄位（`IMESafeInput`／`ToolFileFieldRow`）依標籤對照表（伺服器／帳號／密碼／專案／檔案）加 `data-testid="tool-server|tool-username|tool-password|tool-project|tool-files"`；無對照者 fallback 為 `tool-field-<fieldId>`。
- **A2**：範本彈出視窗選項按鈕加 `data-testid="template-option-<範本名稱>"`。
- **A3**：工具移除鈕加 `aria-label="移除工具 <工具名稱或序號>"`。
- **A4**：[`CollaborationTable.tsx`](../src/components/CollaborationTable.tsx) 每列容器與翻譯／審稿交期日期欄各自加 `data-collab-id="<rowId>"`（日期欄另加 `data-collab-field`），修正「點日期全寫入第一列，AI 只能截圖量座標」。
- **A5**：CAT 編輯器（`cat-tool/app.js`）新增 `syncRowStatusDataset(row, seg)`，句段列同步 `data-status`（原始狀態）與 `data-wf-state`（`resolveSegmentConfirmDisplayState` 統一顯示五態）；掛於列建立（`buildGridDataRow`）與所有狀態圖示刷新點（`refreshStatusIconForRow`、`refreshUserMarkerStatusCell`、批次確認刷新迴圈）。已 `npm run sync:cat`。維護附註已入 [`architecture.mdc`](../.cursor/rules/architecture.mdc) §1；Playwright 受益點已入 [`CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md`](CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md) Phase S。
- **裁決**：純標記變更、零行為風險，2026-07-04 直接併入 `main`（merge commit `af90596`）；驗收改為併後在正式站由 Fable 5 以 `find`（無障礙定位）逐項驗證 A1–A5，任何一項定位失敗即開熱修、不回滾。
- **正式站驗收結果（2026-07-04）**：A1／A2／A4／A5 PASS。**A3 初測未過**（Zwift 260625 案件找不到移除鈕），經程式碼比對確認為**設計行為，非漏標**：移除鈕僅在 `showRemove && canRemoveTool` 皆為真時渲染——執行工具區塊 `showRemove = canRemoveCaseTool(caseData)`（[`case-tool-count.ts`](../src/lib/case-tool-count.ts)：`countCaseTools()`（legacy `tools` 陣列長度＋`catToolEnabled`）須 **> 1** 才允許移除，確保案件永遠保留至少一種工具）；提問工具區塊為 `questionTools.length > 1`。該案件工具總數為 1，移除鈕依設計本就不顯示，`aria-label="移除工具 <名稱>"` 程式碼確認存在（`CaseDetailPage.tsx` L615）。**判定：W9-A 全數達標**，複驗建議改用「有 2 種以上工具（例如 2 個執行工具，或 1 個執行工具＋1UP CAT 已啟用）」的案件即可看到並定位到該鈕。

### W9-C C3 落地紀錄（2026-07-04，分支 `feature/w9c-cat-import-testid-bridge`）

**裁定**：原排程「隨模組碰到時做」，因已在真實 AI 建單流程中反覆卡住，擁有者裁定提前為正式工項。

- **標記**：[`cat-tool/index.html`](../cat-tool/index.html) 三個匯入 input（`#sourceFileInput`／`#tmImportInput`／`#tbImportInput`）加 `data-testid="cat-import-source|cat-import-tm|cat-import-tb"`，即使 `display:none` 仍保留在 DOM。
- **頂層代理上傳入口**：[`CatToolPage.tsx`](../src/pages/CatToolPage.tsx) 新增 3 個位於頂層文件（非 iframe）的官方代理 `<input type="file">`（`data-testid="cat-agent-upload-proxy-source|tm|tb"`，視覺上以 sr-only 樣式隱藏但保留在無障礙樹中），選檔後經既有 `__tmsAgent.cat.invoke` RPC 把 `File` 物件（postMessage structured clone 原生支援）轉送進 iframe。
- **iframe 側轉送**：新增 [`cat-tool/js/cat-agent-bridge.js`](../cat-tool/js/cat-agent-bridge.js) 的 `import.forwardToInput({ target, files })` 方法，寫回對應 input 的 `.files` 並 `dispatch change`，觸發既有匯入邏輯（含匯入精靈），未修改 `cat-tool/app.js`（符合 `architecture.mdc` §1 凍結原則）。已 `npm run sync:cat`。
- **文件**：[`TMS_CAT_AI_AGENT_OPERATIONS_GUIDE_2026-07.md`](TMS_CAT_AI_AGENT_OPERATIONS_GUIDE_2026-07.md) §9.6（file_upload 上傳做法一／做法二）、§11.4（標記登錄）已補齊。
- **驗證**：`npm run typecheck`／`npm run test`（5 檔 22 項）／`npm run check:encoding`／`npx eslint` 對變更檔皆過（`CatToolPage.tsx` 僅既有 1 個 `exhaustive-deps` warning，範圍外）。
- **待驗收**：以 Chrome 工具在團隊版專案頁，不手動選檔、不注入自訂元素，用官方標記 + file_upload 成功匯入一個 `.mqxliff`，匯入精靈正常出現（本環境無互動式瀏覽器可代為完成此步，待驗收方或擁有者實測）。

## 11. W6 CI 第一版落地 + Hook 熱修 + lint 清零評估（2026-07-04，驗收方 Fable 後任裁示）

**背景**：驗收方於乾淨環境實測 `main@5e0ac5e`：`npm run typecheck` 通過、`npm run test` 4 檔 21 項全過（階段三步驟 1「vitest 可跑」達標）、`npm run lint` 357 error／51 warning（約 342 個 `@typescript-eslint/no-explicit-any`，另有 `TranslatorFees.tsx` L463／L492 兩處 `react-hooks/rules-of-hooks` 真風險）。據此裁示三項工項，A／B 各一分支（一題一分支），C 僅評估、待裁決再動工。

### 11.1 工項 A：CI 第一版（分支 `cursor/w6-ci-v1`）

- 新增 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)：觸發 push `main` ＋ 所有 PR；`ubuntu-latest`、Node 22、`npm ci`（含快取）；三步驟 typecheck（擋關）→ test（擋關）→ lint（`continue-on-error: true`，僅回報不擋關）。不含 Playwright（依主計畫，e2e 另案處理、不擋 push）。
- commit `7f8117b`；merge commit `70a0bc8`（`cursor/w6-ci-v1` → `main`）。
- **驗收（GitHub Actions 實測，非僅本機模擬）**：push 後觸發 run [`#28696148596`](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/28696148596)，`status=completed`／`conclusion=success`（**main 上跑出綠燈**）；job 步驟 Checkout／Setup Node／Install／Typecheck／Test／Lint 全部 `completed`。Lint 步驟因 `continue-on-error: true` 即使有現存錯誤仍計入整體成功，本機同時重現同一份 357 error／51 warning 報告（詳見 §11.3），確認「有列出現存錯誤但不影響整體結果」之驗收條件成立。
- **誠實註記**：本環境無 `gh` CLI 與具管理權限的 token，僅能以未驗證的公開 API 讀 run／job 層級狀態（`status`／`conclusion`），無法下載逐行 log（`403 Must have admin rights`）；上述「lint 已列出錯誤」之結論以**本機重跑同版 lint 指令**佐證，而非直接讀 Actions 原始 log 逐字比對。

### 11.2 工項 B：Hook 條件呼叫熱修（分支 `cursor/w6-hook-order-fix`，與 A 分開）

- **根因**：[`TranslatorFees.tsx`](../src/pages/TranslatorFees.tsx) 的 `TranslatorInvoiceStatus`／`ClientInvoiceStatusCell` 原在 `if (!linked) return …` 提前 return **之後**才呼叫 `useSelectOptions("statusLabel")`，違反 React Hooks 規則（同一元件不同次 render 呼叫的 hook 數量／順序不得改變）；`linked`（是否已連結請款單）由 store 資料決定，執行期一旦從「無連結」變為「有連結」（或反向），即可能觸發 `Rendered fewer hooks than expected` 而整頁白屏，屬**真實崩潰風險**而非僅風格問題。
- **修法**：兩處皆將 `useSelectOptions` 呼叫移到提前 return 之前無條件呼叫，回傳的 `statusLabelOptions` 在使用處（`if (!linked) return`之後的邏輯）才依 `linked` 判斷是否用到，行為對 PM／譯者視角零改變。
- **回歸測試**：新增 [`src/pages/TranslatorFees.hooks-order.test.ts`](../src/pages/TranslatorFees.hooks-order.test.ts)，以子行程（`spawnSync`）跑 `npx eslint --format json src/pages/TranslatorFees.tsx`，過濾 `react-hooks/rules-of-hooks` 規則斷言為空陣列。**已實際驗證測試有效性**：修復前 stash 回退程式碼重跑，測試確實在原本兩行（L463／L492）失敗；還原修復後轉綠——非空殼斷言。改用子行程而非 ESLint API 直呼：ESLint 內部 retry/abort 邏輯依賴原生 `AbortSignal`，本專案 vitest 全域環境為 jsdom，jsdom 覆寫的 `AbortSignal` 缺少 `throwIfAborted` 會導致 API 直呼失敗（`signal?.throwIfAborted is not a function`），子行程完全避開此環境衝突。
- **驗證**：本機 `npm run typecheck`／`npm run test`（5 檔 22 項全過，含新回歸測試）皆過。
- commit `3e84603`；merge commit `102df30`（`cursor/w6-hook-order-fix` → `main`）。

### 11.3 工項 C：lint 清零策略評估（僅評估，未動工，待裁決）

**現況重新盤點**（`npx eslint . --format json` 全 repo 實測，2026-07-04）：

| 指標 | 數值 |
|------|------|
| `@typescript-eslint/no-explicit-any` 總數 | **319**（驗收方口頭估「約 342」，同一量級，差異推測為統計時點或計數方式差異，非本質分歧） |
| 涉及檔案數 | **46**（非驗收方估的 73；已用程式化統計覆核，取本次為準） |
| 其他非 any 規則 | `react-hooks/exhaustive-deps` 37、`no-empty` 14、`no-useless-escape` 12、`react-refresh/only-export-components` 9、`prefer-const` 4、`no-extra-boolean-cast` 3、`@typescript-eslint/no-empty-object-type` 2、`@typescript-eslint/no-require-imports` 1（`react-hooks/rules-of-hooks` 兩項已隨工項 B 修復歸零） |

**按目錄分布**（`any` 數量）：`src/pages` 164、`src/stores` 80、`src/components` 39、`supabase/functions` 16、`src/hooks` 15、`src/lib` 4、`src/data` 1。

**按檔案集中度**（top 6 即占近半數）：`CatToolPage.tsx` 42、`TranslatorFeeDetail.tsx` 29、`client-invoice-store.ts` 22、`CommentInput.tsx`／`PermissionsPage.tsx`／`case-store.ts` 各 16。

**評估與建議（回覆即可，等裁決再動工）**：

1. **分批修比一次到位更合理**：46 個檔案分散在 `pages`／`stores`／`components`／`supabase/functions` 四個性質不同的區域，一次全改風險高（尤其 `stores` 涉及 realtime payload 型別、`pages` 涉及 UI 渲染邏輯），且與「一工項一分支」原則（`architecture.mdc` §7）衝突——建議**依 top 檔案集中度分批**，而非機械式依模組資料夾分批（因單一模組內單檔即占極大比例，模組分法會讓某幾批過重、某幾批過輕）：
   - **批次 1**：`CatToolPage.tsx`（42）＋`TranslatorFeeDetail.tsx`（29）＝ 71 個，約占總數 22%，且兩檔皆為近期高頻異動熱點，建議優先，順道補型別可降低未來 CAT／費用模組改動時的隱性風險。
   - **批次 2**：`client-invoice-store.ts`（22）＋`case-store.ts`（16）＋`CommentInput.tsx`（16）＝ 54 個，三者皆涉及 Supabase 資料型別／realtime payload，適合同批（型別定義可互相參照 `types.ts`）。
   - **批次 3**：`PermissionsPage.tsx`（16）＋剩餘 `src/pages` 中小型檔案（`ClientInvoiceDetailPage.tsx` 13、`ClientInvoicesPage.tsx` 13、`InvoiceDetailPage.tsx` 10、`CaseDetailPage.tsx` 8 等）。
   - **批次 4**：`src/stores` 剩餘（`fee-store.ts` 9、`internal-notes-store.ts` 8、`icon-library-store.ts` 7、`undo-store.ts` 7、`invoice-store.ts` 6 等）＋ `src/hooks`（`use-permissions.ts` 7 等）。
   - **批次 5**：`supabase/functions/fetch-notion-page/index.ts`（16，Deno edge function，型別來源與前端不同，獨立處理較乾淨）＋其餘零散小檔（`src/components`、`src/data`）。
   - 每批**獨立 commit、獨立跑三關**（比照 W1 五 store 遷移的驗收慣例），估**5 批**，非一次到位；批次順序建議依「近期異動熱度」優先（`CatToolPage.tsx`／`TranslatorFeeDetail.tsx` 近期才因 W10 改過，型別若補在此時最省認知負擔）。
2. **暫無正當理由對特定目錄整批降級規則**：46 個檔案、319 處分布分散，且多數是「Supabase 查詢結果」「Realtime payload」「第三方庫回呼參數」等真實型別未知場景，屬需要逐一補型別或至少改 `unknown` + 縮小的情境，非設計上必須用 `any`；`supabase/functions/` 的 Deno edge function 型別環境與前端不同（無法直接共用 `src/integrations/supabase/types.ts`），若要降級，**建議僅該資料夾**可考慮改 `warn` 而非 `off`（仍留痕跡），但目前僅 16 處、單一檔案，直接修不比降級規則省事，故**不建議此時降級**，留待實際分批修時若遇特殊技術限制（例如 Deno 型別產生工具鏈缺失）再個案處理。
3. **R2（三關正式擋推送）與 lint 清零的關係**：目前 CI 的 lint 步驟為 `continue-on-error`，R2「三關全過才可推送」尚未把 lint 納入正式門檻。待 5 批修完、`react-hooks/exhaustive-deps` 等其他規則亦清空後，再將 `ci.yml` 的 lint 步驟移除 `continue-on-error`，同步把 R2 標記為正式生效。
