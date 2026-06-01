# XLIFF Tag Pipeline — 架構與研究記錄

> **警告**：`xliff-tag-pipeline.js` 是 CRITICAL 模組，已通過 memoQ 大檔 + QA 驗證。
> 修改前請完整閱讀本文件，以免破壞既有的 tag 擷取與匯出功能。

---

## 目錄

1. [整體架構](#1-整體架構)
2. [extractTaggedText — 核心擷取函式](#2-extracttaggedtext--核心擷取函式)
3. [sdlxliff 處理要點](#3-sdlxliff-處理要點)
4. [mqxliff 處理要點](#4-mqxliff-處理要點)
5. [Phrase mxliff（.mxliff）](#5-phrase-mxliffmxliff)
6. [Tag 顯示：buildTaggedHtml + effectiveTags](#6-tag-顯示buildtaggedhtml--effectivetags)
7. [匯出還原流程](#7-匯出還原流程)
8. [已知踩雷點與修復歷史](#8-已知踩雷點與修復歷史)
9. [避免誤改清單](#9-避免誤改清單)

---

## 1. 整體架構

```
匯入時
──────
XML file
  └── DOMParser.parseFromString()
        └── trans-unit <source> / <target>
              └── extractTaggedText(node, opts)
                    ├── 找到行內元素（ph / it / x / bpt / ept / g）
                    ├── 產生 {N} / {/N} 佔位符文字
                    └── 回傳 { text: "…{1}…", tags: [{ph,xml,display,type,pairNum,num}] }
                          │
                          ├── 離線模式（LocalCatDB）
                          │     └── IndexedDB (Dexie)
                          │           segments: { sourceText, sourceTags, targetText, targetTags }
                          │
                          └── Team 模式（LocalCatTeamDB，URL ?catStorage=team）
                                └── cloud RPC → cat-cloud-rpc.ts → Supabase cat_segments
                                      欄位：source_text, target_text,
                                            source_tags (JSONB), target_tags (JSONB)

顯示時
──────
buildTaggedHtml(text, tags)
  ├── 分割 text 在 {N} / {/N} 的位置
  ├── 找到對應的 tag 物件 → 渲染為 <span class="rt-tag"> pill
  └── 其餘文字 → escapeHtml 純文字

  * 必須使用 effectiveTags(seg) 取得 tags，勿直接 seg.targetTags || seg.sourceTags
    （見第 5 節）

F8 / 插入 tag
──────────────
insertNextMissingTag(editorDiv, seg)
  └── 讀 seg.sourceTags，找尚未插入的 tag → 插入 <span class="rt-tag">

匯出時
──────
exportXliffFamily(f, segs, format)
  ├── 原始 XML → DOMParser（保留原始結構）
  ├── 逐 trans-unit 對應 segment
  ├── replacePlaceholders(targetText, tags, fallbackTags)
  │     └── {N} → 對應 tag 的 xml 字串
  └── setXmlTargetContent(xmlDoc, targetNode, restoredXml)
        └── 解析 restoredXml → importNode 進原始 XML DOM → 序列化輸出
```

---

## 2. extractTaggedText — 核心擷取函式

位置：`cat-tool/js/xliff-tag-pipeline.js`（同步至 `public/cat/js/xliff-tag-pipeline.js`）

```javascript
function extractTaggedText(xmlNode, { transparentG = false } = {})
```

### 回傳值

```typescript
{
  text: string,        // 含 {N}/{/N} 佔位符的純文字
  tags: Array<{
    ph:      string,   // 佔位符，如 "{1}" 或 "{/1}"
    xml:     string,   // 要寫回 XML 的原始標籤字串
    display: string,   // 顯示在 pill 上的文字
    type:    'standalone' | 'open' | 'close',
    pairNum: number,   // open/close 配對用
    num:     number,   // pill 編號（1-based）
  }>
}
```

### 處理的元素類型

| 元素 | 對應行為 | 產生佔位符 |
|------|----------|------------|
| `<ph>` | standalone | `{N}` |
| `<it>` | standalone | `{N}` |
| `<x>`  | standalone | `{N}` |
| `<bpt>` | 成對開 | `{N}` |
| `<ept>` | 成對閉 | `{/N}`（N 對應同 id 的 bpt） |
| `<g transparentG=false>` | 成對開閉 | `{N}…{/N}` |
| `<g transparentG=true>` | 透明容器，遞迴子節點 | 不產生佔位符 |

### Display text 優先順序（ph / it / x）

**僅影響 pill 上的 `display` 欄位**，不影響 `xml`（匯出還原）。

1. `displaytext` 屬性（memoQ）；若為 `{}` 則視為無效，改走下一項 fallback（見下方 ctype）
2. `equiv-text` 屬性（XLIFF 1.2 / SDL Trados，例如圖片顯示為 “Picture”）
3. `textContent`：若非空且既非 `{}` 也非 `{0}`（memoQ 常把 `{0}` 塞在元素內文但語意為內部佔位，應改看 ctype）；若無有效文字則改走 ctype
4. `ctype` 屬性
5. `type` 屬性
6. fallback：`{N}` 佔位符本身

**注意**：若 **僅** `displaytext` 存在且值為 `{0}`（memoQ 的 0-based 顯示記號），仍視為有效顯示字串並保留（見 §4.1）；`{0}` 黑名單**僅**適用於「沒有 displaytext / equiv-text，只靠 textContent」時。

### Display text 優先順序（bpt / ept）

與 ph/it/x 對齊：**先屬性、後內文**，memoQ 成對標籤常在 **文字節點**放 `{0}`，真正給譯者看的說明在 `displaytext`。

1. `displaytext` 屬性；若為 `{}` 則改用 ctype/type
2. `equiv-text` 屬性
3. `textContent`：若非空且既非 `{}` 也非 `{0}`；否則改用 ctype/type
4. `ctype` 屬性
5. `type` 屬性
6. fallback：`<N>` / `</N>`

---

## 3. sdlxliff 處理要點

### 3.1 為何有兩種 `transparentG` 模式？

SDL Trados 的 `<g>` 在兩個層次出現，含義完全不同：

| 出現位置 | 含義 | 正確處理 |
|----------|------|----------|
| `<source>` / `<target>` 的**直接子**`<g>` | 文件結構包裝（SDL Studio 預設隱藏） | `transparentG=true`：不建立佔位符，直接遞迴子節點 |
| `<mrk mtype="seg">` **內部**的 `<g>` | 真正的行內格式 tag（加粗、連結等） | `transparentG=false`：建立 `{N}…{/N}` 佔位符 |

**匯入規則**（`xliff-import.js`）：
- 一般 XLIFF / mqxliff：`extractOpts = {}`（預設 transparentG=false）
- sdlxliff 的整個 `<source>` / `<target>`：`extractOpts = { transparentG: true }`
  （排除文件結構 g）
- sdlxliff 的 `<mrk>` 節點：**固定**傳 `{ transparentG: false }`
  （mrk 內部的 g 才是真正的行內 tag）

### 3.2 mrk-based 擷取

SDL Trados 的句段主體在 `<mrk mtype="seg" mid="N">` 內，而非直接在 `<source>` 內。

匯入流程（`xliff-import.js`）：
```
collectSegMrks(sourceNode)   // 找所有 mrk[mtype=seg]，用 localName 避免 namespace 問題
  ├── 找不到（0 個）→ fallback 用整個 source node
  ├── 1 個 mrk → 單段 TU
  └── 多個 mrk → 多段 TU，每個 mrk 各自建立一個 segment
```

多段 TU 的 `idValue` 格式為 `{tuId}#{mid}`，匯出時會逐 mrk 分別還原。

### 3.3 sdlxliff 匯出：保留 `<g>` / `<mrk>` 結構

sdlxliff 匯出**不直接替換整個 `<target>` 內容**，而是：
1. `_updateSdlxliffMrkContent()`：找到 `<target>` 下的 `mrk[mtype=seg]`
2. 清空 mrk 內容
3. `setXmlTargetContent(xmlDoc, mrk, restoredXml)` 將還原後的 XML 填入 mrk
4. 保留原有的外層 `<g>` 包裝結構不動

這樣才能讓 SDL Studio 重新開啟檔案時正確辨識文件結構。

---

## 4. mqxliff 處理要點

### 4.1 memoQ 的 `{0}` 顯示格式

memoQ 使用 **0-based** 計數（`{0}`, `{1}`, `{2}`）在 `displaytext` 屬性上：

```xml
<ph id="1" displaytext="{0}" type="x-mq-ph">{0}</ph>
```

我們的工具使用 **1-based** counter（`{1}`, `{2}`, `{3}`）作為內部佔位符。

因此，匯入後：
- `sourceText` = `"{1} days"`（我們的 1-based 格式）
- `sourceTags[0].ph` = `"{1}"`
- `sourceTags[0].display` = `"{0}"`（memoQ 的顯示名稱）

Pill 上顯示 `{0}` 是**正確的**，符合 memoQ 使用者的習慣。

### 4.2 `<bpt>` / `<ept>` 配對機制

memoQ 用 `id` 屬性配對：

```xml
<bpt id="1" type="bold">**</bpt>text<ept id="1">**</ept>
```

`extractTaggedText` 中的 `bptMap` 記錄 `id → counter`，讓 `<ept>` 能找到對應的 `{N}`：

```javascript
bptMap[id] = counter;          // bpt 時存入
const num = bptMap[id] ?? ++counter;  // ept 時查表
```

### 4.3 memoQ Literal Placeholder 格式

**部分 memoQ 檔案不使用 XLIFF XML 元素**，而是把行內 tag 直接以純文字存入 XML：

```xml
<!-- XML element 格式（extractTaggedText 能處理）-->
<source><ph id="1" displaytext="{0}"/> days</source>

<!-- Literal text 格式（extractTaggedText 掃不到任何元素）-->
<source>{1} days</source>
```

Literal 格式的行為：
- `extractTaggedText` 找不到任何 `<ph>`，回傳 `tags=[]`
- 但 `text = "{1} days"`（文字本身就有佔位符）
- 不加處理 → pill 不顯示

**解法**（已實作在 `xliff-import.js`）：
若 `isMqxliffFile && sourceTags.length === 0 && text 含 {N}`，合成 synthetic tags：

```javascript
sourceTags.push({
    ph: `{${n}}`, xml: `{${n}}`,   // xml = literal text 本身
    display: `{${n}}`, type: 'standalone',
    pairNum: n, num: n
});
```

`xml` 欄位存 `{N}` 純文字，export 時 `replacePlaceholders("{1}", [{ph:"{1}", xml:"{1}"}])` → `{1}`（原樣寫回），memoQ 可正確讀取（literal round-trip）。

**numbering**：memoQ XML 裡存的是 1-based `{1}`；memoQ UI 顯示 0-based `{0}`（自動減 1）。兩者都是正常的，不需要轉換。

### 4.4 舊資料問題

若 mqxliff 是在上述任何修正加入**之前**匯入的，`sourceTags` 可能為 `null` 或 `undefined`，導致 pill 無法顯示。

解法：**刪除舊記錄並重新匯入**，現有的匯入流程會正確擷取所有 tag。

---

## 5. Phrase mxliff（.mxliff）

> **完整實作紀錄、commit 對照、驗收步驟**：[`CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md`](./CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md)

Phrase／Memsource 匯出的 `.mxliff` 使用 `xmlns:m="http://www.memsource.com/mxlf/2.0"`。CAT 以 **`currentFileFormat === 'mxliff'`** 獨立分支（**不是**一般 `xliff` 或 `mqxliff`）。

句段內常見兩種**純文字**佔位（非 `<ph>`）：

| 類型 | 範例 | 說明 |
|------|------|------|
| Brace（Excel／BILING_XLS 常見） | `{1}Shadow Strike{2}` | 奇數開、偶數關；格式碼定義在 `m:tunit-metadata` / `m:mark` |
| Range（Word／DOC 常見） | `{1>text<1}` | 範圍標記 |

### 5.1 匯入（`xliff-build-segments.js`）

| 函式 | 行為 |
|------|------|
| `readPhraseMarkContentById` | 讀 TU 內 `m:tunit-metadata` → `mark id` → `m:content` |
| `synthesizeMxliffBraceTags` | 掃 `{N}`，建立 `ph`／`xml`／`display`／`open`／`close` |
| `synthesizeMxliffRangeTags` | 掃 `{N>…<N}`（DOC） |
| `copyMxliffTargetTagsFromSource` | 譯文有 `{N}` 但無 `targetTags` 時，從 `sourceTags` 補齊 |

- **`ph`**：Phrase 字面佔位（匯出必須保留）。
- **`display`**：pill 上看到的字（如 `<#66c5ff>`）。
- **`xml`**：mark 原始內容（與 `display` 類似，供 tooltip）；**僅 UI**，匯出時**不得**用 `xml` 取代 `{N}`。

### 5.2 匯出（`xliff-tag-pipeline.js`，`format === 'mxliff'`）

Phrase 要求 **`<target>` 內仍為字面量 `{1}…{2}`**（或 `{1>…<1}`），格式碼只留在 `m:tunit-metadata`。

**寫入規則（`e744f50`）**

1. `repairMxliffTargetForExport(targetText, sourceText, origTargetFromXml, tags)` — 見 §5.3。
2. `tagsForReplace`／`fallbackForReplace`：`xml := ph`。
3. `replacePlaceholders` → 字面 `{N}` 不變。
4. **略過** `prepareRestoredFragmentForXmlParse`、`setXmlTargetContent`。
5. `while (targetNode.firstChild) removeChild` → `targetNode.textContent = restoredXml`。
6. 可更新 `m:confirmed`、`m:level-edited`、`target@state`（依 `seg.status`）；**不**改 `m:mark`／`m:content`。

**匯出前狀態（`app.js`）**：對目前開啟檔，`prepareSegmentsForExport` 會 flush 譯文、await `confirmSideEffectChain`、flush `status` 到 DB，再以 `segmentsWithEditorTargetsForExport` 合併記憶體中的譯文與確認狀態（含批次匯出所選中的開啟檔）。

### 5.3 匯出前修復（已損壞譯文）

當 `targetText` 曾遭錯誤匯出、或譯文缺開標時：

| 函式 | 用途 |
|------|------|
| `repairMxliffMarkLeaksInText` | `&lt;/color&gt;` 等 → `{2}`、`{4}`（同字面多 tag 時**逐次** replace） |
| `isMxliffOpenClosePair` | 僅 `sourceTags` 中 `type` 為 open/close 且 `pairNum` 相同者視為色標對 |
| `rebuildMxliffTargetFromOriginalStructure(orig, text, tags)` | 僅對真實 open/close 對重組；已有開標則不重複插入 |
| `insertMissingMxliffOpenPlaceholders` | 仍缺開標時在關標前補開標（不用 orig 四段滑窗誤拼 `{1}+{4}`） |
| `collapseDuplicatePhrasePlaceholders` | 收斂 `{2}{2}` 等連續重複字面 |
| `repairMxliffTargetForExport` | 上述串接；僅在 `format === 'mxliff'` 單段匯出路徑呼叫 |

若佔位已全刪且無法對齊，`validateExportTags` 仍可於匯出前提醒。

### 5.4 編輯器（`app.js`）

- `extractTextFromEditor`：`.rt-tag` → `data-ph`，儲存為 `{N}` 字面量。
- `tagChipLabelAndFull`：tooltip 優先 `display`（當 `display !== ph`）。

---

## 6. Tag 顯示：buildTaggedHtml + effectiveTags

### 6.1 buildTaggedHtml

位置：`cat-tool/app.js`

```javascript
function buildTaggedHtml(text, tags, isSource)
```

- `text`：含 `{N}` / `{/N}` 的純文字
- `tags`：tag 物件陣列（來自 `sourceTags` 或 `targetTags`）
- `isSource`：true 時輸出唯讀 source 欄用的 HTML

若 `tags` 為空陣列或 null，直接回傳 `escapeHtml(text)`（純文字）。

### 6.2 effectiveTags（關鍵 helper）

```javascript
function effectiveTags(seg) {
    return (seg.targetTags && seg.targetTags.length > 0)
        ? seg.targetTags
        : (seg.sourceTags || []);
}
```

**為何不能用 `seg.targetTags || seg.sourceTags || []`？**

JavaScript 的 `||` 回傳第一個 truthy 值。**空陣列 `[]` 是 truthy**，因此：

```javascript
[] || [{ph:"{1}", ...}]   // → []  ← 空陣列贏，pill 消失！
```

只要 `targetTags` 是空陣列（使用者打字輸入、或匯入時 target mrk 為空），
`||` 就不會 fallback 到 `sourceTags`，導致目標欄 pill 全部消失。

**所有呼叫 `buildTaggedHtml` 傳入目標 tags 的地方，必須使用 `effectiveTags(seg)`。**

---

## 7. 匯出還原流程

```
seg.targetText ("…{1}…")
  │
  ├── normalizeLegacyEncodedTagText(text, sourceTags)
  │     └── 處理舊格式：target 裡若有 <ph> 內容作為文字 → 替換成 {N}
  │     └── 處理舊格式：target 裡若有 &lt;it …&gt; → 替換成 {N}
  │
  ├── replacePlaceholders(text, targetTags||sourceTags, sourceTags)
  │     └── {N} → tag.xml（原始 XML 字串）
  │     └── 注意：使用 length check，不用 ||（同 effectiveTags 原因）
  │
  └── setXmlTargetContent(xmlDoc, targetNode, restoredXml)
        ├── DOMParser.parseFromString(<_wrap>restoredXml</_wrap>)
        ├── 三次嘗試：原始 / 逸脫 & / HTML entity decode
        └── 解析失敗 → fallbackPlainTextFromCorruptFragment（去除 &lt;ph&gt; 殘段）
```

### sdlxliff 匯出特殊路徑

1. 多段 TU（`isMultiSegFormat`）：逐 mrk 各自還原
2. 單段 TU：`_updateSdlxliffMrkContent()` → 只更新 mrk，保留外層 `<g>` 結構
3. 更新 `sdl:seg-defs` 的 `conf` 屬性（Draft / Translated）

### mxliff 匯出特殊路徑（`format === 'mxliff'`）

```
seg.targetText
  ├── normalizeLegacyEncodedTagText（僅 <ph> 內文舊資料）
  ├── repairMxliffTargetForExport（mark 洩漏 + 原始 <target> 骨架）
  ├── replacePlaceholders（xml := ph）
  └── target.textContent = 純文字（不走 setXmlTargetContent）
```

與 mq／sdl **不可共用**「還原 XML 片段」路徑；詳見 [`CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md`](./CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md) §6。

---

## 8. 已知踩雷點與修復歷史

### [2026-04] `<x>` 元素未處理

**症狀**：sdlxliff segment 784（`picture` tag）在原文欄看不到 pill。

**原因**：`extractTaggedText` 只處理 `ph` / `it`，未包含 `x`（XLIFF standalone placeholder）。

**修法**：在 `if (ln === 'ph' || ln === 'it')` 加入 `|| ln === 'x'`。

---

### [2026-04] mqxliff Literal Placeholder 格式無法顯示 pill

**症狀**：重新匯入 mqxliff 後，`{1} days` / `{1}:{2}:{3}` 仍顯示純文字，無 pill。

**原因**：這類 mqxliff 把行內 tag 存為純文字 `{1}` 而非 `<ph>` XML 元素。
`extractTaggedText` 只掃 XML 元素，回傳 `sourceTags=[]`。
`buildTaggedHtml("{1} days", [])` → 純文字輸出。

**修法**：在 `xliff-import.js` 單段路徑加入後處理：
若 `isMqxliffFile && sourceTags.length === 0 && text 含 {N}`，
合成 `{ ph:"{N}", xml:"{N}", display:"{N}", type:"standalone" }`，
export 時 `replacePlaceholders` 把 `{N}` 換回 xml=`{N}`，原樣寫回 XML（literal round-trip）。

---

### [2026-04] `<bpt>` / `<ept>` display 顯示 `{}` 或空白

**症狀**：mqxliff 的 pill 標籤顯示 `{}` 或無文字。

**原因**：memoQ 的 `<bpt>` textContent 有時是 `{}`（空花括弧），沒有 fallback 機制。

**修法**：加入 `ctype` / `type` 屬性作為 display fallback：
```javascript
const meaningfulBpt = (rawDisplay && rawDisplay !== '{}') ? rawDisplay : ctypeBpt;
```

---

### [2026-05] Trados `equiv-text`、memoQ `<bpt>` `displaytext`、`{0}` 內文

**症狀**：sdlxliff 圖片類 `<ph>` 在 Studio 顯示為 “Picture”，本工具 pill 僅顯示數字；mqxliff 粗體等 `<bpt>` 在 Studio 有說明文字，本工具顯示 `{0}`。

**原因**：`extractTaggedText` 未讀 XLIFF `equiv-text`；`<bpt>` / `<ept>` 未讀 `displaytext`，誤把元素內 `{0}`（memoQ 內部佔位）當成顯示字串。

**修法**：`ph` / `it` / `x` / `bpt` / `ept` 一律 **優先** `displaytext`，其次 `equiv-text`，再 `textContent`（僅此時將 `{}` / `{0}` 視為無效並 fallback `ctype`/`type`）；若 **`displaytext` 明確為 `{0}`**（memoQ 慣例），仍保留為 pill 文字（見 §4.1）。

---

### [2026-04] `effectiveTags` — truthy 空陣列 bug

**症狀**：原文欄 pill 正常，目標欄顯示純文字 `{1}`。

**原因**：`seg.targetTags || seg.sourceTags || []` — 空陣列 `[]` 是 truthy，
`||` 不 fallback 到 `sourceTags`，`buildTaggedHtml` 收到空 tags 陣列就輸出純文字。

**影響範圍**：`app.js` 中所有呼叫 `buildTaggedHtml` 傳入目標 tags 的地方（約 18 處）。

**修法**：新增 `effectiveTags(seg)` helper，全部替換。

---

### [2026-04] `rerenderCurrentSegments` 用 `textContent` 破壞 pill

**症狀**：AI 批次翻譯完成後，目標欄 pill 全部變成純文字。

**原因**：新增的 `rerenderCurrentSegments` 函式使用
`ta.textContent = seg.targetText` 而非 `ta.innerHTML = buildTaggedHtml(...)`，
`textContent` 賦值會清除所有 HTML 結構（pill span）。

**修法**：改為 `ta.innerHTML = buildTaggedHtml(seg.targetText || '', effectiveTags(seg))`。

---

### [2026-04] Team 模式下 sourceTags / targetTags 未儲存至 Supabase

**症狀**：離線模式（LocalCatDB）pill 正常；team 模式（URL `?catStorage=team`）匯入後所有 tag 仍顯示純文字，即使刪除重新匯入也無效。

**原因**：`src/lib/cat-cloud-rpc.ts` 的 `db.addSegments` handler 在 mapping segment 物件至 Supabase row 時，只列舉了已知欄位（`source_text`, `target_text` 等），完全沒有 `source_tags` / `target_tags`。同樣地，`mapSegmentRow` 讀回時也沒有這兩個欄位，導致 segment 物件永遠缺少 `sourceTags` / `targetTags`。

此外，`segmentExtraCamelToSnake`（處理 `updateSegmentTarget` 的 `extra` 參數）也沒有映射 `targetTags`，即使前端傳了也會被靜默丟棄。

**修法**：
1. `db.addSegments` row mapping 加入 `source_tags` / `target_tags`（JSONB 陣列）
2. `mapSegmentRow` 加入 `sourceTags: tryParseJson(r.source_tags, [])` / `targetTags: tryParseJson(r.target_tags, [])`
3. `segmentExtraCamelToSnake` 加入 `targetTags` 映射
4. Migration `20260419130000_cat_segments_tags.sql`：`cat_segments` 加兩個 JSONB 欄位（default `'[]'::jsonb`）

**重要**：修好程式碼後，舊的 Supabase segments（已無 tags 資料）必須**刪除並重新匯入**，才能讓新 tags 寫入。

---

### [2026-06] Phrase mxliff 匯出 — Phrase 無法開啟匯出檔

**症狀**：TMS 匯出 `.mxliff` 後，Phrase 顯示 *Unable to open MXLIFF file*；`<target>` 內為 `&amp;lt;/color&amp;gt;` 等，無 `{1}{2}`。

**原因**：

1. 匯出時 `replacePlaceholders` 以 `tag.xml`（`m:mark` 內容）取代 `{N}`，再經 `setXmlTargetContent` 解析 → 破壞 Phrase 字面佔位。
2. 若 `targetText` 已無 `{N}`（曾錯誤匯出／僅剩 mark 洩漏），僅修正 (1) 仍會寫出壞資料。

**修法**（`e744f50`）：

- `format === 'mxliff'`：`xml := ph`、`target.textContent` 純文字寫入。
- `repairMxliffTargetForExport`：洩漏還原 + 依原始 TU `<target>` 重組佔位。
- 完整紀錄：[`CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md`](./CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md)。

**驗收**：oneapp `BILING_XLS` 樣本匯出後 Phrase 可開；VIP 句段 `<target>` 含 `{1}…{4}`。

---

### [2026-06] Phrase mxliff 匯入 — `{1}{2}` pill 與格式偵測

**摘要**：`ff23f8c`、`56bbfd0` — 接受 `.mxliff`、`synthesizeMxliffBraceTags`、`currentFileFormat = 'mxliff'`、匯出路徑納入 `mxliff`。見實作紀錄 §2 commit 表。

---

### [2026-06] mqxliff／xliff／sdlxliff 匯出 — 遊戲標記 `<AI>…</>` 導致 ph 雙重跳脫

**症狀**：memoQ 匯出檔中，含 `<AI>// ANALYZING</>` 等遊戲引擎標記的句段，譯文 target 出現 `&amp;lt;mq:ch val="" /&amp;gt;` 字面量（換行 ph 變純文字）；memoQ QA 02011「Tag mq:ch is missing from the target」。Focus Entertainment Batch 2 約 183 句段。

**原因**：

1. `escapeMemoqBareCloseForXmlParse` 只處理已 entity 化的 `&lt;/&gt;`，未處理 targetText 內**原始** `</>`、`<AI>` 等遊戲標記。
2. `replacePlaceholders` 還原 `<ph>` 後，片段含非法 XML → `setXmlTargetContent` 解析失敗。
3. `fallbackPlainTextFromCorruptFragment` 剝除 `<ph>` wrapper 但留下 `&lt;mq:ch …/&gt;` 字串 → `textContent` 寫入後再序列化為 `&amp;lt;…&amp;gt;`。

**修法**：新增 `escapeNonXliffAngleBrackets`，在 `prepareRestoredFragmentForXmlParse` 內於 `escapeMemoqBareCloseForXmlParse` 之後呼叫；將非 XLIFF 元素（`ph`/`bpt`/`ept`/`it`/`g`/`x`/`mrk`/`_wrap` 與命名空間元素除外）的尖括號轉為 `&lt;`/`&gt;`，使 DOMParser 可成功解析並保留 `<ph>` 結構。影響 **mqxliff、一般 xliff、sdlxliff**；**mxliff** 走 `textContent` 不受影響。

**驗收**：重新開啟含 `<AI>…</>` 的 mqxliff、確認譯文含 `{N}` 佔位後匯出；target 應為 `<ph>…&lt;mq:ch…/&gt;</ph>` 而非 `&amp;lt;mq:ch…&amp;gt;` 字面量；memoQ 02011 應消失。已錯誤匯出的交付檔需**重新匯出**。

---

## 9. 避免誤改清單

1. **mxliff 匯出勿走 XML 片段還原**
   — `format === 'mxliff'` 必須 `textContent` 寫入且 `replacePlaceholders` 用 `xml: ph`；勿呼叫 `setXmlTargetContent`。
   — 勿刪 `repairMxliffTargetForExport` 或共用 leak 的「逐次 replace」邏輯。

2. **不要用 `textContent` 更新 `.grid-textarea`（contenteditable div）**
   — 必須用 `innerHTML = buildTaggedHtml(...)`，否則 pill 會消失。

3. **不要用 `||` fallback 空陣列 tags**
   — 永遠用 `effectiveTags(seg)` 取得目標欄 tags。

4. **不要移除或簡化 `transparentG` 參數傳遞**
   — sdlxliff 的 mrk 擷取必須傳 `{ transparentG: false }`，
     整個 source/target 的匯入要用 `{ transparentG: true }`。

5. **不要把 `bptMap` 改成全域或跨句段共用**
   — 每次呼叫 `extractTaggedText` 都要重新建立 `bptMap`，
     以免不同句段的 id 互相干擾。

5. **匯出時不要直接把 targetText 寫入 XML**
   — 必須先跑 `replacePlaceholders`，再用 `setXmlTargetContent` 解析後插入，
     才能把 `{N}` 還原成正確的 `<ph>` / `<bpt>` 等 XML 元素。

6. **sdlxliff 匯出不要直接替換整個 `<target>` 內容**
   — 必須透過 `_updateSdlxliffMrkContent` 只更新 mrk，
     保留外層 `<g>` 結構，SDL Studio 才能正確讀取。

7. **若改動 `extractTaggedText`，務必測試**
   — mqxliff（ph / bpt / ept）、sdlxliff（mrk + g）、
     一般 XLIFF（ph）三種格式都要驗證。

8. **`cat-cloud-rpc.ts` 的 `db.addSegments` 和 `mapSegmentRow` 必須包含 `source_tags` / `target_tags`**
   — Team 模式下 tags 透過 cloud RPC 存入 Supabase，若這兩處漏掉，
     tags 資料在上傳時靜默丟失，讀回的 segment 沒有 `sourceTags` / `targetTags`，
     `buildTaggedHtml` 就只能輸出純文字。
   — `segmentExtraCamelToSnake` 也必須映射 `targetTags`，
     否則 `updateSegmentTarget` 無法更新已翻譯句段的 target tags。
