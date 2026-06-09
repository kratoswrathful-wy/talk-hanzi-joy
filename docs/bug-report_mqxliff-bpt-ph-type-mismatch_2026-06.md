# Bug Report：mqxliff bpt/ept vs ph 結構型別不匹配（Bug #10）

> 建立：2026-06-09  
> 狀態：**已修**（`fixMqxliffBptPhTypeMismatch` + `extractMqRxtDisplayText`）  
> 相關：[`bug-report_mqxliff-tag-issues.md`](bug-report_mqxliff-tag-issues.md)、[`CAT_MQXLIFF_TM_FIX_IMPLEMENTATION_PLAN.md`](CAT_MQXLIFF_TM_FIX_IMPLEMENTATION_PLAN.md) 階段 H／I

---

## 1. 現象

匯入部分 mqxliff 後，原文與譯文 tag pill **全部顯示橙色**（多餘／對不上），按 F8 無法修正。

典型樣本：`53905_02_JSON_JadeChampsItemsBatch5B_v1_zh_TW.json_zho-TW.mqxliff`，`trans-unit id="1"`。

- **原文**：`<bpt>…<mq:rxt displaytext="&lt;titleLeft&gt;" …/></bpt>` + 對應 `<ept>…</ept>`（open/close 成對）
- **譯文**（常來自 TM 模糊匹配）：`<ph>…<mq:rxt …/></ph>`（standalone 單一佔位）

畫面上 open tag 與 close tag 皆無法與原文對齊，譯者無法用 F8 一鍵修正。

---

## 2. 根因

### 2.1 reconcile 跳過型別差異

`reconcileTargetTagsMarkupFromSource` 依 `tagXmlNeedsReconcileFromSource` 判斷是否以原文覆寫譯文 tag。其中 `innerEscapedTagSig` 只比對**內層**跳脫標記名稱：

- source bpt 內 `&lt;mq:rxt …` → `open:mq:rxt`
- target ph 內 `&lt;mq:rxt …` → `open:mq:rxt`

兩者簽名相同 → reconcile **不觸發**，`targetTags` 仍保留錯誤的 `type: 'standalone'` 與 `<ph>` xml。

### 2.2 F8 不偵測型別

`insertNextMissingTag` 依譯文文字中 `{N}`／`{/N}` **佔位符是否存在**判斷缺漏，不比對 bpt/ept vs ph 結構。譯文已有 `{1}` 時 F8 認為 open 已存在，不會把 ph 改回 bpt。

### 2.3 displaytext 顯示截斷（附帶問題）

`mq:rxt` 的 `displaytext` 常存在**內層** textContent（實體編碼），外層 bpt/ept/ph 無 `displaytext` 屬性。`extractTaggedText` fallback 到整段 textContent，pill 顯示 `<mq:rxt displaytext="&lt;t…` 而非 memoQ 原生的 `<titleLeft>`。

---

## 3. 修正方案

### 3.1 Bug #10：`fixMqxliffBptPhTypeMismatch`

**檔案**：[`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js)

於 `mergePartialTargetTagsFromSource` **之後**、`reconcileTargetTagsMarkupFromSource` **之前**呼叫（僅 `isMqxliffFile`）：

1. 遍歷 `targetTags`：若條目 `type === 'standalone'`，且同 `ph` 的 source 為 `type === 'open'`（bpt），且 `innerEscapedTagSig` 相同 → 以 `{...sourceOpen}` 覆寫（含正確 bpt xml）。
2. 對已修正的 pairNum：若 source 有 close（`ph === '{/N}'`）而 target 無 → `push` source close 條目。

### 3.2 displaytext：`extractMqRxtDisplayText` + `displayFull`

**檔案**：[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)

在 `extractTaggedText` 的 ph／bpt／ept 分支，於無外層 `displaytext`／`equiv-text` 時：

- 正則抽出內層 `displaytext="…"` 並 HTML 解碼一層（**含 close ept** 的 `</mq:rxt displaytext=...`）
- 寫入 `display`（25 字截短）與 `displayFull`（完整 A）；**不修改** `xml`（匯出安全）

**標籤顯示三模式**（僅編號／簡短／延長、tooltip）：[`CAT_TAG_VIEW_MODE_IMPLEMENTATION_PLAN.md`](CAT_TAG_VIEW_MODE_IMPLEMENTATION_PLAN.md)。

---

## 4. 與 Bug #9 的關係

Bug #9（`shouldSkipAmpCollapseForMemoqInline`）保護匯出時 bpt/ept 內雙層實體。Bug #10 修正後 target 持有正確 bpt/ept 結構，兩者**互補**，無衝突。

---

## 5. 驗收步驟

1. **匯入**：開啟 JSON 樣本 `53905_02_JSON_JadeChampsItemsBatch5B_v1_zh_TW.json_zho-TW.mqxliff`，定位 `trans-unit id="1"`。
2. **pill 顏色**：open `{1}` 與原文 **藍色**（結構對齊）；若 close `{/1}` 仍缺，顯示 **橙色**（可 F8 補）。
3. **displaytext**：原文／譯文 pill 摘要顯示 `<titleLeft>`、`<mainText>` 等，非截斷 XML。
4. **F8**：對缺 close 的句段按 F8 → close pill 插入且顏色轉藍。
5. **匯出**：匯出 mqxliff → memoQ 重新匯入，tag 結構與文字可讀、無「Inline tag could not be parsed」。
6. **迴歸**：含 href 的 Consumer Insights 樣本（Bug #9）、NED Bug #8 句段行為不劣化。

---

## 6. 程式觸點

| 符號 | 檔案 |
|------|------|
| `fixMqxliffBptPhTypeMismatch` | `xliff-build-segments.js` |
| `extractMqRxtDisplayText`、`maybeMqRxtDisplayOnly` | `xliff-tag-pipeline.js` |
| `innerEscapedTagSig`（比對用） | `xliff-tag-pipeline.js`（既有） |
