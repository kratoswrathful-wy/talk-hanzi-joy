# mqxliff memoQ 預翻記錄顯示

> 本文件：功能規格、Team 除錯、**開發／修正紀錄**與驗收。初版 `df9e1e9`；讀回修正 **`8e187d3`（已驗收）**；比對表整合（本輪）。

## 目的

memoQ 匯出的 `.mqxliff` 在 `<mq:insertedmatch>` 內嵌預翻當下的 TM 原文／譯文快照。本功能於 CAT 右側欄 **CAT 分頁**的**比對結果表第一列**顯示（類型 `MqInserted`），**不需掛載 TM** 即可檢視。

## 資料流

1. **匯入**：[`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) 解析 `<mq:insertedmatch>` 與同句 `commitinfo` → 句段欄位 `mqInsertedMatch`。
2. **本機**：Dexie `segments` 直接存物件（無 schema migration）。
3. **Team**：Supabase `cat_segments.mq_inserted_match`（jsonb）；RPC 見 [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) `addSegments` / `mapSegmentRow`。
4. **UI**：[`cat-tool/app.js`](../cat-tool/app.js) `buildMqInsertedMatchEntry` → `renderLiveTmMatches` 比對表 `unshift` 第一列。

## `mqInsertedMatch` 結構

```js
{
  rate: 99,
  tmSource: "TM / user",
  sourceText: "...",
  targetText: "...",
  createdBy: "...",      // commitinfo@username（重匯後才有）
  createdAt: "...",    // commitinfo@timestamp ISO
  writtenFile: null,     // 多數檔案無此資訊
  prevSegment: null,
  nextSegment: null
}
```

## UI 行為

### 比對表第一列（`MqInserted`）

中間欄（相符度／類型）改為**上下堆疊、置中**：

| 層 | 內容 |
|----|------|
| 上 | 百分比（例 `87%`）— 見下方「百分比來源」 |
| 下 | 類型標籤 |

**類型標籤與底色**（依 `mqInsertedMatch.tmSource`／footer「原 TM 名稱」）：

| 來源 | 標籤 | 底色 |
|------|------|------|
| 以 **`TM /`** 開頭（TM fuzzy 預翻） | **memoQ 預翻** | 藍 `#dbeafe` |
| 以 **`MT /`** 開頭（機翻，例 Intento MT Plugin） | **memoQ 機翻** | 土黃 `#ffedd5`（**0% 也套色**） |

**判斷規則（方案 A）**：只看 `tmSource` 前綴 `MT /` vs `TM /`；**不**以 `mq:status`（如 `MachineTranslated`）為主判斷。

**百分比來源**（對齊 memoQ 主畫面句段列相似度）：

1. 優先句段 **`matchValue`**（匯入自 `mq:percent`）
2. 若空白，fallback **`mqInsertedMatch.rate`**（`<mq:insertedmatch matchrate>`）

原文／譯文欄仍顯示預翻快照；**主表相似度欄不在此輪變更**。

### 比對結果資訊列（換頁列）

比對結果 **>9 筆** 時，「比對結果共 N 筆…」與 `Ctrl+,`／`Ctrl+.` 快捷鍵提示改**兩行排版**（換頁第一行、快捷鍵第二行），避免右欄拉窄時文案重疊。

### 其餘

- **下方中繼資料**（`#liveFooterContent`）：原 TM 名稱、原作者、原輸入時間、原檔案名稱、原紀錄上下句（無則顯示「無」）。
- **追蹤修訂區**（`#liveTrackChangeContent`）：選取預翻／機翻列時顯示快照原文 vs 現行原文 diff。
- **雙擊／Ctrl+數字**：與 TM 列相同，可套用快照譯文。
- 無 `<mq:insertedmatch>` 時不插入該列。
- 已移除獨立 `#mqInsertedMatchPanel`。

## Migration

- `supabase/migrations/20260628120000_cat_segments_mq_inserted_match.sql`（Team；**已 push**）
- 擴充 `createdBy` 等欄位**不需**新 migration（仍為同一 jsonb）

---

## 開發與修正紀錄

| 階段 | Commit / 日期 | 內容 |
|------|----------------|------|
| **初版落地** | `df9e1e9` | 獨立 `#mqInsertedMatchPanel` |
| **讀回修正** | `8e187d3` | `tryParseJson` plain object；**已驗收** |
| **比對表整合** | 2026-06-28 | 第一列 `MqInserted`、footer 中繼資料、移除獨立面板；parser 加 `commitinfo` |
| **預翻／機翻分色** | 2026-06-28 | 百分比置中、`MT /` → memoQ 機翻土黃、比對結果資訊列兩行排版 |
| **待辦** | — | 更新作業檔未 backfill `mqInsertedMatch` |

---

## 驗收（白話）

### TM fuzzy 預翻

1. 開啟含 fuzzy 的 mqxliff（如 Riftbound）；點選 TM fuzzy 句（例 87%）。
2. 右欄第一列：上方 **87%**（與 memoQ 主表相似度一致）、下方藍底「**memoQ 預翻**」。
3. footer「原 TM 名稱」以 `TM /` 開頭；追蹤修訂區有 diff。

### 機翻（MT）

1. 點選「原 TM 名稱」為 `MT / Intento MT Plugin …` 的句段（含 0%）。
2. 右欄第一列：上方顯示相似度數字、下方土黃底「**memoQ 機翻**」（0% 仍有土黃色）。

### 共通

1. **未掛 TM** 時仍顯示預翻／機翻列（若句段有 `mqInsertedMatch`）。
2. 雙擊該列可套用譯文；主表相似度欄外觀不變。
3. 比對結果 **>9 筆**、右欄拉窄：「比對結果共 N 筆」與快捷鍵**不再重疊**。
4. 無獨立頂部預翻區塊。

### 作者／時間

擴充 parser 後需**刪檔重匯**才有 `commitinfo` 作者與時間；舊 jsonb 僅有 rate／tmSource／原文譯文。

---

## 維護邊界

- 僅 **mqxliff** 匯入路徑寫入；編輯譯文**不**更新 `mqInsertedMatch`。
- 匯出 mqxliff **不**回寫 `<mq:insertedmatch>`。
- 更新作業檔 `mergeSegments` 未 backfill（另開工項）。
