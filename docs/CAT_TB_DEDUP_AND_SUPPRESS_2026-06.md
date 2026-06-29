# CAT 右欄 TB 比對：子字串壓制與同原文合併

**日期**：2026-06  
**狀態**：已實作，待驗收  
**程式觸點**：[`cat-tool/app.js`](../cat-tool/app.js)（`tbHits` 收集、`buildCatMatchRowsHtml`、`renderFooter` TB 分支）、[`cat-tool/style.css`](../cat-tool/style.css)（`.cat-tb-dupes-inline`）

## 背景

編輯器右欄「TM／片段／術語比對」在掛載多個 TB 或術語彼此為子字串時，會列出過多列，干擾譯者閱讀。本變更在**不改變比對規則**（`termMatches`／`findTermHitRangesInPlainText`）的前提下，於結果整理階段做兩件事：

1. **子字串壓制**：較短術語若所有命中範圍都被較長術語涵蓋，則不顯示。
2. **同原文合併**：原文字串完全相同（精確比對，不正規化大小寫）的多筆 TB 記錄合併為一列；額外譯文平鋪於列下方，footer 疊放每筆 metadata。

## 規格

### 1. 子字串壓制

- 收集每筆 TB hit 時一併儲存 `ranges`（`findTermHitRangesInPlainText` 回傳值）。
- 依術語原文長度**由大到小**處理；較長者先「佔地」，其 `ranges` 加入 `acceptedRanges`。
- 對較短術語：若**每一個** `ranges[i]` 都滿足「存在某 `acceptedRanges` 條目 `ar` 使 `ar.start <= r.start && ar.end >= r.end`」，則**壓制**（不進入顯示清單）。
- **不壓制**邊界：原文「Mark Anthony bought an ant」中，`Ant` 在 Anthony 內與句尾各命中一次；句尾 `[22,25]` 未被更長術語涵蓋 → `Ant` 仍顯示。

**範例**

| 術語 | 譯文 | 原文「Mark Anthony」 |
|------|------|----------------------|
| Mark Anthony | 馬克安東 | 顯示 |
| Anthony | 安東尼 | 壓制 |
| Ant | 螞蟻 | 壓制 |

### 2. 同原文合併

- groupBy key：`entry.sourceText`（**精確字串**）；`Anthony` 與 `anthony` 為兩列。
- 同組內依 `firstStart`、再依 `srcLen` 排序；第一筆為主列，其餘放入 `primary.entry._tbDupes`。
- 主列仍顯示第一筆的 `targetText`；`_tbDupes` 內各筆譯文以 `.cat-tb-dupes-inline` **平鋪**於列下方（不折疊、無 ▶ 按鈕）。
- 點選該列時，footer 依序顯示主列 + 每筆 `_tbDupes` 的術語庫、備註、比對旗標、建立者、建立時間，筆與筆之間以細線分隔。

### 3. 與 TM 去重之差異

| 項目 | TM | TB（本變更） |
|------|-----|-------------|
| 同原文多筆 | `_dupes` + ▶ 折疊面板 | `_tbDupes` + 列下平鋪 |
| 子字串 | 無壓制 | 有壓制（依 ranges） |

## 資料流

```
ActiveTbTerms → termMatches + findTermHitRangesInPlainText
  → tbHits（含 ranges）
  → 壓制（byLen + acceptedRanges）
  → groupBy sourceText → _tbDupes
  → matches → 右欄表格 + footer
```

## 驗收步驟（白話）

1. 準備 TB 含：`Ant → 螞蟻`、`Anthony → 安東尼`、`Mark Anthony → 馬克安東`（可不區分大小寫、非全字）。
2. 開啟含句段「Mark Anthony」的檔案，點該句。
3. **預期**：右欄 TB 僅一列「Mark Anthony／馬克安東」，不出現 Ant、Anthony 兩列。
4. 句段改為「Mark Anthony bought an ant」，再點該句。
5. **預期**：除「Mark Anthony」外，另有一列 `Ant`（句尾獨立命中）；Anthony 仍被壓制。
6. 兩個不同 TB 皆登錄 `Mark Anthony` 但譯文不同：右欄應**一列**，主譯文為排序後第一筆，列下方平鋪其餘譯文與 TB 名稱；點選後 footer 顯示多段 metadata。
7. 同時存在 `Anthony` 與 `anthony` 兩筆（大小寫不同）：應為**兩列**（精確字串不合併）。

## 維護邊界

- 壓制僅作用於**右欄比對表**；不改 `termMatches`、原文格 TB 上標提示、AI 批次 `tbTerms` 注入邏輯。
- 修改後須執行 `npm run sync:cat` 並提交 `cat-tool/` 與 `public/cat/`。
