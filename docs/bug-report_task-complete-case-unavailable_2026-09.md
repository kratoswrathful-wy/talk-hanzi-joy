狀態：實作中（本機／隔離測試；未授權正式 migration／部署）

# Bug：單檔「任務完成」回 case_unavailable（Riot 260904C）

## 證據摘要（2026-09-07 重核）

- 正式案 `fa6f56dc-05f8-42eb-8123-66a0eeac7094`：`dispatched`、非 collab、顯示有譯者、`case_participants` 僅 active reviewer。
- 原確認檔（SHA-256 `A3670C224D1B5E09…F174AD`）此案**僅 reviewer**；同目錄 `assignment-source.json`／`live-positions-20260905T1038.json` 為 `inquiry`、僅 reviewer。
- 因此：不是「使用者故意漏確認譯者」；原匯出**不能**提供譯者 UUID。
- `inquiry` → 正式 `dispatched`＋顯示譯者：mutation audit 僅見 Gate2 改 reviewer；中間變更路徑**證據不足 → 未知**（可能為「確定指派」只改 status、舊入口寫顯示名等，不自行補故事）。
- Gate2「34/34」只核 job 已列位置，不核案件實際指派完整性。

## 本分支修正（`fix/task-complete-admin-rpc`，基準 `bbfa5cb3`）

| 項 | 內容 |
|---|---|
| A 譯者完成 | UI 以 active translator participant UUID 判斷；不再用同名授權 |
| B 管理代完成 | `pm_complete_case_translation`；audit actor＝管理者；可選同步既有 translator → `completed`；不插假 participant；維護 wrapper |
| 派出閘門 | trigger：單檔轉 `dispatched` 須已有 active translator participant |
| 清單完整性 | `assignment-position-completeness`：由實際指派推預期位置再比確認 |
| 前端 | 詳情／列表分流 RPC；管理者代完成不發譯者 Slack |

## 資料補正（獨立；本輪不執行）

- 原確認檔無譯者 UUID → 不能自動補 participant。
- 若要恢復譯者授權：需庫外可信派案紀錄，或**僅對此一人**向使用者確認可信 UUID 後走 `pm_update_case_assignments`。
- 管理代完成**不能**替代資料修復。

## 禁止

- 未核准：正式資料寫入、`db push`、merge、部署、重啟 Gate2、付費資源、拿真實案測試。
