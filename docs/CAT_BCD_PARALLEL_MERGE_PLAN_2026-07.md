狀態：規劃中

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

## 7. 本次未執行聲明

本文件僅規劃 PR／併入流程；**未** merge 到 `main`、**未** rebase、**未** `sync:cat`。
