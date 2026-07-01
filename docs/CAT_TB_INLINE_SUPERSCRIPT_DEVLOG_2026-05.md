# CAT：原文格術語上標編號（TB）— 開發紀錄（2026-05）

本文件記錄「**原文格內術語極淡標示 + 上標編號（1–9）+ 副行對照清單**」功能之討論過程、決策與設計脈絡，供後續實作、驗收與回溯。

> 範圍：僅針對 **CAT 編輯器（viewEditor）** 之「原文欄（source cell）」顯示與右側欄（TB/Frg/TM 清單）**編號同步**。

---

## 1. 背景

- 使用者目前可在編輯器右側欄看到 TB（術語）、Frg（片段）、TM（整段）等建議。
- 已有快捷鍵 **Ctrl+1～9** 可依右側欄「作用中分頁」與「當頁第 N 筆」套用（見 [`docs/CAT_CTRL_DIGIT_SHORTCUT_SPEC.md`](CAT_CTRL_DIGIT_SHORTCUT_SPEC.md)）。
- 新需求希望在「原文格」內提供**不干擾視覺**的提示，使使用者更直覺知道「哪個詞對應 Ctrl+幾」。

---

## 2. 需求演進（摘要）

### 2.1 初始方向：在原文格內顯示術語譯法

- 目標：原文命中術語時，為術語做標示，並在不干擾視覺前提下顯示譯法。
- 產出：先以靜態 HTML 預覽多種 UI 方案供決策。

### 2.2 最終選定方向：極淡標示 + 上標編號 + 副行清單

使用者最終選定：

- **術語極淡標示**：淡底線/淡底色，不改字色、不加粗
- **術語旁上標數字**：例如 `Settings¹`（數字為普通上標，不使用圓角膠囊/底色）
  - 數字的意義：**右側欄當頁第 N 筆**（1–9），直接對應 **Ctrl+N**
- **副行（可換行）清單**：列出 `N 原文→譯文`（不含備註），命中多筆時顯示為多行/換行排列
- **與右欄分頁同步**：若右欄結果超過 9 筆並分頁，原文格內上標與副行清單必須跟著「目前右欄顯示頁」更新

---

## 3. 與既有規格之對齊

### 3.1 右欄「每頁最多 9 筆」是既有規格與實作基礎

本功能依賴「右欄當頁編號 1–9」與 Ctrl+1～9 一致，且現況已固定每頁 9 筆（CAT 分頁行為）。

- 既有規格：[`docs/CAT_CTRL_DIGIT_SHORTCUT_SPEC.md`](CAT_CTRL_DIGIT_SHORTCUT_SPEC.md) §3 指出「逾 9 筆時分頁，Ctrl+1～9 對應當頁」
- 既有實作：`cat-tool/app.js` 內 `CAT_MATCH_PAGE = 9` 與 `page * 9 + relIndex`（此處僅作為對齊依據，實作時不得改變此一致性）

### 3.2 「本頁可用編號」為唯一真相

決策重點：原文格內不應自行排序/合併出一套獨立編號，避免發生：

- 原文格顯示 `¹`，但右欄第 1 筆已因換頁/排序變更而不是同一條

因此原文格顯示必須 **100% 跟右欄當頁列表** 同步。

---

## 4. 預覽檔案（設計稿）

靜態預覽（僅設計稿，未接主程式）：

- `docs/preview-tb-in-source/index.html`

此預覽可模擬：

- 右欄分頁切換（第 1/2 頁）
- 上標編號與副行清單同步更新
- 副行多筆時換行樣式

---

## 5. 待釐清（實作前）

下列項目需在正式實作時定案（本文件先記錄，不在此階段實作）：

- **命中規則**：是否以 `termMatches()`（含 caseInsensitive/wholeWord）作為來源欄命中判定，並如何處理重疊/包含（例如 `Settings` vs `Settings menu`）。
- **多次出現的上標策略**：已決定「每次出現都顯示上標」，但若同句命中大量詞，是否需要上限或隱藏策略（以免造成雜訊）。
- **副行上限**：副行顯示項目是否要限制最大數量（例如最多 6 個，其餘以 `…` 省略）以免副行過長。

---

## 6. 同步納入：LMS/CAT 左側工具欄自動展開／收合（後續實作計畫）

同一輪討論中，使用者亦提出「進入 LMS / CAT 相關介面時，自動調整左側欄收合」之需求，並定案以下規則（供後續一併實作與驗收）：

### 6.1 核心原則：一般情況尊重手動；CAT 模組 ↔ 編輯器例外強制

- **一般情況**：尊重使用者手動收合／展開狀態，不在同一區域內每次換頁都強制覆蓋。
- **例外**：在 **CAT 模組** 與 **CAT 編輯器（作業檔）**之間來回切換時，每次都需強制套用（避免工具欄狀態造成操作干擾）。

### 6.2 觸發條件與預期

- **進入 LMS 任意頁面**（案件、費用、設定、個人檔案等）：
  - React Shell 最左側欄（原「追蹤器」）**自動展開**
- **進入 CAT 模組頁**（專案清單、TM/TB 清單等；非編輯器）：
  - React Shell 左欄 **自動收合**
  - iframe 內 CAT 側欄 **自動展開**
- **進入 CAT 編輯器**（`/cat/team/files/:id` 等）：
  - React Shell 左欄 **自動收合**
  - iframe 內 CAT 側欄 **自動收合**

### 6.3 介面文字（本輪定案）

- React Shell 左欄標題：`追蹤器` → `1UP LMS`
- 左欄導覽入口名稱：僅將 **Team** 入口 `CAT Team（受派）` → `1UP CAT`（離線版入口維持原名）

### 6.4 更正（2026-05-10）

§6.3 將 **「LMS 左欄導覽條目名稱」** 與 **「CAT iframe 內可見側欄標題」** 混寫為同一處改名，與後續產品決策不一致。**正確規格**為：LMS 導覽維持 **「CAT 團隊線上版」**；iframe 內 `.sidebar-title` 改為 **「1UP CAT」**；收合範圍含 **`/cat/offline`**；**不記住**手動展開 LMS。完整敘述、技術落點與驗收見 **[`docs/LMS_CAT_SHELL_SIDEBAR_UX_2026-05.md`](./LMS_CAT_SHELL_SIDEBAR_UX_2026-05.md)**。§7.3 以下仍保留當日上線之**歷史紀錄**，不刪改。

---

## 7. 2026-05-09 實作與上線過程（今日詳細紀錄）

本節記錄今天從「定案」到「上線驗收成功」的完整過程，方便日後回溯（包含一次 Vercel 編譯錯誤的修正）。

### 7.1 先做預覽（不動主程式）

- 建立／更新靜態預覽頁：`docs/preview-tb-in-source/index.html`
- 預覽內容逐步收斂為：
  - 術語極淡標示
  - 術語旁顯示普通上標 1–9（例如 `Settings¹`）
  - 副行以可換行樣式列出 `N 原文→譯文`（不含備註）
  - 模擬右欄分頁切換時編號同步更新

### 7.2 落地實作：CAT 編輯器原文格 TB 上標

- 修改範圍：僅在 `cat-tool/`（CAT 原始碼），並透過 `npm run sync:cat` 同步到 `public/cat/`
- 主要落點：
  - `cat-tool/app.js`：在編輯器格線渲染/右欄重繪後更新原文格內的上標與副行
  - `cat-tool/style.css`：新增 `.tb-inline-*` 樣式（淡標示、上標、與副行清單）
- 核心設計原則仍遵守 §3.2：「本頁可用編號」以右欄當頁 1–9 為唯一真相，確保與 Ctrl+1～9 完全一致。

### 7.3 落地實作：LMS/CAT 左側欄自動展開/收合 + 文案更名

- React Shell（`src/`）：
  - `src/components/AppLayout.tsx`：依路由判斷 LMS vs CAT(team) 模組/編輯器，控制最左側欄展開/收合
  - `src/components/AppSidebar.tsx`：更名 `追蹤器` → `1UP LMS`，Team 入口 `CAT 團隊線上版` → `1UP CAT`
  - `src/components/ui/sidebar.tsx`：將 `useSidebar()` 對外匯出供 Layout 控制
- CAT iframe（`cat-tool/`）：
  - `src/pages/CatToolPage.tsx`：Team 模式下依路由送出 `postMessage`，指定 iframe 內 CAT 側欄應為 `module`（展開）或 `editor`（收合）
  - `cat-tool/app.js`：接收 `TMS_SIDEBAR_MODE` 訊息後，對 CAT 側欄 `collapsed` 做強制同步

### 7.4 推送與 Vercel 編譯錯誤

- 首次推送 commit：`38be175`（`feat(cat): TB superscripts and sidebar auto-toggle`）
- Vercel Build Logs 顯示 TypeScript 錯誤：
  - `TS2323: Cannot redeclare exported variable 'useSidebar'`
  - `TS2484: Export declaration conflicts with exported declaration of 'useSidebar'`
- 原因：`src/components/ui/sidebar.tsx` 同時存在
  - `export function useSidebar() { ... }`
  - 檔案底部 `export { ... useSidebar }` 的二次匯出

### 7.5 修正並再次推送

- 修正 commit：`fc68a47`（`fix(ui): avoid duplicate useSidebar export`）
- 修正內容：移除 `src/components/ui/sidebar.tsx` 底部匯出清單中的 `useSidebar`，保留函式本身的匯出，避免重複匯出衝突
- 重新部署後驗收成功（使用者回報「驗收成功」）

### 7.6 今日驗收要點（實際觀察）

- LMS 任意頁：React 左欄自動展開，標題顯示 **1UP LMS**
- CAT Team 模組：React 左欄自動收合、iframe 內 CAT 側欄展開
- CAT Team 編輯器：兩邊側欄收合
- 編輯器原文格：
  - 命中 TB 詞彙顯示淡標示 + 上標 1–9
  - 副行顯示 `N 原文→譯文`（可換行）
  - 右欄分頁切換後，上標與副行會同步更新

---

## 8. 下一波調整（待實作規劃）

驗收後追加的體驗改善需求（已定案，待下一次開發排程落地）：

1. **上標數字改為 CSS `::after`**：避免使用者複製/搜尋時把上標數字一併複製到剪貼簿（例如避免 `Settings1`）。
2. **標示更顯眼**：只加深底線顏色（背景不變）。
3. **缺漏術語紅色提示**：若原文命中 TB 但譯文未出現對應譯法，右欄 TB 列與原文格副行該項以淡紅提示；已包含者維持正常用色。
4. **Ctrl+, / Ctrl+. 換頁快捷鍵隨時可用**：目前在編輯格內會被擋掉，需改成比照 Ctrl+Alt+←/→，不論焦點位置都能換頁。

對應的實作計畫已補在 [`docs/CAT_TB_INLINE_SUPERSCRIPT_IMPLEMENTATION_PLAN.md`](CAT_TB_INLINE_SUPERSCRIPT_IMPLEMENTATION_PLAN.md) §8。

---

## 9. 2026-05-09 第二波：上標位置、術語順序、多上標與「同字串一條底線」（驗收已通過）

本節記錄同一日後續迭代：從使用者回報「上標卡在拆開的單字中間」「右欄術語順序不像閱讀順序」「同一詞多筆 TB 只看到一個上標」到最終驗收通過的過程與 commit 對照。**譯文欄刻意不做** TB 上標／底線（僅原文格）。

### 9.1 問題與根因（摘要）

| 現象 | 根因（白話） |
|------|----------------|
| 上標落在 `wreakin²g` 這類「字中間」 | 原文 DOM 常被 `buildTaggedHtml` 等拆成**多個相鄰 `Text` 節點**；舊邏輯只在**當前節點**內用 `\w` 延伸到字尾，錨點插在首段節點結尾。 |
| 右欄 TB 順序與句中閱讀順序不一致 | `renderLiveTmMatches` 依 `ActiveTbTerms` 迭代順序 `push` TB，未依句段原文**首次出現位置**排序。 |
| 同一詞兩筆 TB（列號 2、3）底下藥丸都有，原文卻只有一個上標（第一波「多上標」仍不足） | `picked` 用 `cursor` 做不重疊時，**第二筆與第一筆完全相同的 `(start,end)`** 會被 `r.start < cursor` 整段丟棄，根本進不了後續錨點合併邏輯。 |
| Vercel 部署列表看不到某個短碼，以為沒推到 | 線上顯示的是**該次 build 的 HEAD commit**；祖先 commit 的改動已包進較新的部署，不會為每一個祖先各列一列標題。 |

### 9.2 實作要點與相關 commit（由舊到新）

1. **`5fb4dad`** — 先將上標改到「單字尾端」錨點（仍僅限單一 `Text` 節點內延伸）。
2. **`bac463f`** — **跨節點字尾**：新增 `pullCrossNodeWordSuffix`，在替換節點前從後續**僅 `TEXT_NODE` 兄弟**拉出連續 `\w`（不跨元素／tag pill），插入錨點前；同 commit 抽出共用 **`findTermHitRangesInPlainText`**，並在 **`renderLiveTmMatches`** 將命中 TB 依 **`seg.sourceText` trim 後首次命中 offset** 排序（同起點則較長原文在前）；TM／Fragment 區塊與大類排序不變。
3. **`080afd3`** — 同一 `wordEnd` 以 `Map` 陣列累積多個 `{n,missing}`，**多個** `tb-inline-sup-anchor`；`suffixBefore` 僅掛在該位置**第一個**錨點。樣式上為相鄰上標略縮間距（`style.css`）。
4. **`b68611d`** — 先依 **`${start},${end}`** 合併「完全相同字範圍」的多筆 TB 為 **`{ start, end, items[] }`**：**一條** `tb-inline-term` 底線、`items` 內每個列號各一個上標；再對合併後的 `spans` 做原本的不重疊排序，以處理**不同**範圍重疊（長詞優先等）。

以上皆在 **`cat-tool/app.js`／`cat-tool/style.css`** 完成，並依專案慣例 **`npm run sync:cat`** 同步 **`public/cat/`** 後一併提交。

### 9.3 產品邊界（本輪未改、後續若要需另開需求）

- **副行藥丸**仍依 `tbList` 與 `termMatches(rt.textContent, …)`；**右欄比對**仍依 `seg.sourceText`（trim）建 `matches`；兩者基準不同時，極少數列可能與「肉眼以格內為準」的感受不一致。
- **未開精確比對**的 TB（`wholeWord: false`）仍可能出現子字串命中（例如 `lat` 在 `humiliation`）；屬術語比對規則，非上標幾何修正範圍。
- **列號含 TM**：右欄第 1～9 筆含 TM 時，第一個 TB 不一定是「¹」；與 Ctrl+1～9 對齊之既有策略不變。

### 9.4 驗收（使用者已確認）

- 拆字 DOM 下，上標落在**完整英文單字視覺尾端**。
- 多筆 TB 打在**同一字串、同一範圍**：**一條底線**，字尾**多個上標**與右欄列號一致。
- 重新整理／部署後行為符合預期（必要時硬重新整理排除快取）。
- **文件索引**：本檔 §9；[`docs/CODEMAP.md`](CODEMAP.md)（CAT 內嵌表新增「原文格 TB 內嵌提示」列）；[`docs/CAT_TB_INLINE_SUPERSCRIPT_IMPLEMENTATION_PLAN.md`](CAT_TB_INLINE_SUPERSCRIPT_IMPLEMENTATION_PLAN.md) §9；根目錄 [`AGENTS.md`](../AGENTS.md) 深文件索引。

---

## §10 Phase 2.3n — virt 捲動時 TB 不閃（2026-07-01）

### 10.1 現象

大檔 virt 連續捲動時，使用中句段原文 TB 底線／上標消失，停下後才恢復（§3.10 項 7）。

### 10.2 根因

`CatVirtGrid.renderWindow` → `replaceChildren` 清掉 `.tb-inline-*`；`onBeforeRender` 執行 `resetGridRowUiTracking()`；`decorateTbInlineHintsForActiveRow` 依 `.active-row`，但 `onAfterRender` 時 active 尚未還原。

### 10.3 修正（方案 A）

| 觸點 | 作法 |
|------|------|
| `getActiveSegIdForTbDecor()` | `lastEditedRowIdx` → `_preserveEditingAcrossVirtRender` → `_activeGridRowEl` |
| `decorateTbInlineHintsForSegId(segId)` | 以 segId 取列，取代僅查 `.active-row` |
| `buildGridDataRow` 結尾 | active 列掛載且已有 `currentTmMatches` 時立即 decorate |
| `onAfterRender` | 先 `syncActiveRowAfterVirtRender`，再 `decorateTbInlineHintsForSegId` |

### 10.4 邊界

使用中列**完全捲出 virt 窗口**（DOM 未掛載）仍無法顯示 TB。

### 10.5 驗收

1. 大檔（virt 啟用）選有 TB 的句段。
2. 連續滚轮 3–5 秒（句段仍在視窗內）。
3. 原文 TB 底線／上標全程可見，不停頓才出現。

**狀態**：**產品驗收通過**（2026-07-01；對應主紀錄 [`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §3.15 項 50）。

### 10.6 Hotfix — `segId` 重複宣告（`f3e4365`）

`5e9925a` 引入 `decorateTbInlineHintsForSegId(segId)` 時，函式內殘留 `const segId = …` 與參數同名，導致整支 `app.js` SyntaxError、CAT 卡在「載入中…」。`f3e4365` 刪除內層宣告，改以參數查句段。驗收 2.3n 項 50 前須確認主控台無語法錯。詳見主紀錄 §3.16。
