# CAT 無延遲提示系統（Global Tooltip）

## 背景

瀏覽器原生 `title` 屬性有約 600 ms 的顯示延遲，且無法自訂外觀。
CAT 工具原本就為字數進度條建置了一個無延遲的自訂提示模組；
2026-05-03 將此機制擴充為全系統通用方案，覆蓋工具列按鈕、搜尋篩選面板、句段鎖定列等高頻互動元素。

---

## 架構

### 單一 DOM 元素 + delegated 事件

```
#wcProgressModeTooltip  (position: fixed; pointer-events: none)
```

- 整個頁面只有**一個**提示氣泡元素，懸停時動態填入文字並定位。
- 透過 `document.addEventListener('mouseover', ..., true)` 委派，不需要每個元素分別綁定。
- 滾動（`scroll`）或視窗大小改變（`resize`）時自動隱藏，避免殘留。

### 觸發條件（`initGlobalTooltip`，`app.js`）

mouseover 選取器同時涵蓋兩類來源：

| 來源 | 觸發方式 | 文字取得 |
|---|---|---|
| **`[data-tip]` 屬性** | 任何帶 `data-tip` 的元素 | 直接讀屬性值（靜態或 JS 動態寫入） |
| **進度條 class** | `.file-progress-cell`、`.view-progress-cell`、`.editor-status-bar-progress-track` | 即時呼叫 `_wcGetFileMode` / `_wcGetViewMode` 取得當前模式 |

進度條類別保持即時讀取（不存入 `data-tip`），是因為它的文字需反映切換後的最新狀態。

### 樣式（`style.css`）

```css
#wcProgressModeTooltip.wc-progress-mode-tooltip {
    position: fixed;
    z-index: 100060;
    max-width: min(20rem, calc(100vw - 16px));
    padding: 0.35rem 0.55rem;
    font-size: 0.78rem;
    color: #f8fafc;
    background: #1e293b;
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.28);
    pointer-events: none;
}
```

---

## 目前已覆蓋元素（2026-05-03）

### A 類：功能說明型（互動按鈕）

**`index.html` 靜態 HTML（`data-tip` 屬性）：**

| 區域 | 元素 ID |
|---|---|
| 專案工具列 | `btnProjectToolbarAssign`、`btnProjectToolbarLinkCase`、`btnProjectToolbarDelete`、`btnProjectWordCount`、`btnProjectSplitAssign`、`btnCreateViewQuick`、`btnToggleFileProgressMode` |
| 句段集工具列 | `btnViewsToolbarAssign`、`btnViewsToolbarDelete`、`btnViewsToolbarWordCount`、`btnViewsToolbarSplit`、`btnToggleViewProgressMode` |
| 編輯器工具列 | `btnExitEditor`、`btnSortMenu`、`btnTagCollapse`、`btnShowNonPrint`、`btnShortcuts`、`btnColSettings`、`btnInternalNoteArrow`、`btnClientQuestionFormArrow`、`btnAiMode` |
| 搜尋篩選面板 | `sfModeSearch`、`sfModeFilter`、`btnSfInvert`、`btnSfPrev`、`btnSfNext`、`btnSfClearNav`、`btnToggleAdvancedSF`、`mqRoleIcon`、`btnSfOptionsPopover`、`btnSfReplaceThis`、`btnSfReplaceAll` |
| 筆記面板 | `btnCollapseNotesPanel` |
| 狀態列 | `btnProgressRange`、`btnToggleEditorWordMode` |

**`app.js` 動態更新（`element.dataset.tip = ...`）：**

| 函式 | 元素 | 說明 |
|---|---|---|
| `_wcRefreshFileToolbarTitle` | `btnToggleFileProgressMode` | 切換後即時更新說明文字 |
| `_wcRefreshViewToolbarTitle` | `btnToggleViewProgressMode` | 同上 |
| `_wcRefreshEditorToolbarTitle` | `btnToggleEditorWordMode` | 同上 |
| 標籤折疊初始化 / `toggleTagDisplay` | `btnTagCollapse` | 展開↔收起狀態文字 |
| `updateSfReplaceAllButtonLabel` | `btnSfReplaceAll` | 單句/多句選取時說明不同 |

### D 類：句段列行為型

| 位置 | 觸發條件 | 說明文字 |
|---|---|---|
| `app.js`（格線更新） | `effectiveLockedSystem` | `getForbiddenTooltip(seg)` → 「禁止編輯：匯入時即已鎖定」或「身分權限不允許」 |
| `app.js`（格線更新） | `seg.isLockedUser` | 「句段鎖定中，請解除鎖定後再編輯」 |
| `app.js`（格線渲染） | 同上兩條，渲染時設定 | 同上 |
| `app.js`（格線渲染 HTML 字串） | `.status-icon` | 「Ctrl+Enter/點擊 確認狀態」 |

### 原始進度條（最初設計，保留即時計算）

| Class | 說明 |
|---|---|
| `.file-progress-cell` | 列表頁各檔案的字數進度條 |
| `.view-progress-cell` | 列表頁各句段集的字數進度條 |
| `.editor-status-bar-progress-track` | 編輯器底欄進度軌道 |

---

## 尚未覆蓋（保留原生 `title`）

以下元素仍使用原生 `title`，原因或後續計劃如下：

### B 類：溢出文字型

用於 `max-width + overflow: hidden + text-overflow: ellipsis` 元素，懸停顯示被截斷的完整內容。
這類元素延遲感相對低（使用者通常需要先辨識文字是否被截斷），可按需轉換。

主要分布在：
- TM 表格原文/譯文/備註欄（`app.js` 約 8 處）
- AI 準則範例來源文字
- 檔案名稱、Tab 面板網址

**轉換方式：** 同樣改用 `data-tip`，但因這些是 HTML 模板字串，要注意 XSS：須對動態內容做 `escHtml()` 處理後再寫入屬性，例如：
```js
`title="${esc(src)}"` → `data-tip="${esc(src)}"`
```

### C 類：靜態說明標籤型

設定頁面的 `<label>` 說明、搜尋群組操作說明等。互動頻率低，延遲感不明顯。

### 其他尚未處理的 `index.html` 按鈕

部分工具列按鈕（如「分析」頁內的輔助按鈕、AI 準則管理按鈕等）仍用 `title`，可視需要批次轉換。

---

## 如何新增 `[data-tip]` 提示

**靜態 HTML 元素：**
```html
<!-- 舊 -->
<button title="說明文字">按鈕</button>

<!-- 新 -->
<button data-tip="說明文字">按鈕</button>
```

**JS 動態設定：**
```js
// 舊
element.title = '說明文字';

// 新
element.dataset.tip = '說明文字';
```

**HTML 模板字串（注意 XSS）：**
```js
// 舊
`<span title="${esc(text)}">...</span>`

// 新
`<span data-tip="${esc(text)}">...</span>`
```

> **注意**：`data-tip` 不具備 `title` 的螢幕閱讀器 fallback。若元素沒有其他可見標籤且需要無障礙支援，可考慮同時保留 `aria-label`。

---

## 已知限制

| 限制 | 說明 |
|---|---|
| 不支援 HTML 內容 | 提示文字以 `textContent` 寫入，不解析 HTML，純文字即可 |
| 多行文字 | CSS 設 `white-space: normal`，長文字會自動換行至 `max-width` |
| 鍵盤觸發 | 目前不支援鍵盤 focus 顯示（無障礙用途的 `title` 不完全等同） |
| 觸控裝置 | `mouseover` 在觸控裝置行為不一致；CAT 工具主要為桌面使用，目前不需處理 |
