狀態：已落地待驗收

# 工項 2 只讀清單——review 指派 `collab_row_id IS NULL` 存底

- **日期**：2026-07-22
- **正式庫**：`wshsmerltcakffllgyul`
- **條件**：`cases.review_rows` 為非空 array，且同檔 review stage 指派 `collab_row_id IS NULL`
- **查詢時間**：2026-07-22（工項 1 sync 閘門已 `db push` 之後）

## 清單（3 筆）

| 案件 | multi_collab | 檔名 | 被指派人 | assignment workflow | review stage | 建議 collab_row_id |
|---|---|---|---|---|---|---|
| Pulse 260721 | false | Pulse Loca - Batch 2.xlsx_zho-TW.mqxliff | 威儀 | assigned | pending | `rr_mrupx3yn396j` |
| WIZA 260720 | false | 590_…stardew-valley…mqxliff | 威儀 | completed | completed | `rr_mrt5gsu3lw95` |
| WIZA 260721B | false | 620_…Customer Review Rating…mqxliff | 威儀 | completed | completed | `rr_mrvqlsq4uzg3` |

### 識別碼（回填用）

| case_id | file_id | assignment_id | suggested_review_row_id |
|---|---|---|---|
| `43a76498-df34-4a5d-9f6a-d74c665943be` | `0fbf582c-0218-439f-9d6c-fa257bd41e72` | `9b408f87-7e3e-4a1f-a655-5e4f6b08c42d` | `rr_mrupx3yn396j` |
| `b4c13579-7bde-4d53-a203-080ea6241f3f` | `c7b64078-ce68-457a-b89d-02584302184b` | `f37e568c-983a-40d9-bc72-9dacbe51ad38` | `rr_mrt5gsu3lw95` |
| `70f93a37-93ce-4154-b2da-936e5f9ecb9e` | `bf844331-ff4d-408c-8237-987b183e8d75` | `91d74eb4-0d27-453d-9918-e32e7f71ae3e` | `rr_mrvqlsq4uzg3` |

## 誤傷評估

- 三筆皆單人、`review_rows_len=1`、審稿人與指派人均為威儀 → 建議 id 為唯一列，**無歧義**。
- 回填：`UPDATE cat_stage_assignments.collab_row_id`；並以 CAT assignment／stage `completed` 回寫 `review_rows[].taskCompleted`。

## 放行

計畫實作核准下執行回填 migration（見同波 PR）。
