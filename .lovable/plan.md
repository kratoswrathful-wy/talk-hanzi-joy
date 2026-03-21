

# 遷移匯出清單

你的 repo 裡已經有完整的遷移所需檔案，**不需要更新 repo**。以下是你需要從 Lovable Cloud 匯出的所有東西：

---

## 一、程式碼（已在 repo 中，不需額外匯出）

以下檔案已存在於你的專案 repo，只要同步到 GitHub 就有了：

| 項目 | 位置 |
|------|------|
| 完整 Schema SQL | `FULL_SCHEMA.sql`（684 行，可一鍵執行） |
| 48 個 Migration 檔案 | `supabase/migrations/` |
| 4 個 Edge Functions | `supabase/functions/` |
| Edge Function 設定 | `supabase/config.toml` |
| 遷移指南 | `DEVELOPER_HANDOFF.md`、`MIGRATION_GUIDE.md` |
| 前端完整原始碼 | `src/` |

**動作**：先到 Settings → GitHub 把 repo 同步到你的 GitHub，這樣程式碼就安全備份了。

---

## 二、需要從 Lovable Cloud 匯出的資料

### A. 業務資料（14 張表，共 397 筆）

| 表格 | 筆數 | 匯出方式 |
|------|------|---------|
| `app_settings` | 15 | Cloud → Database → 選表 → Export CSV |
| `cases` | 89 | 同上 |
| `fees` | 136 | 同上 |
| `invoices` | 4 | 同上 |
| `invoice_fees` | 25 | 同上 |
| `client_invoices` | 9 | 同上 |
| `client_invoice_fees` | 9 | 同上 |
| `internal_notes` | 8 | 同上 |
| `member_translator_settings` | 22 | 同上 |
| `permission_settings` | 3 | 同上 |
| `icon_library` | 26 | 同上 |
| `invitations` | 2 | 同上 |
| `profiles` | 25 | 同上（供參考，新專案會重建） |
| `user_roles` | 24 | 同上（供參考，新專案會重建） |

**匯出方式**：在 Lovable 編輯器 → Cloud 頁面 → Database → Tables → 選擇表格 → 點右上角匯出按鈕下載 CSV。

**匯入順序**（有外鍵依賴）：
1. `app_settings`、`permission_settings`、`member_translator_settings`、`icon_library`（獨立表，先匯）
2. `cases`、`internal_notes`（獨立表）
3. `fees`（費用單）
4. `invoices`、`client_invoices`（請款單）
5. `invoice_fees`、`client_invoice_fees`（關聯表，最後匯）
6. `invitations`（用於重建帳號前插入）

### B. Storage 檔案（3 個 Bucket）

| Bucket | 用途 |
|--------|------|
| `avatars` | 使用者頭像 |
| `case-files` | 案件附件 |
| `case-icons` | 案件圖示 |

**匯出方式**：Cloud → Storage → 進入各 Bucket → 逐一下載檔案。

### C. Secret（1 個需手動記錄）

| Secret | 說明 |
|--------|------|
| `NOTION_API_TOKEN` | 你自己的 Notion API 金鑰，需要在新專案重新設定 |

其餘 Secret（`SUPABASE_URL` 等）由新 Supabase 專案自動提供。

---

## 三、不需要匯出的東西

| 項目 | 原因 |
|------|------|
| 資料庫結構 | 已在 `FULL_SCHEMA.sql` 中 |
| RLS 政策 | 已在 `FULL_SCHEMA.sql` 中 |
| Edge Functions 程式碼 | 已在 `supabase/functions/` 中 |
| 前端程式碼 | 已在 repo 中 |
| 使用者密碼 | 無法匯出，需在新專案重設 |

---

## 四、操作步驟總結

```text
步驟 1：GitHub 同步 → Settings → GitHub → 建立 repo
步驟 2：匯出 14 張表的 CSV → Cloud → Database → Tables → Export
步驟 3：下載 3 個 Storage Bucket 的所有檔案
步驟 4：記下你的 NOTION_API_TOKEN
步驟 5：交給工程師，用 DEVELOPER_HANDOFF.md 在新 Supabase 執行
```

