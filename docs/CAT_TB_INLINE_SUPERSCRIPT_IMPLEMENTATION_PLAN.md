# CAT：原文格術語上標編號（TB）— 實作計畫

本文件為「**原文格內術語極淡標示 + 上標編號（1–9）+ 副行對照清單**」功能的實作依據。對話脈絡與決策紀錄見 [`docs/CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md`](CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md)。

> 重要：本功能必須與既有 **Ctrl+1～9** 行為完全對齊（見 [`docs/CAT_CTRL_DIGIT_SHORTCUT_SPEC.md`](CAT_CTRL_DIGIT_SHORTCUT_SPEC.md)）。原文格內顯示的編號必須以「右欄當頁 1–9」為唯一真相。

---

## 1. 目標與非目標

### 1.1 目標

- 原文欄（source cell）命中 TB 時：
  - 對命中詞做**極淡標示**
  - 在命中詞旁顯示**普通上標數字**（1–9），數字代表「右欄當頁第 N 筆」
- 在同一個原文格內新增「副行」：
  - 列出 `N 原文→譯文`（不含備註）
  - 多筆時可換行顯示（多行樣式）
- 右欄換頁或列表重繪時：
  - 原文格內的上標數字與副行清單**同步更新**

### 1.2 非目標（本波不做）

- 不改變 TB 命中/排序/分頁的核心策略（尤其「每頁 9」與 Ctrl+1～9 對齊）
- 不在原文格內顯示 TB 備註
- 不做跨句段/跨列的固定編號（只跟「當下右欄當頁」一致）

---

## 2. 資料來源與同步策略

### 2.1 右欄當頁列表 = 唯一真相

原文格內需要知道：

- 右欄目前顯示的是第幾頁（`catMatchPageIndex`）
- 右欄當頁的 1–9 條目各自的 `type / sourceText / targetText`

建議做法：

- 實作一個「取得右欄當頁條目」的純函式或小 helper（只回傳當頁 slice 的前 9 筆）
- 以當頁 slice 去計算：
  - `indexMap`（`sourceText` → \(1..9\)）
  - `sublineItems`（命中本句段的那些 index）

### 2.2 同步更新時機

原文格內顯示必須在下列時機更新：

- 使用者切換句段（觸發右欄重新比對/重繪）
- 使用者在右欄換頁（例如 Alt+←/→ 或任何 UI 分頁控制）
- 右欄資料重算或重排（例如 TM/TB 掛載變動、篩選條件變動導致 matches 更新）

做法建議（擇一）：

- **方案 A（事件/鉤子）**：在右欄 `paintCatMatchTable()` 末尾（或等效重繪點）呼叫 `refreshSourceInlineTbHints()`，該函式負責更新目前可見列的 source cell DOM。
- **方案 B（觀察 DOM）**：使用 `MutationObserver` 監看右欄結果容器變動，變動後重新計算當頁 1–9 並更新原文格。（優點：侵入小；缺點：較難驗收與除錯）

本專案可維護性考量，優先選 **方案 A**。

---

## 3. UI 規格（可驗收）

### 3.1 原文格內（主行）

- 命中術語的文字範圍：
  - 極淡底線/底色（不加粗、不換色）
  - **每次出現都顯示上標**（同一術語重複出現亦然）
- 上標數字：
  - 視覺為普通上標（無圓角膠囊、無底色、無陰影）
  - 僅顯示 1–9（與 Ctrl+1～9 對齊）

### 3.2 原文格內（副行）

- 形式：多行/換行可閱讀的清單
- 內容：`N 原文→譯文`，不含備註
- 顯示條件：
  - 至少命中 1 筆且該筆存在於右欄當頁 1–9
  - 若本頁無命中則副行隱藏或顯示灰字提示（二擇一；以產品偏好定）

---

## 4. 技術落點（檔案與可能入口）

> 實際程式只允許在 `cat-tool/` 修改，並以 `npm run sync:cat` 同步至 `public/cat/`（見根目錄 `AGENTS.md`）。

### 4.1 主要檔案

- [`cat-tool/app.js`](../cat-tool/app.js)
  - 右欄比對渲染：`renderLiveTmMatches()` 與 `paintCatMatchTable()`（當頁 9 筆切片與重繪點）
  - 句段表格（grid）渲染：尋找 source cell 的 render/更新函式（需在實作時定位）
- 樣式：可先以 inline style 或新增對應 class（視現況 CSS 結構）

### 4.2 推薦新增的 helper（命名僅示意）

- `getRightPanelPageSlice()`：回傳當頁 1–9 的 matches（含 `type/sourceText/targetText`）
- `computeTbIndexMapFromPageSlice()`：只針對 `type === 'TB'` 建立 `sourceText → n`
- `decorateSourceCellWithTbSuperscripts(rowEl, indexMap)`：對 source cell 內的命中範圍加上淡標示與上標
- `renderSourceCellTbSubline(rowEl, items)`：寫入副行 `N 原文→譯文`

---

## 5. 驗收清單（白話）

- 選取某句段，右欄顯示 TB 結果（當頁最多 9 筆）
  - 原文格內命中詞旁出現上標 `1..9`
  - 按 Ctrl+N 插入的內容與上標 N 指到的是同一筆（視覺與行為一致）
- 右欄切換到下一頁
  - 原文格內上標與副行清單立即改成新頁的編號對應
- 同一術語在原文中出現兩次
  - 兩處都顯示淡標示與上標
- 命中很多筆（足以讓副行換行）
  - 副行清單能換行且仍可讀

---

## 6. 參考（預覽）

靜態預覽（僅設計稿）：

- `docs/preview-tb-in-source/index.html`

---

## 7. 同步納入：LMS/CAT 左側工具欄自動展開／收合（跨 React Shell 與 iframe）

> 本節與 TB 上標功能屬同一波要落地的體驗改善，故納入同一份實作計畫；但實作落點分別在 `src/`（React Shell）與 `cat-tool/`（iframe 內 CAT）。

### 7.1 目標

- 讓使用者在 LMS 與 CAT 之間切換時，左側欄（紅框：React Shell）與 CAT 側欄（藍框：iframe 內）保持符合情境的展開／收合狀態。

### 7.2 規則（已定案）

- **進入 LMS 任意頁**（非 `/cat/*`）：
  - React Shell 左欄：**展開**
- **進入 CAT 模組頁**（`/cat/team/*`，但不含 `/files/:id` 編輯器）：
  - React Shell 左欄：**收合**
  - iframe 內 CAT 側欄：**展開**
- **進入 CAT 編輯器**（`/cat/team/files/:id`）：
  - React Shell 左欄：**收合**
  - iframe 內 CAT 側欄：**收合**

### 7.3 「尊重手動」與「例外強制」策略

- **一般情況**：尊重使用者手動收合／展開狀態，不在同一區域內每次換頁都覆蓋。
- **例外（強制套用）**：在 **CAT 模組 ↔ CAT 編輯器** 之間切換時，每次都必須強制套用上述規則（避免編輯器工具欄干擾）。

### 7.4 技術落點（僅規劃，實作階段再落碼）

- React Shell（`src/`）：
  - 在 Layout 層讀取 `location.pathname` 判斷 LMS vs CAT（`/cat/team`）與是否為編輯器（`/files/:id`）
  - 透過 `useSidebar().setOpen(true/false)` 控制最左側欄
- CAT iframe（`cat-tool/`）：
  - 進入編輯器 view 時目前已會 `sidebar.classList.add('collapsed')`（需在實作時確認 team/offline 一致性）
  - 若要「進入 CAT 模組時強制展開」，需在 `switchView()` 或模組載入點確保 `sidebar.classList.remove('collapsed')`
  - 若要從 React Shell 控制 iframe 內狀態，建議使用 `postMessage` 定義明確的「視圖狀態」訊息（避免依賴 sessionStorage 的上次狀態）

### 7.5 文案更名（已定案）

- `src/components/AppSidebar.tsx`：
  - 左欄標題：`追蹤器` → `1UP LMS`
  - 導覽入口：僅將 **Team** 入口 `CAT Team（受派）` → `1UP CAT`（離線版入口維持原名）

---

## 8. 下一波調整（2026-05-09 後續）：複製不含上標、顏色加深、缺漏術語紅色提示、快捷鍵可隨時使用

本節為下一次實作的計畫（不改變 Ctrl+1～9 的核心規則；仍以右欄當頁 1–9 為唯一真相）。

### 8.1 上標數字改為 CSS `::after`（避免複製/搜尋污染）

**目標**

- 使用者在原文格拖曳反白後 Ctrl+C 複製，不應包含上標數字（例如不應複製出 `Settings1`）
- 瀏覽器 Ctrl+F 或其他依 DOM 文字的搜尋，不應因上標數字而干擾命中

**做法**

- `cat-tool/app.js`：停止插入 `.tb-inline-sup` 文字節點，改為：
  - `.tb-inline-term` 上設定 `data-tb-n="1"`（或 `data-n`）
- `cat-tool/style.css`：用 pseudo-element 顯示：
  - `.tb-inline-term::after { content: attr(data-tb-n); ... vertical-align: super; }`

**驗收**

- 複製命中術語的原文字串時，剪貼簿內容不含上標數字

### 8.2 標示更顯眼（僅加深底線）

**目標**

- 在不變更背景色的前提下，將底線顏色加深，使命中術語更易被看見

**做法**

- 只調整 `cat-tool/style.css` 的 `--tb-inline-hint-underline`（提高 alpha 或改為更深色）

### 8.3 缺漏術語紅色提示（右欄 TB 列 + 原文格副行）

**定義**

- 若原文命中某 TB（依 `termMatches(source, term.source, flags)`）
- 且譯文未出現對應譯法（依 `!termMatches(target, term.target, flags)`）
  - 視為「缺漏術語」

**UI**

- 右欄 TB 列：背景/標示改為淡紅（例如加 `.is-missing` class）
- 原文格副行：該 TB item 改為淡紅底與紅色邊框/文字
- 已包含譯文者：維持原本（或加深後）的正常用色

**做法**

- `cat-tool/app.js`：產生副行 item 時附帶 `isMissing`，並在右欄渲染 TB row 時加 class
- `cat-tool/style.css`：新增對應 `.is-missing` 樣式

**驗收**

- 選取句段時，若譯文未包含某 TB 譯法，右欄與副行能立刻顯示淡紅提示；補上譯法後提示消失

### 8.4 Ctrl+, / Ctrl+. 換頁快捷鍵：改成隨時可用

**背景**

- 目前 `catResultPagePrev/Next`（預設 Ctrl+, / Ctrl+.）在「格內可編」情境下會被刻意擋掉，導致需要點右欄才會生效

**目標**

- 行為比照 `Ctrl+Alt+←/→`：不論焦點在譯文編輯區或其他區域，都能換頁

**做法**

- `cat-tool/app.js`：調整 `catPanelPageKey` handler 的阻擋條件
  - 移除或放寬「格內可編不攔」的限制（目前由 `isCatPanelBlockWordNav()` 導致）
  - 保留必要條件：在 `viewEditor`、有 `currentTmMatches` 且 > 9、且右欄 tabCAT active

**驗收**

- 游標在譯文編輯區時，按 Ctrl+, / Ctrl+. 可直接切換右欄比對列表頁面

---

## 9. 已落地補充（2026-05-09 第二波）

下列項目已於 **`bac463f`／`080afd3`／`b68611d`** 等 commit 落地（細節、根因表、驗收與產品邊界見開發紀錄 **§9**）：

- 上標錨點跨相鄰 `Text` 節點（`pullCrossNodeWordSuffix`）；共用 **`findTermHitRangesInPlainText`**
- 右欄 TB 子序列依句段 **`seg.sourceText` trim** 之首次命中位置排序（TM／Fragment 仍在上）
- 同一單字尾端多個上標；**同 `(start,end)` 多筆 TB** 合併為 **一條** `tb-inline-term`、**多個** `tb-inline-sup-anchor`

[`docs/CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md`](CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md) **§9**

