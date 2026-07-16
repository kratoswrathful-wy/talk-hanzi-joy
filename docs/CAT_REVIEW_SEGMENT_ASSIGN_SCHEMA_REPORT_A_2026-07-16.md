狀態：實作中

# 工項 A——正式庫 schema 變更報告（待驗收方放行後再 `db push`）

- **分支**：`feat/review-segment-assign-a`
- **migration 檔**：`supabase/migrations/20260716120000_cat_review_segment_assign.sql`
- **計畫**：[`CAT_REVIEW_SEGMENT_ASSIGN_PLAN_2026-07.md`](CAT_REVIEW_SEGMENT_ASSIGN_PLAN_2026-07.md)
- **遷移前快照**：[`CAT_REVIEW_SEGMENT_ASSIGN_SNAPSHOT_PRE_2026-07-16.md`](CAT_REVIEW_SEGMENT_ASSIGN_SNAPSHOT_PRE_2026-07-16.md)

## 請放行後才執行

```text
npx supabase db push --linked
```

（禁止 MCP `apply_migration` 直套。）

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

- [ ] schema 可上正式庫
- [ ] 放行後由代理執行 `db push` 並寫 POST 快照
