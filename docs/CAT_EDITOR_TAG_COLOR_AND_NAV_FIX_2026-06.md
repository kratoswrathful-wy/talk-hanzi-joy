# CAT 編輯器：Tag 著色、假游標、清除篩選、確認跳行（Phase 2.3）

> **狀態**：**Phase 2.3h 已實作，待驗收**（2026-06-29；2.3g `e84f06d` 三症狀未解 → 2.3h 疊層 fixed 化／移除 suspend／焦點遺失才還原）
> **樣本**：`54316_02_WORDNT_RiftboundCoreRulesRUP4Sta_v2_zh_TW.docx_zho-TW.mqxliff`（6333 句）  
> **程式觸點**：[`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)、[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)  
> **相關**：[`bug-report_virt-scroll-confirm-nav-rowidx_2026-06.md`](./bug-report_virt-scroll-confirm-nav-rowidx_2026-06.md)（`51815db` rowIdx）、[`CAT_EDITOR_LARGE_FILE_PERF_2026-06.md`](./CAT_EDITOR_LARGE_FILE_PERF_2026-06.md)、[`CAT_EDITOR_OVERLAY_FAKE_CARET_EXPORT_2026-06.md`](./CAT_EDITOR_OVERLAY_FAKE_CARET_EXPORT_2026-06.md)

本文採雙層結構：**Part 1** 白話；**Part 2** 技術與維護。

---

## Part 1 — 白話摘要

### 1.1 四項現象

| # | 現象 | 使用者體感 |
|---|------|------------|
| A | Tag pill 肉眼正確，原文全紅、譯文全橘 | 「tag 都對了，系統還在報錯」 |
| B | 假游標／Ctrl+Alt+↓ 大檔失效 | 離開譯文格後找不到暫存游標 |
| C | 清除篩選跳回第一行 | 應回到最後編輯位置 |
| D | 確認後跳行／置中／焦點異常 | 跳到已確認句、只選列不進編輯格、後方全確認時游標消失 |

### 1.2 決策摘要

- **同一輪**修正 A～D（大檔 virt 與 tag 簽名互不重疊但同批交付）。
- **Tag 著色**與 **reconcile** 共用「略過 `rid`／`id`」的正規化；F8 在佔位齊全時仍執行 reconcile。
- **執行官**身分：跳向「翻譯已確認、待審稿」可能為預期；跳向「審稿已確認」屬 bug（本輪 D 修正 focus 路徑）。

### 1.3 驗收清單

1. **Tag**：Riftbound 句 838 pill 以**藍**為主；832 仍藍；**Ctrl+F5** 硬重載。
2. **假游標**：大檔句 A 編輯 → 點右欄 TM → 假游標或捲動提示可見；**Ctrl+Alt+↓** 捲回；virt 捲動後仍有效。
3. **清除篩選**：篩選中編輯句 800+ → 清除篩選 → 畫面停該句（非第一行）。
4. **確認跳行**：設定「下一個尚未確認」+「置中」→ **Ctrl+Enter** → 焦點進下一句譯文格、畫面置中；後方全已確認 → toast、焦點不憑空消失。
5. **小檔 ≤800**：3、4 regression。
6. **自由捲動（2.3b）**：大檔往下捲 800+ → **不**持續跳回第一行；有暫存假游標時仍可自由捲動（僅顯示提示，不強制拉回暫存句）。
7. **Ctrl+G + 假游標（2.3b）**：句 A 編輯 → 點 TM 產生暫存游標 → **Ctrl+G** 跳 838 → 畫面到 838、焦點進譯文格。
8. **確認可打字（2.3c／2.3f 通過，2.3g regression 必驗）**：大檔 **Ctrl+Enter** 確認跳行 → 下一句**譯文格內可打字**（非僅選列）。
9. **清除篩選回假游標句（2.3h 目標）**：篩選中編輯 → 清除篩選 → 回到**假游標 segId 那句**；譯文格有焦點。
10. **Ctrl+Alt+↓ 還原游標（2.3g 強制置中，2.3h regression）**：捲回暫存句 + **游標在譯文格**（可打字）。
11. **離屏假游標提示（2.3h 目標）**：點 TM 後捲遠 → 「暫存游標…」提示在編輯區**頂或底**可見、位置正確。
12. **確認跳行可打字（2.3d／2.3f 通過，2.3g regression 必驗）**：#17 **Ctrl+Enter** → #385 → 譯文格可打字（`activeElement` 含 `grid-textarea`）。
13. **方向鍵 segId（2.3d／2.3f 通過，2.3g regression 必驗）**：#385 游標在第一行按 **↑** → **#384**，非 #17。
14. **滾輪保焦（2.3d／2.3f 通過，2.3g regression 必驗）**：譯文格有游標時滾輪捲動 → 仍可打字，焦點不變 `BODY`。
15. **清除篩選不空白（2.3d／2.3f 通過，2.3g regression 必驗）**：篩選中編輯 → 清除篩選 → 畫面不空白；停假游標句 + 譯文格可編輯。
16. **確認跳行置中（2.3e／2.3f 通過，2.3g regression 必驗）**：大檔 **Ctrl+Enter** 跳行（設定「置中」）→ 遠距亦**置中**且可打字。
17. **清除篩選置中（2.3f 未通過，2.3g 目標）**：篩選中編輯 → 清除篩選 → 停在假游標句並**置中**、不亂跳。
18. **進篩選模式置中（2.3f 未通過，2.3g 目標）**：切換至篩選模式 → 以假游標句**置中**顯示。
19. **假游標 tip 顯示（2.3h 目標）**：編輯句 A → 點 TM → 捲到遠處 → tip 卡片在編輯區**頂或底**可見、位置正確。
20. **自由捲動不拉回（2.3g 目標，2.3h regression）**：編輯中滾輪捲離 → **不**被拉回暫存句；Ctrl+G 後手動捲動亦不被錨點拉回。
21. **確認後不掉焦（2.3h）**：大檔 **Ctrl+Enter** 確認跳行 → 新句**停留可打字超過 3 秒**（resize 重畫不掉焦）。
22. **真游標離屏 tip（2.3h）**：譯文格內編輯 → 捲離 → 「游標在第 N 句」卡片在編輯區**頂或底**、位置正確。

**2.3b regression（2.3d～2.3h 一併驗）**：自由捲動不拉回第一行；Ctrl+G 838 仍有效；**Ctrl+Alt+↓ 一次**還原可打字。

### 1.4 已知邊界

- 略過 `id` **不**解 Word／TM **結構錯位**（Bug #10／#11）；若 838 仍全紅橘，另開 Word rpr 結構調查。
- Bug #12：`val` 不同仍應紅橘或 QA 警告。

---

## Part 2 — 技術細節

### 2.1 Tag 著色 id 假陽性（A）

**根因**：`normalizeTagXmlForReconcile`（匯入／F8）已略 `id`；`normalizeXmlForSig`（著色）未略 → memoQ 原文／譯文各自 `id` 不同 → 整排紅橘。F8 佔位齊時 reconcile 認為「相同」不覆寫。

**修正**：

- `normalizeXmlForSig` 改委派 `CatToolXliffTags.normalizeTagXmlForReconcile`（單一來源）。
- `insertNextMissingTag` 在 `!missingTags.length` 時仍呼叫 `reconcileTargetTagsMarkupFromSource`（簽名已對齊後仍可比對 `val` 等）。

### 2.2 假游標 virt 持久化（B）

**根因**：`saved.editor`／`saved.range` 綁定 virt 重畫前 DOM。

**修正**：`cat-fake-caret.js` 存 `segId` + `plainOffset`；`ensureEditorMounted(segId)` + `buildCollapsedRangeAtPlainTextOffsetUsingSegments` 重建；`CatVirtGrid.onAfterRender` 刷新 `show()`。

#### 2.2b Phase 2.3b 回歸 — 假游標 scroll 競態（`0670242` 後）

**症狀**：Phase 2.3 部署後 — 往下捲被**持續拉回第一行**；**Ctrl+G** 838 像沒反應。

**根因**：被動路徑 `show()`／`refreshAfterVirtRender()` 綁在每次 scroll + virt `onAfterRender`，內部 `resolveSavedEditor()` 無條件 `scrollToSegId(暫存句)`，與 Phase 2.1「scroll 僅限 app.js 明確導覽」衝突。與 Phase 2.1c「飄回第一行」**同族不同觸點**（見 [`CAT_EDITOR_LARGE_FILE_PERF_2026-06.md`](./CAT_EDITOR_LARGE_FILE_PERF_2026-06.md)）。

**修正（mount 雙模式）**：

| 路徑 | `scrollToSegId` |
|------|-----------------|
| `show()`、`refreshAfterVirtRender`、`getSearchNavAnchorCollapsed` | **否** — `queryEditorForSegId` 或 `{ scroll: false }` |
| `restore()`、`navigateToSegmentBySegId`、Ctrl+Alt+↓、Ctrl+G | **是** — 經 `scheduleEditorFocus`（Phase 2.3c）；virt 重畫後 flush |

### 2.3 清除篩選跳位（C）

**根因**：`btnSfClearNav` 用 `rows[全檔索引]`；`runSearchAndFilter` 在 focus 後 `invalidateHeights()` 重設 scrollTop。

**修正**：以 `segId` + `scrollToSegId`；invalidate 後再錨定 `_scrollAnchorSegIdAfterFilter`。

### 2.4 確認跳行（D）

**根因**：大檔 `focusTargetEditorAtSegmentIndex` 無 scroll／center；單句 Ctrl+Enter 未用 `_pendingFocusSegIdxAfterRender`；`nextFocus === null` 無 fallback。

**修正**：virt 與非 virt 共用 scrollToSegId + scrollIntoView + focus；單句／批次確認經 **`scheduleEditorFocus`**（Phase 2.3c）；null 時 toast + 留焦／假游標；確認 blur 略過假游標。

### 2.5 與 `51815db` 的關係

`51815db` 修 rowIdx／五態搜尋／`getGridRowBySegId`。本輪為 **Phase 2.3 延伸**（focus 路徑、invalidate 順序、tag sig），非 rowIdx 回歸。

### 2.6 Phase 2.3c — 焦點／游標管線（2026-06-29）

**症狀（2.3／2.3b 通過後殘留）**：

1. 移出畫面的假游標提示卡片固定貼頂、體感「不見」
2. 清除篩選焦點回錯行；Ctrl+Alt+↓ 只選列不進譯文格
3. 確認跳行只選列、不進譯文格

**根因**：大檔 virt `replaceChildren` 重畫 DOM 時，**focus／Range 在重畫前或重畫中執行**；`onAfterRender` 僅首次 mount 呼叫 `finishEditorGridRender()`，後續 `scrollToSegId` 觸發的重畫**不會** flush pending focus。

**修正**（[`cat-tool/app.js`](../cat-tool/app.js)）：

| API | 語意 |
|-----|------|
| `_pendingEditorFocus` | 取代 `_pendingFocusSegIdxAfterRender`（單一來源） |
| `scheduleEditorFocus(opts)` | 大檔 virt 排入 pending；小檔立即 `applyEditorFocusAtSegId` |
| `flushPendingEditorFocus()` | 每次 `onAfterRender` 雙 rAF 執行；缺列時 `scrollToSegId` 再等下一輪 |
| `applyEditorFocusAtSegId` | focus + 可選 plainOffset 還原 + scrollIntoView |

**觸點改接**：Ctrl+Enter 單句確認、批次確認、`runSearchAndFilter`（invalidate 後錨定）、Ctrl+G／`_qaJumpToSegment`、`cat-fake-caret` restore／tip 導覽。

**清除篩選錨點**：`getScrollAnchorSegId()` — **假游標 segId 優先**，其次 `lastEditedRowIdx`。

**與 2.3b 邊界**：被動 `show()`／`refreshAfterVirtRender` 仍 `{ scroll: false }`；僅使用者導覽與 pending flush 才 scroll／focus。

**離屏 tip**（[`cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)）：列未掛載時 `listIdx < windowStart` → 提示貼**頂**；否則貼**底**（`CatVirtGrid.getWindowStartIdx()`）。

### 2.7 Phase 2.3d — 跨 virt 重畫焦點還原 + 方向鍵 + 清除篩選（2026-06-29）

**2.3c 驗收未通過**（`0a073ea`）：確認跳行只選列；#385 按 ↑ 回 #17；滾輪／手動點譯文格焦點退出；清除篩選空白。

**根因（與 2.3c 互補）**：

1. virt 下 `applyEditorFocusAtSegId` 仍 `row.scrollIntoView`（置中延遲 rAF）→ 第二次重畫吃掉焦點；pending 過早清除
2. 一般捲動重畫無「還原正在編輯那句」邏輯
3. ↑／↓ 用 DOM `indexOf` 誤當全檔索引（#385 DOM 17 → #17）
4. `invalidateHeights()` 無 anchor → 列高清空後 scrollTop 錯位空白

**修正**（[`cat-tool/app.js`](../cat-tool/app.js)、[`grid-virtual-scroll.js`](../cat-tool/js/grid-virtual-scroll.js)）：

| 項目 | 作法 |
|------|------|
| `_preserveFocusAcrossVirtRender` | `onBeforeRender` 擷取譯文格 `segId`+`plainOffset`；`onAfterRender` 無焦點時還原 |
| virt focus | 禁止 `row.scrollIntoView`；捲動僅 `scrollToSegId`；pending 僅 focus 成功後清除 |
| 方向鍵 | `focusAdjacentTargetRow` 讀 `data-seg-id` → `scheduleEditorFocus` |
| 清除篩選 | `invalidateHeights(anchorSegId)` 先錨定再重算 |

**優先序**：顯式 `_pendingEditorFocus` 優於 preserve；`scheduleEditorFocus` 會清除 preserve。

### 2.8 Phase 2.3e — virt 置中 + preserve 修正 + 篩選置中（2026-06-29）

**2.3d 部分驗收未通過**（`42bbd17`）：確認跳行置中失效（置頂或不動）；假游標視覺／tip 不顯示；清除篩選與進篩選模式畫面跑掉。

**根因**：

1. virt `scrollToSegId`／`invalidateHeights` 固定 `scrollTopFromAnchor(offsetPx=0)` → **置頂**
2. `_preserveFocusAcrossVirtRender` 邏輯反向：自由捲動也擷取 → `flushEditorFocusAfterVirtRender` 拉回 → `selectionchange` 隱藏假游標
3. 進篩選／清除篩選錨定同 (1)，未置中

**修正**：

| 項目 | 作法 |
|------|------|
| virt 置中 | `renderWindow`／`scrollToSegId`／`invalidateHeights` 加 `block`（`'center'`／`'start'`）；新增 `centerOnSegId`（row 已在 DOM 時輕量置中） |
| preserve | `captureEditingFocusBeforeVirtRender` 改為 **僅** `_pendingEditorFocus` 存在時擷取 |
| pending scroll | `scheduleEditorFocus` 加 `scrollBlock`（預設 `'center'`）；`flushPendingEditorFocus` 傳 block + focus 後 `centerOnSegId` |
| 篩選 | `runSearchAndFilter` → `invalidateHeights(anchor, 'center')` |

**與 2.3b 邊界**：被動 `show()`／`refreshAfterVirtRender` 仍 `{ scroll: false }`；自由捲動不觸發 preserve。

### 2.9 Phase 2.3f — 焦點管線修正（2026-06-29）

**2.3e 部分驗收未通過**（`78818d0`）：遠距跳行不能打字；篩選亂跳；假游標 tip 不顯示；項 14 回歸；項 20 通過。

**根因**：`centerOnSegId` 雙重捲動 + pending 過早清除；preserve 僅 pending 導致滾輪不保焦；`onAfterRender` 先 refresh 假游標再 flush 焦點。

**修正**：

| 項目 | 作法 |
|------|------|
| 雙軌 preserve | `_preserveEditingAcrossVirtRender` 滾輪就地 `applyEditorFocus`（不 scroll）；pending 交 flush |
| 單次 center | 移除 flush 後 `centerOnSegId`；`scrollToSegId(block)` + `isSegIdCentered` |
| pending gen | 多輪重畫後 focus 成功才清 pending |
| 順序 | `onAfterRender` 先 flush 再 `refreshAfterVirtRender` |
| 篩選 | `invalidateHeights` 後 `scheduleEditorFocus({ skipVirtScroll: true })` |

### 2.10 Phase 2.3g — 篩選錨定／假游標 suspend／錨點釋放（2026-06-29）

**2.3f 部分驗收未通過**（`927ceec`）：項 8、12～16 通過；9、11、17～19 失敗；項 20 回歸。

**根因**：

1. **篩選**：`getScrollAnchorSegId()` 不在篩選快照內仍當 `explicitAnchor` → `scrollTopFromAnchor` 回 0；`skipVirtScroll` 擋住事後置中；列高清空後估算偏差大。
2. **假游標**：editing preserve 還原譯文格焦點 → `show()` 因 `activeElement === editor` 而 `hide()`；blur 非同步 `await` 前未同步 `saved`。
3. **項 20**：`scrollToSegId` 後 `_anchorSegId` 持續約束；殘留 pending + `needsScroll` 在重畫時拉回。

**修正**：

| 管線 | 作法 |
|------|------|
| **A 篩選** | `resolveFilterScrollAnchor()` 驗證 anchor 在 renderable list；`invalidateHeights` anchor 不在 list 時 fallback `savedScrollTop`；`_filterAnchorPending` 兩段式置中（invalidate → 量測後單次 `scrollToSegId(center)`） |
| **B 假游標** | `_suspendEditingPreserve`（TM／blur）；blur 前同步 save；`refreshAfterVirtRender` 僅在非譯文格焦點時 `show()` |
| **C 錨點** | `releaseVirtNavigationAnchor()` 於 pending flush 成功後；`_userScrollGen` 使過期 pending 失效；`needsScroll` 僅顯式導覽 pending；editing preserve 需未 suspend 且無 pending |
| **D Ctrl+Alt+↓** | restore 路徑強制 `scrollToSegId(center)`，不依 `isSegIdCentered` 短路 |

### 2.11 Phase 2.3h — 疊層 fixed 化／移除 suspend／焦點遺失才還原（2026-06-29）

**2.3g 產品驗收未通過**（`e84f06d`）：確認後約一秒掉焦；假游標不繪製；捲動後卡片消失／錯位。

**根因**：

1. `#catEditorChromeLayer` 為 `position:absolute` 掛在 `#editorGrid` 內 → 隨虛擬捲動內容捲走，tip 定位錯誤。
2. `_suspendEditingPreserve` 黏滯（confirm blur 設 true、confirm 路徑不清除）→ resize 重畫不擷取 editing preserve → 約一秒掉焦。

**修正**：

| 項目 | 作法 |
|------|------|
| 疊層 | `.cat-editor-chrome-layer` 改 `position:fixed`；append `body`；`syncChromeLayerRect()` 以 `editorGrid.getBoundingClientRect()` 同步 |
| 監聽 | scroll／resize／`ResizeObserver(editorGrid)`／側欄寬調整後同步並重畫 |
| 真游標 tip | `showRealCaretTipIfNeeded` 走同一疊層 |
| suspend | **移除** `_suspendEditingPreserve`；`capture` 永遠擷取編輯中焦點 |
| preserve flush | 僅當 `activeElement` 為 `null`／`BODY`（焦點遺失）才還原；焦點在 TM／右欄不搶回 |

---

## §3 產品端驗收紀錄（2026-06）

### 3.1 Phase 2.3／2.3b — 已通過

- Tag 838 著色、自由捲動不拉回第一行、Ctrl+G 838、假游標基本顯示等 — **通過**（`0670242`、`694fa81`）。

### 3.2 Phase 2.3 殘留（2.3c 修正目標）

| # | 現象 | 根因（一句） |
|---|------|-------------|
| 1 | 捲遠後「暫存游標」提示不見 | 列未掛載時 tip 固定貼頂 |
| 2 | 清除篩選焦點錯行 | focus 與 virt invalidate 競態 |
| 3 | Ctrl+Alt+↓ 只選列 | focus 在 virt 重畫前執行 |
| 4 | 確認跳行只選列 | `onAfterRender` 未 flush pending focus |

**2.3c 狀態**：**已推送 `0a073ea`，產品驗收未通過**（見 §3.3）。

### 3.3 Phase 2.3c 驗收失敗 → 2.3d 修正目標（2026-06-29）

| # | 現象 | 診斷摘要 |
|---|------|----------|
| 1 | 確認跳行只選列 | #385 時 `document.activeElement` 為 `BODY` |
| 2 | #385 按 ↑ 回 #17 | DOM 位置 17 被誤當全檔索引 16 |
| 3 | 手動點譯文格焦點退出 | virt `replaceChildren` 後未還原 |
| 4 | 滾輪捲動掉焦點 | scroll → 重畫 → 譯文格 DOM 被拆 |
| 5 | 清除篩選畫面空白 | `invalidateHeights` 無 anchor + scrollTop 錯位 |

**2.3d 狀態**：**已推送 `42bbd17`，部分驗收通過**（焦點／方向鍵／不空白）；置中／假游標 tip／篩選跑位見 §3.4。

### 3.4 Phase 2.3d 部分驗收 → 2.3e 修正目標（2026-06-29）

| # | 現象 | 根因（一句） |
|---|------|-------------|
| 1 | 確認跳行置中失效 | virt `scrollToSegId` 固定置頂；row 已在 DOM 時不捲動 |
| 2 | 假游標／tip 不顯示 | preserve 在自由捲動時擷取並拉回，focus 吃掉假游標 |
| 3 | 清除篩選／進篩選畫面跑掉 | `invalidateHeights(anchor)` 置頂非置中 |

**2.3e 狀態**：**已推送 `78818d0`，部分驗收未通過**（項 20 通過；14／16～19 失敗；見 §3.5）。

### 3.5 Phase 2.3e 部分驗收 → 2.3f 修正目標（2026-06-29）

| # | 現象 | 根因（一句） |
|---|------|-------------|
| 1 | 遠距跳行只選列 | `centerOnSegId` 第二輪重畫 + pending 已清 |
| 2 | 滾輪焦點跑掉 | preserve 僅 pending，無 editing 軌 |
| 3 | 篩選亂跳 | invalidate + focus 雙管線 + 列高估算 |
| 4 | 假游標 tip 不見 | onAfterRender 順序錯；焦點未還原 |
| 5 | Ctrl+Alt+↓ 要按兩次 | 同上 pending 管線中斷 |

**2.3f 狀態**：**已推送 `927ceec`，部分驗收未通過**（項 8、12～16 通過；9、11、17～19 失敗；項 20 回歸；見 §3.6）。

### 3.6 Phase 2.3f 部分驗收 → 2.3g 修正目標（2026-06-29）

| 項 | 結果 | 根因（一句） |
|----|------|-------------|
| 8、12～16 | 通過 | pending 導覽／editing preserve 主路徑可用 |
| 9、17、18 | 失敗 | anchor 不在篩選 list + `skipVirtScroll` + 估算列高 |
| 10 | 部分 | `isSegIdCentered` 短路還原捲動 |
| 11、19 | 失敗 | preserve 搶焦點；blur 非同步競態 |
| 20 | 回歸 | `_anchorSegId`／pending `needsScroll` 持續拉回 |

**2.3g 狀態**：**已推送 `e84f06d`，產品驗收未通過**（確認後掉焦；假游標／tip 不顯示；見 §3.7）。

### 3.7 Phase 2.3g 產品驗收未通過 → 2.3h 修正目標（2026-06-29）

| 症狀 | 根因（一句） |
|------|-------------|
| 確認後約一秒掉焦 | `_suspendEditingPreserve` 黏滯 → resize 重畫不 preserve |
| 假游標不繪製 | preserve 搶焦 + `show()` hide；疊層隨內容捲走 |
| 卡片消失／錯位 | chrome layer `absolute` 在 `overflow:auto` 內，非可視窗口釘定 |

**2.3h 狀態**：**已實作，待驗收**（驗收項 §1.3 之 8～22 + Ctrl+Alt+↓；小檔 ≤800 regression）。

---

## 開發與驗收時序

| 日期 | 事項 |
|------|------|
| 2026-06-29 | 規劃定案；實作 A～D（`0670242`）；**待產品端驗收** |
| 2026-06-29 | Phase 2.3b：假游標被動 show 不得 scrollToSegId；Ctrl+G 走 `focusTargetEditorAtSegmentIndex`；**已通過** `694fa81` |
| 2026-06-29 | Phase 2.3c：統一 `scheduleEditorFocus` 管線、離屏 tip 頂/底；**已推送 `0a073ea`，驗收未通過** |
| 2026-06-29 | Phase 2.3d：跨重畫還原焦點、方向鍵 segId、`invalidateHeights(anchor)`；**已推送 `42bbd17`，部分驗收通過** |
| 2026-06-29 | Phase 2.3e：virt 置中、`centerOnSegId`、preserve 僅 pending；**已推送 `78818d0`，部分驗收未通過** |
| 2026-06-29 | Phase 2.3f：雙軌 preserve、單次 center、pending gen、onAfterRender 順序；**已推送 `927ceec`，部分驗收未通過** |
| 2026-06-29 | Phase 2.3g：篩選兩段式置中、`suspendEditingPreserve`、錨點釋放、Ctrl+Alt+↓ 強制 center；**已推送 `e84f06d`，產品驗收未通過** |
| 2026-06-29 | Phase 2.3h：疊層 fixed 化、移除 suspend、焦點遺失才還原 preserve；**已實作，待驗收** |
