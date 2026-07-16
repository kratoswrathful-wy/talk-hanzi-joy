狀態：已落地待驗收

# 工項 D schema 報告——`workflow_status` 等級防降級

- **日期**：2026-07-16
- **分支**：`feat/review-segment-status-d`
- **正式庫**：`wshsmerltcakffllgyul`
- **審核**：2026-07-16 放行；**已 `db push`**（`20260716180000`）
- **已知不對稱（備查）**：stage 重開時 `completed` 可被 sync 降回（2026-07-14 反向路徑）；`in_progress` 不會——偏保守、可接受

---

## 1. 變更摘要

| 項目 | 說明 |
|---|---|
| Migration 檔 | `supabase/migrations/20260716180000_cat_wf_status_rank_no_downgrade.sql` |
| 表結構 | **無**新表／新欄；`cat_stage_assignments.workflow_status` CHECK 已含 `in_progress`（`20260612120000`） |
| 新函式 | `cat_wf_status_rank(text)`、`cat_resolve_effective_upsert_workflow_status(...)` |
| 改寫函式 | `cat_upsert_translate_stage_assignment`、`cat_upsert_review_stage_assignment`（簽名不變，含既有 `p_allow_downgrade DEFAULT false`） |
| sync | **不改**呼叫簽名；仍故意不傳 `p_allow_downgrade`；防降級改由 upsert 內部等級規則擋 |

## 2. 行為（與 JS 同構）

等級：`assigned=0`＜`in_progress=1`＜`completed=2`

1. **2026-07-14 保留**：既有 `completed` 且 stage 仍 `completed` 且 `NOT allow_downgrade` → 不得洗成非 completed  
2. **等級防降級**：`rank(requested) < rank(existing)` 且 `NOT allow_downgrade` → 維持 existing  
3. **反向路徑**：existing=`completed` 且 stage **已非** completed → 允許降回（檔案重開）  
4. **D5-預設**：LMS sync 永不傳 `p_allow_downgrade=true`

## 3. 風險與回歸

| 風險 | 緩解 |
|---|---|
| sync 把 `in_progress` 洗回 `assigned` | upsert 等級擋（T-D5-1／T-D5-4） |
| completed 被洗回 | 2026-07-14＋等級（T-D5-2／T-D5-5） |
| 重開卡死 | stage 非 completed 反向路徑；PM 亦可 `allow_downgrade` |
| 重跑 migration | 全 `CREATE OR REPLACE`，可重跑 |

## 4. 放行後步驟（核准後才做）

1. `supabase db push`（自已 link 之目錄）  
2. `node scripts/check-migration-history.mjs --live`  
3. 手動／測試模式：設 assignment=`in_progress` → 觸發 sync → 確認仍 `in_progress`

## 5. 請驗收方勾選

- [ ] 核准本 migration 上正式庫  
- [ ] 確認無需額外欄位／RLS 變更  
