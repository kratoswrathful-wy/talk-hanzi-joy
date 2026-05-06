# CAT 內嵌格式渲染規格（粗體、斜體、上下標、刪除線）

> 狀態：規格撰寫中 / 尚未實作  
> 建立日期：2026-05-05

---

## 1. 需求背景

目前 CAT 編輯器對所有 inline tag（包含格式型的粗體、斜體等）一律顯示為 pill（`[1 B]`…`[B 1]` 等標記），譯者必須靠 pill 編號判斷格式範圍，閱讀不直覺。

本規格定義：

1. **原文欄**：若 tag 為格式型，直接渲染對應字型（粗體字、斜體字等），不顯示 pill。
2. **譯文欄**：同上，現有格式 tag 也直接渲染字型。
3. **譯文插入**：譯者可用快捷鍵或工具列按鈕，在譯文選取文字後插入格式 tag 配對。

涵蓋格式：**粗體、斜體、刪除線、上標、下標**（底線可選，列入擴充）。

---

## 2. 支援的檔案格式

| 格式 | 格式 tag 識別方式 | 插入新 tag 的 XML |
|------|-----------------|-------------------|
| Excel (.xlsx) | `xlsx-rich-tags.js` 已有 `parseRpr()`，可識別 `b`、`i`、`strike`、`vertAlign` | 新 open tag：`<b/>`、`<i/>` 等 rPr 內層 XML；close tag：空字串 |
| XLIFF 1.2 / mqxliff / sdlxliff | `ctype` 屬性：`x-bold`、`x-italic`、`x-superscript`、`x-subscript`、`x-strikethrough` | 新 open tag：`<bpt i="N" x="N" ctype="x-bold"></bpt>`；close tag：`<ept i="N"></ept>` |
| PO / 純文字 | 無 tag 結構，**不支援插入**，按鈕顯示提示 | — |
| memoQ / SDL 格式（無 ctype） | 無法自動識別，**降級顯示 pill**，功能仍正常 | — |

---

## 3. 資料結構變更

### 3.1 tag 物件新增 `fmt` 欄位

現有 tag 物件結構：

```
{ ph, xml, display, type, pairNum, num }
```

新增可選的 `fmt` 欄位（僅格式型 tag 才有，其餘 tag 不帶此欄位）：

```js
fmt: {
  b?:      boolean,  // 粗體
  i?:      boolean,  // 斜體
  strike?: boolean,  // 刪除線
  sup?:    boolean,  // 上標
  sub?:    boolean,  // 下標
  u?:      boolean   // 底線（擴充）
}
```

- 此欄位**不影響匯出邏輯**（匯出仍依賴 `tag.xml`）。
- 此欄位不存進 IndexedDB（只在記憶體中使用），因為它是從 `xml` 衍生出來的，可在讀取時重新計算。
  - **注意**：若未來決定存進 DB，需要調整 `db.js` 的 `addSegments` 與 team 模式的 `source_tags`/`target_tags` 映射。

### 3.2 格式偵測來源

**Excel**（`xlsx-rich-tags.js`）

```
run.style = parseRpr(run.rprXml)
→ fmt = { b: !!style.b, i: !!style.i, strike: !!style.strike, sup: vertAlignIsSup, sub: vertAlignIsSub }
```

**XLIFF**（`xliff-tag-pipeline.js`）

```
ctype = child.getAttribute('ctype') || child.getAttribute('type')

ctype → fmt 對照表：
  'x-bold'          → { b: true }
  'x-italic'        → { i: true }
  'x-superscript'   → { sup: true }
  'x-subscript'     → { sub: true }
  'x-strikethrough' → { strike: true }
  'x-underline'     → { u: true }
```

---

## 4. 渲染行為

### 4.1 原文欄（唯讀）

`buildTaggedHtml(text, tags, isSource=true)` 改為：

- 遇到格式型 open tag（有 `fmt`）：**不輸出 pill**，改開始 accumulate（以 stack 追蹤巢狀）。
- 遇到對應 close tag：取出 stack 頂端，包成 `<span class="rt-fmt rt-fmt-bold …" data-open-ph="{N}" data-close-ph="{/N}">…</span>`。
- 非格式 tag、standalone tag：繼續走現有 pill 路徑。

原文欄因為是 `contenteditable="false"`，這個改動**不影響任何提取邏輯**，風險最低。

### 4.2 譯文欄（可編輯）

同一套 `buildTaggedHtml`，`isSource=false` 時行為相同，格式 tag 也渲染為 `rt-fmt` span 而非 pill。

DOM 結構範例：

```html
<!-- 原文或譯文欄中，{1}粗體文字{/1} 渲染後 -->
普通文字
<span class="rt-fmt rt-fmt-bold" data-open-ph="{1}" data-close-ph="{/1}">
  粗體文字
</span>
普通文字
```

巢狀範例（粗體內有斜體）：

```html
<span class="rt-fmt rt-fmt-bold" data-open-ph="{1}" data-close-ph="{/1}">
  部分粗體
  <span class="rt-fmt rt-fmt-italic" data-open-ph="{2}" data-close-ph="{/2}">
    粗斜體
  </span>
</span>
```

### 4.3 CSS（`style.css`）

```css
.rt-fmt-bold      { font-weight: bold; }
.rt-fmt-italic    { font-style: italic; }
.rt-fmt-del       { text-decoration: line-through; }
.rt-fmt-sup       { vertical-align: super; font-size: .75em; line-height: 0; }
.rt-fmt-sub       { vertical-align: sub;   font-size: .75em; line-height: 0; }
.rt-fmt-underline { text-decoration: underline; }
```

---

## 5. 提取邏輯變更

`extractSubtree`（`app.js`）在現有 `rt-tag` 判斷前加一個分支：

```
若 node 有 class rt-fmt：
  → 輸出 data-open-ph（例如 {1}）
  → 遞迴提取子節點文字
  → 輸出 data-close-ph（例如 {/1}）
```

此改動確保使用者在 `rt-fmt` span 內編輯文字後，`extractTextFromEditor` 仍能正確還原含 `{N}` 佔位符的文字，不影響匯出。

---

## 6. 譯文格式插入

### 6.1 `insertFormattingPair(editor, seg, fmtType)` 函式

| 步驟 | 說明 |
|------|------|
| 1 | 取得目前 Selection 範圍與選取文字 |
| 2 | 若無選取，仍可插入（游標位置插入空 `{N}{/N}`） |
| 3 | 計算新 `num` = `max(effectiveTags(seg).map(t => t.num)) + 1` |
| 4 | 偵測檔案格式，產生對應 `xml`（見 §6.2） |
| 5 | 建立 open / close tag 物件，push 至 `seg.targetTags` |
| 6 | 在 `seg.targetText` 選取位置插入 `{N}選取文字{/N}` |
| 7 | `setEditorHtml(editor, buildTaggedHtml(...))` 重建 DOM |
| 8 | 呼叫 `applyUpdateSegmentTarget` 存庫 |

### 6.2 格式 XML 產生規則

**偵測檔案格式：**

```
若 seg.sourceTags 存在且 sourceTags[0].xml 含 '<bpt' 或 '<ph' 或 '<ept'
  → XLIFF 格式

若 seg.sourceTags 存在且 sourceTags[0].xml 符合 rPr 模式（<b/>、<i/> 等純元素）
  → Excel 格式

其他（無 sourceTags 或無法識別）
  → 顯示提示，不執行插入
```

**Excel XML：**

| 格式 | open.xml | close.xml |
|------|----------|-----------|
| 粗體 | `<b/>` | `''` |
| 斜體 | `<i/>` | `''` |
| 刪除線 | `<strike/>` | `''` |
| 上標 | `<vertAlign val="superscript"/>` | `''` |
| 下標 | `<vertAlign val="subscript"/>` | `''` |

**XLIFF XML：**

`i` 值 = 現有所有 tag 的 `xml` 字串中，所有 `i="N"` 的最大值 + 1

| 格式 | open.xml | close.xml |
|------|----------|-----------|
| 粗體 | `<bpt i="N" x="N" ctype="x-bold"></bpt>` | `<ept i="N"></ept>` |
| 斜體 | `<bpt i="N" x="N" ctype="x-italic"></bpt>` | `<ept i="N"></ept>` |
| 刪除線 | `<bpt i="N" x="N" ctype="x-strikethrough"></bpt>` | `<ept i="N"></ept>` |
| 上標 | `<bpt i="N" x="N" ctype="x-superscript"></bpt>` | `<ept i="N"></ept>` |
| 下標 | `<bpt i="N" x="N" ctype="x-subscript"></bpt>` | `<ept i="N"></ept>` |

### 6.3 快捷鍵

加入 `keydown` 全域 handler（均需 `e.preventDefault()` 以避免瀏覽器預設行為）：

| 格式 | 快捷鍵 |
|------|--------|
| 粗體 | `Ctrl + B` |
| 斜體 | `Ctrl + I` |
| 刪除線 | `Ctrl + Shift + S` |
| 上標 | `Ctrl + Shift + =` |
| 下標 | `Ctrl + =` |

### 6.4 工具列按鈕

在 `index.html` 現有工具列新增一個「格式」群組，顯示五顆按鈕：

```
B  I  S̶  x²  x₂
```

按鈕行為：呼叫 `insertFormattingPair(activeEditor, activeSeg, fmtType)`。僅在譯文有焦點時可點擊（否則 `disabled`）。

---

## 7. 邊緣情況與降級行為

| 情況 | 行為 |
|------|------|
| memoQ / SDL tag 無 `ctype` | `fmt` 為空，繼續顯示 pill，翻譯資料完整不受影響 |
| 貼上外部 HTML（如從 Word 貼） | 貼入的 `<b>`/`<strong>` 不被辨識為 `rt-fmt`，格式消失，文字保留 |
| 刪除 `rt-fmt` span 內全部文字後仍留空 span | 提取結果為 `{1}{/1}`（空配對）；下次 `buildTaggedHtml` 仍能還原（空 span），不崩潰 |
| 游標在 `rt-fmt` span 邊界按 Backspace | 瀏覽器行為，最壞情況移除了 span 外側字元，不影響格式結構 |
| 無 sourceTags 的純文字檔案 | 插入按鈕不執行，顯示 tooltip 說明 |
| 巢狀格式 tag（粗體中有斜體） | stack 機制支援，DOM 自然巢狀，提取遞迴正確 |

---

## 8. 需修改的檔案

| 檔案 | 修改內容 |
|------|----------|
| `cat-tool/js/xlsx-rich-tags.js` | `extractCellRichTags`：open tag push 時加 `fmt` 欄位 |
| `cat-tool/js/xliff-tag-pipeline.js` | `extractTaggedText`：讀 `ctype` 後加 `fmt` 欄位 |
| `cat-tool/app.js` | `buildTaggedHtml`（stack 式渲染）、`extractSubtree`（rt-fmt 分支）、新增 `insertFormattingPair`、keydown handler、工具列 click handler |
| `cat-tool/style.css` | 新增 `.rt-fmt-*` 格式 class |
| `cat-tool/index.html` | 工具列新增 B / I / S̶ / x² / x₂ 按鈕 |

改完執行 `npm run sync:cat` 並提交 `cat-tool/` 與 `public/cat/`。

---

## 9. 回退策略

### 9.1 風險等級分類

| 修改對象 | 風險等級 | 理由 |
|----------|----------|------|
| `extractSubtree`（提取邏輯） | **高** | 一旦出錯，譯者儲存任何句段都會悄悄寫入錯誤的 targetText，且不立即報錯 |
| `buildTaggedHtml`（渲染邏輯） | **中** | 出錯只影響顯示，不影響儲存資料；渲染錯誤一眼可見 |
| `insertFormattingPair`（新增功能） | **低** | 出錯只在插入格式這個動作時發生，不影響現有翻譯資料 |
| `xlsx-rich-tags.js` / `xliff-tag-pipeline.js`（加 fmt 欄位） | **低** | `fmt` 欄位不影響匯出，渲染層若讀不到 `fmt` 只是退回 pill 顯示 |
| `style.css` / `index.html` | **最低** | 純樣式與 UI，不觸及邏輯 |

### 9.2 使用 Feature Branch 實作

**不在 `main` 上直接開發此功能。** 步驟：

1. 實作前從 `main` 分支出 `feat/inline-formatting`
2. 每完成一個步驟（§8 的修改清單），獨立 commit，commit 訊息對應步驟編號
3. 確認全部測試通過後，才合回 `main` 並推送

回退基準點：`a1cec83`（2026-05-07，「CAT: reset transient editor UI when leaving editor shell」）

> 2026-05-07 重新掃描確認：三筆新 commit（`5f2c401`、`093fb88`、`a1cec83`）均不涉及 `buildTaggedHtml`、`extractSubtree`、tag pipeline 等本功能將修改的函式，無衝突。

### 9.3 緊急功能旗標

在 `app.js` 頂部加一個常數（實作時設為 `true`，回退時只需改成 `false` 並重新部署）：

```js
// 格式字型渲染功能開關
// 設為 false 可立即回退至純 pill 顯示，不影響翻譯資料
const INLINE_FMT_RENDER = true;
```

`buildTaggedHtml` 的邏輯包裝如下：

```js
if (INLINE_FMT_RENDER && tag.fmt && tag.type === 'open') {
  // 新 stack 式格式渲染
} else {
  // 原有 pill 渲染
}
```

`extractSubtree` 的邏輯包裝如下：

```js
if (INLINE_FMT_RENDER && node.classList.contains('rt-fmt')) {
  // 新 rt-fmt 提取分支
} else if (node.classList.contains('rt-tag')) {
  // 原有 pill 提取（不動）
}
```

這樣一來：
- 旗標設為 `false`：整個系統完全退回舊行為，`rt-fmt` 永遠不會被產生，`extractSubtree` 也走不進新分支
- 旗標設為 `true`：新行為啟用

> 緊急回退時，只需把旗標改為 `false`、執行 `npm run sync:cat`、重新部署，不需 git revert，5 分鐘內可完成。

### 9.4 分步驟提交順序

建議的 commit 順序（每步都能單獨 revert）：

| 順序 | 內容 | 可獨立 revert？ |
|------|------|----------------|
| 1 | `style.css`：加 `.rt-fmt-*` class | 是（純 CSS，無邏輯影響） |
| 2 | `xlsx-rich-tags.js` + `xliff-tag-pipeline.js`：加 `fmt` 欄位 | 是（`fmt` 可選，渲染層若讀不到退回 pill） |
| 3 | `app.js` `buildTaggedHtml`：加旗標 + stack 式渲染 | 是（渲染錯誤一眼可見，不影響儲存） |
| 4 | `app.js` `extractSubtree`：加 `rt-fmt` 分支 | 是（最高風險，獨立 commit 方便單獨追蹤） |
| 5 | `app.js` `insertFormattingPair` + 快捷鍵 | 是（新功能，不影響現有流程） |
| 6 | `index.html`：工具列按鈕 | 是（純 UI） |
| 7 | sync + 整合測試 commit | — |

### 9.5 資料安全性

**IndexedDB 結構不變**：`fmt` 欄位只在記憶體中使用，不寫入 IndexedDB，也不進 Supabase 的 `source_tags`/`target_tags` 欄位。因此：

- 回退後，所有已儲存的句段資料**完整無損**
- 不需要任何 DB migration，也不需要 rollback migration
- 使用者在新版存入的資料，在回退後的版本中仍然可以正常讀取（格式回到 pill 顯示，文字不受影響）

### 9.6 最壞情況的完整 git 回退指令

若緊急旗標也無法解決問題，完整退回到本功能實作前的狀態：

```powershell
# 查看所有 feat/inline-formatting 的 commit（找到分叉點）
git log --oneline main..feat/inline-formatting

# 若已合回 main，找到合併前的 commit hash
git log --oneline -20

# 回退（建立新 commit，不破壞歷史）
git revert <合併 commit 的 hash>

# 或若確定整段都要撤銷
git revert <最舊的新 commit>..<最新的新 commit>

# 同步並推送
npm run sync:cat
git push
```

---

## 10. 實作前程式碼快照（2026-05-07 掃描）

以下記錄每支需修改函式的**當前行號與簽名**，作為實作前的比對基準。若實作中途暫停，可用這些行號快速確認修改範圍是否正確。

| 函式 | 檔案 | 行號 | 說明 |
|------|------|------|------|
| `buildTaggedHtml` | `cat-tool/app.js` | 16695 | 目前只產 `rt-tag` pill，**尚無** `rt-fmt` 邏輯 |
| `effectiveTags` | `cat-tool/app.js` | 16685 | 不需修改，僅供 `insertFormattingPair` 呼叫 |
| `extractSubtree` | `cat-tool/app.js` | 16762 | 目前只處理 `rt-tag`，**尚無** `rt-fmt` 分支 |
| `extractTextFromEditor` | `cat-tool/app.js` | 16810 | 不需直接修改（依賴 `extractSubtree`） |
| `insertNextMissingTag` | `cat-tool/app.js` | 13511 | 參考此函式邏輯撰寫 `insertFormattingPair` |
| `extractTaggedText` | `cat-tool/js/xliff-tag-pipeline.js` | 57 | tag 物件為 `{ph,xml,display,type,pairNum,num}`，**尚無** `fmt` |
| `extractCellRichTags` | `cat-tool/js/xlsx-rich-tags.js` | 107 | tag 物件同上，**尚無** `fmt` |

**確認項目（掃描時全數為「無」）：**
- `INLINE_FMT_RENDER` 常數：無
- `rt-fmt` class：無（`app.js`、`style.css`、`index.html` 均無）
- tag 物件上的 `fmt` 欄位：無

---

## 11. 不在本規格範圍內

- 顏色（color）、字型大小（sz）等 rPr 屬性的渲染（可列為後續擴充）
- XLIFF 2.0 格式（本工具目前不支援 XLIFF 2.0）
- 字型切換（如特定 font-family）
