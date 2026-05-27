# CAT UX 第一波 2605 — 實作計畫

> 本文件紀錄「自研工具問題 2605」清單中，第一波 UX/UI 改善（共 7 項）的規格、程式觸點與驗收要點。
> 所有修改僅在 `cat-tool/` 原始碼進行，完成後以 `npm run sync:cat` 同步至 `public/cat/`。

---

## 修改清單

### #25 — Enter/Esc 快速確認簡單輸入框

**問題**：`openCatPromptModal`（泛用輸入框）與 `openNamingModal`（命名框）只有 Esc 關閉，Enter 沒有作用，需手動點按鈕確認。

**觸點**：
- `cat-tool/app.js` `openCatPromptModal` 的 `onKey` 函式（約第 284 行）：加入 `Enter → onOk()`
- `cat-tool/app.js` `namingModalInput` 的 `keydown` 事件（`btnNamingModalConfirm` 事件綁定附近）：加入 `Enter → btnNamingModalConfirm.click()`

---

### #6/18 — 游標位置卡片（真游標版）點擊捲動修正

**問題**：`realTipEl` 的 click handler 在點擊時 `document.activeElement` 已切換為 tip 本身，導致找不到目標 `.grid-textarea`，點擊後不捲動。

**觸點**：
- `cat-tool/js/cat-fake-caret.js` `showRealCaretTipIfNeeded` 函式（約第 90–120 行）

**修法（Wave 1，已推送）**：每次顯示 tip 時，把當前 `segId` 存入 `tip.dataset.catRealTipSegId`；click handler 從 dataset 找列；`style.css` 移除 `.cat-fake-caret-scroll-tip` 的 `pointer-events: none`。

**補修（A+B，需點兩次 → 一鍵捲動）**：Wave 1 後仍可能因點標籤觸發譯文格 blur，真游標提示先被假游標提示取代，第一下像只換文案。改法見專項文件：

- [`docs/CAT_FAKE_CARET_REAL_TIP_ONE_CLICK_PLAN.md`](./CAT_FAKE_CARET_REAL_TIP_ONE_CLICK_PLAN.md)
- **A**：`realTipEl` 改 `mousedown` + `preventDefault()`
- **B**：`navigateToSegmentBySegId` 共用；假游標提示／`restoreOrShowFake` 同源

---

### #12 — 移除 closing tag pill 前置空格（tag-e-pad）

**問題**：closing tag pill 前方有 `<span class="tag-e-pad">&nbsp;&nbsp;</span>`（兩個不換行空格），使用者要求移除。

**觸點**：
- `cat-tool/app.js` `buildTagSpan`（約第 14717–14718 行）
- `cat-tool/app.js` `buildTaggedHtml`（約第 18137–18138 行）
- `cat-tool/app.js` `htmlForTmPlainWithPlaceholders`（約第 18167 行）
- `cat-tool/style.css`：`.tag-e-pad` 相關 CSS 可一併移除（class 不再插入後無副作用）

---

### #32 — 「取代這個」一次取代兩筆修正

**問題**（兩層）：

1. **取代錯目標**：fallback 邏輯呼叫 `getSearchNavAnchorCollapsed('next')`，錨點落在 active mark **尾端之後**，`findNextTargetMatchIndexFromAnchor` 因此找到 N+1 而非目前高亮的 N，導致 N 未被取代、N+1 被消掉、游標跳到 N+2。
2. **取代後跳格**：以整格尾端當錨點找下一筆，若同格後面還有命中全數被跳過。

**觸點**：`cat-tool/app.js` `performReplaceThis`（約第 17174–17231 行）

**修法**：
- 取代前：`findTargetSearchMatchUnderSelection()` 返回 null 時，優先直接用 `sfActiveMatchIdx`（已高亮且 `fieldKey === 'target'`），只在 `sfActiveMatchIdx < 0` 或不是 target 才 fallback 至 anchor-next
- 取代後：改用 `findNextTargetMatchIndex(idx)` 取代「格尾錨點」，準確跳到被取代筆的下一個 target match

---

### #28 — Tag 操作 / 套用 CAT 欄結果觸發「未確認」狀態

**問題**：以下三種操作修改譯文後，若句段原本已確認，UI 不會自動變未確認（狀態圖示維持已確認，但內容已改）。
1. F8 插入 tag（`insertNextMissingTag`）
2. 點擊原文 tag 插入（`onSourceTagInsertClick`）
3. Ctrl+1~9 套用 TB / Fragment（`handleCatResultApply`，type ≠ TM）

**觸點**：`cat-tool/app.js`

**修法**：在各操作完成後（`applyUpdateSegmentTarget` 呼叫後），若 `seg.status === 'confirmed'` 則呼叫 `unconfirmSegmentVisualAfterReplace(seg, rowIdx)`。

---

### #19 — AI 批次「候選條目池」移除專案 AI 指示分區

**問題**：AI 批次 Modal 中，「專案 AI 指示」出現兩次：一次在「管理區」（輸入列＋enable checkbox），一次在「候選條目池」複製一份 checkbox。使用者要求只保留管理區，由管理區的 enable checkbox 直接決定是否進 prompt。

**觸點**：
- `cat-tool/index.html` 第 2477 行：移除 `<div id="aiBatchCandidatePoolProjectAi">` 那行
- `cat-tool/app.js` `_initAiBatchCandidatePool`：移除對 `projectAiEl` 的取用與清空邏輯
- `cat-tool/app.js` `_renderAiBatchCandidatePool`：移除 `projectAiEl` 相關渲染、事件綁定與 `_poolSumChars` 計算
- `cat-tool/app.js` `_syncAiBatchPoolInstructionKeys`：移除 `sync(__aiBatchPool.projectAi, ...)` 那行
- `cat-tool/app.js` `_buildAiOptions`（約第 31213–31219 行）：`projectBodies` 改為直接用 `row.enabled !== false`，不查 `poolNorm.projectAi`
- `cat-tool/app.js` `_renderAiBatchProjectInstructions`（約第 30116 行）：tooltip 移除「與候選條目池勾選分開」說明

---

### #1/13 — AI 批次「提示語開頭」改為以專案為單位儲存（Dexie）

**問題**：`aiBatchIntroduction` textarea 的值存在 `localStorage`（全帳號共用），切換專案不會跟著換。

**觸點**：
- `cat-tool/db.js` `saveAiProjectSettings`（約第 1453 行）：schema 預設加 `batchIntroduction: ''`，merge 時保留既有值
- `cat-tool/app.js` `openAiBatchModal`（約第 30408 行）：載入時改讀 `(await DBService.getAiProjectSettings(currentProjectId))?.batchIntroduction ?? ''`；若 DB 空且 localStorage 有舊值，一次性遷移後清 localStorage
- `cat-tool/app.js` `introEl.oninput`：改為 debounce 呼叫 `DBService.saveAiProjectSettings(currentProjectId, { batchIntroduction: introEl.value })`
- `cat-tool/app.js` `_buildAiOptions`（約第 31272–31277 行）：保留 DOM 讀取邏輯，移除 `localStorage` fallback
- **注意**：本次不新增 Supabase migration（Team 模式暫不同步此欄位，下一波再處理）

---

## 執行後必做

1. `npm run sync:cat`（同步 `cat-tool/` → `public/cat/`）
2. 一次提交所有變更（`cat-tool/**` + `public/cat/**` + `docs/CAT_UIUX_2605_WAVE1_PLAN.md`）並推送
