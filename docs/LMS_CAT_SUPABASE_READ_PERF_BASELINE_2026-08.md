狀態：已落地待驗收

# LMS／CAT Supabase 讀取效能基準（2026-08）

**main SHA（開始時）：** `d99e20ecf241fe87939806011f8276f324b2ec36`  
**量測時間：** 2026-08-25（UTC+8）  
**正式 DB 資料量：** `cat_segments` 167,285；`cat_tm_segments` 231,288；DB ≈ 345 MB  
**最大檔案：** 7,694 segments（`ccaec56f-4b1a-4a2b-a2a5-5cd9c34be3c8`）  
**最大 TM：** 48,993 segments（`f78d3683-6782-4fec-ae16-7b9b589acd12`）

> 2026-08-24 Supabase「Issues affecting automatic disk resizing」含 `ap-southeast-2`，與本專案區域重疊；**時間相關，非已證明因果**。事故期間延遲不納入基準。

---

## 1. CAT EXPLAIN（修正前）

### 1.1 最大檔案第一頁（offset 0 / limit 1000）

```text
Limit
  -> Index Scan using cat_segments_pkey
       Filter: (file_id = ...)
```

- Startup Cost ≈ 0.42；Total Cost ≈ 2862.56
- 走 `cat_segments_pkey` 再 filter `file_id`

### 1.2 最大檔案深頁（offset 7000 / limit 1000）

```text
Limit
  -> Sort (Sort Key: id)
       -> Bitmap Heap Scan on cat_segments
            -> Bitmap Index Scan on cat_segments_file_idx
```

- Startup Cost ≈ 9767.79；Total Cost ≈ 9769.86
- 先用 `cat_segments_file_idx` 取整檔再 Sort

### 1.3 最大 TM 第一頁（offset 0 / limit 1000）

```text
Limit
  -> Index Scan using cat_tm_segments_pkey
       Filter: (tm_id = ...)
```

- Total Cost ≈ 341.44

### 1.4 最大 TM 深頁（offset 48000 / limit 1000）

```text
Limit
  -> Index Scan using cat_tm_segments_pkey
       Filter: (tm_id = ...)
```

- Startup Cost ≈ 16369.36；Total Cost ≈ 16710.38
- 深頁仍主要走 pkey + filter，成本顯著上升

### 1.5 既有索引（修正前）

| 表 | 索引 |
|---|---|
| `cat_segments` | `pkey(id)`、`file_idx(file_id)`、`file_global_id_idx(file_id, global_id)`、WF confirmed_by |
| `cat_tm_segments` | `pkey(id)`、`tm_idx(tm_id)` |

**缺少：** `(file_id, id)`、`(tm_id, id)`

---

## 2. LMS request 分類（基準量測指引）

量測時分開計數，勿把正常請求算成 duplicate：

| 類型 | 說明 | 判定 |
|---|---|---|
| full-list | `cases_visible` / `fees_visible` / invoices 全表 | 同一 auth 原因應 ≤1 in-flight |
| setting key | `app_settings` 依 logical key（含 env 前綴） | 初始化每 key 一輪 |
| assignee 三表 | `profiles` + `invitations` + `member_translator_settings` | 初始化一組 |
| poll probe | `updated_at` limit 1 | 正常，非 duplicate |
| legacy fallback | `app_settings` 無前綴二次查詢 | 正常，分開計 |
| CaseDetailPage 背景 sync | 產品預期 full load | 基準標註排除 |

### 建議手動／Playwright 情境

1. 已登入 F5 `/cases`
2. 登出後重新登入
3. `/cases` → `/cases/:id`（標註背景 sync）
4. `/cases` → `/fees`
5. 分頁離開後回前景

---

## 3. 已知程式 duplicate（基準時靜態證實；後續已修）

> **本節保留 2026-08-25 基準當下的問題清單，不覆寫歷史證據。**  
> 後續修正、PR／commit、兩輪驗收與可量測前後差異見：  
> [`LMS_CAT_SUPABASE_READ_PERF_DEVLOG_2026-08.md`](LMS_CAT_SUPABASE_READ_PERF_DEVLOG_2026-08.md)（目前 `main` `19d49207`）。

| # | 基準時問題 | 後續狀態（摘要） |
|---|---|---|
| 1 | `settings-init`：`ensureLoaded()` 與 auth `loadAllSettings()` 雙軌 | **已修** PR #71 |
| 2 | `loadAssignees` 無 single-flight；`InvoicesPage` 等額外呼叫 | **已修** PR #71 |
| 3 | fee／invoice／client-invoice：hook auth + store `TOKEN_REFRESHED` full reload | **已修** PR #71／#76（`ensureLoaded`；`fees_visible` 3→1） |
| 4 | CAT：`getTMSegmentsPage` 仍用 OFFSET；UI 五處 caller | **已修** PR #72 索引 + #73 keyset |

基準後另發現並已修（詳見 DEVLOG）：開檔句段雙輪（#75）、poll／visibility burst（#77）、anon 葉子表 timeout（#74）、測試模式 changelog／返回票（#78）。

---

## 4. 交付分支（基準規劃；實作後擴充）

基準時規劃三支：

1. `perf/lms-read-single-flight` → PR #71
2. `perf/cat-read-indexes` → PR #72
3. `perf/cat-keyset-pagination` → PR #73

驗收後追加：#74～#78（見 DEVLOG 交付總表）。本檔只存基準與分類規則；工程敘事以 DEVLOG 為準。
