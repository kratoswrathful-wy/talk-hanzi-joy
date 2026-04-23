# Bug Report：TMX 匯入失敗（UTF-16 編碼未處理）及行內標記污染

> 調查日期：2026-04-23  
> 專案：1UP TMS — CAT 工具（`cat-tool/app.js`）  
> 觸發檔案：Medical Mysteries DLC-TM-台繁-working-0423.tmx  
> 線上 TM 名稱：Medical Mysteries  
> 調查者：Claude（Cowork）

---

## 一、症狀

### 症狀 A：匯入失敗
在 TM 詳細頁點選「匯入」並選取上述 `.tmx` 檔案後，工具跳出錯誤訊息，句段未被匯入。

### 症狀 B：TM 欄位內容錯位（出現 XML 標記文字）
DB 中 `cat_tm_segments` 有一批於 `2026-04-23 06:00:07` 同時建立的紀錄，`source_text` 與 `target_text` 包含：
- `<mq:ch val="\t" />` 字串（MemoQ 專有行內元素，本應轉換或移除）
- `{}` 沒有數字的佔位符（應為 `{1}`、`{2}` 等格式的行內標記）

範例：
```
source_text:  "•<mq:ch val="\t" />{}Prioritize Symptoms:{}"
target_text:  "{}•<mq:ch val="\t" />區分症狀的輕重緩急：{}"
```

來源句段與目標句段的 `<mq:ch>` 和 `{}` 位置不同，在 TM 搜尋結果面板中看起來像「欄位放錯」，實際上是兩者的標記結構本來就不同，但都沒有正確轉換。

---

## 二、根本原因

### 主因 A：`file.text()` 不識別 UTF-16 BOM，強制以 UTF-8 讀取

第 4754 行：

```js
const text = await file.text();
```

瀏覽器的 `File.text()` 固定以 **UTF-8** 解碼，**完全忽略檔案的 BOM（Byte Order Mark）**。

該 TMX 檔案的前兩個 bytes 為 `FF FE`，這是 **UTF-16 LE BOM** 的標準標記，XML header 也明確宣告 `encoding="utf-16"`：

```
00000000: fffe 3c00 3f00 7800 6d00 6c00 ...
          ↑↑↑↑
          FF FE = UTF-16 LE BOM
```

當 `file.text()` 把 UTF-16 的每個字元（2 bytes）誤讀為 UTF-8 bytes 時，會得到如下亂碼：

```
< ? x m l   v e r s i o n = " 1 . 0 " ...
（每個字元之間出現空格，因為 UTF-16 低位 byte 通常為 0x00）
```

這串亂碼傳入 `DOMParser.parseFromString(text, 'text/xml')` 後：
- 若被判定為無效 XML，回傳包含 `<parsererror>` 的 document
- `getElementsByTagName('tu')` 在錯誤 document 上回傳空集合
- `parsedSegments.length === 0` → 顯示「未能從檔案中讀取到有效的句段」或拋出例外

**確認資料：** 以正確 UTF-16 解碼後，此檔案包含 **1,150 個有效 TU**，中英文句段均完整。

---

### 次因 B：`<mq:ch>` MemoQ 專有元素未處理

MemoQ 用 `<mq:ch val="..." />` 表示特殊字元（如 Tab）。此元素使用 `mq:` 命名空間前綴；若 `mq:` 未在 TMX 根元素或 `<header>` 上宣告，`DOMParser` 在嚴格 XML 模式（`text/xml`）下可能產生 parseerror，或以不明元素方式保留。

無論哪種情況，目前的程式碼未對 `<mq:ch>` 做任何處理：
- 若 `textContent` 讀取到它，會得到其 `val` 屬性的文字內容（如 Tab 字元）——好一點
- 若 XML 序列化路徑被觸發，會得到整個 XML 元素字串 `<mq:ch val="\t" />`——這正是 DB 裡看到的狀況

**建議：** 在取得 `textContent` 前，先用 DOM 操作移除 `<mq:ch>` 元素（或視需求轉換成對應字元）。

---

### 次因 C：`<bpt>`/`<ept>` 行內標記產生無編號 `{}`

部分 TU 的 `<seg>` 包含 TMX 行內標記：

```xml
<seg><bpt i='1'>{}</bpt>KIDNEY/DIGESTIVE<ept i='1'>{}</ept></seg>
```

`textContent` 會把 `<bpt>` 和 `<ept>` 的子文字節點 `{}` 也納入，結果為 `{}KIDNEY/DIGESTIVE{}`，而非：
- 乾淨的 `KIDNEY/DIGESTIVE`（捨棄標記）
- 或帶編號的 `{1}KIDNEY/DIGESTIVE{/1}`（保留標記為佔位符）

造成 DB 儲存 `{}` 沒有編號，無法在 CAT 工具中辨識為行內標記。

---

### 次因 D：語言判斷用位置而非 `xml:lang`

```js
// 第 4764–4765 行：假設第 1 個 tuv = 來源，第 2 個 = 目標
const sourceSeg = tuvNodes[0].getElementsByTagName('seg')[0];
const targetSeg = tuvNodes[1].getElementsByTagName('seg')[0];
```

本檔案恰好所有 TU 都是 `en-us` 在前、`zh-TW` 在後，但 TMX 規格不保證順序。若來源工具以不同順序輸出，會導致來源與目標對調。

---

## 三、受影響的 DB 資料

DB 查詢確認 `cat_tm_segments` 中有一批受污染的資料：

- **建立時間：** `2026-04-23 06:00:07`（同批次）
- **所屬 TM：** Medical Mysteries（UUID 待確認）
- **污染特徵：** `source_text` 或 `target_text` 包含 `<mq:ch` 字串，或包含無編號的 `{}`
- **受影響筆數：** 調查期間未計算精確數字，但全為同一批次匯入

這批資料需在程式碼修正、重新匯入後**清除**，再以正確格式重新匯入。

---

## 四、TM 比對結果顯示端的連帶問題

修正匯入邏輯、以 `{1}` / `{/1}` 格式儲存行內標記後，**CAT 工具的 TM 比對結果顯示端也需要一併處理**：

- 目前顯示邏輯若只做字串比對，會把 `{1}` 顯示為純文字
- 需與句段編輯器的行內標記渲染邏輯一致：將 `{N}` / `{/N}` 渲染為標記元件，而非字串
- 否則使用者看到的 TM 建議會有 `{1}` 字樣，混入正文難以辨識

此點不影響匯入本身的正確性，但影響 TM 建議的可讀性與使用性，建議與匯入修正一起排入同一個迭代。

---

## 五、架構建議：統一行內標記的內部格式

### 背景

1UP TMS 支援多種匯入格式（TMX、XLIFF、SDLXLIFF、Excel 等），各自有不同的行內標記語法：

| 格式 | 行內標記語法 |
|------|------------|
| TMX | `<bpt i="1">{}</bpt>text<ept i="1">{}</ept>` |
| XLIFF / SDLXLIFF | `<g id="1">text</g>`、`<x id="1" />`、`<ph id="1">` |
| Excel | 通常無行內標記 |

若各格式各自處理，比對邏輯、顯示邏輯、匯出邏輯都要各自應對，維護成本高、日後擴充新格式也困難。

### 建議：在匯入時統一正規化為內部標記格式

**原則：資料庫只存一種格式；每個匯入來源負責轉換成這種格式。**

```
TMX      <bpt i="1">{}</bpt>text     ┐
XLIFF    <g id="1">text</g>          ├─ 各自的轉換器 ─→  {1}text{/1}  ← DB 統一存這個
SDLXLIFF <g id="1">text</g>          ┘
```

### 建議的內部標記格式

參考業界慣例（memoQ 等工具）：

| 標記類型 | 格式 | 對應來源 |
|---------|------|---------|
| 開頭標記 | `{1}` | `<bpt>`、`<g>`、`<mrk>` 等 |
| 結尾標記 | `{/1}` | `<ept>`、`</g>` 等 |
| 獨立標記 | `{~1}` | `<ph>`、`<it>`、`<x>` 等自閉合元素 |

數字為同一句段內的序號，從 1 開始遞增。

### 實作方式

每種格式建立一個獨立的轉換函式：

```js
extractTmxSegText(segNode)     // TMX：bpt/ept/ph → {N}/{/N}/{~N}
extractXliffSegText(segNode)   // XLIFF/SDLXLIFF：g/x/ph → {N}/{/N}/{~N}
extractExcelSegText(cellValue) // Excel：通常直接存原文
```

這樣所有下游邏輯（TM 比對、顯示渲染、匯出）只需要認識一種格式，新增匯入來源時也只需要新增一個轉換函式。

---

## 六、修改建議

### Fix A（🔴 立即）：改用 `ArrayBuffer` + `TextDecoder` 自動偵測 BOM

**位置：** `app.js` 第 4753–4754 行

```js
// 原本：
if (ext === 'tmx') {
    const text = await file.text();

// 改為：
if (ext === 'tmx') {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let encoding = 'utf-8';
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) encoding = 'utf-16le';       // UTF-16 LE BOM
    else if (bytes[0] === 0xFE && bytes[1] === 0xFF) encoding = 'utf-16be'; // UTF-16 BE BOM
    const text = new TextDecoder(encoding).decode(buffer);
```

此修改向下相容：若檔案為 UTF-8（無 BOM），行為與原本相同；若為 UTF-16，正確解碼。

---

### Fix B（🟡 建議）：加入 XML parse 錯誤偵測

在 `parseFromString` 之後立即檢查是否回傳 parseerror：

```js
const xmlDoc = parser.parseFromString(text, 'text/xml');
const parseErr = xmlDoc.querySelector('parsererror');
if (parseErr) {
    throw new Error('TMX 檔案格式無效，無法解析：' + (parseErr.textContent || '').slice(0, 100));
}
```

讓失敗訊息更明確，而非靜默回傳 0 筆。

---

### Fix C（🟡 建議）：正確處理行內標記

在取得 `<seg>` 文字內容前，對行內元素做轉換。建議建立一個 `extractSegText(segNode)` 輔助函式：

```js
function extractSegText(segNode) {
    // 1. 移除 mq:ch 等 MemoQ 專有元素（或轉換為對應字元）
    const mqChNodes = segNode.getElementsByTagNameNS('*', 'ch');  // 或 'MQXliff' namespace
    // 也可用 querySelectorAll('[*|localName="ch"]') 或直接遍歷子節點
    // 簡單方案：依 localName 判斷
    Array.from(segNode.querySelectorAll('*')).forEach(el => {
        if (el.localName === 'ch') {
            // 可轉換為 val 屬性的對應字元，或直接移除
            el.parentNode.removeChild(el);
        }
    });

    // 2. 把 bpt/ept 轉換為 {N} / {/N} 格式
    let result = '';
    for (const node of segNode.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.localName;
            const i = node.getAttribute('i') || '';
            if (tag === 'bpt') result += `{${i}}`;
            else if (tag === 'ept') result += `{/${i}}`;
            else if (tag === 'ph' || tag === 'it') result += `{${i}}`;
            // 其他行內標記依 TMX 規格擴充
        }
    }
    return result;
}
```

原本：
```js
const sourceSeg = tuvNodes[0].getElementsByTagName('seg')[0];
// ...
parsedSegments.push({ source: sourceSeg.textContent, target: targetSeg.textContent });
```

改為：
```js
parsedSegments.push({
    source: extractSegText(sourceSeg),
    target: extractSegText(targetSeg)
});
```

---

### Fix D（🟡 建議）：依 `xml:lang` 判斷語言

```js
// 取代位置判斷
let sourceSeg = null, targetSeg = null;
for (let j = 0; j < tuvNodes.length; j++) {
    const lang = (tuvNodes[j].getAttribute('xml:lang') || '').toLowerCase();
    const seg = tuvNodes[j].getElementsByTagName('seg')[0];
    if (!sourceSeg && (lang === tmSourceLang || lang.startsWith(tmSourceLang.split('-')[0]))) {
        sourceSeg = seg;
    } else if (!targetSeg && (lang === tmTargetLang || lang.startsWith(tmTargetLang.split('-')[0]))) {
        targetSeg = seg;
    }
}
```

其中 `tmSourceLang` 和 `tmTargetLang` 從 TM 設定或 TMX `<header srclang>` 讀取。

---

### Fix E（🟡 建議）：TM 比對結果顯示端支援 `{N}` 行內標記渲染

TM 搜尋結果面板中，對 `source_text` 和 `target_text` 的渲染邏輯需要與句段編輯器一致：
- 掃描文字中的 `{N}` 和 `{/N}` 模式
- 以行內標記元件（badge/chip）渲染，而非直接輸出字串
- 如此使用者看到的 TM 建議與句段格式一致，標記清晰可辨

---

## 七、修改優先順序

| 優先 | Fix | 說明 |
|------|-----|------|
| 🔴 立即 | **Fix A** | 直接修復 UTF-16 無法匯入的問題，3 行修改 |
| 🟡 建議 | **Fix C** | 移除 `<mq:ch>` 並將 `<bpt>`/`<ept>` 轉為 `{N}` 格式，防止 XML 文字污染 DB |
| 🟡 建議 | **Fix D** | 依 `xml:lang` 判斷語言，防止來源/目標對調 |
| 🟡 建議 | **Fix B** | 讓 XML parseerror 顯示更明確的訊息，方便除錯 |
| 🟡 建議 | **Fix E** | TM 顯示端渲染 `{N}` 標記，與 Fix C 搭配才有完整效果 |

**建議先做 Fix A + Fix C + Fix D 一起上線**，保證往後匯入的資料格式乾淨。Fix E 可在同一迭代或下一迭代跟進。

---

## 八、需清除的現有污染資料

套用上述修正後，須清除 `cat_tm_segments` 中於 `2026-04-23 06:00:07` 匯入的污染批次，再重新匯入乾淨版本。確認清除範圍的 SQL（**僅調查，執行前再確認 TM UUID**）：

```sql
-- 查詢污染筆數
SELECT COUNT(*)
FROM cat_tm_segments
WHERE (source_text LIKE '%<mq:ch%' OR target_text LIKE '%<mq:ch%')
   OR created_at = '2026-04-23 06:00:07';

-- 確認無誤後再執行刪除：
-- DELETE FROM cat_tm_segments WHERE tm_id = '<Medical Mysteries UUID>'
--   AND created_at = '2026-04-23 06:00:07';
```

---

## 九、驗證方式

套用 Fix A + C + D 後，匯入同一份 TMX，預期結果：
- 成功提示「匯入成功！共匯入 **1,150** 筆句段。」
- TM 句段列表出現正確中英文對應內容，無 `<mq:ch` 字串，無孤立 `{}`
- 含行內標記的句段以 `{1}`、`{/1}` 等格式儲存，可供 TM 比對
- TM 比對結果面板能正確顯示行內標記（Fix E 完成後）

---

## 十、受影響範圍

凡由 MemoQ、SDL Trados 或其他工具匯出的 TMX：
- **UTF-16 問題**：MemoQ 預設輸出 UTF-16 編碼，均觸發症狀 A；UTF-8 編碼的 TMX（如 1UP TMS 自身匯出的）不受影響
- **行內標記問題**：任何包含 `<bpt>`/`<ept>`/`<ph>` 的 TMX 均受次因 B/C 影響；包含 MemoQ 專有元素的 TMX 受次因 B 影響
