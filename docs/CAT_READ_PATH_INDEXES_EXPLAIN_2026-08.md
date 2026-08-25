狀態：已落地待驗收

# CAT read-path indexes — EXPLAIN after（2026-08-25）

**Migration：** `20260824174844_cat_read_path_indexes.sql`  
**Indexes：** `cat_segments_file_id_id_idx (file_id, id)`、`cat_tm_segments_tm_id_id_idx (tm_id, id)`

| Query | Before index | After index |
|---|---|---|
| segments limit 1000 | pkey + Filter；cost ≈ 2862 | **file_id_id_idx**；cost ≈ 904 |
| segments offset 7000 | file_idx + Sort；cost ≈ 9769 | **file_id_id_idx**；cost ≈ 7149 |
| TM limit 1000 | pkey + Filter；cost ≈ 341 | **tm_id_id_idx**；cost ≈ 267 |
| TM offset 48000 | pkey + Filter；cost ≈ 16710 | **tm_id_id_idx**；cost ≈ 13065 |

Planner 已使用新 composite index。深頁 OFFSET 仍有 skip cost → 由 keyset PR 解決。

未改 RLS／grant／Compute。
