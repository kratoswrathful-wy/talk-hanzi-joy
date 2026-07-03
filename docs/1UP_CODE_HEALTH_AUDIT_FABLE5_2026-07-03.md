> 來源：Fable 5 體檢報告，2026-07-03。原始存放於本機 Claude 專案資料夾（`1UP 線上工具開發/1UP_程式體檢與工程改善報告_2026-07-03.md`）；本檔為文件庫留存副本，內容未經改動。執行計畫見 [`ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md`](ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md)。

# 1UP TMS／CAT 程式體檢與工程改善報告

日期：2026-07-03
分析範圍：GitHub `kratoswrathful-wy/talk-hanzi-joy` 全部原始碼（React TMS 約 223 檔 5.7 萬行；CAT 工具 `cat-tool/` 約 5.7 萬行，其中 `app.js` 37,927 行／1.87MB）、`docs/` 139 份文件、Supabase 專案 `1UP TMS`（`wshsmerltcakffllgyul`）之 `pg_stat_statements` 與 policy／index 實測。

本報告分兩部分：**第一部分是白話總覽**（給專案擁有者），**第二、三部分是工程細節**（給 Cursor 逐項執行，含檔案路徑、函式名、SQL／設定草案與驗收方式）。白話版每項均標註對應工項編號（R＝規則、W＝工程）。

---

# 第一部分：白話總覽

## 一、程式碼整合與模組化

**值得做的**：TMS 有五個資料 store（管理案件、費用單等資料的程式）是同一套邏輯抄五遍（約 1,900 行），已出現「一個修了 bug、其他四個沒跟上」的漂移，建議收斂成一個通用工廠（→ W1）。四個「表格檢視」hook 也是近親複製（約 1,650 行），統一到泛用版（→ W2）。巨型頁面（最大 3,497 行）採「碰到才拆」，不為拆而拆（→ W8）。按鈕等 UI 元件已有註冊制，只需規定新按鈕一律走註冊、不手刻。

**不要碰的**：CAT 編輯器的句段拖曳、假游標、換行處理這些細節，都是踩坑驗收出來的行為，大重構等於重踩所有坑。務實做法是把近四萬行的 `app.js` **凍結：只出不進**——新功能一律寫獨立模組，舊功能修到時順手搬出去（→ W7）。

## 二、效能（不影響穩定性的前提下）

好消息：「操作後立即回應」大體已做到（畫面先改、背景寫入、即時同步、輪詢備援）。實測資料庫找到的具體改善點：

- 輪詢備援累計打了近 300 萬次資料庫查詢，加「分頁不在前景就暫停」約 10 行程式碼即可砍掉九成（→ W3）。
- 列表頁抓了整包大 JSON 欄位，清單其實只需要十幾欄，瘦身後列表載入有感變快（→ W4）。
- 資料庫層三個小修：33 個外鍵沒索引、2 條權限規則每列重算、4 張表權限規則重疊——純資料庫修改，前端零風險（→ W5）。

不建議做的：不要為了速度犧牲目前「本地先改＋衝突偵測」的正確性平衡。

## 三、規則文件現況與修訂

現有 `AGENTS.md`（給 AI 的員工手冊）＋ 5 個 `.cursor/rules/` 規則檔，品質很好，全部保留；`xliff-tag-export.mdc` 每條禁令都對應真實事故，最珍貴。

要修的：一條「幽靈規則」——手冊引用的驗收規則檔沒被放進 GitHub（→ R1）；目前「改完直接上線」中間**沒有檢查關卡**，要加 lint／型別檢查／自動測試三關（→ R2、W6）；建議新增架構、測試、文件生命週期三份規則檔（→ R3、R4、R6）——文件裡同類 bug 出現十幾份報告，就是缺「修 bug 必留回歸測試」規則的訊號；手冊裡佔一半篇幅的文件目錄搬去獨立檔案（→ R5）；加一份 `CLAUDE.md` 讓 Claude 和 Cursor 讀同一套規則（→ R7）。

## 四、測試策略與工具推薦

**測試分工**：Playwright（自動操作瀏覽器的機器人）守舊功能——劇本寫一次、每次改碼自動重演，最適合「修好又壞回來」的回歸問題；人／Claude 驗新體驗——「看起來順不順」只有會看畫面的驗收者能判斷。首次驗收通過後，把行為固化成 Playwright 劇本 commit 進 `tests/`，累積成護城河。大檔測試注意：等「確定訊號」不等固定秒數（虛擬捲動易抖）、用固定 fixture 檔、一律跑測試模式。

**工具推薦**（按入門容易度）：

| 工具 | 用途 | 說明 |
|---|---|---|
| GitHub Actions | 自動跑檢查 | 一個設定檔起步，免費（→ W6） |
| GitHub Connector（Cowork） | 讓 Claude 直接讀 repo | 省去繞路 clone |
| Sentry（免費層） | 前端錯誤自動回報 | 自動收集錯誤堆疊，接上 bug-report 流程 |
| knip | 找沒人用的死碼和依賴 | `npx knip` 即可 |
| rollup-plugin-visualizer | 看打包後哪些東西最肥 | Vite 一行設定 |
| Supabase advisors | 資料庫健檢 | 內建；建議每月看一次 |
| madge | 檢查模組循環依賴 | app.js 拆模組時用 |
| @tanstack/react-query | 資料層框架 | 已安裝未使用；做 W1 時可評估，不急 |

**Cursor 模型設定建議**：日常開發用 Sonnet 5＋Thinking＋High＋300K；大型重構與 XLIFF 疑難換 Opus 4.8 High 或 Fable 5 High——注意 `app.js` 1.87MB（約 50 萬 token）**300K 裝不下**，要跨看全檔時切 1M context；機械性小改用 Composer Fast 省額度；Extra High／Max 和 MAX Mode 留給最難的 tag 對齊 bug；不建議 Auto（此 repo 規則多、上下文特殊）。

---

# 第二部分：AI 協作規則修訂（R1–R7，給 Cursor）

### R1（bug）補回遺失的規則檔
`AGENTS.md` 第 10、112 行引用 `.cursor/rules/claude-ai-acceptance-slack.mdc`，**該檔不在版控中**。若本機存在請 commit；若散失，依 AGENTS.md「Claude AI 驗收（Slack）」一節重建（頻道 `#development`、channel id `C0BDSDCT9B5`、驗收要求須為 AI 可程式化執行的 T1…測項）。

### R2（新增）推送前品質閘門
AGENTS.md 現制為「完成變更後直接推送」。改為：

> 推送前必須依序通過 `npm run lint`、`npm run typecheck`、`npm run test`（vitest）。任一失敗不得推送；無法在合理時間修復時，回報失敗項與原因。

### R3（新增）架構規則檔 `architecture.mdc`（alwaysApply: true）

```
1. cat-tool/app.js 凍結：禁止在 app.js 新增功能。新功能一律建立
   cat-tool/js/<feature>.js 模組（IIFE/namespace 掛 window，比照
   xliff-tag-pipeline.js）。修改既有功能時，若改動超過該功能一半，
   應順勢將該功能整段搬遷至 js/ 模組。
2. src/stores/ 新資料實體一律使用 createEntityStore 工廠
  （見 src/stores/entity-store-factory.ts；W1 完成前暫比照 fee-store 模式）。
3. 表格檢視一律使用泛用 use-table-views，禁止再新增
   use-<entity>-table-views 複製檔。
4. 工具列按鈕一律走 ui-button-registry／module-toolbar-buttons 註冊，
   禁止在頁面元件內手刻。
5. 列表查詢禁止 select("*")：必須指定欄位清單常數
  （比照 cat-cloud-rpc.ts 的 CAT_FILE_LIST_COLUMNS）。
6. 單檔上限警戒：新建 .tsx 超過 800 行、單一元件超過 400 行時，
   應先拆分再繼續。既有巨檔不因此重構，僅約束新增程式碼。
```

### R4（新增）測試規則檔 `testing.mdc`（alwaysApply: true）

```
1. 每修一個 bug，必須同 commit 附上最小回歸測試：
   - 純函式邏輯（tag pipeline、merge、mapping）→ vitest，
     測試檔緊鄰原始碼（比照 ai-agent-bridge.clientInfo.test.ts）。
   - UI 流程 → Playwright spec（tests/），使用 test-mode helper
     與固定 fixture（tests/fixtures/）。
2. XLIFF 家族修改：依 xliff-tag-export.mdc 既有規定測 mqxliff／
   sdlxliff／一般 XLIFF 三格式；將 docs 中已驗收 bug 樣本
   逐步收進 tests/fixtures/ 成為 regression corpus。
3. Playwright 一律於測試模式（環境隔離，見
   docs/CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md）執行，禁止污染正式資料。
4. Playwright 等待條件一律用確定訊號（元素出現、狀態變更），
   禁止固定 sleep；虛擬捲動相關斷言以資料狀態為準，不以 DOM 列數為準。
5. 除錯規範（寫入來源追蹤法，Phase R 2026-07 驗證有效）：追查「數值被改壞」
   類問題時，禁止只在階段點抽測；應在每一個實際寫入處加統一格式 log
  （source、序號、時間戳、寫入前後值），跑一次重現，讀完整時間軸再下結論。
   量測結果與畫面不符時，先分辨是流程控制層還是渲染定位層的問題。
   範例：docs/CAT_LARGE_FILE_VIRTUAL_SCROLL_NAV_DEVLOG_2026-07.md §寫入來源追蹤法。
```

### R5（調整）AGENTS.md 瘦身：規則與索引分離
「文件索引 (C) 領域與深文件」整段搬到 `docs/INDEX.md`，AGENTS.md 只留規則與入口指向（首讀哪三份）。規則檔短而恆定，索引檔長而常變，AI 檢索效果更好。

### R6（新增）文件生命週期規則 `docs-lifecycle.mdc`

```
1. 每份 docs/ 計畫或 bug-report 文件開頭第一行標狀態：
   狀態：規劃中｜實作中｜已落地待驗收｜已驗收｜已封存
2. 功能驗收通過後：現行行為摘要寫入 CODEMAP.md（只記現況），
   原計畫檔標「已驗收，細節以程式為準」，此後不再更新該檔。
3. 已驗收超過 90 天的 bug-report 與計畫檔移至 docs/archive/
  （移動時 grep 全 repo 修引用路徑）。
4. 新文件命名沿用現制：bug-report_<slug>_<YYYY-MM>.md、
   <AREA>_<TOPIC>_<PLAN|SPEC|DEVLOG>_<YYYY-MM>.md。
5. 同一主題累積超過 5 份文件時，彙整為一份敘事型 DEVLOG（時間軸總表＋
   commit 對照＋原文件連結），原文件保留作細節查證用。
   範本：docs/CAT_LARGE_FILE_VIRTUAL_SCROLL_NAV_DEVLOG_2026-07.md（2026-07-03，
   整合 7 份大檔捲動文件之先例）。
```

### R7（微調）既有檔小修
- `xliff-tag-export.mdc`：「禁止事項」有兩個「### 6.」，重新編號。
- 新增 `CLAUDE.md`（供 Claude Code／Cowork 讀取），三行即可：「規則以 AGENTS.md 為準；正體中文；CAT 原始碼僅 `cat-tool/`」。

### 不建議刪除
五個既有規則檔全部保留。

---

# 第三部分：工程工項（W1–W8，給 Cursor）

### W1 store 工廠：收斂五份複製的資料層（~1,900 行 → 約 600 行）

**問題**：`src/stores/` 的 `case-store.ts`（725 行）、`fee-store.ts`（281）、`invoice-store.ts`（296）、`client-invoice-store.ts`（321）、`internal-notes-store.ts`（246）為同一模式五份手抄：模組層陣列 ＋ `listeners: Set` ＋ `notify()` ＋ `dbToApp/appToDb` ＋ fire-and-forget 寫入 ＋ `postgres_changes` 訂閱 ＋ `createPollFallback` ＋ `loadSeq` 防過期。已有行為漂移：`case-store` 有 optimistic in-flight 保護（防 realtime 覆寫未落地的本地寫入，見其第 39、538 行），**其他四個沒有**——潛在「輸入被舊資料蓋掉」bug。

**做法**：建立 `src/stores/entity-store-factory.ts`：

```ts
export function createEntityStore<TApp, TDb>(cfg: {
  table: string;
  dbToApp: (row: TDb) => TApp;
  appToDb: (item: Partial<TApp>) => Record<string, unknown>;
  getId: (item: TApp) => string;
  pollIntervalMs?: number;   // 預設 30000，見 W3
  listColumns?: string;      // 見 W4
  insertExtras?: (userId: string | null) => Record<string, unknown>; // env, created_by
}): EntityStore<TApp>
```

工廠統一實作：env 過濾、realtime 三事件、輪詢啟停（首個 subscriber start／歸零 stop）、`loadSeq`、**case-store 的 in-flight optimistic 保護提升為全實體共用**。

**遷移順序**：`internal-notes-store` → `invoice-store` → `client-invoice-store` → `fee-store` → 最後 `case-store`（rename cascade 與 tool-count 用 cfg 擴充點或包裝層保留）。一次一個、單獨 commit、單獨驗收。

**驗收**：每遷一個跑對應頁 Playwright（列表載入、新增、改欄位、雙分頁 realtime 同步、斷 WS 驗輪詢回補）。

### W2 表格檢視 hooks 收斂（~1,650 行 → 一份泛用＋薄設定）

`use-case-table-views.ts`（558）、`use-client-invoice-table-views.ts`（395）、`use-invoice-table-views.ts`（353）、`use-internal-notes-table-views.ts`（342）與泛用版 `use-table-views.ts`（480）並存。以泛用版為基底，實體差異（欄位定義、預設排序、儲存 key）改參數傳入；泛用版做不到的行為先擴充泛用版，不回頭複製。從最小的開始遷移。

### W3 輪詢負載：改一處砍九成資料庫呼叫

**問題（實測）**：`SELECT updated_at FROM fees…` 158 萬次、`cases` 127 萬次，為應用查詢次數前二名。來源 `src/lib/realtime-poll.ts` `createPollFallback`（fee-store 傳 15000ms，部分呼叫端用預設 3000ms——先盤點所有呼叫端 interval）。

**做法**（只改 `realtime-poll.ts`）：
1. `document.visibilityState !== 'visible'` 時跳過本輪；監聽 `visibilitychange`，回前景立即補跑一次。
2. 預設 interval 拉到 30000ms；realtime channel 為 `SUBSCRIBED` 時可再拉長。
3. 可選：五表輪詢合併為單一 RPC 回傳各表 `max(updated_at)`。

**驗收**：開發者工具 block WebSocket 後，確認 30–60 秒內畫面仍回補。風險極低（輪詢本為備援）。

### W4 列表查詢欄位瘦身

**問題（實測）**：`fees` 全欄位查詢 10.7 萬次、平均 26.9ms；`cases` 93–147ms；`cat_tbs` 172ms；`cat_tm_segments` 76ms。列表把 `client_info`、`edit_logs`、`task_items`、`notes` 等大 JSONB 全抓，UI 只用標題／狀態／指派／日期。

**做法**：比照 `cat-cloud-rpc.ts` 的 `CAT_FILE_LIST_COLUMNS`——每實體定義 `<ENTITY>_LIST_COLUMNS`，`loadXxx()` 使用；詳情頁再抓單筆全欄位。注意 realtime payload 是全欄位，`dbToApp` 須容忍列表模式部分欄位缺席（型別分 `XxxListItem` 與 `Xxx` 或欄位 optional）。與 W1 一起做最省力（工廠吃 `listColumns` 設定）。

### W5 資料庫三修（純 migration，前端零改動）

實測：public schema 共 115 條 RLS policy。

1. **33 個外鍵無索引** → 對照 Supabase advisors（performance）清單 `CREATE INDEX CONCURRENTLY`（註：`CONCURRENTLY` 不能包 transaction，migration 需拆檔或去掉 CONCURRENTLY 於離峰執行）。
2. **2 條 policy 裸呼 `auth.uid()`**（每列重算）→ 改 `(select auth.uid())`（initplan 快取）。以 `pg_policies` 撈 `qual/with_check` 含裸 `auth.uid()` 者，`DROP POLICY`＋`CREATE POLICY` 重建。
3. **4 張表同 cmd 多條 permissive policy** → 合併為單條（條件 OR 串接）。

**驗收**：migration 後重跑 advisors 歸零；以 PM 與譯者雙角色跑 Playwright 全流程確認權限不變（RLS 改壞的典型症狀是某角色突然看不到資料）。

### W6 GitHub Actions CI（目前完全沒有，投報率最高）

`.github/workflows/ci.yml` 草案：

```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
  e2e:
    if: github.event_name == 'pull_request'   # 或改 schedule 每晚
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

注意：`auth.setup.ts`／`global-setup.ts` 假設有既存帳號，CI 需測試模式專用帳密（GitHub Secrets）；e2e 不穩時降級為每晚 schedule＋手動 dispatch，不擋 push。

### W7 `cat-tool/app.js` 凍結與抽離準則（37,927 行／1.87MB）

**不做大重構**（docs 中行內字型 rollback、phased-rebuild-audit 為前車之鑑）。執行 R3 第 1 條「只出不進」：

- 新功能：`cat-tool/js/<feature>.js`，模式比照 `xliff-tag-pipeline.js`（IIFE 掛 `window.<Namespace>`，`index.html` 加 `<script>`）。
- 搬遷時機：一次修改觸及某功能過半時順勢搬遷；**搬遷 commit 與行為變更 commit 分開**（搬遷 commit 行為零變更，方便 diff 驗證與回退）。
- 優先搬遷候選（自我封閉度高）：QA 檢查（`runQaChecks` 家族）、字數分析 Modal、批次匯入 wizard step 機。
- 最後處理／不搬：contenteditable 換行家族（`isGhostBr` 系列）、假游標互動、虛擬捲動掛鉤——耦合 DOM 事件順序，風險最高。
- 每次搬遷後 `npm run sync:cat`，兩邊一併 commit（既有規則）。

### W8 巨型 React 頁面拆分準則

`CaseDetailPage.tsx` 3,497 行（148KB）、`TranslatorFeeDetail.tsx` 2,841、`CasesPage.tsx` 1,570。「碰到才拆」：改某區塊前先抽成 `src/components/case/<Section>.tsx`（資料夾已有先例），props 傳入 state 與 handler；拆分 commit 與功能 commit 分開。禁止全頁重寫。

---

# 第四部分：建議執行順序

| 序 | 工項 | 預估規模 | 風險 |
|---|------|--------|------|
| 1 | R1 補 acceptance 規則檔＋R7 小修＋CLAUDE.md | 1 次對話 | 無 |
| 2 | W6 CI 上線（先 lint/typecheck/vitest，e2e 後補） | 半天 | 無 |
| 3 | W3 輪詢修改 | 1–2 小時 | 極低 |
| 4 | W5 資料庫三修（分三個 migration） | 一天 | 低（需雙角色驗收） |
| 5 | R2–R4、R6 新規則上線 | 1 次對話 | 無 |
| 6 | W1 store 工廠（五個 store 逐一遷移，五個 commit） | 二至三天 | 中 |
| 7 | W4 列表欄位瘦身（隨 W1） | 併入 W1 | 低 |
| 8 | W2 table-views 收斂 | 一至二天 | 中 |
| 9 | R5 AGENTS.md 索引分離 | 1 次對話 | 無 |
| 10 | W7/W8 長期原則，隨日常開發執行 | 持續 | 受控 |

依 AGENTS.md 慣例：每項完成後直接推送（R2 上線後須先過三關檢查），回報 commit 短碼、變更摘要、預計體驗變更、白話驗收步驟；資料庫 migration 由代理直接 `supabase db push`。
