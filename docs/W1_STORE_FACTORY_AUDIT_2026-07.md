狀態：已落地待驗收

# W1 前置：五 store 盤點與遷移風險評估報告（2026-07）

本報告為 **W1（`createEntityStore` 工廠）開工前置**的純分析文件，**未變更任何 `src/stores` 生產程式碼**。背景與工項編號見 [`ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md`](ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md) §5（W1／W4 表）、§15（`cat-cloud-rpc.ts` 297 處 `any`）。

盤點範圍：`src/stores/case-store.ts`（918 行）、`fee-store.ts`（474 行）、`invoice-store.ts`（344 行，譯者稿費請款）、`client-invoice-store.ts`（427 行，客戶請款）、`internal-notes-store.ts`（293 行），以及對應的 `src/hooks/use-*-store.ts` 讀取層 hook（`internal-notes-store.ts` 例外，hook 內嵌於 store 本體）。

---

## 1. 行為漂移差異表

### 1.1 總表（載入／寫入／realtime／輪詢／錯誤處理／樂觀更新）

| 維度 | case-store | fee-store | invoice-store（譯者稿費） | client-invoice-store（客戶請款） | internal-notes-store |
|---|---|---|---|---|---|
| **載入來源** | `cases` 原表 `select("*")` | **`fees_visible` 遮罩 view**（W10） | `invoices` 原表 `select("*")` + 另一次查 `invoice_fees` 組 `feeIds` | `client_invoices` 原表 `select("*")` + 另一次查 `client_invoice_fees` 組 `feeIds` | `internal_notes` 原表 `select("*")` |
| **併發載入去重** | 有：`loadPromise` 快取進行中請求，重入呼叫直接回傳同一 promise | 無此機制，但有 `loadSeq` 只棄用結果 | 無 `loadSeq`／`loadPromise`，每次呼叫都真的打 DB | 無 `loadSeq`／`loadPromise`，每次呼叫都真的打 DB | 有 `loadSeq`（棄用過期結果），但**無**進行中請求去重（見 1.3-e） |
| **過期結果防護** | `loadVersion` 計數器，過期回應整批丟棄 | `loadSeq` 計數器，過期回應丟棄 | 無：若併發呼叫，後到的網路回應可能覆寫先到的（無版本比對） | 無：同上 | `loadSeq` 計數器，過期回應丟棄 |
| **單頁快取合併策略** | `mergeIncomingCase`：比較 `updatedAt` 時間戳，**較舊快照不得覆寫較新本地資料**；另防呆保留非空 `tools`／`questionTools`（避免舊格式或延遲回應把陣列清空） | 無合併策略，整批覆寫（`fees = data.map(dbToApp)`） | 無合併策略，整批覆寫 | 無合併策略，整批覆寫 | 無合併策略，整批覆寫 |
| **單筆快速讀取** | 有：`loadCaseIfMissing(id)`（詳情頁優先路徑，避免等全表） | 無 | 無 | 無 | 無 |
| **建立（create）寫入方式** | `await insert().select().single()`，成功才 unshift 進本地（失敗不留髒資料） | `createDraft()`／`addFee()`：**先樂觀 unshift，才** `persistInsert()`（`.then()` **fire-and-forget**，呼叫端拿不到結果） | `await insert()`，樂觀 unshift **在 await 之前**，失敗會 `filter` 撤銷（有 rollback） | `await insert()`，同左（有 rollback） | `await insert()`，樂觀 unshift 在前，**失敗只 `console.error`，不撤銷本地列**（無 rollback） |
| **更新（update）寫入方式** | 樂觀更新＋`pendingUpdates`／`inFlightCount` 精密追蹤（見下）；`await update()`；失敗**整批 reload** 復原 | `updateFee()`：樂觀更新後 fire-and-forget `.then()`，**回傳值為 `void`**，呼叫端無法得知成功或失敗 | `updateInvoice()`：**與 fee-store 同款 fire-and-forget**，回傳 `void` | `updateInvoice()`（**本輪已修**，`a6422f02`）：`await update().select().maybeSingle()`，回傳 `{ error }`；`!data`（RLS 靜默擋下 0 筆受影響）視為失敗；成功以權威列回填本地，非以樂觀值為準 | `update()`：`await update()`，回傳 `void`（呼叫端看不到 `{ error }`，也不核對回傳列） |
| **刪除（remove/delete）寫入方式** | `await delete()`，成功才從本地移除（無 rollback 需求，因為本地變更晚於確認） | `deleteFee()`：樂觀先移除，fire-and-forget delete，失敗只 log，**本地已被移除卻資料庫仍在** | `deleteInvoice()`：樂觀先移除，fire-and-forget，同左（無 rollback） | `deleteInvoice()`（**本輪已修**）：`await delete().select()`，`data.length===0` 視為失敗並回傳 `{ error }`（呼叫端可判斷；但目前實作**未做本地復原** unshift 回去，只回報錯誤——與 update 的「復原」不對稱，詳見 §6 風險） | `remove()`／`removeMany()`：樂觀先移除，fire-and-forget，失敗只 log，無 rollback |
| **關聯表寫入（fee 掛載 invoice 等）** | 不適用（case 無此類 join 表） | 不適用 | `addFeesToInvoice`／`removeFeeFromInvoice`：`await insert/delete`，樂觀先行，**失敗只 log，無 rollback**（fee-store 型態） | `addFeesToInvoice`／`removeFeeFromInvoice`（**本輪已修**）：`await insert/delete`，失敗**會**撤銷樂觀本地狀態（`.filter` 復原） | 不適用 |
| **realtime 訂閱範圍** | `cases` 表 INSERT/UPDATE/DELETE，逐列精細合併 | `fees` 表，**非 DELETE 事件一律不信任 `payload.new`**，改對每個異動 id **重查 `fees_visible` view**（`requeryFeeFromView`，W10 強制要求，因 `payload.new` 是未遮罩原表全欄位，會把營收/內部備註洩漏給非管理員的 realtime 訂閱者） | `invoices`／`invoice_fees` 兩表，**任何事件皆觸發全表 `loadInvoices()`重載**（無逐列合併、無 payload 精細處理） | `client_invoices`／`client_invoice_fees` 兩表，**同左：任何事件皆全表重載** | `internal_notes` 表，逐列精細合併（INSERT/UPDATE/DELETE），**直接信任 `payload.new`**（無遮罩需求；**內部註記模組全員可見可編**，與 §9.2／工項 E 定稿及 Permissions 預設已對齊） |
| **realtime 與樂觀寫入的競態保護** | **有**：`pendingUpdates` Map 記錄「本地正在寫入中的欄位」，realtime UPDATE 事件命中該 id 時整包跳過（`if (pendingUpdates.has(row.id)) return`），寫入成功後仍保留 2 秒寬限（`PENDING_CLEANUP_DELAY_MS`）防 replica 延遲 | **無**：realtime 重查與樂觀本地值之間無協調，一旦 `requeryFeeFromView` 的回應在本地樂觀值「之後」但資料庫「尚未真正落地新值之前」抵達，會用舊值覆寫剛才的樂觀樂觀更新（addFees fixture debug 實測到的競態即此類） | **無** | **無**（本輪 bridge debug 實測到的「`verified:false` 假陰性」根因即此：`addFees` 剛更新完 `feeIds`，背景全表 `loadInvoices()` 可能用「稍舊」的 SELECT 結果覆寫剛更新的本地值） | **無** |
| **輪詢回補（W3 `createPollFallback`）** | 有，15s，`onChanged` → `loadPromise=null; load()` | 有，15s，`onChanged` → `feeStore.loadFees()` | 有，15s，`onChanged` → `invoiceStore.loadInvoices()` | 有，15s，`onChanged` → `clientInvoiceStore.loadInvoices()` | 有，15s，`onChanged` → `internalNotesStore.load()`（若 `loaded`） |
| **輪詢與 realtime 的關係** | 兩者觸發相同的 `load()` 路徑，poll 只在 realtime 漏事件時補跑（`updated_at` 比對） | 同左，但 poll 直接整表 `loadFees()`，**不像 realtime 一樣逐 id 走遮罩重查**——poll 觸發的整表重載本身走 `fees_visible`（安全），差異僅在「整表 vs 單列」的效能路徑，非安全漏洞 | 同左 | 同左 | 同左 |
| **`subscribe()` 啟停輪詢的耦合方式** | 額外包一層 `subscribePoll`（`_origSubscribe` 包裝，監聽數為 1 時 `casePoll.start()`） | 直接內嵌在 `feeStore.subscribe` 內 `if (listeners.size===1) feePoll.start()` | 同 fee-store 內嵌寫法 | 同 fee-store 內嵌寫法 | 同 fee-store 內嵌寫法（case-store 是唯一用「包裝既有函式」而非「內嵌」寫法的，行為等價但程式碼結構不同，工廠化時需統一） |
| **auth 生命週期監聽** | **僅一處**：store 本體內 `supabase.auth.onAuthStateChange`，並用 `currentUserId` 比對避免 `INITIAL_SESSION` 重複觸發重載；`TOKEN_REFRESHED` 只清 `loadPromise` 不清資料（避免整頁閃爍） | **兩處**：store 本體一處（`TOKEN_REFRESHED` 背景重載、其餘事件清空並 `loaded=false`）＋`use-fee-store.ts` hook 檔**另一個獨立監聽器**（`SIGNED_IN`/`INITIAL_SESSION` 時延遲 100ms 呼叫 `loadFees()`，`SIGNED_OUT` 只清 `loadPromise` **不**清空資料——與 store 本體行為不一致：hook 上的 `SIGNED_OUT` 分支未讓資料清空，實際清空靠 store 本體那一份） | **兩處**：同 fee-store 型態，`use-invoice-store.ts` 額外監聽器邏輯與 fee 版**不完全相同**（無 100ms 延遲、`SIGNED_OUT` 也觸發 reload 而非只清 promise） | **兩處**：同上，`use-client-invoice-store.ts` 邏輯與 invoice 版幾乎相同（無延遲、`SIGNED_OUT` 觸發 reload） | **一處**：store 本體內建（`useInternalNotes()` hook 也在同檔案，未額外掛監聽器） |
| **載入呼叫去重（hook 層）** | `useCases()` 直接呼叫 `caseStore.load()`（store 本體 `loadPromise` 已去重，安全） | `useFees()` 透過 hook 內 `ensureLoaded()`（自己的 `loadPromise` 變數）去重 | 同 fee-store 型態（hook 自帶 `ensureLoaded()`） | 同上 | **無 hook 去重層**：`InternalNotesPage.tsx`、`CaseDetailPage.tsx` 各自在 `useEffect` 直接呼叫 `internalNotesStore.load()`，因 store 本體 `load()` 無 `loadPromise` 快取（只有 `loadSeq` 棄用機制），**兩處同時掛載時會各打一次 DB**（過期回應被丟棄不會出錯，但有重複請求成本） |
| **權限模型** | 一般認證使用者皆可讀寫（RLS 依角色） | **W10**：讀走遮罩 view＋列級 RLS（譯者只見本人非草稿列，敏感欄位清空）；寫僅 `is_admin`（PM／執行長），譯者寫入請求會被 RLS 拒絕（`fees_insert`／`update`／`delete` policy） | PM+ 寫入，讀取依 RLS（W10 收緊後譯者只見本人） | PM+ 寫入（bridge 已驗證譯者呼叫遭拒），讀取依 RLS | 一般認證使用者皆可讀寫 |
| **跨 store 耦合** | **高**：`duplicate()` 直接呼叫 `feeStore.updateFee`、`invoiceStore.updateInvoice`、`clientInvoiceStore.updateInvoice`（案件複製時級聯改標題），`update()` 內另呼叫 `sync_cat_file_assignments_for_case`／`syncCatWorkflowAssignmentsForCase` RPC | 低（被 case-store 呼叫，自己不呼叫他人） | 低 | 低 | 低 |
| **自動化測試覆蓋** | Playwright：`case-copy-title-refresh.spec.ts`、`ai-bridge-phase2.spec.ts`（P2-L4）；無 vitest 純函式測試 | Playwright：`ai-bridge-phase2.spec.ts`（P2-L8）、`w10-fees-visible-*.spec.ts`（W10-T-1/2/3、W10-PM-1~4）；無 vitest | Playwright：`ai-bridge-phase2.spec.ts`（P2-L6）；無 vitest | Playwright：`lms-client-invoice-bridge.spec.ts`（本輪新增最完整，含 addFees fixture）、`ai-bridge-phase2.spec.ts`（P2-L7）；無 vitest | **無任何 Playwright spec**、無 vitest（五 store 中覆蓋最薄弱） |

### 1.2 已知實證逐項對應（依指派需求 a–e）

- **(a) case-store 有 optimistic in-flight 保護，其餘四個沒有**：見上表「realtime 與樂觀寫入的競態保護」列。機制細節：`pendingUpdates: Map<id, Partial<CaseRecord>>` 記錄尚未確認落地的欄位、`inFlightCount: Map<id, number>` 讓並發多次寫入不會被前一次寫入的清理計時器提前清掉、`pendingCleanupTimers`（2 秒寬限）防讀取副本延遲（read replica lag）在寫入成功「之後」仍短暫回吐舊值。這一整套是四個「次等」store 完全沒有的基礎設施。

- **(b) `feeStore.createDraft()` INSERT fire-and-forget（addFees fixture 實證）**：`persistInsert()`（`fee-store.ts` 第 264–277 行）用 `.then()` 而非 `await`，`createDraft()`／`addFee()` 呼叫後立即回傳本地樂觀物件，資料庫寫入結果對呼叫端完全不可見。2026-07-07 client-invoice bridge 的 `addFees` Playwright fixture 建置時實測驗證：`agent.fee.create({})` 後立即 `page.reload()` 會把尚未送達伺服器的 INSERT 直接砍斷（reload 取消進行中的 fetch），造成 `Failed to insert fee` 且 `page.reload()` 後該筆完全消失。解法是在測試端插入 `page.waitForLoadState("networkidle")` 等待，而非修正生產程式碼（本輪裁示不動 store）。此為**驗證方法論**（測試端補償）掩蓋**生產程式碼缺陷**（無法讓呼叫端得知寫入結果）的一個具體案例，是 W1 工廠必須解決的頭號行為缺口。

- **(c) client-invoice-store realtime 整表重載、無進行中寫入保護**：`client-invoices-realtime` channel（`client-invoice-store.ts` 第 122–134 行）對 `client_invoices`／`client_invoice_fees` 兩表任何事件皆呼叫 `clientInvoiceStore.loadInvoices()`（整表 SELECT，非逐列合併）。同一輪 debug 實測到兩種具體症狀：
  1. 自我修復（self-healing）流程中 `removeFeeFromInvoice`（DELETE）觸發的背景 `loadInvoices()`，若與後續 `createInvoice`（INSERT）的樂觀本地新增「時間上重疊」，重載的 SELECT 若在 INSERT 真正落地前完成，會把剛建立的請款單從本地「蓋掉」，造成 `找不到客戶請款 id=...`。
  2. `addFeesToInvoice` 回傳 `added` 陣列正確、`verified` 卻可能為 `false`：因為呼叫端讀「本地 store 目前狀態」核對 `feeIds`，若這一刻背景 `loadInvoices()` 剛好用「稍早（尚未含新 fee link）的 SELECT 快照」覆寫了本地剛更新的 `feeIds`，核對就會失敗——即使資料庫其實已經正確持久化。
  最終驗收改用「reload 頁面＋`clientInvoice.get()` 讀權威狀態」作為 ground truth，繞過此競態，但**生產程式碼本身仍缺乏 case-store 那種 `pendingUpdates` 保護**。

- **(d) client-invoice 寫入層已改真 await＋權威列（`a6422f02`）——工廠設計以此為基準模式推廣**：`updateInvoice`／`deleteInvoice`／`addFeesToInvoice`／`removeFeeFromInvoice` 四方法（2026-07-06～07 clientInvoice bridge 退回修正批）改為：① 真正 `await` DB 寫入；② `update`／`delete` 用 `.select()` 拿回「權威列」（authoritative row）取代盲目相信「無 error＝成功」；③ 明確偵測「RLS 靜默擋下」情境（`error===null` 但 `data` 為空／`0` 筆），視為失敗並回傳具體錯誤訊息；④ 回傳 `{ error: unknown }` 讓呼叫端可判斷，不再是 `void`。此模式已在真實環境（分支預覽站、譯者假人）驗證可行，**建議做為 `createEntityStore` 工廠 `update`／`remove` 方法的預設實作基準**，而非四個 store 各自維持現況（`fee`／`invoice`／`internal-notes` 三者的對應方法仍是本節 1.1 表列的舊行為，尚未追上）。

- **(e) e2e 接入時發現的測試層問題，涉及 store 行為者登錄**：依 §20（`docs/ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md`）與 W10 §9.7 兩處紀錄，與 store 行為直接相關的有：
  1. **`agent.fee.create` 內部 `createDraft(insert)` ＋ `updateFee(update)` 對同一 id 的 fire-and-forget 競速**（W10-PM-4 spec 修正紀錄）：`title` 欄位可能因為 INSERT 與 UPDATE 兩個獨立的 fire-and-forget 網路請求「送達順序不保證」而未落地（UPDATE 先於 INSERT 抵達伺服器，或 UPDATE 完全遺失）。該 spec 最終改為斷言「該筆經 `fees_visible` 讀得回」（僅驗證 id 可見，迴避 title 競態），**是本項 (b) 的另一次獨立實證**，非新問題。
  2. `tests/ai-bridge-phase2.spec.ts` P2-L7 讀錯 `clientInvoice.create` 回傳巢狀路徑（`data.invoice.id` 誤讀為 `data.id`）——**屬測試撰寫錯誤，非 store 行為問題**，已修正，僅供對照排除。
  3. e2e 接入過程未發現 `case-store`／`internal-notes-store` 的新行為性 bug；`internal-notes-store` 因**完全無 Playwright 覆蓋**，此次 e2e 擴充也未觸及，其行為缺口（見 1.1 表最後一列）目前僅靠本次程式碼審閱發現，尚無自動化證據，遷移時須優先補測試而非直接信任「目前沒出過事」。

### 1.3 本次審閱新發現（未列於既有實證，供風險清單引用）

- **(f) `updateInvoice`／`deleteInvoice`／`addFeesToInvoice`／`removeFeeFromInvoice` 在 `invoice-store.ts`（譯者稿費）仍是 client-invoice-store 修復前的舊行為**：四方法皆 fire-and-forget 或無回傳值，與 clientInvoice bridge 退回修正前的症狀**完全同型**。目前沒有 `__lmsAgent.invoice.*` bridge 方法直接呼叫這些寫入路徑做讀寫驗證（現有 bridge 僅 `invoice.create`／`get`，見 `ai-agent-bridge.ts`），因此尚未被「回讀驗證」的使用情境踩到、未爆出過同款 bug，但**風險已客觀存在**，一旦日後有人比照 clientInvoice 模式擴充 `invoice.update`／`invoice.addFees` bridge 方法，會立刻重演相同的假陰性／重複寫入風險。
- **(g) `internal-notes-store` 的 `update()` 不核對回傳結果、不做 rollback**：`update()`（第 208–218 行）樂觀更新後 `await` DB update 但完全不檢查 `error`，永遠回傳 `undefined`（函式簽名是 `Promise<void>`），呼叫端無從得知寫入是否成功；`remove()`／`removeMany()`（第 220–242 行）連 `await` 都沒有（`.then()` fire-and-forget）。是五個 store 中**寫入可靠性最弱**的一個，卻同時是**測試覆蓋最薄弱**的一個（1.1 表已列），兩者疊加使其成為遷移風險評估中「未知風險最高」的 store（見 §6）。
- **(h) hook 層 auth 監聽器重複／不一致（fee／invoice／client-invoice 三者兩兩不同）**：`use-fee-store.ts`、`use-invoice-store.ts`、`use-client-invoice-store.ts` 三個 hook 各自在檔案頂層另掛一個 `supabase.auth.onAuthStateChange` 監聽器，與 store 本體內建的監聽器**同時存在、各自觸發重載**，三者對 `SIGNED_OUT` 事件的處理方式還兩兩不同（fee 版只清 promise、invoice／client-invoice 版會觸發 reload）。目前未觀察到具體 bug（多次 reload 是冪等操作，只是效能浪費與程式碼可讀性問題），但工廠化時應**收斂為單一生命週期擁有者**，避免遷移時遺漏其中一份監聽邏輯導致行為倒退。
- **(i) hook 檔案存在與否不一致**：`case`／`fee`／`invoice`／`client-invoice` 四者在 `src/hooks/use-<entity>-store.ts` 各自有獨立 hook 檔；`internal-notes-store` 的 `useInternalNotes()` 直接內嵌於 store 檔案本身（`internal-notes-store.ts` 第 290–292 行）。工廠介面設計時需決定「hook 是否為工廠標準輸出之一」，若是，需統一放置慣例。

---

## 2. `createEntityStore` 工廠介面草案

> 目前 `src/stores/entity-store-factory.ts` **尚不存在**（`architecture.mdc` 規則文字中提及的路徑為**目標檔案**，非現況）。以下為草案，供驗收方核可後再動工實作；本節不含任何程式碼變更。

### 2.1 設計原則

1. **以 client-invoice-store 修復後的寫入層為基準行為**（本節 1.2-d）：`create`／`update`／`remove` 一律真 `await`、`update`／`remove` 用 `.select()` 取權威列、明確偵測「RLS 靜默擋下」、回傳 `{ error: unknown }` 而非 `void`。
2. **in-flight 樂觀寫入保護（case-store 模式）內建為工廠通用能力**，而非只有 case 用戶特有——四個目前缺此保護的 store 遷移後自動獲得，不必個別重寫。
3. **特有行為以組態注入，不寫特例分支**：遮罩讀取來源（`fees_visible`）、realtime 重查來源（強制走 view 而非 `payload.new`）、跨表關聯（`invoice_fees`／`client_invoice_fees`）、單筆快速讀取（`loadCaseIfMissing`）皆為「可選組態」，工廠本體不得出現 `if (tableName === "fees") ...` 這類寫死判斷。
4. **auth 生命週期只有一個擁有者**：工廠內建監聽 `onAuthStateChange`，`use-<entity>-store.ts` 不再自行掛第二個監聽器（解決 1.3-h）。

### 2.2 泛型參數與組態物件（草案）

```ts
interface EntityStoreConfig<TApp, TDbRow, TDbInsert, TDbUpdate> {
  /** 供 log／debug 辨識用，例如 "case"、"fee" */
  entityName: string;

  /** 讀取來源表名／view 名（可與寫入表不同，對應 fee 的 fees_visible） */
  readSource: string;
  /** 寫入表名（一律走原表，不可為 view） */
  writeTable: string;

  /** DB row → app 型別；不合法欄位一律回退預設值，不丟例外 */
  fromDb: (row: TDbRow) => TApp;
  /** app 型別（partial）→ DB update payload；只放「有提供」的欄位 */
  toDbUpdate: (patch: Partial<TApp>) => TDbUpdate;
  /** app 型別（完整新建物件）→ DB insert payload */
  toDbInsert: (entity: TApp, ctx: { userId: string | null; env: string }) => TDbInsert;

  /** 主鍵欄位名，預設 "id" */
  idField?: string;
  /** 是否依環境（env）過濾，預設 true（本專案五 store 目前皆為 true） */
  scopeByEnv?: boolean;

  /**
   * realtime 事件的本地套用策略：
   * - "trust-payload"：直接信任 payload.new（internal-notes／case 模式，逐列精細合併）
   * - "requery-row"：忽略 payload.new，對該 id 重查 readSource（fee 模式，W10 遮罩安全要求）
   * - "reload-all"：任何事件觸發整表重載（invoice／client-invoice 現況，工廠化建議逐步淘汰為前兩者之一）
   */
  realtimeStrategy: "trust-payload" | "requery-row" | "reload-all";
  /** 額外訂閱的關聯表（例如 client_invoice_fees），事件觸發後一律走 realtimeStrategy 決定的整表/單列邏輯 */
  relatedTables?: string[];

  /** 合併進站資料與本地快取的策略；預設用時間戳比較（case-store mergeIncomingCase 模式），可覆寫 */
  mergeIncoming?: (current: TApp | undefined, incoming: TApp) => TApp;

  /** in-flight 樂觀寫入保護的寬限時間（毫秒），預設 2000（case-store PENDING_CLEANUP_DELAY_MS） */
  pendingCleanupDelayMs?: number;

  /** 輪詢間隔（毫秒），預設 15000 */
  pollIntervalMs?: number;

  /** 單筆快速讀取（case-store loadCaseIfMissing 模式）是否啟用 */
  supportLoadIfMissing?: boolean;
}

interface EntityStore<TApp> {
  // 讀取
  load: () => Promise<{ error: unknown }>;
  loadIfMissing?: (id: string) => Promise<TApp | undefined>;
  getAll: () => TApp[];
  getById: (id: string) => TApp | undefined;
  isLoaded: () => boolean;

  // 寫入（一律 await＋權威列＋rollback，基準行為見 2.1-1）
  create: (partial: Partial<TApp>) => Promise<TApp | null>;
  update: (id: string, patch: Partial<TApp>) => Promise<{ error: unknown }>;
  remove: (id: string) => Promise<{ error: unknown }>;

  // 訂閱
  subscribe: (fn: () => void) => () => void;

  // 測試／登出用
  reset: () => void;
}
```

### 2.3 各 store 特有行為的組態化對應

| 特有行為 | 現況實作位置 | 工廠組態化方式 |
|---|---|---|
| `fee` 讀取遮罩 view | `feeStore.loadFees()` 讀 `fees_visible` | `readSource: "fees_visible"`, `writeTable: "fees"` |
| `fee` realtime 禁用 `payload.new` | `requeryFeeFromView` | `realtimeStrategy: "requery-row"` |
| `case` 單筆快速讀取 | `loadCaseIfMissing` | `supportLoadIfMissing: true` |
| `case` 防呆保留非空陣列欄位 | `mergeIncomingCase` 內 `keepTools`／`keepQuestionTools` | 透過 `mergeIncoming` 覆寫函式注入（entity 特有邏輯留在呼叫端定義，工廠只提供掛勾點，不內建業務語意） |
| `invoice`／`client-invoice` 的 `feeIds` 關聯表 | `loadInvoices()` 內第二次查 `invoice_fees`／`client_invoice_fees` | `relatedTables` + 一個可選的 `loadRelated: (env) => Promise<Map<id, string[]>>` 掛勾，`fromDb` 簽名允許帶入 `relatedData` 第二參數 |
| `case` 的 `duplicate()`、`sync_cat_file_assignments_for_case` RPC 級聯 | `case-store.ts` `update()` 內條件式呼叫 | **不納入工廠泛用 API**——維持 case-store 遷移後在工廠之上疊加的擴充方法（工廠只管「單表 CRUD＋realtime＋poll」，跨 store 業務邏輯留在各 store 自己的 wrapper 層，避免工廠混入案件特有規則） |
| `internal-notes` 的 `useInternalNotes()` hook 內嵌 | 直接寫在 store 檔案 | 工廠可選擇性提供 `createUseEntity(store)` 輔助函式，讓五 store 遷移後 hook 位置與寫法統一（見 §5 建議一併整併 `use-*-store.ts`） |

### 2.4 尚待驗收方裁決的開放問題

1. `update`／`remove` 失敗時是否**強制**回滾本地樂觀狀態，或維持「回傳 error 讓呼叫端自行決定要不要 reload」？現況四種 store 四種答案（case 用整批 reload、client-invoice 的 `addFees`/`removeFee` 有針對性 rollback、`updateInvoice`/`deleteInvoice` 無 rollback 只回報 error、其餘三 store 完全無 rollback）。建議工廠**預設整批 reload**（等同 case-store 現況，最保守但最一致），特殊情境用組態 opt-out。
2. `realtimeStrategy: "reload-all"` 是否應在 W1 遷移時同步升級為 `"trust-payload"`（invoice／client-invoice 目前的關聯表結構跟 case 一樣簡單，理論上可比照 case-store 逐列合併），或維持現況只做「整表重載」的工廠化封裝、行為零改動，升級留給 W1 之後另立工項？**本報告不預設立場，列入 §4 每步驗收清單供逐店決策**。

---

## 3. W10 相容性專節

W10（譯者讀取收緊＋ `fees_visible` 欄位遮罩＋費用模組譯者唯讀）是目前五 store 中**唯一**已上線的列級／欄位級安全機制，工廠化**不得**弱化此機制。

### 3.1 三項機制與工廠化後的保留方式

| 機制 | 現況實作 | 工廠化後如何原樣保留 |
|---|---|---|
| **遮罩 view（`fees_visible`）** | `feeStore.loadFees()`／`requeryFeeFromView()` 皆讀 `fees_visible`，寫入仍走 `fees` 原表 | 組態 `readSource: "fees_visible"` / `writeTable: "fees"` 分離，工廠**必須**支援讀寫來源不同表（2.2 已納入），且工廠的 `create`／`update` 路徑硬性寫死走 `writeTable`，不得誤用 `readSource` 寫入（否則會寫入一個唯讀 view 直接報錯，等同有安全網——寫錯表會立即在開發階段炸掉，不會靜默通過） |
| **禁用 `payload.new`（realtime）** | `requeryFeeFromView(id)`：非 DELETE 事件一律丟棄 `payload.new`，改對 `readSource` 重新 `SELECT ... WHERE id = ?` | `realtimeStrategy: "requery-row"` 為工廠的**顯式選項**（非預設值，預設是 `"reload-all"` 或 `"trust-payload"`），fee 遷移時**必須**選用此選項；工廠實作規則明訂：`requery-row` 策略下，`postgres_changes` callback **禁止**直接讀取 `payload.new` 的欄位值（型別層可考慮讓 `requery-row` 模式的 callback 簽名根本不暴露 `payload.new`，只給 `id`，從介面設計上物理防呆） |

### 3.2 遷移驗證方法

- **DB 層權威回歸**：`supabase/tests/w10_fees_visible_mask_check.sql`（14 項 PASS，遮罩／白名單/PM 全欄位對照）、`supabase/tests/w10_fees_write_check.sql`（7 項 PASS，寫入僅 PM/執行長）、`supabase/tests/w10_translator_read_check.sql`。**fee-store 遷移到工廠版本後，此三支 SQL 腳本須原封不動重跑一次，全數維持 PASS**（因為機制是 DB 層 RLS／view，理論上與前端 store 實作方式無關，但仍須重跑排除「前端改了查詢方式導致意外繞過 view」的可能，例如誤把某個新方法寫成直查 `fees` 原表）。
- **前端 Playwright**：`tests/w10-fees-visible-pm.spec.ts`（W10-PM-1～4，PM 視角四列表／費用詳情營收/內部備註/請款詳情/寫原表讀 view 來回，已可穩定實跑）、`tests/w10-fees-visible-translator.spec.ts`（W10-T-1／T-2／T-3，譯者視角遮罩／純讀者，依賴 `switchToTestPersona` 換人流程，2026-07-05 起已可實跑非 `fixme`）。**fee-store 遷移後，此二支 spec 須全綠**；尤其 W10-T-1（營收內容/內部備註不得出現）與 W10-T-3（純讀者無寫入控件、輸入 disabled）直接驗證遮罩與唯讀兩件事同時成立。
- **迴歸紅線**：任一項驗證出現「非管理員讀到 `client_info` 完整值」或「譯者呼叫 `update`／`insert` 未被 RLS 擋下」，視為 P0 級遷移失敗，立即回滾該 store 的工廠化 commit（不得帶著已知安全缺陷繼續遷移下一個 store）。

---

## 4. 每步遷移的回歸驗收清單

遷移序（依指派要求）：**internal-notes → invoice → client-invoice → fee → case**。此序刻意把「風險最低、驗證工具最少」放最前面練手，「風險最高、耦合最深」放最後——與 1.1 表揭示的耦合度（case 最高、internal-notes 幾乎零跨 store 耦合）一致，也讓工廠介面在遷移過程中逐步補足（例如關聯表支援在 invoice 遷移時就得先補齊，client-invoice 才能直接沿用）。

**通則（每一步共同適用）**：
- 一 store 一分支（`feat/w1-migrate-<entity>-store`），從最新 `main` 切出。
- 遷移 commit 與（如有）行為變更 commit 分開（架構規則 §1 搬遷慣例的同款要求，套用到 store 遷移）。
- 遷移後該 store 原檔案應僅剩「呼叫工廠＋entity 特有擴充方法（如 case 的 `duplicate`）」的薄封裝層。
- 每步走**慢軌**：push 分支 → 回報 → 等驗收 → 才 merge（依本輪流程重申，不得比照文件類快軌）。

### 4.1 Step 1 — `internal-notes-store`

**理由**：跨 store 耦合最低、無 W10 遮罩顧慮，但如 1.3-g 所述是目前**可靠性最弱**且**測試覆蓋最薄**的一個，遷移本身就是補強行為（`update`/`remove` 从 fire-and-forget 升級為 await+權威列+error 回傳），需格外小心「修對」而非「修出新 bug」。

| 類型 | 測項 |
|---|---|
| 自動化（新增） | 補 Playwright spec（目前**完全沒有**）：建立 → 列表可見 → 更新單一欄位 → 重新整理後仍在（C1 標準）→ 刪除 → 列表移除；比照 `lms-client-invoice-bridge.spec.ts` 的持久化驗證寫法 |
| 自動化（既有回歸） | `InternalNotesPage.tsx`／`CaseDetailPage.tsx` 兩處 `useEffect` 呼叫 `.load()` 的頁面手動走一次（暫無自動化，此步驟建議一併補 smoke spec） |
| 自動化（e2e／CI） | 若已加入 `.github/workflows/e2e.yml` testMatch，確認新 spec 於 CI 內可獨立跑過 |
| 真人／AI 實測場景 | 開兩個分頁同時開啟同一則內部備註，一邊留言／編輯，確認另一邊 realtime 即時反映且不閃爍、不遺失剛才自己打的字（驗證 `mergeIncoming` 掛勾若有調整未破壞既有「直接信任 payload.new」行為） |

### 4.2 Step 2 — `invoice-store`（譯者稿費請款）

**理由**：練過 internal-notes 後处理第一個「有關聯表（`invoice_fees`）」的 store，且本次審閱已發現 1.3-f 的同型舊 bug，遷移正好一併修正。

| 類型 | 測項 |
|---|---|
| 自動化（既有） | `tests/ai-bridge-phase2.spec.ts` P2-L6（`invoice.create + get`）須全綠 |
| 自動化（新增） | 補 `invoice.update`／`invoice.addFees` 的回讀驗證測項（比照 `lms-client-invoice-bridge.spec.ts` 的 `updateInvoice`／`addFeesToInvoice` 寫法整套複製過來，順便補上目前 bridge 缺少的 `invoice.update`/`invoice.addFees` 方法本身——若尚未存在于 `ai-agent-bridge.ts`，屬本步驟遷移的驗證副產品，非必要條件） |
| 自動化（W5 RLS） | `tests/w5-phase2-billing-rls.spec.ts`／`supabase/tests/w5_billing_rls_check.sql` 對「本人請款 INSERT=ALLOW、冒名 DENY」須維持結果不變 |
| 真人／AI 實測場景 | 在 UI 上完成一次完整「建立譯者請款 → 加入費用 → 調整狀態 → 標記已轉帳」全流程操作，確認每一步刷新頁面後狀態仍在（比照 C1 持久化標準，非只看樂觀 UI） |

### 4.3 Step 3 — `client-invoice-store`（客戶請款）

**理由**：此 store 寫入層本身已經是「工廠基準模式」的原型（1.2-d），遷移主要驗證「套上工廠殼子後行為與現況等價」，而非引入新行為；同時是本次唯一已有較完整 Playwright 覆蓋的次等 store，回歸基準最扎實。

| 類型 | 測項 |
|---|---|
| 自動化（既有，須全綠） | `tests/lms-client-invoice-bridge.spec.ts` 全部測項（含 `create`／`addFees`／`adjustAmount`／`setChannel`／`setExpectedDate`／`delete`、譯者拒絕、reconciled fee fixture 成功路徑）、`tests/ai-bridge-phase2.spec.ts` P2-L7 |
| 自動化（新增） | 若遷移過程決定把 `realtimeStrategy` 從 `"reload-all"` 升級為逐列合併（2.4 開放問題 2），須新增一支「多分頁同時操作同一張客戶請款單」的競態回歸測試，驗證 1.2-c 描述的兩種症狀（`找不到客戶請款`、`verified:false` 假陰性）不再重現 |
| 真人／AI 實測場景 | 兩個瀏覽器分頁同時開同一張客戶請款單清單，一邊新增請款單＋加入費用，另一邊觀察列表即時更新且不閃爍／不重複列；比照本輪 bridge debug 已實測過的「self-healing + networkidle」情境，改為驗證「工廠化後不再需要測試端額外等待就能穩定」 |

### 4.4 Step 4 — `fee-store`

**理由**：唯一牽涉 W10 安全機制的 store，風險最高（安全性），須嚴格套用 §3 的驗證方法；同時是 1.2-b 描述的 fire-and-forget 重災區，遷移到工廠基準行為（await+權威列）預期能直接消除 addFees fixture 目前靠測試端等待才能繞過的競態。

| 類型 | 測項 |
|---|---|
| 自動化（W10 DB 層，須全 PASS） | `supabase/tests/w10_fees_visible_mask_check.sql`、`w10_fees_write_check.sql`、`w10_translator_read_check.sql` |
| 自動化（W10 前端） | `tests/w10-fees-visible-pm.spec.ts`（PM-1～4）、`tests/w10-fees-visible-translator.spec.ts`（T-1／T-2／T-3）全綠 |
| 自動化（既有） | `tests/ai-bridge-phase2.spec.ts` P2-L8（`fee.update finalized`）；若遷移後 `createDraft`/`updateFee` 改為 await，**應可移除**目前 W10-PM-4 spec 裡因應競態而放寬的斷言（改回原本更嚴格的「title 也落地」驗證），視為本步驟的一項正向回歸指標 |
| 自動化（新增） | `addFees` fixture 建置流程（`ensureReconciledFeeFixture`，`tests/lms-client-invoice-bridge.spec.ts`）遷移後**應可移除**目前為了繞過 fire-and-forget 而加的 `networkidle` 等待與分階段 `create({})`→`update()` 兩段式寫法，改回一次到位的 `fee.create({ ...完整資料 })`；若移除後仍需要等待才穩定，代表工廠化未真正解決 1.2-b，須退回檢視 |
| 真人／AI 實測場景 | 譯者假人登入費用模組，確認遷移後仍**看不到**營收/內部備註（W10 紅線）、**無法**送出任何寫入請求（按鈕不存在＋直接呼叫 bridge 方法也應被 RLS 拒絕）；PM 假人確認寫入與遮罩解除正常 |

### 4.5 Step 5 — `case-store`

**理由**：耦合最深（`duplicate()` 級聯改其他四個 store、`update()` 呼叫 CAT 派案 RPC）、程式碼量最大（918 行），排最後讓工廠介面歷經前四次遷移已充分打磨，降低最後一步意外翻車機率。

| 類型 | 測項 |
|---|---|
| 自動化（既有） | `tests/case-copy-title-refresh.spec.ts`、`tests/ai-bridge-phase2.spec.ts`（P2-L4／P2-L5）全綠 |
| 自動化（新增） | 補 `duplicate()` 級聯改標題（`feePatches`／`translatorInvoicePatches`／`clientInvoicePatches`）的整合測試——此方法直接跨呼叫另外三個已遷移的 store，是驗證「工廠化的四個 store 之間互相呼叫仍正常」的關鍵測項 |
| 自動化（W9 派案同步） | 案件狀態改為 `dispatched` 觸發 `sync_cat_file_assignments_for_case`／`syncCatWorkflowAssignmentsForCase` 的既有 CAT 派案回歸 spec（`tests/cat-modal-state-bridge.spec.ts` 等）須全綠，確認工廠化 `update()` 內的「條件式副作用呼叫」掛勾（2.3 表列為「不納入工廠泛用 API」的部分）正確保留在 case 專屬 wrapper 層 |
| 真人／AI 實測場景 | 完整跑一次「複製案件」流程：來源案件已有稿費/客戶請款掛載費用，複製後確認新案件標題正確遞增、原費用單標題級聯更新、原有的稿費/客戶請款單標題同步更新且刷新頁面後仍在 |

---

## 5. W4（列表欄位瘦身）併入方式與 297 處 `any` 是否順路

### 5.1 W4 併入方式

- **現況**：五 store 的 `load()`／`loadInvoices()`／`loadFees()` 皆為 `select("*")`（`fee-store` 例外，走 `fees_visible` view 但也是 `select("*")` 對 view 全欄位）。
- **建議**：W4 應**併入 W1 每一步遷移 commit 內**，而非事後另開五個分支——因為工廠的 `EntityStoreConfig` 本來就需要 `fromDb` 明確列出要讀的欄位（型別安全的副產品），比照 `cat-cloud-rpc.ts` 的 `CAT_FILE_LIST_COLUMNS` 命名慣例，各 store 建立 `<ENTITY>_LIST_COLUMNS` 常數（例如 `CASE_LIST_COLUMNS`、`FEE_LIST_COLUMNS`），供 `load()` 的 `.select(...)` 使用；詳情頁單筆讀取（如 `loadCaseIfMissing`）維持 `select("*")`（本報告 §2.2 `supportLoadIfMissing` 已預留）。
- **風險**：五 store 目前**沒有一個**明確列出「詳情頁實際用到哪些欄位」的清單，併入 W4 時第一步是逐頁審查各 `<Entity>DetailPage.tsx` 用到的欄位，避免列表瘦身後漏欄位造成該頁面某個角落顯示空白（例如 `bodyContent`／`edit_logs` 這類大型 JSONB 欄位很適合排除在列表查詢外，但若某個列表用到的摘要邏輯偷偷讀了這些欄位就會壞掉）。

### 5.2 297 處 `any`（`cat-cloud-rpc.ts`，主計畫 §15）是否順路

- **本次審閱結果**：五 store 本體及其對應的四個 `use-*-store.ts` hook 檔案，**目前 `any`／`as any`／`<any>` 使用數為 0**（已用 grep 全文確認）。也就是說 **W1 範圍內的程式碼與 `cat-cloud-rpc.ts` 的 297 處 `any` 沒有直接重疊**，兩者是完全獨立的技術債。
- **是否順路的判斷**：主計畫 §15 已裁示「清理時機建議與階段四 W1 協同評估」，理由是「屆時 store 與 RPC 邊界的型別本來就要重新檢視」。本報告的具體發現是：**W1 的五 store 與 `cat-cloud-rpc.ts` 之間目前沒有直接的 import／型別依賴關係**（分別是 LMS 業務資料 store vs. CAT 編輯器雲端 RPC），因此「協同評估」的價值主要在於**工程排程與心智負擔**（同一階段處理型別債，避免分兩批），而非兩者有耦合非改不可。
- **建議**：
  1. W1 五 store 遷移**不需要**特地去動 `cat-cloud-rpc.ts`；兩者可視為互相獨立的並行工項。
  2. `createEntityStore` 工廠實作時務必**維持零 `any`** 的現況水準（泛型設計需仔細，避免為了「快速讓型別過關」引入 `any` 或 `as unknown as`，違反 `architecture.mdc` §8 精神）。
  3. 若日後 W1 完成後真的要處理 `cat-cloud-rpc.ts` 297 處 `any`，可參考 W1 工廠設計中 `fromDb`／`toDbUpdate` 的「窄化＋防禦性 mapper」寫法（本報告 2.2）作為清理範本，但這屬於**未來獨立工項**的排程建議，不在本報告範圍內展開執行細節。

---

## 6. 風險清單

| 編號 | 風險 | 影響範圍 | 偵測方法 | 回退方案 |
|---|---|---|---|---|
| R-1 | 工廠化後 `fee-store` 不慎繞過 `fees_visible` 遮罩 view（例如 `readSource` 組態誤填為 `fees` 原表），導致非管理員讀到營收/內部備註 | **P0 安全**：譯者可看到不該看的客戶營收資訊 | §3.2 三支 W10 DB 層 SQL 腳本＋兩支 Playwright spec 全數重跑；CI 若已將這些 spec 納入 e2e workflow，PR 階段即可攔截 | 立即回滾該 store 的工廠化 commit（單獨分支單獨 merge 的好處在此體現：可精準回退單一 store，不影響其他四個） |
| R-2 | `realtimeStrategy` 從 `"requery-row"`（fee）誤設為 `"trust-payload"` 或反之，導致 fee 的 realtime 直接信任未遮罩的 `payload.new` | **P0 安全**，同 R-1 | 同上；另可在工廠層加入型別層防呆（2.3 表述的「`requery-row` 模式下 callback 不暴露 `payload.new`」） | 同上 |
| R-3 | `update`／`remove` 統一為「await＋權威列＋回傳 error」後，既有呼叫端（頁面元件）仍用舊的「fire-and-forget、不管回傳值」寫法呼叫，工廠回傳的 `Promise` 未被 `await`，導致 unhandled rejection 或呼叫端誤以為同步完成 | 中：四個尚未修過的 store（fee/invoice/internal-notes 的 update/remove，加上這三者已有的呼叫點）在遷移當下若未同步檢查所有呼叫端 | TypeScript 若將回傳型別從 `void` 改為 `Promise<{error}>`，`tsc -b` 對「未處理 Promise」不會自動報錯（除非開 `no-floating-promises` lint 規則），須額外用 `Grep` 逐一巡查每個 store 遷移前的所有呼叫點（`updateFee(`／`internalNotesStore.update(` 等）確認呼叫端是否需要跟著改 | 遷移 PR 描述須附「呼叫端巡查清單」；若巡查後仍有漏網呼叫點於 e2e 或真人測試中曝露，先回退該 store 分支，呼叫端修正後再重新提交 |
| R-4 | `invoice-store` 遷移時修正 1.3-f 的舊 bug（fire-and-forget → await），但目前無 `invoice.update`／`invoice.addFees` bridge 方法與對應 Playwright 覆蓋，回歸驗證主要依賴人工 UI 操作，覆蓋不如 client-invoice 完整 | 中：可能修好了 store 卻沒測到某個既有頁面呼叫點的行為變化（例如某頁面依賴「呼叫後立即讀本地樂觀值＝新值」的舊時序假設） | §4.2 要求新增與 client-invoice 對等的 Playwright 覆蓋作為遷移**前置**，而非遷移後才補；巡查 `src/pages/InvoiceDetailPage.tsx` 等頁面所有呼叫 `invoiceStore.updateInvoice`／`addFeesToInvoice` 的地方 | 同 R-3 |
| R-5 | `internal-notes-store` 遷移時補齊 rollback／回傳 error（修 1.3-g），但**目前完全沒有 Playwright 覆蓋**，是五個 store 中「改動前對照基準最薄弱」的一個，遷移風險評估本身的可信度最低 | 中高：不像其他四個 store 有既有 spec 可比對「改前改後行為是否一致」，內部備註若因遷移引入細微行為差異（例如樂觀更新時機改變導致 UI 短暫閃爍）可能要等真人使用才發現 | §4.1 要求**先補 Playwright spec 再遷移**（而非遷移後補測試），讓新 spec 在遷移前先對「現況行為」跑一次綠燈，遷移後對照同一份 spec 是否仍綠燈 | 若遷移後新 spec 抓到行為差異，先判斷是「預期內的正向修正」（如今 rollback 補上）還是「非預期的行為倒退」，前者更新 spec 期望值並記錄變更，後者直接回退 |
| R-6 | `case-store.duplicate()` 與 `update()` 內對其他四個 store 的直接呼叫（`feeStore.updateFee`、`invoiceStore.updateInvoice` 等）在四個 store 陸續遷移過程中，其**呼叫介面**（函式簽名）若因工廠化而改變（例如 `updateFee` 從 `void` 改回傳 `Promise<{error}>`），`case-store.ts` 內對應呼叫點若未同步更新會造成 `tsc` 編譯錯誤或忽略回傳值 | 中：屬於「四 store 遷移」與「最後一步 case 遷移」之間的**過渡期**風險（case-store 是最後一個遷移，過渡期間它是唯一仍呼叫「舊介面 store」與「新介面 store」混合的呼叫端） | 每完成一個 store 遷移，立即跑 `npm run typecheck`（`tsc -b`）；若 `case-store.ts` 對該 store 的呼叫點編譯失敗，此為**設計期**即可攔截的錯誤，不會漏到執行期 | 過渡期呼叫端（`case-store.ts` 內的跨 store 呼叫）與該 store 的遷移 commit **合併於同一次 PR**（例外於「一 store 一分支」通則，但範圍僅限「更新呼叫端型別以配合新介面」，不得夾帶其他行為變更） |
| R-7 | 工廠引入的 `pendingUpdates`／in-flight 保護機制套用到高頻寫入的 store（例如 `fee`／`client-invoice`）時，記憶體中 Map 的清理計時器（`pendingCleanupTimers`）若因遷移時參數（`pendingCleanupDelayMs`）設定不當，可能造成「短時間內大量寫入」情境下的計時器堆積或提前/延後清理，影響與 realtime 的協調時機 | 低：現況 case-store 已在正式環境運作，此風險屬「套用到新 store 時的參數調校」，非全新機制風險 | 遷移 fee／client-invoice 時，比照 case-store 現有的 2 秒寬限值做基準，若該 store 的寫入頻率／延遲特性明顯不同（例如 `client_invoice_fees` 批次 `addFees` 可能一次多筆），做真人壓力測試（連續快速點擊加入多筆費用）觀察 UI 是否穩定 | 若發現堆積或協調異常，先調大 `pendingCleanupDelayMs` 觀察是否緩解；仍異常則該 store 的 in-flight 保護可先關閉（組態設為不啟用），退回「無保護但至少寫入層本身已修好」的中間狀態，不影響已完成的其他修正 |
| R-8 | 遷移過程完全依賴 Playwright／SQL 腳本等「自動化通過」，忽略 `testing.mdc` §8「自動化通過後仍須真人／AI 實測抽查體感」要求，可能漏掉如 OBS-1（team 模式確認延遲 4.5 秒）同類「對不對都對、但體感變慢」的問題 | 低中：不影響資料正確性，但影響使用體驗 | §4 每一步驟已個別列「真人／AI 實測場景」欄位，強制執行 | 若抽查發現體感劣化，記錄為新 DEVLOG 待辦（比照主計畫 §8 OBS-1 模式），不必因此卡住該步驟的資料正確性驗收，但需排入後續優化清單 |

---

## 7. 結論與建議開工順序

1. 本報告**未變更任何生產程式碼**，符合前置要求。
2. §1 差異表確認：現況五 store 行為漂移程度**遠超**「後四個都一樣、只有 case 特殊」的簡化認知——`fee`（W10 遮罩＋fire-and-forget）、`invoice`（舊 bug 未修＋關聯表)、`client-invoice`（已修但仍缺 in-flight 保護）、`internal-notes`（可靠性最弱＋測試覆蓋掛零）四者彼此之間也各不相同，工廠設計必須以「組態化」而非「四選一模板」思維進行（§2 已依此原則草擬）。
3. 建議依 §4 順序開工：**internal-notes → invoice → client-invoice → fee → case**，每步獨立分支、獨立驗收、慢軌紀律（push 分支後等驗收回覆才 merge）。
4. 開工前建議驗收方特別關注 §2.4 兩項開放問題（rollback 預設策略、`realtimeStrategy` 是否順帶升級）與 §6 R-3／R-6（呼叫端型別連動的過渡期風險），此三者是最可能拖慢或打斷五步遷移節奏的技術決策點，越早拍板越能讓五個分支的實作方向一致。
