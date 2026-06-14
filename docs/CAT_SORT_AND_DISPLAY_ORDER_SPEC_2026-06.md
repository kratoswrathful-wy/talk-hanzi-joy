# CAT 檔案／句段集排序與左欄顯示序 — 規格（2026-06）

> **狀態**：**B-0 已落地**（`cat-tool/app.js`）；更新作業檔×句段集 UI 仍待 B-4。  
> **交付切片**：Phase B **B-0**（Workflow 段落鎖定與 LMS 行數對齊之前須完成）。  
> **上層**：[`CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md`](./CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md)、[`CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md`](./CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md) §4.2。

本文件定義**專案內檔案順序**、**句段集句段排序**、**左欄 ID 顯示**、**篩選與列序關係**、**更新作業檔 × 句段集**；與母檔匯入序（`globalId`）的關係見 [`CAT_SEGMENT_IMPORT_ORDER_AND_INLINE_FMT_ROLLOUT.md`](./CAT_SEGMENT_IMPORT_ORDER_AND_INLINE_FMT_ROLLOUT.md)。

---

## 1. 專案內檔案順序

| 項目 | 定案 |
|------|------|
| 持久排序欄 | **無** `display_order`；Phase B **不做** PM 手動拖曳調整檔案先後 |
| 團隊版 | [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) `db.getFiles` → `created_at` **升冪**（先匯入在前） |
| 離線版 | [`cat-tool/db.js`](../cat-tool/db.js) `getFiles` → 本機 `id` **升冪** |
| 清單 #1、#2 | [`cat-tool/app.js`](../cat-tool/app.js) `loadFilesList` 之 `idx + 1`（`window._lastFilesListForProject` 同序） |

**白話**：「檔案一、檔案二」= **誰先匯入誰排前面**；LMS `segment` 文案應與此一致，並以 `linkedCatFileId` 綁定實際檔案。

---

## 2. 句段集句段排序（定案）

適用：開啟句段集（`openEditorFromView`／`openEditorWithSegments`）時之**預設**順序（使用者當次手動排序見 §4）。

1. **成員範圍**：僅 `cat_views.segment_ids` 內之句段（`cat_segments.id`）。
2. **檔案先後**：僅 `view.file_ids` 內之檔；檔案間順序 **一律** `created_at` 升冪（離線：本機 `id` 升冪）— **不以**建立句段集時 `file_ids` 陣列勾選先後為準。
3. **檔內句段**：在該檔、且屬於本句段集成員之句段，依 **`globalId` 升冪**；缺 `globalId` 時沿用 [`_cmpSegmentImportOrderWithinFile`](../cat-tool/app.js)（`rowIdx` → `sheetName` → `colSrc` → `id`）。
4. **`segment_ids` 語意**：**成員名單**，**不是**顯示順序來源；`getSegmentsByIds` 載入後須依本節規則 **sort**（不依 DB 回傳順序或陣列先後還原為最終順序）。

**與 [`CAT_VIEW_SPEC.md`](./CAT_VIEW_SPEC.md) 對齊**：`file_ids` 記錄涉及哪些檔；排序規則以本文件為準。

---

## 3. 左欄 ID（單檔 + 句段集）

| 項目 | 定案 |
|------|------|
| 顯示內容 | **全清單顯示序** 1、2、3…（`renderEditorSegments` 後之 **`rowIdx + 1`**） |
| 不顯示 | 母檔 **`globalId`** 作為左欄主數字（避免句段集跨檔跳號如 5、12、3） |
| 可選 tooltip | 「母檔匯入序 #N」（`globalId`）供 PM 對帳 |
| 程式觸點 | [`renderEditorSegments`](../cat-tool/app.js)（約 19704 行 `col-id`）、[`openEditor`](../cat-tool/app.js)／[`openEditorWithSegments`](../cat-tool/app.js) |

單檔與句段集**同一套**左欄語意。

---

## 4. 進階篩選與手動排序

### 4.1 篩選（定案 A）

- 篩選模式以 `display:none` **隱藏**不符合列；**不重編**左欄 ID。
- 畫面可見 1、2、5、8（3、4、6、7 被隱藏）— **正常**。
- 建議狀態列或說明：「ID 為全清單列序；隱藏列不重新編號。」
- 實作錨點：[`runSearchAndFilter`](../cat-tool/app.js)（篩選快照 `sfFilterSnapshotSegIds`）。

### 4.2 工具列手動排序

- 使用者可於當次工作階段變更排序（[`applySorting`](../cat-tool/app.js) → `renderEditorSegments`）。
- **不寫回** `cat_views`／`cat_segments`；重開檔案或句段集恢復 §2 預設。
- 手動排序後左欄 ID 隨 `rowIdx` 重編。

---

## 5. 更新作業檔 × 句段集

更新作業檔完成後（含既有增／刪／改列提示）：

| 情境 | 行為 |
|------|------|
| 一般 | 顯示哪些列**新增／刪除／內容變更**（Phase B 延伸或沿用現行統計） |
| 檔案涉及一個或多個句段集 | 列出各句段集及其 **`filter_summary`／篩選條件**；對**新增句段**詢問是否加入各集之 `segment_ids` |
| 同內部階段已指派給 **2 人以上** | 顯示現有段落分配；要求輸入**新列範圍**分配（與 Workflow 更新檔流程一致） |

**白話**：成員預設凍結；更新檔時給 PM **一次明確選擇**是否把新句納入句段集。

---

## 6. Workflow／LMS 列號對齊

| 用途 | 座標 |
|------|------|
| 段落鎖定、`line_start`／`line_end`、`scopeLabel`（如 2A） | **全清單列序**（與左欄 ID 相同；§4.1 篩選**不改號**） |
| 句段資料綁定 | `cat_segments.id`（UUID） |
| 母檔匯入／更新作業檔對帳 | `globalId`（不取代左欄顯示序） |

句段集編輯器畫面為子集時，鎖定與 LMS 行數仍以**母檔開啟時之全清單列序**為準（見 Phase B §5-bis 句段集模式）。

---

## 7. 程式觸點與 B-0 驗收

| 觸點 | 變更方向 |
|------|----------|
| `openEditorFromView` | 依 §2 sort；`filesMap.seqNo` 改由 `created_at`／`id` 推導，不依 `_lastFilesListForProject` 勾選順序單獨定序 |
| `getSegmentsByIds` | 載入後依 §2 sort（RPC／Dexie） |
| `openEditorWithSegments` | 左欄改顯示序；調整 Fix A（`3eb024a`）僅補 `globalId` 之邏輯，避免與左欄顯示序混淆 |
| `renderEditorSegments` | `col-id` 顯示 `rowIdx + 1`（單檔／句段集） |
| `applySorting` `col-id` | 排序鍵改**顯示序**（`rowIdx`），非 `globalId` |
| `updateProgress` | 列範圍以畫面上 `rowIdx` 序為準（與 §6 一致） |

### 驗收（白話）

1. 句段集左欄 **1～N 連號**（非母檔 `globalId` 跳號）。
2. 跨檔順序：**先舊檔後新檔**，檔內依匯入序。
3. 篩選後 ID **不連號可接受**（1、2、5、8）；取消篩選恢復全列號。
4. 重開句段集恢復 §2 預設順序（非上次手動排序）。
5. 更新作業檔涉及句段集時出現**條件說明 + 新句是否加入**流程（UI 可與 B-4 併實作，規格 B-0 先定）。

---

## 8. 修訂紀錄

| 日期 | 內容 |
|------|------|
| 2026-06-12 | 初稿：B-0 檔序、句段集排序、左欄顯示序、篩選 A、更新檔×句段集、Workflow 列號對齊 |
| 2026-06-12 | B-0 程式落地：`openEditorFromView`、建立句段集排序、左欄 `rowIdx+1`、移除句段集 Fix A |
