# Bug Report：空 `targetTags` + F8 單筆 push 導致整列譯文 tag pill 變純文字

> 調查／文件日期：2026-05-08  
> 專案：1UP TMS — CAT 工具（`cat-tool/`）  
> 範例情境：`.sdlxliff`（例如 `20260507 apple-tech-know-how-aus-oesterreich.docx.sdlxliff`）譯文缺 `{/1}`，按 **F8** 欲插入後，**整行** `{1}`、`{2}` 等佔位符均變為純文字（非藥丸）。

本文採雙層結構：**Part 1** 白話摘要；**Part 2** 技術根因與修正規劃（**待實作**）。

與 **mqxliff「部分 targetTags」**（真子集）問題對照見 [`bug-report_mqxliff-partial-target-tags.md`](bug-report_mqxliff-partial-target-tags.md) §2.8。

---

## Part 1 — 白話摘要

### 1.1 發生什麼事

譯文欄裡的 `{1}`、`{/1}` 等小方塊（pill）要能畫出來，除了字串本身，程式還需要一份**小字典**（`targetTags`，必要時用原文的 `sourceTags`）：記錄每個佔位符對應的 XML、開閉合類型等。

若匯入後**譯文這邊的字典是空的**（空陣列 `[]`），畫面仍可能**正常**：程式會**暫時借用原文字典**來畫 pill。

使用者按 **F8** 補上一個缺漏標籤時，程式會把「這次補上的那一筆」寫進譯文字典。字典從「空的」變成「**只有一筆**」之後，規則變成：**只認譯文字典，不再借原文**。於是譯文裡**其他**早就存在的 `{2}`、`{/2}`… 在字典裡找不到說明，重畫時就被當成一般字元 → **整行看起來都像純文字**。

### 1.2 與檔案格式的關係

**根因與副檔名無關**（同一套 `effectiveTags`／`buildTaggedHtml` 邏輯）。**sdlxliff 較常踩到**，是因為匯入管線裡若干「從 `sourceTags` 幫譯文補齊字典」的步驟寫成 **僅 mqxliff 執行**（見 Part 2.3），sdlxliff 句段更容易長期維持 `targetTags: []`。

### 1.3 需要你決定的事項（實作前）

1. **是否只做編輯器層（F8／點原文插入後合併）**，或再加 **`effectiveTags` 讀取時防呆**（可修復已寫入 DB 的殘缺字典）。
2. **失焦寫庫時**是否順便把合併後的完整 `targetTags` 寫回雲端／本機（自我修復資料；需評估 revision 與流量）。

### 1.4 需要你注意的事項

- 若句段已經按過 F8 並存檔，記憶體或 DB 裡的 `targetTags` 可能已是**殘缺**，僅改「下次 F8」不夠時，須依 Part 2 方案 B 或手動重匯／修資料。
- **點原文 tag 插入**路徑目前未必同步 `targetTags`（與 F8 行為可能不一致）；實作時宜一併對齊（見 Part 2.4）。

---

## Part 2 — 技術細節

### 2.1 觸發條件

1. `seg.targetTags` 為 **空陣列** `[]`（長度 0，falsy 於 `effectiveTags` 的條件中：`(seg.targetTags && seg.targetTags.length > 0)` 為假）。
2. `seg.sourceTags` 非空，且譯文 `targetText` 已含多個 `\{\/?\d+\}` 佔位符（畫面靠 fallback 仍顯示 pill）。
3. 使用者觸發 **`insertNextMissingTag`（F8）**，程式向 `seg.targetTags` **push 僅新插入的**一筆（或成對兩筆），未將譯文**已存在**之佔位符對應條目從 `sourceTags` 一併合併。
4. 任一後續路徑呼叫 `buildTaggedHtml(plain, effectiveTags(seg))`（例如譯文格 **blur** 時的 `rebuildTargetEditorFromExtractedPlain`），則 `effectiveTags` 改採**殘缺** `targetTags`，`buildTaggedHtml` 對未登錄之 `ph` 走 `escapeHtml` → **純文字**。

**與 mqxliff「真子集」案例之差異**：

| 情境 | `targetTags` 匯入後狀態 | 觸發動作 | 與本報告重疊 |
|------|-------------------------|----------|--------------|
| mqxliff 部分編輯 | 非空，但為 `sourceTags` 之真子集 | F8 或重畫 | 同樣受 `effectiveTags`「有譯文則全用譯文」影響；見 [`bug-report_mqxliff-partial-target-tags.md`](bug-report_mqxliff-partial-target-tags.md) |
| 本報告（sdlxliff 等） | **空陣列** `[]` | **首次** F8 push 後變「極小非空」 | 觸發鏈起點不同，退化現象相同 |

### 2.2 程式錨點

| 主題 | 檔案 | 符號／區段 |
|------|------|------------|
| 譯文用哪份 tags 畫 pill | [`cat-tool/app.js`](../cat-tool/app.js) | `effectiveTags` |
| 佔位符 → HTML pill | [`cat-tool/app.js`](../cat-tool/app.js) | `buildTaggedHtml` |
| F8 插入與 `targetTags` push | [`cat-tool/app.js`](../cat-tool/app.js) | `insertNextMissingTag`（註解「Bug #5」同步 `targetTags` 區段） |
| 失焦重建 DOM | [`cat-tool/app.js`](../cat-tool/app.js) | `rebuildTargetEditorFromExtractedPlain` → `buildTaggedHtml(..., effectiveTags(seg))` |
| mqxliff 專用合併（sdlxliff 不跑） | [`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) | `mergeMqxliffPartialTargetTagsFromSource`（`if (!isMqxliffFile) return`）等 |

### 2.3 為何 sdlxliff 較常見

[`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) 內，依 `targetText` 從 `sourceTags` 補齊譯文側 tag 中繼的邏輯綁在 **`isMqxliffFile`**。sdlxliff 匯入後較容易留下 **`targetTags: []`** 而譯文已有 `{N}`，直到 F8 才首次寫入非空 `targetTags`，因而觸發本報告之退化。

### 2.4 修正方案（待實作依據）

**方案 A（建議必做）— 插入後合併補齊**

- 新增共用函式（名稱可議）：依譯文純文字掃出所有 `\{\/?\d+\}`，對每個 `ph`：若 `targetTags` 尚無、且 `sourceTags` 有同 `ph`，則 **淺拷貝** `sourceTags` 條目 push 進 `targetTags`；**不覆寫**已存在條目（保留譯文側已解析之 `xml` 等）。
- 呼叫點：`insertNextMissingTag` 在更新 `seg.targetText` 與 push 新 tag **之後**呼叫；並評估 **`onSourceTagInsertClick`** 於插入後同樣合併，且寫庫參數與 F8 一致（避免兩條路徑分歧）。

**方案 B（建議強烈考慮）— `effectiveTags` 防呆**

- 當 `targetTags.length > 0` 時，仍以 `targetText`（或與編輯器約定之權威字串）掃描佔位符，對缺漏 `ph` **虛擬合併**自 `sourceTags`（或突變 `seg.targetTags` 僅供當次渲染—需決策），使已存殘缺 DB 句段在 blur／重畫時自動恢復 pill。

**方案 C（可選）— 匯入層**

- 將 `mergeMqxliffPartialTargetTagsFromSource` 抽為共用，或放寬條件使 **sdlxliff／一般 XLIFF** 在匯入時即補齊「譯文已出現之 `ph`」對應之 `targetTags`，減少執行期合併。

實作完成後請於下方 **§2.6** 回填 commit、`npm run sync:cat` 與驗收日期。

### 2.5 驗收要點（實作後）

1. 匯入（或構造）句段：`targetTags` 為 `[]`，譯文含多個 `{N}`／`{/N}`，畫面 pill 正常。
2. 按 **F8** 插入下一個缺漏標籤（例如 `{/1}`）後，**其餘**佔位符仍為 pill，非純文字。
3. **失焦**、**Ctrl+Enter 確認**、篩選重畫後仍符合上項。
4. （回歸）與 [`bug-report_mqxliff-partial-target-tags.md`](bug-report_mqxliff-partial-target-tags.md) §2.7 案例並測，避免回歸。

### 2.6 實作後回填

| 項目 | 內容 |
|------|------|
| 分支／commit | （待填） |
| `sync:cat` | 若改動 `cat-tool/app.js`，已執行 `npm run sync:cat` 並一併提交 `public/cat/` |
| 驗收日期／備註 | （待填） |

---

## 調查與決策記錄

- 2026-05-08：使用者於 sdlxliff 譯文按 F8 補 `{/1}` 後整列 tag 變純文字；對照 `effectiveTags`、`insertNextMissingTag` 與 `xliff-build-segments.js` mqxliff 限定合併，歸因為 **空 `targetTags` fallback + F8 單筆 push 造成殘缺非空 `targetTags`**。
- 本文件作為**修正前**之規劃與驗收依據；實作完成後於 §2.6 更新追溯資訊。
