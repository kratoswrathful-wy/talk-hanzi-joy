# CAT 編輯器：Tag 著色、假游標、清除篩選、確認跳行（Phase 2.3）

> **狀態**：**Phase 2.3c 已實作，待驗收**（2026-06-29；`0670242` Phase 2.3 + `694fa81` 2.3b + 2.3c 焦點管線）
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
8. **確認可打字（2.3c）**：大檔 **Ctrl+Enter** 確認跳行 → 下一句**譯文格內可打字**（非僅選列）。
9. **清除篩選回假游標句（2.3c）**：篩選中編輯 → 清除篩選 → 回到**假游標 segId 那句**；譯文格有焦點。
10. **Ctrl+Alt+↓ 還原游標（2.3c）**：捲回暫存句 + **游標在譯文格**（可打字）。
11. **離屏假游標提示（2.3c）**：點 TM 後捲遠 → 「暫存游標…」提示在視窗**頂或底**可見（依暫存句在視窗上方或下方）。

**2.3b regression（2.3c 一併驗）**：自由捲動不拉回第一行；Ctrl+G 838 仍有效。

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

**2.3c 狀態**：**已實作，待驗收**（驗收項 §1.3 之 8～11 + 2.3b regression）。

---

## 開發與驗收時序

| 日期 | 事項 |
|------|------|
| 2026-06-29 | 規劃定案；實作 A～D（`0670242`）；**待產品端驗收** |
| 2026-06-29 | Phase 2.3b：假游標被動 show 不得 scrollToSegId；Ctrl+G 走 `focusTargetEditorAtSegmentIndex`；**已通過** `694fa81` |
| 2026-06-29 | Phase 2.3c：統一 `scheduleEditorFocus` 管線、離屏 tip 頂/底、`onAfterRender` 每次 flush；**已實作，待驗收** |
