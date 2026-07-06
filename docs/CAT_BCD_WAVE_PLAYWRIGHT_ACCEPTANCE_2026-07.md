狀態：已落地待驗收

# BCD 波次 Playwright 驗收規格（sync 後 UI）

> **建立日期**：2026-07-06  
> **前置**：`main` ≥ `6f6c4d68`（含 PR #23 Playwright spec、`sync:cat` @ `0312648c`）；程式碼審查與 `test:cat` 39/39 已由驗收方獨立 clone 確認。  
> **本文件補足**：Claude 程式驗收未涵蓋的**瀏覽器實機 UI**回歸。  
> **碰撞背景**：[`CAT_BCD_PARALLEL_MERGE_PLAN_2026-07.md`](CAT_BCD_PARALLEL_MERGE_PLAN_2026-07.md)

---

## 1. Claude AI 驗收範圍（由執行者自行規劃測試）

**角色**：你是驗收執行者。本節只定義**要驗什麼、怎樣算過**；**如何測**（步驟、工具、腳本、是否沿用 repo 內 spec）由你規劃並在回報中簡述。

### 1.1 變更摘要（驗收對象）

| 代號 | 已併入 `main` | 使用者應感受到的行為 |
|------|---------------|----------------------|
| **BCD-B** | PR #17 | 編輯器**不再顯示**加權字數相關 UI（切換按鈕、加權字數顯示等應隱藏） |
| **BCD-C** | PR #18 | **小檔**（非 virtual grid）在進階篩選後按「清除篩選／導覽」，**目前焦點句段仍應在視窗內合理置中**（假游標／捲動位置不應錯位） |
| **BCD-D** | PR #21 | 譯者在**已審稿確認**、**未改譯文**的句段按 `Ctrl+Enter`（noop 確認）時，**Workflow 狀態不變**，但**焦點仍應跳下一句**（與一般確認後跳轉一致） |

程式錨點（供診斷，非步驟清單）：BCD-B `_WC_WEIGHTED_UI_DISABLED`；BCD-C `runSearchAndFilter` → `flushFilterAnchorAfterVirtRender()`（non-virt）；BCD-D `onCtrlEnterConfirm` noop 分支 `focusNext: true`。

### 1.2 環境與約束

| 項目 | 要求 |
|------|------|
| 建議模式 | **離線 CAT**（`/cat/offline/projects`），避免污染 Team 正式資料 |
| 小檔樣本 | `tests/fixtures/Test_Small.mqxliff`（或 `PLAYWRIGHT_CAT_SMALL_FIXTURE`） |
| 登入 | `playwright/.auth/user.json`（威儀本機產生後人工交付；**勿**寫入 repo） |
| 等待策略 | **禁止**固定 `sleep`；以 DOM、`data-wf-state`、`CatVirtGrid.isEnabled()`、`getCatNavigationState` 等可觀測訊號為準 |
| 部署 | 線上 `https://talk-hanzi-joy.vercel.app` 須已含目標 commit；否則標 **blocked** |

### 1.3 各項通過條件（可觀測、可程式化）

執行者須為 **BCD-B／C／D 各至少一組**斷言；實作方式自選（Playwright、iframe `Runtime.evaluate`、或兩者並用）。

**BCD-B — 加權字數 UI 停用**

- 開啟離線編輯器（小檔即可）後，加權字數相關控制項**對使用者不可見**。
- 可接受斷言範例（非窮舉）：`#btnToggleEditorWordMode`、`#btnToggleFileProgressMode`（若存在）為 hidden／`toBeHidden()`；`#btnEditorWordCount` 不可見。

**BCD-C — 小檔清除篩選後置中**

- 前置：`CatVirtGrid.isEnabled() === false`（確認為小檔路徑）。
- 套用進階篩選縮小可見列後，焦點落在某一錨點句段；清除篩選／導覽後：
  - 焦點句段 ID **不變**；
  - 該列在編輯器視窗內**置中合理**（可參考 `centeredOk === true`、`|rowCenterDeltaPx| ≤ 16`，或等效量測）。

**BCD-D — noop 確認後仍跳轉**

- 前置：至少一句段處於 **審稿已確認**（`data-wf-state="review_confirmed"`），且以**譯者**身分操作、**不修改譯文**。
- `Ctrl+Enter` 後：
  - 原句段 `data-wf-state` **仍為** `review_confirmed`；
  - 焦點 **已跳下一句**（`activeSegId` 改變）。

### 1.4 刻意不驗

- ENG-P1 引擎接線（仍無 `app.js` 引用）
- 大檔 virtual grid 清除篩選置中（BCD-C 僅補 non-virt；大檔見 Phase 2.3q spec）
- Team 雲端 Workflow 指派（離線即可覆蓋核心邏輯）

### 1.5 回報格式

在 Slack thread（或指定管道）回覆：

1. **測試計畫摘要**（你採用的路徑、fixture、是否跑 repo 內 `tests/cat-bcd-wave-acceptance.spec.ts`）
2. **結果表**

| 範圍 | 結果 | 關鍵斷言／備註 |
|------|------|----------------|
| BCD-B | pass／fail／blocked | |
| BCD-C | pass／fail／blocked | |
| BCD-D | pass／fail／blocked | |

3. 失敗時附 trace／截圖路徑與診斷（**勿改程式**，只回報）

---

## 2. Repo 內參考實作（可選跑，非驗收唯一路徑）

維護者已提供一組 Playwright spec，可作為你規劃測試的**參考或捷徑**，通過與否仍以 §1.3 行為為準。

```powershell
Set-Location "c:\Homemade Apps\1UP TMS"
npx playwright test -g "BCD 波次" --project=chromium
```

### 參考 spec 涵蓋行為

| 範圍 | 參考檔行為摘要 |
|------|----------------|
| BCD-B | `expectWeightedWordCountUiHidden` |
| BCD-C | 篩選 `16-22` 類範圍 → `#btnSfClearNav` → `expectCenteredOnSeg` |
| BCD-D | `prepareReviewConfirmedSegmentForTranslator` → noop `Ctrl+Enter` → 狀態不變且跳下一句 |

---

## 3. 實作對照

| 檔案 | 說明 |
|------|------|
| [`tests/cat-bcd-wave-acceptance.spec.ts`](../tests/cat-bcd-wave-acceptance.spec.ts) | 三項 describe（BCD-B/C/D） |
| [`tests/helpers/cat-bcd-assert.ts`](../tests/helpers/cat-bcd-assert.ts) | 加權 UI、篩選、審稿確認前置、置中斷言 |
| [`tests/helpers/cat-offline-open.ts`](../tests/helpers/cat-offline-open.ts) | 離線開檔（沿用） |
| [`tests/helpers/cat-nav-assert.ts`](../tests/helpers/cat-nav-assert.ts) | 導覽／置中量測（沿用） |

---

## 4. 失敗診斷（供執行者參考）

- 置中失敗：執行 `getCatNavSnapshot(frame)` 輸出 `rowCenterDeltaPx`、`scrollTop`（比照 2.3q spec）
- BCD-C 點擊被擋：先收合 `#notesPanel`（`#btnCollapseNotesPanel`）與 `#sfAdvancedPanel`（`#btnToggleAdvancedSF`）；helper 見 `dismissEditorObstructingPanels`
- BCD-D 前置失敗：勿硬性假設固定句段編號的 wf 路徑；Test_Small 匯入後多為 `orig_confirmed`，以 #17 等有譯文句段執行 T→R1 建立；**離線 CAT** 離開編輯器換 mq 身分前，若 prep stage 仍 `active` 會被「檔案準備中」擋下（離線模式 `_isCatPmOrExecutive()` 恆 true、prep UI 按鈕不顯示），helper 應以 `DBService.updateFileWorkflowStageStatus` 完成 prep，勿依賴 LMS 假人切換
- sync 漂移：先 `diff -rq cat-tool public/cat`（排除 `README.md`）
