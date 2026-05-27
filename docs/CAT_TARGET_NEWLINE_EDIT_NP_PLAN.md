# CAT 譯文欄換行編輯補修 — tag 旁刪字與 NP 模式可刪換行

> **建立**：2026-05-27  
> **前置**：[`bug-report_contenteditable-newline-artifacts.md`](./bug-report_contenteditable-newline-artifacts.md)（2026-05-02，`c4f865d` 幽靈 BR、Shift+Enter、`data-cat-nl`、blur rebuild）  
> **程式**：[`cat-tool/app.js`](../cat-tool/app.js)；同步 `npm run sync:cat` → `public/cat/`

---

## 問題摘要（白話）

| # | 現象 | 使用者操作 |
|---|------|------------|
| **P1** | 整行只有 **tag + 旁邊一個字**，用 Del／Backspace 刪掉那個字後，**自動多出一個換行**（¶ 模式下可見 ↵） | 例：`[1]d` 刪 `d` |
| **P2** | **換行（↵）无法用 Del／Backspace 刪掉**，或刪了又出現 | 開啟「顯示非列印字元」¶ 時最常見 |

兩者相關：P1 把錯誤 `\n` 寫進資料；P2 讓既有／錯誤換行難以用鍵盤清除。

---

## 根因

### P1 — tag 後刪字誤存換行

- Blink 在 **tag 晶片（`.rt-tag`）** 旁常插入占位 `<br>`。
- **`isGhostBr`** 目前僅將「根節點唯一子節點 br」「根下空 div 內唯一 br」視為幽靈。
- **tag 後的占位 br** 不符合 → `extractTextFromEditor` 輸出 `\n` → `buildTaggedHtml` 持久化 → NP 模式顯示 ↵。

### P2 — NP 模式只刪 ↵ 裝飾、不刪語意換行

- **`applyNonPrintMarkers`**：在 `<br>` 前插入 `<span class="non-print-marker">↵</span>`（`contentEditable=false`）。
- 譯文格 **`keydown`**（show-non-print）：Backspace／Delete 遇 `isNpOverlayMarker` 時常 **只 `remove()` 該 span**，**保留** `<br class="np-br">` 或 `br[data-cat-nl="1"]`。
- `extract` 仍含 `\n` → `refreshNonPrintMarkers` 重畫 ↵ → **像刪不掉**。

此邏輯為 2026-05 防「亂長換行」時加入；在 P1 已收斂後，**語意換行（Shift+Enter、`data-cat-nl`）應可正常刪除**。

---

## 定案行為

| 項目 | 行為 |
|------|------|
| Shift+Enter 換行 | 仍為唯一鍵盤插入路徑；`data-cat-nl="1"`；**可**用 Backspace／Delete 刪除（¶ 開啟時走 plain 模型） |
| 幽靈 br（含 tag 後占位） | **不**寫入 `targetText` 的 `\n` |
| 單按 Enter | 仍不插入換行（維持 `c4f865d`） |
| 純文字貼上換行→空格 | 不變 |

---

## 實作方案

### Fix 1 — `tryDeleteSemanticNewlineAtCaret`（P2）

在譯文格 `keydown`、**show-non-print** 且 Backspace／Delete 時：

1. `off = getNpCaretOffset(editor)`；`plain = extractTextFromEditor(editor)`  
2. Backspace：若 `off > 0 && plain[off-1] === '\n'` → 從 plain 移除該字元  
3. Delete：若 `off < plain.length && plain[off] === '\n'` → 同上  
4. `setEditorHtml(buildTaggedHtml(...))`、`refreshNonPrintMarkers`、`setNpCaretOffset`、觸發 `input`  
5. **優先於**「只刪 overlay span」的舊分支執行；成功則 `return`

與既有「選取刪除後 extract rebuild」（約 19794 行）同一套 **plain 線性模型**。

### Fix 2 — 擴充 `isGhostBr`（P1）

在既有規則之後，若 br **不是** `data-cat-nl="1"`，且前方（略過空白文字、`non-print-marker` overlay）**最後有意義節點為 `.rt-tag`**，且 br **之後**無使用者文字 → 視為幽靈，extract 不輸出 `\n`。

符號：`isGhostBrAfterRtTag(br, root)` 或內聯於 `isGhostBr`。

---

## 觸點

| 符號 | 檔案 |
|------|------|
| `isGhostBr` | `cat-tool/app.js` |
| `tryDeleteSemanticNewlineAtCaret` | `cat-tool/app.js`（譯文 `.grid-textarea` keydown） |
| `extractSubtree` / `getRtEditorTextSegmentsForHighlightMap` | 間接依 `isGhostBr`，需回歸搜尋高亮 |

---

## 驗收清單

1. `[1]d` 刪 `d`（¶ 開）→ 不出現新 ↵；失焦後 `target_text` 無多餘 `\n`。  
2. Shift+Enter 插入換行 → Backspace 刪除 → ↵ 與換行皆消失；重開檔仍在測**無**該換行。  
3. 同上，Delete 從換行前刪除。  
4. 關閉 ¶：Shift+Enter 換行可用瀏覽器鍵刪（或 extract 一致）。  
5. 含 tag 長句輸入、多次 blur（沿用 `bug-report_contenteditable-newline-artifacts.md` §2.6 案例 2）。  
6. 搜尋高亮：target 欄位無「字元索引長度與內文不符」警告。

---

## 實作紀錄

| 日期 | commit | 說明 |
|------|--------|------|
| 2026-05-27 | （待填） | Fix 1 + Fix 2；本文件建立 |
