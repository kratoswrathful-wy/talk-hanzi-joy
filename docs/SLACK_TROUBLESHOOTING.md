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
| 401 | 未帶 JWT、JWT 無效、或網關 `verify_jwt` 驗證失敗 |
| 403 | `user_roles` 無 `pm` / `executive` |
| 500 | Slack Secret 未設、DB 寫入失敗等 |
| 405 | 非 POST（一般不會） |

## 6. 查看 Logs

**Supabase Dashboard → Edge Functions → 對應函式 → Logs**，對應點擊當下的請求可看到狀態碼與 `console.error` 輸出。
