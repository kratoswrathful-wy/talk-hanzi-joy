狀態：**有條件核可（工單已生效）**；**暫不放行實作**（2026-07-06，驗收方 Fable 5）

**日期**：2026-07-06  
**上層規格**：[`CAT_DIFF_V2_TB_MATCH_V2_PLAN_2026-07.md`](./CAT_DIFF_V2_TB_MATCH_V2_PLAN_2026-07.md)  
**前置工項**：**ENG-P1** 已驗收併入 `main`（merge `bf879ced`，2026-07-06）

> **工單核可 ≠ 放行開工**：本檔範圍與驗收條件已核可；**ENG-P2 實作分支**仍須待 B→C→D 併入 `main`、波次一 `sync:cat` 收尾後，由驗收方**另明示放行**才可開 `feature/cat-diff-tb-eng-p2-tm-utils`。

---

## 1. 摘要

將 **CAT 比對欄**「追蹤修訂」三列 stack 與 **比對表 footer**「更新紀錄」譯文 diff，由 `tm-utils.js` 內建字元級 LCS 改為委派 **`window.CatDiffEngine`**（readable diff **預設**）。

本工項**僅**接線 `tm-utils.js` + `index.html` script 載入 + 必要時 `style.css`；**不**動 Phase C、**不**動 `app.js`、**不** sync `public/cat`。

---

## 2. 放行條件（實作前必達）

| # | 條件 | 說明 |
|---|------|------|
| G1 | **ENG-P1 已在 main** | `cat-text-tokenizer.js`、`cat-diff-engine.js` 與測試已存在 |
| G2 | **波次一并行分支已清** | `feature/cat-disable-weighted-word-count`（B）→ C → D 依序併入 `main` |
| G3 | **波次一收尾 sync:cat 已在 main 完成** | 由波次收尾負責；本工項**不**執行 sync |
| G4 | **驗收方明示放行 ENG-P2 實作** | 工單核可後仍須**另一次**放行才可開實作分支 |
| G5 | **本工單檔已併入 main** | 純 docs PR 留檔後工單正式生效（見 §11） |

**暫不放行原因（2026-07-06）**：ENG-P2 與分支 **B** 皆修改 `cat-tool/index.html` script 區，須待 B 併入後自**屆時最新 main** 開分支，避免衝突。

---

## 3. 分支與 commit

| 項目 | 值 |
|------|-----|
| **分支名** | `feature/cat-diff-tb-eng-p2-tm-utils` |
| **基底** | 放行當下之 `origin/main`（`git fetch` 後 `git checkout -b … origin/main`） |
| **commit 前綴** | `[ENG-P2]` |
| **建議 merge 方式** | 慢軌：PR → 驗收方驗證 → merge（CAT 核心管線接線） |

---

## 4. 允許修改的檔案

| 檔案 | 允許範圍 |
|------|----------|
| **`cat-tool/js/tm-utils.js`** | `diffCharsCurrentVsTm`、`buildTmTrackChangeStackHtml`、`buildTmTargetRevisionDiffHtml` 及為接線所需之最小內部 helper；**不得**改 `levenshtein`／`calculateSimilarity` |
| **`cat-tool/index.html`** | **僅** `tm-utils.js` 之前的 `<script>` 載入區：新增 tokenizer + diff-engine；載入方式見 §6.1 |
| **`cat-tool/style.css`** | **僅新增** `.cat-diff-fallback-banner`、`.cat-diff-fallback-old`、`.cat-diff-fallback-new`（若 fallback UI 啟用）；**尽量不修改**既有 `.tm-diff-*` 色票 |
| **`cat-tool/js/tm-utils.diff-engine.test.mjs`** | 針對 `buildTm*` 輸出 HTML 語意之最小 vitest 回歸（**2026-07-06 Fable 5 預先核可**納入；純測試、不動產品接線邏輯） |

---

## 5. 禁止修改的檔案／行為

| 禁止 | 說明 |
|------|------|
| **`cat-tool/app.js`** | 含 `#catDiffModeLink`、`updateCatTrackPanelContent` 行為變更 → 留 **ENG-P3／後續** |
| **`cat-tool/js/rev-track*.js`** | Phase C 精細 diff checkbox → **ENG-P3** |
| **`cat-tool/js/tb-match-engine.js`** | TB 接線 → **ENG-P4+** |
| **`public/cat/**`** | 本工項不 sync |
| **`npm run sync:cat`** | 禁止執行 |
| **ENG-P1 引擎本體** | 除接線必要之 bugfix 外，不重寫 tokenizer／diff 演算法 |
| **rebase／merge 其他並行分支** | 僅 rebase `origin/main` |

---

## 6. 實作規格

### 6.1 `index.html` script 載入

在 `tm-utils.js` **之前**載入 `cat-text-tokenizer.js`、`cat-diff-engine.js`；**script 型態與 ENG-P1 既有 engine 檔案一致**，確保 `window.CatDiffEngine`（及 tokenizer 之 `globalThis` 掛載）可在 `tm-utils.js` 執行前取得。

**ENG-P1 現況（main@bf879ced，供實作時對照，工單不預先寫死 tag 屬性）**：

- 兩檔皆為 **ESM 原始碼**（含 `import`／`export`），並在載入完成後掛於 `globalThis.CatTextTokenizer`／`globalThis.CatDiffEngine`。
- ENG-P1 **未**改 `index.html`；實作 ENG-P2 時須**先讀**當下 main 上兩檔之實際格式，再決定 `<script>` 標籤（例如 classic 或 `type="module"`、是否 `defer`），**不得**在工單階段假設與檔案不符的載入方式。
- 若 B／C／D 已改動同區 script 區，rebase 後合併意圖，**不**覆寫其他功能腳本。

`tm-utils.js` 開頭可加一行防呆（允許範圍內）：

```javascript
if (!globalThis.CatDiffEngine) {
  console.error('[tm-utils] CatDiffEngine not loaded — check index.html script order');
}
```

### 6.2 `tm-utils.js` 接線

| 函式 | 行為 |
|------|------|
| **`diffCharsCurrentVsTm(textCurrent, textTm)`** | 委派 `CatDiffEngine.computeDiff(cur, tm, { mode: 'readable', semantics: 'current-vs-reference' })`；回傳格式維持 `{ type: 'equal'\|'delete'\|'insert', text }[]` 供既有呼叫端相容（`delete`＝僅目前句段有；`insert`＝僅 TM／舊側有） |
| **`buildTmTrackChangeStackHtml`** | 中列（row2）改以 `CatDiffEngine.renderDiffHtml(cur, tm, { mode: 'readable', semantics: 'current-vs-reference' })` 產生；維持三列 `.tm-track-stack` 結構；row1／row3 仍為純文字 |
| **`buildTmTargetRevisionDiffHtml`** | 同上 `renderDiffHtml`（參數：newTarget 為「目前」、oldTarget 為「舊」）；單行 HTML |
| **超長句** | 維持 `TM_DIFF_MAX_CHARS = 6000` 短路邏輯；可改為呼叫 engine 的 `maxTokens`／fallback，但行為不得劣於現況（超長仍顯示純文字，不卡死 UI） |
| **`levenshtein`／`calculateSimilarity`** | **零變更** |
| **window 匯出** | 維持 `window.buildTmTrackChangeStackHtml` 等既有別名 |

**預設模式**：本工項僅 **readable**；不實作 `localStorage`／char 模式切換（屬 ENG-P3 Phase C checkbox 與後續 CAT 面板連結）。

### 6.3 `style.css`（如需）

若 `renderDiffHtml` 回傳 `fallback: true`，新增區塊樣式（低調 banner + 上下對照列），不影響 `.tm-track-stack` 既有列高邏輯。

---

## 7. 測試與本機三關

實作完成、推送 PR 前：

```text
npm run test:cat          # 含新建 tm-utils 回歸（若新增）
npm run typecheck
npm run check:encoding
npm run lint              # 改動檔不得新增四項禁用手法
```

**四項禁用手法 grep**（僅針對本 PR diff 新增行）：`as unknown as`、`as any`、`@ts-expect-error`、`eslint-disable` → **0 處**。

**建議測試案例**（`cat-tool/js/tm-utils.diff-engine.test.mjs`，已納入允許清單）：

- 英文 `degraded` vs `degrade`：輸出含整詞標記，**非**僅 `ed` 字元級碎片（readable）
- `buildTmTrackChangeStackHtml`：含 `.tm-track-stack` 三列；中列含 `.tm-diff-cur-only`／`.tm-diff-tm-only`
- `buildTmTargetRevisionDiffHtml`：語意與中列一致
- `cur === tm`：無 diff span

---

## 8. 驗收條件（驗收方 Fable 5）

### 8.1 自動化

| ID | 條件 |
|----|------|
| T1 | PR CI：`typecheck`／`test`／`lint` 步驟 SUCCESS；Vercel preview SUCCESS |
| T2 | `npm run test:cat` 全綠（ENG-P1 39 項 + `tm-utils.diff-engine.test.mjs` 新增項） |
| T3 | PR diff **不含** `public/cat/**`、不含 `app.js`、不含 `rev-track*.js` |
| T4 | merge-tree 對放行當下 `main` 無未解衝突 |

### 8.2 行為（CAT 比對欄 — 慢軌人工／AI 抽查）

| ID | 步驟 | 通過條件 |
|----|------|----------|
| M1 | 開檔，右欄選一筆 TM／Fragment，原文與 TM 原文有英文詞形差異（如 degraded/degrade） | 「追蹤修訂」面板中列為 **readable** 詞級標記，非整詞切碎成單字元 |
| M2 | 同上，比對表 footer「更新紀錄」有 `targetUpdate` | 譯文 diff 使用相同 readable 規則與 `.tm-diff-*` class |
| M3 | 原文與 TM 完全相同 | 中列無多餘 delete/insert span |
| M4 | 超長句（>6000 字元級別） | 不卡死；fallback 為純文字或 engine fallback UI，不拋錯 |

### 8.3 迴歸邊界

| ID | 條件 |
|----|------|
| R1 | Phase C 追蹤修訂模式行為**與併入前相同**（本工項未改 `rev-track*`） |
| R2 | TM 相似度分數不受影響（`levenshtein` 路徑未改） |

---

## 9. 與後續工項邊界

| 工項 | 內容 | 本工項不做 |
|------|------|------------|
| **ENG-P3** | Phase C `#revTrackChkFineDiff`、`rev-track-diff.js` 統一、`char` 模式 | ✓ |
| **ENG-P4** | `app.js` TB `termMatches` wrapper | ✓ |
| **ENG-P5** | TB inline hints token ranges | ✓ |
| **ENG-P6** | surface form footer + 波次級 `sync:cat` + CODEMAP | ✓ |

---

## 10. 風險與注意

1. **index.html 衝突**：與 B／C／D 併行時只改 script 區；rebase 後確認 B 的腳本（如字數引擎）仍正常載入。
2. **script 載入順序**：須與 ENG-P1 engine 檔案實際暴露方式一致；實作前讀檔確認，避免 `CatDiffEngine` 未定義即執行 `tm-utils.js`。
3. **慢軌**：屬 CAT 核心管線接線，**不適用快軌**；merge 前須驗收方驗證。

---

## 11. 狀態欄（驗收方填寫）

| 欄位 | 值 |
|------|-----|
| 工單核可 | ☑ **有條件核可**（Fable 5，2026-07-06）；範圍與兩點補強均接受 |
| 測試檔 `tm-utils.diff-engine.test.mjs` | ☑ **預先核可**納入允許清單 |
| 工單生效 | ☐ 待本檔 docs-only PR 併入 `main` |
| 放行實作 | ☐ 待 B→C→D + 波次一 `sync:cat` + 驗收方另示放行 |
| 實作 PR 連結 | — |
| 實作 merge commit | — |

---

**起草**：ENG-P1 代理（2026-07-06）  
**核可**：驗收方 Fable 5（2026-07-06，有條件核可）
