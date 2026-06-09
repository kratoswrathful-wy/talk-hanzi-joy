# CAT：成對標籤箭頭外框實作規格

> 建立：2026-06-09  
> 專案：1UP TMS — Vanilla CAT（[`cat-tool/`](../cat-tool/)）  
> 相關：[`CAT_TAG_VIEW_MODE_IMPLEMENTATION_PLAN.md`](CAT_TAG_VIEW_MODE_IMPLEMENTATION_PLAN.md)、[`XLIFF_TAG_PIPELINE.md`](XLIFF_TAG_PIPELINE.md) §6、[`bug-report_mqxliff-tag-issues.md`](bug-report_mqxliff-tag-issues.md)  
> 靜態預覽：[`preview-cat-paired-tag-border/index.html`](preview-cat-paired-tag-border/index.html)

本文件定義編輯器 **成對開／閉 tag**（`.rt-tag-s`／`.rt-tag-e`）在保留箭頭形狀的前提下，外框與底色須與 **獨立 tag**（`.rt-tag`）視覺一致之實作策略、觸點與驗收。**本波為規格文件**；CSS 落地待確認後另波執行。

---

## 1. 產品決策（方案 B）

| 方案 | 外觀 | 決策 |
|------|------|------|
| A | 方角 pill + `›`／`‹` 符號（與獨立 tag 同款矩形） | **不採用** |
| **B** | **保留箭頭形狀**，外框／底色強度與獨立 tag 一致 | **採用** |

成對 tag 由 [`buildTagSpan`](cat-tool/app.js)（約 14980–14993 行）依 `tag.type === 'open'|'close'` 加上 `rt-tag-s`／`rt-tag-e`；**DOM 結構不需改**。

---

## 2. 問題陳述與視覺對照

### 2.1 現況

| 類型 | class | 外框作法 | 視覺 |
|------|-------|----------|------|
| 獨立（`ph`／standalone） | `.rt-tag` | `border: 1px solid var(--tag-color)` + `border-radius: 4px` | 四面完整、清楚 |
| 成對開 | `.rt-tag-s` | `border: none`；`::before` + `border` + 同 polygon `clip-path` | 箭頭形，框弱 |
| 成對閉 | `.rt-tag-e` | 同上 | 箭頭形，框弱 |

程式位置：[`cat-tool/style.css`](../cat-tool/style.css) 約 2068–2167 行（INLINE TAG SYSTEM）。

### 2.2 已知陷阱（曾實作失敗）

在 `clip-path` 箭頭上直接加 `border`（含 `::before` pseudo）時：

- **上、下、直邊**：像矩形，外框可見  
- **斜角尖端**（open 右尖、close 左尖）：**沒有完整 1px 外框**，只剩底色或斷線  

現行註解（2091 行）已寫「用 pseudo 畫外框，避免 clip-path 造成外框不完整」，但 `::before` + `border` + **同一** `clip-path`（2151–2167 行）**仍無法修復斜邊**。下一波實作**禁止**僅「加強矩形三邊」或回歸「本體 `border` + 本體 `clip-path`」。

### 2.3 驗收對照樣本

檔案：`53905_02_JSON_JadeChampsItemsBatch5B_v1_zh_TW.json_zho-TW.mqxliff`

- **獨立 tag**：含 `<br />` 的列（例如約 289 列）— 外框完整  
- **成對 tag**：含 `<strong>` 的相鄰列（例如約 290 列）— 箭頭形但外框弱、斜角缺  

靜態預覽頁可並排比對三種技法與色票，見 [`preview-cat-paired-tag-border/index.html`](preview-cat-paired-tag-border/index.html)。

---

## 3. 技術根因（維護備忘）

`border` 沿 **裁切前** 的矩形邊界繪製；`clip-path: polygon(...)` 產生的斜邊是「切痕」，不是邊框線。對已裁切的 `::before` 再套 `border` + 同 polygon，斜邊處的 stroke 會被裁掉或無法連續。

**斜角外框完整**為本規格**硬性驗收條件**，不可僅以「三邊矩形有框」視為完成。

---

## 4. 定案策略（建議實作順序）

實作時依序嘗試；每一候選都須通過 §6 斜角驗收後才可定案。

| 優先 | 技法 | 作法摘要 | 斜邊 | 風險 |
|------|------|----------|------|------|
| **1** | **雙層 pseudo（外框層 + 內填層）** | 外層 `::before` 填 `var(--tag-color)`（略大 polygon）；內層本體或 `::after` 填 `color-mix(...)` 底色（略小／inset 1px） | 靠兩層差異描出斜邊 | 需調 polygon 百分比與 `z-index`；內文須在填色層之上 |
| **2** | **`filter: drop-shadow()`** | 對已 `clip-path` 的本體疊多層同色 shadow 模擬 1px 描邊 | 沿 alpha 輪廓 | `tag-extra` 橘色、高 DPI／縮放時可能略糊；須測三模式 |
| **3（退回）** | **內嵌 SVG background** | open／close 各一 `path`，`fill` + `stroke="var(--tag-color)"` | 最穩 | 維護兩份 path；模式 2 長文案變寬時須測伸縮 |

**不採用**：以方角 pill 取代箭頭（方案 A）。

### 4.1 雙層 pseudo 示意（候選 1）

```css
/* 概念示意 — 實作時依 open/close 調整 polygon 百分比 */
.rt-tag-s::before {
  /* 外框層：實心填色 = --tag-color，略大於內層 */
  background: var(--tag-color, #94a3b8);
  clip-path: polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%);
}
.rt-tag-s::after {
  /* 內填層：與 .rt-tag 同款 color-mix 底色，inset 1px */
  background: color-mix(in srgb, var(--tag-color, #94a3b8) 10%, white);
  clip-path: polygon(1px 1px, calc(88% - 1px) 1px, calc(100% - 1px) 50%, ...);
}
```

移除現行 `::before { border: 1px solid; }` + 同 clip 作法。

### 4.2 drop-shadow 示意（候選 2）

```css
/* 概念示意 — 多方向 1px shadow 模擬描邊 */
.rt-tag-s {
  filter:
    drop-shadow(1px 0 0 var(--tag-color))
    drop-shadow(-1px 0 0 var(--tag-color))
    drop-shadow(0 1px 0 var(--tag-color))
    drop-shadow(0 -1px 0 var(--tag-color));
}
```

須確認與編輯器其他 `filter`／`transform` 不衝突；TM 比對列若共用 class 一併目視。

---

## 5. 程式觸點

| 範圍 | 檔案 | 說明 |
|------|------|------|
| **必改** | [`cat-tool/style.css`](../cat-tool/style.css) | INLINE TAG SYSTEM（約 2068–2268）：`.rt-tag-s`、`.rt-tag-e`、`::before`／`::after`、與 `.rt-tag` 底色對齊 |
| 著色 | 同上 2240–2263 | `.col-source .tag-present`／`.tag-missing`、`.col-target .tag-present`／`.tag-extra`、`.tag-next` — `--tag-color` 須驅動**斜邊描邊** |
| 三模式 | 同上 + `#editorGrid.tag-view-*` | 模式 0 僅編號較窄；模式 2 長 `displayFull` 變寬 — 外框各模式可辨 |
| **不改** | [`app.js`](../cat-tool/app.js)、[`xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js) | 匯出仍只依 `tag.xml` |

落地後執行 `npm run sync:cat`（或 `npm run build` 的 prebuild）。

### 5.1 TM 比對列

`.result-cell .rt-tag` 目前多為 standalone（2240–2237）；若 TM 列出現成對 class，須目視確認箭頭樣式不意外污染比對表排版。

---

## 6. 驗收清單

1. 開 `53905_02_JSON_JadeChampsItemsBatch5B_v1_zh_TW.json_zho-TW.mqxliff`，找 `<strong>` 成對與 `<br />` 獨立 tag 相鄰列。  
2. **斜角（硬性）**：open 右尖端、close 左尖端須有**連續可見**外框；不可只三邊矩形有框。  
3. **強度**：成對與獨立 tag 外框粗細／顏色一致（藍 present、紅 missing、橘 extra、深藍 next）。  
4. Alt+S 切三模式：箭頭形狀保留；模式 2 長 displaytext 不破框、不裁切文字。  
5. 搜尋高亮、F8 插入、匯出 memoQ — 迴歸（純 CSS，預期無行為變更）。  
6. TM 比對列 `.result-cell .rt-tag` — 無意外版面錯亂。

**不需重匯作業檔**：純 CSS，舊句段開檔即見新外框。

---

## 7. 狀態

| 項目 | 狀態 |
|------|------|
| 規格文件 | **本檔** |
| 靜態預覽 | [`preview-cat-paired-tag-border/index.html`](preview-cat-paired-tag-border/index.html) |
| `style.css` 實作 | **已實作**（候選 1：雙層 pseudo；`--tag-fill` + `::before` 外框色 + `::after` 內填） |

落地後執行 `npm run sync:cat`；舊作業檔開檔即見，不需重匯。
