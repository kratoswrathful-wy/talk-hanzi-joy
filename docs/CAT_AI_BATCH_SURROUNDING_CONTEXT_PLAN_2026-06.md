# CAT AI 批次翻譯 — 批次上下文參照來源

> 建立：2026-06-23  
> 狀態：**已實作**  
> 相關：[`CAT_AI_BATCH_TOKEN_UX_2026-05.md`](CAT_AI_BATCH_TOKEN_UX_2026-05.md)、[`bug-report_ai-batch-parse-error-no-retry_2026-06.md`](bug-report_ai-batch-parse-error-no-retry_2026-06.md)

---

## 1. 目標

在批次翻譯 Modal 的 **「參照來源（附估計 token 數）」** 區新增 **「批次上下文（上下各 10 句）」**。勾選後，每批送 OpenAI 前自檔案顯示序（`currentSegmentsList`）擷取本批首句之上、末句之下各最多 10 句，以「僅供參考、請勿翻譯」區塊併入 user message；每句送 **原文＋譯文（若已有）**。

---

## 2. 現況對照

| 項目 | 說明 |
|------|------|
| 新功能 key | `batchRefOptions.surroundingContext`（boolean，預設 `false`） |
| 「同檔案已確認句段」 | 估算加總範圍內已確認原文；實際 prompt 走 `includeContext`／`contextPrev`/`contextNext`，批次流程未填入。**本功能不修改該項** |
| Team 模式 | `batchRefOptions` 仍僅 Dexie 本機；換裝置勾選會重置。後續可增 `batch_ref_options jsonb` 雲端欄位 |

---

## 3. 行為規格

### 3.1 擷取規則

- 常數：`AI_BATCH_SURROUNDING_CONTEXT_COUNT = 10`（`cat-tool/app.js`）
- 對每批 `batch`（`_nextBatchByRowsAndChars` 產生）：
  1. 在 `currentSegmentsList` 找 batch 首句／末句索引 `minIdx`／`maxIdx`
  2. `contextBefore = slice(max(0, minIdx - 10), minIdx)`
  3. `contextAfter = slice(maxIdx + 1, maxIdx + 1 + 10)`
- **可超出使用者選定的翻譯範圍**（維持檔案連續性）
- 上下文句段**不**列入本批 JSON `translations` 的 `idx`

### 3.2 Prompt 格式（user message）

```text
【上文脈（僅供參考，請勿翻譯）】
[句段 141]
原文: …
譯文: …

【本批待翻譯句段】
[句段 0]
…

【下文脈（僅供參考，請勿翻譯）】
…
```

- 上下文 `[句段 N]` 為檔案顯示序（1-based）；本批待翻譯仍用 batch 內 `idx` 0…n-1
- 原文／譯文經 `stripTags`；譯文空白則省略「譯文:」行

### 3.3 儲存

- 勾選變更：`_queueSaveAiBatchRefOptions` → `saveAiProjectSettings({ batchRefOptions })`

---

## 4. 程式觸點

| 符號 | 檔案 |
|------|------|
| `AI_BATCH_SURROUNDING_CONTEXT_COUNT` | `cat-tool/app.js` |
| `_getSurroundingContextSegments` | `cat-tool/app.js` |
| `_applySurroundingContextToBatchOptions` | `cat-tool/app.js` |
| `_computeSurroundingContextChars` | `cat-tool/app.js` |
| `buildPrompt` 上下文區塊 | `cat-tool/js/ai-translate.js` |
| `#aiBatchRefSurroundingContext` | `cat-tool/index.html` |

變更 `cat-tool/` 後執行 `npm run sync:cat`。

---

## 5. Token 估算

- 參照來源分項：上下各 10 句 ×（原文＋譯文字元＋標籤 overhead）
- **不**計入「每批字元上限 2500」；各批用量 breakdown 以真實組 prompt 反映增量
- 粗估：20 句 × 平均 160 字 ≈ 1,230 token／批（視句長而定）

---

## 6. 驗收步驟

1. 參照來源區見「批次上下文（上下各 10 句）」及 token；勾選後合計增加
2. 「預覽提示語」含【上文脈】／【下文脈】；本批 idx 不含上下文句
3. 第 1 批上文脈不足 10 句；中間批上下各最多 10 句
4. 上下文句段有譯文時 prompt 含「譯文:」
5. 取消勾選 → 無上下文區塊、token 歸零
6. 重開 Modal 勾選保留（單機 Dexie）

---

## 7. 後續（不在本次）

- 修正「同檔案已確認句段」實際 prompt 行為
- `batch_ref_options` Supabase 雲端同步
