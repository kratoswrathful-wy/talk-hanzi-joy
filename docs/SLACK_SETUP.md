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

### Slack 詢案對話框（規劃／擴充中）

- **預覽可編輯**：對話框內訊息可修改後再送出；**以視窗內最終文字為準**，僅影響當次發送；每次開啟重置為預設文案。
- **所有人收到同一則訊息**（不再依每人「尚未詢過的案件」各自組不同內容）。
- **曾發送過的成員**：列表中**反灰**提示曾發送過，**不鎖定**、**預設不勾選**；若要再次通知可手動勾選。

### 「詢案訊息」複製（案件頁／總表）

- 用於複製到剪貼簿後手動貼到 Slack。
- **規劃修正**：改為與 API 送出類似之 **mrkdwn `<url|標題>`** 純文字，減少貼上後連結預覽（unfurl）。詳見 [`SLACK_NOTIFY_EXPANSION_2026-05.md`](SLACK_NOTIFY_EXPANSION_2026-05.md) §3.1。

### 承接／無法承接／任務完成自動通知（譯者）

- 譯者在 **個人檔案** 同一區塊可編輯「承接」「無法承接」訊息在 **案件連結後** 的自訂文字（留空則用系統預設）；需按 **儲存變更** 寫入資料庫。
- 在 **案件頁** 完成「承接本案」或「無法承接」並成功送出後，若已連結 Slack，系統會以 **該譯者的 Slack 身分** 私訊派案端。
- **收件人條件（派案端）**：角色為 **PM 或 Executive**，且已在 **個人檔案連結 Slack**（`user_slack_meta` 必須有 OAuth 寫入的 **`slack_user_id`**），並開啟 **接收「承接／無法承接」自動 Slack 私訊**。**私訊目的地優先使用**該成員已登錄的 Slack user id（即連結 Slack 時授權帳號在該工作區的成員 id）；若 open/post 失敗，備援為 **`users.info(slack_user_id)` 取得 Slack 主信箱 → `users.lookupByEmail`**，且僅當解析出的成員 id **與** `slack_user_id` **一致** 時才重試，**不會**用 TMS `profiles.email` 備援（避免同工作區多帳號時誤送）。API 回應可含 `slack_user_id_used`、`used_slack_email_fallback`。若未連結 Slack 或 DB 無 `slack_user_id`，該收件人不會列入通知。
- **無法承接** 時：Slack 訊息為多行敘述——第 1 行為 **案件連結**（顯示為標題）＋連結後自訂文字；若案件頁表單有填 **建議期限**，第 2 行為「格式化後的期限」＋第 2 行自訂後綴（預設句可改）；若有填 **可承接字數**，第 3 行為「`{字數} 字`」＋第 3 行自訂後綴；若有填 **補充說明**，再以單獨一行送出（對應個人檔預覽第 4 行佔位）。個人檔「即時預覽」以 `<案件標題>`、`<所輸入的建議期限>` 等佔位說明結構。
- **承接本案**（單一案件）：預設為「`<案件連結|標題>` + 這件我可以做，已經承接！」（個人檔可自訂承接後綴）。
- **多人協作承接**：每勾選一列「確認承接」送一則；有分段名時為「…中的分段（分段名）我可以做，已經承接！」；**全部勾完推進狀態時不再額外送一則**。
- **任務完成**（單一案件）：「`<案件連結|標題> 完成囉！`」。
- **多人協作任務完成**：每勾一列送一則分段版「完成囉！」；最後一列勾完不額外送。

### 內部註記：發送註記提醒（規劃中）

- **入口**：內部註記詳情頁（取代舊「產生連結訊息」複製按鈕）。
- **權限**：所有人含譯者皆可使用（需已連結 Slack 才能成功送出）。
- **預設訊息**（兩行，含案件與註記之 mrkdwn 連結）：  
  `我為 <案件url|案件標題> 新增了註記 <註記url|註記標題>`  
  `請來看一下喔！`
- **收件人**：與 Slack 詢案相同之成員清單；**置頂並預設勾選**該案之審稿與譯者欄所有人（含多人協作各列譯者）。
- **發送紀錄**：規劃寫入 `internal_notes.consultation_slack_records`（見 [`SLACK_NOTIFY_EXPANSION_2026-05.md`](SLACK_NOTIFY_EXPANSION_2026-05.md)）。

## 4. 訊息格式

對話框「預覽」會以案件標題呈現（避免在 UI 直接顯示裸 URL）。實際發到 Slack 時會改為 **mrkdwn**（**案件標題**為連結文字 `<url|標題>`，不顯示長網址），並在 `chat.postMessage` 關閉 **連結預覽**（unfurl），避免訊息下方出現大型站點卡片。

**承接／無法承接／任務完成自動通知**（案件頁送出後）：同樣使用 **mrkdwn** 與上述連結格式；無法承接的第 2～4 行為純文字行（非條列符號）。擴充行為摘要見 [`SLACK_NOTIFY_EXPANSION_2026-05.md`](SLACK_NOTIFY_EXPANSION_2026-05.md) §2。

## 5. 疑難排解

若出現 **Edge Function** 錯誤，請見 **[SLACK_TROUBLESHOOTING.md](./SLACK_TROUBLESHOOTING.md)**（專案一致、Secrets、部署、Logs）。
