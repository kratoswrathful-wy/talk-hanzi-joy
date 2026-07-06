狀態：規劃中

# CAT 字數／範圍／導覽／Workflow 變更計畫與碰撞風險文件

> **建立日期**：2026-07-05  
> **分支**：`feature/w9-wave2-c3-case-current-id`  
> **HEAD**：`36a04353` — `docs(cat): 更新 Diff v2 / TB Match v2 計畫（決策、衝突範圍、拆工策略）`  
> **merge-base（與 `main`）**：`a2ca0d21`  
> **本次 commit 不包含任何既有未提交變更**

---

## 0. 文件目的

這份文件**不是**實作規格的最終版，而是「**變更計畫與碰撞風險文件**」。

用途是讓後續 AI 或人工 reviewer 可以判斷：

- 這六項 CAT 變更會動到哪些檔案
- 哪些會互相打架
- 哪些會和 Diff v2 / TB Match v2 或其他進行中改動打架
- 哪些可以先做
- 哪些應暫緩

本文件只整理決策、影響範圍與建議拆工順序；**不包含程式實作**。

---

## 1. 工作區現況

檢查時間：2026-07-05

| 項目 | 值 |
|------|-----|
| 分支 | `feature/w9-wave2-c3-case-current-id` |
| HEAD | `36a04353` |
| merge-base（與 `main`） | `a2ca0d21` |
| staged 檔案 | **無** |
| `cat-tool/app.js` 與 `public/cat/app.js` | **已同步**（MD5 相同） |

### 未提交檔案

| 狀態 | 路徑 |
|------|------|
| modified | `.cursor/settings.json` |
| modified | `.env` |
| modified | `.env.example` |
| modified | `tsconfig.app.tsbuildinfo` |
| untracked | `scripts/_tmp_lint_file.mjs` |
| untracked | `多语言需求拆分0618-繁中.xlsx (1).sdlxliff` |

### 與本計畫的重疊

- **無重疊**：上述未提交檔案皆與本 CAT 六項變更計畫無關。
- 本計畫文件路徑：`docs/CAT_WORDCOUNT_SCOPE_NAV_WORKFLOW_CHANGE_PLAN_2026-07.md`（新增，不觸及其他未提交檔案）。

### 分支自 merge-base 以來的 CAT 相關狀態

- 自 `a2ca0d21` 以來，**未修改** `cat-tool/` 或 `public/cat/` 程式碼。
- 同分支上已有 `docs/CAT_DIFF_V2_TB_MATCH_V2_PLAN_2026-07.md` 等文件更新；Diff v2 / TB Match v2 為進行中規劃，與本六項在 `cat-tool/app.js` 高度重疊。

**明確註記**：本次 commit 只包含本 Markdown 計畫文件，**不包含**任何既有未提交變更。

---

## 2. 已定案產品決策

以下為已定案決策，**不再列為待決問題**。

### 2.1 加權字數：暫時整個停用

包含：

- 停用日常加權字數顯示
- 停用加權字數切換
- 停用字數分析 Modal
- 不保留「即時參考」版本
- 不做固定加權 baseline
- 不做 DB migration

**原因**：目前加權字數會依當下 TM 即時重算（`WordCountEngine.analyze` / worker），TM 內容持續累積，導致同一檔案的加權總字數與進度可能漂移。

**未來方向**（本次不實作）：若重新上架，傾向以「準備完成」作為固定加權基準快照點。

### 2.2 統計排除鎖定句段

所有字數與進度統計的**分母與分子**都要排除鎖定句段。

**先納入排除的鎖定類型**：

- `isLocked`
- `isLockedUser`
- `isLockedSystem`
- **mqxliff 身分鎖定**（已定案：要排除）

**工程上須區分**（避免誤排除）：

| 類型 | 是否排除於統計 | 說明 |
|------|----------------|------|
| 句段本身不可處理的 mqxliff 身分鎖定 | **是** | 例如匯入時 `originalRole` 與目前角色不符、系統判定該身分句段不可編輯 |
| 僅因目前角色、workflow、指派範圍造成的暫時 `isDynamicForbidden` | **否** | 切換角色或範圍後可能恢復可編輯，不應一律視為鎖定排除 |

**後續實作須確認的欄位／helper**（Cursor 實作時逐項核對）：

- `isLocked` / `isLockedUser` / `isLockedSystem` 在 segment 物件上的來源與更新時機
- mqxliff 身分鎖定如何進入 `isDynamicForbidden`（`computeForbiddenForRole`、`originalRole` 等）
- 是否需新建統計專用 helper，例如 `isExcludedFromProgressStats(seg)`，與編輯 forbidden 邏輯分離
- 列表／dashboard 進度（`_computeListWfProgressFromSegments`、`_fillOneFileProgressCell` 等）與編輯器 `sessionValid` 是否共用同一套排除規則

### 2.3 範圍切換預設

使用「**範圍切換模組**」。

**範圍選項**：

1. 整個檔案
2. 我的全部受派範圍
3. 我的個別分段

**預設**：

- 譯者：我的全部受派範圍
- PM 以上：整個檔案
- 譯者若無受派範圍：fallback 先採「整個檔案」（UX 細節見 §9）

### 2.4 句段集模式

使用者看到的是**目前開啟句段集內**的進度，不是母檔整體進度。

工程端以 segment id / assignment 關聯計算，**不要**硬把母檔列號轉成句段集內序號。

### 2.5 準備中 guard

PM 以上帳號也要改成「**先問再改**」，不是現行「先讓使用者改，之後才問」。

所有會改變句段內容或狀態的操作，都應在 **mutation 前** guard。使用者若取消，原操作不能落地，也不能跳行。

### 2.6 PM 首次審稿確認提示

定義：**本次開啟編輯器後**，第一次以審稿人員身分確認句段時提示一次。

- 不做永久記憶，不寫入使用者偏好
- 若選擇切換成譯者：直接切換為翻譯流程、該句段走翻譯確認、**不寫入審稿確認**

### 2.7 無實質變更後仍要跳轉

譯者在沒有實質變更的狀態下確認先前審稿已確認的句段時：

- 可顯示「無實質變更」
- 圖示維持或回到審稿確認
- 不新增翻譯確認
- 不清除審稿確認
- **但仍**依使用者設定跳到下一個未確認句段或下一句段

---

## 3. 六項變更總覽

| 編號 | 變更 | 目的 | 預估風險 | 是否建議先做 | 是否需要 DB migration |
|------|------|------|----------|--------------|----------------------|
| 1 | 暫停加權字數顯示 | 避免 TM 漂移造成加權字數／進度不一致 | 低 | **是** | 否 |
| 2 | 範圍切換模組與統計排除鎖定句段 | 進度／字數反映正確範圍且不含鎖定句 | 高 | 否（完整版暫緩） | 否 |
| 3 | 統一大檔／小檔清除篩選後的假游標置中 | 清除篩選後焦點句段視覺一致置中 | 低～中 | **是** | 否 |
| 4 | 準備中 guard 改為 mutation 前阻擋 | PM 在 prep 階段不可先改後問 | 中～高 | 否（最小版可第二批） | 否 |
| 5 | PM 以上首次審稿確認提示是否切換為譯者 | 避免 PM 誤以審稿身分確認 | 中 | 第二批 | 否 |
| 6 | 無實質變更後仍照設定跳轉 | 譯者確認審稿句段時導覽行為符合預期 | 低 | **是** | 否 |

---

## 4. 每項變更的預計影響範圍

### 4.1 暫停加權字數顯示

#### 產品目的

加權字數隨 TM 即時變動，同一檔案數字會漂移，使用者無法信任。暫時全面停用，避免誤導。

#### 預計會動到的檔案

- `cat-tool/app.js`（加權計算、進度列、Modal 觸發）
- `cat-tool/index.html`（加權切換按鈕、字數分析 Modal、拆分提示 Modal 內加權入口）
- `cat-tool/style.css`（若隱藏後需調整版面）
- `public/cat/**`（sync 後）
- **不需要 DB migration**

#### 預計會動到的函式或區塊

- `WordCountEngine.analyze` 及 worker 呼叫鏈（約 4425–27250 區段內多處）
- `updateProgress`（約 26891+）
- `_fillOneFileProgressCell`、`_fillOneViewProgressCell`（約 26929+）
- 加權切換 UI 事件 handler
- 字數分析 Modal 開啟邏輯
- 拆分提示 Modal（約 index.html 2523+）內依加權切份入口

#### 預計 UI 影響

- 編輯器狀態列字數（一般／加權）
- 字數分析 Modal
- 加權切換按鈕
- 專案詳情／句段集清單進度列（若顯示加權）
- 拆分提示 Modal 加權選項

#### 與目前未提交改動的碰撞風險

**無重疊**（未提交檔案不含 `cat-tool/`）

#### 與 Diff v2 / TB Match v2 的碰撞風險

**低度重疊**：主要為獨立 UI 隱藏與進度顯示邏輯；若 Diff v2 同時改 `updateProgress` 或狀態列，需 rebase 協調。

#### 最小修改方案

- 隱藏加權切換、字數 Modal 入口、拆分 Modal 加權選項
- `updateProgress` 固定只算一般字數；跳過 `WordCountEngine` 加權分支

#### 完整修改方案

- 抽出 `progress-display-mode.js` 或 feature flag
- 清理 dead code 與 worker 加權路徑
- 更新 `docs/CAT_VIEW_SPEC.md` 字數章節

#### 驗收項目

- 編輯器、列表、dashboard 皆無加權字數與切換
- 字數分析 Modal 無法開啟
- 拆分提示無加權切份選項
- 一般字數與進度仍正常

---

### 4.2 範圍切換模組與統計排除鎖定句段

#### 產品目的

進度／字數應反映使用者關心的範圍（整檔／受派／分段），且分母分子不含不可處理鎖定句（含 mqxliff 身分鎖定）。

#### 預計會動到的檔案

- `cat-tool/app.js`（進度計算、列表、編輯器 sessionValid）
- `cat-tool/index.html`（範圍 selector UI）
- `cat-tool/style.css`
- 建議新建 `cat-tool/js/progress-scope.js`
- `public/cat/**`（sync 後）
- **不需要 DB migration**

#### 預計會動到的函式或區塊

- `updateProgress`、`sessionValid` 計算
- `_computeListWfProgressFromSegments`
- `_fillOneFileProgressCell`、`_fillOneViewProgressCell`
- `_fillDashboardAssignmentProgressCell`
- `computeForbiddenForRole`、`isDynamicForbidden` 相關
- mqxliff 鎖定：`isLockedSystem`、`originalRole` 映射
- 新建 `isExcludedFromProgressStats(seg)`（建議）

#### 預計 UI 影響

- 編輯器狀態列範圍 selector
- 專案詳情檔案清單進度（若第一版也放 selector，見 §9）
- 句段集清單進度
- 儀表板／我的受派檔案進度
- 進度百分比與字數分母分子

#### 與目前未提交改動的碰撞風險

**無重疊**

#### 與 Diff v2 / TB Match v2 的碰撞風險

**高度重疊**：`cat-tool/app.js` 為 Diff v2 主戰場；範圍與統計 helper 若與 `applyUpdateSegmentTarget`、segment 狀態刷新同區修改，衝突機率高。

#### 最小修改方案

- 先做「排除鎖定」統一 helper，套用到編輯器 `updateProgress` 與一處列表進度
- 範圍 selector 僅編輯器、僅「整檔／我的受派」兩態

#### 完整修改方案

- `progress-scope.js`：範圍狀態、預設、fallback、句段集 segment id 集合
- 所有進度觸點共用 `isExcludedFromProgressStats`
- 明確區分 mqxliff 身分鎖定 vs 動態 forbidden
- 文件更新 `docs/CAT_WORKFLOW_*` 進度章節

#### 驗收項目

- 譯者預設「我的全部受派」；PM 預設整檔
- 鎖定句（含 mqxliff 身分鎖定）不計入分子分母
- 動態 forbidden（非鎖定）仍計入
- 句段集模式只算該句段集內句段
- 切換範圍後進度即時更新

---

### 4.3 統一大檔／小檔清除篩選後的假游標置中

#### 產品目的

清除篩選／搜尋後，焦點句段應置中顯示；目前大檔（≥800 句，`CatVirtGrid.shouldUse`）有 `flushFilterAnchorAfterVirtRender`，小檔設 `_filterAnchorPending` 但僅 virt `onAfterRender` 會 flush，小檔通常不置中。

#### 預計會動到的檔案

- `cat-tool/app.js`（`runSearchAndFilter`、`flushFilterAnchorAfterVirtRender`、`scheduleEditorFocus`）
- `public/cat/**`（sync 後）
- **不需要 DB migration**

#### 預計會動到的函式或區塊

- `runSearchAndFilter`（約 8716–8846）
- `flushFilterAnchorAfterVirtRender`（約 2887–2904）
- `scheduleEditorFocus`（約 20146–20177）
- 小檔清除篩選路徑（約 21915–21947、22232+）
- `CatVirtGrid.shouldUse` 門檻（>800）

#### 預計 UI 影響

- CAT 編輯器句段列
- 假游標／捲動位置
- 篩選／搜尋列清除後行為

#### 與目前未提交改動的碰撞風險

**無重疊**

#### 與 Diff v2 / TB Match v2 的碰撞風險

**低～中度**：導覽與 virt 捲動路徑可能與大檔效能改動相鄰；通常可獨立小 patch。

#### 最小修改方案

- 小檔清除篩選後直接呼叫與大檔等效的 anchor flush（或共用 `flushFilterAnchorAfterRender`）

#### 完整修改方案

- 抽象「篩選錨點置中」不分 virt／non-virt
- 回歸測試大檔 virt 與小檔

#### 驗收項目

- 大檔、小檔清除篩選後焦點句段皆置中
- 不引入多餘 sleep；以 DOM／捲動狀態斷言

---

### 4.4 準備中 guard 改為 mutation 前阻擋

#### 產品目的

檔案 workflow 為 **prep（準備中）** 時，PM 不應先改句段再被警告；應與譯者一致，mutation 前阻擋。

#### 預計會動到的檔案

- `cat-tool/app.js`（`computeSegmentEditForbidden`、`_maybePmPrepFirstEditWarn`、`applyUpdateSegmentTarget`、`onCtrlEnterConfirm`）
- `cat-tool/index.html`（prep 警告 Modal，若需改時序）
- `public/cat/**`（sync 後）
- **不需要 DB migration**

#### 預計會動到的函式或區塊

- `_maybePmPrepFirstEditWarn`（現行：input **後**、void）
- `computeSegmentEditForbidden`（譯者硬擋）
- `applyUpdateSegmentTarget`（約 1161+）
- `onCtrlEnterConfirm`（約 7042–7149）
- 批次確認、AI 批次寫入等 mutation 入口

#### 預計 UI 影響

- 編輯器譯文輸入
- 確認狀態操作
- workflow 提示 Modal
- PM 操作角色切換（prep 下是否仍允許切換，實作時確認）

#### 與目前未提交改動的碰撞風險

**無重疊**

#### 與 Diff v2 / TB Match v2 的碰撞風險

**高度重疊**：`applyUpdateSegmentTarget` 為 Diff v2 / TB Match v2 核心修改點。

#### 最小修改方案

- 在 `applyUpdateSegmentTarget` 與 `onCtrlEnterConfirm` 入口加 prep guard；PM 取消則不寫入、不跳行
- 保留現有 Modal 文案

#### 完整修改方案

- 統一 `guardBeforeSegmentMutation(reason)` 涵蓋 prep、鎖定、唯讀
- 所有 mutation 路徑（含批次、AI）單一入口

#### 驗收項目

- prep 檔：PM 編輯／確認前彈窗；取消則無變更、無跳行
- prep 檔：譯者仍不可編輯
- 非 prep 檔：行為不變

---

### 4.5 PM 以上首次審稿確認提示是否切換為譯者

#### 產品目的

PM 開檔預設審稿身分（`currentWfSessionKind='review'`），首次審稿確認前提示是否改以譯者身分確認，避免誤寫審稿確認。

#### 預計會動到的檔案

- `cat-tool/app.js`（`onCtrlEnterConfirm`、`_isActingAsReviewer`、`btnPmActingRole`、`applyWorkflowConfirmToSegment`）
- `cat-tool/index.html`（新 Modal 或沿用 workflow 提示）
- `public/cat/**`（sync 後）
- **不需要 DB migration**

#### 預計會動到的函式或區塊

- `onCtrlEnterConfirm`（約 7042–7149）
- `_isActingAsReviewer`（約 6876+）
- `btnPmActingRole` 切換邏輯
- `applyWorkflowConfirmToSegment`
- session 級「本次開檔已提示」旗標（記憶體 only，不持久化）

#### 預計 UI 影響

- PM 操作角色切換
- workflow 提示 Modal
- 確認狀態圖示（審稿 vs 翻譯）

#### 與目前未提交改動的碰撞風險

**無重疊**

#### 與 Diff v2 / TB Match v2 的碰撞風險

**中度**：`onCtrlEnterConfirm` 可能與確認流程改動相鄰；通常可獨立小 feature。

#### 最小修改方案

- 僅在 PM + review 身分 + 本次開檔第一次確認時插 Modal
- 選譯者 → 切 `btnPmActingRole`、走翻譯確認

#### 完整修改方案

- 與 §4.4 guard 框架整合
- 與 §4.6 無實質變更跳轉邏輯一起測

#### 驗收項目

- 本次開檔第一次審稿確認有提示；同 session 不再提示
- 選譯者：翻譯確認、無審稿確認
- 選審稿：正常審稿確認
- 重開編輯器：再次提示

---

### 4.6 無實質變更後仍照設定跳轉

#### 產品目的

譯者對「審稿已確認、自己無改動」的句段再按確認，應顯示無實質變更，但**仍**依設定跳下一未確認或下一句。

#### 預計會動到的檔案

- `cat-tool/app.js`（`onCtrlEnterConfirm` 約 7126–7128：`review_confirmed` + 譯者 → `focusNext: false` 為根因）
- `public/cat/**`（sync 後）
- **不需要 DB migration**

#### 預計會動到的函式或區塊

- `onCtrlEnterConfirm`（7126–7128 分支）
- `maybeRestoreReviewFromSnapshot`（已有 `focusNext: true` 可對照）
- 跳轉設定（下一未確認 vs 下一句）

#### 預計 UI 影響

- 確認後跳行／置中
- 「無實質變更」toast 或等效提示
- 確認狀態圖示不變

#### 與目前未提交改動的碰撞風險

**無重疊**

#### 與 Diff v2 / TB Match v2 的碰撞風險

**低～中度**：限 `onCtrlEnterConfirm` 小範圍；與 §4.5 同檔但可不同 commit。

#### 最小修改方案

- 將譯者 + `review_confirmed` 無實質變更分支的 `focusNext: false` 改為 `true`（或依使用者跳轉設定）

#### 完整修改方案

- 統一「確認後導覽」helper，與 §4.3 置中邏輯一致

#### 驗收項目

- 無實質變更：有提示、圖示不變、仍跳下一未確認／下一句
- 有實質變更：仍走翻譯確認流程

---

## 5. 建議實作順序

依目前工作區（`cat-tool/` 乾淨、Diff v2 計畫已存在、未提交檔與 CAT 無關）排序。

### 第一批：低風險，可優先做

| 順序 | 項目 | 理由 |
|------|------|------|
| 1 | 暫停加權字數顯示 | UI 隱藏為主，與 Diff v2 核心路徑重疊少 |
| 2 | 無實質變更後仍照設定跳轉 | 單一分支修改，行為明確 |
| 3 | 小檔清除篩選置中 | 獨立導覽路徑，回歸面小 |

### 第二批：中風險，需要小心 rebase

| 順序 | 項目 | 理由 |
|------|------|------|
| 4 | PM 首次審稿確認提示 | 觸及 `onCtrlEnterConfirm`，與 #6 可同批測試 |
| 5 | 準備中 guard 最小版 | 觸及 `applyUpdateSegmentTarget`，需避開 Diff v2 大改期 |

### 第三批：高風險，建議暫緩或獨立規格化

| 順序 | 項目 | 理由 |
|------|------|------|
| 6 | 範圍切換模組完整實作 | 跨多進度觸點，需新模組與 mqxliff 統計 helper |
| 7 | 準備中 guard 完整版 | 需掃所有 mutation 入口 |
| 8 | 固定加權 baseline | **本次不做**；與 #1 停用決策衝突，僅作未來選項 |

---

## 6. 建議先不要實作的項目

| 項目 | 暫緩原因 | 會打架的計畫／檔案 | 建議時機 |
|------|----------|-------------------|----------|
| 範圍切換完整版 | 觸點多、需新 helper、與進度全線重算 | `cat-tool/app.js`、Diff v2 | Diff v2 Phase 1 穩定或拆出 `progress-scope.js` 後 |
| 準備中 guard 完整版 | 所有 mutation 入口盤點 | `applyUpdateSegmentTarget`、AI 批次 | 與 Diff v2 錯開或同一 refactor 分支規劃 |
| 固定加權 baseline | 產品已決定整個停用 | 字數 worker、DB 欄位 | 產品重新定義 baseline 規格後 |
| 與 Diff v2 同 PR 混做六項 | `app.js` 衝突幾乎必然 | `docs/CAT_DIFF_V2_TB_MATCH_V2_PLAN_2026-07.md` | 分 commit／分分支 |
| 實作中 sync `public/cat/` | 應在 `cat-tool/` 穩定後一次 sync | `public/cat/**` | 每批 cat-tool 變更 commit 後 `npm run sync:cat` |

---

## 7. 可先做的安全 commit 候選

### 候選 A：停用加權字數 UI 與計算

- **commit 名稱建議**：`fix(cat): disable weighted word count display and analysis`
- **預計修改檔案**：`cat-tool/app.js`、`cat-tool/index.html`、（可選）`cat-tool/style.css` → sync `public/cat/**`
- **為什麼相對安全**：以隱藏與短路為主，不改 segment mutation
- **可能碰撞點**：`updateProgress` 若 Diff v2 同改需 rebase
- **回滾方式**：revert 單 commit + sync cat

### 候選 B：無實質變更仍跳轉

- **commit 名稱建議**：`fix(cat): focus next segment after no-op translator confirm on review-confirmed`
- **預計修改檔案**：`cat-tool/app.js` → sync `public/cat/**`
- **為什麼相對安全**：行數少、行為單元可測
- **可能碰撞點**：`onCtrlEnterConfirm` 與 §4.5 同函式
- **回滾方式**：revert 單 commit

### 候選 C：小檔清除篩選 anchor 置中

- **commit 名稱建議**：`fix(cat): center filter anchor for non-virtual scroll after clear`
- **預計修改檔案**：`cat-tool/app.js` → sync `public/cat/**`
- **為什麼相對安全**：導覽層，不動 TM／TB／Diff
- **可能碰撞點**：virt 捲動大改時需重測
- **回滾方式**：revert 單 commit

---

## 8. 後續給 AI 參考的重點

後續 AI 讀本文件時，應**優先**注意：

1. **`cat-tool/app.js` 是最大碰撞點** — 六項中有四項直接依賴，且與 Diff v2（`applyUpdateSegmentTarget`、`termMatches`、`decorateTbInlineHintsForSegId`、`renderLiveTmMatches`）及 TB Match v2 重疊。
2. **`public/cat/**` 應只在 `cat-tool/` 變更完成後** 執行 `npm run sync:cat`，勿手改 `public/cat/`。
3. **Diff v2 / TB Match v2 與本六項不應同一 PR 混做**；開工順序見 §9 待確認。
4. **範圍切換與準備中 guard 完整版不應與大型 `app.js` 重構同時進行** — 建議獨立分支或等 Diff v2 Phase 1 landing。
5. **mqxliff 身分鎖定已決定要排除於統計**，但實作時**不能**粗暴排除所有 `isDynamicForbidden` — 須建 `isExcludedFromProgressStats` 類 helper，區分身分鎖定 vs 角色／範圍暫禁。
6. **架構規則**：新邏輯優先 `cat-tool/js/<feature>.js`，避免在 `app.js` 大量新增（W7 凍結規則）。
7. **測試**：Playwright 測試模式；權限／workflow 相關需確認 active persona（見 `testing.mdc` §6）。

---

## 9. 仍需產品確認的問題

以下**尚未定案**，實作前需與產品確認：

1. **譯者沒有受派範圍時**，fallback 是「整個檔案」還是「目前可見範圍」？（文件 §2.3 暫定整檔）
2. **範圍 selector 第一版**是否只放在編輯器狀態列，還是也要放到專案詳情檔案列？
3. **加權停用時**，拆分提示 Modal 中依加權切份的入口是否一併隱藏？（傾向：**一起隱藏**）
4. **Diff v2 / TB Match v2 的開工順序**是否要排在本六項之前或之後？

---

## 10. 本次未實作聲明

**本文件只建立計畫與碰撞風險說明，未實作任何功能。**

- 未修改 `cat-tool/app.js`、`cat-tool/index.html`、`public/cat/**` 或任何程式碼
- 未執行 `npm run sync:cat`
- 未新增 DB migration
- 未變更 `.env`、`.cursor/settings.json`、`tsconfig.app.tsbuildinfo` 等既有未提交檔案

---

## 附錄 A：並行實作代號與分支（2026-07-06）

**勿使用 `W1` 前綴**（與主計畫 W1～W10 工程工項衝突）。本文件六項變更中，已進入並行實作者：

| 變更編號 | 新代號 | 分支 | commit |
|----------|--------|------|--------|
| 1 暫停加權字數 | **BCD-B** | `feature/cat-disable-weighted-word-count` | `941cdd77` |
| 3 清除篩選置中 | **BCD-C** | `feature/cat-filter-clear-centering` | `8a3976d8` |
| 6 noop 仍跳轉 | **BCD-D** | `feature/cat-noop-confirm-navigation` | `8a30f5f0` |

Diff/TB 引擎（與本六項碰撞評估相關）：**ENG-P1**，分支 `feature/cat-diff-tb-eng-p1`，commit `f7191182`。

PR／併入順序與 CI 鐵律：[`CAT_BCD_PARALLEL_MERGE_PLAN_2026-07.md`](CAT_BCD_PARALLEL_MERGE_PLAN_2026-07.md)。

---

## 附錄：相關文件

- [`docs/CAT_BCD_PARALLEL_MERGE_PLAN_2026-07.md`](CAT_BCD_PARALLEL_MERGE_PLAN_2026-07.md) — 並行波次 PR／併入流程（ENG-P1 + BCD-B/C/D）
- [`docs/CAT_DIFF_V2_TB_MATCH_V2_PLAN_2026-07.md`](CAT_DIFF_V2_TB_MATCH_V2_PLAN_2026-07.md) — Diff v2 / TB Match v2 計畫與衝突範圍
- [`docs/CAT_WORKFLOW_CONFIRM_STATUS_UX_2026-06.md`](CAT_WORKFLOW_CONFIRM_STATUS_UX_2026-06.md) — 確認狀態五態
- [`docs/CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md`](CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md) — prep 階段規格
- [`docs/CAT_LARGE_FILE_VIRTUAL_SCROLL_NAV_DEVLOG_2026-07.md`](CAT_LARGE_FILE_VIRTUAL_SCROLL_NAV_DEVLOG_2026-07.md) — 大檔虛擬捲動與導覽
- [`.cursor/rules/architecture.mdc`](../.cursor/rules/architecture.mdc) — `app.js` 凍結與 `js/` 模組規則
