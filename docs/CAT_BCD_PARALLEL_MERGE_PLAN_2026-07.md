狀態：已驗收，細節以程式為準

# CAT 並行波次 PR／併入流程（BCD 字數／篩選／確認 + ENG-P1 引擎）

> **建立日期**：2026-07-06  
> **用途**：多分支並行開發後，序列化 PR／併入 `main` 的操作規劃與代號對照。  
> **碰撞背景**：[`CAT_WORDCOUNT_SCOPE_NAV_WORKFLOW_CHANGE_PLAN_2026-07.md`](CAT_WORDCOUNT_SCOPE_NAV_WORKFLOW_CHANGE_PLAN_2026-07.md)  
> **引擎背景**：[`CAT_DIFF_V2_TB_MATCH_V2_PLAN_2026-07.md`](CAT_DIFF_V2_TB_MATCH_V2_PLAN_2026-07.md) §工項代號與分支命名

---

## 0. 代號與分支命名（2026-07-06 定案）

**勿使用 `W1` 作為本波前綴**——與 [`ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md`](ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md) 的 **W1～W10** 工程工項編號衝突。

| 新代號 | 舊暱稱（勿再用） | 內容 | Git 分支（正式） | 目標 commit | Commit 前綴（新） |
|--------|------------------|------|------------------|-------------|-------------------|
| **ENG-P1** | W1-A | Diff/TB 純引擎 + tests（不接線） | `feature/cat-diff-tb-eng-p1` | `f7191182` | `[ENG-P1]` |
| **BCD-B** | W1-B | 暫停加權字數 UI | `feature/cat-disable-weighted-word-count` | `941cdd77` | `[BCD-B]` |
| **BCD-C** | W1-C | 小檔清除篩選後假游標置中 | `feature/cat-filter-clear-centering` | `8a3976d8` | `[BCD-C]` |
| **BCD-D** | W1-D | noop 確認後仍照設定跳轉 | `feature/cat-noop-confirm-navigation` | `8a30f5f0` | `[BCD-D]` |

**舊分支名（已推送，待 PR 改用新名後可刪）**：

- `feature/cat-diff-tb-phase1-engines` → 同 SHA `f7191182`，請改追 `feature/cat-diff-tb-eng-p1`
- `feature/w1-b-disable-weighted-word-count` → `feature/cat-disable-weighted-word-count`
- `feature/w1-c-filter-anchor-nonvirt` → `feature/cat-filter-clear-centering`
- `feature/w1-d-noop-confirm-navigation` → 與新名相同（僅去掉 `w1-` 前綴的舊名：`feature/w1-d-noop-confirm-navigation`）

**歷史 commit 訊息**仍可能含 `[W1-A]`／`[W1-B]` 等，**保留不 amend**；新 commit 一律用上表「Commit 前綴（新）」。

**責任分工**：

- **ENG-P1**：Diff/TB 引擎（他人或引擎窗口）
- **BCD-B／C／D**：字數／篩選／確認跳轉（Cursor BCD 窗口）

---

## 1. 併入前確認清單

| 檢查項 | 通過條件 |
|--------|----------|
| ENG-P1 本機 tip | `git log -1` = `f7191182`，且 `git reset --hard origin/feature/cat-diff-tb-eng-p1`（或 `origin/feature/cat-diff-tb-phase1-engines` 同 SHA） |
| 四分支無 `public/cat/**` | 各 commit 與 `origin/main...branch` diff 不含 `public/cat` |
| 四分支無額外未提交變更 | 遠端各 1 個 feature commit；本機工作區勿 stage `.env` 等 |
| 相對最新 `main` 無 conflict marker | `git merge-tree $(git merge-base origin/main BRANCH) origin/main BRANCH` 無 `<<<<<<<` |
| rebase | 併入前各分支 **rebase `origin/main`**，push `--force-with-lease` |

---

## 2. 建議併入順序

```
ENG-P1 → BCD-B → BCD-C → BCD-D →（main 上）sync:cat 獨立 commit
```

| 步 | 代號 | 理由 |
|----|------|------|
| 1 | **ENG-P1** | 純新檔 + vitest，不碰 `app.js` |
| 2 | **BCD-B** | `app.js` 加權區 + `index.html` |
| 3 | **BCD-C** | `app.js` 篩選 anchor（~20177） |
| 4 | **BCD-D** | `app.js` `onCtrlEnterConfirm`（~7125） |

---

## 3. 每步 PR 與 CI

### PR-1：ENG-P1

- **分支**：`feature/cat-diff-tb-eng-p1` → `main`
- **標題**：`[ENG-P1] feat(cat): add shared CAT text engines (Phase 1, no wiring)`
- **Merge 前**：

```powershell
npm run check:encoding
npm run typecheck
npm run lint
npm run test:cat
```

### PR-2：BCD-B

- **分支**：`feature/cat-disable-weighted-word-count` → `main`
- **標題**：`[BCD-B] fix: disable weighted word count UI`
- **Merge 前**：encoding → typecheck → lint（可選 `test:cat` 回歸）

### PR-3：BCD-C

- **分支**：`feature/cat-filter-clear-centering` → `main`
- **標題**：`[BCD-C] fix: center filter anchor on non-virtual grid`
- **Merge 前**：encoding → typecheck → lint

### PR-4：BCD-D

- **分支**：`feature/cat-noop-confirm-navigation` → `main`
- **標題**：`[BCD-D] fix: keep confirm navigation on noop translator confirm`
- **Merge 前**：encoding → typecheck → lint

**ENG-P1 併入 `main` 後**，後續各步與 `main` 上皆可跑 `npm run test:cat`。

---

## 4. 序列化併入時間軸

```
[前置] ENG-P1 本機 reset → 四分支 rebase origin/main
    ↓
[PR-1] ENG-P1 → CI 綠 → 擁有者核准 → merge main
    ↓ main：encoding / typecheck / lint / test:cat
[PR-2] BCD-B rebase → CI → 核准 → merge
    ↓
[PR-3] BCD-C rebase → CI → 核准 → merge
    ↓
[PR-4] BCD-D rebase → CI → 核准 → merge
    ↓
[收尾] 僅在 main（四 PR 全綠後）：
    npm run sync:cat
    git add public/cat
    git commit -m "chore(cat): sync public/cat after ENG-P1 + BCD-B/C/D"
    push main
    ↓
[驗收] Claude Playwright／CAT 抽查（BCD 行為）
```

---

## 5. 鐵律（每張 PR 必守）

1. **禁止**在任一 feature 分支執行 `npm run sync:cat` 或 commit `public/cat/**`
2. `sync:cat` **只在** ENG-P1 + BCD-B/C/D **全部**進 `main` 且 CI 綠燈後，於 **`main` 執行一次**，**獨立 commit**
3. merge 若 `public/cat` 衝突 → 以 `main` 上 `cat-tool/` 為準 **重跑 sync**，禁止手動合併
4. 一題一分支；跨主題回 `main` 重開
5. **禁止**在未核准前自行 merge 到 `main`

---

## 6. 衝突預期（摘要）

- ENG-P1 與 BCD-B/C/D：**無檔案重疊**
- BCD-B + C + D 同改 `app.js`：**hunk 不重疊**，merge-tree 預期 **auto-merge**（無 `<<<<<<<`）
- 併入前仍須 rebase 最新 `main` 並重跑 CI

---

## 7. 併入完成紀錄（2026-07-06）

五項 PR 已全部 merge 進 `main`（`main` tip：`49a336b5`）。**`sync:cat` 已於 `0312648c` 完成**；BCD 波次 Playwright 驗收 **已結案**（2026-07-07，見 §10）。

| 項目 | PR | merge commit | 備註 |
|------|-----|--------------|------|
| Docs 並行計畫 | #16 | `b2931191` | 本文件初版 |
| **ENG-P1** | #14 | `bf879ced` | 引擎 6 檔 + vitest |
| **BCD-B** | #17 | `7d7d2508` | `app.js` + `index.html` |
| **BCD-C** | #18 | `4ce3ceec` | `app.js` +4 行 |
| **BCD-D** | #21 | `49a336b5` | `app.js` noop 分支 1 行 |
| **sync:cat** | — | `0312648c` | `public/cat/` 與 `cat-tool/` 同步 |
| **BCD Playwright spec** | #23 | `6f6c4d68` | `tests/cat-bcd-wave-acceptance.spec.ts` |
| **BCD spec 穩定化** | #25 | `be04fd03` | helper／prep gate／docs（2026-07-06T12:41:57Z） |

**流程偏差（已驗收可接受）**：BCD-D PR #21 遠端 head 曾為 `e62e6e6c`（含額外 merge commit），非原先 feature tip `8a30f5f0`；但 PR diff 與 merge 後實際變更仍僅 `cat-tool/app.js` 1 行。後續同類分支應避免 head 被額外 merge commit 改寫；若發生，必須回報 head SHA 與實際 diff。

**rebase 實際執行**：BCD-B/C/D 併入時經擁有者核准，**未**強制 rebase 到最新 `main`（GitHub 已 CLEAN／MERGEABLE、CI 綠、diff 極小）。

---

## 8. sync:cat 窗口期保護（Fable 5 協調，2026-07-06）— **已結束**

> **2026-07-07 更新**：`sync:cat` 已於 `main` 以獨立 commit `0312648c` 完成；窗口期結束。以下條文保留作歷史協調紀錄。

### 8.1 窗口期定義（歷史）

**窗口期內禁止**：

- 任何工項（含 CAT hotfix）**單獨**執行 `npm run sync:cat` 或 commit `public/cat/**`，除非**先與 BCD 波次協調**並取得擁有者／驗收方核准。
- 否則中途 hotfix 可能把**尚未完成 sync 收尾**或**尚未驗收**的 CAT 變更帶上正式站（Vercel 部署讀 `public/cat/`）。

### 8.2 統一 sync 規則

1. `sync:cat` **只能**在 ENG-P1 + BCD-B/C/D **全部**進 `main` 後，於 **`main` 上執行一次**。
2. sync commit **必須獨立提交**（不與功能、lint、docs 混在同一 commit）。
3. sync commit 完成後，執行者須回報 **commit SHA**。
4. 驗收方須做 **`cat-tool/` 與 `public/cat/` 一致性檢查**（含 `app.js`／`index.html` 與新 `js/` 引擎檔）。
5. 若 sync **之前**有任何其他 CAT hotfix 要碰 `cat-tool/` 或 `public/cat/`，**必須先協調**窗口負責人，不得自行 sync 或手改 `public/cat/`。

建議收尾指令（僅在 `main`、窗口期結束時）：

```powershell
Set-Location "c:\Homemade Apps\1UP TMS"
git checkout main
git pull origin main
npm run sync:cat
git add public/cat
git commit -m "chore(cat): sync public/cat after ENG-P1 + BCD-B/C/D"
git push origin main
```

### 8.3 工程主線邊界

- **R2 gate 生效後**，BCD **後續**分支 push 前也須通過 **lint / typecheck / test**（與 ENG-P1 同等門檻）。
- **不得**把 repo-wide lint cleanup 混入 BCD 功能 PR。
- 若 BCD 後續需要修改以下 **store 相關檔案**，**必須先停工**並知會驗收方／規劃者——該區為階段四 **W1 store 工廠重構**目標，與 CAT 波次無關：
  - `src/stores/case*`
  - `src/stores/fee*`
  - `src/stores/invoice*`
  - `src/stores/client-invoice*`
  - `src/stores/internal-notes*`

### 8.4 多角色指令衝突處理

- 多個角色對 Cursor 下指令時，若指令**衝突**，以**較嚴格者**為準。
- 若無法判定哪個較嚴格，Cursor **必須停下回報**，**不可**自行選一個執行。
- 若有人要求 **merge、sync:cat、修改禁止檔案、繞過測試或擴大範圍**，而另一份規則**禁止**，必須停下回報。
- **純 CAT 功能**屬**慢軌**（涉及核心管線）。
- **文件與標記**屬**快軌**。
- **新 PR 標題**與**新 commit 前綴**只使用：`ENG-P1`、`BCD-B`、`BCD-C`、`BCD-D`。
- **不要再使用** `W1-A/B/C/D` 作為新 PR 標題或新 commit 前綴。
- 既有歷史 commit message 中的 `[W1-*]` **不 amend**，視為歷史殘留。

---

## 9. 收尾完成紀錄（2026-07-07）

- [x] 本文件 §8 窗口期保護併入 `main`（docs PR #16 等）
- [x] `main` 上執行 `sync:cat` 獨立 commit（`0312648c`）
- [x] PR #23 BCD Playwright acceptance specs（merge `6f6c4d68`）
- [x] PR #25 穩定 BCD acceptance specs（merge `be04fd03`）
- [x] Cursor smoke：BCD-B/C/D 3/3 pass
- [x] Claude browser acceptance：BCD-B/C/D 3/3 pass
- [x] BCD-B/C/D **驗收完成**；**等待下一波工單**，不再追加本波 CAT 程式碼變更

---

## 10. 驗收結案摘要

**最終狀態**：`ENG-P1 + BCD-B/C/D implementation merged + sync completed + Cursor smoke pass + Claude browser acceptance pass`

| 驗收項 | 結果 |
|--------|------|
| BCD-B | pass — 加權字數 UI 入口皆不可見 |
| BCD-C | pass — 小檔 non-virtual grid 清除篩選後錨點置中（`rowCenterDeltaPx=0`） |
| BCD-D | pass — `review_confirmed` noop `Ctrl+Enter` 後狀態不變、焦點跳下一句 |

詳細 Playwright 規格與診斷：[`CAT_BCD_WAVE_PLAYWRIGHT_ACCEPTANCE_2026-07.md`](CAT_BCD_WAVE_PLAYWRIGHT_ACCEPTANCE_2026-07.md) §0。
