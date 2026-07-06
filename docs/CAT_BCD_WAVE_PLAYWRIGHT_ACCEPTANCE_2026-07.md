狀態：已落地待驗收

# BCD 波次 Playwright 驗收規格（sync 後 UI）

> **建立日期**：2026-07-06  
> **前置**：`main` @ `0312648c`（`sync:cat` 收尾後）；程式碼審查與 `test:cat` 39/39 已由驗收方獨立 clone 確認。  
> **本文件補足**：Claude 程式驗收未涵蓋的**瀏覽器實機 UI**回歸。  
> **碰撞背景**：[`CAT_BCD_PARALLEL_MERGE_PLAN_2026-07.md`](CAT_BCD_PARALLEL_MERGE_PLAN_2026-07.md)

---

## 1. 執行環境

| 項目 | 要求 |
|------|------|
| 模式 | **離線 CAT**（`/cat/offline/projects`），與 [`cat-navigation-2-3q.spec.ts`](../tests/cat-navigation-2-3q.spec.ts) 相同 |
| 小檔 fixture | `tests/fixtures/Test_Small.mqxliff`（或 `PLAYWRIGHT_CAT_SMALL_FIXTURE`） |
| 登入 | `playwright/.auth/user.json`（`global-setup`） |
| 禁止 | 測試模式污染正式 Team 資料；**禁止**固定 `sleep`，等待須用 DOM／`data-wf-state`／`getCatNavigationState` |

```powershell
Set-Location "c:\Homemade Apps\1UP TMS"
npx playwright test -g "BCD 波次" --project=chromium
```

---

## 2. 測項與通過條件

### T-BCD-B — 加權字數 UI 停用

| ID | 步驟 | 通過條件 |
|----|------|----------|
| T-BCD-B-1 | 匯入小檔進編輯器 | `CatVirtGrid.isEnabled()` 可為 `false`（小檔） |
| T-BCD-B-2 | 檢查 DOM | `#btnToggleEditorWordMode`、`#btnToggleFileProgressMode`（若存在）含 `hidden` 且 `toBeHidden()` |
| T-BCD-B-3 | 檢查 DOM | `#btnEditorWordCount` 不可見 |

**對應程式**：`_WC_WEIGHTED_UI_DISABLED = true`（BCD-B #17）。

### T-BCD-C — 小檔清除篩選後置中

| ID | 步驟 | 通過條件 |
|----|------|----------|
| T-BCD-C-1 | 確認 `CatVirtGrid.isEnabled() === false` | 非 virtual grid |
| T-BCD-C-2 | 進階篩選加入句段編號範圍（例 `16-22`） | `#sfFilterCountBadge` 出現；可見列數 < 全檔 |
| T-BCD-C-3 | 跳到錨點句段（例 #18）並點譯文格 | `activeSegId` = 錨點 |
| T-BCD-C-4 | 點 `#btnSfClearNav` | `activeSegId` 仍為錨點；`centeredOk === true`；`\|rowCenterDeltaPx\| ≤ 16` |

**對應程式**：`runSearchAndFilter` 結尾 non-virt 呼叫 `flushFilterAnchorAfterVirtRender()`（BCD-C #18）。

### T-BCD-D — noop 確認後仍跳轉

| ID | 步驟 | 通過條件 |
|----|------|----------|
| T-BCD-D-0 | 前置：句段 #20 T 翻譯確認 → R1 審稿確認 → 切回 `T_ALLOW_R1` | 目標列 `data-wf-state="review_confirmed"` |
| T-BCD-D-1 | 譯者身分點該列譯文格，**不修改內容** | 焦點在目標列 |
| T-BCD-D-2 | `Ctrl+Enter` | `activeSegId` **不等於**原句段（已跳下一句） |
| T-BCD-D-3 | 檢查原句段 | `data-wf-state` 仍為 `review_confirmed`（noop，狀態不變） |

**對應程式**：`onCtrlEnterConfirm` noop 分支 `focusNext: true, noop: true`（BCD-D #21）。

---

## 3. 實作對照

| 檔案 | 說明 |
|------|------|
| [`tests/cat-bcd-wave-acceptance.spec.ts`](../tests/cat-bcd-wave-acceptance.spec.ts) | 三項 describe（BCD-B/C/D） |
| [`tests/helpers/cat-bcd-assert.ts`](../tests/helpers/cat-bcd-assert.ts) | 加權 UI、篩選、審稿確認前置、置中斷言 |
| [`tests/helpers/cat-offline-open.ts`](../tests/helpers/cat-offline-open.ts) | 離線開檔（沿用） |
| [`tests/helpers/cat-nav-assert.ts`](../tests/helpers/cat-nav-assert.ts) | 導覽／置中量測（沿用） |

---

## 4. 刻意不測

- ENG-P1 引擎接線（仍無 `app.js` 引用）
- 大檔 virtual grid 清除篩選置中（BCD-C 僅補 non-virt 路徑；大檔行為見 Phase 2.3q spec）
- Team 雲端模式 Workflow 指派（離線即可覆蓋核心邏輯）

---

## 5. 失敗診斷

- 置中失敗：執行 `getCatNavSnapshot(frame)` 輸出 `rowCenterDeltaPx`、`scrollTop`（比照 2.3q spec）
- BCD-D 前置失敗：確認 mqxliff 身分 Modal 可重開；句段 #20 有譯文可確認
- sync 漂移：先 `diff -rq cat-tool public/cat`（排除 `README.md`）
