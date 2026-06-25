# Bug Report：mqxliff mq:rxt val 屬性不符（Bug #12）

> 建立：2026-06-26  
> 狀態：**已實作，待驗收**  
> 相關：[`bug-report_mqxliff-bpt-ph-type-mismatch_2026-06.md`](bug-report_mqxliff-bpt-ph-type-mismatch_2026-06.md)（Bug #10）、[`bug-report_mqxliff-targettags-xml-mismatch-f8_2026-06.md`](bug-report_mqxliff-targettags-xml-mismatch-f8_2026-06.md)（Bug #8）、[`bug-report_mqxliff-tag-issues.md`](bug-report_mqxliff-tag-issues.md)、[`CAT_MQXLIFF_TM_FIX_IMPLEMENTATION_PLAN.md`](CAT_MQXLIFF_TM_FIX_IMPLEMENTATION_PLAN.md) 階段 K

---

## 1. 現象

樣本：`36432_zho-TW.mqxliff` — 編輯器顯示列 **203**（`SourceId: 32739`，`UniqueName: InfoPanel_Guest_TIP_Value_Both`）。

| 欄位 | 內容 |
|------|------|
| **原文** | `1 {hours:int} Hr 2 {minutes:int} Min` |
| **譯文**（TM 帶入） | `1 {value:int} 小時 2 {minutes:int} 分鐘` |

- 第 1 顆 tag：原文 `{hours:int}`，譯文 `{value:int}` — **變數名稱不同**。
- 按 **F8** 無法修正；**QA** 已勾「Tag 是否有遺漏／錯誤」卻未報此句 tag 問題（僅術語類警告）。
- memoQ 原始 `<mq:warnings40>` 已標「Extra tag in target」「missing inline tag」，CAT 匯入後仍保留錯誤 `targetTags`。

**與 Bug #10 的差異**：Bug #10 修的是「同 `{N}` 的 bpt/ept vs ph **型別**」；本 bug 是譯文與原文皆為 `<ph>` standalone，但 `mq:rxt` 的 **`val` 屬性值**不同（`{hours:int}` vs `{value:int}`）。

**與 Bug #8 的差異**：Bug #8 多為 `displaytext` 或整段 xml 不一致且常伴隨著色紅橘；本 bug 因 `innerEscapedTagSig` 短路，reconcile **完全不觸發**，pill 可能仍顯示藍色但匯出 val 錯誤。

---

## 2. 根因

### 2.1 譯文 XML（SourceId 32739）

**原文**：

```xml
<ph id="1">&lt;mq:rxt displaytext="{hours:int}" val="{hours:int}" /&gt;</ph> Hr
<ph id="2">&lt;mq:rxt displaytext="{minutes:int}" val="{minutes:int}" /&gt;</ph> Min
```

**譯文**（TM 模糊匹配，僅 1 顆 ph 在 target XML；`{2}` 由 `mergePartialTargetTagsFromSource` 自 source 補齊）：

```xml
<ph id="3">&lt;mq:rxt displaytext="{value:int}" val="{value:int}" /&gt;</ph> 分
```

（編輯器內經補齊後譯文可見兩顆 pill，但 `{1}` 的 xml 仍為 `{value:int}`。）

### 2.2 reconcile 短路（核心）

[`tagXmlNeedsReconcileFromSource`](../cat-tool/js/xliff-tag-pipeline.js)（約 1244–1247 行）：

```javascript
const srcInner = innerEscapedTagSig(st.xml);  // → 'open:mq:rxt'
const tgtInner = innerEscapedTagSig(tt.xml);  // → 'open:mq:rxt'
if (srcInner && tgtInner) return srcInner !== tgtInner;  // 相等 → return false
return normalizeTagXmlForReconcile(st.xml) !== normalizeTagXmlForReconcile(tt.xml);
```

`innerEscapedTagSig` 只比對**內層元素名稱**（`&lt;mq:rxt` → `open:mq:rxt`），不比對 `val`／`displaytext` 屬性。兩者簽名相同 → **直接 return false**，後方 `normalizeTagXmlForReconcile` 全 xml 比較**永不執行**。

### 2.3 F8 不補

`insertNextMissingTag` 依譯文文字中 `{N}` 佔位符**是否存在**判斷缺漏。`mergePartialTargetTagsFromSource` 已補上 source `{2}`，`targetText` 含 `{1}{2}` → F8 認為無缺 tag，**不比對**同號 tag 的 xml 內容。

### 2.4 QA 不偵測

[`_qaPushSegmentRuleFindings`](../cat-tool/app.js) 僅比對原文與譯文 **tag 編號集合**（`_qaTagIdForCompare`、`_qaPlainTargetTagNumSet`），不比對同 `{N}` 的 `mq:rxt val` 是否一致。

---

## 3. 修正方案

### 3.1 改動 A — `tagXmlNeedsReconcileFromSource` fall-through

**檔案**：[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)

將第 1246 行由「簽名存在即 return」改為「僅在簽名**不同**時 early return true；相同則 fall-through」：

```javascript
// 改前：
if (srcInner && tgtInner) return srcInner !== tgtInner;

// 改後：
if (srcInner && tgtInner && srcInner !== tgtInner) return true;
// 簽名相同時繼續比較 normalizeTagXmlForReconcile（捕捉 val 等屬性差異）
return normalizeTagXmlForReconcile(st.xml) !== normalizeTagXmlForReconcile(tt.xml);
```

**Bug #7 迴歸**：g vs pt 時 `innerEscapedTagSig` 不同 → 仍 early return true，行為不變。  
**Bug #9 迴歸**：href 雙層實體 check 在第 1238 行，早於本段，不受影響。

### 3.2 改動 B — `normalizeTagXmlForReconcile` 移除 `id`

**檔案**：同上

memoQ 常見原文 ph `id="1"`、譯文 ph `id="3"` 但 `val` 相同。改動 A 後若不比對時排除 `id`，會產生**假陽性** reconcile。在既有移除 `rid` 的基礎上，**同步移除 `id` 屬性**再比較：

```javascript
.replace(/\s+id\s*=\s*"[^"]*"/gi, '')
.replace(/\s+id\s*=\s*'[^']*'/gi, '')
```

（僅用於 reconcile 比對，**不修改**寫入 Dexie／匯出的 `xml` 本體。）

### 3.3 改動 C — QA `mq:rxt val` 不符偵測

**檔案**：[`cat-tool/app.js`](../cat-tool/app.js)

1. 新增 helper `_extractMqRxtValFromTagXml(xml)`：自 tag 的 `xml` 字串（含 `&quot;` 跳脫）取出 `val` 屬性值。
2. 在 `_qaPushSegmentRuleFindings` 的 Tag 區塊，於現有「缺少／多餘 tag 編號」檢查之後：對每個 source tag，找譯文同 `ph` 的 target tag；若兩者 xml 皆含 `mq:rxt` 且 `val` 不同 → 推送新規則「Tag 內容與原文不符」（或同類型現有 tag 錯誤分類）。

**用途**：已存在 Dexie／Supabase 的舊錯誤資料，在程式修正前匯入的句段，可透過 QA 一鍵掃描全檔。

### 3.4 匯入管線順序（與 Bug #10／#11 協同）

[`xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) 現有順序不變：

```
mergePartialTargetTagsFromSource
→ fixMqxliffTmPhSequentialPairs   （Bug #11，待修）
→ fixMqxliffBptPhTypeMismatch      （Bug #10）
→ reconcileTargetTagsMarkupFromSource  （Bug #7/8/9/12）
```

Bug #12 由 reconcile 在最後處理「型別正確但 val 不同」的殘餘情形。

---

## 4. 驗收步驟

1. **匯入**：開啟 `36432_zho-TW.mqxliff`，定位列 203（SourceId 32739）→ 譯文 `{1}` pill 顯示 `{hours:int}`（非 `{value:int}`），`{1}`、`{2}` 皆**藍色**。
2. **F8**：同句按 F8 → 無多餘插入或提示 tag 已完整。
3. **QA**：對全檔或該句執行 QA（Tag 檢查開啟）→ 修正前舊資料應出現「Tag 內容與原文不符」；修正後重匯則不應誤報。
4. **Bug #7 迴歸**：Companion mqxliff `trans-unit id="41"` — bpt/ept 內 `g`，藍色。
5. **Bug #8 迴歸**：NED 樣本第 24／62／63 行 — mq:rxt displaytext 一致。
6. **Bug #9 迴歸**：Consumer Insights 第 14／18 句匯出 → memoQ 無「Inline tag could not be parsed」。
7. **Bug #10 迴歸**：JSON 樣本 `trans-unit id="2"`（已 bpt/ept）行為不劣化。
8. **舊 Dexie 資料**：已開過之案子重新開檔或對錯誤句按 F8 → reconcile 更新 `targetTags`，pill 轉藍。

---

## 5. 程式觸點

| 符號 | 檔案 |
|------|------|
| `tagXmlNeedsReconcileFromSource` | `xliff-tag-pipeline.js` |
| `normalizeTagXmlForReconcile` | `xliff-tag-pipeline.js` |
| `innerEscapedTagSig`（比對用，不修改） | `xliff-tag-pipeline.js` |
| `reconcileTargetTagsMarkupFromSource` | `xliff-tag-pipeline.js` |
| `_extractMqRxtValFromTagXml`（待新增） | `app.js` |
| `_qaPushSegmentRuleFindings` | `app.js` |

變更 `cat-tool/` 後執行 `npm run sync:cat`。

---

## 6. 狀態

| 項目 | 狀態 |
|------|------|
| 本文件 | 規格 |
| 改動 A（reconcile fall-through） | **已實作** |
| 改動 B（normalize 移除 id） | **已實作** |
| 改動 C（QA val 比對） | **已實作** |
