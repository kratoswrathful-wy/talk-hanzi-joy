# CAT 編輯器：Tag 著色、假游標、清除篩選、確認跳行（Phase 2.3）

> **狀態**：**已實作，待驗收**（2026-06-29）  
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

### 2.3 清除篩選跳位（C）

**根因**：`btnSfClearNav` 用 `rows[全檔索引]`；`runSearchAndFilter` 在 focus 後 `invalidateHeights()` 重設 scrollTop。

**修正**：以 `segId` + `scrollToSegId`；invalidate 後再錨定 `_scrollAnchorSegIdAfterFilter`。

### 2.4 確認跳行（D）

**根因**：大檔 `focusTargetEditorAtSegmentIndex` 無 scroll／center；單句 Ctrl+Enter 未用 `_pendingFocusSegIdxAfterRender`；`nextFocus === null` 無 fallback。

**修正**：virt 與非 virt 共用 scrollToSegId + scrollIntoView + focus；單句確認設 pending focus；null 時 toast + 留焦／假游標；確認 blur 略過假游標。

### 2.5 與 `51815db` 的關係

`51815db` 修 rowIdx／五態搜尋／`getGridRowBySegId`。本輪為 **Phase 2.3 延伸**（focus 路徑、invalidate 順序、tag sig），非 rowIdx 回歸。

---

## 開發與驗收時序

| 日期 | 事項 |
|------|------|
| 2026-06-29 | 規劃定案；實作 A～D；**待產品端驗收** |
