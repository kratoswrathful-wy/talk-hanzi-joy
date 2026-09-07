狀態：已落地待驗收

# 複製案件漏工具

基準：正式發布 SHA `4c151695`（#85）。本分支只修複製流程。

## 根因

`clearDuplicateFields()` 本來就要帶走 `tools`／`questionTools`，但 P0 之後 `toDb()` 不輸出這些鍵，`admin_create_case` 也禁止它們出現在 payload。`duplicate()` 建案後沒有走 `get_case_credentials`／`update_case_credentials`，新案只會拿到空預設。

這與 #85 編輯保存路徑不同；#85 已發布後仍需補這條複製管道。

## 修法

建案前先用憑證 RPC 讀來源並檢查完整性。建案仍走既有 `create`。有工具內容時再以 `update_case_credentials` 寫入新案並讀回核對。第二步失敗回報部分完成（保留新案識別），重試只寫既有新案、不刪案、不再建一筆。

不改 DB／Edge／權限。不補正式案件資料。

