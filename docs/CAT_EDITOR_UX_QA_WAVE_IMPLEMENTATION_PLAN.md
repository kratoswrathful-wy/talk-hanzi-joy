# CAT 編輯器／QA 驗收波次：實作規劃（未實作）

> **狀態**：僅規劃與驗收對照；**尚未寫程式**。實作完成後應更新本檔狀態、跑 `npm run sync:cat` 並依 `AGENTS.md` 提交 `cat-tool` 與 `public/cat`。  
> **範圍**：內嵌 CAT（`cat-tool/` → `public/cat/`），不含 React `src/` 主站（除非另註明）。

---

## 1. 目的

整理驗收後待辦：介面調整、假游標、QA Tag／摘要、篩選群組卡片文案、AI 批次範圍 UI、QA 分頁選項列、**QA 結果表多選與右鍵批次忽略**；並納入 **右欄快捷說明列（全分頁）**、**工具列「跳至」圖示與非 `prompt` 輸入**、**編輯器／右欄可見按鈕之無延遲提示盤點**、**真／暫存游標提示：點擊後捲至該句段列並還原焦點**；以及 **編輯器內切換顯示句段列時一律「直接顯示目標列」**（見 **§3.12**）。方便分項實作、驗收與對 `CODEMAP` 查檔。

---

## 2. 已定案（產品／規則）

| 項目 | 定案內容 |
|------|-----------|
| 篩選條件摘要 | 群組卡片、QA「當時篩選結果」等：**未特別設定的屬性不列出**（例：無 TM 條件則不出現「翻譯記憶相符度：無」；**「句段狀態：無」亦不出現**）。 |
| QA Tag | **保守作法**：僅將「來源已定義／可對齊之 tag 編號」納入必檢；避免把譯文裡一般 `{2024}` 當 tag。**必檢清單須算齊**：`sourceTags` 不足時須併用原文 `{N}`／`{/N}` 等，避免漏報。並需 **順序** 與 **成對開關**（關閉不得早於開啟）之檢查（細部規則實作時寫入程式註解或本節附錄）。 |
| 同說明批次忽略 | 「忽略所有同說明」＝本次結果中 **`info` 字串完全一致** 之列一併忽略。 |
| AI 批次「句段範圍」輸入框 | 「全文／目前篩選」時可維持**反灰但不 `disabled`**（或等價視覺）；使用者 **聚焦該輸入框時自動切到「指定範圍」**（無須先按分段按鈕）。 |
| QA 分頁「句段範圍」輸入框 | **未勾「句段範圍」**時：輸入框 **反灰且鎖定**（`disabled`）。 |
| 實作節奏 | 此波相關項**同一輪實作／驗收**（一次處理），避免半成品長留。 |
| 右欄快捷列 | **Ctrl+Alt+←／→** 與 **Ctrl+0** 各**獨立一行**；字級與「雙擊套用譯文」列一致（與 `.cat-dblclick-insert-bar` 約 **0.8rem** 對齊，勿再用過小字級如 0.72rem 壓縮快捷列）。**移除**該區「Ctrl+G：跳至句段」文字（改由工具列圖示＋`data-tip` 說明）。**CAT／TM 搜尋／新增術語／QA** 四個右欄分頁皆須看見同一套雙擊選項＋快捷列。**建議結構**：置於 `.panel-tabs` 下方之**單一共用橫條**（避免四份重複 HTML 與 `id` 衝突）；須與現有 `document.querySelectorAll('.cat-dblclick-insert-cb')`（`cat-tool/app.js` `initCatDblclickInsert`）同步勾選邏輯對齊。 |
| 跳至 | 編輯器工具列 **`#btnSortMenu` 與 `#btnCopySourceToTarget` 之間**新增**圖示按鈕**（與既有 `icon-btn` 風格一致）；`data-tip="跳到指定句段（Ctrl+G）"`（全形括號）。**Ctrl+G** 與該鈕共用 **`openJumpToSegmentPrompt`**（或重構後之入口）。**不得**使用 `window.prompt`；改用既有 **`openCatPromptModal`**（與專案其他對話一致）。表頭 `#` 欄內文字按鈕「跳至」（`populateGridHeaderTitleCell`）**移除或隱藏**，避免與工具列重複。 |
| 工具提示（無延遲） | 截圖與編輯器高頻區之按鈕（含 **開始 QA**、**TM 搜尋**、**原文複製到譯文／清除譯文**、**預先翻譯／匯出檔案**、**跳至**圖示等）應以 **`data-tip`** 接上 `initGlobalTooltip`（`mouseover` + `#wcProgressModeTooltip`）。**僅 `title` 者**仍為瀏覽器慢速提示——應盤點改為 `data-tip`，或（較大改動）擴充 `tipTextFor` 讀取 `title` 並抑制原生顯示（須評估無障礙與觸發一致性）。`.cat-dblclick-insert-bar` 上 **`title`** 宜改為 **`data-tip`** 掛在可 hover 之元素。詳見本檔 **§3.11** 與 [`docs/CAT_TOOLTIP_SYSTEM.md`](./CAT_TOOLTIP_SYSTEM.md)。 |
| 游標提示點擊 | **`restore()`**（或共用輔助函式）內：先對譯文列 **`scrollIntoView({ behavior: 'smooth', block: 'center' })`**，再 **`editor.focus()`** 與還原選區，避免畫面外失敗感。**`realTipEl`** 須補 **`click`**：捲列＋focus（與 `fakeTipEl` 行為對齊）；真游標提示文案可與暫存游標一致帶上「點此或按 … 前往」類說明（產品可微调用語）。 |
| 句段列捲動（直接顯示） | **CAT 內嵌編輯器**內，凡會「**切換目前要看的句段列**」的操作（例：搜尋／取代導覽、Ctrl+↑／↓ 上下句、跳至句段、點 QA 結果 `#`、篩選變更後定位、確認／傳播後焦點、點選格線列等），目標列須 **直接出現在可視區**（以 **`scrollIntoView`** 或等價、且錨定該 **`.grid-data-row`**／譯文格為準）。**禁止**依賴「先把外層或 `#editorGrid` **捲回頂端**再讓使用者自己找」的體驗；亦避免只 `focus()` 而不捲動導致列仍在畫外。實作時應 **grep** `scrollTop\s*=\s*0`、`scrollTo\(\s*0`、`scroll\(0` 及相關導覽函式，逐路徑驗收。 |

---

## 3. 工作項（實作時對照）

### 3.1 進階篩選面板版面（`#sfAdvancedPanel`）

- **句段狀態**：「鎖定／未鎖定」改為**第二列**（仍在同一區塊）。
- **三欄橫排**：句段狀態／TM%／句段編號範圍 — **不要**用過寬的 `1fr` 把欄位拉到兩端；改為依內容＋合理 `gap`（細節見 `cat-tool/style.css` `.sf-adv-cols`）。
- **檔案**：`cat-tool/index.html`、`cat-tool/style.css`。

### 3.2 暫存游標（假游標）失焦後跑到譯文開頭

- **根因**：譯文欄 `blur` 後 `rebuildTargetEditorFromExtractedPlain` 等會 **重建 DOM**，已儲存之 `Range` 失效，`show()` 退回到編輯區左上角。
- **方向**：失焦流程中在重建**前**快照**線性字元偏移**（與「全部取代」後還原游標之思路對齊）；重建後於新 DOM 建 `Range` 再 `setSavedCaret`／顯示假游標；並檢討 `blur` 開頭 `requestAnimationFrame(show)` 與 `await` 之順序，避免先畫再拆 DOM。
- **檔案**：`cat-tool/app.js`（譯文 `blur`）、`cat-tool/js/cat-fake-caret.js`（必要時擴充 API）。

### 3.3 QA Tag 檢查（`_qaPushSegmentRuleFindings` 等）

- 修正 **僅依 `sourceTags` 有無** 或 **`targetTags` 殘留** 導致漏報／誤判。
- 實作 **集合＋順序＋成對**（依 §2 保守與必檢清單原則）；可評估重用 `buildTagTokenSequence` 之語意。
- **檔案**：`cat-tool/app.js`（主邏輯）；參考 `docs/bug-report_cat-qa-tag-parity.md`（若敘述過時，實作後更新）。

### 3.4 篩選條件摘要（群組卡、QA 摘要）

- **`getSfFilterGroupConditionLines`**：改為「**僅輸出有設定的維度**」；**不要**固定輸出「句段狀態：無／翻譯記憶相符度：無」整行併列。
- **连带**：`buildQaFilterConditionsSummaryLines` 內對群組之引用會自動一致；**頂層進階**若已為「有值才 push」則對照即可。
- **檔案**：`cat-tool/app.js`。
- **文件**：實作後可同步 `docs/CAT_VIEW_SPEC.md` 若仍有「一律顯示相符度」之類舊敘述。

### 3.5 AI 批次翻譯 Modal（`#aiBatchModal`）

- 「全文／目前篩選」時輸入框 **視覺反灰**；**不**長期 `disabled`（或依 §2：未聚焦時反灰、聚焦切模式）。
- **聚焦 `#aiBatchRangeExpr`** → 呼叫既有模式切換邏輯，**切至「指定範圍」**。
- **檔案**：`cat-tool/app.js`、`cat-tool/style.css`（反灰 class）、`cat-tool/index.html`（若需 `aria-label` 等）。

### 3.6 QA 分頁 — 範圍選項列

- 三個核取方塊各**一行**；**「句段範圍」與輸入框同一行**（輸入在標籤後）。
- 未勾「句段範圍」：`#qaRangeExpr` **disabled** ＋反灰樣式。
- **`setQaControlsLocked(false)` 還原後**：須依「句段範圍是否勾選」重算 `qaRangeExpr` 之 `disabled`，避免 QA 跑完解鎖後輸入框誤為可編輯。
- **檔案**：`cat-tool/index.html`、`cat-tool/style.css`、`cat-tool/app.js`。

### 3.7 QA 結果表 — 多選、批次忽略、右鍵選單、說明方塊

- **說明方塊（新增）**：在 `#qaResultsTable` **上方**（或表頭列旁）新增帶邊框之說明區（例：`.qa-results-hint`），白話列出：**選取欄**用途、**多列選取後任一改「忽略」一併套用**、**右鍵「類型」／「說明」之批次忽略**（同說明＝`info` 完全一致，與 §2 一致）。表頭新欄可標「選」或「選取」，必要時以 `abbr`/`title` 縮短欄寬。
- **新欄位**：列首 **選取用** `checkbox`；可點框或依 §4 定案之熱區切換選取（與「#／說明點擊跳句段」互斥須遵守）。
- **視覺**：選取列 `tr` 加 class，**底色略深**（與 `is-ignored` 可並存）。
- **忽略欄**：若目前選取集合非空，**變更任一列之忽略勾選**時，將**相同勾選狀態**套用至**所有選取列**對應之 `r.key`（`_qaIgnoredSet`）。
- **右鍵「類型」儲存格**：選單一項 —「忽略所有同類型錯誤警報」（顯示類型與畫面一致，如 `錯字／打字` 歸併為畫面上之「錯字」時，比對規則須與畫面一致）。
- **右鍵「說明」儲存格**：選單一項 —「忽略所有同說明錯誤警報」（**`info` 完全一致**，見 §2）。
- **`contextmenu`**：`preventDefault`，自製小浮層；點外部關閉。
- **檔案**：`cat-tool/index.html`（說明方塊＋表頭欄）、`cat-tool/style.css`、`cat-tool/app.js`（`renderQaResults` 與事件）。

### 3.8 真游標／暫存游標提示（捲列、點擊）

- **`restore()`**（`cat-tool/js/cat-fake-caret.js`）：在 `editor.focus()` 與還原 `Range` **之前**，對 `editor.closest('.grid-data-row')` 若存在則 **`scrollIntoView({ behavior: 'smooth', block: 'center' })`**，使暫存游標提示點擊後能對齊使用者預期（與 `app.js` `_qaJumpToSegment` 順序一致）。若 `Range` 已失效，`catch` 路徑仍應盡量捲列＋focus。
- **`fakeTipEl`**：既有 `click` → `restoreOrShowFake()`；確認上述捲列已涵蓋或由 `restore()` 統一處理。
- **`realTipEl`**：`showRealCaretTipIfNeeded` 設定文案後，以 **`dataset` 防重複** 綁定 **`click`**：對當時作用中之 `.grid-textarea` 所屬列 **`scrollIntoView`** → **`focus()`**；文案可與假提示對齊（含快捷鍵提示）。
- **檔案**：`cat-tool/js/cat-fake-caret.js`；若需由 `app.js` 注入捲列輔助可再評估。

### 3.9 右欄共用橫條與快捷文案

- **現況**：`cat-tool/index.html` 中 `#tabCAT`、#`tabTmSearch` 各有一份 `.cat-dblclick-insert-bar` + `.cat-side-panel-shortcuts-hint`（內含單行長字與 Ctrl+G）；`#tabNewTerm`、`#tabQA` **無**該條。
- **目標**：四個分頁皆見**同一套**「雙擊套用／回到 CAT」+ 快捷兩行（無 Ctrl+G 行）；樣式見 `cat-tool/style.css` `.cat-side-panel-shortcuts-hint`（改為兩行區塊、字級與 bar 一致）。
- **檔案**：`cat-tool/index.html`（結構重排）、`cat-tool/style.css`、`cat-tool/app.js`（`initCatDblclickInsert` 與 return-tab 等若依賴 id，併單一區後須統一 id 或改為 class 查詢）。

### 3.10 工具列跳至與輸入

- **DOM**：`editor-toolbar` 內 `btnSortMenu` 與 `btnCopySourceToTarget` 之間插入圖示按鈕；`aria-label` 建議「跳到指定句段」。
- **邏輯**：`openJumpToSegmentPrompt` 改為 `async`，以 `await openCatPromptModal({ title, label, defaultValue })` 取代 `window.prompt`；取消則 return；解析與可見列檢查維持現行邏輯。
- **表頭**：`populateGridHeaderTitleCell` 內 `#btnJumpToSeg` 移除或改為不顯示（避免重複入口）。
- **檔案**：`cat-tool/index.html`、`cat-tool/app.js`（`openCatPromptModal` 既有實作約檔案前段）。

### 3.11 無延遲提示盤點（編輯器／右欄／QA）

- **依據**：`cat-tool/app.js` `initGlobalTooltip`（`mouseover` 委派 `[data-tip]` 等）。
- **盤點**：至少涵蓋驗收截圖與同一視線內按鈕——`#btnRunQA`、`#btnTmSearch`、`#btnCopySourceToTarget`、`#btnClearTarget`、`#btnPreTranslate`、`#exportBtn`、新增之跳至圖示、以及仍用 `title` 之 `.cat-dblclick-insert-bar`／拖曳分隔條等是否改為 `data-tip`（拖曳條可保留 `title` 若產品接受延遲，或改 `data-tip` 與鍵盤無障礙並陳）。
- **文件**：與 [`docs/CAT_TOOLTIP_SYSTEM.md`](./CAT_TOOLTIP_SYSTEM.md) 交叉引用；實作後更新該檔「目前已覆蓋元素」表格。

### 3.12 編輯器：切換顯示句段列時「直接顯示」（禁止從頭捲）

- **產品目標**：使用者心智是「我已切到那句／那一列」；畫面應 **立刻以該列為中心（或至少邊界內可見）**，**不要**出現先跳回清單頂端、再慢慢對位或仍停在頂端的斷裂感。
- **範圍**：`cat-tool/app.js` 內所有會改變「目前句段／選取列／焦點譯文格」且預期使用者看該列之路徑（含搜尋 `goToSearchMatch*`、`moveVisibleTargetRowByCtrlArrow`、`openJumpToSegmentPrompt`／`_qaJumpToSegment`、篩選後捲動、`focusTargetEditor*`、確認鏈等）。若 React 主站另有內嵌／iframe 同一編輯器，**本波以 `cat-tool` 為準**；主站若有重複邏輯另開議題。
- **實作要點**：優先 **`row.scrollIntoView({ behavior: 'smooth', block: 'center' })`**（或 `nearest` 若與固定表頭互斥時再評估）；避免在導覽前對 `#editorGrid` 或外層 **`scrollTop = 0`** 除非有明確產品理由並經驗收簽核。
- **與其他節關係**：§3.2（假游標失焦）、§3.8（游標提示點擊）應與本節 **同一捲動原則** 對齊，避免各寫一套。
- **檔案**：以 `cat-tool/app.js` 為主；`cat-tool/js/cat-fake-caret.js` 配合 §3.8。

---

## 4. 實作前待釐清（一處）

**QA 結果表**：「整列點了可選取」與「#／說明點擊跳句段」易衝突。請在實作 PR 中擇一並寫入本檔：

- **建議 A**：**#、說明** 僅跳轉；**類型欄或列左側選取熱區** 負責選取（與 **§3.7 說明方塊** 用語一致，避免使用者誤點 # 以為在選取）。  
- **B**：單擊列＝選取；跳轉改 **雙擊** #／說明。  
- **C**：**Ctrl／Shift** 點列才切換選取。

---

## 5. 驗收要點（摘要）

- 進階篩選：版面與截圖／文字需求一致。  
- 假游標：失焦後位置與捲動提示合理，不回到開頭。  
- QA Tag：少 tag、順序錯、成對錯誤可穩定報出；`{2024}` 類不誤當 tag。  
- 群組卡與 QA 摘要：無多餘「無」字樣維度。  
- AI 批次：反灰＋聚焦即切指定範圍。  
- QA 選項列：三行版面與鎖定邏輯正確。  
- QA 結果表：說明方塊可讀；多選視覺、批次忽略、右鍵兩類批次忽略正確；`qaHideIgnored` 仍正常。  
- 右欄：四個分頁皆見雙擊選項＋快捷**兩行**；快捷區**無**「Ctrl+G：跳至句段」字樣；字級與雙擊列一致。  
- 工具列：跳至圖示位於排序與原文複製之間；`data-tip` 為「跳到指定句段（Ctrl+G）」；輸入為 **modal** 非 `prompt`；Ctrl+G 行為一致。  
- 提示：上述高頻按鈕懸停為**自製無延遲**提示（`data-tip`），非瀏覽器慢速 `title`（盤點範圍見 §3.11）。  
- 游標提示：點真／暫存游標提示後可**捲至該句段**並可還原焦點／游標。  
- 句段列導覽：凡切換顯示列之操作，目標列**直接可見**；**無**「先捲到頂再找句」之體驗（§3.12）。

---

## 6. 參考程式位置速查

| 主題 | 位置 |
|------|------|
| 群組卡渲染、`getSfFilterGroupConditionLines` | `cat-tool/app.js`（約 `renderFilterGroups`、`getSfFilterGroupConditionLines`） |
| QA 摘要行、`buildQaFilterConditionsSummaryLines` | `cat-tool/app.js` |
| QA 結果列渲染、`_qaIgnoredSet` | `cat-tool/app.js` `renderQaResults` |
| 進階篩選 DOM | `cat-tool/index.html` `#sfAdvancedPanel` |
| 假游標／真游標提示 | `cat-tool/js/cat-fake-caret.js` |
| AI 批次 Modal | `cat-tool/index.html` `#aiBatchModal`；`cat-tool/app.js` `_setAiBatchRangeMode` 等 |
| 右欄分頁、快捷列 | `cat-tool/index.html` `.editor-side-panel`、`#tabCAT`、`#tabTmSearch`、`#tabNewTerm`、`#tabQA` |
| 編輯器工具列 | `cat-tool/index.html` `.editor-toolbar` |
| 無延遲提示 | `cat-tool/app.js` `initGlobalTooltip`；`cat-tool/style.css` `#wcProgressModeTooltip` |
| 跳至句段 | `cat-tool/app.js` `openJumpToSegmentPrompt`、`populateGridHeaderTitleCell` |
| Prompt 對話 | `cat-tool/app.js` `openCatPromptModal` |
| 句段列捲動／導覽 | `cat-tool/app.js`（搜尋導覽、Ctrl+↑↓、跳至、篩選定位、`focusTargetEditor*`、確認鏈等；見 **§3.12**） |

---

*建立日期：對話脈絡 2026-05；實作完成後請更新「狀態」與 §4 定案。*
