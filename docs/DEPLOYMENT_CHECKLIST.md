# 本機部署與驗收清單（自 case-files／Supabase 起）

本文件為可執行步驟摘要；細節與除錯見 [HANDOFF.md](./HANDOFF.md)、[SLACK_SETUP.md](./SLACK_SETUP.md)。

---

## 零、前置（每次開發／發版前）

| 步驟 | 指令／動作 | 驗收 |
|------|------------|------|
| 依賴 | `npm install --legacy-peer-deps`（若出現 `@blocknote/shadcn` 與 `tailwindcss` peer 衝突） | 無 `ERESOLVE`、可重複執行 |
| 環境變數 | 複製 [`.env.example`](../.env.example) 為 `.env`，填入 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` | `npm run dev` 可登入 |
| 建置 | `npm run build` | 成功產生 `dist/`，無編譯錯誤 |
| CLI | `npx supabase --version` | 有版本號 |

---

## 一、case-files Storage（RLS／單檔上限）

**功能**：案件詳情／表單 [FileField](../src/components/FileField.tsx) 上傳至 **`case-files`** bucket（路徑見 [`storage-case-files`](../src/lib/storage-case-files.ts)）。

**相關 migration（依序）**：

| 檔案 | 用途 |
|------|------|
| `20260308175251_4de0b1bf-9044-4c50-bc8f-8219d80dcb7a.sql` | 建立 `case-files` bucket／初始設定 |
| `20260321120000_case_files_storage_update_policy.sql` | **UPDATE** 政策（`upsert` 需要） |
| `20260322140000_repair_case_files_storage_rls.sql` | 修復／整併 RLS（解 `new row violates row-level security policy`） |
| `20260323120000_case_files_bucket_file_size_limit.sql` | 選用：bucket 單檔上限（50 MiB） |

**本機對遠端套用**：

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

可先檢視：`npx supabase db push --dry-run`

**驗收**：

- CLI 顯示 migration 套用成功。
- 案件頁檔案欄位上傳小檔（&lt; 1MB）成功；toast／Console **無** RLS 字樣。
- 若錯誤含 **size**／**413**：見 [HANDOFF「如何分辨 RLS 與檔案太大」](./HANDOFF.md#如何分辨權限-rls與檔案太大)。

---

## 二、`db push` 失敗：遠端已有資料表但 migration 歷史不一致

若出現例如 `relation "invoices" already exists` 且中斷，代表**遠端 schema 已存在（可能早期手動建過或從別處匯入），但 `supabase_migrations.schema_migrations` 裡沒有對應紀錄**，CLI 仍會按 migration 檔「從頭建立」而衝突。

### 做法 A：先只修 case-files（上傳 RLS，最常用）

目標：**不動** public 資料表，只修 `storage.buckets` + `storage.objects` 上 `case-files` 的政策，解 **`new row violates row-level security policy`**。

1. 登入 [Supabase Dashboard](https://supabase.com/dashboard) → 你的專案 → **SQL Editor** → **New query**。
2. 開啟本機 repo 檔案 [`supabase/migrations/20260322140000_repair_case_files_storage_rls.sql`](../supabase/migrations/20260322140000_repair_case_files_storage_rls.sql)，**整份複製**貼到 SQL Editor（此檔註解為 **Idempotent**，可重複執行）。
3. 按 **Run**。應成功；若僅有 `NOTICE` 可忽略。
4. （選用）若需調大單檔上限，再執行 [`20260323120000_case_files_bucket_file_size_limit.sql`](../supabase/migrations/20260323120000_case_files_bucket_file_size_limit.sql) 全文（50 MiB）。若錯誤是 **RLS** 字樣，請**先**修政策，不要只調容量。
5. **驗收**：案件頁上傳小檔成功、無 RLS。

> 說明：`20260321120000_case_files_storage_update_policy.sql` 只補 UPDATE；`repair` 檔已包含 INSERT／SELECT／DELETE／UPDATE，**多數情況只跑 repair 即可**。

---

### 做法 B：讓遠端 migration 歷史與本機一致，之後可正常 `db push`

適用：希望**長期**用 CLI 同步，且願意「告訴 Supabase」哪些版本其實已經在遠端生效過。

1. **查本機與遠端差異**（在專案根目錄、已 `link`）：
   ```bash
   npx supabase migration list
   ```
   左欄為本機 migration，右欄為遠端；標記為 **未套用** 的，若你**確定**遠端 schema 與該 migration 效果等價（例如表已存在、手動建過），可進入下一步。
2. **把「已存在於遠端」的版本標記為已套用**（勿對尚未實際執行的 migration 乱用）：
   ```bash
   npx supabase migration repair <版本號> --status applied
   ```
   `<版本號>` 為檔名前綴，例如 `20260306042635`（**不含** `.sql` 與後綴 UUID）。可對多個版本逐一 `repair`。
   - 若 CLI 參數與版本不同，請執行：`npx supabase migration repair --help` 以你本機 CLI 為準。
3. **再執行**：
   ```bash
   npx supabase db push
   ```
4. 若仍有錯誤，代表**還有** migration 與遠端真實狀態不一致，需逐筆檢查 SQL 或改用手動 SQL／請 DBA 對齊。

> 風險：`repair --status applied` 會**跳過**該 migration 的執行；若遠端實際上沒有對應物件，之後會缺表／缺欄位。**僅在確認遠端已有同等 schema 時使用**。

---

### 做法 C：全新空專案

新專案、空資料庫：在 `link` 後通常一次 `npx supabase db push` 即可，無需 repair。

---

## 三、profiles／Slack 相關 DB

**功能**：個人檔案 Slack、承接通知、`profiles.slack_message_defaults` 等。

| 檔案 | 用途 |
|------|------|
| `20260319120000_user_slack_oauth.sql` | Slack OAuth 相關 DB 物件 |
| `20260322120000_profile_receive_case_reply_slack.sql` | `receive_translator_case_reply_slack_dms` |
| `20260324120000_profiles_slack_message_defaults.sql` | `slack_message_defaults` |

與第一節同一個 `db push` 套用（若歷史正常）。

**驗收**：個人檔案可儲存、無缺欄位錯誤。

---

## 四、Edge Functions（Slack）

**功能**：連結 Slack、詢案、`slack-send-dm`（含承接／無法承接通知）。

**Secrets**（在 Dashboard → Edge Functions → Secrets，**勿**寫進 Vite `.env` 上傳前端）：

- `SLACK_CLIENT_ID`、`SLACK_CLIENT_SECRET`、`SLACK_REDIRECT_URI`、`SITE_URL`  
  見 [SLACK_SETUP.md](./SLACK_SETUP.md)。若已設定完成，僅需確認下方 **functions deploy** 已執行過。

**本機部署**：

```bash
npx supabase functions deploy slack-oauth-start slack-oauth-callback slack-disconnect slack-send-dm
```

**驗收**：個人檔案可完成「連結 Slack」；具權限帳號可發「Slack 詢案」。

---

## 五、純本機 Docker（`supabase start`）

若後端跑在本機：Docker 就緒後 `supabase start`，`.env` 改為 CLI 輸出之 URL／anon key，再 `supabase db reset` 或 `db push`。驗收項目與上相同。

---

## 六、建議一口氣驗收（正式站）

1. `db push` 成功（或已手動補齊同等 schema／Storage 政策）。
2. 案件頁 **case-files** 上傳成功、無 RLS。
3. **member** 與 **PM** 各登入一次：首頁／費用／案件列表可開。
4. 若啟用 Slack：`functions deploy` + Secrets 後，OAuth 與詢案可用。

---

## 與 CODEMAP 的關係

模組對照見 [CODEMAP.md](./CODEMAP.md)；Storage 路徑邏輯見 [`src/lib/storage-case-files.ts`](../src/lib/storage-case-files.ts)。
