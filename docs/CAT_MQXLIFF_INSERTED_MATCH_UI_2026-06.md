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

## 已知問題與根因（2026-06-28）

### 症狀

- Team 模式**刪檔重匯**後，右欄 `#mqInsertedMatchPanel` 仍為 `display:none`。
- 主控台 `window.currentCatFooterSeg?.mqInsertedMatch` 為 `null`。
- Supabase 查詢同一檔案：`mq_inserted_match` **已有資料**（例：`54316_...Riftbound...mqxliff` 6333 句中 6126 句有值；第 82 句 Chosen Champion 有完整快照）。

### 已排除

- Migration 未 push（`20260628120000` 已在遠端）。
- 匯入解析失敗（`xliff-build-segments.js` 可正確產生 `mqInsertedMatch`）。
- `addSegments` 未寫入（雲端 DB 已有 jsonb 列）。
- Vercel 未部署 UI（`df9e1e9` 已上線；面板 DOM 存在）。

### 根因

[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) 的 `tryParseJson` 只處理**字串**與**陣列**。Supabase JS 讀 jsonb **物件**時回傳 plain object，函式落入 `return fallback`，`mapSegmentRow` 的 `mqInsertedMatch` 一律變 `null`——寫入正常、**讀回失敗**。

同函式亦影響其他 jsonb **物件**欄位讀回（例如 `sourceChangeInfo`、`wfReviewRestoreSnapshot`）；jsonb **陣列**欄位（如 `source_tags`）不受影響。

## 修正規劃

| 項目 | 內容 |
|------|------|
| **必做** | `tryParseJson` 增加 plain object 分支：`if (v !== null && typeof v === "object" && !Array.isArray(v)) return v as T;` |
| **部署** | 僅 TMS（Vercel）；**不需** `supabase db push`、**不需**再刪檔重匯 |
| **驗收** | 硬重新整理 → 關檔重開 → 點含 `<mq:insertedmatch>` 的句段 |

## Team 除錯（白話）

- **不要用** `window.currentCatFooterSeg` 查預翻：該變數僅在右欄**有 TM／TB 比對列**時才更新，不代表目前點選句段。
- 主控台請在 **CAT iframe**（`index.html` 上下文）執行，勿在 TMS 外層。

### 面板是否顯示

```javascript
document.getElementById('mqInsertedMatchPanel')?.style.display
```

- `'none'`：目前句段記憶體中無 `mqInsertedMatch`（或尚未點選句段）。
- `''` 或非 `'none'`：面板應可見。

### 目前檔名

```javascript
document.getElementById('editorFileName')?.textContent?.trim()
```

### RPC 讀回測試（需 `await`）

先點選目標句段，再執行：

```javascript
await (async () => {
  const fileId = window.parent.location.pathname.match(/\/files\/([^/?]+)/)?.[1];
  const sid = document.querySelector('.grid-data-row.active-row')?.dataset?.segId;
  const segs = await window.CatDataProviderContext.cloudRpc.call('db.getSegmentsByFile', { fileId });
  const active = segs.find(s => String(s.id) === String(sid));
  return {
    name: document.getElementById('editorFileName')?.textContent?.trim(),
    withMq: segs.filter(s => s.mqInsertedMatch?.sourceText).length,
    activeMq: active?.mqInsertedMatch ?? null
  };
})();
```

- **修正前**：DB 有 fuzzy 句但 `withMq === 0` → 讀取 bug（`tryParseJson`）。
- **修正後**：`withMq` 應與檔內含 `<mq:insertedmatch>` 句數一致；目前句 `activeMq` 應為物件。

## 驗收（白話）

1. 匯入含 fuzzy 的 `.mqxliff`（句段含 `<mq:insertedmatch>`）；或沿用已匯入檔案（修正後**不必**重匯）。
2. 點選該句段；右側 CAT 分頁**頂部**應出現「memoQ 預翻記錄」、百分比、TM 名稱。
3. 區塊內應有三列原文對照（TM 原文、紅綠 diff、現行原文）及 TM 譯文。
4. **不掛 TM** 時上述區塊仍應顯示；下方比對表可為「未掛載 TM」提示。
5. Team 模式：migration 已 push **且** `tryParseJson` 修正已部署；**關檔重開**後預翻記錄仍應存在（無需重匯）。樣本：`54316_...Riftbound...` 第 82 句；RPC 測試 `withMq` ≈ 6126。

## 維護邊界

- 僅 **mqxliff** 匯入路徑寫入；編輯譯文**不**更新 `mqInsertedMatch`（匯入快照）。
- 匯出 mqxliff **不**回寫 `<mq:insertedmatch>`（維持 memoQ 原檔語意；本欄位供 1UP CAT 檢視）。

## 待辦（非本次）

- **更新作業檔**路徑：[`cat-tool/js/file-update.js`](../cat-tool/js/file-update.js) `mergeSegments` 未 backfill `mqInsertedMatch`；[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) `refreshFileSegments` insert 列未寫 `mq_inserted_match`。刪檔重匯不受影響；僅「更新作業檔」需另開工項。
