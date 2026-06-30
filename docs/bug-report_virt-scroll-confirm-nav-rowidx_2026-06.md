# Bug：大檔虛擬捲動下確認後不跳行、rowIdx 污染、重複句 DOM 不更新

> 建立：2026-06-28  
> 狀態：**已修並驗收**（`51815db`；2026-06-29）  
> 相關：[`CAT_EDITOR_LARGE_FILE_PERF_2026-06.md`](CAT_EDITOR_LARGE_FILE_PERF_2026-06.md)、[`CAT第四波主記錄.md`](CAT第四波主記錄.md)（`d326666` 篩選跳行）、[`CAT_WORKFLOW_CONFIRM_STATUS_UX_2026-06.md`](CAT_WORKFLOW_CONFIRM_STATUS_UX_2026-06.md)（五態）

---

## 1. 現象

1. **確認後焦點不跳下一未確認句**（設定：「下一個尚未確認的句段」）
   - 大檔（>800 句，虛擬捲動）按 Ctrl+Enter 確認後，游標離開譯文欄，藍框仍停剛確認句（例 2804），不跳到下一未確認（例 2810）。
   - **清除篩選後仍可能發生**（非僅篩選當下）。

2. **重複句 1/2 確認後 2/2 畫面不即時更新**
   - 記憶體可能已連動，但 grid 綠勾／譯文 pill 不刷新，須重整理才看見。

3. **連帶**：虛擬捲動下 Ctrl+Shift+A 全選、多選批次確認、右鍵批次、Ctrl+↑↓ 跳列可能 silently 失效（`gRows[全檔索引]` 對不到 DOM）。

---

## 2. 根因

### 2.1 `seg.rowIdx` 被篩選子清單索引污染

[`grid-virtual-scroll.js`](../cat-tool/js/grid-virtual-scroll.js) `renderWindow` 對 `getRenderableList()`（篩選後）的窗口索引 `i` 傳入 `buildGridDataRow`，並寫入 `seg.rowIdx = i`。全檔第 2803 句在篩選結果中可能變成 `rowIdx = 45`，且**持久化在 segment 物件上**；清除篩選後若未全表重建，索引仍錯。

Ctrl+Enter 以錯誤 `i` 呼叫 `getAfterConfirmFocusIndex(i)`，從錯誤起點往後搜尋，常找不到下一未確認句。

### 2.2 `getAfterConfirmFocusIndex` 可見性用 `gRows[idx]`

虛擬捲動 DOM 僅 ~69 列，`gRows[2803]` 為 `undefined`，`isVisibleRow` 恒 false → 跳行失敗。

### 2.3 「尚未確認」用 `status !== 'confirmed'`

與 B-7g 五態不一致，漏掉 `orig_confirmed` 等待譯者確認的句段。

### 2.4 重複連動用 `rows[j]`

同上，`j` 為全檔索引，虛擬 DOM 無對應列，更新被跳過。

---

## 3. 修正

| 區塊 | 檔案 | 作法 |
|------|------|------|
| rowIdx  integrity | `grid-virtual-scroll.js`、`app.js` | `renderEditorSegments` 建列前 bulk `seg.rowIdx = i`；virt `getGlobalIndex`；`buildGridDataRow` 不再覆寫 `rowIdx` |
| 確認後跳行 | `app.js` | `segNeedsAfterConfirmNav` + `isRowVisibleForAfterConfirmNav`（`isSegmentVisibleInEditor`） |
| 重複 DOM | `app.js` | `refreshRepetitionSiblingRow` → `getGridRowBySegId` |
| 連帶 | `app.js` | Ctrl+Shift+A、多選 Ctrl+Enter、右鍵批次、`focusTargetEditorStartAtGlobalIndex` 改 segment／by-id 模式 |
| TB offpage 底線 | `app.js` | `decorateTbInlineHintsForActiveRow` 依 `currentTmMatches` 絕對索引對 `catMatchPageIndex` 切 visible/offpage；換頁雙向對調 |

---

## 4. 驗收

1. 大檔 Riftbound：曾下篩選再清除 → 確認未確認句 → 焦點跳下一未確認且譯文欄可打字。
2. 篩選仍開：只在篩選結果內找下一未確認。
3. 重複 1/2 確認 → 2/2 即時綠勾，無需重整理。
4. 小檔 ≤800 句：確認跳行、全選、批次、Ctrl+↑↓ regression。
5. `orig_confirmed` 句被「下一個尚未確認」模式視為目標。

---

## 5. 驗收記錄（2026-06-29）

**Commit**：`51815db` — `fix(cat): 虛擬捲動確認跳行 rowIdx 與 TB 當頁 offpage 底線`

**環境**：Riftbound 大檔（>800 句，虛擬捲動）；設定「下一個尚未確認的句段」。

| 項目 | 結果 |
|------|------|
| 曾篩選再清除 → 確認未確認句 → 焦點跳下一未確認、譯文欄可打字 | **通過** |
| 篩選仍開：只在篩選結果內找下一未確認 | **通過** |
| 重複 1/2 確認 → 2/2 即時綠勾 | **通過** |
| 小檔 ≤800 句：確認跳行、全選、批次、Ctrl+↑↓ | **通過** |
| `orig_confirmed` 句納入「下一個尚未確認」 | **通過** |

**備註**：TB offpage 灰底線與換頁對調同批落地；副行 offpage 術語（無數字）見後續 commit。

---

## 6. Phase 2.3 延伸（2026-06-29）

`51815db` 修 rowIdx／五態搜尋後，產品端仍回報：

- 確認後跳到**翻譯／審稿已確認**句（設定為「下一個尚未確認」）
- 只**選列**不進譯文格；**置中**無效
- 後方全已確認時**焦點消失**
- tag 838 全紅橘；假游標失效；清除篩選跳第一行

**根因（與 51815db 互補）**：virt `focusTargetEditorAtSegmentIndex` 無 scroll／center；假游標綁 DOM；`invalidateHeights` 覆寫捲動；著色 `normalizeXmlForSig` 未略 `id`。

**完整規劃與驗收**：[`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) — Phase 2.3 **`0670242`**；**Phase 2.3b** **已驗收** `694fa81`；**Phase 2.3c** `0a073ea` **驗收未通過**；**Phase 2.3d** 見同檔 §2.7 — **待驗收**。

### 6.1 Phase 2.3c focus 競態（2026-06-29）

**症狀**：確認跳行、清除篩選、Ctrl+Alt+↓ 只**選列**不進譯文格。

**根因**：virt `replaceChildren` 重畫前執行 focus；`onAfterRender` 僅首次 mount 才 flush pending。**非** rowIdx 污染（`51815db` 已修）。

**修正**：`_pendingEditorFocus` + 每次 `onAfterRender` 雙 rAF `flushPendingEditorFocus()`。詳見 [`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §2.6。

**結果**：`0a073ea` 推送後產品驗收**仍未通過**（`scrollIntoView` 二次重畫、無 preserve）。

### 6.2 Phase 2.3d — DOM 索引誤導覽 + 跨重畫 preserve（2026-06-29）

**症狀**：#385 按 ↑ 回 #17；滾輪／手動點譯文格焦點掉至 `BODY`；清除篩選空白。

**根因**：↑／↓ 用 `indexOf(gRows)` 當全檔索引；一般捲動重畫無焦點還原；`invalidateHeights()` 無 anchor。

**修正**：`focusAdjacentTargetRow(segId)`；`_preserveFocusAcrossVirtRender`；`invalidateHeights(anchorSegId)`。詳見同檔 §2.7。

### 6.3 Phase 2.3f — 雙軌 preserve + 單次 center（2026-06-29）

**症狀**：2.3e 遠距跳行只選列；滾輪保焦回歸；篩選亂跳；假游標 tip 不見。

**根因**：`centerOnSegId` 雙重捲動；pending 過早清除；preserve 僅 pending；`onAfterRender` 順序錯。

**修正**：`_preserveEditingAcrossVirtRender` 就地還原；`isSegIdCentered`；pending gen。詳見同檔 §2.9。

### 6.4 Phase 2.3g — 篩選 anchor、錨點釋放、假游標競態（2026-06-29）

**症狀**（2.3f `927ceec` 後）：進／清篩選畫面亂跳；假游標／tip 不顯示；Ctrl+G 後手動捲動被拉回錨點。

**根因**：

- 篩選快照重建時 anchor 不在 `getRenderableList()` 仍當 `explicitAnchor` → scrollTop 歸 0。
- `_anchorSegId` 於 `scrollToSegId` 後持續約束；殘留 pending `needsScroll` 重畫時拉回。
- editing preserve 與假游標 `show()`（`activeElement === editor` 則 hide）互斥。

**修正**：`resolveFilterScrollAnchor`、`_filterAnchorPending` 兩段式置中；`releaseVirtNavigationAnchor`、`_userScrollGen`；`_suspendEditingPreserve`。詳見 [`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §2.10。

### 6.5 Phase 2.3h — 疊層 fixed 化、移除 suspend（2026-06-29）

**症狀**（2.3g `e84f06d` 後）：確認後約一秒掉焦；假游標不繪製；捲動後 tip 消失或錯位。

**根因**：`#catEditorChromeLayer` `absolute` 隨 virt 內容捲走；`_suspendEditingPreserve` 黏滯 → resize 重畫不 preserve。

**修正**：`syncChromeLayerRect`、fixed 覆蓋層 append `body`；移除 suspend；`isEditingFocusLostAfterVirtRender`。詳見同檔 §2.11。

### 6.6 Phase 2.3i — 離窗不硬抓焦點、篩選置中（2026-06-29）

**症狀**（2.3h `ffe459d` 後）：捲動後真假游標 tip 仍不顯示；篩選進出畫面亂跳。

**根因**：preserve 對已捲出視窗句段仍 `applyEditorFocusAtSegId`；篩選重建快照時 `isSfSearchControlActive()` 跳過置中錨點。

**修正**：未掛載列不還原焦點、改 `refreshAfterVirtRender` 離屏 tip；`didRebuildFilterSnapshot` 一律錨定編輯句（被篩掉則置頂）。詳見 §2.12。

### 6.7 Phase 2.3j — 導覽錨點保護、篩選聚焦分流、浮層死結（2026-06-29）

**症狀**（2.3i `e17ff35` 後）：
1. 假游標／提示卡完全不繪製（問題 1）。
2. 確認跳行假游標到、畫面沒到（間歇，問題 3）。
3. Ctrl+F 進篩選焦點被搶回編輯區（新問題 5）。

**根因**：
1. `#catEditorChromeLayer` 浮層死結（建立排在 `syncChromeLayerRect` 關卡之後）。
2. 延遲置中捲動落定前，`scheduleResizeRepaint` 的 `inferAnchorFromDom` 覆蓋 `scrollToSegId` 設的導覽錨點。
3. 2.3i 移除 `!isSfSearchControlActive()` 守衛後，`flushFilterAnchorAfterVirtRender` 連焦點在取代欄也 `scheduleEditorFocus`。

**修正**：
- 浮層：`syncChromeLayerRect` 缺浮層就地 `ensureEditorChromeLayer`；後者移除自呼叫避免遞迴。
- 導覽錨點：新增 `_navAnchorLock`，鎖定期 resize 重繪改 `renderWindow(_anchorSegId, block)` 重新置中、不 `inferAnchorFromDom`；使用者捲動或短逾時解鎖，不綁 `releaseNavigationAnchor`。
- 篩選：`_filterAnchorPending.focusEditor = !isSfSearchControlActive()`；flush 一律置中，僅 `focusEditor` 時才聚焦編輯句。

詳見 [`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §2.13。

### 6.8 Phase 2.3k — preserve 不硬掛載、導覽 scroll 合併（2026-06-30，規劃中）

**症狀**：確認／篩選連跳；手動捲動被拉回暫存句；搜尋上色與篩選快照在 virt 換窗後失效。

**修法**：
- `applyEditorFocusAtSegId`：`skipVirtScroll` 時禁止 `ensureRowMounted`。
- 使用者捲動後清除 preserve 硬還原競態。
- 導覽 `scrollToSegId` 合併、filter flush 與 focus 去重；inList 篩選置中 `'center'`。
- `onAfterRender` 補 search highlight 與 TB。

詳見 §2.14。
