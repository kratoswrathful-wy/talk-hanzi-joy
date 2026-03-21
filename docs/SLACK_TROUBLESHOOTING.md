# Slack Edge Function 錯誤排查

點「連結 Slack」或發送 Slack 詢案時若出現 **Edge Function 相關錯誤**，請依序檢查下列項目。前端已會盡量顯示後端回傳的 `error` 文字（例如 `Slack OAuth not configured`）。

## 1. 專案一致

- Vercel 的 **`VITE_SUPABASE_URL`**（與 `VITE_SUPABASE_PUBLISHABLE_KEY`）必須與你在 **Supabase Dashboard** 操作的專案 **同一個 project ref**。
- 若在 **A 專案** 設了 Secrets、但前端連到 **B 專案**，會出現「後台都有設仍失敗」。

## 2. Edge Functions Secrets（該專案內）

**Project Settings → Edge Functions → Secrets** 至少需包含：

| 名稱 | 用途 |
|------|------|
| `SLACK_CLIENT_ID` | Slack App Client ID |
| `SLACK_CLIENT_SECRET` | `slack-oauth-callback` 交換 token |
| `SLACK_REDIRECT_URI` | 與 Slack App **Redirect URLs** 其中一條 **字元級相同** |
| `SITE_URL` | OAuth 完成後導回前端（見 [SLACK_SETUP.md](./SLACK_SETUP.md)） |

缺 `SLACK_CLIENT_ID` 或 `SLACK_REDIRECT_URI` 時，`slack-oauth-start` 會回 **500**（訊息：`Slack OAuth not configured`）。

## 3. 已部署 Functions

在連線到該 Supabase 專案的前提下執行：

```bash
supabase functions deploy slack-oauth-start slack-oauth-callback slack-disconnect slack-send-dm
```

## 4. Migration

確認已套用含 `slack_oauth_states` 等表的 migration（見 `supabase/migrations/`）。若 `slack_oauth_states` 寫入失敗，`slack-oauth-start` 可能回 **500**（`Failed to start OAuth`）。

## 5. HTTP 狀態對照（後端）

| 狀態 | 可能原因 |
|------|----------|
| 401 | **JWT 問題**：access token 過期、未帶 `Authorization`、或網關 `verify_jwt` 驗證失敗。請先 **登出再登入**；並確認瀏覽器 **Network** 裡該 POST 的 **Request Headers** 有 `Authorization: Bearer eyJ...` 與正確的 `apikey`（anon）。前端已改為呼叫前 **refreshSession** 以降低過期 token。 |
| 403 | `user_roles` 無 `pm` / `executive` |
| 500 | Slack Secret 未設、DB 寫入失敗等 |
| 405 | 非 POST（一般不會） |

## 6. 查看 Logs

**Supabase Dashboard → Edge Functions → 對應函式 → Logs**，對應點擊當下的請求可看到狀態碼與 `console.error` 輸出。

## 7. Response 為 `Invalid JWT`（網關 401），但 Headers 已正確區分 apikey 與 Bearer

若 **`apikey`** 為 `sb_publishable_...`、**`Authorization`** 為使用者 `eyJ...`，仍回 **401 `Invalid JWT`**，可能是 Supabase Edge **網關**在 `verify_jwt = true` 時與新版金鑰驗證不相容。

本專案 [`config.toml`](../supabase/config.toml) 已將 `slack-oauth-start`、`slack-send-dm`、`slack-disconnect` 設為 **`verify_jwt = false`**，改由函式內 **`supabase.auth.getUser(jwt)`** 驗證（與業務邏輯一致）。

變更後請重新部署：

```bash
npx supabase@latest functions deploy slack-oauth-start slack-oauth-callback slack-disconnect slack-send-dm
```

## 8. 一進設定頁就錯、`user_slack_meta` 為 404（PGRST205）、按「連結 Slack」變 500

代表 **遠端資料庫還沒建立 Slack 相關資料表**（例如曾略過 `db push`）。PostgREST 會回 **404**，`slack-oauth-start` 寫入 **`slack_oauth_states`** 失敗時會回 **500**（`Failed to start OAuth`）。

**請套用 migration**（擇一）：

1. **CLI（建議）** — 在專案目錄、已 `supabase login` 且已 `supabase link` 到正確專案後：
   ```bash
   npx supabase@latest db push
   ```
2. **Dashboard** — **SQL Editor**：將本機 [`supabase/migrations/20260319120000_user_slack_oauth.sql`](../supabase/migrations/20260319120000_user_slack_oauth.sql) 全文貼上執行（若表已存在會報錯，需視情況調整）。

套用後在 **Table Editor** 應可看到 **`user_slack_meta`**、**`slack_oauth_states`** 等表；再重新整理網頁與測試「連結 Slack」。
