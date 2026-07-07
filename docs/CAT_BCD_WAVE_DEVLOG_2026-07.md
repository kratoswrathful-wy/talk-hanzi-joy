狀態：已驗收，細節以程式與連結文件為準

# ENG-P1 + BCD-B/C/D 波次 — 開發紀錄（DEVLOG）

> **建立日期**：2026-07-07  
> **讀者**：未來 AI agent、人工 reviewer  
> **性質**：決策脈絡與時序摘要，**非**逐字聊天紀錄。  
> **相關文件**：[`CAT_BCD_PARALLEL_MERGE_PLAN_2026-07.md`](CAT_BCD_PARALLEL_MERGE_PLAN_2026-07.md)、[`CAT_BCD_WAVE_PLAYWRIGHT_ACCEPTANCE_2026-07.md`](CAT_BCD_WAVE_PLAYWRIGHT_ACCEPTANCE_2026-07.md)、[`CAT_WORDCOUNT_SCOPE_NAV_WORKFLOW_CHANGE_PLAN_2026-07.md`](CAT_WORDCOUNT_SCOPE_NAV_WORKFLOW_CHANGE_PLAN_2026-07.md)

---

## 1. 最終狀態

```
ENG-P1 + BCD-B/C/D implementation merged + sync completed + Cursor smoke pass + Claude browser acceptance pass + docs closeout merged
```

BCD-B/C/D **已驗收完成**；本波 **不再追加 CAT 程式碼**、**不再執行 `sync:cat`**；**等待下一波工單**。

---

## 2. 重要 PR／commit 對照

| 項目 | PR | merge commit | 備註 |
|------|-----|--------------|------|
| **ENG-P1**（Diff/TB 純引擎 + vitest，不接線） | #14 | `bf879ced` | `cat-tool/js/` 新模組 |
| **BCD-B**（停用加權字數 UI） | #17 | `7d7d2508` | `app.js` + `index.html` |
| **BCD-C**（小檔清除篩選後置中） | #18 | `4ce3ceec` | non-virt `flushFilterAnchorAfterVirtRender` |
| **BCD-D**（noop 確認後仍跳轉） | #21 | `49a336b5` | `onCtrlEnterConfirm` noop 分支 |
| **sync:cat** | — | `0312648c` | 僅 `public/cat/**`，獨立 commit |
| BCD Playwright acceptance spec | #23 | `6f6c4d68` | 初版 `tests/cat-bcd-wave-acceptance.spec.ts` |
| BCD spec 穩定化 | #25 | `be04fd03` | helper／prep gate；**不改 CAT 產品** |
| Docs 驗收結案 | #28 | `4989fdaa` | head `12bc2921` |

併入流程與窗口期規則初版：docs PR #16（`b2931191`）。

---

## 3. 本波主要目標

| 代號 | 內容 | 使用者應感受到 |
|------|------|----------------|
| **ENG-P1** | Diff/TB 共用引擎 + `npm run test:cat` | **無 UI 變化**（刻意不接 `app.js`） |
| **BCD-B** | 加權字數 UI 全面隱藏 | 編輯器／列表不再出現加權切換與相關入口 |
| **BCD-C** | 小檔（non-virtual grid）清除篩選後錨點置中 | 清除篩選後焦點句段仍在視窗內合理置中 |
| **BCD-D** | 譯者於 `review_confirmed` 句段 noop `Ctrl+Enter` | Workflow 狀態不變，焦點仍跳下一句 |

背景決策見 [`CAT_WORDCOUNT_SCOPE_NAV_WORKFLOW_CHANGE_PLAN_2026-07.md`](CAT_WORDCOUNT_SCOPE_NAV_WORKFLOW_CHANGE_PLAN_2026-07.md)（加權因 TM 漂移暫停、小檔置中補洞、noop 跳轉對齊一般確認 UX）。

---

## 4. sync:cat 決策脈絡

**為何等四項都進 `main` 才 sync？**

1. **四 feature 分支禁止**各自 commit `public/cat/**`，避免中途部署（Vercel 讀 `public/cat/`）帶上未驗收或半套 CAT 變更。  
2. **ENG-P1 與 BCD-B/C/D 同波併入**後，`cat-tool/` 才代表完整意圖；一次 sync 可保證靜態輸出與原始碼一致。  
3. **窗口期**（2026-07-06～07）：`cat-tool/` 與 `public/cat/` 刻意不同步，任何 hotfix 須先與 BCD 波次協調，禁止單獨 sync。

**sync commit 規則**

- 只在 **`main`**、四 PR 全綠後執行 **一次** `npm run sync:cat`。  
- commit **必須獨立**，訊息慣例 `chore(cat): sync public/cat after ENG-P1 + BCD-B/C/D`，**只含** `public/cat/**`。  
- 實際 sync commit：**`0312648c`**。窗口期於 sync 完成後結束。

---

## 5. 驗收流程與分工

| 階段 | 執行者 | 目的 |
|------|--------|------|
| 程式審查 + `test:cat` 39/39 | 驗收方獨立 clone | 確認引擎與回歸腳本 |
| **Cursor smoke** | Cursor（本機 Playwright） | 先抓 **自動化／helper／環境** 問題；`-g "BCD 波次"` |
| **Claude browser acceptance** | Claude（獨立實機） | **獨立**驗證瀏覽器行為；**未強制**跑 Playwright，重點是 §1.3 行為是否成立 |

Playwright spec（#23、#25）是 **參考實作與回歸捷徑**，不是 Claude 驗收的唯一路徑。兩路皆 3/3 pass 後，才標記 BCD-B/C/D 驗收完成。

驗收規格：[`CAT_BCD_WAVE_PLAYWRIGHT_ACCEPTANCE_2026-07.md`](CAT_BCD_WAVE_PLAYWRIGHT_ACCEPTANCE_2026-07.md)。  
本機登入／session 交付：[`CAT_BCD_WAVE_PLAYWRIGHT_CLAUDE_RUNBOOK_2026-07.md`](CAT_BCD_WAVE_PLAYWRIGHT_CLAUDE_RUNBOOK_2026-07.md)。

---

## 6. 測試穩定化經驗（PR #25）

Cursor 第一輪 smoke 曾 BCD-C/D fail；trace 判讀後 **暫不歸因產品 bug**，PR #25 **只修測試與文件**。

### BCD-C

- **現象**：點譯文格 timeout，被 `#notesPanel` 或 `#sfAdvancedPanel` 操作列遮擋。  
- **結論**：Playwright helper／操作路徑問題。  
- **修正**：`dismissEditorObstructingPanels`、`focusTargetAtDisplay`；篩選套用後收合面板。

### BCD-D

- **現象**：`reopenEditorAsMqRole` 90s timeout，「檔案準備中」modal 擋離開編輯器。  
- **根因**：離線 CAT 下 `_isCatPmOrExecutive()` 恆 true，prep stage `active` 時離開編輯器被擋，但 wf toolbar **不顯示**「準備完成」按鈕；helper 又曾錯用 `window.DBService`（classic script 全域綁定不在 `window` 上）。另：勿硬性假設 #20 會變 `trans_confirmed`，Test_Small 常用 **#17** 走 T→R1 建立 `review_confirmed`。  
- **結論**：helper 前置與 prep gate 繞道問題，**非** BCD-D 產品邏輯 fail。  
- **修正**：`completeOfflinePrepStageIfActive`、`resolveReviewConfirmedSegmentForTranslator`；移除不必要的 LMS 假人切換（離線 CAT 與假人無關）。

第二輪 Cursor smoke：**3/3 pass**。Claude 獨立 browser acceptance 隨後 **3/3 pass**。

---

## 7. 安全處理原則（本波實際遵守）

| 項目 | 規則 |
|------|------|
| 帳密 | **不**寫入 Git、Slack、runbook 正文或 AI 對話；僅本機 `.env` |
| Session | `playwright/.auth/user.json` 由 `auth.setup` 或人工產生，**人工交付**，**不 commit** |
| 本機 smoke | worktree 已有有效 `user.json` 時可用 `--no-deps` 略過 setup，避免覆寫 session |
| `.env` | **不 commit**；`.env.example` 若更新須不含真實密碼 |

---

## 8. 後續狀態與未納入本波者

**本波已結案。** 下列屬 [`CAT_WORDCOUNT_SCOPE_NAV_WORKFLOW_CHANGE_PLAN_2026-07.md`](CAT_WORDCOUNT_SCOPE_NAV_WORKFLOW_CHANGE_PLAN_2026-07.md) 其他項，**需另開工單**：

- **ENG-P2**：引擎接線進 `app.js`（本波 ENG-P1 刻意不接線）  
- 統計排除鎖定句段、範圍切換模組、準備中 guard 強化  
- 固定加權 baseline、PM 審稿提示等  

**給後續 AI agent 的捷徑**

1. 讀本 DEVLOG §2 對照表 → 確認 `main` 已含 `0312648c` sync。  
2. BCD 行為驗收以 [`CAT_BCD_WAVE_PLAYWRIGHT_ACCEPTANCE_2026-07.md`](CAT_BCD_WAVE_PLAYWRIGHT_ACCEPTANCE_2026-07.md) §0 為準；**勿**因本波已結案再改 CAT 除非新工單。  
3. Playwright 失敗時先查 §6：面板遮擋、離線 prep gate、句段 wf 前置假設。  
4. 任何 `sync:cat` 須有明確工單與擁有者核准，**禁止**隨 hotfix 附帶 sync。

---

## 附錄：時序一覽

```
2026-07-06  ENG-P1 + BCD-B/C/D merge (#14/#17/#18/#21)
         → sync:cat @ 0312648c（窗口期結束）
         → Playwright spec #23 merge
2026-07-06  Cursor smoke 初輪（BCD-C/D fail → 判為測試問題）
         → PR #25 穩定化 helper → merge be04fd03
         → Cursor smoke + Claude acceptance 3/3 pass
2026-07-07  Docs closeout PR #28 merge 4989fdaa → 本波正式結案
```
