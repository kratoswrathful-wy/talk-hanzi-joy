# CAT 第四波主記錄（摘要，可版控）

**狀態標記（2026-04-26）**：第四波進行中（A 初版 `ebb9ee4` 已驗收；A 驗收修正 `8f8cea8` 三項已通過使用者複驗；**`d326666` + `c783b56`（列快取）已實作**；篩選殘象見**§二點一**與待補 `runSearchAndFilter` 路徑；B 待開工）。

關聯主計畫：`cat_工具綜合改版_42ac9451.plan.md` 第 **11** 節（TM 搜尋結果互動與編輯區游標輔助）、第 **3** 節（樂觀鎖 revision／協作誤報）。  
可版控鏡像：[`docs/mirror/cat_工具綜合改版_42ac9451.plan.md`](mirror/cat_工具綜合改版_42ac9451.plan.md)（與本機 `%USERPROFILE%\.cursor\plans\` 同名檔同步維護）。

**第四波子階（主計畫已定案）**

| 子階 | 主計畫節次 | frontmatter todo | 說明 |
|------|------------|------------------|------|
| **A** | §11 | `live-tm-cursor-ux` | **初版 `ebb9ee4` 已驗收**；**`8f8cea8`**：`Ctrl+0` undo、`Ctrl+K` 範圍、`Ctrl+0` 游標；**`d326666`**：`Ctrl+Y`、篩選確認跳格、`Ctrl+↑↓`、批次確認等補 `runSearchAndFilter`；**`c783b56`**：`sfRowRenderCache.clear()`；**待辦**：右鍵批次狀態等路徑補 `runSearchAndFilter`（見 §二點一） |
| **B** | §3 | `collab-false-positive` | (A) `segmentRevision` 同步與誤報根因；(B) `applyRemoteCommit` 正規化、sessionId、去重、dev 日誌 |

**原則**：A／B **可並行開發**，**分開 merge、分開驗收**（見主計畫「白話：建議怎麼分階段做」第四波段）。

---

## 一、第四波完成清單（依子階／批次）

### 第四波 A（§11）

- `ebb9ee4`：TM 搜尋分頁單擊改為僅選取、雙擊才套用譯文；搜尋結果顯示 1～N 編號並支援 Ctrl+1～9 套用；Ctrl+K 執行 TM 搜尋後焦點回目前譯文欄尾端；離開譯文欄顯示靜態假游標；Ctrl+0 將原文／CAT／TM 搜尋中的選取文字插入最後譯文游標；快捷鍵 modal 同步更新。
- **驗收修正**（`8f8cea8`）：`Ctrl+0` 與 editor undo 堆疊整合（並同步 `editorUndoEditStart` 避免 debounce 重複推 undo）、譯文欄觸發之 `Ctrl+K` 自動將 `#tmSearchField` 設為譯文、`Ctrl+0` 後雙重 `requestAnimationFrame` 將游標穩定留在插入點後方。**使用者複驗（2026-04-25）**：上述三項皆通過。
- **第二輪驗收發現**（同次回報）：(1) `Ctrl+Y` 重做全檔無效；(2) 篩選下確認後不跳到篩選結果內下一個未確認句段；(3) 篩選下 `Ctrl+↑↓` 無法在可見列間移動；(4) 篩選下多選批次確認後隱藏列全部顯示；(5) 出現 (4) 後再改篩選條件無反應，須先清除篩選才恢復。
- **追加修正**（`d326666`）：(1) `applyEditorRedo` 對 redo 堆疊內已交換 old/new 的 mirror entry 改傳 `applyOneTargetUndo(..., 'undo')`，重做才會套到正確譯文；(2) `getAfterConfirmFocusIndex` 在篩選模式下略過 `display:none` 列；(3) 譯文欄 `Ctrl+↑↓` 以 `while` 跳過不可見鄰列；(4) 批次確認／`confirmOp` undo-redo 路徑在 `renderEditorSegments()` 後補 `runSearchAndFilter()`。**使用者複驗**：(1)～(3) 通過；(4)(5) 於 `d326666` 後仍發生。
- **篩選快取修復**（`c783b56`）：`renderEditorSegments()` 清空 `gridBody` 後立即 `sfRowRenderCache.clear()`，使後續 `runSearchAndFilter()` 能依快照正確設定 `display`，避免舊 `vis` 快取導致應隱藏列全顯與篩選條件變更無效。**使用者回報（`c783b56` 後）**：批次變更狀態後隱藏列仍會全顯，但**改任一篩選條件即可恢復**（與修正前「改條件也無效」不同）。**下一輪程式**：補右鍵 `ctxBatchUnconfirm`／鎖定／解鎖等路徑之 `runSearchAndFilter()`（見 §二點一）。待該輪實作後再驗 (4)(5) 殘象。

### 第四波 B（§3）

- （實作後填：變更摘要 + 參考 commit）

---

## 二、測試與驗收記錄

- **自動化**：各子階交付時執行 `npm run test:cat-sf`、`npm test`（依需要）。
- **手動 smoke（建議）**
  - **A**：TM 單擊不貼上、雙擊貼上；Ctrl+1…9／0 與 CAT 分頁無衝突；Ctrl+K 後焦點在譯文尾端；假游標顯示與捲動／換列；Ctrl+0 插入選取；快捷鍵說明 modal 與實際一致。
  - **B**：單人流程不誤觸 `SEGMENT_REVISION_CONFLICT` alert（或根因已修之驗收標準）；協作路徑 (B) 依主計畫 §3 驗收。
- **複驗紀錄（2026-04-25）**
  - **`8f8cea8` 三項**：`Ctrl+0` undo／redo、`Ctrl+K` 譯文範圍、`Ctrl+0` 游標位置 — **通過**。
  - **`d326666` 五項中的四項**：`Ctrl+Y`、篩選下確認後跳格、篩選下 `Ctrl+↑↓`、自動化測試 — **通過**（`d326666` 已跑 `npm run test:cat-sf`、`npm test`）。
  - **第五項（篩選）**：`c783b56` 已處理列快取與「改條件卡死」；使用者觀察仍有「未改條件時批次變更狀態後全顯」— 歸因見 **§二點一**；**待下一輪補 `runSearchAndFilter` 後複驗**。
- **驗收結論**：第四波 A 初版已通過使用者驗收；`8f8cea8` 三項已複驗通過；`d326666` 已覆蓋第二輪 (1)～(3) 與部分 (4)；`c783b56` 已覆蓋 (5) 類卡死與列快取層；**(4) 殘象**待右鍵批次等路徑補 `runSearchAndFilter` 後再驗（§二點一）；第四波 B 待開工。

- **同步**：`cat-tool` 變更經 `npm run sync:cat` 一併提交 `public/cat`。

## 二點一、篩選與列快取（觀察與根因紀錄，2026-04-25）

以下為 **`c783b56` 之後** 使用者回報與程式對照之紀錄，供下一輪修正與驗收沿用。

### 使用者觀察

- 篩選條件**未變**時，多選**確認**或**變更句段狀態**（例如右鍵設為未確認）後，**隱藏列仍會全部顯示**。
- **但**與 `c783b56` 前不同：不必整個「清除篩選」，**只要變更任意篩選條件**（例如微調搜尋字或進階選項），篩選工具即恢復作用。

### `c783b56` 已處理的層級

- 在 [`cat-tool/app.js`](../cat-tool/app.js) 的 `renderEditorSegments()` 於清空 `gridBody` 後呼叫 `sfRowRenderCache.clear()`。
- 目的：全表 DOM 重建後，避免 `runSearchAndFilter()` 內以 `rowCache.vis !== vis` 判斷時，**舊快取與新列**不一致而**跳過** `display` 更新，進而導致「應隱藏列全顯」以及「之後改篩選條件也完全無反應」的卡死（對應第二輪問題 (5) 類行為）。

### 仍殘留的主因（程式觀察，待下一輪實作）

- 若干路徑在 **`renderEditorSegments()` 之後未再呼叫 `runSearchAndFilter()`**：重繪後每列預設為可見，若未重套篩選，畫面上會暫時（或持續）呈現全顯。
- **已鎖定範例**（右鍵選單，約 L10745–L10794）：`ctxBatchUnconfirm`、`ctxLockSegments`、`ctxUnlockSegments` 僅呼叫 `renderEditorSegments()`，與「變更句段狀態後全顯」敘述一致。
- **建議盤點**：其餘 `renderEditorSegments()` 呼叫點（例如排序、套用重複模式至全檔、預先翻譯完成後等）是否在篩選模式下亦應補 `runSearchAndFilter()`，依產品一致性交給實作時掃描 grep 確認。

### 與第一波篩選設計的關係（是否「當初為加速改的」引發）

| 機制 | 與本現象之關係 |
|------|----------------|
| **快照** `sfFilterSnapshotSegIds`（主計畫：未改 spec 時可見集不變） | **不直接**造成「全表重繪後全顯」；但契約上**重繪後仍須依快照重套** `display`，流程漏接時會暴露問題。 |
| **列快取** `sfRowRenderCache` | **會**與「全表重建」疊加出錯顯／條件變更卡死；`c783b56` 針對此層。 |
| **漏接** `runSearchAndFilter` | 與快照**無必然關係**；屬整表重繪後**未接回篩選**之實作缺口。 |

### 效能疑慮（問答紀錄）

- `sfRowRenderCache.clear()` **僅**發生在整表 `renderEditorSegments()`；一般僅反覆呼叫 `runSearchAndFilter()` 的互動路徑**仍保留**列快取跳過重畫的效益，**不視為**當初篩選反應優化整體失效。

---

## 三、衍生文件盤點與收斂

| 文件 | 處置 |
|------|------|
| `主計畫納入_tm_游標_ad384fe1.plan.md` | 內容已併入主計畫 §11；歷史副本：**[`docs/mirror/主計畫納入_tm_游標_ad384fe1.plan.md`](mirror/主計畫納入_tm_游標_ad384fe1.plan.md)**；本機 `.cursor/plans` 同名檔已移除 |
| `docs/CAT第四波主記錄.md`（本檔） | **保留** |

---

## 四、結案判定

1. **第四波工作是否全部結束？** **否**（進行中）。
2. **主計畫中第四波對應範圍（§11 與 §3）是否已完成？** **否**（進行中）。

---

**上一波**：第三波見 [`docs/CAT第三波主記錄.md`](CAT第三波主記錄.md)。
