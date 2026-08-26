狀態：工程已驗收；Micro Compute 觀察中；文件待上游審核

# LMS／CAT Supabase 讀取效能修正 — 開發紀錄（2026-08）

**正式站：** https://talk-hanzi-joy.vercel.app  
**目前 `main`：** `19d49207`（2026-08-25／26 已部署；使用者端為新版）  
**Compute：** 仍為 Micro；`19d49207` 上線後第一個正常工作日為 Day 1，觀察 3～5 個正常工作日<br>
**未升 Compute、未改產品語意／排序／Workflow／虛擬捲動規則**

> 本檔供上游審核與日後追溯。Cursor 個人計畫檔不在 repo；本 DEVLOG 為可審核的正式紀錄。  
> 基準：[`LMS_CAT_SUPABASE_READ_PERF_BASELINE_2026-08.md`](LMS_CAT_SUPABASE_READ_PERF_BASELINE_2026-08.md)  
> Index EXPLAIN：[`CAT_READ_PATH_INDEXES_EXPLAIN_2026-08.md`](CAT_READ_PATH_INDEXES_EXPLAIN_2026-08.md)  
> Compute 觀察：[`SUPABASE_MICRO_COMPUTE_OBSERVATION_2026-08.md`](SUPABASE_MICRO_COMPUTE_OBSERVATION_2026-08.md)

---

## 1. 問題與目標

### 1.1 現象（修正前）

- LMS 初始化／F5 時 `app_settings`、assignee 三表、費用／請款列表出現平行雙載或多餘 trailing。
- CAT 大檔／大 TM 以 OFFSET 分頁；深頁成本高；缺 `(file_id, id)`／`(tm_id, id)` 複合索引。
- 第一輪驗收另證實：開檔句段整份讀兩輪、`fees_visible` 穩定 3 次、token refresh 重載內部註記、休眠喚醒 poll／full-list burst、匿名查 `cat_segments` 掃到 statement timeout、測試模式 changelog 混正式資料與返回票殘留。

### 1.2 目標

1. 消除同一 auth／初始化原因下的重複 full-list。
2. 讓 CAT／TM 分頁走複合索引＋keyset cursor。
3. 收斂匿名葉子表與測試模式環境隔離風險。
4. 維持 Micro；僅在觀察期數據支持時另案評估升級。

### 1.3 正式庫規模（基準時點 2026-08-25）

| 指標 | 值 |
|---|---|
| `cat_segments` | 約 167,285 |
| `cat_tm_segments` | 約 231,288 |
| DB 大小 | 約 345 MB |
| 最大檔案 | 7,694 句 |
| 最大 TM | 48,993 句 |

---

## 2. 交付總表（PR／commit／migration）

| 順序 | PR | 分支 | Merge | 主題 | Migration／sync |
|---|---|---|---|---|---|
| 1 | [#72](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/72) | `perf/cat-read-indexes` | `892bfbbe` | 複合索引 | `20260824174844_cat_read_path_indexes.sql` |
| 2 | [#73](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/73) | `perf/cat-keyset-pagination` | `898a5e3b` | keyset cursor | `sync:cat` |
| 3 | [#71](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/71) | `perf/lms-read-single-flight` | `767c63aa` | LMS single-flight | — |
| 4 | [#74](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/74) | `fix/cat-anon-leaf-table-access` | `b9171d24` | anon 葉子表防護 | `20260825110107_restrict_cat_leaf_tables_to_authenticated.sql` |
| 5 | [#75](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/75) | `perf/cat-single-segment-load` | `de00edb2` | 開檔單次句段載入 | `sync:cat` |
| 6 | [#76](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/76) | `perf/lms-initial-load-dedupe` | `5c73cb77` | 初始 full-list 收斂 | — |
| 7 | [#77](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/77) | `perf/realtime-poll-mutex` | `2fb851f1` | poll 互斥／trailing | — |
| 8 | [#78](https://github.com/kratoswrathful-wy/talk-hanzi-joy/pull/78) | `fix/test-mode-env-and-return` | `19d49207` | changelog env＋返回票 | `20260825120952_cat_module_logs_env.sql` |

合併進 `main` 的順序與上表一致（先索引再 keyset 再 LMS，再後續五項）。Local／Remote migration history 於各次 `db push` 後已對齊。

---

## 3. 時間軸與根因／修法

### 3.1 PR #72 — CAT 複合索引

- **根因：** 深頁 OFFSET 依賴 pkey／單欄 `file_id` 後再 Sort，成本隨 offset 上升。
- **修法：** 新增 `cat_segments_file_id_id_idx`、`cat_tm_segments_tm_id_id_idx`；不改 RLS／grant。
- **證據：** EXPLAIN 改走新索引（見 indexes 文件）；深頁仍有 OFFSET skip cost → 由 #73 解決。

### 3.2 PR #73 — keyset pagination

- **根因：** 正式路徑仍用 `offset`；深頁掃描成本高且不利索引。
- **修法：** `fetchCatSegmentsByFileIdOrdered`／`db.getTMSegments` 改 `id > lastId`＋`LIMIT 1000`；TM 分頁回傳 `nextCursor`；五處 caller 改 cursor；`sync:cat`。
- **測試：** Vitest keyset／排序 helper；最大 TM 驗收 49 頁、48,993 unique id、零 `offset=`。

### 3.3 PR #71 — LMS single-flight

- **根因：** settings `ensureLoaded` 與 auth 雙軌；assignee／fee 等 store 無 in-flight 合併；部分路徑在 `TOKEN_REFRESHED` 全量重載。
- **修法：** settings 唯一入口＋per-key debounce；assignee／fee／invoice／client-invoice store-level single-flight／trailing；hooks 只呼叫可重入 load。
- **第一輪結果：** `app_settings` 平行 2 輪→1 輪；總請求 70→59；但 `fees_visible` 仍為 3（見 §4）。

### 3.4 PR #74 — 匿名 CAT 葉子表防護

- **根因：** anon 有 SELECT 特權時，RLS「無列可見」仍可能掃大表至 `57014`。
- **修法：** `REVOKE ALL … FROM anon`；policy `TO authenticated`；SQL 檢查快速拒絕。
- **效果：** 未認證請求在權限層拒絕，不再依賴掃完才 timeout。

### 3.5 PR #75 — CAT 開檔單次句段載入

- **根因：** `openEditor` 路徑 `_loadFileWorkflowContext` 為建列號快取再 `getSegmentsByFile` 一次，主流程又載一次（第一輪 CDP：同組 8 頁出現兩次＝16 頁）。
- **修法：** 開檔時 `loadLineNoCache: false`；主載入後 `_buildFullListLineNoCache(currentSegmentsList)`；契約測試鎖定呼叫次數與順序；`sync:cat`。
- **第二輪：** 同一檔 8 頁／8 unique URL。

### 3.6 PR #76 — LMS 初始載入收斂

- **根因：** fee（及同類）auth 自動載＋hook mount 雙軌導致 trailing；`internal_notes` 刻意在 `TOKEN_REFRESHED` 全量重載且無 single-flight。
- **修法：** `ensureLoaded`（已 loaded／in-flight 不觸發 trailing）；auth 改呼叫 `ensureLoaded`；`internal_notes` 忽略 `TOKEN_REFRESHED`；Playwright 門檻 `fees_visible === 1`。
- **第二輪：** F5 `/cases` full-list 各 1。

### 3.7 PR #77 — realtime-poll 互斥

- **根因：** `checkOnce` 無互斥；interval 與多次 `visibilitychange` 可同時打出多筆 probe，進而觸發全表覆寫 burst。
- **修法：** in-flight Promise＋最多一次 trailing；`start`／`stop` 遞增 generation 作廢舊檢查。
- **第二輪：** 模擬五次回前景 → full-list 0；probe 有界。

### 3.8 PR #78 — 測試模式 changelog 與返回票

- **根因：** `cat_module_logs` 無 `env`；離開測試模式前過早清票／未核對切回身分。
- **修法：** 欄位 `env`＋讀寫過濾；返回票驗證成功且 email 相符後才清除；失敗則安全登出。
- **第二輪：** 同分頁切回本人、票清除、執行長選單恢復。

---

## 4. 兩輪驗收對照

### 4.1 第一輪（2026-08-25，Claude Assistance）

總評 **fail（效能門檻）**；功能可用、不需回滾。  
重點：`fees_visible=3`、T3／T6 部分、T4 附帶雙輪載入、anon 57014、changelog／返回票問題。

### 4.2 第二輪（2026-08-26，正式站 `19d49207`）

| 測項 | 結果 | 可量測差異 |
|---|---|---|
| T1 | pass | `fees_visible` **3→1**；invoices／client_invoices 各 1 |
| T3／poll | pass | 喚醒場景 **無 full-list burst**；probe 互斥 |
| T4 | pass | 句段頁 **16→8**；序號 1／3847／7694 正確；虛擬捲動啟用 |
| T5 | （第一輪已 pass，未重跑） | 49 頁 cursor、零 offset |
| T6 | pass | 測試模式確認／取消確認往返並還原；anon 葉子表權限層拒絕 |
| 測試模式復原 | pass | 同分頁切回本人 |

品質閘門：`main` CI、migration sentinel、Playwright E2E 於 `19d49207` 為 success。  
本機全套 Vitest 曾見既有 flaky `TranslatorFees.hooks-order`（單獨通過）；與本波 diff 無關。

---

## 5. 主要程式觸點（現況索引）

| 區域 | 路徑 |
|---|---|
| Settings／assignee | `src/stores/settings-init.ts`、`settings-persistence.ts`、`select-options-store.ts` |
| Fee／invoice／notes | `src/stores/fee-store.ts`、`invoice-store.ts`、`client-invoice-store.ts`、`internal-notes-store.ts` |
| Poll | `src/lib/realtime-poll.ts` |
| CAT RPC／keyset | `src/lib/cat-cloud-rpc.ts`、`src/lib/cat-keyset-pagination.ts` |
| CAT 開檔 | `cat-tool/app.js`（`openEditor`／`_loadFileWorkflowContext`）；同步 `public/cat/` |
| 測試模式 | `src/components/DevRoleSwitcher.tsx`、`src/lib/test-mode-return-session.ts` |
| Playwright | `tests/lms-read-path-request-count.spec.ts` |

---

## 6. 已知未納入本波／觀察中

1. **Micro Compute 觀察期**（進行中）：見觀察清單；滿 3～5 正常工作日後才決定是否升 Small。
2. **測試模式儀表板專案／TM／TB 數字**是否仍混正式環境：changelog 已隔離；統計數字若仍異常另開工項。
3. **CAT hot path `select("*")` payload**：若 DB 已改善但傳輸仍主導總時間，另開欄位投影 PR。
4. **invitation realtime 缺口**：#71 刻意不擴大範圍。

---

## 7. 上游審核用一句結語

八個獨立 PR 已合併並部署；第二輪效能／權限／測試模式復原驗收達標；repo 與正式庫 migration 一致；**本次 Supabase 讀取效能主工項唯一未結案的決策項目為 Micro Compute 觀察期**，尚未宣稱必須或不必升級 Compute。
