狀態：實作中（2026-08-29 第二輪審核修正 follow-up；尚未核准 merge）

# Auth 全畫面載入卡死事故修正計畫（2026-08）

## 0. 執行環境與隔離

| 項目 | 內容 |
|---|---|
| 緊急分支 | `fix/auth-loading-deadlock` |
| worktree | `C:\Homemade Apps\1UP-TMS-auth-loading-20260829` |
| 基準 | `main` @ `5d552be2` |
| PR title | `fix(auth): prevent LMS/CAT infinite loading on session restore` |

### P0-A 隔離（勿動）

| 項目 | 內容 |
|---|---|
| 分支 | `feat/p0a-security-20260828` |
| worktree | `C:\Homemade Apps\1UP-TMS-p0a-20260828` |
| 基準 | `main` @ `5d552be2` |
| 狀態 | 大量未提交程式 + 5 份未驗證 migration；**不可部署／不可套用正式 DB** |

2026-08-28 記錄之 P0-A `git status`／diff：

- 修改：`.gitignore`、`case-types.ts`、`types.ts`、`CaseDetailPage.tsx`、`CasesPage.tsx`、`case-store.ts`（+373／−160）
- 未追蹤：`scripts/p0a0-preflight.mjs`、case RPC／credential／snapshot 模組與測試、5 份 `20260828*_p0a_*.sql`
- **本 Auth 工項不得刪除、重設、stash、commit、push、部署或把上述內容帶入本分支。**

Auth 修正上線穩定後，才回到 P0-A：先 rebase 到更新後的 `main`，再處理隔離庫驗證與 P0-B。

---

## 1. 事故背景（production 已確認）

- Supabase（PostgreSQL／Auth／REST／Realtime）與 Vercel deployment 整體仍有正常回應。
- LMS 與 CAT 卻可能長時間停在**同一個全畫面 spinner**。
- CAT 與 LMS 共用 `AuthenticatedRoutes`（`src/App.tsx`），上游 Auth 初始化卡住時兩邊一起卡死。
- Production 實際安裝 `@supabase/supabase-js@2.99.3`（與本 repo `bun.lock` 解析一致；`package-lock.json` 現為 `2.99.2`；`package.json` 為 `^2.98.0`）。

### 根因假設（已用現行程式核對，證據大致相符）

1. **`auth-ready.ts` 無界等待**  
   `resolveInitialSession()` 直接 `await supabase.auth.getSession()`，**無 timeout**。  
   `initialize()` 把結果快取為 `initPromise`；若 `getSession` 永不 resolve，`waitForAuthReady()`／`subscribeAuthReady()` 永久 pending。

2. **兩條可重疊的 Auth lock 競態**  
   - `auth-ready.ts` 先註冊 `onAuthStateChange`、隨即呼叫 `getSession()`；舊版 SDK 在自身初始化與近到期 token refresh 尚未完成時註冊 listener，可能卡在 `_emitInitialSession`／`pendingInLock`。  
   - callback 本身又是 `async`，在 `!session?.user` 時再次 `await supabase.auth.getSession()`；舊版 callback 處理期間重入 Auth API 亦可能形成死鎖。  
   本案 `2.99.3` 位於舊的 `navigator.locks` 預設路徑。官方在 `2.107.0` 才將預設協調改為 lockless；`2.112.4` 是包含後續 Auth lock／refresh 錯誤處理修補的本工項核准目標。升版不能取代應用端 bounded recovery，兩層都要做。

3. **永久 pending → UI 永久 spinner**  
   `useAuth` 初始 `loading` 在「未 ready」或「已有 user」時為 `true`；  
   僅在 `waitForAuthReady` resolve／reject 或 roles fetch 結束後才 `setLoading(false)`。  
   `App.tsx` `AuthenticatedRoutes`：`if (loading) return <全畫面 Loader2 />`——**無逾時恢復 UI**。  
   `/cases` 與 `/cat/team` 皆在此守衛之下。

4. **`initialized = true` 後無法真正 retry**  
   一旦進入 `initialize()`，`initialized` 永不重置；timeout／失敗後若留下 pending `initPromise`，重試無法啟動新一輪。

### 已核對、不推翻方向的補充

| 位置 | 現況 | 影響 |
|---|---|---|
| `use-auth.ts` | `fetchRoles` 外層雖有 12s timeout，但底層查詢不會被取消；`fetchProfile`／`fetchRoles` 會直接寫 state；每個 `useAuth()` 實例各自查一次 | **必修競態**：舊 user 的晚到結果可能覆寫新 user／SIGNED_OUT 後狀態；多 consumer 會重複查詢 |
| `use-permissions.ts` | `fetchConfig` 有 try／finally，但查詢本身沒有 timeout | **必修次要永久 loading**：Promise 永不 settle 時 `finally` 不會執行；受保護路由的 `permLoading` 可永久轉圈 |
| `case-store` 等 | `TOKEN_REFRESHED` 已跳過全量 reload；同 user 重複 `INITIAL_SESSION` 有短路 | 宜保留，勿回退 |
| `supabase-access-token.ts` | `refreshSession` + `getSession` | 非全站 loading 路徑；實作時避免在 Auth event callback 內呼叫 |
| 多 store `onAuthStateChange` | 同步 handler、不在 callback 內 await getSession | 低風險；仍需避免引入 async + refreshSession |

**結論：無推翻修正方向的重大矛盾；可依本計畫直接實作，不必再等產品決策。**

---

## 2. 禁止事項（強制）

本次**不得**：

- 修改資料庫 schema／建立或套用 migration／改 RLS／grant／view／trigger
- 建立付費 Supabase 隔離分支
- 重啟 Supabase 或升級 Compute
- 把 P0-A 修改帶入本分支
- 直接部署 production
- 用「把 timeout 調得很長」取代恢復設計
- 重新引入：TOKEN refresh 全量 reload、重複 full-list load、無限制並行 polling、anonymous CAT 大表掃描

---

## 3. 必要修正

### 3.1 Supabase JS 精確固定 `2.112.4`

官方證據：

- [v2.107.0](https://github.com/supabase/supabase-js/releases/tag/v2.107.0)／[PR #2392](https://github.com/supabase/supabase-js/pull/2392)：預設協調自此改為 lockless；未明確傳入 `auth.lock` 的 browser client 不再走 `navigator.locks` mutex
- [v2.112.4](https://github.com/supabase/supabase-js/releases/tag/v2.112.4)：後續 Auth stolen-lock、deprecated lock 與未處理 refresh rejection 修正；此為**本工項核准版本**，不是「Supabase 專為本專案核准」
- **殘餘危險仍在**：於 `TOKEN_REFRESHED` handler 內呼叫 `refreshSession`（或走 `_callRefreshToken`）仍可能死鎖——本專案修正後仍禁止此模式

作業：

1. `package.json`：`"@supabase/supabase-js": "2.112.4"`（**禁止** `^`／`~`）
2. 同步更新 `package-lock.json` 與 `bun.lock`；先確認各自對應的套件管理器指令，禁止手改 lockfile
3. 安裝後分別確認兩份 lockfile 與 `node_modules` 實際解析為 `2.112.4`；diff 不得夾帶無關的大規模依賴重排
4. build／Preview log 再確認一次
5. 若官方資料顯示此版本不適合：停止並提出證據與替代版本，**不可猜測**
6. 確認 `src/integrations/supabase/client.ts` 未傳入自訂 `auth.lock`；否則仍會走 deprecated legacy lock 路徑，必須停下釐清而非假設 lockless 已生效

### 3.2 Auth 初始化狀態機（`auth-ready.ts` 重構）

狀態至少：

| 狀態 | 意義 |
|---|---|
| `idle` | 尚未開始 |
| `initializing` | 進行中 |
| `authenticated` | 有有效 session／user |
| `anonymous` | 已確定無 session |
| `recoverable_error` | timeout／失敗；可 retry；**不是永久登出** |

要求：

- `getSession()` **bounded timeout（原則 10 秒）**
- timeout 後必須結束全畫面 loading，進入 `recoverable_error`
- timeout **不得**直接永久判定登出
- 保留 retry，以及後來由 `INITIAL_SESSION`／`SIGNED_IN`／`TOKEN_REFRESHED` 恢復
- 失敗／timeout 後**不可**留下永久 pending 的 `initPromise`
- retry 必須能啟動新一輪（重置 attempt／generation）
- generation／attempt ID：舊請求晚到不得覆蓋新狀態
- 多個 `useAuth` consumer 共用同一次初始化（單例 module 狀態）
- Auth event 若在 `getSession()` pending 期間先帶入有效 session，必須**立即完成該次初始化並解除 UI loading**，不可仍等到 10s timeout
- `waitForAuthReady()` 每次 attempt 都必須在 bounded time 內 settle；`recoverable_error` 不得被下游誤當成已確認 `anonymous`
- `getAuthenticatedSession()`／`getAuthenticatedUser()` 在 `recoverable_error` 時須採一致的 fail-closed 契約（建議丟出不含敏感內容的 typed recoverable error），不可默默回傳 null 假裝已登出；修改前先盤點並補齊呼叫端
- `Promise.race` timeout 不會取消底層 SDK Promise：必須消化 losing branch 的晚到 resolve／reject、清除 timer，並以 generation 忽略晚到結果，避免 unhandled rejection
- retry 僅由使用者明確觸發；同一時間只允許一個新 attempt，不得建立自動無限 retry loop
- Auth listener 全模組只安裝一次；retry／多 consumer 不得重複註冊。不得在 React hook cleanup 直接呼叫 `supabase.auth.dispose()`，以免清掉其他 store 的 listener／auto-refresh；若處理 HMR，只解除本模組自己持有的 subscription

建議 API 擴充（實作可微調命名，行為須符合上表）：

- `getAuthPhase()`／既有 snapshot 擴充 `phase`／`errorKind`／`attemptId`
- `retryAuthInitialization()`
- diagnostics hook（見 3.6）

### 3.3 Auth event 規則

- **callback 內禁止 await** 會再取 Auth lock／refresh 的 `getSession`／`getUser`／`refreshSession`（即使 2.112.4 預設 lockless，仍遵守官方殘餘危險與本專案防呆）
- callback 保持同步，只根據 event 與其帶入的 `session` 做最小狀態轉移；`SIGNED_OUT` 與 `INITIAL_SESSION + null` 才能確定為 `anonymous`
- 其他非 SIGNED_OUT event 若沒有 session，不可直接把既有 authenticated 狀態降成 anonymous；如確需重讀，只能在 callback 返回後排程一個 single-flight、bounded recovery attempt
- `INITIAL_SESSION`／`SIGNED_IN`／`TOKEN_REFRESHED` 可讓 `recoverable_error` 恢復為 authenticated
- `TOKEN_REFRESHED`：**不得**讓全站回到 loading；不得觸發不必要全量資料重載（維持 case-store 等現有短路）
- 同一 user 重複 `INITIAL_SESSION`：不得重複 profile／role load（`useAuth` 已以 `userId` 依賴；確保 snapshot 更新不重置 userId）
- `SIGNED_OUT`：清除 session、使用者狀態、stale initialization
- 檢查：dev switch user、sign out、visibility change、多分頁、browser wake

### 3.4 `useAuth` 身分／角色一致性（強制）

- profile／roles 載入結果必須先回傳資料，再由目前有效的 `userId + identityGeneration` 檢查後寫入 state；查詢函式本身不得無條件 `setProfile`／`setRoles`
- user A → user B、SIGNED_OUT、dev switch user 或 retry 時，舊 user 的晚到 profile／roles 結果一律丟棄；不得短暫保留 A 的管理員角色給 B
- 切換 user 或 SIGNED_OUT 時同步清除舊 profile／roles／test flag，再載入新資料
- 多個 `useAuth()` consumer 對同一 `userId` 的 profile／roles 載入必須共用 single-flight／共享快取，或改由單一 Auth Provider 提供；不得每個 hook 各查一次
- `TOKEN_REFRESHED` 且 userId 未變時不得重載 profile／roles
- roles 與 profile 查詢都要有 bounded timeout／錯誤狀態；即使底層請求無法 abort，晚到結果仍須由 generation 擋掉
- 將「Auth session 初始化」與「profile／roles 載入」的 loading／error 明確分離，避免 `recoverable_error` 因 `user === null` 被導向登入頁，也避免角色載入錯誤冒充 Auth timeout

### 3.5 UI fallback（`App.tsx`）

`AuthenticatedRoutes` 不可永久只顯示 spinner：

| 條件 | UI |
|---|---|
| 短時間 `initializing` | 現有全畫面 spinner |
| 超過合理時間／`recoverable_error` | 既有產品元件（Alert／Button 等）恢復畫面 |
| 文案 | 「登入狀態載入逾時，請重試。」 |
| 動作 | 「重試」；適當情況「重新登入」 |

- 不使用瀏覽器原生 `alert`／`confirm`／tooltip
- LMS（`/cases`）與 CAT（`/cat/team` 等）皆受此 fallback 保護
- 判斷順序固定為：`initializing` → spinner；`recoverable_error` → 恢復畫面；`anonymous` → `AuthPage`；`authenticated` 才進入身分／角色與應用路由流程
- spinner、恢復畫面、重試與重新登入按鈕加入穩定 `data-testid`，測試不得依賴 Lucide class 或動畫樣式判斷
- 重試按鈕進行中停用，防止連點建立多個 attempt；「重新登入」所需的 sign-out／清理流程本身也必須 bounded，不可換成另一個永久 loading

### 3.6 可觀測性（無敏感資料）

記錄（console 或輕量 diagnostics，**不含** token／Authorization／完整 session JSON）：

- initialize start
- getSession start／success／timeout
- Auth event 類型
- initialization failed／recovered
- elapsed ms
- `document.visibilityState`

採固定前綴與可列舉 event 名稱；error 只記錄經清理的 name／message，不序列化 Supabase response、session 或任意未知 error object。重複事件須節流，避免 production console flood。

### 3.7 其他等待點

- `use-permissions`：**強制**為 `permission_settings` 查詢加入 bounded timeout 與 `ready/error` 狀態；單靠 finally 無法處理 pending Promise
- 權限查詢 timeout／失敗時，受保護路由必須 fail closed 並顯示可重試的既有產品錯誤介面，不得用空 `DEFAULT_CONFIG` 當成成功載入後繼續放行；未受該守衛的 `/cases`、`/cat/*` 不因此被整站封鎖
- 全面 grep：`onAuthStateChange` 內不得新增 await getSession／getUser／refreshSession
- 不擴大 anonymous CAT 讀取面

---

## 4. 測試計畫

### 4.1 單元／整合（至少）

1. `getSession()` 永不 resolve → 固定時間內退出 loading／進入 `recoverable_error`
2. timeout 後收到有效 session event → 恢復 `authenticated`
3. `TOKEN_REFRESHED` → 不回到全畫面 loading
4. 同一 user 重複 `INITIAL_SESSION` → 不重複 profile／role load
5. 多個 `useAuth` consumer → 共用初始化（單次 getSession attempt）
6. sign out → `anonymous`；不保留 stale Promise
7. initialization failure 後 retry 成功
8. 舊 attempt 晚到 → 不覆蓋新狀態
9. `getSession()` pending 時有效 Auth event 先到 → 立即 authenticated，不等待 timeout；舊 Promise 晚到亦不覆蓋
10. 多 consumer／多次 retry → Auth listener 只註冊一次、同一 user 的 profile／roles 只 single-flight 一次
11. user A 的 profile／roles 晚於 user B 或 SIGNED_OUT 才回來 → 不得覆寫 B／匿名狀態，尤其不得殘留 A 的 PM／Executive 角色
12. timeout losing branch 晚到 reject → 無 unhandled rejection、timer 已清除
13. `permission_settings` 永不 resolve → bounded time 內退出 route spinner、受保護路由 fail closed 並可重試
14. `recoverable_error` 不會被當成 anonymous 而自動顯示登入頁

建議檔案：`src/lib/auth-ready.test.ts`（及必要時 `use-auth` 相關測試）。

### 4.2 E2E（Playwright，測試模式）

至少涵蓋：

- 正常登入及 `/cases`
- F5 `/cases`
- `/cases` 與 `/cat/team` 互相切換
- token refresh
- 背景分頁回前景
- 同時開兩個分頁並關閉其中一個
- session refresh 時 reload
- Auth request 人工 delay／pending
- persisted session 接近到期時 reload（或等價可控制情境），驗證 listener 註冊／INITIAL_SESSION／refresh 競態不再造成永久 loading

**固定秒數 assertion**：頁面必須退出全螢幕 Auth loading state（例如在 N 秒內不再存在全螢幕 spinner／出現恢復 UI 或案件內容）。

- Playwright 一律使用 test 環境與真實測試帳號，先斷言實際生效身分；不得污染 production 資料
- 等待一律依 `data-testid`／狀態事件等確定訊號，不使用固定 sleep
- 人工 pending 若用測試注入，必須只存在於 test build／dependency injection，不得在 production 暴露可操控 Supabase client、token 或 session 的全域後門
- 自動化通過後，依 repo 規則再做一次真人或 AI 瀏覽器體感抽查，確認 spinner → 恢復畫面 → retry 的可理解性與焦點操作

### 4.3 品質閘門（依序）

1. `npm run typecheck`
2. `npm run typecheck:e2e`
3. Auth unit／integration tests
4. `npm run test`（完整）
5. `npm run lint`
6. `npm run check:encoding`
7. `npm run check:forbidden-casts`
8. `npm run build`（確認依賴解析 `2.112.4`）
9. Auth E2E

全部指令分開執行並保留結果；`npm run build` 會觸發 `prebuild -> sync:cat`，build 後必須再次檢查 git diff，若產生與本工項無關的 CAT 鏡像差異不得提交。

---

## 5. 交付與部署限制

全部通過後：

1. 檢查 diff：**不得**混入 P0-A migration 或案件 ACL 修改
2. 建立候選 commit
3. 推送 feature branch 並建立 Vercel Preview
4. 確認 build log 實際使用 `@supabase/supabase-js@2.112.4`
5. 在 Preview 驗證 LMS、CAT、Auth、Realtime 及逾時恢復
6. 回報：root cause、修改內容、測試結果、剩餘風險、Preview URL
7. **未經明確批准不得 merge 或部署 production**
8. 本案無 DB 變更，回滾方式為 revert 本 PR；不得以修改 DB、清除正式使用者 session 或降級基礎設施充當回滾

---

## 6. 實作順序（建議）

1. 先新增能重現現行無界等待、event-first 與 stale identity race 的紅燈測試
2. 鎖定 `@supabase/supabase-js@2.112.4` 並更新雙 lockfile，確認無 custom `auth.lock`
3. 重構 `auth-ready.ts`（狀態機、timeout、event-first settle、generation、retry、單一 subscription、diagnostics）
4. 調整 `use-auth.ts`（共享 identity single-flight、stale result guard、分離 loading／error、retry 暴露）
5. 修正 `use-permissions.ts` bounded timeout／fail-closed recovery
6. `App.tsx` 恢復畫面與穩定測試標記
7. 清查並修正其他 `onAuthStateChange` 危險模式（若有）
8. 單元測試 → 全測 → lint／encoding／casts → build → E2E → 瀏覽器體感抽查
9. diff 自查 → commit → push Preview → 回報

---

## 7. 剩餘風險（預先標註）

- 升級後 Realtime／generated types／Edge Function client 行為差異：以 Preview 與現有測試把關
- `TOKEN_REFRESHED` 內呼叫 `refreshSession` 仍為官方殘餘危險：程式碼審查必須擋
- 10s timeout 後使用者短暫進入恢復畫面；若網路極慢可能誤報，但優於永久卡死
- production 根因若另有 CDN／瀏覽器擴充／Service Worker 干擾，本修正仍應消除「永久 pending」類失敗模式
- P0-A 未完成；本工項上線後須另排 P0-A rebase 與隔離驗證

---

## 8. 變更紀錄

| 日期 | 說明 |
|---|---|
| 2026-08-28 | 建立計畫；P0-A 隔離紀錄；call chain 與官方 2.112.4 證據核對通過，核准直接實作 |
| 2026-08-28 | 嚴格審核修訂：校正 lockless 自 2.107.0 起之官方證據；新增 event-first settle、單一 listener、stale profile／roles 權限競態、multi-consumer single-flight、permission pending fail-closed、typed recoverable contract 與測試／回滾要求 |
| 2026-08-28 | 實作落地：`auth-ready` 狀態機＋timeout／event-first；`auth-identity` single-flight；`use-permissions` bounded fetch；`App.tsx` 恢復畫面；鎖定 `@supabase/supabase-js@2.112.4`；單元測試紅轉綠 |
| 2026-08-29 | 第二輪審核阻擋：`getSession` result.error、flight settled 清除、activeUserId guard、permissions fail-closed、signOut epoch／timer、E2E 注入與 W10 調查；詳見 §9 |

---

## 9. 第二輪審核修正（2026-08-29）

### 9.1 新發現（合併阻擋）

1. `getSession()` resolved `error` 被當成 anonymous
2. identity single-flight settled 後未清除 → `refetchProfile` 重用舊結果；錯誤角色被永久快取
3. `isIdentityResultCurrent` 未真正比對 activeUserId
4. `canViewField`／`canEditField`／`canViewSection` 在 `!ready`／`error` 時仍可能 fail-open
5. signOut timer 未清、晚到 Promise 可覆寫新登入
6. Auth E2E 過寬（登入頁或案件頁任一即可）；缺人工 pending／recovery／retry
7. PR Playwright：`w10-fees-visible-pm` W10-PM-4 失敗（需基準比較，不可只標「非本工項」）

### 9.2 實際程式修正

| 檔案 | 修正 |
|---|---|
| `auth-ready.ts` | result.error → recoverable_error；attempt 先於 listener；event-first 立即清 timer；DEV `__authReadyTest` |
| `auth-identity.ts` | flight finally 清除；force refresh；activeUserId；錯誤不快取 |
| `use-auth.ts` | identityError／retryIdentity；signOut epoch＋timer；rolesTrusted |
| `use-permissions.ts` | view／edit／section 在 !ready／error 全 false |
| `App.tsx` | 身分可恢復畫面；安裝 test hooks（僅 DEV） |
| `fee-store.ts` | load 時消化 AuthRecoverableError |
| E2E | 強制已登入斷言；人工 pending→recovery→retry；TOKEN_REFRESHED／多分頁等受控注入 |
| W10 spec | list poll 後再 get；timeout 拉長 |

### 9.3 本輪已執行／宣稱範圍（不得超報）

- **已補單元／hook 測試**：auth-ready（error／同步 INITIAL_SESSION／timer）、auth-identity（force／A→B／錯誤不快取）、use-auth（多 consumer／signOut 競態）、use-permissions hook（fail-closed＋retry）— 本機 vitest 綠燈
- **Auth E2E（本機 `npm run dev`）**：9/9 通過，含人工 pending（sessionStorage + 跳過 event-first）→ recovery → retry；TOKEN_REFRESHED／多分頁／背景／reload 受控注入
- **W10／PR Playwright**：`main@5d552be2` 夜間 E2E **W10-PM-4 通過**；本分支 CI 兩次皆敗於 reload 後 `fee.get`（讀記憶體、Auth 變慢時 store 未載入）。已改 `fee.get` → `await ensureFeesLoaded()`，並將 W10 斷言改回「僅 reload＋get」路徑；**待下一輪 CI 驗證**。本機兩次仍因 `probeCanCreateCase` skip，無法重現寫入路徑。
- **P2-L7**：同一次 CI 亦失敗；尚未認定與 Auth 無關，下一輪 CI 一併觀察。

### 9.4 未宣稱已驗證

- production 部署（禁止）
- merge 後正式站體感（禁止至核准）
- `typecheck:e2e` 三項既有錯誤（與 main 相同，本工項不修）
- W10-PM-4 在本機可寫環境之完整綠燈（本機帳號 skip；待 CI）
