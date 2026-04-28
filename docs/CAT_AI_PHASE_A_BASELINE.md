# 階段 A：Supabase migration 基線紀錄（linked 專案）

> 供維運對照「倉庫 `supabase/migrations/` 與遠端歷史是否一致」。**本檔只記已用 `supabase link` 驗證之專案**；若另有 staging／第二專案，請各填一筆或延伸表格。

| 欄位 | 內容 |
|------|------|
| 驗證日期 | 2026-04-28（UTC+8） |
| Supabase `project_id`（`supabase/config.toml`） | `wshsmerltcakffllgyul` |
| 指令 | `supabase migration list`（本機須已 `supabase login` 且已 link） |
| 本地 npm 捷徑 | `npm run verify:supabase-migrations` |
| 結果 | **Local 與 Remote 欄逐列一致**；含 CAT AI 相關 **`20260426143000`～`20260429203000`**（§1.2） |

**本次修復（簡要）**：

- 遠端曾缺 **`20260428120000_cat_lease_same_user_takeover.sql`** 於 migration 歷史（之後的 migration 已先套用，需回補該筆）。
- 已執行：`supabase db push --include-all --yes`，成功套用該檔，再跑 `supabase migration list` 確認無遺漏列。

**手動煙測（團隊版、§12 A）**：請以具權限帳號在 **`/cat/team`** 開一條庫內準則 → 在編輯 modal 內**新增一筆範例** → 儲存 → **強制重新整理** → 確認範例仍在。上列 DB 已對齊不代表瀏覽器／RPC 無快取問題，仍建議在部署環境實測一輪。
