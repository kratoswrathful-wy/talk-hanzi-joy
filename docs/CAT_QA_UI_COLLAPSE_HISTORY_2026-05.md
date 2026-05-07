# CAT：QA 介面折疊（檢查範圍）與右側資訊區收合 — 需求/開發/驗收紀錄（2026-05）

> 本文件目的：將「需求怎麼來、怎麼做、怎麼驗收」寫成可追溯紀錄，方便日後維運或回頭查找。

## 背景與需求緣起

在 CAT 編輯器右側面板中：

- **QA 分頁**的「檢查範圍」設定（含鎖定／句段範圍／目前篩選結果）常被視為「一段固定設定區」，希望能**像「檢查項目」一樣可展開/收合**，讓結果表可視高度更大。
- 右側面板底部的「後設資訊區」（`#livePanelFooter`）在某些情境下也會佔用垂直空間，希望可**一鍵收合/展開**。

## 需求定案（決策）

- **預設展開**：兩區塊都預設展開。
- **不記住狀態**：刷新頁面後回到預設展開（不寫入 localStorage/sessionStorage）。
- **QA 執行中鎖定**：跑 QA（`qaRunInProgress`）期間，「檢查範圍」折疊按鈕需 disabled（比照既有「檢查項目」折疊按鈕行為）。
- **實作手段**：採 `display:none` 收合容器，避免影響既有 checkbox/input 的 id 與邏輯；右下角資訊區收合時，同步隱藏拖曳條並避免拖曳事件進入。

## 實作落點（檔案與 DOM）

> 變更已透過 `npm run sync:cat` 同步到 `public/cat/`；請以 `cat-tool/` 為單一來源。

### 1) QA「檢查範圍」折疊

- **DOM**（`cat-tool/index.html`）：
  - 新增按鈕 `#btnQaCollapseScope`
  - 新增容器 `#qaScopeBody`（包住原 `.qa-options-bar`）
- **事件綁定**（`cat-tool/app.js`）：
  - click 切換 `#qaScopeBody` 的顯示/隱藏
  - 更新按鈕文案 `▾/▸ 檢查範圍`
- **鎖定行為**（`cat-tool/app.js`）：
  - 在 `setQaControlsLocked(locked)` 中，讓 `#btnQaCollapseScope` 在 QA 執行中 disabled

### 2) 右下角後設資訊區收合/展開

- **DOM**（`cat-tool/index.html`）：
  - 新增按鈕 `#btnToggleLiveFooter`（文案：收合資訊/展開資訊）
- **樣式**（`cat-tool/style.css`）：
  - 新增 `.editor-side-panel--live-footer-collapsed`，在收合狀態下：
    - `#livePanelFooter` 高度/邊框/padding 歸零並隱藏 overflow
    - `#catPanelResizerBottom` 隱藏（避免誤拖）
- **行為**（`cat-tool/app.js`）：
  - 點按 `#btnToggleLiveFooter` 切換 `.editor-side-panel--live-footer-collapsed`
  - 若已收合，`#catPanelResizerBottom` 的 `pointerdown` 直接 return（避免拖曳程式寫入高度）

## 驗收清單（已回報成功）

### QA 檢查範圍

1. 進入編輯器右側 **QA** 分頁，看到 **「▾ 檢查範圍」**按鈕；預設展開可看到「含鎖定／句段範圍／目前篩選結果」。
2. 點擊按鈕：整塊檢查範圍區塊收合；按鈕文案變 `▸ 檢查範圍`；再點一次可展開。
3. 點「▶ 開始 QA」後到 QA 執行中：**檢查範圍按鈕 disabled**（不可點）；QA 結束後恢復可點。

### 右下角後設資訊區

1. 右側欄底部資訊區預設展開可見。
2. 點「收合資訊」：底部資訊區消失（高度歸零），下方拖曳條一併隱藏；按鈕改為「展開資訊」。
3. 點「展開資訊」：資訊區恢復顯示；拖曳條恢復可用。
4. 重新整理頁面：回到預設展開。

## 版本/追溯

- 對應 commit：`0f68aeb`（`feat(cat): 右側資訊區與 QA 檢查範圍可收合`）

