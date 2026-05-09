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

