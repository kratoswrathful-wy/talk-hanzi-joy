# Slack 通知功能擴充（2026-05）

> **文件用途**：記錄 2026 年 5 月起 Slack 相關功能擴充的**決策依據**、**行為規格**與**程式對照**；與 [`SLACK_SETUP.md`](SLACK_SETUP.md)、[`CODEMAP.md`](CODEMAP.md) 互補。  
> **狀態說明**：下列條目含**已落地程式**與**規格已決、待實作**兩類；待實作完成後請更新本節與「Commit 追蹤」表。

---

## 1. 背景與目標

- **譯者操作案件**（承接、無法承接、任務完成等）時，派案端（PM／Executive）需能透過 Slack 即時得知。
- **詢案／內部註記**相關流程需與既有「Slack 詢案」體驗一致：連結不產生不必要預覽、可選收件人、可調整訊息內容。
- **內部註記**：移除僅複製連結的舊入口，改為與「Slack 詢案」同型態的「發送註記提醒」流程。

---

## 2. 已落地：譯者自動通知（承接／無法承接／任務完成）

### 2.1 Edge Function 與收件人

- 呼叫 [`supabase/functions/slack-send-dm`](../supabase/functions/slack-send-dm/index.ts)，`case_reply_notification: true`。
- **收件人**：`user_roles` 為 `pm` 或 `executive`，且已連結 Slack、`receive_translator_case_reply_slack_dms !== false`（詳見 [`SLACK_SETUP.md`](SLACK_SETUP.md)）。

### 2.2 承接（`kind: "accept"`）

| 觸發 | 訊息要點 |
|------|-----------|
| 單一案件「承接本案」 | `<案件連結|標題>` + 個人檔可自訂後綴；預設為「這件我可以做，已經承接！」（[`DEFAULT_ACCEPT_SUFFIX`](../src/lib/slack-case-reply-defaults.ts)） |
| 多人協作：勾選某列「確認承接」 | 有分段標題時：`…中的分段（分段名）我可以做，已經承接！`；分段標題空白則 fallback 為整案格式 |
| 多人協作：最後一列勾完（全部承接） | **不另送** Slack（最後一列勾選時已送過該分段） |

**程式**：[`maybeSendTranslatorCaseReplySlack`](../src/lib/slack-case-reply-notify.ts)（`buildAcceptMrkdwn`）；案件頁 [`CaseDetailPage.tsx`](../src/pages/CaseDetailPage.tsx) `handleAcceptCase`、`CollaborationTable` `onChange`；總表 [`CasesPage.tsx`](../src/pages/CasesPage.tsx) `handleFlowAcceptCase`。

### 2.3 無法承接（`kind: "decline"`）

- 維持既有表單與多行格式（期限、字數、補充說明）；見 [`slack-case-reply-notify.ts`](../src/lib/slack-case-reply-notify.ts) `buildDeclineMrkdwn`。

### 2.4 任務完成（`kind: "task_complete"`）

| 觸發 | 訊息要點 |
|------|-----------|
| 單一案件「任務完成」 | `<案件連結|標題> 完成囉！` |
| 多人協作：勾選某列「任務完成」 | `…中的分段（分段名）完成囉！` |
| 多人協作：最後一列勾完（全部完成） | **不另送**（最後一列已送） |

**程式**：[`buildTaskCompleteMrkdwn`](../src/lib/slack-case-reply-notify.ts)；`CaseDetailPage` `handleTaskComplete`、`CollaborationTable` `onChange`；`CasesPage` `handleFlowTaskComplete`。

---

## 3. 待落地：規格已決之項目

下列為對話中已確認的產品行為；實作完成後請將狀態改為「已落地」並補 commit。

### 3.1 「詢案訊息」複製至剪貼簿（避免 Slack 連結預覽）

- **問題**：[`copy-case-inquiry-message.ts`](../src/lib/copy-case-inquiry-message.ts) 目前含裸 URL 與 HTML，貼到 Slack 易觸發 unfurl。
- **方向**：改為與內部註記連結訊息類似，**純文字**使用 Slack mrkdwn `<url|標題>`，降低貼上後預覽。

### 3.2 內部註記頁

- **移除**：「產生連結訊息」按鈕及相關 handler（[`InternalNotesPage.tsx`](../src/pages/InternalNotesPage.tsx) `NoteDetailView`）。
- **新增**：「**發送註記提醒**」按鈕，行為對齊「Slack 詢案」對話框（選人、發 `slack-send-dm`），**所有人含譯者**皆可使用。
- **預設訊息**（mrkdwn，含兩個連結）：
  - 我為 `<案件url|案件標題>` 新增了註記 `<註記url|註記標題>`
  - 請來看一下喔！
- **收件人清單**：與 Slack 詢案相同（載入團隊成員）；**置頂並預設勾選**：該案件之**審稿人員**與**譯者欄**所列所有人（含多人協作各列譯者）；其餘人員可手動勾選。
- **鎖定紀錄**：新增 DB 欄位 `internal_notes.consultation_slack_records`（`jsonb`，存已通知過的 `user_id` 陣列，語意對齊 `cases.inquiry_slack_records`）。需 **migration** + 更新 [`InternalNote`](../src/hooks/use-internal-notes-table-views.ts) 與 [`internal-notes-store`](../src/stores/internal-notes-store.ts) 對照。

### 3.3 「Slack 詢案」與「發送註記提醒」對話框 UX

- **可編輯預覽**：預覽區改為文字框；**以視窗內最終文字為送出版本**；每次開啟對話框重置為系統預設文案；編輯僅影響當次發送。
- **Slack 詢案訊息策略（選項 A）**：所有勾選收件人收到**同一則**訊息；不再依每人「尚未詢過的案件」各自組不同內容。
- **已發送過的人**：**不鎖定**、**反灰**表示曾發送過；**預設不勾選**；若需重送可再勾選。

### 3.4 新元件（規劃名稱）

- `NoteReminderSlackDialog`（或同等命名）：內部註記詳情頁用；與 [`InquirySlackDialog.tsx`](../src/components/InquirySlackDialog.tsx) 共用模式時可抽共用子元件。

---

## 4. 資料庫變更（待 migration）

| 表 | 欄位 | 型別 | 說明 |
|----|------|------|------|
| `internal_notes` | `consultation_slack_records` | `jsonb`（預設 `[]`） | 已透過「發送註記提醒」成功通知過的 `user_id` 清單 |

實作後執行 `supabase db push` 並更新型別（若專案有 `src/integrations/supabase/types.ts` 自動產生流程則一併跑）。

---

## 5. Commit 追蹤

| 主題 | 說明 | Commit（短碼） |
|------|------|----------------|
| 承接／任務完成 Slack | `slack-case-reply-notify`、`CaseDetailPage`、`CasesPage`、`slack-case-reply-defaults` | `5f1491b`、`9e04ab9`（參考 main 歷史） |
| 詢案複製 unfurl | `copy-case-inquiry-message` | （待填） |
| 註記提醒 + 對話框 + migration | 見 §3 | （待填） |

---

## 6. 關聯文件

- 設定與使用者流程：[`SLACK_SETUP.md`](SLACK_SETUP.md)
- 程式路徑索引：[`CODEMAP.md`](CODEMAP.md)
- 排查：[`SLACK_TROUBLESHOOTING.md`](SLACK_TROUBLESHOOTING.md)
