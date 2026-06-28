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

- **比對表第一列**：中間色塊藍色（`#dbeafe`）、文案「**memoQ 預翻**」；原文／譯文欄顯示 TM 快照。
- **下方中繼資料**（`#liveFooterContent`）：原 TM 名稱、原作者、原輸入時間、原檔案名稱、原紀錄上下句（無則顯示「無」）。
- **追蹤修訂區**（`#liveTrackChangeContent`）：選取預翻列時顯示 TM 原文 vs 現行原文 diff。
- **雙擊／Ctrl+數字**：與 TM 列相同，可套用預翻譯文。
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
| **待辦** | — | 更新作業檔未 backfill `mqInsertedMatch` |

---

## 驗收（白話）

1. 開啟含 fuzzy 的 mqxliff（如 Riftbound）；點選第 82 句。
2. 右欄 CAT 比對表**第一列**為藍色「memoQ 預翻」。
3. 點選該列：下方顯示原 TM 名稱等；追蹤修訂區有 diff。
4. **未掛 TM** 時仍顯示預翻列（若句段有資料）。
5. 雙擊預翻列可套用譯文。
6. 無獨立頂部預翻區塊。

### 作者／時間

擴充 parser 後需**刪檔重匯**才有 `commitinfo` 作者與時間；舊 jsonb 僅有 rate／tmSource／原文譯文。

---

## 維護邊界

- 僅 **mqxliff** 匯入路徑寫入；編輯譯文**不**更新 `mqInsertedMatch`。
- 匯出 mqxliff **不**回寫 `<mq:insertedmatch>`。
- 更新作業檔 `mergeSegments` 未 backfill（另開工項）。
