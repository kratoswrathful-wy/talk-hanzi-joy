# CAT Workflow 確認狀態 UX（B-7g）

> **狀態**：**已驗收**（2026-06-19；mqxliff Workflow 樣本）  
> **關聯**：[`CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md`](./CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md) §15、[`CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md`](./CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md) §6、[`bug-report_workflow-import-confirmed-status-column_2026-06.md`](./bug-report_workflow-import-confirmed-status-column_2026-06.md)  
> **程式觸點**：[`cat-tool/app.js`](../cat-tool/app.js)（`resolveSegmentConfirmDisplayState`、`onStatusIconClick`、`onCtrlEnterConfirm`、`applyWorkflowRevokeOnTargetEdit`、`maybeRestoreReviewFromSnapshot`）、[`cat-tool/style.css`](../cat-tool/style.css)（`.status-icon-stack` 五態）、migration [`20260619120000_cat_segments_review_restore.sql`](../supabase/migrations/20260619120000_cat_segments_review_restore.sql)

---

## 1. 範圍與關聯

| 項目 | 說明 |
|------|------|
| **適用** | 團隊 Workflow 模式與**個人版 CAT**（四態、篩選、進度、PM 切換鈕均啟用） |
| **單一來源** | [`cat-tool/`](../cat-tool/) → `npm run sync:cat` → `public/cat/` |
| **與 B-7e 關係** | B-7e 處理匯入對話框與 `orig-confirmed` 初版；**完整五態視覺與互動以本文件為準** |

---

## 2. 資料模型

### 2.1 決策摘要

| 決策 | 定案 |
|------|------|
| **A1** | **甲**：審稿確認時**保留** `wfTransConfirmedAt`，**追加** `wfReviewConfirmedAt` |
| **A2** | **甲**：「審稿後譯者再確認」以 `wfTransConfirmedAt > wfReviewConfirmedAt` 判斷，不新增第四欄位 |

### 2.2 句段欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `wfTransConfirmedAt` / `wfTransConfirmedBy` | 既有 | 內部翻譯確認 |
| `wfReviewConfirmedAt` / `wfReviewConfirmedBy` | 既有 | 內部審稿確認 |
| `wfReviewRestoreSnapshot` | JSON（**新增**） | 審稿確認當下快照，供回溯比對與還原 |
| `wfReviewRevokedPending` | boolean（**新增**） | 「審稿確認後譯者再編輯」中間態 |

**`wfReviewRestoreSnapshot` 結構**（建議）：

```json
{
  "targetCanonical": "正規化後譯文",
  "wfTransConfirmedAt": "...",
  "wfTransConfirmedBy": "...",
  "wfReviewConfirmedAt": "...",
  "wfReviewConfirmedBy": "...",
  "confirmationRole": "T"
}
```

寫入時機：每次進入**審稿已確認**（含審稿人點圖示升級、Ctrl+Enter 跨階段補審稿標記）時更新快照。

### 2.3 顯示狀態解析（`resolveSegmentConfirmDisplayState`）

優先序（由高到低）：

1. `orig-confirmed`：`status === 'confirmed'` 且無 wf 標記  
2. `post_review_trans`：`wfReviewRevokedPending` 為 false，兩個 wf 時間皆有，且 `wfTrans > wfReview`  
3. `review_revoked_editing`：`wfReviewRevokedPending === true`  
4. `review_confirmed`：有 `wfReviewConfirmedAt`（且非 post_review、非 revoked）  
5. `trans_confirmed`：僅有 `wfTransConfirmedAt`  
6. `unconfirmed`：其餘

---

## 3. 狀態欄視覺與 Tooltip

外環共通（審稿確認）：`18px` 容器、`14px` 置中內圓 + `box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--success-color)`（外徑約 **22px**）。虛線版外環改 **dashed**，尺寸與審稿確認外環相同（22×22px 置中）。

| 顯示狀態 | CSS class（建議） | 視覺 | Tooltip（僅一行） |
|----------|-------------------|------|------------------|
| 未確認 | （預設） | 灰邊白圓 | 未確認 |
| 原檔已確認 | `orig-confirmed` | **實線**外環（`18px` 直徑、`2px border`、無 box-shadow）；**無內圓 DOM、無內圓填色** + 綠符號 | **原檔確認，系統內未確認** |
| 翻譯確認 | `wf-trans` | 實心綠點 + 白符號（mq 依 T／R1／R2） | 翻譯確認 |
| 審稿確認 | `wf-trans` + `wf-review` | 實心綠點 + **實線**外環 + 白符號 | 審稿確認 |
| 審稿確認後譯者再編輯 | `wf-review-revoked` | **虛線**外環（22px）+ 綠符號（無實心內點） | 審稿確認後譯者再編輯 |
| 審稿後譯者再編輯並確認 | `wf-post-review-trans` | 與審稿確認同幾何；外環改 **虛線** + 實心綠內圓 + 白符號 | 審稿後譯者再編輯並確認 |

**mqxliff 符號顏色**：實心綠內圓上為**白色**；僅外環／虛線外環無內點時為**綠色**符號。

**`orig-confirmed` CSS**：`.status-icon-stack.orig-confirmed::before` 使用 `inset: -2px; border: 2px solid var(--success-color); background: transparent`（不繪製內圓、不使用 box-shadow）。

**`post_review_trans`／`wf-review-revoked` 虛線外環 CSS**：`.status-icon-stack.wf-post-review-trans::before`（及 revoked 同尺寸）使用 `width/height: 22px; left: 50%; top: 50%; transform: translate(-50%, -50%); border: 2px dashed var(--success-color)`；**不**縮容器為 14px。

**實作註記（2026-07，Phase 2.3）**：2.3n 曾暫用 3px 可見外圈／24px 虛線（修 2.3m 外圈不可見後產品驗收通過）；**2.3o 產品微調為 2.5px 折衷**（`box-shadow` spread `4.5px`、虛線 `23px`／`2.5px dashed`）。本節設計基線仍為 2px／22px；以 [`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §3.17 為準。

---

## 4. 編輯取消確認（譯文變更觸發）

- **觸發**：任何導致譯文內容變化之操作（手打、取代、TM、F8、批次清空等）；**僅聚焦不算**
- **僅翻譯確認** → 一般未確認（清全部 wf、`wfReviewRevokedPending=false`、清快照）
- **曾審稿確認**（含審稿後再確認）→ **保留** `wfReviewConfirmedAt`／`wfReviewConfirmedBy`、設 `wfReviewRevokedPending=true`、`status='unconfirmed'`、**保留** `wfReviewRestoreSnapshot`；進入「再編輯」態  
  - 保留 `wfReviewConfirmedAt` 的原因：再確認後能以 `wfTransConfirmedAt > wfReviewConfirmedAt` 正確判斷 `post_review_trans`（若清除 review 時間戳，再確認只會落到 `trans_confirmed`）
- 統一入口：`handleTargetContentChanged(seg, rowEl)`

觸點：[`unconfirmSegmentVisualAfterReplace`](../cat-tool/app.js)、譯文 debounce、取代／TM 路徑。

---

## 5. 點狀態圖示（左鍵）— 與 Ctrl+Enter 分離

**原則**：左鍵只做「確認成自己階段狀態」或「依下表切換／取消」；**不提供**鍵盤取消確認。

**身分判斷**：`currentWfSessionKind`（翻譯／審稿）；PM+ 可透過搜尋列切換鈕覆寫（§9）。

| 目前顯示狀態 | 操作者 | 左鍵結果 |
|--------------|--------|----------|
| 未確認／orig-confirmed | 譯者 | 翻譯確認 |
| 未確認／orig-confirmed | 審稿 | 審稿確認 |
| 翻譯確認 | 譯者 | 未確認 |
| 翻譯確認 | 審稿 | 審稿確認（甲：保留 wfTrans） |
| 審稿確認 | 譯者 | 未確認（**先警告**；可勾「本工作階段不再顯示」） |
| 審稿確認 | 審稿 | 未確認 |
| 審稿確認後譯者再編輯 | 譯者 | 未確認 |
| 審稿確認後譯者再編輯 | 審稿 | 審稿確認 |
| 審稿後譯者再編輯並確認 | 譯者 | 未確認 |
| 審稿後譯者再編輯並確認 | 審稿 | 審稿確認 |

- **ID 右鍵「設定為未確認」**：整句清除 wf（與上表「未確認」結果相同，不走警告）
- 所有圖示左鍵狀態變更支援 **Ctrl+Z／Ctrl+Y**

**備註（審稿確認 + 譯者左鍵）**：設 `wfReviewRevokedPending=true`、`status='unconfirmed'`；**不清除** `wfReviewConfirmedAt`／`wfReviewConfirmedBy`（讓後續再確認能走 `post_review_trans` 路徑）。上表「未確認」指顯示狀態，非清除 review 時間戳。

---

## 6. Ctrl+Enter（獨立，不取消）

**`sameStage` 判斷**：比對**句段目前確認層級**與**操作身分**是否同階段。`post_review_trans` **不**視為審稿同階段（審稿人須能再確認並推進審稿進度）。

| 情境 | 行為 |
|------|------|
| 未確認／orig-confirmed／review_revoked_editing | 依操作身分確認 + 跳下一句 + TM（`review_revoked_editing` 且譯文 = 快照 A 時先還原，見下行） |
| 已確認 + **同階段** | 狀態不變；檢查確認範圍並寫入 TM |
| 已確認 + **跨階段** | 狀態升級（如補審稿標記，甲並存）+ TM |
| 再確認前比對快照 | 若與審稿快照 `targetCanonical` 一致 → 還原審稿確認 + toast（§7.2） |
| **審稿確認** + **譯者**（未編輯） | 無反應 + toast「審稿已確認，未實質編輯內容」；**不移焦** |
| **post_review_trans** + **譯者**，譯文 = 快照 A | **還原**審稿確認 + toast（§7.2）；**不是** no-op |
| **post_review_trans** + **審稿** | 升級為審稿確認（更新 `wfReviewConfirmedAt`、重拍快照）+ 推進審稿進度 |
| **review_revoked_editing** + 譯者按確認，譯文 = 快照 A | 恢復審稿確認 + toast（§7.2）；**不**產生 `post_review_trans` |
| **review_revoked_editing** + 譯者按確認，譯文 ≠ 快照 A | 狀態 → `post_review_trans` |

無論譯者再編輯並確認多少次，只要譯文與審稿確認當下的 A 相符，即觸發未實質編輯恢復（§7.2）。

**ID 右鍵「設定為已確認」** = 對選取句執行 **Ctrl+Enter 邏輯**（非 §5 圖示邏輯）。

---

## 7. 審稿回溯

### 7.1 譯文比對（`normalizeTargetForCompare`）

**必做**：

1. 與編輯器同源之純譯文抽出  
2. 每行 trim  
3. `\r\n` → `\n`

**暫不做**：連續空白壓縮、Unicode NFC、tag 正規化（tag 變更視為有實質編輯）。

### 7.2 單句恢復（再確認時）

若目前譯文與快照 `targetCanonical` 一致（含 `review_revoked_editing`、`post_review_trans` 等 eligible 狀態）→ 還原快照內 wf 欄位、`wfReviewRevokedPending=false`、`status=confirmed` → **toast**：「**審稿已確認，未實質編輯內容**」

### 7.3 離開編輯器（批次）

掃描 eligible 句段 → **modal** `#reviewRestoreLeaveModal`：列表含 **ID 欄序號**、原文、譯文、勾選框（預設全選）→ 文案：「有句段在取消審稿確認後未實質編輯內容，離開前是否使其恢復審稿確認狀態？」→ 使用者確認後**繼續離開**；關閉 modal 視為**取消離開**。

閘門順序：prep 離開閘門 → 本 modal → 其餘離開流程。

---

## 8. 篩選與進度

### 8.1 進階篩選

**保留**：「已確認」（`status === 'confirmed'`，含 orig-confirmed）。

**新增**（與 wf 維 OR；跨維 AND）：

| value | 標籤 | 定義 |
|-------|------|------|
| `wf_trans_confirmed` | 翻譯已確認 | 有 wfTrans，且非 post_review_trans、非 review_revoked |
| `wf_review_confirmed` | 審稿已確認 | 有 wfReview，且非 post_review_trans |
| `wf_post_review_trans` | 審稿後譯者再編輯並確認 | post_review_trans 狀態 |

「已確認」仍篩 `status === 'confirmed'`（含 orig-confirmed）。

### 8.2 進度（編輯器與檔案清單同一規則）

| 顯示狀態 | 算翻譯完成 | 算審稿完成 |
|----------|------------|------------|
| 翻譯確認 | 是 | 否 |
| 審稿確認 | 是 | 是 |
| 審稿後譯者再編輯並確認 | 是 | **否** |
| 審稿確認後譯者再編輯 | 否 | 否 |
| 未確認／orig | 否 | 否 |

---

## 9. PM 與準備中

### 9.1 PM+ 身分切換鈕

- 位置：搜尋列第二列「¬」正下方（[`div.sf-cell-invert.sf-cell-row2-spacer`](../cat-tool/index.html)），位於 memoQ 狀態指示器與「取代」之間  
- 顯示文案：**T**（翻譯模式）／**R**（審稿模式）  
- 切換 `currentWfSessionKind`：`translate` ↔ `review`  
- **預設：審稿**（`review`）  
- 僅 `_isCatPmOrExecutive()` 可見（含個人版）

### 9.2 準備中禁止編輯

譯者（非 PM+）於 prep 未完成時：`禁止編輯，檔案準備中`（見 §10）。

### 9.3 PM 首次改譯文警告

- 每檔、本次 session **只問一次**  
- 不阻擋編輯；按「是」→ 標記準備完成  
- **AI 輔助翻譯不觸發**

---

## 10. 禁止編輯提示用字

使用者可見之禁止編輯 tooltip／提示**一律以「禁止編輯」起首**：

- 短原因：`禁止編輯，{原因}`（例：`禁止編輯，檔案準備中`）  
- 較長說明：`禁止編輯：{原因}`（例：`禁止編輯：不在您受派的列範圍內`）

交叉引用：[`CAT_VIEW_SPEC.md`](./CAT_VIEW_SPEC.md) §1.4。

---

## 11. 實作波次與驗收

| 波次 | 內容 |
|------|------|
| **B-7f-1** | 狀態引擎、`normalizeTargetForCompare`、快照欄位、雲端 migration |
| **B-7f-2** | `onStatusIconClick`／`onCtrlEnterConfirm` 分離；右鍵批次對齊 |
| **B-7f-3** | `handleTargetContentChanged`、五態 CSS、`orig-confirmed` 無內圓 |
| **B-7f-4** | 篩選三項、進度、toast／離開 modal |
| **B-7f-5** | PM 切換鈕、prep tooltip、PM 首次編輯警告 |
| **B-7g-1** | 第一波修正：虛線外環、快照、sameStage、T/R 鈕、移除「已標」篩選（`24ccdcd`） |
| **B-7g-2** | 第二波：保留 review 時間戳、`_enterReviewRevokedEditing`、`orig-confirmed` 純外圈（`479460d`） |
| **B-7g-3** | 第三波：文案、快照還原穩定化、審稿人升級、post_review_trans CSS 對齊（`c503f9d`） |

### 驗收清單（白話）

1. 審稿人對已翻譯確認句**點圖示** → 審稿確認（翻譯標記仍在）  
2. 譯者改審稿確認句一個字 → 虛線外環綠勾；再確認且字與審稿時相同 → toast 恢復審稿  
3. 離開前多句 eligible → modal 勾選；確認後繼續離開  
4. Ctrl+Enter 與點圖示行為不同；右鍵「已確認」= Ctrl+Enter  
5. 準備中譯者 tooltip：`禁止編輯，檔案準備中`  
6. PM 搜尋列可切換翻譯／審稿，預設審稿  
7. 進階篩選保留「已確認」+ 三新項；編輯器與清單進度一致  
8. 原檔已確認 tooltip：「原檔確認，系統內未確認」  
9. 譯者改審稿句再改回 A 後 Ctrl+Enter → 審稿確認圖示 + toast「審稿已確認，未實質編輯內容」（含 post_review_trans 卡住後再改回）  
10. 審稿人對 post_review_trans 按 Ctrl+Enter → 審稿確認 + 審稿進度上升  
11. post_review_trans 圖示：內圓置中，外環與審稿確認同尺寸、僅改虛線  

**2026-06-19 驗收紀錄**：以上 1～11 項於 mqxliff Workflow 檔（含 MSH Sell-Through Survey 樣本句段）通過；PM 以 T/R 切換器測試譯者／審稿路徑。

---

## 12. 修訂紀錄

| 日期 | 內容 |
|------|------|
| 2026-06-19 | 初稿：本對話定案（A1 甲、點圖示／Ctrl+Enter 分離、五態、審稿回溯、篩選進度、PM UX、禁止編輯用字） |
| 2026-06-19 | **初版實作**（commit `ed56586`）：五態引擎、圖示／Ctrl+Enter 分離、快照欄位、migration、五態 CSS、篩選三項、PM T/R 鈕 |
| 2026-06-19 | **B-7g 第一波**（commit `24ccdcd`）：CSS 虛線外環改 `inset:-3px`、移除快照覆寫錯誤行、`sameStage` 改以顯示狀態比對身分、T/R 切換鈕移至 ¬ 下方、移除「翻譯已標／審稿已標」篩選項 |
| 2026-06-19 | **B-7g 第二波（規格修訂）**（commit `c70723b`）：§4 更正不應清除 `wfReviewConfirmedAt`；§5／§6 補充互動路徑 |
| 2026-06-19 | **B-7g 第二波（實作）**（commit `479460d`）：`_enterReviewRevokedEditing`、Ctrl+Enter 審稿確認＋譯者 no-op toast、`orig-confirmed` CSS 純外圈 |
| 2026-06-19 | **B-7g 第三波**（commit `c503f9d`）：orig tooltip、post_review_trans 文案、快照還原穩定化、審稿人 post_review_trans 升級、虛線外環 CSS 對齊 |
| 2026-06-19 | **驗收通過**：§13 開發紀錄補齊；狀態改為已驗收 |

---

## 13. 開發與修正紀錄（詳述）

本節記錄 B-7g 從規格定案到三波修正的設計意圖、實作範圍、回報問題與根因，供日後維護對照。**行為以 §2～§10 為準**；本節不重複全文規格。

### 13.1 設計總覽

**要解決的問題**：Workflow 模式下，句段確認不再只是「已確認／未確認」二元，而需區分翻譯確認、審稿確認、原檔匯入確認、以及「審稿後譯者再動過譯文」的中間態與再確認態；且**點狀態圖示**與 **Ctrl+Enter** 必須分離（圖示可取消／升級自己階段，Ctrl+Enter 不取消、可跨階段升級或寫 TM）。

**核心決策**：

| 決策 | 選擇 | 理由 |
|------|------|------|
| A1 審稿確認時是否保留翻譯時間戳 | **保留** `wfTransConfirmedAt` | 進度與篩選需同時知道兩層確認 |
| A2 審稿後譯者再確認 | **`wfTransConfirmedAt > wfReviewConfirmedAt`** | 不新增第四時間欄位 |
| 審稿回溯 | **`wfReviewRestoreSnapshot`** + `normalizeTargetForCompare` | 譯者改回審稿版 A 時可恢復審稿確認，無須人工重審 |
| 再編輯中間態 | **`wfReviewRevokedPending`** 優先於時間戳比對 | 編輯中顯示虛線外環，不誤判為審稿確認 |

**顯示狀態優先序**（`resolveSegmentConfirmDisplayState`）：`orig_confirmed` → `post_review_trans`（需 `wfTrans > wfReview` 且非 pending）→ `review_revoked_editing`（pending）→ `review_confirmed` → `trans_confirmed` → `unconfirmed`。

### 13.2 初版實作（`ed56586`）

| 區塊 | 內容 |
|------|------|
| 資料 | Dexie／Supabase 新增 `wfReviewRestoreSnapshot`、`wfReviewRevokedPending`；RPC 映射 |
| 引擎 | `resolveSegmentConfirmDisplayState`、`normalizeTargetForCompare`、`_captureReviewRestoreSnapshot` |
| 互動 | `onStatusIconClick`／`onCtrlEnterConfirm` 分離；`handleTargetContentChanged` → `applyWorkflowRevokeOnTargetEdit` |
| UI | 五態 CSS、`buildStatusCellHtml`；進階篩選三項；PM `#btnPmActingRole`；離開 modal `#reviewRestoreLeaveModal` |
| 進度 | `_isWfTransProgressCounted`／`_isWfReviewProgressCounted` 依顯示狀態計算 |

初版上線後產品回報多項與規格不符，分三波修正（§13.3～§13.5）。

### 13.3 第一波修正（`24ccdcd`）— 驗收前五項

| # | 現象 | 根因 | 修正 |
|---|------|------|------|
| 1 | 審稿後再編輯態虛線畫在**內圈** | `.wf-review-revoked::before` 用 `inset:0` + `box-shadow` | 改 `inset:-3px` 純虛線外環 |
| 2 | 改回審稿版 A 無法恢復審稿確認 | `applyWorkflowRevokeOnTargetEdit` 在編輯後**重拍快照**，覆蓋正確 A | 移除該處 `_captureReviewRestoreSnapshot` |
| 3 | 審稿身分 Ctrl+Enter 在翻譯確認句無反應 | `sameStage` 比對 session kind 與身分，永遠 true | 改比對**句段確認層級**與操作身分 |
| 4 | PM 切換鈕位置／文案錯 | 放在 `#sfCellModeRow2`、顯示「翻譯／審稿」 | 移至 ¬ 下方；文案 **T／R** |
| 5 | 篩選出現「翻譯已標／審稿已標」 | 內部 progress 函式誤暴露為 UI 選項 | 移除 checkbox 與 `evaluateSegment` 維度；內部函式保留 |

### 13.4 第二波（規格 `c70723b` + 實作 `479460d`）

**規格更正（§4）**：曾審稿確認句段被編輯時，**不得清除** `wfReviewConfirmedAt`；僅設 `wfReviewRevokedPending=true`。若清除 review 時間戳，譯者再確認只會得到 `trans_confirmed`，無法得到 `post_review_trans`。

| 項目 | 實作 |
|------|------|
| `_enterReviewRevokedEditing(seg)` | 只設 pending + `status='unconfirmed'`，保留 review 時間戳與快照 |
| 圖示左鍵（譯者取消審稿確認） | 改走 `_enterReviewRevokedEditing`，不再 `applyWorkflowConfirmToSegment(false)` |
| Ctrl+Enter（譯者 + 審稿確認、未編輯） | toast「審稿已確認，未實質編輯內容」、不移焦 |
| `orig-confirmed` CSS | `inset:-2px` + `border:2px solid`，無內圓、無 box-shadow |

### 13.5 第三波（`c503f9d`）— 驗收後精修

產品第二輪回報與樣本驗收（mqxliff 句段 1 等）：

| # | 現象 | 根因 | 修正 |
|---|------|------|------|
| 1 | 原檔已確認 tooltip 顯示「未確認」 | `WF_DISPLAY_STATE_LABELS.orig_confirmed` 未更新 | 改「**原檔確認，系統內未確認**」 |
| 2 | 狀態名稱不符產品用語 | 舊稱「審稿確認後譯者再確認」 | 改「**審稿後譯者再編輯並確認**」（含篩選 label） |
| 3 | 改回 A 後仍卡 **post_review_trans** + 錯誤 toast | `post_review_trans` 被納入譯者 no-op 分支；`maybeRestore` 失敗時誤走 no-op | no-op **僅** `review_confirmed`；`post_review_trans` + 譯文=A 走還原；`review_revoked_editing` 確認前加快照兜底 |
| 4 | 審稿人對 post_review_trans Ctrl+Enter 無升級 | `sameStage` 把 post_review_trans 當審稿同階段 | 排除 post_review_trans；新增審稿人 `kinds:['review']` 升級路徑 |
| 5 | post_review_trans 內圓偏左、外環尺寸不對 | 容器覆寫 14px、內圓 14px 填滿、`inset:-3px` 與審稿確認幾何不一致 | 沿用 18px 容器 + 14px 置中內圓；`::before` **22×22px 置中虛線**（與審稿外環外徑一致） |
| 6 | 還原 toast 文案不一致 | 單句用長句「取消審稿確認後…」 | 統一「**審稿已確認，未實質編輯內容**」；§7.3 離開 modal **維持長句** |

**Ctrl+Enter 決策流程（第三波定案）**：

```
Ctrl+Enter
  → maybeRestoreReviewFromSnapshot（譯文 = 快照 A）
  → review_revoked_editing + 譯者 + 譯文=A → 兜底還原
  → 未確認／orig／review_revoked_editing（譯文≠A）→ 依身分確認
  → sameStage → 僅 TM
  → review_confirmed + 譯者 → no-op toast
  → trans_confirmed + 審稿 → 升級審稿
  → post_review_trans + 審稿 → 升級審稿 + 進度
```

### 13.6 程式對照表

| 函式／模組 | 職責 |
|------------|------|
| `resolveSegmentConfirmDisplayState` | 五態 + orig 解析（§2.3 優先序） |
| `applyWorkflowConfirmToSegment` | 寫入 wf 時間戳；審稿確認時 `_captureReviewRestoreSnapshot` |
| `applyWorkflowRevokeOnTargetEdit` | 譯文變更 → 全清或 `_enterReviewRevokedEditing` |
| `_enterReviewRevokedEditing` | 保留 review 時間戳，設 pending |
| `onStatusIconClick` | §5 左鍵表；不走 Ctrl+Enter |
| `onCtrlEnterConfirm` | §6；先還原再確認／升級 |
| `maybeRestoreReviewFromSnapshot` | 譯文 = A → 還原快照 wf 欄位 |
| `buildStatusCellHtml` | 組 CSS class + mq 符號 overlay |
| `style.css` `.status-icon-stack.*` | 五態視覺（§3） |

### 13.7 已知邊界與後續

| 項目 | 說明 |
|------|------|
| Tag 比對 | `normalizeTargetForCompare` **不**正規化 inline tag；tag 變更視為有實質編輯（§7.1）。若 mqxliff 仍偶發比對失敗，需另案調查 editor plain text 與快照一致性 |
| 離開 modal 文案 | 刻意保留「取消審稿確認後未實質編輯…」長句，與單句 Ctrl+Enter toast 區分 |
| 舊資料 | 卡在錯誤 post_review_trans 的句段，修正後需使用者再按一次 Ctrl+Enter（或改回 A 再確認）才會還原 |
| 內部 progress | `_isWfTransMarkedEffective`／`_isWfReviewMarkedEffective` 僅供進度 fallback，**不**出現在 UI 篩選 |

### 13.8 Git 提交索引

| Commit | 摘要 |
|--------|------|
| `ed56586` | 初版 B-7g 五態 UX |
| `24ccdcd` | 第一波五項 bug |
| `c70723b` | 第二波規格文件 |
| `479460d` | 第二波程式 |
| `c503f9d` | 第三波文案／還原／CSS |

---

## §14 文案修正（2026-06-22）

| 顯示狀態 | CSS | 變更 |
|----------|-----|------|
| `review_revoked_editing` | `wf-review-revoked`（僅虛線外圈、無實心內圓） | tooltip：**審稿確認後譯者再編輯** → **審稿確認後再編輯** |

**不變**：`post_review_trans`（虛線外圈 + 實心內圓）仍為「審稿後譯者再編輯並確認」。

**程式觸點**：`WF_DISPLAY_STATE_LABELS.review_revoked_editing`（[`cat-tool/app.js`](../cat-tool/app.js)）。

**驗收**：`e787441` 已推送；使用者 2026-06-22 驗收通過。
