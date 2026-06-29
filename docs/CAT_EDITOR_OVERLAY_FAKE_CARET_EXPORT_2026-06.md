# CAT 編輯器疊層 UI：匯出標籤警告與假游標掛載

> **狀態**：**Phase 2.3j 已實作，待驗收**；**virt 持久化** Phase 2.3 **`0670242`** + **2.3b** `694fa81` + **2.3c～2.3i**（`e17ff35`）+ **2.3j** 浮層死結就地建立 — 見 [`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §2.2b／§2.6～§2.13
> **程式觸點**：[`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)、[`cat-tool/style.css`](../cat-tool/style.css)、[`cat-tool/index.html`](../cat-tool/index.html)  
> **相關**：[`CAT_FAKE_CARET_REAL_TIP_ONE_CLICK_PLAN.md`](./CAT_FAKE_CARET_REAL_TIP_ONE_CLICK_PLAN.md)、[`CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md`](./CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md) §3.13

本文採雙層結構：**Part 1** 白話（現象、決策、驗收）；**Part 2** 技術（根因、DOM、觸點、實作順序）。

---

## Part 1 — 白話摘要

### 1.1 問題 A：匯出鎖定擋住標籤警告

**現象**：按「匯出檔案」後，若系統偵測到多筆 tag 可能有問題，會跳出「標籤警告」視窗；但畫面上同時出現全螢幕「正在準備匯出…」，蓋在警告上面，無法點「取消（返回編輯）」或「繼續匯出」。

**原因（一句話）**：全螢幕載入層的層級比對話框高，且匯出流程在顯示警告前就一直開著這層鎖定。

### 1.2 問題 B：假游標與提示蓋住其他區塊

**現象**：離開譯文格後出現的藍色假游標，或「游標／暫存游標位於第 N 號句段」提示，會疊在 AI 批次翻譯、選擇準則、底下筆記區等畫面上。

**原因（一句話）**：假游標貼在整個網頁最外層，且層級與對話框相近，不像只屬於譯文表格區。

### 1.3 產品決策（已確認）

| 議題 | 決策 |
|------|------|
| 單檔匯出進度 | **僅**按鈕變灰、文字「匯出中…」；**不**使用全螢幕 `#catLoadingOverlay` |
| 假游標掛載 | 掛在譯文表格外框 `#editorGrid` 內的專用層 |
| 對話框開啟時 | 暫時隱藏假游標與提示 |
| 對話框關閉後 | **自動恢復**（若仍記得先前游標位置） |
| 筆記區 | 以表格內掛載解決，不另做第二階段掛載重構 |

### 1.4 驗收清單（白話）

**匯出**

1. 開啟有 tag 問題的 XLIFF／mqxliff，按「匯出檔案」→ 按鈕顯示「匯出中…」，**不要**出現全螢幕「正在準備匯出…」。
2. 「標籤警告」可正常點「取消（返回編輯）」與「繼續匯出」。
3. 若跳出「仍要匯出嗎？」（句段對應問題）確認框，也可正常點選。

**假游標**

4. 在譯文格打字後點到別處 → 藍線與提示只出現在**中間譯文表格區**，不蓋右邊 TM／QA 欄、不蓋底下筆記。
5. 開「AI 批次翻譯」或「選擇適用準則」→ 假游標與提示先消失；關閉後**自動**回到先前句段的提示（若你還沒點回該譯文格）。
6. 點提示捲到第 N 句、Ctrl+Alt+↓ 等既有行為仍正常（見 [`CAT_FAKE_CARET_REAL_TIP_ONE_CLICK_PLAN.md`](./CAT_FAKE_CARET_REAL_TIP_ONE_CLICK_PLAN.md)）。

---

## Part 2 — 技術細節

### 2.1 根因：匯出 overlay

| 元素 | z-index | 檔案 |
|------|---------|------|
| `#catLoadingOverlay` | 99998 | [`cat-tool/index.html`](../cat-tool/index.html) 約 L16 |
| `.modal-overlay`（含 `#exportTagWarningModal`） | 10050 | [`cat-tool/style.css`](../cat-tool/style.css) 約 L108 |
| `#catGenericConfirmModal` | 10100 | `style.css` 約 L123 |

流程：[`cat-tool/app.js`](../cat-tool/app.js) `exportBtn` 先 `showCatLoadingOverlay('正在準備匯出…')`，再 `showExportTagWarning`。

先例：開 mqxliff 時於 `showMqRoleModal` **前** `hideCatLoadingOverlay()`（`app.js` 約 13954–13972）。

### 2.2 匯出修正

- 單檔 `exportBtn`：**移除** `showCatLoadingOverlay`；保留 `exportBtn.disabled` + `textContent = '匯出中...'`；`finally` 仍 `hideCatLoadingOverlay()`（無害）並還原按鈕。
- `showExportTagWarning`：開 modal 前 `hideCatLoadingOverlay()`（防禦）。

### 2.3 假游標 DOM 模型

```
#editorGrid (overflow: auto; position: relative)
├── .grid-header-row (sticky, z-index: 20)
├── #catEditorChromeLayer (absolute inset 0; z-index: 25; pointer-events: none)
│   ├── .cat-fake-caret
│   ├── .cat-fake-caret-scroll-tip (fake)
│   └── .cat-fake-caret-scroll-tip (real)
└── #gridBody (.grid-data-row …)  ← innerHTML 清空時不刪 chrome 層
```

chrome 層與 `#gridBody` 為**兄弟**，避免 `gridBody.innerHTML = ''` 刪除假游標節點。

### 2.4 座標

- `show()`／`showRealCaretTipIfNeeded()`：以 `#editorGrid.getBoundingClientRect()` 為基準，子元素 `position: absolute`，`left/top` = 視窗座標 − `gridRect.left/top`（並 clamp 於 grid 可視區）。
- 捲出可視：tip 使用層內 `top: 4px` 或 `bottom: 36px`；水平錨點仍為 `.col-target` 左緣換算至層內。

### 2.5 捲動監聽

[`cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)：`#editorGrid` 的 `scroll` + 既有 `window` scroll（capture）／`resize`。

### 2.6 Modal 互斥

[`app.js`](../cat-tool/app.js)：

- `suppressCatFakeCaretForOverlay()`：`catFakeCaret.hide()` + `hideRealCaretTip()`；遞增 suppress 計數（巢狀 modal）。
- `resumeCatFakeCaretAfterOverlay()`：計數歸零後，若有 `getSaved()` 則 `showCatFakeCaretFromSaved()`。
- 接線：`showExportTagWarning`、`openCatConfirmModal`；`MutationObserver` 監看 `.modal-overlay`／`.wizard-overlay` 的 `hidden` class（涵蓋 AI 批次、選準則等）。

### 2.7 z-index

| 層 | z-index |
|----|---------|
| `#catEditorChromeLayer` | 25 |
| `.grid-header-row` | 20 |
| `.modal-overlay`／`.wizard-overlay` | 10050（wizard 由 9999 調齊） |
| 假游標 tip | **勿**再用 10050（改在 chrome 層內） |

### 2.8 範圍外

- 批次匯出（約 6430）：tag 問題以 `alert` 彙總，無 `#exportTagWarningModal`。
- TM 匯出（約 10264）仍可使用 `#catLoadingOverlay`（本次不變）。

### 2.9 程式觸點表

| 檔案 | 符號／區塊 |
|------|------------|
| `cat-tool/app.js` | `exportBtn` listener、`showExportTagWarning`、`openCatConfirmModal`、`suppressCatFakeCaretForOverlay`、`resumeCatFakeCaretAfterOverlay` |
| `cat-tool/js/cat-fake-caret.js` | `ensureEditorChromeLayer`、`show`、`showRealCaretTipIfNeeded`、`installGlobalListeners` |
| `cat-tool/style.css` | `.cat-editor-chrome-layer`、`.cat-fake-caret`、`.cat-fake-caret-scroll-tip`、`.wizard-overlay` |
| `cat-tool/index.html` | 可選靜態 `#catEditorChromeLayer`（或由 JS 建立） |

### 2.10 實作順序

1. 本文件與索引更新  
2. 匯出：移除 overlay  
3. 假游標：chrome 層 + 座標 + CSS  
4. Modal suppress／resume + observer  
5. `npm run sync:cat`、驗收、更新本檔狀態與 commit  

### 2.11 推送紀錄

| commit | 說明 |
|--------|------|
| `bb2c269` | 單檔匯出移除全螢幕 loading；假游標掛 `#catEditorChromeLayer`；modal 互斥 observer |

### 2.12 virt 持久化（Phase 2.3，2026-06-29）

**症狀**：大檔（>800 句、虛擬捲動）編輯譯文後點右欄 TM，假游標／提示消失；virt `replaceChildren` 後 `document.body.contains(saved.editor)` 恒 false。

**修正**（[`cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)）：

- `saveFromSelection` 改存 `{ segId, plainOffset }`（不再只綁 DOM Range）
- `resolveSavedEditor` / `rebuildRangeForSaved`：經 `ensureEditorMountedForSegId` + `buildCollapsedRangeAtPlainTextOffsetUsingSegments` 重建
- `CatVirtGrid.onAfterRender` → `refreshAfterVirtRender()`
- 確認跳行 blur 設 `_skipFakeCaretOnBlurOnce`，避免誤在舊句顯示假游標

**Phase 2.3b（scroll 競態）**：`show()`／`refreshAfterVirtRender` **不得**在列未掛載時 `scrollToSegId`；僅 `restore`／tip 點擊／Ctrl+Alt+↓ 等**使用者導覽**才捲動。見 [`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §2.2b。

**驗收**：Riftbound 6333 句 — 編輯句 A → 點 TM → 假游標可見；自由捲動不拉回；Ctrl+Alt+↓ 捲回仍有效。

### 2.13 Phase 2.3c — 離屏 tip 頂/底 + restore 委派 app（2026-06-29）

**問題**：2.3b 後列未掛載時 `showOffScreenFakeTip(true)` 固定貼頂；`restore()` 自行 focus 後被 virt 重畫吃掉。

**修正**：

- Deps 新增 `getSegListIndex`、`getVirtWindowStartIndex`（`CatVirtGrid.getWindowStartIdx()`）
- 列未掛載：`listIdx < windowStart` → tip **頂**；否則 → tip **底**
- `restore()`、`navigateToSegmentBySegId` 改呼叫 app 注入的 `scheduleEditorFocusForSaved`（virt 重畫後 flush）
- 被動 `show()`／`refreshAfterVirtRender` 仍 `{ scroll: false }`

**驗收**：§1.3 項 10～11（[`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md)）。

### 2.14 Phase 2.3d — 捲動重畫與編輯焦點邊界（2026-06-29）

**問題**：使用者在譯文格編輯時滾輪捲動 → virt `replaceChildren` → 焦點丟失（僅剩 `selected-row`）。

**修正**（app `onBeforeRender`／`onAfterRender`）：

- 重畫前擷取 active `.grid-textarea` 的 `segId` + `plainOffset` → `_preserveFocusAcrossVirtRender`
- 重畫後若無譯文格焦點且無顯式 pending → `scheduleEditorFocus` 還原
- **被動** `show()`／`refreshAfterVirtRender` 仍不 `scrollToSegId`（2.3b 邊界不變）

**驗收**：§1.3 項 12～14。

### 2.15 Phase 2.3f — onAfterRender 順序與 editing preserve（2026-06-29）

**問題**：2.3e `refreshAfterVirtRender` 在 `flushEditorFocusAfterVirtRender` **之前** → tip 在焦點還原前判斷，不顯示或狀態錯。

**修正**：

- `onAfterRender`：**先** `flushEditorFocusAfterVirtRender`，**再** `refreshAfterVirtRender`
- 滾輪編輯：`_preserveEditingAcrossVirtRender` → `applyEditorFocusAtSegId({ skipVirtScroll: true })`（不 `scheduleEditorFocus`）

**驗收**：§1.3 項 14、19、20。

### 2.16 Phase 2.3g — editing preserve 與假游標互斥（2026-06-29，2.3h 撤回）

**問題**（2.3f `927ceec`）：假游標不繪製；離屏 tip 不出現。

**作法**：`_suspendEditingPreserve`（2.3g `e84f06d`）— **產品驗收未通過**（黏滯導致確認後掉焦）；2.3h **移除**，改「焦點遺失才還原 preserve」。

### 2.17 Phase 2.3h — 疊層 fixed 化／移除 suspend（2026-06-29）

**問題**（2.3g `e84f06d` 後）：確認後約一秒掉焦；假游標不繪製；捲動後 tip 消失或落在句段中間。

**根因**：`#catEditorChromeLayer` `absolute` 在 `overflow:auto` 內隨內容捲走；`_suspendEditingPreserve` 黏滯阻擋 resize 重畫 preserve。

**修正**（[`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)、[`cat-tool/style.css`](../cat-tool/style.css)）：

- `.cat-editor-chrome-layer` 改 `position:fixed`；append `document.body`。
- `syncChromeLayerRect()`：以 `#editorGrid.getBoundingClientRect()` 設 left/top/width/height；隱藏時 `display:none`。
- scroll／resize／`ResizeObserver(editorGrid)` → 同步矩形後 `repaintChromeOverlays()`。
- 真／假游標 tip 維持貼編輯區頂（`top:4px`）／底（`bottom:4px`）。
- [`cat-tool/app.js`](../cat-tool/app.js)：移除 `_suspendEditingPreserve`；`isEditingFocusLostAfterVirtRender()` 僅 `BODY`／`null` 時還原 preserve。

**驗收**：§1.3 項 11、19、21、22；項 14 regression。

### 2.18 Phase 2.3i — 離窗 tip 與 preserve 分流（2026-06-29）

**問題**（2.3h `ffe459d` 後）：捲動後提示卡仍不顯示（項 3／5）。

**修正**（[`cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)、[`app.js`](../cat-tool/app.js)）：

- `flushEditorFocusAfterVirtRender`：焦點遺失且句段**未掛載**於虛擬視窗 → 不 `applyEditorFocusAtSegId`，改 `refreshAfterVirtRender()`。
- `isSavedSegMountedInWindow`：`refreshAfterVirtRender`／`show` 未掛載時一律 `showOffScreenFakeTip`（`resolveOffScreenTipAbove` 貼頂／底）。

**驗收**：§1.3 項 3、5、11、19、21、22。

### 2.19 Phase 2.3j — 浮層死結就地建立（2026-06-29）

**問題**（2.3i `e17ff35` 後，問題 1）：假游標／離屏提示卡／真游標卡**完全**不繪製，且編輯區失焦時也畫不出假游標——非定位問題，而是浮層 `#catEditorChromeLayer` 從未被建立。

**根因（死結）**：所有繪製入口首行 `if (!syncChromeLayerRect()) return;`，而 `syncChromeLayerRect` 在浮層不存在時即 `return false`；唯一建立浮層的 `ensureEditorChromeLayer` 只在 `appendToChromeLayer`（經 `ensureFakeEl/ensureFakeTipEl/ensureRealTipEl`）內被呼叫，全部排在該關卡之後 → 永遠建不出來（自 2.3h `position:fixed` 改動起）。

**修正**（[`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)）：

- `syncChromeLayerRect`：找不到浮層時就地 `layer = ensureEditorChromeLayer()` 再續；仍為 null 才 `return false`。
- `ensureEditorChromeLayer`：移除結尾自呼叫的 `syncChromeLayerRect()`（避免遞迴；定位由各入口負責）。

**驗收**：§1.3 項 23（含項 11、19、22 連帶恢復）。
