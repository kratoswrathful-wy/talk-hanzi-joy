# Supabase 健康度與日誌 — 排查與修正步驟

當前端出現登入／讀取資料卡住、504、`PGRST003`、Auth 逾時等現象時，請依序檢查。本專案程式已固定使用 **`receive_translator_case_reply_slack_dms`**（結尾為 **`dms`**），若日誌出現 **`...slack_cms`** 表示某處仍誤用錯字（見下文第 5 節）。

---

## 1. 儀表板「Unhealthy」

1. 開啟 [Supabase Dashboard](https://supabase.com/dashboard) → 你的專案 → **Project Settings** 或首頁健康狀態。
2. 若 **Database / PostgREST / Auth** 顯示異常：
   - 到 **Database** → **Settings** 檢查 **Compute**（過小易導致連線池滿、查詢慢）。
   - 檢視 **Reports** / **Logs** 是否有長時間執行的查詢。
3. 必要時在 Supabase 支援允許範圍內 **重啟** 或 **升級方案／加大 compute**（依官方文件）。

---

## 2. PostgREST `PGRST003` 與 HTTP 504

訊息範例：`Timed out acquiring connection from connection pool.`

**意義**：API 層向 Postgres 取連線時逾時，常見於 DB 過載、連線池用滿、或資料庫本身回應過慢。

**建議步驟**：

1. **Database → Roles / Connection pooling**：確認連線數設定與應用負載相符（勿在客戶端開過多長連線）。
2. 在 **SQL Editor** 檢查是否有 **長時間執行** 的查詢（`pg_stat_activity` 等，依 Supabase 文件）。
3. 減少同時大量請求（例如列表頁並發、輪詢間隔）。
4. 升級 **Database compute** 或優化慢查詢。

---

## 3. Auth 日誌：`/token`、`/user` 504 / `context deadline exceeded`

**意義**：GoTrue（Auth 服務）在存取 **Auth 專用資料表** 或與 DB 互動時逾時，常與 **同一套 Postgres 負載** 有關。

**建議**：與第 2 節一併處理 DB 與連線池；確認 **Auth** 服務在 Dashboard 無額外錯誤。

---

## 4. Postgres 日誌：`column ... does not exist`

若錯誤為 **`receive_translator_case_reply_slack_cms`**（**cms**）：

- 正確欄位名為 **`receive_translator_case_reply_slack_dms`**（**dms**）。
- 本 repo 已透過 [`src/lib/profile-columns.ts`](../src/lib/profile-columns.ts) 統一 SELECT 欄位，**請勿**在程式中拼錯。

若錯誤仍出現在 **遠端 DB**，代表錯誤可能來自：

- 尚未更新之 **舊前端**（其他部署網址）。
- **Database Webhook / Trigger / Function / RLS policy** 內寫死錯字。

在 **SQL Editor** 搜尋（依權限執行）：

```sql
-- 搜尋函式／觸發器原始碼是否含錯字
SELECT proname, prosrc
FROM pg_proc
WHERE prosrc ILIKE '%slack_cms%';

-- 搜尋 RLS policy（若版本支援）
SELECT * FROM pg_policies WHERE definition ILIKE '%slack_cms%';
```

將錯字改為 **`receive_translator_case_reply_slack_dms`** 或改為使用正確欄位。

---

## 5. 遷移與本機／正式庫一致

1. 確認已執行 migration：[`supabase/migrations/20260322120000_profile_receive_case_reply_slack.sql`](../supabase/migrations/20260322120000_profile_receive_case_reply_slack.sql)。
2. 在本機或 CI：`npx supabase db push`（或團隊慣用之部署流程），使 **正式庫** 具備 **`receive_translator_case_reply_slack_dms`** 欄位。

---

## 6. 帳單「Missing tax ID」

與連線逾時無直接因果，但建議於 **Billing** 補齊 **Tax ID**，避免帳戶被限制而影響服務。

---

## 7. 與本專案前端的關係

- 已加入 **登入／案件載入逾時** 與 **可讀錯誤訊息**，可避免使用者端「無限轉圈」，但 **無法取代** 後端 DB／Auth 修復。
- **`profiles` 查詢** 應使用 **`PROFILE_SELECT_COLUMNS`**（見 `profile-columns.ts`），避免 `select("*")` 依賴快取或誤選欄位。
