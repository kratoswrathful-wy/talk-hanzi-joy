# 真游標提示一鍵捲動（A+B）

> 補修 Wave 1 **#6/18**：真游標捲動提示「游標位於第 N 號句段」須**點一下**即捲至該列，不得先變成假游標文案再點第二次。  
> 程式觸點：[`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)；完成後 `npm run sync:cat`。

**維護邊界（2026-06）**：假游標／捲動提示 DOM 掛載於 `#editorGrid` 內 `#catEditorChromeLayer`（層內 `position: absolute` 座標），不再 append 至 `document.body`。捲動監聽、modal 互斥與匯出 overlay 行為以 [`CAT_EDITOR_OVERLAY_FAKE_CARET_EXPORT_2026-06.md`](./CAT_EDITOR_OVERLAY_FAKE_CARET_EXPORT_2026-06.md) §2.4–§2.6 為準；本檔 §A+B 點擊／`navigateToSegmentBySegId` 邏輯不變。

---

## 問題現象

- 標籤顯示「**游標位於第 N 號句段（點此捲至該列）**」時，使用者仍在該句譯文格內打字，只是列被捲出 `#editorGrid` 可視區。
- **第一下**點標籤：文案常變成「**暫存游標位於第 N 號句段…**」，畫面未捲到該列。
- **第二下**點假游標版標籤：才會捲動並還原游標。

## 根因

1. **兩個 DOM 元素**：`realTipEl`（真游標）與 `fakeTipEl`（暫存／假游標），文案與點擊路徑不同。
2. **點擊真游標標籤時**，譯文格常先 **blur**（失焦）：
   - [`cat-tool/app.js`](../cat-tool/app.js) `focusout`（約 3048–3051）→ `hideCatRealCaretScrollTip()`
   - 譯文格 `blur`（約 19510–19603）→ `showCatFakeCaretFromSaved()` → 顯示假游標提示
3. 真游標舊版 **`click`** 與 blur **競態**：第一下未完成穩定捲動，使用者看到的是假游標文案。

Wave 1 已修正 `pointer-events` 與 `dataset.catRealTipSegId` 找列，**未解決** blur 時序問題。

## 策略

| 策略 | 內容 |
|------|------|
| **A** | 真游標提示改 **`mousedown` + `preventDefault()`**（可加 `stopPropagation`），減少點標籤時譯文格先失焦。 |
| **B** | 新增 **`navigateToSegmentBySegId(segId)`**，真／假提示共用；優先 `saveFromSelection` + 既有 **`restore()`**（捲列 → focus → 還原 Range）。 |

假游標提示點擊改走同一導航路徑（`restoreOrShowFake` 內呼叫）。

## 程式觸點

| 檔案 | 變更 |
|------|------|
| `cat-tool/js/cat-fake-caret.js` | `navigateToSegmentBySegId`；`realTipEl` mousedown；`fakeTipEl`／`restoreOrShowFake` 重構 |
| `public/cat/js/cat-fake-caret.js` | `npm run sync:cat` |

**預設不改** `app.js`。若驗收仍閃假游標文案，再評估 `_tipNavInProgress` 旗標略過 blur 內 `showCatFakeCaretFromSaved()`。

## 驗收（白話）

1. 在第 N 句譯文格內點一下，再捲動使該列完全在畫面外。
2. 出現「游標位於第 N 號句段」藍色提示。
3. **只點一下**提示 → 平滑捲到第 N 列、焦點回該格、游標位置不變；**文案不應先變「暫存游標」**。
4. 點到別處失焦後，若出現「暫存游標」提示 → **點一下**亦應捲到該列（與 Ctrl+Alt+↓ 一致）。
5. 捲動後游標回到可視區，真游標提示應自動消失。

## 相關文件

- [CAT_UIUX_2605_WAVE1_PLAN.md](./CAT_UIUX_2605_WAVE1_PLAN.md) §#6/18 補修
- [CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md](./CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md) §3.8
