# Bug Report：mqxliff mq:rxt val 屬性不符（Bug #12）

> **建立**：2026-06-26  
> **狀態**：**已修並驗收**（`2a88a48` — reconcile fall-through + QA val 比對）  
> **驗收**：產品端依 `36432_zho-TW.mqxliff` 列 203（SourceId 32739）重匯通過；`{1}` 為 `{hours:int}`、pill 藍；QA 可掃 val 不符  
> **相關**：[`bug-report_mqxliff-bpt-ph-type-mismatch_2026-06.md`](bug-report_mqxliff-bpt-ph-type-mismatch_2026-06.md)（Bug #10）、[`bug-report_mqxliff-targettags-xml-mismatch-f8_2026-06.md`](bug-report_mqxliff-targettags-xml-mismatch-f8_2026-06.md)（Bug #8）、[`bug-report_mqxliff-tag-issues.md`](bug-report_mqxliff-tag-issues.md)、[`CAT_MQXLIFF_TM_FIX_IMPLEMENTATION_PLAN.md`](CAT_MQXLIFF_TM_FIX_IMPLEMENTATION_PLAN.md) 階段 K

本文採雙層結構：**Part 1** 白話摘要；**Part 2** 技術根因、調查、修正與驗收。

---

## Part 1 — 白話摘要

### 1.1 發生什麼事

- 原文第 1 顆 tag 代表「**小時**」變數（`{hours:int}`），譯文卻被翻譯記憶帶成「**數值**」變數（`{value:int}`）— 來自另一句相似但語意不同的 TM 比對。
- 畫面上**兩邊都有** `{1}`、`{2}` 小方塊，顏色甚至可能是藍色，但 `{1}` 底下記錄的 XML **變數名稱錯了**。
- 按 **F8** 無法修正；**QA** 已勾 Tag 檢查卻沒報這句有 tag 問題（只出現術語類警告）。
- 若直接匯出，遊戲會收到 `{value:int}` 而非 `{hours:int}`，可能造成執行期錯誤。

### 1.2 為什麼系統「以為沒問題」

程式比對 tag 時，先看「這是什麼**種類**的元素」（例如都是 `mq:rxt`），種類一樣就**不再往下比**具體的 `val` 屬性值。  
就像兩張員工識別牌都寫「員工」，HR 系統就通過了，沒人發現一張寫「小時」、另一張寫「數值」。

### 1.3 與其他已知問題的差別

| 問題 | 現象 | 本 bug |
|------|------|--------|
| Bug #10 bpt vs ph | 原文 bpt/ept、譯文 ph，**型別**不同 | 兩邊都是 ph，**val 屬性值**不同 |
| Bug #8 displaytext xml 錯 | 常伴隨 pill 紅橘 | reconcile 短路，pill 可能仍藍 |
| Bug #11 連續 ph 錯位 | `{1}{2}…` vs `{1}{/1}…` | 佔位編號對，但同號 xml 內容錯 |
| QA「缺少 tag」 | 缺 `{N}` | 不適用（佔位已在） |

### 1.4 修正摘要（已落地）

1. **匯入 reconcile**：種類相同時仍比對完整 xml，發現 `val` 不同就以原文覆寫譯文 `targetTags`。
2. **比對時忽略 ph id**：避免 TM 同 val、不同 `id="1"` vs `id="3"` 造成假陽性。
3. **QA**：同 `{N}` 的 `mq:rxt val` 與原文不符時新增「Tag 檢查」警告。

---

## Part 2 — 技術細節

### 2.1 時間軸

| 日期 | 事項 |
|------|------|
| 2026-06-26 | 使用者回報：`36432_zho-TW.mqxliff` **列 203** F8 無法修正 tag；QA Tag 檢查未報錯；截圖顯示 `{1}` 為 `{value:int}` 而非 `{hours:int}` |
| 2026-06-26 | 讀取樣本 XML（SourceId 32739）：原文兩顆 ph、譯文 TM 僅 1 顆 ph 且 val 為 `{value:int}`；memoQ `<mq:warnings40>` 已有 extra/missing tag 警告 |
| 2026-06-26 | 根因：`tagXmlNeedsReconcileFromSource` 在 `innerEscapedTagSig` 皆為 `open:mq:rxt` 時短路 return false；F8 只看佔位存在；QA 只比 tag 編號 |
| 2026-06-26 | 撰寫本專文、更新 [`bug-report_mqxliff-tag-issues.md`](bug-report_mqxliff-tag-issues.md) 與 [`CAT_MQXLIFF_TM_FIX_IMPLEMENTATION_PLAN.md`](CAT_MQXLIFF_TM_FIX_IMPLEMENTATION_PLAN.md) 階段 K |
| 2026-06-26 | 程式落地並推送 **`2a88a48`**：K1 reconcile fall-through、K2 normalize 移除 id、K3 `_extractMqRxtValFromTagXml` + QA val 比對 |
| 2026-06-26 | **產品驗收成功**：重匯 `36432_zho-TW.mqxliff` 列 203 → `{1}` 為 `{hours:int}`、pill 藍；QA／F8 行為符合預期 |

### 2.2 調查過程（如何鎖定根因）

1. **畫面**：列 203 原文 `1 {hours:int} Hr 2 {minutes:int} Min`；譯文 `1 {value:int} 小時 2 {minutes:int} 分鐘`；QA 結果僅術語未套用。
2. **原始 XML**：`36432_zho-TW.mqxliff` 中 `SourceId: 32739` 對應句段（見 §2.3）；memoQ 已標 target extra/missing `mq:rxt`。
3. **程式對照**：`innerEscapedTagSig` 對 `{hours:int}` 與 `{value:int}` 皆回傳 `open:mq:rxt` → `tagXmlNeedsReconcileFromSource` 第 1246 行（修正前）直接 `return false`。
4. **F8 路徑**：`mergePartialTargetTagsFromSource` 已補 `{2}` → `targetText` 含 `{1}{2}` → `insertNextMissingTag` 認為無缺 tag。
5. **與 Bug #10 區分**：Bug #10 的 `fixMqxliffBptPhTypeMismatch` 要求 source 為 `open` bpt、target 為 `standalone` ph；本句兩邊皆 ph standalone，**不觸發** #10。

**易混淆點**：編輯器「列 203」對應 **SourceId 32739**（`InfoPanel_Guest_TIP_Value_Both`），非 `trans-unit@id="203"`。

### 2.3 範例句段 XML（修正前）

**原文**

```xml
<source xml:space="preserve" mq:segpart="23" …>
  <ph id="1">&lt;mq:rxt displaytext="{hours:int}" val="{hours:int}" /&gt;</ph> Hr
  <ph id="2">&lt;mq:rxt displaytext="{minutes:int}" val="{minutes:int}" /&gt;</ph> Min
</source>
```

**譯文**（TM 模糊匹配；target XML 僅含 1 顆 ph）

```xml
<target xml:space="preserve">
  <ph id="3">&lt;mq:rxt displaytext="{value:int}" val="{value:int}" /&gt;</ph> 分
</target>
```

**memoQ 警告（同句 `<mq:warnings40>`）**

- `Extra tag in target: "mq:rxt"`
- `Tag "mq:rxt" is missing from the target`

**CAT 內部表示（匯入後、修正前）**

| 欄位 | 列 203（錯誤態） |
|------|------------------|
| `sourceText` | `1 {1} Hr 2 {2} Min` |
| `sourceTags[0].xml` | ph 含 `val="{hours:int}"` |
| `targetText` | `1 {1} 小時 2 {2} 分鐘`（`{2}` 可能由 merge 補齊） |
| `targetTags[0].xml` | ph 含 `val="{value:int}"` ← **錯** |
| pill 顏色 | 可能仍藍（簽名比對未察覺 val 差異） |

### 2.4 根因（三層皆未攔）

#### 2.4.1 reconcile 短路（核心）

[`tagXmlNeedsReconcileFromSource`](../cat-tool/js/xliff-tag-pipeline.js)（修正前約 1244–1247 行）：

```javascript
const srcInner = innerEscapedTagSig(st.xml);  // → 'open:mq:rxt'
const tgtInner = innerEscapedTagSig(tt.xml);  // → 'open:mq:rxt'
if (srcInner && tgtInner) return srcInner !== tgtInner;  // 相等 → return false
return normalizeTagXmlForReconcile(st.xml) !== normalizeTagXmlForReconcile(tt.xml);
```

`innerEscapedTagSig` 只比對**內層元素名稱**，不比對 `val`／`displaytext`。簽名相同 → **直接 return false**，`normalizeTagXmlForReconcile` **永不執行**。

#### 2.4.2 F8 不補

`insertNextMissingTag` 依譯文 `{N}` **是否存在**判斷缺漏，不比對同號 tag 的 xml 內容。

#### 2.4.3 QA 不偵測（修正前）

[`_qaPushSegmentRuleFindings`](../cat-tool/app.js) 僅比對 tag **編號集合**，不比對同 `{N}` 的 `mq:rxt val`。

---

## 3. 修正方案（已實作 `2a88a48`）

### 3.1 改動 A — `tagXmlNeedsReconcileFromSource` fall-through

**檔案**：[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)

```javascript
// 修正前：
if (srcInner && tgtInner) return srcInner !== tgtInner;

// 修正後（Bug #12）：
if (srcInner && tgtInner && srcInner !== tgtInner) return true;
return normalizeTagXmlForReconcile(st.xml) !== normalizeTagXmlForReconcile(tt.xml);
```

**Bug #7 迴歸**：g vs pt 時 `innerEscapedTagSig` 不同 → 仍 early return true。  
**Bug #9 迴歸**：href 雙層實體 check 在第 1238 行，早於本段。

### 3.2 改動 B — `normalizeTagXmlForReconcile` 移除 `id`

比對時在既有移除 `rid` 基礎上，**同步移除 `id`**，避免 TM 同 val、不同 ph id 假陽性 reconcile：

```javascript
.replace(/\s+id\s*=\s*"[^"]*"/gi, '')
.replace(/\s+id\s*=\s*'[^']*'/gi, '')
```

（僅用於 reconcile **比對**，不修改寫入 Dexie／匯出的 `xml` 本體。）

### 3.3 改動 C — QA `mq:rxt val` 不符偵測

**檔案**：[`cat-tool/app.js`](../cat-tool/app.js)

- 新增 `_extractMqRxtValFromTagXml(xml)`：自 tag xml（含 `&quot;`）取出 `val`。
- `_qaPushSegmentRuleFindings`：同 `ph` 的 source／target tag 若皆含 `mq:rxt` 且 val 不同 → 併入「Tag 檢查」，例：`tag {1} 內容與原文不符（譯文 val="{value:int}"，原文 val="{hours:int}"）`。

### 3.4 匯入管線順序（與 Bug #10／#11 協同）

[`xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js)：

```
mergePartialTargetTagsFromSource
→ fixMqxliffTmPhSequentialPairs   （Bug #11，待修）
→ fixMqxliffBptPhTypeMismatch      （Bug #10）
→ reconcileTargetTagsMarkupFromSource  （Bug #7/8/9/12）
```

Bug #12 由 reconcile 在最後處理「型別正確但 val 不同」的殘餘情形。

---

## 4. 驗收步驟與結果

| # | 步驟 | 結果（2026-06-26 產品端） |
|---|------|---------------------------|
| 1 | 重匯 `36432_zho-TW.mqxliff`，列 203 | **通過** — `{1}` 為 `{hours:int}`，`{1}`、`{2}` pill 藍 |
| 2 | 同句按 F8 | **通過** — 無錯誤插入 |
| 3 | QA Tag 檢查 | **通過** — 重匯後該句無 val 不符誤報；舊資料可掃出警告（改動 C） |
| 4–7 | Bug #7／#8／#9／#10 迴歸 | 未在本輪全檔重跑；修正範圍侷限 reconcile 比對邏輯，與 #7 early-return、#9 href 前段 check 無衝突 |
| 8 | 舊 Dexie 資料 | 需重新開檔或 F8 觸發 reconcile（與其他 mqxliff tag bug 相同） |

---

## 5. 程式觸點

| 符號 | 檔案 |
|------|------|
| `tagXmlNeedsReconcileFromSource` | `xliff-tag-pipeline.js` |
| `normalizeTagXmlForReconcile` | `xliff-tag-pipeline.js` |
| `innerEscapedTagSig`（比對用，未改） | `xliff-tag-pipeline.js` |
| `reconcileTargetTagsMarkupFromSource` | `xliff-tag-pipeline.js` |
| `_extractMqRxtValFromTagXml` | `app.js` |
| `_qaPushSegmentRuleFindings` | `app.js` |

變更 `cat-tool/` 後執行 `npm run sync:cat`。

---

## 6. 狀態

| 項目 | 狀態 |
|------|------|
| 本文件 | 規格 + 驗收紀錄 |
| 改動 A（reconcile fall-through） | **已修並驗收** `2a88a48` |
| 改動 B（normalize 移除 id） | **已修並驗收** `2a88a48` |
| 改動 C（QA val 比對） | **已修並驗收** `2a88a48` |
