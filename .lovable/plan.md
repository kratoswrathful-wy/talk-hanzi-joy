

# 完整遷移清單：從 Lovable Cloud 搬到外部 Supabase

本文件列出你需要搬移的所有項目，可以交給開發者按步驟執行。

---

## 一、資料庫 Schema（48 個 Migration 檔案）

所有檔案位於 `supabase/migrations/` 目錄，使用 Supabase CLI 可一次性套用。

### 資料表總覽

| 表格名稱 | 用途 |
|---------|------|
| `profiles` | 使用者個人資料（姓名、頭像、時區、聯絡方式） |
| `user_roles` | 使用者角色（member / pm / executive） |
| `invitations` | 邀請紀錄 |
| `permission_settings` | 欄位與模組的權限設定（含環境隔離） |
| `app_settings` | 全域應用設定（客戶清單、計費單位、標籤樣式等） |
| `member_translator_settings` | 譯者備註、排序、不開單、凍結設定 |
| `fees` | 費用單紀錄 |
| `invoices` | 稿費請款單 |
| `invoice_fees` | 請款單與費用單關聯 |
| `client_invoices` | 客戶請款單 |
| `client_invoice_fees` | 客戶請款與費用單關聯 |
| `cases` | 案件管理 |
| `internal_notes` | 內部問題表 |
| `icon_library` | 案件圖示庫 |

### 資料庫函數

| 函數名稱 | 用途 |
|---------|------|
| `has_role(user_id, role)` | 檢查使用者是否擁有特定角色 |
| `is_admin(user_id)` | 檢查是否為 PM 或執行官 |
| `handle_new_user()` | 新使用者註冊時自動建立 profile 與角色 |
| `handle_updated_at()` | 自動更新 updated_at 欄位 |

### 自訂型別

- `app_role` ENUM：`member`, `pm`, `executive`

### Realtime 設定

以下表格需啟用 Realtime：
`cases`, `fees`, `invoices`, `client_invoices`, `invoice_fees`, `client_invoice_fees`, `app_settings`, `member_translator_settings`, `profiles`, `internal_notes`

---

## 二、Storage Buckets（3 個）

| Bucket 名稱 | 用途 | 公開 |
|------------|------|------|
| `avatars` | 使用者頭像 | 是 |
| `case-files` | 案件附件檔案 | 是 |
| `case-icons` | 案件圖示 | 是 |

需手動下載現有檔案並上傳到新專案。

---

## 三、Edge Functions（4 個）

| 函數名稱 | 檔案位置 | 用途 |
|---------|---------|------|
| `create-user` | `supabase/functions/create-user/index.ts` | 管理員建立使用者帳號 |
| `delete-user` | `supabase/functions/delete-user/index.ts` | 管理員刪除使用者 |
| `dev-switch-user` | `supabase/functions/dev-switch-user/index.ts` | 開發用角色切換 |
| `fetch-notion-page` | `supabase/functions/fetch-notion-page/index.ts` | Notion 頁面資料擷取 |

注意：`fetch-notion-page` 設定為 `verify_jwt = false`（不驗證 JWT）。

---

## 四、Secrets（需在新專案重新設定）

| Secret 名稱 | 說明 |
|------------|------|
| `NOTION_API_TOKEN` | Notion API 整合金鑰 |
| `SUPABASE_SERVICE_ROLE_KEY` | 自動提供，不需手動設定 |
| `SUPABASE_URL` | 自動提供 |
| `SUPABASE_ANON_KEY` | 自動提供 |

只有 `NOTION_API_TOKEN` 需要手動設定。

---

## 五、前端環境變數（需更新）

檔案：`.env`

```
VITE_SUPABASE_URL="https://你的新專案.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="你的新 anon key"
VITE_SUPABASE_PROJECT_ID="你的新 project id"
```

---

## 六、需手動處理的項目

| 項目 | 說明 |
|-----|------|
| **資料匯出** | 使用 Lovable 後端 UI 或 `pg_dump` 匯出所有表格資料 |
| **使用者帳號** | 需在新專案重新建立（密碼無法匯出） |
| **Storage 檔案** | 頭像、案件附件、圖示需手動下載再上傳 |
| **Auth 設定** | 確認 Email 驗證、登入方式等設定 |

---

## 開發者執行步驟摘要

```text
1. 在 supabase.com 建立新專案
2. 安裝 Supabase CLI → supabase login → supabase link
3. supabase db push          ← 套用全部 48 個 migration
4. supabase functions deploy ← 部署 4 個 Edge Function
5. supabase secrets set NOTION_API_TOKEN=xxx
6. 建立 3 個 Storage Bucket 並上傳檔案
7. 匯出舊專案資料 → 匯入新專案
8. 重新建立使用者帳號
9. 更新 .env 指向新專案
10. 部署前端到 Netlify/Vercel
```

