# CAT 大檔虛擬捲動與導覽 — 完整開發紀錄

> **狀態（2026-07-03）**：**Phase R 已達驗收門檻** — 大檔（>800 句）離線版 CAT 編輯器的 explicit 導覽（Ctrl+Enter 確認跳行、清除篩選回句、F8、手動點擊）已通過 Playwright 全量矩陣（Test A 3/3、Test B 5/5、C/E/D/G/H/I 全 pass）。  
> **分支**：`cursor/cat-nav-phase-r-shared-explicit-centering`；最終 commit `21af736`。  
> **尚未涵蓋**：團隊版（Supabase 同步）大檔捲動未實測；Phase S（Wave 2 壓力測試 I′／N／J／K）尚未執行。

本文件為**敘事型彙整紀錄**，把分散在 7 份來源文件的開發歷程串成完整故事。細節仍以各來源文件為準；本文件在關鍵處附連結。

---

## 時間軸總表

| 日期 | 階段 | 一句話結果 | Commit | 詳細文件 |
|------|------|-----------|--------|----------|
| 2026-05-08 | 確認跳行置中被 focus 蓋掉 | **已驗收** — `focus({ preventScroll: true })` + rAF `scrollIntoView(center)` | `bb324d2` | [`CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md`](./CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md) |
| 2026-06-09～10 | 系統跳焦點一律即時捲動 | **已驗收** — 全專案 `scrollIntoView` 改 `behavior: 'auto'` | `5b5aa3d` | [`CAT_SCROLL_INSTANT_NAVIGATION_2026-06.md`](./CAT_SCROLL_INSTANT_NAVIGATION_2026-06.md) |
| 2026-06-28 | 大檔全面遲鈍調查 | 鎖定全量 DOM 為主因；啟動 Phase 1～2 虛擬捲動 | — | [`CAT_EDITOR_LARGE_FILE_PERF_2026-06.md`](./CAT_EDITOR_LARGE_FILE_PERF_2026-06.md) |
| 2026-06-28 | Phase 1 熱路徑優化 | **已驗收** — focus 增量更新、TM debounce | `2d32f1b` | 同上 |
| 2026-06-28 | Phase 2 虛擬捲動初版 | **有缺陷** — scrollTop 歸 0、跳行失敗 | `56c3386` | 同上 |
| 2026-06-28 | Phase 2.1～2.1d | **已驗收** — 錨點、suppress、debounce 修正 | `c56cadc`～`5658762` | 同上 |
| 2026-06-28 | Phase 2.2 首批 | **已驗收** — F4 全部取代改資料層 | `5658762` | 同上 |
| 2026-06-29 | rowIdx 污染／確認不跳行 | **已驗收** — virt 下 `rowIdx` 改全檔索引 | `51815db` | [`bug-report_virt-scroll-confirm-nav-rowidx_2026-06.md`](./bug-report_virt-scroll-confirm-nav-rowidx_2026-06.md) |
| 2026-06-29 | Phase 2.3 基線 | **部分通過** — Tag、假游標、清除篩選、確認跳行 | `0670242` | [`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §3 |
| 2026-06-29～30 | Phase 2.3b～2.3k | **反覆迭代** — 假游標、焦點管線、置中、篩選錨定、nav lock | `694fa81`～`3d6030d` | 同上 §3.11～§3.14 |
| 2026-07-01 | Phase 2.3l～2.3o | 色點、篩選 bug、審稿外圈 UI | `09737ab`～`5e9925a` | 同上 §3.15～§3.17 |
| 2026-07-02 | Phase 2.3p hotfix | 焦點驗證仍不足；殘留症狀導向 2.3q | `649ef70` | 同上 §3.18 |
| 2026-07-02 | Phase 2.3q 實作 | **已實作** — completion gate `focusOk && centerOk` | `6344baa` | [`CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md) |
| 2026-07-02 | Wave 1 Playwright | Test A 穩定 fail（`rowCenterDeltaPx` ≈ +71）；B 間歇 | `d15ad0b` | [`CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md) |
| 2026-07-02 | Phase Q 診斷量化 | A **0/6** fail、B **3/8** pass；確認 shared path 問題 | `fc06da4` | 同上 §測試執行報告 Phase Q |
| 2026-07-03 | Phase R 產品修復 | **已達驗收門檻** — `forceVirtScroll` 無窮迴圈為真正根因 | `21af736` | 同上 §測試執行報告 Phase R |
| — | Phase S（Wave 2） | **規劃中** — I′、N、J/K、backlog L/M | — | 同上 §Phase S |

---

## 第一部分：問題緣起（2026-06-28）

### 症狀

專案擁有者以 Riftbound mqxliff **6333 句**（6126 句含 `<mq:insertedmatch>`）開檔後，幾乎所有操作都「非常非常慢」：

- 點譯文格特別卡
- Ctrl+G 跳行遲鈍
- 準備完成（Workflow）特別久
- 不只捲動慢，而是**全面遲鈍**

### 診斷過程（排除法）

| 假設 | 驗證方式 | 結果 |
|------|----------|------|
| Supabase migration 未 push | 檢查遠端 | **排除** — 已 push |
| TM 即時比對拖慢 | 移除 TM 並關檔重開 | **排除** — 幾乎無改善 |
| memoQ 預翻 bug | 查 commit `8e187d3` | **排除** — 已修 |

### 鎖定主因

1. **全量 DOM**（主因）：`renderEditorSegments()` 對每句建完整列 → 6333 句 ≈ 數萬 DOM 節點
2. **focusin 熱路徑**：每次 focus 用 `querySelectorAll` 掃全表 + 同步 `renderLiveTmMatches`
3. **Workflow 快照**：`enqueueStageSnapshot` → `batchUpsertSnapshots` 一次處理全檔 6333 句

**解法方向**：句數 >800 時啟用虛擬捲動（`CatVirtGrid`），只掛載視窗內約 69 列（WINDOW 45 + BUFFER×2），其餘以 spacer 佔位。

詳見 [`CAT_EDITOR_LARGE_FILE_PERF_2026-06.md`](./CAT_EDITOR_LARGE_FILE_PERF_2026-06.md)。

---

## 第二部分：地基修正（2026-05～06-29）

### 2.1 確認跳行置中被 focus 蓋掉（2026-05）

**背景**：全量 DOM 時代，設定「確認跳行後置中（center）」時，Ctrl+Enter 確認並跳到下一句後，新焦點句段應置中顯示，但實際行為像「僅捲到可見（nearest）」。

**量化證據**：`rowCenterDeltaPx = 62`（理想接近 0，±5～10px）

**根因**：`row.scrollIntoView({ block: 'center' })` → `focus()`；`focus()` 觸發瀏覽器「確保游標可見」捲動（nearest），**覆蓋**置中結果。

**修法**：
- `ed.focus({ preventScroll: true })`
- `requestAnimationFrame(() => row.scrollIntoView({ behavior, block: 'center' }))`

**結果**：**已驗收**（2026-05-08），commit `bb324d2`。

詳見 [`CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md`](./CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md)。

### 2.2 Phase 1～2.2 虛擬捲動導入（2026-06-28）

| 階段 | Commit | 做了什麼 | 結果 |
|------|--------|----------|------|
| Phase 1 | `2d32f1b` | focus 增量更新 active/selected；TM debounce | **已驗收** |
| Phase 2 初版 | `56c3386` | 虛擬捲動 ~69 列 + spacer | **有缺陷** — scrollTop 歸 0、跳行失敗 |
| Phase 2.1 | `c56cadc` | `_suppressScroll`、錨點、重畫順序 | **部分通過** — 視窗不推進、Ctrl+G 空白未解 |
| Phase 2.1b | `ffc74ed` | `inferAnchorFromDom`、`scrollTopToStartIdx` | **部分通過** — 快速捲動飄回頂部未解 |
| Phase 2.1c | `301606d` | scroll debounce 120ms、`savedScrollTop` 還原 | **已驗收** |
| Phase 2.1d | `5658762` | 窗口邊界一變即重畫（移除 scroll debounce） | **已驗收** |
| Phase 2.2 首批 | `5658762` | `performReplaceAll` 改資料層，F4 可改整檔 | **已驗收** |

**Phase 2 虛擬捲動總驗收**：2026-06-28 通過（專案擁有者）；最終可用 commit `5658762`。

**關鍵程式**：[`cat-tool/js/grid-virtual-scroll.js`](../cat-tool/js/grid-virtual-scroll.js)（`CatVirtGrid`：`renderWindow`、`onScroll`、`scrollToSegId`、`_suppressScroll`、`_anchorSegId`）；[`cat-tool/app.js`](../cat-tool/app.js)（`renderEditorSegments`、`buildGridDataRow`）。

詳見 [`CAT_EDITOR_LARGE_FILE_PERF_2026-06.md`](./CAT_EDITOR_LARGE_FILE_PERF_2026-06.md)。

### 2.3 系統跳焦點一律即時捲動（2026-06-09～10）

**症狀**：清除篩選跳回列、搜尋導覽（F3）、確認句段跳行、QA 跳句等情境，畫面會從頂部或遠處**平滑捲動**到目標列，體感像「從頭捲下來」。

**修法**：全專案系統跳焦點 `scrollIntoView` 統一 `behavior: 'auto'`（移除 smooth 動畫）。

**結果**：**已驗收**（2026-06-10），commit `5b5aa3d`。

**與大檔 virt 的關係**：Phase 2.3 後續仍須在 virt 模式下先 `CatVirtGrid.scrollToSegId`（列未掛載時），再 focus + measure center，不能僅靠 `scrollIntoView`。

詳見 [`CAT_SCROLL_INSTANT_NAVIGATION_2026-06.md`](./CAT_SCROLL_INSTANT_NAVIGATION_2026-06.md)。

### 2.4 rowIdx 污染／確認不跳行（2026-06-28～29）

**症狀**（大檔 >800 句，虛擬捲動啟用時）：

1. Ctrl+Enter 確認後游標離開譯文欄，藍框停剛確認句，**不跳到下一未確認句**
2. 重複句 1/2 確認後 2/2 畫面不即時更新（須重整理才見綠勾）
3. 連帶：Ctrl+Shift+A 全選、多選批次確認、Ctrl+↑↓ 跳列可能 silently 失效

**根因**：

| 根因 | 說明 |
|------|------|
| `seg.rowIdx` 污染 | `renderWindow` 寫入篩選子清單索引並持久化 |
| `getAfterConfirmFocusIndex` 誤用 DOM | 用 `gRows[idx]` 判可見，virt DOM 僅 ~69 列 |
| 「尚未確認」定義 | 用 `status !== 'confirmed'`，與 B-7g 五態不一致 |

**修法**：
- `renderEditorSegments` bulk 設 `seg.rowIdx`；virt `getGlobalIndex`；`buildGridDataRow` 不再覆寫
- `segNeedsAfterConfirmNav` + `isRowVisibleForAfterConfirmNav`（`isSegmentVisibleInEditor`）
- 重複連動改 `getGridRowBySegId`

**結果**：**已修並驗收**（2026-06-29），commit `51815db`。

詳見 [`bug-report_virt-scroll-confirm-nav-rowidx_2026-06.md`](./bug-report_virt-scroll-confirm-nav-rowidx_2026-06.md)。

---

## 第三部分：Phase 2.3 導覽大長征（2026-06-29～07-02）

虛擬捲動地基打好後，**導覽／置中／假游標／篩選**在 virt 模式下仍大量失效。Phase 2.3 自基線起歷經 **b～q 共 15 個子階段**，是全案反覆最多次、最有參考價值的一段。

### 子階段總表

| 階段 | 日期 | 核心症狀 | 主要方案 | 結果 | Commit |
|------|------|----------|----------|------|--------|
| **2.3 基線** | 06-29 | Tag 全紅橘；假游標失效；清除篩選跳第一行；確認只選列不進格 | Tag reconcile、假游標存 segId+offset、`scrollToSegId` + focus | 部分通過 → 2.3c | `0670242` |
| **2.3b** | 06-29 | 往下捲被拉回第一行；Ctrl+G 跳 838 無效 | 被動 `show()` 不 scroll；`restore()` 才 scroll | **已驗收** | `694fa81` |
| **2.3c** | 06-29 | 離屏 tip 貼頂；清除篩選焦點錯行；Ctrl+Alt+↓ 只選列 | `_pendingEditorFocus`、`flushPendingEditorFocus` | **驗收未通過** → 2.3d | `0a073ea` |
| **2.3d** | 06-29 | 確認只選列（BODY）；#385 按 ↑ 回 #17；滾輪掉焦；清除篩選空白 | `_preserveFocusAcrossVirtRender`、`invalidateHeights(anchorSegId)` | 部分通過 → 2.3e | `42bbd17` |
| **2.3e** | 06-29 | 確認跳行置頂；假游標不顯示；篩選畫面跑掉 | `scrollToSegId`/`invalidateHeights` 加 `block`；`centerOnSegId` | 部分未通過 → 2.3f | `78818d0` |
| **2.3f** | 06-29 | 遠距跳行不能打字；滾輪焦點跑掉；篩選亂跳 | 雙軌 preserve；`isSegIdCentered`；pending gen | 部分未通過 → 2.3g | `927ceec` |
| **2.3g** | 06-29 | 清除／進篩選不置中；假游標被 preserve 吃掉；手動捲被拉回 | `_filterAnchorPending`、`_userScrollGen`、`releaseVirtNavigationAnchor` | **驗收未通過** → 2.3h | `e84f06d` |
| **2.3h** | 06-29 | 確認後約 1 秒掉焦；假游標不繪製；tip 錯位 | 疊層 `position:fixed`、append `body`；移除 `_suspendEditingPreserve` | 部分通過 → 2.3i | `ffe459d` |
| **2.3i** | 06-29 | 捲動後 tip 不顯示；篩選進出亂跳；Ctrl+F 焦點被搶 | 未掛載列不硬抓焦點；`didRebuildFilterSnapshot` 一律錨定編輯句 | 部分通過 → 2.3j | `e17ff35` |
| **2.3j** | 06-29 | 假游標完全不繪製；確認跳行假游標到、畫面沒到 | `_navAnchorLock`；`scheduleResizeRepaint` 鎖定期不 `inferAnchorFromDom` | 部分通過 → 2.3k | `e147c10` |
| **2.3k** | 06-30 | 確認連跳；手動捲被拉回；搜尋上色／TB 消失；色點新功能 | 導覽 scroll 合併；`skipVirtScroll`；`onAfterRender` 補 highlight | 部分驗收 → 2.3l | `3d6030d` |
| **2.3l** | 06-30 | 離開篩選 Virt 不重畫；批次確認清空篩選；重複句 ✕ 雙向覆寫 | `leavingFilter` + `invalidateHeights`；`keepFilterSnapshot` | 部分通過 → 2.3m | `09737ab` |
| **2.3m** | 07-01 | 狀態欄未置中；多選右鍵只作用右鍵列；色點延遲 | 樂觀 DOM 更新；`_ctxMenuSelectionSnapshot` | **產品驗收通過** → 2.3n | — |
| **2.3n** | 07-01 | 審稿外圈不可見；TB 捲動閃爍 | `box-shadow` spread 5px；`decorateTbInlineHintsForSegId` | **產品驗收通過** `5e9925a` | `5e9925a` |
| **2.3o** | 07-01 | 外圈 3px 偏粗 | spread 4.5px（可見 2.5px） | **已實作，待驗收** | — |
| **2.3p** | 07-02 | confirm-jump 焦點驗證仍不足 | 方案 A+B；hotfix 焦點驗證 | hotfix 已推送 → 2.3q | `649ef70` |
| **2.3q** | 07-02 | 清除篩選置頂；Ctrl+Enter 間歇失敗；手動點擊反覆跳位；focus OK 但 `centeredOk: false` | completion gate `focusOk && centerOk`；`cancelNavigationAnchor`；Layer A～D | **已實作**；Playwright 仍 fail → Phase Q/R | `6344baa` |

### 2.3q 共用根因（5 點）

Phase 2.3q 將多路徑症狀收斂為**共用 explicit 導覽管線**問題：

1. `flushPendingEditorFocus` 僅 `focusLanded` 即清 pending，不要求 `centerOk`
2. `releaseNavigationAnchor()` 不清 `_navAnchorLock`
3. filter anchor 無 `explicitNav` completion gate
4. `onAfterRender` 在 `setScrollTopDeferred` 之前觸發
5. 假游標 hide 不完整

**修正策略（Layer 0→B+D→A→C）**：

| Layer | 內容 |
|-------|------|
| 0 | `measureRowCenterDeltaPx`／`isCenterOk`（16px）、`withProgrammaticEditorFocus`、`cancelNavigationAnchor` |
| B | completion gate：`focusOk && centerOk`；rAF `gen`／`cancelGen` |
| D | `pointerdown` + `cancelPendingNavigationForUserInteraction`；手動點擊不 force center |
| A | `flushFilterAnchorAfterVirtRender` 升級 `explicitNav + forceVirtScroll` |
| C | 假游標持久守衛、`refreshAfterVirtRender` defer |

詳見 [`CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md)、[`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §3.18。

---

## 第四部分：Playwright 自動化驗收（Phase P/Q/R/S）（2026-07-02～03）

### 4.1 定案問題與測試範圍

**定案問題**：大檔（6333 句，`Test_Big.mqxliff`，`CatVirtGrid.isEnabled() === true`）virt **explicit centering 不穩**。

**測試環境**：離線版 `/cat/offline`；本機 `http://localhost:8080`；大檔 `Test_Big.mqxliff`、小檔 `Test_Small.mqxliff`（33 句）。

**Test A～I 一句話**：

| 測項 | 測什麼 |
|------|--------|
| **A** | 大檔 Ctrl+Enter 確認跳句後，焦點在譯文格且列置中（`\|rowCenterDeltaPx\| ≤ 16`） |
| **B** | 大檔編輯某句後設篩選再清除，須回到原編輯句、置中、無假游標 |
| **C** | Ctrl+Enter 啟動 explicit nav 後立即手動點另一列，須取消 stale nav |
| **D** | 小檔（非 virt）Ctrl+Enter 置中冒煙回歸 |
| **E** | Ctrl+F 後 `#sfInput` 須保持焦點 |
| **F** | 失敗可見性（`[catNav] flush failed`）；第一版難以穩定觸發 |
| **G** | F8 於前段已確認句，viewport 不應甩到遠端 |
| **H** | F8 後 `scrollTop` 變動 ≤2 次、`navAnchorLock === false` |
| **I** | 手動點另一可見譯文格，viewport 2s 內穩定、無離屏假游標 tip |

**置中要求邊界**：A、B、D 要求 `centeredOk`；C、I、G、H 不要求。

### 4.2 Phase P — 計畫對齊（已完成）

**目的**：兩份權威計畫與 Wave 1 事實一致；確立 **Phase P → Q → R → S** 執行權威流程。

**廢除的錯誤假設**：
- 「Test B 穩定 pass」
- 「B pass 表示 clear-filter 路徑安全」
- 「這只是 Ctrl+Enter confirm-jump bug」
- 「因為 B pass 所以與 filter-clear 無關」

**應採用說法**：Test A = 穩定 reproducer；Test B = 間歇 sibling failure；修復入口 = shared path。

### 4.3 Wave 1 與 Phase Q — 診斷量化（已完成，`fc06da4`）

**Wave 1**（`d15ad0b`）：
- Test A：修正點擊後仍 fail，`rowCenterDeltaPx ≈ 71.6`，`flush failed { failureReason: center, centerRetryCount: 3 }`
- Test B：批次 pass、單跑 fail（`rowCenterDeltaPx ≈ -32`）→ 間歇性
- G/H/I 修正 L1 問題後全 pass

**Phase Q**（診斷 log + `repeat-each`，**不改行為**）：

| 測項 | repeat | pass | fail | 失敗時 `rowCenterDeltaPx` |
|------|--------|------|------|---------------------------|
| Test A（兩輪合計） | 6 | 0 | 6 | ≈ +71.6（穩定） |
| Test B（兩輪合計） | 8 | 3 | 5 | fail 時多為 +72；Wave 1 曾 -32 |

**Phase Q 結論**：
- A/B 皆走 `explicitNav` + `scrollBlock: center` + 共用 `flushPendingEditorFocus`
- 偏離 phase：**`before center measure`**（scroll + focus 後仍偏）
- B fail 後 RO／`invalidateHeights` 連鎖，`scrollTop` 在 1053 ↔ 1436 ↔ 1674 跳動
- 進入 Phase R：**是**

詳見 [`CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md) §測試執行報告 Phase Q。

### 4.4 Phase R — 產品修復（已達驗收門檻，`21af736`）

#### 修復原則（6 步）

1. target row mount
2. CatVirtGrid scroll / center
3. wait renderWindow + setScrollTopDeferred + invalidateHeights settle
4. focus target editor（preventScroll）
5. measure center；`focusOk && centerOk` 才完成
6. retry 掛在 layout 事件後，非僅同 stack rAF×3

#### Phase R 迭代紀錄（13 序）

| 序 | 日期 | 動作 | 結果 |
|----|------|------|------|
| 1 | 07-03 | R1：表頭高度量測與 `computeCenterScrollTop` | `headerH` ≈71px 可讀，但 delta 仍 +71～+72；**假說排除** |
| 2 | 07-03 | 修正 `applyCenterScrollCorrection` 方向（`+= -delta`） | 符號正確，絕對值仍 ≈ +71 |
| 3 | 07-03 | 暫存診斷 spec（已刪除） | 發現 `bottomSpacer` 灌高，viewport 跳到 #6332/#6333 |
| 4 | 07-03 | 移除 `bottomSpacer` 灌高邏輯 | 回歸消除 |
| 5 | 07-03 | 修正 `cat-nav-assert.ts` `measureRowCenterDeltaPx` 括號 | 量測公式與產品端一致 |
| 6 | 07-03 | 實作 R3／R4；`readEditorGridHeaderPx` 整合 | commit `7d181f1` |
| 7 | 07-03 | Test A `repeat-each=3` | 執行中斷／逾時 |
| 8 | 07-03 | **寫入來源追蹤法**（Fable 5 建議） | 4 個 `scrollTop` 寫入點統一 log + 序號 |
| 9 | 07-03 | 跑 Test A 收集寫入時間軸 | `scrollTop` 穩定；但 `flush start` 無限重複，`activeSegId` 始終 `null` |
| 10 | 07-03 | 追查 `flushPendingEditorFocus` | **真正根因**：`forceVirtScroll` 無一次性語意 → 無窮重捲迴圈 |
| 11 | 07-03 | 新增 `_pendingVirtScrollIssued` 旗標 | `app.js` `?v=2.3r-phase-r13` |
| 12 | 07-03 | Test A `repeat-each=3` | **3/3 pass**（4.8～5.0s） |
| 13 | 07-03 | 全量矩陣 B×5、C/E、D、G/H/I | **全數 pass** |

#### 寫入來源追蹤法（方法論）

**做法**：在**每一個實際執行 `scrollEl.scrollTop = ...` 的地方**都加統一格式 log（`source`、`trigger`、`_catScrollWriteSeq`、`performance.now()`、寫入前後值），取代只在「階段」印一次的模糊做法。

**本輪關鍵發現**：
- `rowCenterDeltaPx` 量不到、`activeSegId=null` **不一定代表 scrollTop 被覆寫**
- 寫入時間軸顯示 `scrollTop` 很快就穩定在正確值
- 真正卡住的是**呼叫端邏輯**（`flushPendingEditorFocus` pre-focus scroll 無窮迴圈），從未進 focus
- 「畫面看起來沒置中」可能來自**完全不同層級**（渲染定位 vs. 流程控制）

#### 真正根因與修正

**根因**：
```js
// 舊邏輯（錯誤）
const needsScroll = pending.forceVirtScroll || !row || !isCenterOk(pending.segId);
```
`forceVirtScroll: true` **無一次性語意** — 每輪 flush 都 `needsScroll = true` → 重新 `scrollToSegId` → `return` 排下一輪 → **永遠不進 Step 2 focus**。

**修正**：
- 新增 `_pendingVirtScrollIssued`：`forceVirtScroll` 只觸發**一次** pre-focus scroll
- `needsScroll` 改為 `!row || (centerRetry>0 且未 centerOk) || (forceVirtScroll 且尚未 issued)`
- 4 處生命週期重置：`_navFlushSafeCleanup`、`cancelPendingNavigationForUserInteraction`、`scheduleEditorFocus`、flush 成功收尾

**併入的其他修復**：移除 `bottomSpacer` 灌高；R3 nav lock 保留；R4 `nav-failed-center`；`computeCenterScrollTop` 納入 `headerH`（模型正確，但非本輪症狀主因）。

#### 最終驗收結果

| 測項 | repeat | pass | fail | 門檻 |
|------|--------|------|------|------|
| Test A | 3 | 3 | 0 | 3/3 ✅ |
| Test B | 5 | 5 | 0 | 5/5 ✅ |
| Test C/E | 各 1 | 2 | 0 | 全 pass ✅ |
| Test D | 1 | 1 | 0 | pass ✅ |
| Test G/H/I | 各 1 | 3 | 0 | 全 pass ✅ |

### 4.5 Phase S（Wave 2）— 規劃中

| 項目 | 內容 | 狀態 |
|------|------|------|
| **Test I′** | 重複手動點擊壓力（3 ranges × 3 clicks = 9 attempts） | 優先，未執行 |
| **Test N** | Ctrl+G 跳句後手動點另一列，舊 explicit nav 不得再改 viewport | 延後 |
| **Test J/K** | 已確認／未確認句輸入 1～2 字 → 列重畫後 viewport 穩定 | 條件式 |
| **Backlog L/M** | TM guard 後編輯、tag／行高壓力 | 暫緩 |

A～I 為**代表性回歸網**，不是全面 repaint stress suite。

詳見 [`CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md) §Phase S。

---

## 第五部分：結論與已知邊界

### 已解決

- 大檔（>800 句）**離線版** CAT 編輯器的 explicit 導覽穩定性：
  - Ctrl+Enter 確認跳行並置中
  - 清除篩選回到編輯句並置中
  - 手動點擊取消 stale 導覽
  - F8 於已確認句 viewport 不甩窗
  - 手動點譯文格 viewport 穩定
- 虛擬捲動地基（Phase 2）、rowIdx 污染（`51815db`）、確認跳行置中（`bb324d2`）、即時捲動（`5b5aa3d`）

### 尚未涵蓋

| 項目 | 說明 |
|------|------|
| **團隊版** | 本計畫僅 `/cat/offline`；Supabase 雲端同步大檔捲動未實測 |
| **Wave 2** | Test I′、N、J/K、backlog L/M 未執行 |
| **窮舉覆蓋** | A～I 為代表性回歸網；任何重畫都可能 viewport／焦點亂跳 |
| **2.3o** | 審稿外圈 2.5px 視覺微調已實作，待驗收 |
| **2.3k 補測** | 批 B（30～33）、Ctrl+Enter 連跳、tip 貼頂方向等 |

### 禁止修法（避免踩雷）

- 勿放寬 `centeredOk` 16px 門檻
- 勿盲目增加 `centerRetryCount`（如 3→10）
- 勿只硬修 Ctrl+Enter handler、忽略 Test B
- 勿把手動點擊 / F8 / typing 改成 force center
- 勿整包重寫 `CatVirtGrid`

---

## 附錄 A：原始文件索引

| 文件 | 一句話定位 |
|------|-----------|
| [`CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md`](./CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md) | 全量 DOM 時代確認跳行置中被 focus 蓋掉 |
| [`CAT_EDITOR_LARGE_FILE_PERF_2026-06.md`](./CAT_EDITOR_LARGE_FILE_PERF_2026-06.md) | 6333 句大檔遲鈍調查；Phase 1～2.2 虛擬捲動導入 |
| [`CAT_SCROLL_INSTANT_NAVIGATION_2026-06.md`](./CAT_SCROLL_INSTANT_NAVIGATION_2026-06.md) | 系統跳焦點移除 smooth 動畫 |
| [`bug-report_virt-scroll-confirm-nav-rowidx_2026-06.md`](./bug-report_virt-scroll-confirm-nav-rowidx_2026-06.md) | rowIdx 污染、確認不跳行、重複句 DOM |
| [`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) | Phase 2.3 主紀錄（Tag、假游標、篩選、2.3b～2.3q） |
| [`CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md) | 2.3q 共用 explicit 導覽完成條件實作計畫 |
| [`CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md) | Playwright Phase P/Q/R/S 自動化驗收與 Phase R 根因排查 |

---

## 附錄 B：關鍵詞彙對照

| 術語 | 白話說明 |
|------|----------|
| **CatVirtGrid** | 大檔（>800 句）時啟用的虛擬捲動模組；只掛載視窗內約 69 列，其餘以 spacer 佔位 |
| **explicit centering** | 系統主動導覽（Ctrl+Enter、清除篩選回句等）時，須把目標列捲到畫面中央 |
| **centeredOk** | 目標列中心與 `#editorGrid` 視窗中心偏差 ≤16px |
| **rowCenterDeltaPx** | 上述偏差的像素值；正數表示列偏下 |
| **navAnchorLock** | 導覽進行中鎖定錨點，避免 ResizeObserver 重畫把 viewport 拉回 |
| **forceVirtScroll** | 強制觸發一次 virt 捲動；Phase R 前無一次性語意，造成無窮迴圈 |
| **_pendingVirtScrollIssued** | Phase R 修正：標記 pre-focus scroll 已執行過，避免重複 |
| **flushPendingEditorFocus** | 大檔導覽完成閘門：先 scroll → focus → measure center → 雙 OK 才完成 |
| **onAfterRender** | virt 重畫完成後回呼；觸發 `flushPendingEditorFocus` |
| **display # vs segId** | 藍卡「第 N 號句段」為 display index；assert 須同時記 `data-seg-id` |

---

## 附錄 C：完整 commit 時序表

| Commit | 日期 | 內容 |
|--------|------|------|
| `bb324d2` | 2026-05-08 | 確認跳行置中：focus preventScroll + rAF scrollIntoView |
| `5b5aa3d` | 2026-06-10 | 系統跳焦點一律即時捲動（smooth → auto） |
| `2d32f1b` | 2026-06-28 | Phase 1：focus 增量更新、TM debounce |
| `56c3386` | 2026-06-28 | Phase 2 虛擬捲動初版 |
| `c56cadc`～`5658762` | 2026-06-28 | Phase 2.1～2.2：錨點、suppress、debounce、F4 資料層 |
| `51815db` | 2026-06-29 | rowIdx 污染、確認不跳行、TB offpage |
| `0670242` | 2026-06-29 | Phase 2.3 基線 |
| `694fa81` | 2026-06-29 | Phase 2.3b 假游標 scroll 競態 |
| `0a073ea` | 2026-06-29 | Phase 2.3c 焦點管線（驗收未通過） |
| `42bbd17`～`e147c10` | 2026-06-29 | Phase 2.3d～2.3j |
| `3d6030d` | 2026-06-30 | Phase 2.3k |
| `09737ab` | 2026-06-30 | Phase 2.3l |
| `5e9925a` | 2026-07-01 | Phase 2.3n 審稿外圈 + TB |
| `649ef70` | 2026-07-02 | Phase 2.3p hotfix |
| `6344baa` | 2026-07-02 | Phase 2.3q completion gate |
| `d15ad0b` | 2026-07-02 | Wave 1 Playwright |
| `fc06da4` | 2026-07-02 | Phase Q 診斷量化 |
| `7d181f1` | 2026-07-03 | Phase R R3/R4、bottomSpacer 移除 |
| `21af736` | 2026-07-03 | Phase R 根因修復：`_pendingVirtScrollIssued` |

---

*本文件最後更新：2026-07-03。後續 Wave 2 或團隊版驗收完成後，請更新「狀態總覽」與「第五部分：已知邊界」。*
