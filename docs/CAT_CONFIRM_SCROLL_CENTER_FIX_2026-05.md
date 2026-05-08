# CAT：確認跳行「置中」被焦點捲動蓋掉 — 修正規劃（2026-05）

> 本文件目的：將「問題症狀、調查過程、根因、方案取捨、實作落點、驗收方式」寫成可追溯紀錄，方便日後維運或回頭查找。

---

## 背景與需求緣起

- **需求**：在編輯器中按下「確認並跳到下一句」後，若設定為「置中」，則**每次**跳到新句段都應將新焦點句段**置中顯示**，避免使用者需手動調整視野。
- **現況**：UI 設定已顯示且 localStorage 已寫入 `catToolAfterConfirmScrollBlock="center"`，但實際畫面顯示多數情況**未置中**（更像「僅捲到可見」）。

---

## 復現方式（最小步驟）

1. 進入 CAT 編輯器（team / viewEditor）。
2. 於設定中選擇「確認跳行後置中目標列（center）」並按「套用並關閉」。
3. 在任一句段譯文格按 **Ctrl+Enter** 進行確認並跳到下一句。
4. 觀察跳到的新焦點句段是否置中。

---

## 調查過程（摘要）

### 1) 先確認設定已生效（localStorage）

在 DevTools Console（**需在 CAT iframe 內**）檢查：

```js
localStorage.getItem('catToolAfterConfirmScrollBlock')
// => "center"
```

結果：設定確實為 `center`，排除「設定未寫入／UI 未套用」。

### 2) 量化「是否置中」（以 bounding box 偏移判斷）

在 DevTools Console（CAT iframe 內）檢查焦點列中心與視窗中心偏移：

```js
(() => {
  const grid = document.getElementById('editorGrid');
  const row = document.querySelector('.grid-data-row.active-row') || document.activeElement?.closest?.('.grid-data-row');
  if (!grid || !row) return { ok: false, reason: 'no grid/row' };
  const gb = grid.getBoundingClientRect();
  const rb = row.getBoundingClientRect();
  return {
    ok: true,
    rowCenterDeltaPx: Math.round(((rb.top + rb.bottom) / 2) - ((gb.top + gb.bottom) / 2)),
    rowTop: Math.round(rb.top),
    rowBottom: Math.round(rb.bottom),
    gridTop: Math.round(gb.top),
    gridBottom: Math.round(gb.bottom),
  };
})()
```

實測輸出（案例之一）：

- `rowCenterDeltaPx = 62`（理想應接近 0，通常希望落在 ±5~10px）

結論：置中並未可靠生效。

### 3) 重要前置：Console 必須在 iframe 內

CAT 在外層頁面以 `<iframe src="/cat/index.html?...">` 方式載入；若 Console 停留在 `top` 外層頁面會觀察不到 `#editorGrid/#gridBody`，造成 `hasRows=0` 的假結論。需切換 DevTools 的 target/frame 到 `/cat/index.html?...`。

---

## 根因推論（高可信）

目前 `cat-tool/app.js` 的跳焦點流程（概念）為：

1. 對目標列呼叫 `row.scrollIntoView({ block: 'center' })`
2. 對該列可編輯區呼叫 `focus()`

但在 contenteditable / textarea-like 元件上，`focus()` 常會觸發瀏覽器內建的「確保游標可見」捲動（多為 nearest/最小捲動），**可能覆蓋掉**剛才的置中捲動，使最後停留位置偏離中心。

此現象與「設定已是 center，但行為像 nearest」一致，且與 `rowCenterDeltaPx` 非零的量測吻合。

---

## 方案決策

### 採用方案（建議）

在「置中模式」下，改用「避免 focus 造成捲動 + focus 後再由程式置中」的順序：

1. `ed.focus({ preventScroll: true })`（避免瀏覽器自行捲動）
2. `requestAnimationFrame(() => row.scrollIntoView({ behavior, block: 'center' }))`（以程式為最終捲動結果）

並把 editor selector 鎖定為譯文欄，避免抓到非譯文或不可編輯的 `.grid-textarea`：

- `row.querySelector('.col-target .grid-textarea')`

### 未採用／備援

- 僅把 `scrollIntoView(center)` 放在 focus 之後（不 preventScroll）：仍可能被其他流程（selection/caret 修正）再捲動，穩定性較差。
- 全面取消 smooth：不解決「不置中」本質問題，僅改變動畫體感。

---

## 實作落點（預計）

> 單一來源仍為 `cat-tool/`；變更後以 `npm run sync:cat` 同步至 `public/cat/`。

### 修改檔案

- [`cat-tool/app.js`](cat-tool/app.js)（同步副本：[`public/cat/app.js`](public/cat/app.js)）

### 主要修改點

- `focusTargetEditorAtSegmentIndex(...)`
  - 固定抓譯文欄 editor：`.col-target .grid-textarea`
  - `focus({ preventScroll: true })`
  - 於下一 frame 執行 `row.scrollIntoView({ block: 'center' })`

---

## 驗收清單（預計）

1. 設定 `catToolAfterConfirmScrollBlock="center"`。
2. 於任一句按 Ctrl+Enter 跳到下一句後，畫面應將新焦點句段置中（多次重複皆一致）。
3. 以 Console 量測：`rowCenterDeltaPx` 應接近 0（建議門檻：\(|rowCenterDeltaPx| <= 10\)）。
4. 切換至「僅於畫面底部捲動（nearest）」後，行為維持原先「只在需要時捲動到可見」不受影響。

