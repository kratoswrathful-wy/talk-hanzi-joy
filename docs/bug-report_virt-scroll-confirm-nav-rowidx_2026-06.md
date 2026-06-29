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

**完整規劃與驗收**：[`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) — **已實作，待驗收**。
