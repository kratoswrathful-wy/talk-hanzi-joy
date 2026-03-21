# Slack 詢案私訊 — 設定說明

## 1. Slack App（api.slack.com/apps）

1. **Create New App** → From scratch → 選擇工作區。
2. 左側 **OAuth & Permissions**：
   - **User Token Scopes**（不要只加 Bot）新增：
     - `chat:write` — 發訊息
     - `im:write` — 開啟私訊
     - `users:read`
     - `users:read.email` — 用 email 找成員（對應系統譯者信箱）
3. **Redirect URLs** 新增（需與下方環境變數 **完全一致**）：
   - 正式：`https://<project-ref>.supabase.co/functions/v1/slack-oauth-callback`
   - 本機 Edge：`http://127.0.0.1:54321/functions/v1/slack-oauth-callback`（若用 `supabase functions serve`）
4. 記下 **Client ID**、**Client Secret**（Signing Secret 此流程可不填）。

## 2. Supabase Secrets（專案 → Edge Functions → Secrets）

在 Dashboard 或使用 CLI 設定：

| 名稱 | 說明 |
|------|------|
| `SLACK_CLIENT_ID` | Slack App 的 Client ID |
| `SLACK_CLIENT_SECRET` | Slack App 的 Client Secret |
| `SLACK_REDIRECT_URI` | 與 Slack Redirect URLs 中某一條 **字元級相同**（例如 `https://xxx.supabase.co/functions/v1/slack-oauth-callback`） |
| `SITE_URL` | 前端網址，OAuth 完成後導向 `SITE_URL/settings?slack=connected`（例如 `https://your-app.vercel.app`，**不要**結尾斜線或依你習慣與程式一致） |

部署 Edge Functions：

```bash
supabase functions deploy slack-oauth-start slack-oauth-callback slack-disconnect slack-send-dm
```

並套用 migration：

```bash
supabase db push
```

## 3. 使用者流程

1. **PM / Executive** 登入 → **設定** → **連結 Slack** → 授權。
2. **案件管理** 勾選一筆或多筆案件 → **Slack 詢案**；或進入 **案件頁** → **Slack 詢案**。
3. 勾選譯者（需個人檔案有 **與 Slack 相同工作區帳號的 email**），送出後以 **該 PM 的 Slack 身分** 發私訊。

## 4. 訊息格式

與案件頁「產生詢案訊息」相同；多筆案件時第一行為「請問這幾件可以做嗎？」，下方每行一筆 `標題（案件連結）`。
