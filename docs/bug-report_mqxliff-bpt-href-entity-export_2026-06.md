# Bug Report：mqxliff bpt/ept 內 mq:rxt 超連結匯出編碼損壞（memoQ 無法重新匯入）

> **建立**：2026-06-08  
> **狀態**：**已修並驗收**（`584c707` — `shouldSkipAmpCollapseForMemoqInline` + `tagXmlNeedsReconcileFromSource`；`npm run sync:cat` 同步 `public/cat/`；Consumer Insights + NGR T1 雙樣本 memoQ 匯入確認無誤）  
> **樣本**：  
> - `TD - Consumer Insights - Localisation Sheet.xlsx_zho-TW.mqxliff` — `trans-unit id="14"`（第 505 行）、`id="18"`（第 577 行）  
> - `Translated_NGR T1_zh-TW 1118.xliff_zho-TW.mqxliff` — 第 1796 行（position 51–210）  
> **程式觸點**：[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js) — `prepareRestoredFragmentForXmlParse`、`tagXmlNeedsReconcileFromSource`、`reconcileTargetTagsMarkupFromSource`、`exportXliffFamilyToBlob`  
> **對照**：[`bug-report_mqxliff-tag-issues.md`](./bug-report_mqxliff-tag-issues.md) **Bug #9**；與 Bug #7（pt/g）、Bug #8（displaytext 內容）區分

本文採雙層結構：**Part 1** 白話摘要；**Part 2** 技術根因、修正與驗收。

---

## Part 1 — 白話摘要

### 1.1 發生什麼事

- CAT 匯出 mqxliff 後，用 **memoQ 重新匯入**時失敗，報告 **「Inline tag could not be parsed」**（例如第 505 行）。
- 問題句多為「**隱私政策**」這類帶**超連結**的句子：原文與譯文都有行內 tag（小方塊 pill），不是純文字。
- 用記事本打開匯出檔，會發現 `<target>` 裡 `<bpt>`／`<ept>` 內的連結 tag 寫壞了：`href="https://..."` 的雙引號**沒有正確轉義**，XML 結構斷掉。

### 1.2 名詞（一句話）

| 名詞 | 白話 |
|------|------|
| **bpt / ept** | memoQ 用來包「格式開始／結束」的 XLIFF 行內元素；裡面常再塞一段跳脫過的文字描述真正的 tag。 |
| **mq:rxt** | memoQ 常見的行內 tag 類型；超連結、換行等常出現在它的 `displaytext`／`val` 屬性裡。 |
| **雙層轉義** | 在 mqxliff 檔案裡，連結可能寫成 `&amp;lt;a href=&amp;quot;https://...`（`&amp;` 再包 `&lt;`、`&quot;`），memoQ 才能正確讀。 |

### 1.3 與其他已知問題的差別

| 議題 | 現象 | 本 bug |
|------|------|--------|
| SRT 無 tag、純文字 `<…>` | 匯出後顯示字面量 `&lt;…&gt;` 或內容消失 | 本句**有** bpt/ept/ph |
| 遊戲標記 `<AI>` + ph | ph 變純文字、雙重 `&amp;lt;` | 主因是 bpt **內** href 引號，不是遊戲標記 |
| Bug #8 mq:rxt displaytext 錯 | 原文 `[0-1`、譯文 `[0-2` | 本次是**編碼層級**（`&amp;quot;` 被解成裸 `"`），內容可能仍叫「隱私政策」 |
| Bug #7 bpt 內 pt vs g | 元素型別不一致 | 本次是 **href 引號**轉義，不是 pt/g |

### 1.4 暫時迴避（修正前參考，目前已無需操作）

> **目前狀態**：`584c707` 已修並驗收，正常匯出的 mqxliff 應可直接匯回 memoQ，無需手動修檔。

若需在舊版或未同步版本下緊急處理：

1. 用記事本開啟匯出的 mqxliff。
2. 到錯誤行（Consumer Insights：第 **505**、**577** 行；NGR T1：第 **1796** 行）的 `<target>`。
3. 把 `<bpt>`、`<ept>`、`<ph>` 內的 tag 段落改成**與同一句 `<source>` 完全相同**的轉義（`&amp;lt;`、`&amp;quot;`）；**中文譯文可保留**。
4. 存檔後再匯入 memoQ。

Consumer Insights 使用者曾以此方式手動驗收通過（2026-06-08）。

---

## Part 2 — 技術細節

### 2.1 症狀與錯誤輸出對照

**memoQ 錯誤（Consumer Insights）**：`Inline tag could not be parsed. The error occurred somewhere between position 55 in line 505 and position 312 in line 505.`

**memoQ 錯誤（NGR T1 — 觸發同問題的第二個驗收樣本）**：`Inline tag could not be parsed. The error occurred somewhere between position 51 in line 1796 and position 210 in line 1796.`

**錯誤匯出（片段）**：

```xml
<bpt …>&lt;mq:rxt displaytext="&lt;a href="https://www.hutch.io/privacy/" rel="nofollow" target="_blank"&gt;" val="…"&gt;</bpt>
```

**正確（與 `<source>` 一致）**：

```xml
<bpt …>&lt;mq:rxt displaytext="&amp;lt;a href=&amp;quot;https://www.hutch.io/privacy/&amp;quot; …&amp;gt;" val="…"&gt;</bpt>
```

### 2.2 根因

匯出路徑（mqxliff）：

```
exportXliffFamilyToBlob
  → reconcileTargetTagsMarkupFromSource
  → replacePlaceholders
  → prepareRestoredFragmentForXmlParse
       └ collapseAmpEntitiesRepeated（對整段 fragment）
  → setXmlTargetContent（DOMParser + XMLSerializer）
```

1. **`extractTaggedText`** 將整個 `<bpt>…</bpt>` 序列化存入 `tag.xml`；內文為 memoQ 雙層實體（`&amp;lt;`、`&amp;quot;`）。
2. **`prepareRestoredFragmentForXmlParse`** 對整段字串執行 **`collapseAmpEntitiesRepeated`**，把 `&amp;lt;` → `&lt;`、`&amp;quot;` → `&quot;`（在 bpt **文字內容**尚未寫入 XML 前）。
3. **`setXmlTargetContent`** 再經 DOM 解析／序列化**多解碼一層**，`&quot;` 變成裸 `"`，破壞 `displaytext="…"` 屬性邊界。
4. **`tagXmlNeedsReconcileFromSource`**（修正前）在 inner sig 相同時可能**不觸發** reconcile，無法擋下「編碼深度不同但語意相近」的 targetTags。

### 2.3 修正方案（已實作）

**方案 A — 條件化 `collapseAmpEntitiesRepeated`**

- 新增 `shouldSkipAmpCollapseForMemoqInline(fragment)`：fragment 含真實 `<bpt`／`<ept`／`<ph` **且** 含 `&amp;lt;`／`&amp;quot;`／`&amp;gt;` 時，**跳過**全域 collapse。
- 其餘情況維持原行為（遊戲 `<AI>`、三層 `&amp;amp;` 等）。

**方案 B — 匯出前 reconcile 防線**

- 擴充 **`tagXmlNeedsReconcileFromSource`**：當 source `xml` 含 `mq:rxt` + `href` 且仍含 `&amp;quot;`／`&amp;lt;`，而 target 已失去雙層實體，或出現 `displaytext="&lt;…href="` 裸引號型態 → 強制以 `sourceTags` 覆寫。

### 2.4 程式觸點

| 符號 | 檔案 | 說明 |
|------|------|------|
| `shouldSkipAmpCollapseForMemoqInline` | `xliff-tag-pipeline.js` | 判斷是否跳過 amp collapse |
| `prepareRestoredFragmentForXmlParse` | 同上 | 條件化 collapse |
| `tagXmlNeedsReconcileFromSource` | 同上 | Bug #9 編碼深度／裸引號偵測 |
| `reconcileTargetTagsMarkupFromSource` | 同上 | 匯出前已呼叫，無需改簽名 |
| `exportXliffFamilyToBlob` | 同上 | mqxliff 分支 reconcile 不變 |

### 2.5 驗收清單

**程式修後（產品端）**

1. 開啟 Consumer Insights mqxliff，確認 `trans-unit id="14"`、`id="18"` 譯文正確。
2. 匯出 mqxliff；記事本檢查第 505、577 行 `<target>`：**須含** `&amp;lt;`、`&amp;quot;`；**不得**出現 `displaytext="&lt;a href="https://`（裸引號）。
3. 匯入 memoQ：**無**「Inline tag could not be parsed」。
4. 回歸：SRT 無 tag `<…>`、Focus `<AI>`、2XKO `<50GB`+bpt、NED Bug #8 樣本（見 [`XLIFF_TAG_PIPELINE.md`](./XLIFF_TAG_PIPELINE.md) §8）。

**靜態腳本（開發端）**

```powershell
node scripts/test-mqxliff-bpt-href-export.mjs
```

全部 7 項斷言 OK（`shouldSkipAmpCollapseForMemoqInline`、`prepareRestoredFragmentForXmlParse` 保留雙層實體、`tagXmlNeedsReconcileFromSource` 偵測正確）。

### 2.5.1 驗收結果（`584c707`，2026-06-09）

| 樣本 | 動作 | 結果 |
|------|------|------|
| Consumer Insights — 手動修第 505／577 行 | 記事本修正後 memoQ 匯入 | ✅ 通過（2026-06-08） |
| Consumer Insights — 程式修正後重新匯出 | CAT 匯出 → memoQ 匯入 | ✅ 通過 |
| NGR T1 `1118.xliff_zho-TW.mqxliff` 第 1796 行 | CAT 匯出 → memoQ 匯入 | ✅ 通過（2026-06-09） |
| 靜態測試腳本 | `node scripts/test-mqxliff-bpt-href-export.mjs` | ✅ 7/7 OK |

### 2.6 重要後記：「修正」與「落地」的差距

2026-06-08 已在 `cat-tool/js/xliff-tag-pipeline.js` 實作修正，但**未執行 `npm run sync:cat`**，導致 `public/cat/js/xliff-tag-pipeline.js`（App 實際載入的版本）仍為舊版。2026-06-09 NGR T1 匯入 memoQ 再次失敗，才發現同步步驟遺漏。

**教訓**：`cat-tool/` 改完後，**一定要執行 `npm run sync:cat` 並將 `public/cat/` 一併提交**，否則修正只存在於開發端原始碼，App 用戶不受益。

### 2.7 變更時間線

| 日期 | 事項 |
|------|------|
| 2026-06-08 | 使用者回報 Consumer Insights 匯出檔 memoQ 無法匯入；手動修第 505／577 行後驗收通過 |
| 2026-06-08 | 撰寫本專文與修正計畫；實作方案 A+B（`shouldSkipAmpCollapseForMemoqInline`、`tagXmlNeedsReconcileFromSource`）；**未執行 `sync:cat`，未 commit** |
| 2026-06-09 | NGR T1 匯入 memoQ 再次失敗（同類問題）；確認 `public/cat/` 尚未同步 |
| 2026-06-09 | 執行 `npm run sync:cat`；靜態測試全 OK；commit `584c707` 並推送；Consumer Insights + NGR T1 產品驗收通過 |

---

## 延伸與維護邊界

- 本修正**不**改變 mxliff（Phrase）`textContent` 匯出路徑。
- 若譯文**刻意**修改連結 URL 且需與原文不同 encoding，需另訂產品規格；目前以「匯出可匯回 memoQ」優先，對齊 `sourceTags.xml` 編碼層級。
- 相關管線總覽：[`XLIFF_TAG_PIPELINE.md`](./XLIFF_TAG_PIPELINE.md) §8 Bug #9 小節。
