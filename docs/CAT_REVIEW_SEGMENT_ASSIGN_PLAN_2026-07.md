狀態：規劃中

# CAT 審稿分段指派與工作狀態改版——執行計畫（工項 A–D）

- **日期**：2026-07-16
- **工單**：`工單_審稿分段指派_2026-07-16.md`
- **正式庫**：`wshsmerltcakffllgyul`
- **紅線（審核通過前）**：**禁止**改 schema／跑 migration／改正式庫；本 PR **僅文件**
- **migration 節奏**：一律 `supabase db push`（見 [`DEV_PIPELINE.md`](DEV_PIPELINE.md)）；禁止 MCP 直套
- **分支策略**：A→D 先後、不同分支；B、C 可與 A 平行；**每工項獨立 PR、獨立驗收，禁止堆同一分支**

---

## 0. 現況摘要（計畫依據，勿當目標）

| 面向 | 現況 |
|---|---|
| LMS 翻譯列 | `cases.collab_rows`（`CollabRow`：人員／範圍／交期／`linkedCatFileId`／`taskCompleted` 等）→ `sync` 寫入 `cat_stage_assignments`（translate） |
| LMS 審稿 | **案件層級** `cases.reviewer`（字串）；`sync` 對每個連結檔呼叫整檔 `cat_upsert_review_stage_assignment(file, user, status)` |
| `CollabRow.reviewer` | 協作表有欄，**未**參與 CAT review sync（審稿真相＝`cases.reviewer`） |
| Review upsert | 僅整檔：無 `collab_row_id`／`view_id`／`line_*`（見 `20260714120000_…sql`） |
| 防降級（2026-07-14） | upsert：既有 `completed` 且 stage 仍 `completed` → 不得洗成非 completed；JS 鏡像於 `wf-assignment-sync-policy.js` |
| 回讀（2026-07-15） | PM 整檔完成／重開以 `listStageAssignmentsForFile` 為真相，不單靠記憶體 context |
| 完成語意（審稿） | `_maybeCompleteReviewStageForFile`：該檔**所有** review 指派皆 `completed` → review stage → `completed` |
| `workflow_status` CHECK | Phase B 起已允許 `'assigned' \| 'in_progress' \| 'completed'`（`20260612120000`）；但 sync／多數 UI **實際只寫** assigned／completed；B-7「進行中」多半靠 `first_edited_at` |
| 身分切換 | `#btnPmActingRole`＋`#wfSessionKindHint`；**僅** `_isCatPmOrExecutive()` 顯示；hint 在頂欄右側 |
| 指派對話框 | `openCatCollabAssignModal`：翻譯多列；底部只讀顯示「審稿人員（案件層級）」 |

關聯文件：[`CAT_LMS_ASSIGN_REDESIGN_PLAN_2026-06.md`](CAT_LMS_ASSIGN_REDESIGN_PLAN_2026-06.md)、[`CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md`](CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md)、[`CAT_META_EXTRA_INFO_AND_WF_STATUS_PLAN_2026-07.md`](CAT_META_EXTRA_INFO_AND_WF_STATUS_PLAN_2026-07.md)。

---

## 1. 工項依賴與建議分支名

```text
docs/review-segment-assign-plan-2026-07   ← 本文件（審核）
        │
        ├─► feat/review-segment-assign-a     （工項 A，先）
        │         └─► feat/review-segment-status-d  （工項 D，A 合併後）
        ├─► feat/review-role-switch-b        （工項 B，可與 A 平行）
        └─► feat/review-session-hint-c       （工項 C，可與 A／B 平行；若與 B 撞同一 DOM，C 在 B 後 rebase）
```

| 工項 | 分支（建議） | 依賴 | 含 migration？ |
|---|---|---|---|
| A | `feat/review-segment-assign-a` | 無 | **是**（review upsert／sync／`review_rows`） |
| B | `feat/review-role-switch-b` | 無（可先做；雙重身分在 A 前較少） | 否 |
| C | `feat/review-session-hint-c` | 建議 B 後或並行後 rebase | 否 |
| D | `feat/review-segment-status-d` | **必須 A 已進 main** | **是**（防降級三態；CHECK 已有則可能僅改函式） |

---

## 2. 工項 A：審稿改為分段指派

### 2.1 LMS 資料結構提案（審核焦點）

**建議採納：新增 `cases.review_rows`（jsonb，預設 `'[]'`），與 `collab_rows` 分離。**

| 方案 | 作法 | 優點 | 缺點 | 裁決 |
|---|---|---|---|---|
| **甲（建議）** | 新欄 `review_rows`：審稿專用列陣列 | 切法與翻譯完全獨立；不污染既有 `collab_rows` 語意；遷移清晰 | 多一欄；LMS UI 多一塊 | **預設** |
| 乙 | `collab_rows` 加 `role: 'translate'\|'review'` | 單一陣列 | 既有列同時有 translator＋reviewer 欄，語意混亂；遷移難 | 不採 |
| 丙 | 繼續用列上的 `CollabRow.reviewer` | 少 schema | **無法**獨立切段（與翻譯同切）；工單已否決 | 不採 |

**`ReviewCollabRow` 建議形狀**（與翻譯列對齊的必要欄，命名可微調）：

```ts
interface ReviewCollabRow {
  id: string;
  segment: string;                 // 顯示用分段名
  reviewer: string;                // 顯示名
  reviewerUserId?: string | null;  // UUID 雙寫（同步優先）
  reviewDeadline: string | null;
  taskCompleted: boolean;          // → sync 建議 completed
  linkedCatFileId?: string | null;
  linkedCatViewId?: string | null;
  lineRange?: string | null;
  scopeLabel?: string | null;
  accepted?: boolean;              // 若沿用「已派出前需承接」過濾，與 translate 同規則
}
```

**`cases.reviewer`（案件層級）**：

- **不再**作為 CAT 指派／sync 來源。
- 遷移後：保留欄位供舊畫面／報表過渡，或詳情頁改為「由 review_rows 衍生唯讀摘要」（實作時二選一，預設：**詳情「審稿人員」改顯示 review_rows 去重名單**，寫入改走 review_rows）。
- 協作表既有「每翻譯列的審稿人員」欄：預設 **隱藏或改為非 CAT 用途**（避免與 `review_rows` 雙真相）；若業務仍要「翻譯列旁註記審稿人」，須標明**不驅動** `cat_stage_assignments`。

### 2.2 `cat_upsert_review_stage_assignment` 擴充方式

**目標簽名**（與 translate 對等）：

```text
cat_upsert_review_stage_assignment(
  p_file_id uuid,
  p_assignee_user_id uuid,
  p_collab_row_id text,
  p_view_id uuid,
  p_scope_label text,
  p_line_start integer,
  p_line_end integer,
  p_workflow_status text
) RETURNS void
```

| 步驟 | 作法 |
|---|---|
| 查找既有列 | 優先 `collab_row_id`；否則 file＋review stage＋assignee＋view／line 組合（同 translate） |
| 防降級（**必留**） | 複製 2026-07-14 條件：`existing=completed` 且 `requested≠completed` 且 **review stage 仍 completed** → 強制 `v_effective='completed'` |
| 寫入 | UPDATE／INSERT 含 `view_id`、`line_*`、`scope_label`、`collab_row_id` |
| 舊簽名 | `DROP FUNCTION … (uuid, uuid, text)` 後建新簽名；所有呼叫點（sync、tests）同 migration 改完 |
| JS 鏡像 | `wf-assignment-sync-policy.resolveEffectiveUpsertWorkflowStatus` **行為不變**（A 不引入 `in_progress` 邏輯；留給 D） |

### 2.3 `sync_cat_workflow_assignments_for_case`（review 分支）

比照 translate 分支既有 pattern：

1. 掃描 `review_rows`，收集 `v_valid_review_row_ids`。
2. 對每個連結檔的 **review** stage：`DELETE` stale（`collab_row_id` 不在 valid 集合，或舊式「整檔且無 collab_row_id」在遷移完成後清掉——見 §2.5）。
3. 逐列：解析 `reviewerUserId`／名字 → `cat_upsert_review_stage_assignment(…, line_*, status)`。
4. **建議寫入狀態**（A 階段仍兩態）：`taskCompleted OR review_stage=completed → completed`，否則 `assigned`（與現 translate／`resolveRequestedSyncWorkflowStatus` 一致）。
5. **停止**依 `cases.reviewer` 對所有檔整檔 upsert。
6. 回傳結構可加 `unresolvedReviewers`（比照 translators）。

### 2.4 審稿 stage 完成語意（明確定義）

| 規則 | 定義 |
|---|---|
| **Stage → completed** | 該檔存在至少一筆 review 指派，且**全部** `workflow_status = 'completed'`（維持 `_maybeCompleteReviewStageForFile`） |
| **無任何 review 指派** | stage **不**因「空集合 every」誤完成；維持現狀「無指派則不做自動完成」 |
| **PM 整檔標完成** | 仍走 `_pmApplyWholeFileReviewState('completed')`：stage＋**該檔所有** review 指派 → completed；回讀用 `listStageAssignmentsForFile`（2026-07-15） |
| **PM 重開** | stage → active／pending 時，指派可降回 `assigned`（既有反向路徑；D 再擴充三態） |
| **與翻譯** | 翻譯完成語意**零變動** |

**對其他流程的影響（A 必查）**：

| 觸點 | 影響 |
|---|---|
| B-7 顯示 | 改為可能多筆審稿分段；`resolveAssignmentDisplayStatus` 每人／每段獨立（既有邏輯可吃多筆） |
| `_maybeCompleteReviewStageForFile` | 語意不變，但指派來源變多筆分段 |
| Slack／LMS 任務完成 | 翻譯列仍 `_emitWfTaskCompleteToLms`；審稿目前多半不寫 collab `taskCompleted`——A 應：**分段審稿完成時，對應 `review_rows[].taskCompleted=true`**（與翻譯對稱），避免 sync 把已完成洗回 assigned |
| 清單「審稿」欄 | 顯示需支援多段（名稱＋範圍）；整檔完成仍顯示完成 |

### 2.5 舊案件遷移方案

**一次性、idempotent migration（A 的 db push 檔內或緊鄰第二檔）**：

1. **有 `cases.reviewer` 非空**：
   - 找出 `cat_files.related_lms_case_id = case.id` 的每個檔；
   - 為每個檔插入一筆 `review_rows`：`id=新 UUID`、`reviewer=原名`、`reviewerUserId=dual resolve`、`linkedCatFileId=該檔`、`lineRange/scope` 空＝整檔、`taskCompleted`＝若該檔既有 review assignment 已 completed 或 review stage 已 completed 則 true。
2. **對映既有 `cat_stage_assignments`（review、整檔、`collab_row_id IS NULL`）**：
   - 若能配到同檔＋同 assignee 的新 `review_rows` → `UPDATE` 填上 `collab_row_id`（及必要時範圍仍為 null＝整檔）；
   - **保留** `workflow_status`（完成不得倒退）。
3. **案件已無連結檔、僅有 reviewer**：仍寫入一筆「未連結檔」`review_rows`（無 `linkedCatFileId`），供 UI 顯示；sync 行為與現「無檔」一致（不寫 assignment）。
4. **驗證查詢**（遷移後必跑）：抽樣「遷移前 stage/assignment 為 completed」→ 遷移後仍 completed；指派列數 ≥ 連結檔數（有 reviewer 的案件）。

### 2.6 前端／同步鏈（同 commit 紀律）

| 層 | 變更 |
|---|---|
| CAT 指派對話框 | 翻譯區塊下方加**審稿區塊**（新增列／拆分均分／刪列）；移除「審稿人員由案件層級設定」文案 |
| LMS `CollaborationTable` | 審稿列編輯區（或獨立小表）；批次設審稿人可作用於 `review_rows` |
| `case-store`／`cat-cloud-rpc` | 讀寫 `review_rows`；指派儲存後觸發 sync |
| Dexie／`types.ts` | 同 commit 重生 types；CAT 本地若快取案件協作資料一併更新 |
| 紅線 | **翻譯指派行為零變動**（collab_rows 路徑測回歸） |

### 2.7 測試（A）

- Vitest：sync 狀態建議（兩態）；review upsert 防降級（completed 不降）；完成語意（全段 completed → stage）。
- Playwright（測試模式）：指派對話框新增多列審稿、與翻譯不同切法、存後重開一致；舊案 fixture／假資料見一整檔審稿列。
- 連續全綠標準沿用工單。

### 2.8 驗收（A，對齊工單）

1. 審稿可多列（人／範圍／交期），LMS 與 CAT 一致。  
2. 與翻譯切法不同互不干擾。  
3. 舊單一審稿人 → 一整檔審稿列，狀態不倒退。  
4. 各段完成後 stage 依 §2.4 轉態，重整不掉。

---

## 3. 工項 B：雙重身分切換推廣

| # | 規格落地 |
|---|---|
| 1 | 顯示條件：目前檔之 `cat_stage_assignments` 中，本人同時有 `stage_kind` translate 與 review 各 ≥1（範圍不限）**或** PM 以上（維持） |
| 2 | 單一身分譯者：不顯示切換器（與現非 PM 行為一致） |
| 3 | PM 以上：行為不變（任意切換） |
| 4 | 點擊效果**重用** `_refreshPmActingRoleBtn`／`currentWfSessionKind`／既有確認與 mq role 路徑，**不另寫一套** |
| 5 | 切到審稿後，編輯／完成範圍仍受 B-7／lease／本人 review 指派範圍限制 |

**實作觸點**：`_refreshPmActingRoleBtn`、`_refreshWfSessionKindHint`、開檔載入 assignments 後重算；tooltip 文案改為非「僅 PM」。

**驗收**：雙重身分可見可切；單身分不可見；PM 不變；權限不越界。

---

## 4. 工項 C：「目前工作」顯示器移位

| # | 作法 |
|---|---|
| 1 | 將 `#wfSessionKindHint`（必要時含 `#btnPmActingRole` 若產品視為同一組）移到 `#btnExitEditor` **右側、緊貼**，在 `#editorFileName` **之前**（`toolbar-left`） |
| 2 | CSS：`flex-shrink: 0`；檔名 `min-width:0; overflow:hidden; text-overflow:ellipsis`，確保窄窗顯示器不被擠掉 |
| 3 | 不改互動邏輯（B 的切換仍綁同一按鈕／hint） |

**驗收**：緊貼最左按鈕右側；縮窄仍可見可點。

---

## 5. 工項 D：PM 逐分段三態＋鎖定

### 5.1 三態與顯示

| UI | DB `workflow_status` |
|---|---|
| 待開始 | `assigned` |
| 執行中 | `in_progress`（**開始真正寫入此值**；CHECK 已存在） |
| 完成 | `completed` |

- 更新：`resolveAssignmentDisplayStatus`：**若** `workflow_status === 'in_progress'` →「進行中」；`completed` →「完成」；否則再 fallback `first_edited_at`（相容舊資料）。
- Dexie／`types.ts`／檔案清單與編輯器 UI：每段 radio 三態，**僅 PM 以上**可改。
- 「全部設為…」：翻譯一組、審稿一組。

### 5.2 審稿完成 → 翻譯鎖定

- 任一 review 分段 `completed` → 該檔 translate stage＋**所有** translate 指派強制 `completed`，UI disabled＋原因提示。
- **寫入路徑拒絕**降級／改譯（RPC 或前端 API 層雙擋）。
- 所有 review 分段都離開 `completed` → 自動解鎖。

### 5.3 Stage 推導

- 任一分段 `in_progress` 或 `completed`（未全完）→ 該 stage `active`。
- 全部分段 `completed` → stage `completed`。
- 沿用既有 stage 更新路徑，不另立通道。

---

## 6. 專節：工項 D 第 5 點——sync 防降級擴充（本波最高回歸風險）

### 6.1 為何會炸

現況 sync（translate／review）在「未 taskCompleted 且 stage 非 completed」時**一律**建議寫入 `'assigned'`：

```text
resolveRequestedSyncWorkflowStatus ≈
  taskCompleted || stage===completed ? 'completed' : 'assigned'
```

PM 把分段設成 `in_progress` 後，只要 LMS 任一欄觸發 `sync_cat_workflow_assignments_for_case`，就會把 **`in_progress` 洗回 `assigned`**——與 2026-07-14「completed 被洗回」同一類事故。

### 6.2 必須保留的既有語意

| 來源 | 語意 | D 之後 |
|---|---|---|
| **2026-07-14 防降級** | 既有 assignment=`completed` 且 **stage 仍 `completed`** 時，upsert 不得寫成非 completed | **原樣保留**（擴充為等級制後，completed 仍是最高階） |
| **2026-07-15 回讀** | PM 整檔完成／重開以 `listStageAssignmentsForFile` 為真相再寫指派 | **原樣保留**（勿改回只信 context） |
| **反向路徑** | stage **已非** completed（重開）時，允許指派從 completed 降回（否則檔案重開卡死） | **保留**；並定義對 `in_progress` 的對稱規則（見下） |

### 6.3 等級與規則（單一真相，JS＋SQL 同構）

定義序級（數字僅示意）：

```text
assigned = 0
in_progress = 1
completed = 2
```

**Sync 建議狀態 `resolveRequestedSyncWorkflowStatus`（擴充）**：

1. 若 `taskCompleted` → 請求 `completed`。
2. 否則若 stage=`completed` → 請求 `completed`。
3. 否則若能讀到**既有** assignment 狀態為 `in_progress` 或 `completed` → **請求維持該狀態**（不得回落 `assigned`）。  
   （實作：sync 迴圈先 SELECT 既有 `workflow_status`，或改由 upsert 內部吞掉降級——見下；兩者擇一，預設 **upsert 內部為權威**，sync 可仍傳 assigned，但 upsert 會擋。）
4. 否則 → `assigned`。

**Upsert 實際寫入 `resolveEffectiveUpsertWorkflowStatus`（擴充）**：

```text
requested = normalize(requested)  // 預設 assigned
existing  = normalize(existing)

// —— 2026-07-14（保留）——
if existing === 'completed' && requested !== 'completed' && stageStatus === 'completed':
  return 'completed'

// —— 新增：禁止 in_progress → assigned（stage 未重開）——
if existing === 'in_progress' && requested === 'assigned' && stageStatus === 'completed':
  return 'in_progress'  // stage 仍完成時更不該降
if existing === 'in_progress' && requested === 'assigned' && stageStatus !== 'reopened':
  return 'in_progress'

// —— 一般：只允許不降級 ——
if rank(requested) < rank(existing) && not isStageReopened(stageStatus, existing):
  return existing

return requested
```

**`isStageReopened`（明確定義，供審核）**：

- stage 狀態 ∈ `{pending, active}`（或產品現用的非 completed 集合），**且**此次寫入來自「PM 重開／`cat_revert_workflow_stages_for_case`／整檔改回 active」路徑；或
- 簡化可審核版：**僅當 `stageStatus !== 'completed'` 且 `requested` 由 PM 整檔重開 API 明確傳入降級**時允許；LMS sync 路徑**永遠不得**把 `in_progress`／`completed` 降成更低（除非 stage 已非 completed **且** `taskCompleted=false` 與「重開」同一事務——需在實作 PR 用測試釘死）。

**本計畫預設（請驗收方勾選）**：

- [ ] **D5-預設**：LMS sync 路徑上，upsert **永不**將 `in_progress`→`assigned` 或 `completed`→`in_progress`/`assigned`；唯一允許降級的是 CAT／PM「重開」專用函式（stage 先改非 completed，再寫指派）。
- [ ] **D5-替代**：sync 在 stage≠completed 時允許降回 assigned（較鬆，回歸風險高）。

### 6.4 改動落點（同一組既有函式，不另起爐灶）

| 層 | 檔案／物件 |
|---|---|
| 純函式 | `cat-tool/js/wf-assignment-sync-policy.js`（＋既有 Vitest） |
| SQL | `cat_upsert_translate_stage_assignment`、`cat_upsert_review_stage_assignment`（A 擴充後的簽名）、`sync_cat_workflow_assignments_for_case` 內建議狀態 |
| migration | 新檔 `db push`；**禁止** MCP |
| 回讀 | `_pmApplyWholeFileTranslateState`／`ReviewState` 維持 `listStageAssignmentsForFile` |

### 6.5 測試方式（D5 必過，驗收方會查）

| # | 測試 | 通過條件 |
|---|---|---|
| T-D5-1 | Vitest：`existing=in_progress`, `requested=assigned`, `stage=active` → effective=`in_progress` | 純函式 |
| T-D5-2 | Vitest：`existing=completed`, `requested=assigned`, `stage=completed` → `completed`（2026-07-14 回歸） | 純函式 |
| T-D5-3 | Vitest：`stage` 非 completed + PM 重開 requested=`assigned` → 允許降級 | 純函式 |
| T-D5-4 | SQL／整合：手動把 assignment 設 `in_progress`，觸發 `sync_cat_workflow_assignments_for_case`，再查 DB 仍為 `in_progress` | 正式庫測試模式或本機 linked |
| T-D5-5 | 同檔：`completed` 不被 sync 洗回（2026-07-14） | 同上 |
| T-D5-6 | Playwright：PM 設分段 in_progress → 改 LMS 協作無關欄觸發 sync → 重整後仍 in_progress | e2e |
| T-D5-7 | 回讀：PM 整檔完成 → 重整仍完成（2026-07-15） | e2e／手動 |

工單驗收句：「跑一次 LMS sync 後查 DB：in_progress 與 completed 均未被洗回 assigned」＝ **T-D5-4＋T-D5-5**。

---

## 7. 各工項交付與驗收總表

| 工項 | 主要交付 | 驗收摘要 |
|---|---|---|
| A | `review_rows`＋review upsert／sync＋CAT／LMS UI＋遷移 | 多段審稿、與翻譯獨立、舊案整檔列、完成不掉 |
| B | 雙重身分顯示切換器 | 雙重可見、單一無、PM 不變、不越權 |
| C | 頂欄位移＋窄窗 CSS | 緊貼最左按鈕右側 |
| D | 三態 UI＋鎖定＋**§6 防降級** | 重整保持、整批可再調、審稿完成鎖翻譯、sync 不洗狀態 |

---

## 8. 請驗收方確認的決策

- [ ] **採納 `cases.review_rows`（方案甲）** 作為審稿列唯一真相
- [ ] **案件層級 `cases.reviewer`**：遷移後改衍生顯示／不再驅動 sync
- [ ] **協作表列內 `CollabRow.reviewer`**：不驅動 CAT（隱藏或標非 CAT）
- [ ] **審稿完成語意**：§2.4（全部分段 completed → stage completed）
- [ ] **D5-預設**（sync 永不降級 in_progress／completed；僅 PM 重開路徑可降）
- [ ] **授權分 PR 動工**：A 先；B／C 可平行；D 等 A merge
- [ ] 其他否決或修正：________________

---

## 9. 本 PR 交付物

| 檔案 | 用途 |
|---|---|
| 本檔 | 工項 A–D 執行計畫（含 A 結構／遷移／完成語意、**D5 專節**） |

**明確未做**：任何 schema／migration／正式庫寫入、任何產品行為變更。
