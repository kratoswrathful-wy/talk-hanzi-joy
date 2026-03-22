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
| `SITE_URL` | 前端網址，OAuth 完成後導向 `SITE_URL/profile?slack=connected`（例如 `https://your-app.vercel.app`，**不要**結尾斜線或依你習慣與程式一致） |

部署 Edge Functions：

```bash
supabase functions deploy slack-oauth-start slack-oauth-callback slack-disconnect slack-send-dm
```

並套用 migration：

```bash
supabase db push
```

## 3. 使用者流程

1. 登入 → **個人檔案** → **連結 Slack** → 授權（PM／Executive 另可在同頁查看「Slack 詢案」說明）。
2. **案件管理** 勾選一筆或多筆案件 → **Slack 詢案**；或進入 **案件頁** → **Slack 詢案**。
3. 勾選團隊成員（需個人檔案有 **與 Slack 相同工作區帳號的 email**），送出後以 **該 PM 的 Slack 身分** 發私訊。

### 承接／無法承接自動通知（譯者）

- 譯者在 **個人檔案** 同一區塊可編輯「承接」「無法承接」訊息在 **案件連結後** 的自訂文字（留空則用系統預設）；需按 **儲存變更** 寫入資料庫。
- 在 **案件頁** 完成「承接本案」或「無法承接」並成功送出後，若已連結 Slack，系統會以 **該譯者的 Slack 身分** 私訊派案端（PM／執行長）；派案端是否收到另受 **個人檔案 → 接收「承接／無法承接」自動 Slack 私訊** 開關與信箱是否對應 Slack 成員影響。
- **無法承接** 時若在表單填寫期限、字數、補充說明，會一併附在 Slack 訊息後段。

## 4. 訊息格式

對話框「預覽」與案件頁「產生詢案訊息」相同（純文字含完整 URL）。實際發到 Slack 時會改為 **mrkdwn**（**案件標題**為連結文字 `<url|標題>`，不顯示長網址），並在 `chat.postMessage` 關閉 **連結預覽**（unfurl），避免訊息下方出現大型站點卡片。

## 5. 疑難排解

若出現 **Edge Function** 錯誤，請見 **[SLACK_TROUBLESHOOTING.md](./SLACK_TROUBLESHOOTING.md)**（專案一致、Secrets、部署、Logs）。
