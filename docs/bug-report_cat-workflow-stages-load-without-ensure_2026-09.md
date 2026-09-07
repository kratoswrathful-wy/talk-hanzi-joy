狀態：實作中

# CAT 工作階段載入誤報空資料（無權 ensure）

## 事故檔（唯讀）

- 檔名：TD Liveops 03.09.2026.xlsx_zho-TW.mqxliff  
- file_id：`dad11e4d-73d9-4617-be10-efb9e30812cd`  
- project_id：`03769e54-860a-4c57-bba6-4c779ef4ca29`  
- 正式：prep／translate／review 皆在（3）；translate 有 1 指派；`authenticated` 對 `ensure_cat_file_workflow_stages` **無 EXECUTE**。

## 根因

`_loadFileWorkflowContext` 先呼叫 `ensureFileWorkflowStages` → 雲端 RPC 無權失敗 → catch 成空陣列 → UI「目前沒有可調整的段落」。

## 修法

讀取改走 `getFileWorkflowStages`（表 SELECT 已授權）。團隊模式缺階段時不呼叫無權 ensure；區分 loading／error／empty。本機 Dexie 仍可 ensure。禁止恢復內層 helper 廣泛 EXECUTE。

未在正式檔試寫。
