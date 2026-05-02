# Bug Report：mqxliff 部分譯文 targetTags 缺漏與 tag pill 退化

> 調查日期：2026-05-02  
> 專案：1UP TMS — CAT 工具（`cat-tool/`）  
> 範例檔：`tat_Localization_27-04-2026.xlsx_zho-TW.mqxliff` 句段 24（`trans-unit id="24"`）

本文採雙層結構：**Part 1** 用白話說明，給專案擁有者快速掌握問題與決策點；**Part 2** 為技術細節，供日後維運／AI 接手時查閱。

與既有 mqxliff 對照表見 [`bug-report_mqxliff-tag-issues.md`](bug-report_mqxliff-tag-issues.md)（**Bug #5**）。

---

## Part 1 — 白話摘要

### 1.1 發生什麼事

在 memoQ 匯出的 mqxliff 裡，若某句段的**譯文只翻了一半**（memoQ 狀態如「部分編輯」），XML 裡可能出現這種情況：

- **原文**有 8 個行內 tag（編號 1～8）
- **譯文**的 XML 裡**只寫了其中 2 個** `<ph>`，其餘 tag 根本還沒出現在譯文那一側

匯入 CAT 工具後，譯文欄用 F8 依序補上缺漏的 tag 時，**一開始**會看到藍色／灰色的小方塊（pill）；但過一會兒或重新整理畫面後，**第 3～8 號**又變成純文字 `{3}`、`{4}`…，不像正常的 tag 方塊。

### 1.2 為什麼會這樣（用比喻）

可以把「每個句段」想成一本小冊子：

- **原文**那一頁，目錄寫了 8 個「要保留的格式／換行位置」。
- **譯文**那一頁，有人只寫了前 2 個就停筆，所以**目錄頁只登記了 2 項**。
- CAT 工具在畫面上要畫小方塊時，會先看「譯文這邊登記了哪些 tag」。如果目錄只登記 2 個，後面你用 F8 補進去的文字雖然**內容**對了，但**目錄沒更新**，下次整頁重畫時，程式就**不知道** 3～8 號該畫成小方塊，只好把 `{3}` 當成一般字打出來。

### 1.3 為什麼一邊紅、一邊白

工具會比對「原文有哪些 tag」和「譯文有哪些 tag」來上色：

- **原文** 3～8 號在譯文側**對不到**（因為目錄不完整）→ 常顯示為**缺漏**（紅色）。
- **譯文** 1～2 號能對上 → 顯示為**已帶入**（偏白／淡色，依主題而定）。

這是**顯示與比對邏輯**的結果，不是檔案本身「壞掉」。

### 1.4 這些 tag 在 memoQ 裡常代表什麼

此案例中，多個 `<ph>` 內包的是 `<mq:ch … />`，`val` 為換行或空白類字元——通常對應 Excel／多欄文字裡的**換行**，不是一般 HTML 標籤。

### 1.5 需要你決定的事

1. **是否實作程式修正**（見 Part 2.4）：匯入時補齊 targetTags、F8 插入後同步更新 targetTags 並寫庫。建議 **Bug A + Bug B 一起修**，否則只修一邊仍可能復發。
2. **是否另做「換行 tag」友善顯示**（見 Part 2.5）：在**能精準辨識** `<mq:ch val="\n" />` 的前提下，把 pill 上的長串 XML 改成例如「↵ 換行」等短文案，方便譯者辨識。**只改畫面上的 display，不影響匯出 XML。**

---

## Part 2 — 技術細節

### 2.1 範例句段（XLIFF 結構摘要）

`trans-unit id="24"` 屬性含 `mq:status="PartiallyEdited"`（部分編輯）。

- **`<source>`**：含 `<ph id="1">` … `<ph id="8">`，內文皆為實體編碼的 `<mq:ch val="…" />`（典型為換行字元）。
- **`<target>`**：僅含 `<ph id="1">`、`<ph id="2">`，句尾另有一個 `\` 字元（來自原始檔，非 CAT 產生）。

匯入器對 `<target>` 呼叫 `CatToolXliffTags.extractTaggedText` 後：

- `sourceTags`：8 筆（`{1}`…`{8}`）
- `targetTags`：**2 筆**（僅 `{1}`、`{2}`）
- `targetText`：對應譯文字串 + `{1}`、`{2}` 佔位符 + 尾端 `\`

### 2.2 根因（兩個疊加）

#### Bug A — 匯入時未補齊「部分」targetTags

[`cat-tool/js/xliff-import.js`](../cat-tool/js/xliff-import.js) 的 `augmentTargetTagsForPlainInlineMemoQ` 設計用於 **Bug #3A**：譯文為行內 `mq:` 純文字、且 `targetTags.length === 0` 時，從 `sourceTags` 複製。

條件 `if (targetTags && targetTags.length) return;` 導致：**只要譯文已有任一 ph，`targetTags` 非空，整段補欄就跳過**，無法處理「只帶 1～2 個 ph、其餘缺」的 mqxliff。

#### Bug B — F8 插入後未更新 `seg.targetTags` / 寫庫未帶 targetTags

[`cat-tool/app.js`](../cat-tool/app.js) `insertNextMissingTag`：

- 以 `sourceTags` 為準插入下一個缺漏 tag（DOM 正確）。
- 更新 `seg.targetText = extractTextFromEditor(...)`。
- 呼叫 `applyUpdateSegmentTarget(seg, seg.targetText)` **未**附帶 `{ targetTags: … }`。
- **記憶體中的 `seg.targetTags` 仍為匯入時的 2 筆**，與實際字串中的 `{3}`… 不一致。

#### `effectiveTags` 與 `buildTaggedHtml`

[`cat-tool/app.js`](../cat-tool/app.js)：

```js
function effectiveTags(seg) {
    return (seg.targetTags && seg.targetTags.length > 0)
        ? seg.targetTags
        : (seg.sourceTags || []);
}
```

只要 `targetTags` 非空，就**永遠**採用譯文側 tag 陣列，即使該陣列只是 source 的**真子集**。  
`buildTaggedHtml` 僅對 `tagMap` 內有的 `ph` 產生 pill；`{3}`…`{8}` 無對應項目 → 走 `escapeHtml(part)` → **純文字顯示**。

任何觸發 `setEditorHtml(..., buildTaggedHtml(..., effectiveTags(seg)))` 的路徑都會復現退化，例如：`runSearchAndFilter` 重畫列、`sanitizeTargetEditorInlineArtifacts`、重新載入網格等（見 [`cat-tool/app.js`](../cat-tool/app.js) 內多處 `setEditorHtml`）。

### 2.3 色彩（`updateTagColors`）

`updateTagColors` 使用 `buildTagTokenSequence(effectiveTargetTags, tgtText)`。  
當 `effectiveTargetTags` 只有 2 筆時，譯文 token 序列無法涵蓋字串中的 `{3}`…（這些 token 在比對邏輯中亦可能視為「多出」或無法與 source 簽名對齊），導致原文側多數 tag 呈 **missing**（紅）、譯文側已登記者呈 **present**（淡色／白）。

### 2.4 修正建議

| 編號 | 位置 | 動作 |
|------|------|------|
| **Bug A** | [`xliff-import.js`](../cat-tool/js/xliff-import.js) | 在 mqxliff 單段 TU 流程中，當 `sourceTags.length > targetTags.length` 時，依 `ph` 編號將缺漏項從 `sourceTags` 合併進 `targetTags`（保留已解析之 `xml`／順序與現有邏輯一致）。或放寬 `augmentTargetTagsForPlainInlineMemoQ` 的提前 return 條件。 |
| **Bug B** | [`app.js`](../cat-tool/app.js) `insertNextMissingTag` | 每插入一個 tag，將對應條目 push 至 `seg.targetTags`（若尚不存在）；`applyUpdateSegmentTarget(seg, seg.targetText, { targetTags: seg.targetTags })`。成對插入時一併補齊 open/close。 |

兩項需**一併**實作，否則僅修匯入仍無法修正「已入庫資料」或 F8 後未寫回 tag 中繼的情況。

### 2.5 Enhancement：換行 `mq:ch` 的 display 文案（可選）

**目標**：在可精準辨識時，將 pill 的 `display` 從長串 `<mq:ch val="…" />` 改為短標籤（如 `↵ 換行`），**不修改** `xml`／匯出路徑。

**建議觸發條件**（窄化、降低誤判）：

- 處理節點為 `ph` / `it` / `x`，且無可用的 `displaytext`／`equiv-text` 走 fallback 到 `textContent` 時。
- `textContent` 完全符合（正則概念）「`<mq:ch val="` + 僅換行類字元 + `" />`」—例如 `^<mq:ch val="\r?\n" />$`（依實際 DOM 解碼後字串調整）。

實作位置：[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js) `extractTaggedText` 內計算 `meaningfulRaw`／`display` 處。

### 2.6 相關程式碼索引

| 主題 | 檔案 | 符號／區段 |
|------|------|------------|
| mqxliff 匯入、augment | [`cat-tool/js/xliff-import.js`](../cat-tool/js/xliff-import.js) | `augmentTargetTagsForPlainInlineMemoQ`、單段 TU `extractTaggedText` |
| 佔位符擷取、display | [`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js) | `extractTaggedText` |
| 譯文 pill HTML | [`cat-tool/app.js`](../cat-tool/app.js) | `effectiveTags`、`buildTaggedHtml` |
| F8 插入 | [`cat-tool/app.js`](../cat-tool/app.js) | `insertNextMissingTag`、`buildTagSpan` |
| 寫庫 | [`cat-tool/app.js`](../cat-tool/app.js) | `applyUpdateSegmentTarget`；[`cat-tool/db.js`](../cat-tool/db.js) `updateSegmentTarget` |
| 列重畫／搜尋 | [`cat-tool/app.js`](../cat-tool/app.js) | `runSearchAndFilter`、`sanitizeTargetEditorInlineArtifacts`、`renderEditorSegments` |

### 2.7 驗收要點（實作後）

1. 匯入上述 mqxliff 句段 24 後，`targetTags` 筆數與 `sourceTags` 一致（或至少涵蓋原文所有 `ph` 編號）。
2. F8 插入 3～8 號後，觸發搜尋篩選、失焦寫庫、重新開啟檔案，譯文欄仍為 pill，不變 `{N}` 純字串。
3. 匯出 mqxliff  round-trip：與 [`XLIFF_TAG_PIPELINE.md`](XLIFF_TAG_PIPELINE.md) 既有規範一致，不因 display 文案改變而破壞 XML。

---

## 調查與決策記錄

- 問題由使用者回報句段 24 譯文 tag 3～8 與紅／白顯示差異；經讀取實際 mqxliff `<source>`／`<target>` 與程式路徑對照後，歸因為 **partial targetTags + effectiveTags 全有或全无** + **F8 未同步 targetTags**。
- **Bug #3A** 與本問題互補：#3A 處理「譯文 targetTags 完全空但有 mq 純文字」；本問題處理「譯文 targetTags 非空但為真子集」。
