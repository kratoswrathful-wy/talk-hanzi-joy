狀態：已落地待驗收

# 工項 A——正式庫 schema 變更報告

- **分支**：`feat/review-segment-assign-a`
- **migration 檔**：`supabase/migrations/20260716120000_cat_review_segment_assign.sql`
- **計畫**：[`CAT_REVIEW_SEGMENT_ASSIGN_PLAN_2026-07.md`](CAT_REVIEW_SEGMENT_ASSIGN_PLAN_2026-07.md)
- **遷移前快照**：[`CAT_REVIEW_SEGMENT_ASSIGN_SNAPSHOT_PRE_2026-07-16.md`](CAT_REVIEW_SEGMENT_ASSIGN_SNAPSHOT_PRE_2026-07-16.md)
- **遷移後快照**：[`CAT_REVIEW_SEGMENT_ASSIGN_SNAPSHOT_POST_2026-07-16.md`](CAT_REVIEW_SEGMENT_ASSIGN_SNAPSHOT_POST_2026-07-16.md)

## 執行紀錄

- **2026-07-16**：驗收方放行後已執行 `supabase db push --linked`（正式庫 `wshsmerltcakffllgyul`）。
- `schema_migrations` 已含 `20260716120000`。

## Schema 變更摘要

| 物件 | 變更 |
|---|---|
| `cases.review_rows` | **新增** `jsonb NOT NULL DEFAULT '[]'` |
| `cat_upsert_review_stage_assignment` | **DROP** 舊 `(uuid,uuid,text)`；**新建** 對等 translate 簽名＋`p_allow_downgrade boolean DEFAULT false` |
| `cat_upsert_translate_stage_assignment` | **DROP** 舊簽名（含殘留 uuid overload）；**新建** 同簽名＋`p_allow_downgrade`；A 階段防降級語意同 2026-07-14 |
| `sync_cat_workflow_assignments_for_case` | review 分支改讀 `review_rows`；**停止**讀 `cases.reviewer`；upsert **永不傳** `p_allow_downgrade` |
| 資料遷移 | `reviewer` 非空且 `review_rows` 空 → 每連結檔一列整檔審稿列；`collab_row_id` 回填；**已非空整案跳過** |

## 風險與防呆

- 完成狀態不倒退（只 UPDATE `collab_row_id`，不改 `workflow_status`）。
- 重跑 migration 不重複插列（`review_rows` 已非空跳過）。
- 翻譯路徑呼叫簽名相容（新參數有 DEFAULT）。

## 驗收方勾選

- [x] schema 可上正式庫
- [x] 放行後由代理執行 `db push` 並寫 POST 快照

## push 後三項驗證（摘要）

| # | 結果 |
|---|---|
| 1 `collab_row_id IS NULL` | **1**（預期 ≈0）；明細見 POST §2.1——無 LMS 連結檔孤立列，非 completed |
| 2 completed 數 | **301＝301**（未減少） |
| 3 review_rows ≥ 連結檔 | **685/685** shortfall 0 |
