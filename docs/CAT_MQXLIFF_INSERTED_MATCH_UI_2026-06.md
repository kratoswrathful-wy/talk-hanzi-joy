# mqxliff memoQ 預翻記錄顯示

## 目的

memoQ 匯出的 `.mqxliff` 在 `<mq:insertedmatch>` 內嵌預翻當下的 TM 原文／譯文快照。本功能於 CAT 右側欄 **CAT 分頁**頂部以獨立區塊顯示，**不需掛載 TM** 即可檢視。

## 資料流

1. **匯入**：[`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) 解析 `<mq:insertedmatch>` → 句段欄位 `mqInsertedMatch`。
2. **本機**：Dexie `segments` 直接存物件（無 schema migration）。
3. **Team**：Supabase `cat_segments.mq_inserted_match`（jsonb）；RPC 見 [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) `addSegments` / `mapSegmentRow`。
4. **UI**：[`cat-tool/app.js`](../cat-tool/app.js) `renderMqInsertedMatchPanel`；選句段時由 `renderLiveTmMatches` 呼叫。

## `mqInsertedMatch` 結構

```js
{
  rate: 99,              // matchrate
  tmSource: "TM / user", // source 屬性
  sourceText: "...",     // 內層 <source> 解析後文字
  targetText: "..."      // 內層 <target> 解析後文字
}
```

## UI 行為

- 容器：`#mqInsertedMatchPanel`（[`cat-tool/index.html`](../cat-tool/index.html) `#tabCAT` 最上方）。
- 顯示：標題「memoQ 預翻記錄」、相符度 badge、TM 來源、**三列追蹤修訂**（`buildTmTrackChangeStackHtml`：TM 原文／diff／現行原文）、TM 譯文。
- 無 `<mq:insertedmatch>` 或無原文時隱藏區塊。
- 與下方即時 TM 比對表、追蹤修訂區（選 TM 列）**分離**；預翻區塊常駐於有資料的 fuzzy 句段。

## Migration

- `supabase/migrations/20260628120000_cat_segments_mq_inserted_match.sql`

## 驗收（白話）

1. 匯入含 fuzzy 的 `.mqxliff`（句段含 `<mq:insertedmatch>`）。
2. 點選該句段；右側 CAT 分頁**頂部**應出現「memoQ 預翻記錄」、百分比、TM 名稱。
3. 區塊內應有三列原文對照（TM 原文、紅綠 diff、現行原文）及 TM 譯文。
4. **不掛 TM** 時上述區塊仍應顯示；下方比對表可為「未掛載 TM」提示。
5. Team 模式：重新開檔後預翻記錄仍應存在（需 migration 已 push）。

## 維護邊界

- 僅 **mqxliff** 匯入路徑寫入；編輯譯文**不**更新 `mqInsertedMatch`（匯入快照）。
- 匯出 mqxliff **不**回寫 `<mq:insertedmatch>`（維持 memoQ 原檔語意；本欄位供 1UP CAT 檢視）。
