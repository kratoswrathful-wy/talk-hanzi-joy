狀態：已落地待驗收

# 複製案件漏工具

基準：正式發布 SHA `4c151695`（#85）。本分支只修複製流程。

## 根因

`clearDuplicateFields()` 本來就要帶走 `tools`／`questionTools`，但 P0 之後 `toDb()` 不輸出這些鍵，`admin_create_case` 也禁止它們出現在 payload。`duplicate()` 建案後沒有走 `get_case_credentials`／`update_case_credentials`，新案只會拿到空預設。

這與 #85 編輯保存路徑不同；#85 已發布後仍需補這條複製管道。

## 修法

建案前先用憑證 RPC 讀來源並檢查完整性。建案仍走既有 `create`。有工具內容時再以 `update_case_credentials` 寫入新案並讀回核對。第二步失敗回報部分完成（保留新案識別），重試只寫既有新案、不刪案、不再建一筆。

重試先讀目標實際憑證：已符合原預期則只核實、不寫入；目標或來源相對待補寫指紋已變則停止覆寫。部分完成紀錄不含 secrets，綁定帳號／環境／來源與目標識別，刷新後可恢復；切帳不得沿用。

基準只認「建案當下」：`readTargetBaseline` 是在工具寫入失敗後才讀目標，等待期間可能已被別的操作改過。因此僅當目標仍停在**建案當下的版本號**且內容為**預期初始空白**時才記錄可自動補寫基準；版本已前進、讀不到或結果不明一律不留基準（保守停止）。事後讀到的最新版本不得被重新定義成「原始未修改」。

建案識別在送出前就固定：複製路徑改走 `createWithOutcome`，區分**確定未建立**（伺服器明確拒絕且查證不存在）、**已建立但讀回失敗**（RPC 成功、`cases_visible` 讀不回）、**結果未知**（連線中斷且查證無法確認）。回應或首次讀回遺失時一律以同一 UUID 查證，不換新識別再建、不刪除已建立的新案；讀不回時保留識別、不寫工具、留待直接編輯該筆。既有 `create()` 對其他建案入口的契約不變（仍是「拿到紀錄才回傳，否則 null」）。

「目標是空的」不等於可以回填：使用者也可能加了工具後刻意清空。部分完成當下另存新案基準（版本號＋內容指紋，皆無底稿值）；只有內容與版本號都還停在該基準才視為未被動過。缺基準（舊紀錄或被改壞）、版本號已前進、內容不同，一律保守停止並報衝突，不以取得最新 revision 當作可覆寫。

不改 DB／Edge／權限。不補正式案件資料。

## 隔離證據（非正式環境）

程式驗收 SHA：`4e754bba2887c8e57630084db76b48f50cc05d85`  
相對正式基準 `#85` `4c151695`。未 merge `main`。未部署正式站。

- 一般 CI（typecheck／test／lint／encoding／forbidden-casts）：https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/34169271666
- 隔離 `suite=copy-tools`：https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/34169348236  
  Playwright T1–T15＋T5 共 16 項**一次通過（零重試）**；單元 44 項通過。
- 既有 T1–T6 不得代替 T7–T15。重試保全以 T7–T13 為準；建案識別保全以 T14／T15 為準。

### 修正前失敗（同一套隔離 CI，只還原產品程式、保留新測試）

證據分支 `evidence/copy-tools-prefix-20260908`（`04e96791`，`src/` 回到 `22580161`）：https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/34169360867  
結果 **13 passed／3 failed**，失敗恰為本輪三項新測（兩次嘗試皆失敗，非時序抖動）：

| 測項 | 修正前失敗位置 | 意義 |
|---|---|---|
| T13 | `getByTestId('duplicate-tools-conflict')` 不出現 | 舊邏輯把等待期間的空白當成可回填基準，重試直接覆寫 |
| T14 | `getByTestId('duplicate-tools-readback-pending')` 不出現 | `create()` 讀回失敗回 null，`duplicate()` 報 `created:false`，新案識別遺失 |
| T15 | `page.waitForURL` 逾時（未跳新案） | 建案回應遺失即視為失敗，未以同一 UUID 查證 |

T13 修正前的寫入時間軸（自 trace `0-trace.network` 解出，`p_case_id` 前 8 碼）：

```
1–6  case=af9ddeeb rev=0..5  200  來源 seedTools
7    case=22fe9f00 rev=0     200  另一操作加入 te-other（等待期間）
8    case=22fe9f00 rev=1     200  另一操作清空
9    case=22fe9f00 rev=0     400  複製本身的工具寫入（測試注入失敗）
10   case=22fe9f00 rev=2     200  ← 修正前缺口：重試以 rev=2 覆寫回來源工具
```

修正後同情境零次寫入（T13 斷言 `retryWrites === 0`）並顯示衝突。

### T3 首次失敗的實際原因（測試驅動問題，非產品缺陷）

前一輪 run `34164889097` 的 T3 首次失敗，自 trace 取出的錯誤為
`strict mode violation: getByText('來源案件的完整工具資料無法讀取') resolved to 2 elements`
——同一句同時出現在 toast 描述（`div.text-sm.opacity-90`）與螢幕閱讀器 live region（`span[role=status][aria-live=assertive]`）。

同一份 trace 的 network 顯示：整個測試只有 **1 次** `admin_create_case`（200，發生在 `get_case_credentials` 403 之前，屬 `createDraft` 建來源草稿），`get_case_credentials` 403 恰 1 次。即產品當時**確實已中止且未建案**，與提示時序無關。

改法只動測試驅動：以「來源讀取被拒的實際回應」＋「`admin_create_case` 請求數為 0」＋「資料庫案件清單不變」作為確定訊號，提示文字改到最後才檢查並取 `.first()`；未新增任何固定等待。

