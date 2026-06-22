# Phase C — 追蹤修訂（Revision Tracking）

**狀態**：**Slice C-1／C-2 實作中**（2026-06-21）  
**上層計畫**：[`CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md`](./CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md) §4.3  
**前置**：B-6 `enqueueStageSnapshot` hook（已落地 stub）、B-7g 確認狀態 UX（已驗收）

---

## §1 功能概述

追蹤修訂模式為**唯讀審閱**專用畫面，可並排檢視各 Workflow 階段譯文快照、字元層級 diff，以及審稿評註與譯者回應串。

### 進入方式

| 入口 | 行為 |
|------|------|
| 專案檔案清單每列 | 「追蹤修訂」按鈕 → 以追蹤修訂模式開啟該檔 |
| 編輯器工具列 | 「追蹤修訂」按鈕 → 切換目前檔案至追蹤修訂模式（不重新載入句段） |

退出：模式列「退出追蹤修訂」→ 回到一般編輯模式。

---

## §2 決策記錄（2026-06-21 定案）

| 事項 | 決定 |
|------|------|
| 快照粒度 | **逐句 upsert**：每次 Ctrl+Enter 確認覆寫該句段 `post_translate`／`post_review`；`baseline_before_translate` 維持整檔（prep 完成時） |
| PM 補確認 | 接受：快照以最後確認者為準 |
| 舊案無快照 | 顯示「無快照紀錄」，不 fallback 至當前譯文 |
| 錯誤類型選項 | **系統層級**（`cat_annotation_options`），PM+ 在「修訂管理」維護 |
| 預設選項 | 術語錯誤、語法錯誤、漏譯、語感不佳；輕微／中等／嚴重 |
| 模式可否編輯 | **不行**，純審閱；要改譯文須退出模式 |
| Slack 通知 | stage assignment 審稿指派人 ＋ 評註作者（去重，各收一次） |
| 檔案清單入口 | 每列「追蹤修訂」按鈕 |
| 評註展開 | 點句段列右側「+評註」圖示（非整列點擊） |
| 右側工具列 | 此模式預設隱藏，保留展開鈕 |
| Diff 樣式 | 刪除＝紅色刪除線；新增＝綠色底線；tag pill 整體視為單元 |

### 容量與效能（評估結論）

- 每句段最多 3 列快照（upsert，不隨確認次數疊加）
- 500 句段檔約 1.5 MB 快照資料；Supabase 空間影響可忽略
- 逐句寫入採 **fire-and-forget**，不阻塞 Ctrl+Enter
- Diff 採可視列 lazy 計算，避免大檔阻塞主執行緒

---

## §3 資料模型

### 3.1 `cat_segment_stage_snapshots`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | uuid PK | |
| `segment_id` | uuid FK → cat_segments | ON DELETE CASCADE |
| `file_id` | uuid FK → cat_files | |
| `snapshot_reason` | text | `baseline_before_translate` \| `post_translate` \| `post_review` |
| `target_text` | text | 快照譯文 |
| `target_tags` | jsonb | 快照 tag 陣列 |
| `confirmed_by` | uuid FK → profiles | 最後確認者 |
| `snapshotted_at` | timestamptz | |

**UNIQUE** `(segment_id, snapshot_reason)`

### 3.2 `cat_annotation_options`（系統層級）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `option_type` | text | `issue_type` \| `severity` |
| `label` | text | 顯示文案 |
| `sort_order` | int | 排序 |
| `is_active` | boolean | 停用後下拉不顯示 |

### 3.3 `cat_segment_annotations`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `segment_id` | uuid | |
| `file_id` | uuid | |
| `parent_annotation_id` | uuid nullable | 回覆串接 |
| `issue_type` | text nullable | 根評註必填；回覆可 null |
| `severity` | text nullable | 根評註必填 |
| `note` | text | 說明或回覆內容 |
| `author_user_id` | uuid | |
| `responder_role` | text | `reviewer` \| `translator` |
| `is_translator_ack` | boolean | 譯者「已看到」勾選 |

Dexie **v26**：`stageSnapshots`、`segmentAnnotations`、`annotationOptions`

---

## §4 快照觸發規格

### 4.1 整檔 baseline

**時機**：PM「標記準備完成」  
**行為**：對檔案內所有句段 upsert `baseline_before_translate`（覆寫先前 baseline）

### 4.2 逐句 post_translate / post_review

**時機**：`applyWorkflowConfirmToSegment` 內  
- `kinds.includes('translate')` → upsert `post_translate`  
- `kinds.includes('review')` → upsert `post_review`  

**方式**：fire-and-forget，失敗不阻擋確認流程

### 4.3 任務完成 catch-up

**時機**：PM 整檔翻譯／審稿完成、段落全完成自動完成審稿步驟  
**行為**：僅對**尚無**該 `snapshot_reason` 的句段補寫快照（不覆蓋逐句快照）

---

## §5 追蹤修訂模式 UI

### 5.1 頂端模式列（預設全勾）

- ☑ 原文  
- ☑ 準備完成時譯文（`baseline_before_translate`）  
- ☑ 翻譯完成時譯文（`post_translate`）  
- ☑ 審稿完成時譯文（`post_review`）  
- ☑ 修訂標記  

### 5.2 欄位顯示

| 欄 | 內容 |
|----|------|
| # | 列號 |
| 原文 | `source_text` + source tags |
| 準備完成時 | baseline 快照；無則「無快照紀錄」 |
| 翻譯完成時 | post_translate 快照 + diff（對左側第一個可見欄） |
| 審稿完成時 | post_review 快照 + diff（對左側第一個可見欄） |

### 5.3 Diff 規則

- 「修訂標記」勾選時，除原文外每個可見欄與**左側第一個可見欄**比對  
- 取消「翻譯完成時」→ 審稿 diff 改與「準備完成時」（或更左可見欄）比對  
- Tag-aware：pill 整體比對，不做字元級 tag diff

### 5.4 版面

- 隱藏一般 `#gridBody` 與搜尋列；顯示 `#revTrackBar` + `#revTrackGrid`  
- 右側 `.editor-side-panel` 預設 `display:none`；`#btnRevTrackShowSidePanel` 可展開

---

## §6 評註系統

### 6.1 審稿人／PM+ 新增評註

1. 點句段列「+評註」  
2. 展開：`[錯誤類型 ▼] [嚴重性 ▼] [說明] [確認] [取消]`  
3. 確認時必須已選類型＋嚴重性  
4. 確認後顯示已存評註 + 「+」新增第二條  

### 6.2 譯者確認與回應

- 有根評註的句段：顯示「譯者確認 □」+ 回應輸入（限該句段指派譯者）  
- 送出回應 → 寫入 `responder_role: translator` + Slack（§8）

### 6.3 審稿人後續回覆

譯者回應後，顯示「審稿確認 □ [輸入框]」，審稿人可再回覆，直至無新輸入。

---

## §7 修訂管理（PM+）

位置：`#notesPanel` 第四 tab「修訂管理」（僅追蹤修訂模式 + PM+ 可見）

功能：增刪改 `issue_type`／`severity` 選項（寫入 `cat_annotation_options`）

---

## §8 Slack 通知

**觸發**：譯者送出評註回應並點「確定」

**對象**（去重）：
1. 該檔 `review` stage 的 `cat_stage_assignments.assignee_user_id`  
2. 根評註 `author_user_id`

**訊息**：
```
{案件名稱} 的 {檔名} 的審稿內容有回應，請前往確認：{CAT 檔案連結}
```

連結格式：`/cat/team/files/{fileId}?p={projectId}&revtrack=1`

---

## §9 交付切割

| Slice | 內容 | 狀態 |
|-------|------|------|
| **C-1** | 快照表 + RPC + Dexie + `enqueueStageSnapshot` + 追蹤修訂檢視 UI | 實作中 |
| **C-2** | 評註表 + 評註 UI + 修訂管理 + Slack | 實作中 |
| **C-3** | Excel／htm 匯出 | 規劃中 |

---

## §10 程式觸點

| 主題 | 路徑 |
|------|------|
| 快照 hook | [`cat-tool/app.js`](../cat-tool/app.js) `enqueueStageSnapshot`、`_upsertSegmentSnapshot` |
| 快照模組 | [`cat-tool/js/stage-snapshot.js`](../cat-tool/js/stage-snapshot.js) |
| 追蹤修訂 UI | [`cat-tool/js/rev-track.js`](../cat-tool/js/rev-track.js) |
| Diff | [`cat-tool/js/rev-track-diff.js`](../cat-tool/js/rev-track-diff.js) |
| Dexie v26 | [`cat-tool/db.js`](../cat-tool/db.js) |
| Cloud RPC | [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) |
| Migration snapshots | [`supabase/migrations/20260621120000_cat_phase_c_snapshots.sql`](../supabase/migrations/20260621120000_cat_phase_c_snapshots.sql) |
| Migration annotations | [`supabase/migrations/20260621130000_cat_phase_c_annotations.sql`](../supabase/migrations/20260621130000_cat_phase_c_annotations.sql) |

---

## §11 修訂紀錄

| 日期 | 內容 |
|------|------|
| 2026-06-21 | 初稿：產品決策、資料模型、UI／評註／Slack 規格、Slice C-1～C-3 |
