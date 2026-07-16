狀態：已落地待驗收

# 工項 A——`review_rows` 遷移前快照（唯讀）

- **日期**：2026-07-16
- **正式庫**：`wshsmerltcakffllgyul`
- **分支**：`feat/review-segment-assign-a`
- **計畫**：[`CAT_REVIEW_SEGMENT_ASSIGN_PLAN_2026-07.md`](CAT_REVIEW_SEGMENT_ASSIGN_PLAN_2026-07.md) §2.5

## 1. Schema（遷移前）

| 項目 | 值 |
|---|---|
| `cases.review_rows` 欄位 | **不存在** |
| `cat_upsert_review_stage_assignment` | `(p_file_id uuid, p_assignee_user_id uuid, p_workflow_status text)` |
| `cat_upsert_translate_stage_assignment` | text 版 + 殘留 uuid `p_collab_row_id` overload |
| `sync_cat_workflow_assignments_for_case` | `(p_case_id uuid)`；review 分支讀 `cases.reviewer` |

## 2. 資料量（遷移前）

| 指標 | 數量 |
|---|---|
| `cases.reviewer` 非空 | 686 |
| `multi_collab = true` 案件 | 39 |
| review 指派總數 | 311 |
| review 指派且 `collab_row_id IS NULL` | 311（全部） |
| 上列且 `workflow_status = completed` | 301 |

## 3. 遷移防呆（即將套用）

- 若案件 `review_rows` 已非空 → **整案跳過**插入。
- 新列帶 `"migratedFromCaseReviewer": true`。
- 既有 review assignment 僅 `UPDATE collab_row_id`（必要時），**不改** `workflow_status`。

## 4. 查詢來源

正式庫唯讀 `execute_sql`（2026-07-16），未改任何列。
