狀態：已落地待驗收

# 工項 A——`review_rows` 遷移後快照（唯讀驗證）

- **日期**：2026-07-16
- **正式庫**：`wshsmerltcakffllgyul`
- **分支**：`feat/review-segment-assign-a`
- **migration**：`20260716120000_cat_review_segment_assign.sql`（已 `supabase db push`）
- **對照前快照**：[`CAT_REVIEW_SEGMENT_ASSIGN_SNAPSHOT_PRE_2026-07-16.md`](CAT_REVIEW_SEGMENT_ASSIGN_SNAPSHOT_PRE_2026-07-16.md)

## 1. Schema（遷移後）

| 項目 | 值 |
|---|---|
| `cases.review_rows` | **存在** |
| `schema_migrations` | 含 `20260716120000` |
| `cat_upsert_review_stage_assignment` | `(p_file_id, p_assignee_user_id, p_collab_row_id text, p_view_id, p_scope_label, p_line_start, p_line_end, p_workflow_status, p_allow_downgrade boolean)` |

## 2. 驗收方指定三項驗證

### 2.1 `collab_row_id` 回填

```sql
SELECT count(*) FROM cat_stage_assignments a
JOIN cat_file_workflow_stages s ON s.id=a.file_workflow_stage_id
WHERE s.stage_kind='review' AND a.collab_row_id IS NULL;
```

| 指標 | PRE | POST |
|---|---|---|
| review 指派總數 | 311 | 311 |
| `collab_row_id IS NULL` | 311 | **1** |

**剩餘 1 筆明細**（可安全忽略／不屬案件 sync 範圍）：

| 欄位 | 值 |
|---|---|
| assignment_id | `06668ed8-78d0-4221-a9bf-b2b3be54451a` |
| file_id | `cb5fd3f9-3ed8-4b32-bce4-5870ea67685f` |
| file_name | `54873_01_WORD_Patch1.2.5NOTESPRF_v1_zh_TW.docx_zho-TW_作業檔.mqxliff` |
| related_lms_case_id | **NULL**（未連結 LMS 案件） |
| assignee | 威儀 |
| workflow_status | `assigned`（非 completed） |
| view/line | 皆 NULL（整檔殘留） |

**判定**：遷移只對「有 `related_lms_case_id` 且案件有 reviewer」的檔回填。此檔無案件連結，故無法配 `review_rows`；亦**不會**被 `sync_cat_workflow_assignments_for_case` 當 stale 掃到（sync 只掃案件連結檔）。屬孤立殘留、非完成狀態，**可安全保留或日後手動清**；不影響審稿完成數。

### 2.2 review 指派 completed 數

| 指標 | PRE | POST |
|---|---|---|
| `workflow_status = completed` | 301 | **301**（未減少） |

### 2.3 有 reviewer 的案件：`review_rows` 列數 ≥ 連結檔數

| 指標 | 值 |
|---|---|
| 有 reviewer 案件 | 685（與驗收方預檢一致；PRE 快照 686 為當日稍早讀數） |
| `review_rows` 已非空 | 685 |
| 抽查／全量：`review_rows_len >= linked_files`（或無連結檔） | **685 / 685**，shortfall **0** |
| `review_rows_len - linked_files` | min 0 / max 1（多餘列＝無檔案件的未連結列，符合 §2.5 步驟 3） |

## 3. 結論

- 遷移成功；完成狀態未倒退。
- 回填率 310/311；唯一未回填列已列明且可接受。
- 可進入畫面驗收（預覽／正式皆可；正式庫 schema 已到位）。
