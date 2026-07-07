狀態：規劃中

# CAT 下一波變更 — 規劃與拆工（2026-07）

> **建立日期**：2026-07-07  
> **性質**：docs-only planning，**不含任何實作**。  
> **基準**：BCD 波次已結案（`ENG-P1 + BCD-B/C/D implementation merged + sync completed + Cursor smoke pass + Claude browser acceptance pass + docs closeout merged`）。  
> **對照文件**：[`CAT_WORDCOUNT_SCOPE_NAV_WORKFLOW_CHANGE_PLAN_2026-07.md`](CAT_WORDCOUNT_SCOPE_NAV_WORKFLOW_CHANGE_PLAN_2026-07.md)（六項母計畫）、[`CAT_BCD_PARALLEL_MERGE_PLAN_2026-07.md`](CAT_BCD_PARALLEL_MERGE_PLAN_2026-07.md)、[`CAT_BCD_WAVE_PLAYWRIGHT_ACCEPTANCE_2026-07.md`](CAT_BCD_WAVE_PLAYWRIGHT_ACCEPTANCE_2026-07.md)、[`CAT_BCD_WAVE_DEVLOG_2026-07.md`](CAT_BCD_WAVE_DEVLOG_2026-07.md)、[`CAT_DIFF_V2_TB_MATCH_V2_PLAN_2026-07.md`](CAT_DIFF_V2_TB_MATCH_V2_PLAN_2026-07.md)、[`ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md`](ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md)、[`CODEMAP.md`](CODEMAP.md)

---

## 1. 一句話結論

**下一波建議先做「候選 1：PM 以上首次審稿確認提示是否切換譯者」**——它範圍明確（記憶體 session 旗標 + 確認前一次性 Modal）、**不需 DB migration**、與剛結案的 BCD-D 同屬 `onCtrlEnterConfirm` 確認／導覽語意脈絡連續、reviewer 熟悉，且**不觸及** Diff v2 主戰場（`applyUpdateSegmentTarget`）與加權字數已停用區，最適合作為一個乾淨的小 PR 開波。

---

## 2. 候選工項比較表

> 對照母計畫代號：候選 1＝母計畫 §4.5；候選 2＝§4.4；候選 3＝§8 baseline（母計畫標「本次不做」）；候選 4＝§4.2；候選 5＝ENG-P2（Diff v2 計畫）。

| 候選 | 使用者價值 | 風險 | 可能修改檔案 | DB migration | 需 `sync:cat` | 測試難度 | 建議先做 |
|------|-----------|------|--------------|:---:|:---:|------|:---:|
| **1. PM 首次審稿確認提示切換譯者** | 中高（避免 PM 誤寫審稿確認） | 中 | `cat-tool/app.js`（`onCtrlEnterConfirm`、`_isActingAsReviewer`、`btnPmActingRole`）、`index.html`（Modal） | 否 | 是（cat-tool 改後） | 中 | **是（首選）** |
| **2. 準備中 guard 改 mutation 前阻擋** | 中（一致的 prep 保護） | 中～高 | `cat-tool/app.js`（`applyUpdateSegmentTarget`、`onCtrlEnterConfirm`、批次／AI 寫入入口）、`index.html` | 否 | 是 | 高（多 mutation 入口） | 第二批（最小版） |
| **3. 固定加權字數 baseline** | 低～中（未來選項） | 高 | 字數 worker、`app.js`、可能 DB 欄位 | **可能是** | 是 | 高 | **否（與 BCD-B 停用衝突，暫緩）** |
| **4. 範圍切換模組** | 高（進度反映正確範圍） | 高 | `cat-tool/app.js`（多進度觸點）、新 `cat-tool/js/progress-scope.js`、`index.html`、`style.css` | 否 | 是 | 高 | 否（拆階段、獨立規格化） |
| **5. ENG-P2：Diff/TB 引擎接線** | 中高（readable diff 上線） | 中 | `cat-tool/js/tm-utils.js`、`cat-tool/index.html`（script 順序）、（可選）小觸 `app.js` | 否 | 是 | 中（需視覺驗收） | 第二批（獨立於候選 1／2） |

**備註**

- 候選 3 與 BCD-B「停用加權字數」為**直接衝突**決策；母計畫 §6／§5 已明列「本次不做，僅作未來選項」。除非產品重新定義 baseline 規格，本波**不排入**。
- 「無實質變更後仍跳轉」（母計畫 §4.6）即為**已結案的 BCD-D**，不再列入。

---

## 3. 建議實作順序

```
第一批（本波先做，低～中風險、互不重疊）
  1) 候選 1：PM 首次審稿確認提示切換譯者      → onCtrlEnterConfirm 小範圍
  2) 候選 5：ENG-P2 Diff 接線（僅 tm-utils）   → 與候選 1 不同檔，可平行審查

第二批（中～高風險，需小心 rebase，錯開 Diff v2 大改期）
  3) 候選 2：準備中 guard 最小版（mutation 前阻擋，先 applyUpdateSegmentTarget + onCtrlEnterConfirm）

第三批（高風險，獨立規格化，暫緩）
  4) 候選 4：範圍切換模組（分階段：先「排除鎖定」helper，再範圍 selector）
  —） 候選 3：固定加權 baseline（等產品重新定義規格）
```

**鐵律**：候選 1／2／5 **不與 Diff v2/TB Match v2 大改同一 PR 混做**；一工項一分支；每批 `cat-tool/` 穩定後才在**同波尾端**單獨 `sync:cat`（獨立 commit，只含 `public/cat/**`）。

---

## 4. 第一個建議工項（候選 1）的 PR 邊界

**分支建議**：`feature/cat-pm-first-review-confirm-prompt`　**commit 前綴**：一般 `fix(cat):`／`feat(cat):`（非 ENG-P*／BCD-*）

**允許修改檔案**
- `cat-tool/app.js`（僅 `onCtrlEnterConfirm`、`_isActingAsReviewer`、`btnPmActingRole` 切換、session 級「本次開檔已提示」記憶體旗標）
- `cat-tool/index.html`（新增或沿用 workflow 提示 Modal）
- （可選）`cat-tool/style.css`（Modal 版面）
- `public/cat/**`（**僅**該波尾端 `npm run sync:cat` 產物，獨立 commit）
- 對應測試：`tests/**`（新增最小回歸）
- 對應文件：母計畫 §4.5 標記進度、`CODEMAP.md` 一行（若需要）

**禁止修改檔案**
- `applyUpdateSegmentTarget` 及其他 segment 內容 mutation 核心（屬候選 2／Diff v2）
- `cat-tool/js/tm-utils.js`、`rev-track*.js`、`cat-diff-engine*`（屬 ENG-P2）
- `src/**`、`.env`、`playwright/.auth/user.json`、`test-results/**`

**不可混入事項**
- 不夾帶 Diff v2/TB、範圍切換、prep guard、加權 baseline 任何程式碼
- 不做 repo-wide lint cleanup
- `sync:cat` 不與功能 commit 混在同一 commit
- 不碰 `src/stores/case*|fee*|invoice*|client-invoice*|internal-notes*`（階段四 W1 保留區）

---

## 5. 候選 1 驗收條件

1. PM／reviewer 開檔後，**本次 session 第一次**以審稿身分確認句段時，跳出一次提示「以審稿身分確認，或改以譯者身分？」。
2. 同一次開檔內**不再重複**提示（記憶體旗標；不寫入使用者偏好）。
3. **重開編輯器**後會**再次**提示（非永久記憶）。
4. 選「譯者」：該句走**翻譯確認**、切 `btnPmActingRole` 為譯者流程、**不寫入審稿確認**。
5. 選「審稿」：正常寫入審稿確認。
6. 非 PM（一般譯者）身分：**無**此提示，行為不變。
7. 提示取消／關閉：不寫入任何確認、不跳行（與 mutation-before-guard 語意一致）。

---

## 6. 候選 1 測試計畫

| 層級 | 內容 |
|------|------|
| **unit（vitest）** | 若可抽出純函式（如「是否應提示」判定：身分＝PM/reviewer ∧ session 未提示過 ∧ 目標為審稿確認），緊鄰原始碼加測（比照 `ai-agent-bridge.clientInfo.test.ts`）。 |
| **integration** | 離線 CAT 開檔 → 模擬審稿確認 → 驗證 session 旗標與 `btnPmActingRole` 狀態轉移。 |
| **Playwright（測試模式）** | 三格式（mqxliff／sdlxliff／一般 XLIFF）擇一 fixture；斷言：首次確認出現 Modal → 選譯者 → `data-wf-state` 走翻譯確認且無審稿確認；同 session 第二次確認**無** Modal；reopen 後**再現** Modal。**斷言前先確認當前生效身分為 PM**（`testing.mdc` §6）；等待用確定訊號，禁固定 sleep。 |
| **manual browser acceptance** | 體感抽查：Modal 出現時機是否干擾流程、選譯者後圖示是否正確、reopen 是否再現（`testing.mdc` §8）。 |

**注意**：路由守衛類不適用假人切換（`testing.mdc` §6）；本工項為 CAT iframe 內行為，以離線 CAT + mq 身分為主，權限負向驗證若不穩改 DB 層模擬。

---

## 7. 與 BCD 波次的銜接注意事項

1. **基準分支**：一律從**含 sync `0312648c` 的最新 `origin/main`** 切出；BCD 波次已把 `cat-tool/` 與 `public/cat/` 同步，勿基於舊 tip。
2. **prep gate 既有行為**：候選 1 觸及 `onCtrlEnterConfirm`，需留意離線 CAT `_isCatPmOrExecutive()` 恆 true 與 prep「檔案準備中」擋離開的既有邏輯（見 BCD-D DEVLOG §6）；測試 helper 可沿用 `completeOfflinePrepStageIfActive` 思路，但**不改** CAT 產品 prep 邏輯（那屬候選 2）。
3. **測試資產沿用**：`tests/cat-bcd-wave-acceptance.spec.ts`／`tests/helpers/cat-bcd-assert.ts` 的面板收合、prep 繞道、mq 身分重開 helper 可直接複用。
4. **窗口期心智模型延續**：功能分支**禁止**單獨 commit `public/cat/**` 或 `sync:cat`；統一在該波尾端於 `main` 單獨 sync。
5. **W7 凍結原則**：新邏輯優先 `cat-tool/js/<feature>.js`；`app.js` 只做最小必要接線（`architecture.mdc` §1）。

---

## 8. 需要你決策的問題清單

1. **首選確認**：同意「候選 1（PM 首次審稿確認提示）」作為下一波第一個小 PR？或你希望改以 **候選 5（ENG-P2）** 開波？
2. **候選 3（加權 baseline）**：確認本波**不做**（與 BCD-B 停用衝突）？或你要重新定義 baseline 規格後排入？
3. **候選 1 提示文案與選項**：Modal 用語（「以審稿身分確認 / 改以譯者身分」）與預設焦點按鈕由誰定？是否需要「本次不再提示」勾選（母計畫傾向**不做**永久記憶）？
4. **ENG-P2 排序**：ENG-P2 屬 Diff v2 大計畫（該計畫標「待其他改動告一段落」）。要與候選 1 同波（不同分支）平行推進，還是等候選 1 結案再單獨開波？
5. **範圍切換（候選 4）**：是否要我先產出獨立的分階段規格文件（先「排除鎖定 helper」最小版），還是整包暫緩到 Diff v2 Phase 1 landing 之後？
6. **Diff v2 / 本波順序**：母計畫 §9 待確認題「Diff v2 開工排在六項之前或之後」尚未定案；需要你裁示，以免 `app.js` 重疊。

---

## 9. 本次未實作聲明

本文件**只做規劃**，未修改任何產品程式、測試或設定；未執行 `sync:cat`；未新增 DB migration；未碰 `.env`／session／密碼檔。
