# Bug Report：mqxliff 匯出時句段查找失敗，譯文未寫回 XML

> 調查與修正日期：2026-06-03  
> 專案：1UP TMS — CAT 內嵌（`cat-tool/js/xliff-tag-pipeline.js`）  
> 相關程式觸點：[`xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js)（匯入 `idValue`）、[`xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)（`exportXliffFamilyToBlob`）

本文採雙層結構：**Part 1** 用白話說明現象、原因與修正後行為；**Part 2** 為技術細節與資料流。

---

## Part 1 — 白話摘要

### 1.1 使用者看到什麼（現象）

- 在 CAT 編輯器內，mqxliff 檔案經 AI 翻譯或手動編輯後，**譯文欄顯示正確**（與原文不同）。
- 點「匯出」下載的 `Translated_*.mqxliff`，用 memoQ 或文字編輯器打開後，**`<target>` 仍是第一次匯入時的內容**（常見為「原文照貼」），與編輯器所見不符。
- 常見於 memoQ 遊戲對話類 mqxliff：`Key`／`idValue` 含多行脈絡（hash、對話路徑、`Sheet: …`），例如 `【S1】支线-处理后_zh-TW.xliff_zho-TW.mqxliff`。

### 1.2 白話結論：問題出在哪裡

匯出時程式會：

1. 讀取**原始 XML 檔**（`originalFileBuffer`）逐句比對；
2. 用 `<trans-unit id="…">` 的 **`id` 屬性**（通常只有第一行的 hash）去資料庫找對應譯文。

但匯入時，句段的 **`idValue` 存的是整段多行字串**（來自 `<context context-type="x-mmq-context">` 全文）。匯出查找表只用「完整多行」當 key，用「單行 hash」去查 → **永遠對不到** → 該句的 `<target>` 不被更新，維持 XML 裡舊內容。

**更新作業檔**仍可能成功：合併比對用的是完整 `idValue`，與匯出查找邏輯不同。

### 1.3 修正後行為（概要）

- 建立匯出查找表時，除完整 `idValue` 外，**再以第一行**（hash）作為 fallback key，與 `<trans-unit id>` 對齊。
- 不影響 sdlxliff／mxliff／一般 xliff（`idValue` 通常已是單行 TU id）。

### 1.4 白話驗收

1. 開啟已翻譯的 mqxliff（含多行 Key 的遊戲對話檔亦可）。
2. 匯出 `Translated_*.mqxliff`。
3. 打開匯出檔，抽查數句：`<target>` 應為編輯器中的譯文，而非匯入時的原文照貼。

---

## Part 2 — 技術細節

### 2.1 匯入：`idValue` 來源

[`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js) 單段 mqxliff：

```javascript
idValue: keyFromContext || fallbackId,
```

- `keyFromContext`：`<context context-type="x-mmq-context">` 的 `textContent`（可含換行：hash、路徑、Sheet 等）。
- `fallbackId`：`trans-unit` 的 `id` 屬性（通常與第一行 hash 相同）。

### 2.2 匯出：查找失敗

[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js) `exportXliffFamilyToBlob`：

**修正前**（建表）：

```javascript
segs.forEach(s => {
    if (s.idValue && String(s.idValue).trim()) {
        segByTuId.set(String(s.idValue).trim(), s);  // key = 多行全文
    }
    segByTuId.set(String(s.globalId ?? s.rowIdx + 1), s);
});
```

**查找**：

```javascript
const tuId = tu.getAttribute('id');  // 僅第一行 hash
const seg = tuId ? segByTuId.get(tuId) : null;
if (!seg) return;  // target 不更新
```

### 2.3 修正內容

建表時增加 first-line fallback（僅當 `idValue` 多行且第一行尚未佔用 map 時）：

```javascript
const fullId = String(s.idValue).trim();
segByTuId.set(fullId, s);
const firstLine = fullId.split('\n')[0].trim();
if (firstLine && firstLine !== fullId && !segByTuId.has(firstLine)) {
    segByTuId.set(firstLine, s);
}
```

### 2.4 邊際情況

- 若兩句段 `idValue` 第一行相同（極少見），`!segByTuId.has(firstLine)` 避免後者覆蓋前者。
- `globalId`／`rowIdx` 鍵仍保留，供非 TU id 對應場景。

### 2.5 相關文件

- Tag 管線總覽：[`XLIFF_TAG_PIPELINE.md`](./XLIFF_TAG_PIPELINE.md) §7
- Cursor 規則：`.cursor/rules/xliff-tag-export.mdc`
