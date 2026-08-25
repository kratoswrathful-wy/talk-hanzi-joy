狀態：實作中

# Supabase Micro Compute 觀察清單（讀取效能修正後）

**開始日：** 合併三波 PR 並部署後起算  
**觀察期：** 3～5 個**正常工作日**（避開 Supabase 官方事故時段）  
**前提：** 已合併 LMS single-flight、CAT indexes、CAT keyset；**尚未**升級 Compute

## 每日記錄（建議）

| 日期 | 官方事故？ | LMS p50/p95 | CAT 開檔／TM 載入 | DB timeout 次數 | RAM／swap | 連線數尖峰 | 備註 |
|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |

## 升級 Small 的觸發條件（任一成立且官方無事故）

1. 反覆 DB connection timeout／pool checkout timeout
2. 多人正常使用即週期性整站讀不到資料
3. Dashboard Observability：RAM 長時間逼近上限或持續 swap
4. DB 連線長時間逼近 Micro 上限（非短暫尖峰）
5. 查詢計畫正常、duplicate 已消除，但實際 p95 仍不可接受

若以上皆無：**維持 Micro。**

## 證據來源

- 基準：[`docs/LMS_CAT_SUPABASE_READ_PERF_BASELINE_2026-08.md`](LMS_CAT_SUPABASE_READ_PERF_BASELINE_2026-08.md)
- Index EXPLAIN：[`docs/CAT_READ_PATH_INDEXES_EXPLAIN_2026-08.md`](CAT_READ_PATH_INDEXES_EXPLAIN_2026-08.md)（indexes 分支）
- Supabase Status：https://status.supabase.com/
