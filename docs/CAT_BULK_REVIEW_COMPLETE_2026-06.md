# 批次設定審稿完成 + 審稿人員同步 — 2026-06

## 執行摘要（2026-06-19）

### 已完成

| 項目 | 數量 | 說明 |
|---|---|---|
| 審稿 stage 設為 completed | 413 個 | 僅餘 1 個因 prep 未完成而跳過（見下） |
| 翻譯 stage 設為 completed | 26 個 | 其餘在腳本執行前已是 completed |
| LMS 連結檔案審稿指派補齊 | 74 個 | 以 LMS reviewer 為準新增指派 |
| 審稿指派狀態修正為 completed | 264 個 | 直接透過 SQL 更新 |

### 執行腳本

```powershell
node scripts/bulk-set-review-completed.mjs --apply
```

（後續補跑 SQL 修正 `cat_stage_assignments.workflow_status`）

---

## 稍後處理項目

### 1. prep 未完成的檔案

以下 1 個檔案因「準備（prep）階段尚未完成」而被跳過，未設為審稿完成：

| 檔案名稱 | 檔案 ID |
|---|---|
| `Zoopedia_part4_384-425_TW_zho-TW.mqxliff` | `5a7032b2-728d-4033-bbac-a2ed44ba2bbf` |

**待辦**：確認此檔案的 prep 階段何時完成後，手動或透過腳本補設為審稿完成。

---

### 2. 「自研工具」案件尚未同步審稿指派

共有 **41 個 LMS 案件**在「工具」欄位填有「自研工具」，但 CAT 中的相關檔案尚未透過 `related_lms_case_id` 與案件建立連結，因此無法由批次腳本自動同步審稿人員。

這類案件與「1UP CAT 區塊直接連結」的案件不同，需要透過**檔名搜尋**手動對應。

**待辦方向**：
1. 對這 41 個案件逐一確認「自研工具」欄位是否有具體檔名
2. 在 CAT 中以檔名搜尋找到對應檔案，並建立 `related_lms_case_id` 連結（或直接手動指派審稿人）
3. 已知有具體檔名的案件範例：
   - **Reign of Hades 260413**：`HOW TO PLAY BOOK 280x280.docx.sdlxliff`
   - **Riot - 2XKO 260601A**：`53609_01_PRF - 2XKO - PvE Announce Trailer.docx` 等
4. 無法自動對應的案件（僅填寫專案名稱或「檔案 #1-5」）：**Atari 260424**、**7 Days To Think About It**（多個）、**Matchington Mansion 260424** 等

**注意**：這些案件的審稿人員仍以 LMS 案件上的 `reviewer` 欄位為準。

---

## 相關檔案

- 腳本：`scripts/bulk-set-review-completed.mjs`
- 顯示邏輯：`cat-tool/js/wf-display-status.js`
- 指派同步函式：`supabase/migrations/20260610140000_sync_cat_workflow_assignments.sql`
