# CAT：標籤顯示三模式與 displaytext 實作規格

> 建立：2026-06-09  
> 專案：1UP TMS — Vanilla CAT（[`cat-tool/`](../cat-tool/)）  
> 相關：[`XLIFF_TAG_PIPELINE.md`](XLIFF_TAG_PIPELINE.md) §6、[`bug-report_mqxliff-bpt-ph-type-mismatch_2026-06.md`](bug-report_mqxliff-bpt-ph-type-mismatch_2026-06.md)

本文件定義編輯器 **標籤顯示三態**（`#editorGrid.tag-view-0/1/2`）與 **displaytext（A）** 的資料契約、程式觸點與驗收。匯出仍只依 `tag.xml`，`display`／`displayFull` 僅 UI。

---

## 1. 產品決策

- **全文與 tooltip 內容**：譯者面向的 **displaytext 解碼文字（A）**（如 `<Skill_Number>`、`</titleLeft>`），不顯示原始 xml。
- **無延遲提示**：沿用 [`app.js`](../cat-tool/app.js) `initGlobalTooltip`（`data-tip` + `#wcProgressModeTooltip`），不用瀏覽器原生 `title`。

---

## 2. 三模式行為

| 模式 | `tag-view-*` | 畫面 | Tooltip |
|------|--------------|------|---------|
| 僅編號 | 0 | 數字 + 開 `›`／結 `‹` 符號 | 無 |
| 簡短顯示 | 1 | 截短 `display`（25 字 + 12em ellipsis） | `display !== displayFull` 時 hover 顯示完整 A |
| 延長顯示 | 2 | 完整 `displayFull` | 僅視覺裁切（跨行／溢出）時 hover 顯示完整 A |

切換模式（Alt+S 或工具列 `{…}`）**不寫庫**，僅改 CSS 與執行 `syncTagPillDisplayInEditor`。

---

## 3. Tag 物件欄位

| 欄位 | 來源 | 用途 |
|------|------|------|
| `xml` | `extractTaggedText` 序列化 | **匯出**（不可改） |
| `display` | 完整 A 截 25 字 + `…` | 模式 1 摘要 |
| `displayFull` | 完整 A（不截） | 模式 2、tooltip；可選，舊句段可缺 |

`extractMqRxtDisplayText` 須涵蓋 open `<mq:rxt` 與 close `</mq:rxt displaytext=...`。

---

## 4. 程式觸點

| 符號 | 檔案 |
|------|------|
| `extractMqRxtDisplayText`、`displayFull` 匯入 | [`xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js) |
| `resolveTagDisplayFull`、`tagChipLabelAndFull`、`buildTaggedHtml` | [`app.js`](../cat-tool/app.js) |
| `syncTagPillDisplayInEditor` | [`app.js`](../cat-tool/app.js) |
| 模式 0／2 CSS | [`style.css`](../cat-tool/style.css) |

掛點：`setEditorHtml` 之後、`setTagViewMode`、`window.resize`（debounce）。

---

## 5. 舊資料

| 情境 | 行為 |
|------|------|
| 新匯入 | 有 `displayFull`；close ept 顯示正確 |
| 舊句段 | `resolveTagDisplayFull` 嘗試從 `display`／`xml` 重算；close ept 可能仍錯 → **建議重匯** |
| TM 比對表 | 本波不改（仍 `.tag-content`） |

---

## 6. 驗收

1. 重匯 `53905_02_JSON_JadeChampsItemsBatch5B_v1_zh_TW.json_zho-TW.mqxliff`：open `<titleLeft>`、close `</titleLeft>`。
2. 僅編號：›1／‹1 或箭頭形可辨開結；成對 tag **斜角外框須完整**（見 §7）。
3. 簡短：長名截短；hover **立刻** 見完整 A。
4. 延長：短 tag 全文；極長溢出才裁切 + tooltip。
5. 匯出 memoQ 可讀；Bug #9／#10 迴歸。

變更 `cat-tool/` 後執行 `npm run sync:cat`。

---

## 7. 成對 tag 箭頭外框（已實作）

三模式與 `displayFull` 不變。成對開／閉 pill（`.rt-tag-s`／`.rt-tag-e`）保留箭頭形，以 `drop-shadow` 沿輪廓描邊 + `--tag-fill` 底色，外框與獨立 `.rt-tag` 視覺一致。

**已知陷阱**：`clip-path` + `border`（含 `::before`）會使**斜角尖端無外框**，僅矩形三邊有框；先前實作曾踩過，不可僅加強三邊即視為完成。

完整策略、技法優先順序、觸點與驗收：[`CAT_PAIRED_TAG_ARROW_BORDER_IMPLEMENTATION_PLAN.md`](CAT_PAIRED_TAG_ARROW_BORDER_IMPLEMENTATION_PLAN.md)。靜態預覽：[`preview-cat-paired-tag-border/index.html`](preview-cat-paired-tag-border/index.html)。
