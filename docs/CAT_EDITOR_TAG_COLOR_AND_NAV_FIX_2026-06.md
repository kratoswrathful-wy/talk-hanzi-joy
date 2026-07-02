# CAT 編輯器：Tag 著色、假游標、清除篩選、確認跳行（Phase 2.3）

> **狀態**：**Phase 2.3o 待驗收**；**Phase 2.3q 已實作 `6344baa`，待驗收**（2026-07-02；見 §3.18）。2.3p hotfix `649ef70` 已推送；2.3q 修正置中／假游標／手動點擊 stale 問題。
> **樣本**：`54316_02_WORDNT_RiftboundCoreRulesRUP4Sta_v2_zh_TW.docx_zho-TW.mqxliff`（6333 句）  
> **程式觸點**：[`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)、[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)  
> **相關**：[`bug-report_virt-scroll-confirm-nav-rowidx_2026-06.md`](./bug-report_virt-scroll-confirm-nav-rowidx_2026-06.md)（`51815db` rowIdx）、[`CAT_EDITOR_LARGE_FILE_PERF_2026-06.md`](./CAT_EDITOR_LARGE_FILE_PERF_2026-06.md)、[`CAT_EDITOR_OVERLAY_FAKE_CARET_EXPORT_2026-06.md`](./CAT_EDITOR_OVERLAY_FAKE_CARET_EXPORT_2026-06.md)、[`CAT_SEGMENT_USER_MARKERS_2026-06.md`](./CAT_SEGMENT_USER_MARKERS_2026-06.md)

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
21. **確認後不掉焦（2.3h，2.3i 通過）**：大檔 **Ctrl+Enter** 確認跳行 → 新句**停留可打字超過 3 秒**（resize 重畫不掉焦）。
22. **真游標離屏 tip（2.3h／2.3i 未通過 → 2.3j 目標）**：譯文格內編輯 → 捲離 → 「游標在第 N 句」卡片在編輯區**頂或底**、位置正確。
23. **假游標／提示卡會繪製（2.3j 目標，問題 1）**：大檔編輯某句後失焦或捲遠 → 看得到藍色假游標或頂／底提示卡（浮層死結解除）。
24. **確認跳行畫面跟捲（2.3j 目標，問題 3）**：第一行 **Ctrl+Enter** 跳至首個未確認句（如 1482）→ 畫面**穩定捲到並置中**該句（連續多次皆然，不再「假游標到了、畫面沒到」）。
25. **Ctrl+F 進篩選焦點留取代欄（2.3j 通過）**：編輯區選字、連按兩次 **Ctrl+F** → 進篩選模式、焦點**停在取代欄**、畫面以原編輯句置中。
26. **確認跳行一次捲到置中（2.3k）**：大檔 **Ctrl+Enter** → 畫面**一次**捲到下一未確認句並置中，不連跳。
27. **手動捲動不拉回暫存句（2.3k）**：Ctrl+Alt+↓ 回暫存句後，手動捲到上下遠處 → **不**被強制拉回暫存句置頂。
28. **真游標捲動不閃雙 tip（2.3k）**：譯文格內編輯捲動 → 不交替顯示「游標」與「暫存游標」卡。
29. **離屏 tip 方向正確（2.3k）**：游標在視窗上方句段、往下捲 → tip **貼頂**（非貼底）。
30. **進出篩選置中不連跳（2.3k）**：編輯句在清單內 → 進／出篩選**置中**；不連跳。
31. **搜尋命中換窗仍上色（2.3k）**：virt 捲動後新出現列仍有搜尋／篩選 `<mark>`。
32. **捲動中 TB 底線（2.3k）**：可見列術語底線不整片消失至停捲。
33. **篩選中編輯譯文列集合不變（2.3k）**：除非手改篩選條件，篩選結果不因譯文編輯而跑掉。
34. **色點加刪本機（2.3k）**：本機為句段加紅+藍 → 重開檔仍在。
35. **色點 Team 跨裝置（2.3k）**：另一瀏覽器開同一檔色點一致。
36. **色點篩選（2.3k）**：進階篩選選「紅」→ 僅留有紅點列。
37. **2.3j 回歸（2.3k）**：Ctrl+F 雙按焦點留取代欄；確認後可打字。
38. **離開篩選 Virt 刷新（2.3l）**：大檔篩選後切搜尋或按清除 → **不需滾輪**即恢復全檔可見列。
39. **篩選中批次確認（2.3l）**：篩選「未確認」+ 多選批次確認 → 篩選結果**不整批消失**（快照保留）。
40. **重複句 ✕ 雙向（2.3l）**：句 A 設 ✕、句 B 確認同原文 → A 譯文與確認狀態**不被覆寫**。
41. **色點四色 2×2（2.3l）**：狀態欄 **9px** 紅黃藍紫四點 2×2 排列於綠圈上方；無橘／灰。
42. **色點篩選列 UI（2.3l）**：「個人色點」有分隔線、粗體；選項為色點圖示無文字。
43. **色點右鍵批次（2.3l）**：多選右鍵「附加／移除」各色；全有→移除、缺一→附加。
44. **色點 Team 持久化（2.3l）**：upsert 後 reload 仍在（`cat_user_segment_markers`）。
45. **2.3k 回歸整合（2.3l）**：項 26–33、37 與 §3.11 補測一併驗（見 Slack 新版任務）。
46. **狀態欄置中（2.3m）**：四色點 + 確認標記在狀態欄內水平垂直置中。
47. **狀態欄右緣線（2.3m）**：狀態欄右側與捲軸間有與相符度欄相同灰實線。
48. **審稿外環 2.5px（2.3o）**：審稿已確認外環肉眼可見（`box-shadow` 可見厚度 2.5px；2.3n 曾用 3px）；審稿後再編輯虛線外環 2.5px／23px。
49. **色點瞬間回應（2.3m）**：點擊色點無 0.5–1s 等待；多選右鍵批次確認／色點作用於**全部**已選句段。
50. **TB 捲動不閃（2.3n）**：大檔 virt 連續捲動時，使用中句段原文 TB 底線／上標不消失。

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

### 2.12 Phase 2.3i — 離窗不硬抓焦點／篩選置中（2026-06-29）

**2.3h 產品驗收**（`ffe459d`）：項 2（確認不掉焦）**通過**；項 3／5（捲動後提示卡不顯示）、項 4（篩選進出亂跳）**未通過**。

**根因**：

1. `flushEditorFocusAfterVirtRender` 在焦點遺失時仍對**已捲出虛擬視窗**的句段 `applyEditorFocusAtSegId`（強制掛載＋聚焦）→ 真／假游標離屏判斷誤以為「仍在畫面內」。
2. `runSearchAndFilter` 篩選快照重建時，`!isSfSearchControlActive()` 擋住置中錨點（焦點在篩選面板時永遠跳過）。

**修正**：

| 項目 | 作法 |
|------|------|
| preserve flush | 焦點遺失時僅當 `getGridRowBySegId(segId, false)` **已掛載**才還原焦點；未掛載 → `refreshAfterVirtRender()` 顯示離屏 tip |
| 假游標 | `refreshAfterVirtRender`／`show`：未掛載列一律 `showOffScreenFakeTip`（`resolveOffScreenTipAbove` 貼頂／底） |
| 篩選置中 | `didRebuildFilterSnapshot` 時一律 `resolveFilterScrollAnchor()`；編輯句在清單內 → `'center'`；被篩掉 → 第一可見句 `'start'`（置頂） |

### 2.13 Phase 2.3j — 浮層死結／導覽錨點保護／篩選聚焦分流（2026-06-29）

**2.3i 產品驗收**（`e17ff35`）：項 2／4 通過；項 1（假游標／提示卡完全不繪製）、項 3（確認跳行畫面不跟捲）未通過；另發現**新問題 5**（Ctrl+F 進篩選後焦點被搶回編輯區）。

**根因**：

1. **浮層死結（問題 1）**：`show`／`showOffScreenFakeTip`／`showRealCaretTipIfNeeded`／`refreshAfterVirtRender` 首行 `if (!syncChromeLayerRect()) return;`，而 `syncChromeLayerRect` 在浮層不存在時直接回 `false`；唯一建立浮層的 `ensureEditorChromeLayer` 只在這道關卡之後被呼叫 → `#catEditorChromeLayer` 永遠不被建立、每次繪製都放棄（自 2.3h）。
2. **導覽錨點被覆蓋（問題 3）**：`scrollToSegId` 延遲套用捲動；新掛載列被 `ResizeObserver` 量到真高 → `scheduleResizeRepaint` 以 `inferAnchorFromDom`（目前 DOM 最接近頂端列）重設 `_anchorSegId`，覆蓋導覽目標。重繪先於延遲捲動落定時，重錨頂端、畫面留原處（間歇）。
3. **置中與聚焦未分流（問題 5）**：2.3i 為問題 4 移除 `!isSfSearchControlActive()` 守衛後，`flushFilterAnchorAfterVirtRender` 連焦點在取代欄時也 `scheduleEditorFocus` 把焦點搬回編輯區。

**修正**：

| 項目 | 作法 |
|------|------|
| 浮層死結 | `syncChromeLayerRect` 缺浮層時就地 `ensureEditorChromeLayer()`；`ensureEditorChromeLayer` 移除結尾自呼叫 `syncChromeLayerRect()`（避免遞迴） |
| 導覽錨點保護 | 新增 `_navAnchorLock`；`scrollToSegId` 設鎖；鎖定期 `scheduleResizeRepaint` 不 `inferAnchorFromDom`，改 `renderWindow(_anchorSegId, _navAnchorBlock)` 重新置中；使用者捲動或短逾時（約 200ms）解鎖；**不**綁 `releaseNavigationAnchor` |
| 篩選聚焦分流 | `_filterAnchorPending.focusEditor = !isSfSearchControlActive()`；`flushFilterAnchorAfterVirtRender` 一律 `scrollToSegId(center)`，僅 `focusEditor` 為真才 `scheduleEditorFocus` |

### 2.14 Phase 2.3k — 大檔捲動穩定 + 個人句段色點（2026-06-30，已實作，待驗收）

**2.3j 產品驗收**（`e147c10`）：Ctrl+F 焦點 + 回歸**通過**；問題 1～8 **未通過**（確認連跳、手動捲被拉回、tip 閃爍／貼底錯誤、篩選連跳、搜尋不上色、TB 消失、篩選跑掉）。

**根因與修正（規劃）**：

| # | 根因（一句） | 修法 |
|---|-------------|------|
| 2 | `skipVirtScroll` 仍 `ensureRowMounted` → `scrollToSegId` | `applyEditorFocusAtSegId` 尊重 `skipVirtScroll`；preserve 未掛載只 tip |
| 3／4 | 真／假 tip 競態；`getVirtWindowStartIndex` 誤 0 | `resolveOffScreenDirection` 統一 listIdx；真游標在格內只真 tip |
| 1／5 | 多次 `scrollToSegId` + resize 重锚 | 導覽 scroll 合併；filter flush 與 focus 去重 |
| 6／7 | virt 換窗未重跑 highlight／TB | `onAfterRender` 補裝飾 |
| 8 | 編輯觸發全量重掛或錨點錯位 | `keepFilterSnapshot` audit |
| 9 | 新功能 | 色點 Dexie v25 + Supabase；見 [`CAT_SEGMENT_USER_MARKERS_2026-06.md`](./CAT_SEGMENT_USER_MARKERS_2026-06.md) |

**篩選置中**：編輯句 inList → `'center'`；被篩掉 → `'start'`。

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

**2.3h 狀態**：**已推送 `ffe459d`，部分驗收通過**（項 2 通過；3／4／5 未通過；見 §3.8）。

### 3.8 Phase 2.3h 部分驗收 → 2.3i 修正目標（2026-06-29）

| # | 現象 | 根因（一句） |
|---|------|-------------|
| 3／5 | 捲動後提示卡不顯示 | 離窗句段被 preserve 硬抓回焦點／掛載，離屏判斷失效 |
| 4 | 篩選進出亂跳 | `isSfSearchControlActive()` 擋住篩選快照重建時的置中錨點 |

**2.3i 狀態**：**已推送 `e17ff35`，部分驗收通過**（項 2／4 通過；1／3 未通過＋新問題 5；見 §3.9）。

### 3.9 Phase 2.3i 部分驗收 → 2.3j 修正目標（2026-06-29）

| # | 現象 | 根因（一句） |
|---|------|-------------|
| 1 | 假游標／提示卡完全不繪製 | `#catEditorChromeLayer` 浮層死結：建立動作排在 `syncChromeLayerRect` 關卡之後，永遠建不出來（自 2.3h） |
| 3 | 確認跳行假游標到、畫面沒到（間歇） | 延遲置中捲動落定前，resize 重繪 `inferAnchorFromDom` 覆蓋導覽錨點 |
| 5（新） | Ctrl+F 進篩選焦點被搶回編輯區 | 2.3i 移除 `!isSfSearchControlActive()` 守衛後，篩選 flush 連焦點在取代欄也 `scheduleEditorFocus` |

**2.3j 狀態**：**已推送 `e147c10`，部分驗收通過**（Ctrl+F 焦點 + 回歸通過；1～8 未通過；見 §3.10）。

### 3.10 Phase 2.3j 部分驗收 → 2.3k 修正目標（2026-06-30）

| # | 現象 | 備註 |
|---|------|------|
| Ctrl+F | 雙按焦點留取代欄 | **通過** |
| 回歸 | 確認可打字、篩選置中等 | **通過** |
| 1 | 確認後畫面連跳、停錯行 | 假游標可 Ctrl+Alt+↓ 回正確句 |
| 2 | 手動捲被拉回暫存句置頂 | |
| 3 | 真游標在格內 tip 閃爍 | |
| 4 | 離屏 tip 應貼頂卻貼底 | |
| 5 | 進出篩選連跳、置頂非置中 | inList 應置中 |
| 6 | 搜尋／篩選命中不上色 | |
| 7 | TB 術語捲動中消失 | |
| 8 | 譯文編輯後篩選跑掉 | |

**2.3k 狀態**：**已實作，第一輪 AI 驗收部分通過**（2026-06-30；見 §3.11；**補測進行中**）。

### 3.11 Phase 2.3k 第一輪 Claude AI 驗收 → 補測（2026-06-30）

**執行者**：Claude AI（瀏覽器自動化 + iframe `Runtime.evaluate`）  
**來源聊天室**：Cursor「Phase 2.3k 大檔修正與色點」  
**測試檔**：`Test_Big.mqxliff`（專案 CLAUDE-QA-TEST-0630，6333 句；`CatVirtGrid.isEnabled()=true`）  
**Slack**：`#development` 補測任務（2026-06-30；第一輪父訊息已刪除，改發新補測任務）  
**補測訊息**：<https://1up-studio.slack.com/archives/C0BDSDCT9B5/p1782835520364379>

#### 第一輪結果摘要

| 區塊 | 項 | 結果 | 備註 |
|------|-----|------|------|
| 批 A | 27 | **通過** | 手動捲不拉回暫存內容 |
| 批 A | 29 下 | **通過** | 游標在視窗下方離屏，tip 貼底 |
| 批 A | 26 | **未按規格測** | 僅 Ctrl+G 跳 838／2000，非 Ctrl+Enter |
| 批 A | 28 | **無法驗證** | 毫秒級 UI，靜態截圖不足 |
| 批 A | 29 上 | **未測** | 上方句段往下捲 → tip 貼頂 |
| 批 B | 30～33 | **整批未驗** | 搜尋框合成事件無效（0/0）；需真實鍵盤 |
| 批 C | 34～36 | **通過** | 五色 UI、Supabase 讀寫、篩選「紅」、刪除同步 |
| 批 C | 35 | **部分** | reload 持久化通過；未測第二瀏覽器 |
| 批 C | 37 | **未測** | Ctrl+F 雙按 + 確認可打字 |
| 回歸 | Ctrl+G／Ctrl+Alt+↓／自由捲 | **通過** | |

**附帶發現**（工程待確認，非驗收失敗）：Team 模式下色點寫入 Supabase、畫面正確，但本機 Dexie `userSegmentMarkers` 查詢為空；是否為「Team 直讀雲端、不寫本機快取」之預期，待工程確認。測試殘留：句 838 藍色點 + 暫存編輯「盤面。X」（PM 手動清理）。

#### 補測待辦（第二輪）

| 優先 | 項 | 內容 |
|------|-----|------|
| P0 | 30～33 | 批 B 全項；真實鍵盤／CDP `Input.dispatchKeyEvent` |
| P0 | 37 | Ctrl+F 雙按焦點留取代欄；確認後可打字 |
| P1 | 26 | Ctrl+Enter 連跳 3 次、單次置中 |
| P1 | 29 上 | 上方句段往下捲 → tip 貼頂 |
| P1 | 28 | MutationObserver 或錄影；否則 blocked |
| P2 | 34 本機／35 跨裝置 | 可選 |

建議測試方式見 Slack 補測任務內「建議測試方式」表。

### 3.12 Phase 2.3l — 篩選 bug、重複句 ✕、色點改版（2026-06-30）

**狀態**：**第一輪部分通過**（2026-07-01，commit `09737ab`；見 §3.13）

| # | 修正 | 觸點 |
|---|------|------|
| 1 | 大檔離開篩選 Virt 不重畫 | `runSearchAndFilter`：`leavingFilter` + `needsVirtRefresh` → `invalidateHeights`；`scheduleRunSearchAndFilter(0, opts)` |
| 2 | 篩選中批次確認清空結果 | `executeBatchConfirm`：`keepFilterSnapshot` + `refreshBatchConfirmRowsDom`（不再全量 `renderEditorSegments`） |
| 3 | 重複句 ✕ 雙向隔離 | `propagateRepetition`／`applyOptimisticRepetitionAfterPrimaryConfirm`／`collectConfirmTouchIndices`／範圍外 Modal 跳過 `repModeSeg === 'none'` 目標 |
| 4 | 色點四色改版 | 紅黃藍紫、9px、2×2、`#sfMarkerFilterRow` 分隔線＋色點 checkbox、右鍵批次附加／移除 |

詳細色點規格：[`CAT_SEGMENT_USER_MARKERS_2026-06.md`](./CAT_SEGMENT_USER_MARKERS_2026-06.md) §2.9。

### 3.13 Phase 2.3l 驗收紀錄（2026-07-01，`09737ab`）

| # | 結果 | 備註 |
|---|------|------|
| 38 | 通過 | 離開篩選 Virt 刷新 |
| 39 | 部分 | 篩選快照保留 OK；**多選右鍵批次確認只作用右鍵列** → 2.3m 修 |
| 40 | 未測 | 操作在「重複」欄 ▼/⇳/✕，非右鍵；待補測 |
| 41–42 | 通過 | 四色 2×2、篩選列 UI |
| 43 | 失敗 | **多選右鍵色點只作用右鍵列** → 2.3m 修 |
| 44 | 通過 | Team 色點 reload 持久化 |
| 45 | 部分 | 31、32、36、37 通過；26、29上、30、33 測試檔殘留未結 |
| — | 附帶 | 頂端列 + TM 點擊後滾輪卡死（待調查） |

### 3.14 Phase 2.3m — 狀態欄 UI、色點即時、多選批次（2026-07-01）

**狀態**：**產品驗收通過**（項 48 外圈 2.3m 誤改導致不可見 → 2.3n 修）

| # | 結果 | 備註 |
|---|------|------|
| 46 | 通過 | 狀態欄置中 |
| 47 | 通過 | 右緣灰實線 |
| 48 | 待修 | 2.3m `box-shadow` 雙層皆 2px → 外環寬度 0；→ 2.3n 改 3px |
| 49 | 通過 | 色點樂觀更新 |
| 39′ | 通過 | 多選右鍵批次確認 |
| 43′ | 通過 | 多選右鍵色點 |

| # | 修正 | 觸點 |
|---|------|------|
| 1 | 狀態欄置中 | `applyColSettings` `col-status` **56px** |
| 2 | 右緣灰實線 | `.col-status` + 表頭 `border-right` |
| 3 | 審稿外圈 2px（誤） | 見 §3.15 根因 |
| 4 | 色點樂觀更新 | `toggleUserSegmentMarkerColor` 先 DOM |
| 5 | 多選右鍵批次 | `_ctxMenuSelectionSnapshot` + `getContextMenuSelectedIds` |

### 3.15 Phase 2.3n — 審稿外圈 3px + TB 捲動不閃（2026-07-01）

**狀態**：**產品驗收通過**

| # | 修正 | 觸點 |
|---|------|------|
| 1 | 審稿外圈 3px | `.wf-review` `box-shadow: 0 0 0 2px #fff, 0 0 0 **5px** green`（可見 **3px** = 5−2） |
| 2 | 虛線外圈 3px | `.wf-review-revoked`／`.wf-post-review-trans` `border: 3px dashed`；圓 **24px** |
| 3 | TB 捲動不閃 | `getActiveSegIdForTbDecor`、`decorateTbInlineHintsForSegId`；`onAfterRender` 先還原 active 再 decorate；`buildGridDataRow` 掛載即 decorate |

**box-shadow 根因（2.3m 項 48）**：第二層 spread 必須大於第一層，綠環可見厚度 = 外層 − 內層；`2px`+`2px` → **0px**。

**驗收項**：

| # | 項目 |
|---|------|
| 48′ | 審稿確認實線外環肉眼可見（約 3px） |
| 48″ | 審稿後再編輯虛線外環 3px 可辨 |
| 50 | 大檔 active 句在視窗內，連續捲動 TB 不消失 |
| 回歸 | 2.3m 46–47、49、39′、43′ |

**產品驗收紀錄**：

| # | 結果 | 備註 |
|---|------|------|
| 48′ | 通過 | 審稿確認實線外環約 3px 肉眼可見（2.3m 項 48 由此結案） |
| 48″ | 通過 | 審稿後再編輯虛線外環 3px 可辨 |
| 50 | 通過 | 大檔 virt 連續捲動，active 句 TB 底線／上標不閃 |
| 回歸 | 通過 | 2.3m 項 46–47、49、39′、43′ 無回歸 |

詳細 TB virt 觸點：[`CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md`](./CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md) §10。

### 3.16 Hotfix — `decorateTbInlineHintsForSegId` `segId` 重複宣告（`f3e4365`）

**現象**：`5e9925a` 部署後 CAT 全頁卡在「載入中…」；主控台 `Uncaught SyntaxError: Identifier 'segId' has already been declared (app.js:11323)`。

**根因**：重構 `decorateTbInlineHintsForActiveRow` → `decorateTbInlineHintsForSegId(segId)` 時，函式參數已有 `segId`，函式內舊碼仍保留：

```javascript
const segId = rowIdEl ? rowIdEl.getAttribute('data-id') : null; // 與參數同名
```

整支 [`cat-tool/app.js`](../cat-tool/app.js) 無法執行 → 與後端／IndexedDB 無關。

**修正**：刪除內層 `const segId`，改以參數 `segId` 查 `currentSegmentsList`（`f3e4365`）。

**驗收**：強制重新整理後主控台無 SyntaxError；CAT 可進、可開檔；2.3n 項 48′／48″／50 可正常驗。

### 3.17 Phase 2.3o — 審稿外圈 2.5px 視覺微調（2026-07-01）

**狀態**：**已實作，待驗收**

**動機**：2.3n 將外圈加至 3px／24px 後產品回饋偏粗；在 B-7g 原規格（2px／22px）與 2.3n（3px／24px）之間採 **2.5px 折衷**。`orig-confirmed` 維持 2px 不變。

| # | 修正 | 觸點 |
|---|------|------|
| 1 | 審稿實線外圈 2.5px | `.wf-review` `box-shadow: 0 0 0 2px #fff, 0 0 0 **4.5px** green`（可見 **2.5px** = 4.5−2） |
| 2 | 虛線外圈 2.5px | `.wf-review-revoked`／`.wf-post-review-trans` `border: 2.5px dashed`；圓 **23px** |

**與歷史波次對照**：

| 波次 | 實線可見厚度 | 虛線 |
|------|-------------|------|
| B-7g 設計基線 | 2px（spread 4px） | 22px／2px dashed |
| 2.3n | 3px（spread 5px） | 24px／3px dashed |
| **2.3o** | **2.5px**（spread 4.5px） | **23px／2.5px dashed** |

**驗收項**：

| # | 項目 |
|---|------|
| 48‴ | 審稿確認實線外環約 2.5px，可辨且不過重 |
| 48⁗ | 審稿後再編輯虛線外環 2.5px／23px；與實線視覺重量接近 |
| 回歸 | `orig-confirmed` 仍 2px；tooltip／點擊／mq 符號正常；外圈不被裁切 |

**備案**（僅虛線 `2.5px dashed` 渲染不佳時）：`2px dashed` + `box-shadow: 0 0 0 0.5px rgba(22, 163, 74, 0.45)`。

B-7g 規格實作註記：[`CAT_WORKFLOW_CONFIRM_STATUS_UX_2026-06.md`](./CAT_WORKFLOW_CONFIRM_STATUS_UX_2026-06.md) §3。

### 3.18 Phase 2.3q — 共用 explicit 導覽完成條件 + stale 導覽取消（2026-07-02）

**狀態**：**已實作 `6344baa`，待驗收**（完整計畫：[`CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md)；Playwright 驗收規劃：[`CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md)）

**背景（2.3p 後仍殘留）**：`649ef70` hotfix 改善 confirm-jump 焦點驗證，但產品回報仍見：

- 清除篩選：句段置頂、`centeredOk: false`、假游標 stale
- Ctrl+Enter：間歇性焦點／置中失敗
- 手動點擊可見列：畫面反覆跳位、viewport 被拉回無關句（stale pending + `_navAnchorLock`）

**範圍**（非 filter-clear only）：

| 路徑 | 期望 |
|------|------|
| 清除篩選 | 回假游標句／最後編輯句 → 置中 → 可打字 → 無假游標 |
| Ctrl+Enter confirm-jump | 下一目標句 → 置中 → 可打字 |
| Ctrl+Alt+↓／Ctrl+G | 維持既有 explicit 導覽行為 |
| 手動點擊譯文格 | 取消 stale 導覽；不 force center |

**根因（5 點）**：

1. `flushFilterAnchorAfterVirtRender`：`skipVirtScroll: true`、無 `explicitNav`
2. `flushPendingEditorFocus`：僅 `focusLanded` 即清 pending；`centeredOk` 不納入完成條件
3. `renderWindow`：`onAfterRender` 在 `setScrollTopDeferred` 之前
4. 假游標僅 `restoreCaret` 分支 `hide()`
5. `releaseNavigationAnchor()` 不清 `_navAnchorLock`（見 [`grid-virtual-scroll.js`](../cat-tool/js/grid-virtual-scroll.js) L538–541 vs resize L200–203）

**修正 Layer（實作順序）**：

| Layer | 內容 | deploy |
|-------|------|--------|
| 0 | helper、`__catNavState`、`CatVirtGrid.cancelNavigationAnchor` | — |
| **B** | **completion gate：`focusOk + centerOk`；rAF gen/cancelGen** | 核心 |
| **D** | **pointerdown + 手動取消；含 nav lock** | 與 B 同波 |
| A | filter-anchor `explicitNav + forceVirtScroll` | B+D 後；**不可單獨上線** |
| C | 假游標持久守衛 | — |

**完成條件**（`explicitNav` + `scrollBlock: 'center'`）：

```js
focusOk && centerOk  // centerOk: Math.abs(rowCenterDeltaPx) <= 16
```

**禁令**：禁止 focus 成功後同一 call stack 再 `scrollToSegId('center')`（2.3p 已證明吃焦點）。

**驗收**（詳見計畫書）：大檔 confirm-jump／clear filter（A–B）、手動點擊不跳位且 nav lock 已清（C）、小檔回歸（D）、Ctrl+F／F3／QA（E）、`flush failed` 可見（F）。Playwright 自動化規格：[`CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md)。

**觸點**：[`cat-tool/app.js`](../cat-tool/app.js) `flushPendingEditorFocus`、`flushFilterAnchorAfterVirtRender`、`focusin` L4071；[`grid-virtual-scroll.js`](../cat-tool/js/grid-virtual-scroll.js)；[`cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js) `refreshAfterVirtRender`。

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
| 2026-06-29 | Phase 2.3h：疊層 fixed 化、移除 suspend、焦點遺失才還原 preserve；**已推送 `ffe459d`，部分驗收通過** |
| 2026-06-29 | Phase 2.3i：離窗不硬抓焦點、篩選置中／被篩掉置頂；字數 memoQ 預翻 `max(TM%,rate%)`；**已推送 `e17ff35`，部分驗收通過** |
| 2026-06-29 | Phase 2.3j：浮層死結就地建立、導覽錨點保護、篩選置中與聚焦分流；**已推送 `e147c10`，部分驗收通過** |
| 2026-06-30 | Phase 2.3k：大檔捲動穩定、搜尋／TB 換窗裝飾、個人句段色點（`3d6030d`）；**第一輪 Claude AI 驗收部分通過**（§3.11） |
| 2026-06-30 | Phase 2.3l：篩選 Virt 刷新、批次確認快照、重複 ✕ 雙向、色點四色改版；**第一輪部分通過**（§3.13） |
| 2026-07-01 | Phase 2.3m：狀態欄 UI、色點樂觀更新、多選右鍵批次；**產品驗收通過**（§3.14；項 48 外圈待修） |
| 2026-07-01 | Phase 2.3n：`5e9925a` 審稿外圈 3px、TB virt 捲動不閃；**產品驗收通過**（§3.15） |
| 2026-07-01 | Hotfix：`f3e4365` 修 `decorateTbInlineHintsForSegId` `segId` 重複宣告阻斷載入（§3.16） |
| 2026-07-01 | Phase 2.3o：審稿外圈 2.5px 視覺微調；**待驗收**（§3.17） |
| 2026-07-02 | Phase 2.3p：`b34496f` 方案 A+B；`649ef70` hotfix 焦點驗證；置中／假游標／手動點擊 stale 仍待修 |
| 2026-07-02 | Phase 2.3q：**已實作 `6344baa`，待驗收**（§3.18、[`CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md)）；Layer 0+B+D+A+C 全上 |
| 2026-07-02 | Phase 2.3q Playwright 驗收計畫定案（[`CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md)）；離線版 + Test_Big／Test_Small；**未實作測試碼** |
