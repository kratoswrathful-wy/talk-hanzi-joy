# mqxliff memoQ 預翻記錄顯示

> 本文件：功能規格、Team 除錯、**開發／修正紀錄**與驗收。初版 `df9e1e9`；讀回修正 **`8e187d3`（已驗收）**。

## 目的

memoQ 匯出的 `.mqxliff` 在 `<mq:insertedmatch>` 內嵌預翻當下的 TM 原文／譯文快照。本功能於 CAT 右側欄 **CAT 分頁**頂部以獨立區塊顯示，**不需掛載 TM** 即可檢視。

## 資料流

1. **匯入**：[`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) 解析 `<mq:insertedmatch>` → 句段欄位 `mqInsertedMatch`。
2. **本機**：Dexie `segments` 直接存物件（無 schema migration）。
3. **Team**：Supabase `cat_segments.mq_inserted_match`（jsonb）；RPC 見 [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) `addSegments` / `mapSegmentRow`。
4. **UI**：[`cat-tool/app.js`](../cat-tool/app.js) `renderMqInsertedMatchPanel`；選句段時由 `renderLiveTmMatches`（或 debounce 排程）呼叫。

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

- `supabase/migrations/20260628120000_cat_segments_mq_inserted_match.sql`（Team；**已 push**）

---

## 開發與修正紀錄

| 階段 | Commit / 日期 | 內容 |
|------|----------------|------|
| **初版落地** | `df9e1e9` | 解析 `<mq:insertedmatch>`；`#mqInsertedMatchPanel` + 樣式；`addSegments` 寫入 `mq_inserted_match`；`mapSegmentRow` 讀回欄位；migration；`npm run sync:cat` |
| **除錯** | 2026-06-28 | Team 刪檔重匯後面板仍 `display:none`；Supabase 已有 6126 筆（Riftbound `54316`）；Vercel UI 已部署；**誤用** `currentCatFooterSeg` 除錯（僅 TM 比對列時更新） |
| **讀回修正** | `8e187d3` | `tryParseJson` 增加 plain object 分支；jsonb 物件不再讀成 `null`；同函式連帶修復 `sourceChangeInfo`、`wfReviewRestoreSnapshot` 等物件欄位 |
| **驗收通過** | 2026-06-28 | 使用者確認：Riftbound 第 82 句（Chosen Champion）預翻區塊正常；**不需重匯**（關檔重開即可） |
| **待辦** | — | 更新作業檔未 backfill `mqInsertedMatch`（見下方「維護邊界」） |

### 讀回 bug 根因（已修 `8e187d3`）

[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) 的 `tryParseJson` 原先只處理**字串**與**陣列**。Supabase JS 讀 jsonb **物件**時已是 plain object，函式落入 `return fallback`，`mapSegmentRow` 的 `mqInsertedMatch` 一律變 `null`——**寫入正常、讀回失敗**。

修正：在陣列判斷之後加入 `if (v !== null && typeof v === "object" && !Array.isArray(v)) return v as T;`

部署邊界：僅 TMS（Vercel）；**不需** `supabase db push`、**不需**再刪檔重匯。

---

## Team 除錯（白話）

- **不要用** `window.currentCatFooterSeg` 查預翻：該變數僅在右欄**有 TM／TB 比對列**時才更新，不代表目前點選句段。
- 主控台請在 **CAT iframe**（`index.html` 上下文）執行，勿在 TMS 外層。

### 面板是否顯示

```javascript
document.getElementById('mqInsertedMatchPanel')?.style.display
```

- `'none'`：目前句段無 `mqInsertedMatch`（或尚未點選句段）。
- `''` 或非 `'none'`：面板應可見。

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

- 修正後：`withMq` 應與檔內含 `<mq:insertedmatch>` 句數一致（Riftbound 約 6126）。

---

## 驗收（白話）

### 一般步驟

1. 匯入含 fuzzy 的 `.mqxliff`；或沿用已匯入檔案（`8e187d3` 後**不必**重匯）。
2. 點選該句段；右側 CAT 分頁**頂部**應出現「memoQ 預翻記錄」、百分比、TM 名稱。
3. 區塊內有三列原文對照（TM 原文、紅綠 diff、現行原文）及 TM 譯文。
4. **不掛 TM** 時上述區塊仍應顯示；下方比對表可為「未掛載 TM」提示。
5. Team：migration 已 push 且 `8e187d3` 已部署；**關檔重開**後預翻仍在。

### 2026-06-28 驗收通過紀錄

| 項目 | 結果 |
|------|------|
| 樣本檔 | `54316_02_WORDNT_RiftboundCoreRulesRUP4Sta_v2_zh_TW.docx_zho-TW.mqxliff` |
| 樣本句 | 第 **82** 句（Chosen Champion；`global_id` 82） |
| 預期 | 99%、TM 名稱 `RB_zh-TW_AG / bchia`、三列 diff、TM 譯文 |
| 結果 | **通過**（使用者確認） |

---

## 維護邊界

- 僅 **mqxliff** 匯入路徑寫入；編輯譯文**不**更新 `mqInsertedMatch`（匯入快照）。
- 匯出 mqxliff **不**回寫 `<mq:insertedmatch>`（維持 memoQ 原檔語意；本欄位供 1UP CAT 檢視）。

### 待辦（另開工項）

- **更新作業檔**：[`cat-tool/js/file-update.js`](../cat-tool/js/file-update.js) `mergeSegments` 未 backfill；[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) `refreshFileSegments` insert 未寫 `mq_inserted_match`。刪檔重匯不受影響。
