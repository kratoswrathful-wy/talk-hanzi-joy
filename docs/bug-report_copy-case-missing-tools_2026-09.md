狀態：已落地待驗收

# 複製案件漏工具

基準：正式發布 SHA `4c151695`（#85）。本分支只修複製流程。

## 根因

`clearDuplicateFields()` 本來就要帶走 `tools`／`questionTools`，但 P0 之後 `toDb()` 不輸出這些鍵，`admin_create_case` 也禁止它們出現在 payload。`duplicate()` 建案後沒有走 `get_case_credentials`／`update_case_credentials`，新案只會拿到空預設。

這與 #85 編輯保存路徑不同；#85 已發布後仍需補這條複製管道。

## 修法

建案前先用憑證 RPC 讀來源並檢查完整性。建案仍走既有 `create`。有工具內容時再以 `update_case_credentials` 寫入新案並讀回核對。第二步失敗回報部分完成（保留新案識別），重試只寫既有新案、不刪案、不再建一筆。

重試先讀目標實際憑證：已符合原預期則只核實、不寫入；目標或來源相對待補寫指紋已變則停止覆寫。部分完成紀錄不含 secrets，綁定帳號／環境／來源與目標識別，刷新後可恢復；切帳不得沿用。

不改 DB／Edge／權限。不補正式案件資料。

## 隔離證據（非正式環境）

程式驗收 SHA：`116933d156de46f15cc98e212214c562d587c17f`  
相對正式基準 `#85` `4c151695`。未 merge `main`。未部署正式站。

- 一般 CI：https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/34164885278
- 隔離 `suite=copy-tools`：https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/34164889097  
  Playwright T1–T11＋T5 共 12 項一次通過；單元 `case-duplicate-tools.test.ts` 19 項通過。
- 既有 T1–T6 不得代替 T7–T11。本輪重試保全以 T7–T11 為準。

