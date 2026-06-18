# CAT 工作階段（Workflow）、追蹤修訂與 TMS 整合 — 大計畫（2026-06）

> 本文件整理 **2026-06-10** 產品討論與程式庫可行性評估，作為後續分階段落地的**總規劃**。已落地項目會標註 commit 與專項文件；未落地項目標為**規劃中**，實作前應另開細規格或子文件。

---

## 一、願景摘要

讓 1UP CAT 支援類似專業 CAT／TMS 的**多階段翻譯流程**（例如：翻譯 → 審稿 → 定稿），並能：

1. 依專案或檔案**自訂步驟**（可增減）。
2. 各步驟**指派人員**，負責人可標記「完成」。
3. 產出**階段間追蹤修訂**（檢視 diff、評註、匯出）。
4. 與 **LMS 案件**更深整合（匯入連結、案件頁快速開檔）。

---

## 二、現況盤點（2026-06-10 基線）

### 2.1 可延伸的既有能力

| 能力 | 位置 | 說明 |
|------|------|------|
| 檔案／句段集指派四態 | `cat_file_assignments.status`、`cat_view_assignments.status` | `assigned` → `in_progress` → `completed`／`cancelled` |
| 句段鎖定 | `isLocked`／`isLockedUser`／`isLockedSystem`、`computeForbiddenForRole()` | 目前主要服務 **mqxliff** T／R1／R2 |
| memoQ 確認身分 | `confirmation_role`、`original_role`、`default_mq_role` | 格式限定，非通用 workflow |
| 討論串 | Dexie `guidelineReplies` | 可參考評註回覆 UI |
| Excel 匯出 | `app.js` EXPORT ENGINE | 追蹤修訂匯出可延伸 |
| CAT ↔ LMS 案件綁定 | `cat_files.related_lms_case_id`、專案工具列「連結案件」 | 單檔粒度 |
| 案件→CAT 指派同步 | `sync_cat_file_assignments_for_case` | 案件「已派出」時新增 `cat_file_assignments` |

### 2.2 主要缺口

- **無**通用 workflow 引擎（無 `cat_workflow_stages` 等定義表）。
- **無**句段層級「屬於哪個步驟／哪位譯者」的通用模型（句段集僅 view 層指派）。
- `segment_revision` 為**樂觀鎖計數器**，不是版本歷史。
- **雙模式成本**：離線 Dexie（`db.js`）與 Supabase（migration + `cat-cloud-rpc.ts`）須同步設計。

---

## 三、需求對照與可行性

| # | 需求 | 可行性 | 複雜度（AI 施作） | 狀態 |
|---|------|--------|-------------------|------|
| 1 | 專案／檔案可自訂步驟（增減） | 高 | 中 | **部分落地**（Phase B：範本＋檔案覆寫；預設翻譯→審稿；**尚無** PM 自訂增減步驟 UI） |
| 2 | 各步驟指派人員；負責人標記完成 | 高 | 中 | **已落地**（Phase B `e4a6205`～`d7232ab`） |
| 2-i | 多人同檔 UI（階段名、進度、句段歸屬提示等） | 高 | 低～中 | **已落地**（Phase B；檔案清單 assignment 逐行 `e4a6205`） |
| 2-ii | 非自己負責句段鎖定（可檢視全檔、僅編輯己責） | 高 | 中 | **已落地**（Phase B `computeSegmentEditForbidden`） |
| 2-iii | **B-6** 匯入後第 0 步「檔案準備中」；PM 標「準備完成」後才可派出 | 高 | 中 | **已實作**（2026-06-16；migration 已 push；[`CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md`](./CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md)） |
| 2-iv | **B-6** 審稿人員任務完成；PM 調整狀態可設「審稿完成」 | 高 | 中 | **已實作**（2026-06-16；migration 已 push；審稿完成**暫不** Slack／**暫不**單人多檔 LMS 聚合） |
| 2-v | **B-7** 統一顯示狀態；檔案清單「指派對象」；儀表板改版；指派／列號／狀態欄（B-7d／e） | 高 | 中～高 | **B-7a／b／c 已實作**；B-7d～e 待實作／待排程（[`CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md`](./CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md)） |
| 3 | 階段間追蹤修訂檔案 | 高 | **高** | 規劃中 |
| 3-i | 檔案清單按鈕開啟追蹤修訂檢視 | 高 | 低～中 | 規劃中 |
| 3-ii | 顯示各階段負責人 + diff 呈現 | 高 | 中高 | 規劃中 |
| 3-iii | 可切換是否顯示追蹤標記 | 高 | 低 | 規劃中 |
| 3-iv | 第二階段起：問題類型、嚴重性、備註 | 高 | 中 | 規劃中 |
| 3-v | 前階段人員回覆後階段評註 | 高 | 低～中 | 規劃中 |
| 3-vi | 匯出 Excel／htm | 高 | 中～中高 | 規劃中 |
| 4 | TMS／CAT 進一步整合 | 高 | 低～中 | **已落地**（Phase A） |
| 4-i | 匯入時詢問連結案件（可跳過） | 高 | 低 | **已落地** `49db7c2` |
| 4-ii | LMS 案件頁「1UP CAT」工具區子區塊與深連結 | 高 | 低～中 | **已落地** `7ae0fc5`～`27d0585` |

---

## 四、分階段實作建議

### 建議順序

```mermaid
flowchart LR
    phase4[TMS整合小步] --> phase12[Workflow框架]
    phase12 --> phase3[追蹤修訂]
```

1. **Phase A — TMS 整合（低投入、高價值）** — **已收尾**
2. **Phase B — Workflow 框架（步驟定義 + 指派 + 鎖定）** — **已落地**（2026-06-15）
3. **Phase B-6 — 檔案準備閘門 + 審稿任務完成** — **已實作**（2026-06-16；`fd67332`；migration 已 push）
4. **Phase B-7 — 統一顯示狀態 + 檔案清單／儀表板 UX** — **B-7a／b／c 已實作**；B-7d～e 待實作／待排程
5. **Phase C — 追蹤修訂（快照、diff、評註、匯出）** — 規劃中

### 4.1 Phase A：TMS 整合（已收尾，2026-06-12）

| 子項 | 說明 | 狀態 | 文件／commit |
|------|------|------|----------------|
| **A-1** 一般匯入選填連結案件 | 批次匯入末尾 `showCasePickerForImport()`；`runBatchImport` 傳 `caseInfo`；Excel／XLIFF／PO 建檔後 `updateFile` | **已落地** | [`CAT_IMPORT_CASE_LINK_2026-06.md`](./CAT_IMPORT_CASE_LINK_2026-06.md)；`49db7c2` |
| **A-2** Google Sheet 匯入連結案件 | 僅團隊版；**必選** LMS 案件（取消＝中止匯入）；更新作業檔沿用既有連結 | **已落地** | [`CAT_IMPORT_CASE_LINK_2026-06.md`](./CAT_IMPORT_CASE_LINK_2026-06.md) §A-2；`ab04381` |
| **A-3 + A-4** 案件頁「1UP CAT」工具區子區塊 | 第二波 UX + B+D2 + UX 微調 + 加號（`7ae0fc5`～`27d0585`） | **已落地並驗收** | Cursor 大計畫 `1up_ux_與遷移`（UX）；摘要 [`CAT_LMS_1UP_UX_AND_MIGRATION_DEVLOG_2026-06.md`](./CAT_LMS_1UP_UX_AND_MIGRATION_DEVLOG_2026-06.md) |
| **A-5** 未受派譯者全檔唯讀 | 團隊版非 PM+ 且未在 `cat_file_assignments` 受派 → 每格 `locked-system` + tooltip；mqxliff 不跳身分視窗、隱藏 `mqRoleIcon`；PM+ 豁免 | **已落地** | `cat-tool/app.js`：`resolveFileUnassignedReadOnly`、`openEditor`；`ab04381` |

#### 4.1.1 Phase A 驗收清單（白話）

1. **A-1**：團隊版一般匯入（Excel／XLIFF／PO）末尾可選 LMS 案件；按取消＝跳過連結、匯入仍成功。
2. **A-2**：團隊版 GS 匯入必選案件，取消＝中止；離線版提示需團隊版；更新作業檔沿用既有案件連結。
3. **A-3／A-4**：LMS 案件詳情「工具」區塊出現 1UP CAT 子區塊；`cat_tool_enabled` 關閉時隱藏；深連結可開對應 CAT 專案／檔案。
4. **A-5**：未受派譯者開檔每句唯讀（橘底 `locked-system`）；mqxliff 不跳出 T／R1／R2 身分視窗；工具列 mq 身分圖示隱藏；PM+ 可正常編輯。

#### 4.1.2 已知邊界（非阻擋 Phase A 結案）

| 項目 | 說明 |
|------|------|
| 指派查詢逾時 | 若 `cat_file_assignments` 查詢逾時仍 fail-open，未受派唯讀可能未生效；Phase B 前可觀察是否需改 fail-closed |
| GS 更新作業檔 wizard | `btnGsWizFinish` 路徑是否仍走 `createFile` 而非更新既有檔 — 列為可選技術債，不阻擋 Phase A 收尾 |

### 4.2 Phase B：Workflow 框架（**已落地**，2026-06-15）

> **完整規格**：[`CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md`](./CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md)（v5 `e4a6205`～`d7232ab`；§11.7 熱修、§11.8 更新檔 Modal、§11.9 任務完成按下驗證）  
> **排序／序號（B-0）**：[`CAT_SORT_AND_DISPLAY_ORDER_SPEC_2026-06.md`](./CAT_SORT_AND_DISPLAY_ORDER_SPEC_2026-06.md)

#### 已定案產品決策（摘要）

| 議題 | 定案 |
|------|------|
| 步驟定義 | 專案範本 + 單檔可覆寫；預設 **翻譯 → 審稿** |
| 同一步多人 | 允許；依**行數範圍**段落指派（如 2A／2B／2C） |
| 步驟流 | 可退回上一步（**PM 以上**） |
| **確認手勢** | **Ctrl+Enter／點狀態欄**；內部 + memoQ **一次寫入**；**取消一併清除** |
| mqxliff | 走 Workflow；memoQ T／R1／R2 **雙通道並存**（內部 `wf_*` 不寫 mqxliff；R1／R2 鎖定保留） |
| mqxliff 狀態欄 | 綠點＝內部翻譯；綠外圈＝內部審稿；**白色** ✓／✓+／✓✓＝memoQ（疊在綠底上） |
| **編輯權限** | **B**：有段落指派即可編該段 |
| **離線 Workflow** | **要**（Dexie v23+） |
| **進度** | **僅內部**；**翻譯｜審稿兩段**；不算 memoQ 白勾 |
| **排序／序號** | B-0：檔 `created_at`、檔內 `globalId`、左欄全清單列序；見排序 spec |
| **LMS** | 協作列與完成狀態 **雙向**；可派**檔案或句段集**；撞車依最後儲存時間 |
| **舊檔遷移** | 其餘標各階段已完成；**兩 mqxliff 檔名**例外走完整 Phase B |

#### 資料模型（草案）

| 表／store | 用途 |
|-----------|------|
| `cat_workflow_templates` + `cat_workflow_template_stages` | 專案級步驟範本 |
| `cat_file_workflow_stages` | 某檔案實際套用的步驟實例 |
| `cat_stage_assignments` | 段落指派：`stage_id`、`assignee_user_id`、行數範圍或 `scope_label`、`workflow_status` |
| `cat_segments` 新欄 | `wf_trans_confirmed_*`、`wf_review_confirmed_*`（內部句段標記；與 `confirmation_role` 分開） |

#### 交付切片

```mermaid
flowchart LR
  B0[B0 排序與顯示序] --> B1[B1 資料模型與範本]
  B1 --> B2[B2 段落指派與鎖定]
  B2 --> B3[B3 狀態欄與確認]
  B3 --> B4[B4 任務完成與LMS]
  B4 --> B5[B5 篩選與驗收]
```

| 子項 | 交付物 |
|------|--------|
| **B-0** | 排序 spec 落地：檔序、句段集 sort、左欄顯示序、篩選 A；更新檔×句段集 UI | **已落地**（2026-06-15 Modal） |
| **B-1** | migration、Dexie v23、RPC 範本／檔案步驟；舊檔遷移（兩檔例外） |
| **B-2** | 檔案／句段集清單步驟／負責人；`computeSegmentEditForbidden` 含行數 |
| **B-3** | 三層狀態欄、確認／取消合併、進度兩段（含 `fafd1c8` 舊檔進度 fallback） |
| **B-4** | 派出 RPC、任務完成／調整狀態、LMS 雙向、開檔 session | **已落地**（`e4a6205`～`d7232ab`；含熱修、更新檔 Modal、按下驗證） |
| **B-5** | 進階篩選第五維 | **已落地** `d53b568` |

### 4.2.1 Phase B-6：檔案準備閘門 + 審稿任務完成（**已實作**）

> **完整規格**：[`CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md`](./CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md)（`fd67332`；migration `20260616120000` **已 push**）

#### 已定案產品決策（摘要）

| 議題 | 定案 |
|------|------|
| 準備中編輯 | **僅 PM+** 可編譯文；譯者／審稿人唯讀 |
| 派出閘門 | 本案連結之**每一 CAT 檔** `prep` 須 `completed` 才可 LMS 派出 |
| 審稿任務完成 | 對稱翻譯：session=審稿、`_isWfReviewMarkedEffective`、PM 調整狀態 |
| 審稿完成 Slack | **暫不** |
| 單人多檔審稿聚合 | **暫不** |
| 舊檔 backfill | 已派出或翻譯已啟動 → `prep=completed` |

#### 交付切片

```mermaid
flowchart LR
  B6a[B6a prep閘門與派出] --> B6b[B6b 審稿任務完成]
  B6b --> B6c[B6c Phase C snapshot hook]
```

| 子項 | 交付物 | 狀態 |
|------|--------|------|
| **B-6a** | `prep` 步驟、匯入預設、PM 標記準備完成、編輯鎖、LMS 派出 RPC | **已實作**（2026-06-16） |
| **B-6b** | 審稿任務完成、PM 審稿完成調整狀態 | **已實作**（2026-06-16） |
| **B-6c** | `enqueueStageSnapshot` stub；Phase C 表結構註明 | **已實作** stub（2026-06-16） |

**建議實作順序**：波次 A 與 B-6 本體**已落地**（`fd67332`）。顯示語意改版見 **B-7**。

#### 程式觸點（已落地 — B-6）

- Migration：`20260616120000`；`stage_kind` 含 `prep`；`cat_case_all_linked_files_prep_ready`
- CAT：`computeSegmentEditForbidden`、`_markFilePrepReady`、`refreshWfTaskCompleteToolbar`（審稿分流）、檔案清單 prep 狀態
- LMS：[`cat-prep-dispatch-gate.ts`](../src/lib/cat-prep-dispatch-gate.ts)、`CaseDetailPage` 派出前閘門

#### 程式觸點（已落地 — Phase B 本體）

- 鎖定：三層 AND — Workflow 行數、`computeForbiddenForRole`、未受派／系統鎖（見子文件 §2）。
- UI：專案檔案清單顯示步驟／負責人（`_formatWorkflowListCellHtml` assignment 逐行）；工具列「任務完成」／「調整狀態」；編輯器狀態欄三層圖示（mqxliff）。
- 任務完成：`_validateAssignmentForTaskComplete`、`_assignmentRangeConfirmAudit`（`d7232ab`）。
- 更新作業檔：`showFileUpdateViewsModal`、`_syncViewsAfterFileUpdate`（`76be7ee`）。
- 雙模式：`db.js` v24+；Supabase migration + `cat-cloud-rpc.ts`。

### 4.2.2 Phase B-7：統一顯示狀態 + 檔案清單／儀表板 UX（**B-7a 已實作**）

> **完整規格**：[`CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md`](./CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md)  
> **驗收後修訂**（2026-06-17）：文案待開始／進行中／完成；PM 六階畫面＋寫入；B-7d 指派／列號鎖定。

#### 已定案產品決策（摘要）

| 議題 | 定案 |
|------|------|
| 右欄文案 | 待開始／進行中／完成；等待準備完成、等待翻譯完成（灰） |
| 待開始 | `prep` 完成後至受派範圍內**首次改譯文**前 |
| 審稿 | 可提前改句；**不**因審稿改句自動標翻譯完成 |
| PM 階梯 | 往後設狀態 → **畫面＋寫入**連動較前階段完成 |
| 清單 | 「指派對象」grid；紅字「準備中」 |
| 列號 | 檔內或句段集內 1..N；見排序 spec §6 |
| 資料 | `first_edited_at`（B-7a）、`cat_file_user_access`（B-7c） |

#### 交付切片

| 子項 | 交付物 | 狀態 |
|------|--------|------|
| **B-7a** | migration、`wf-display-status.js`、grid、`first_edited_at` | **已實作**（`b577c08`） |
| **B-7b** | PM 六階、準備完成按鈕、離開閘門、resolver 文案 | **已實作**（`e313016`） |
| **B-7c** | 儀表板、`cat_file_user_access` | **已實作** |
| **B-7d** | CAT 指派同步 stage assignment、列號鎖定；見 [bug-report](./bug-report_workflow-whole-file-assign-edit-lock_2026-06.md) | 待實作 |
| **B-7e** | 狀態欄匯入 confirmed／空心圈與清單對齊；見 [bug-report](./bug-report_workflow-import-confirmed-status-column_2026-06.md) | **待排程** |

### 4.3 Phase C：追蹤修訂（規劃中）

> **依賴**：**B-6** 步驟交接時的快照觸發點須先落地（至少 no-op hook），再實作本階段快照與 diff。  
> **翻譯前基準**：以 **prep 準備完成**（`baseline_before_translate`）為比對起點，用於回答「翻譯階段對 AI／機翻／客戶預譯做了哪些修改」。

#### 核心機制

- **快照**：步驟交接時寫入 `cat_segment_stage_snapshots`（`file_id`, `stage_id`, `segment_id`, `target_text`, `target_tags`, `assignee_user_id`, `snapshotted_at`, `snapshot_reason`）。
- **觸發點**（B-6 定案）：`baseline_before_translate`（prep 完成）→ `post_translate`（翻譯完成）→ `post_review`（審稿完成）；見 [`CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md`](./CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md) §5。
- **Diff**：兩快照間文字 diff；需 **tag-aware** renderer（不可把 tag XML 當純文字 diff）。
- **評註**：`cat_segment_annotations`（`issue_type`, `severity`, `note`）；回覆可沿用 `parentReplyId` 模式。

#### UI／匯出

| 子項 | 說明 |
|------|------|
| C-1 | 檔案清單「追蹤修訂」按鈕 → `viewRevisionTrack` 或 modal |
| C-2 | 顯示各階段負責人 + 刪除線／底線 diff |
| C-3 | 「顯示最終版本」／「顯示修訂標記」切換 |
| C-4 | 審稿人評註（問題類型、嚴重性、備註） |
| C-5 | 譯者回覆評註 |
| C-6 | 匯出 Excel（欄位：原文、各階段譯文、評註） |
| C-7 | 匯出 htm（self-contained HTML；新渲染器） |

#### 建議交付切片

1. 快照 + 基礎並排檢視（無評註）
2. 評註與回覆
3. Excel 匯出
4. htm 匯出

---

## 五、與現有功能的關係

| 現有功能 | 與本計畫關係 |
|----------|----------------|
| 句段集 `cat_views` + `cat_view_assignments` | 可並存；句段集編輯器為**子集畫面**，Workflow **仍分翻譯／審稿**；LMS 可派**檔案或句段集**（`linkedCatViewId`）；列號見排序 spec |
| memoQ `confirmation_role` | mqxliff 專用；Phase B 內部 `wf_*` 與之**分開**；見 [`CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md`](./CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md) §3 |
| `sync_cat_file_assignments_for_case` | 案件派出時同步譯者；未來可擴充「依步驟寫入 stage assignment」 |
| 批次匯入精靈 | 已加匯入連結案件；見 [`CAT_BATCH_IMPORT_WIZARD_SESSION.md`](./CAT_BATCH_IMPORT_WIZARD_SESSION.md) |

---

## 六、風險與限制

1. **雙模式**：每項新表／欄位需 Dexie + Supabase + RPC 三處一致。
2. **追蹤修訂與 tag**：diff 與匯出是工程量最大風險點。
3. **效能**：大檔全量快照與 diff 需考慮分頁或 lazy load。
4. **權限**：LMS 案件頁查 CAT 檔需確認 RLS 與譯者／PM 可見範圍。

---

## 七、文件與程式索引

| 主題 | 路徑 |
|------|------|
| 本大計畫 | 本文件 |
| **Phase B 完整規格** | [`CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md`](./CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md) |
| **Phase B-6 準備閘門 + 審稿完成** | [`CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md`](./CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md) |
| **Phase B-7 統一狀態 + 清單／儀表板** | [`CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md`](./CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md) |
| **B-0 排序與顯示序** | [`CAT_SORT_AND_DISPLAY_ORDER_SPEC_2026-06.md`](./CAT_SORT_AND_DISPLAY_ORDER_SPEC_2026-06.md) |
| 匯入連結案件（已落地） | [`CAT_IMPORT_CASE_LINK_2026-06.md`](./CAT_IMPORT_CASE_LINK_2026-06.md) |
| 批次匯入精靈 | [`CAT_BATCH_IMPORT_WIZARD_SESSION.md`](./CAT_BATCH_IMPORT_WIZARD_SESSION.md) |
| LMS 殼層 UX | [`LMS_CAT_SHELL_SIDEBAR_UX_2026-05.md`](./LMS_CAT_SHELL_SIDEBAR_UX_2026-05.md) |
| 功能路徑 | [`CODEMAP.md`](./CODEMAP.md) |
| 案件頁 | `src/pages/CaseDetailPage.tsx` |
| CAT 嵌入 | `src/pages/CatToolPage.tsx`、`src/lib/cat-cloud-rpc.ts` |

---

## 八、修訂紀錄

| 日期 | 內容 |
|------|------|
| 2026-06-10 | 初稿：可行性評估、三階段路線圖、需求對照表；收錄 `49db7c2` 匯入連結案件 |
| 2026-06-12 | Phase A 收尾（A-2／A-5 `ab04381`、§4.1.1 驗收）；Phase B 定案與子文件 [`CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md`](./CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md) |
| 2026-06-12 | Phase B v2 摘要：確認合併、B-0 排序 spec、LMS 雙向、進度兩段、舊檔遷移兩檔例外 |
| 2026-06-15 | Phase B 收尾：B-4 v5（`e4a6205`）、開檔熱修（`cee4b03`／`60e8526`）、更新作業檔×句段集 Modal（`76be7ee`）、任務完成按下驗證（`d7232ab`）；CCT6012 驗收通過；Phase C 仍規劃中 |
| 2026-06-15 | **B-6 規格定案**：三步驟（prep→translate→review）、派出閘門、審稿任務完成；產品決策（prep 僅 PM 可編、審稿暫不 Slack、舊檔 backfill）；子文件 [`CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md`](./CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md) |
| 2026-06-16 | **B-6 實作**：migration `20260616120000` 已 push（`fd67332`）；波次 A+B |
| 2026-06-16 | **B-7 規格定案**：統一顯示狀態、清單「指派對象」、儀表板；子文件 [`CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md`](./CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md) |
| 2026-06-17 | **B-7a 已實作**（`b577c08`）；驗收後修訂文案、PM 六階、B-7d 指派／列號鎖定；[`bug-report_workflow-whole-file-assign-edit-lock_2026-06.md`](./bug-report_workflow-whole-file-assign-edit-lock_2026-06.md) |
| 2026-06-17 | **B-7b 已實作**（`e313016`）；**B-7e 待排程**：狀態欄匯入 confirmed／空心圈；[`bug-report_workflow-import-confirmed-status-column_2026-06.md`](./bug-report_workflow-import-confirmed-status-column_2026-06.md) |
