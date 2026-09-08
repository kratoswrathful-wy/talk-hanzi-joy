狀態：實作中（本機／隔離測試；未授權正式 migration／部署）

# Bug：單檔「任務完成」回 case_unavailable

正式基準仍為 `39002a1bc9f77fb0436ad1dce2a7f010654e9fc8`（`dpl_9nNqVH6Y6KzEqfoHkySY6iYFGN89`）。本項在獨立 worktree／分支修正，不從舊 #84 分支直接發布。

## 本輪主案例：大世界 260908B

只讀核對時間：2026-09-08（正式資料，未寫入）。

| 項 | 值 |
|---|---|
| 識別 | `ae72da0f-1e4c-43d0-9e76-107884b6a509` |
| 狀態 | `dispatched`（單檔，`multi_collab=false`） |
| revision | 19 |
| 顯示譯者 | `Ko-Hung Kuan`（不得當授權來源） |
| 建立者 | 威儀 `9f96ef05-18c9-4442-929d-42fd6ad47990`（`executive`） |

`case_participants`（translator）：

| 帳號 | UUID | 角色 | work_status | access_revoked_at |
|---|---|---|---|---|
| 威儀 | `9f96ef05-…451e` 對應 profile `9f96ef05-18c9-4442-929d-42fd6ad47990` | executive | active | **已撤銷** 00:01:45 |
| 朱耘廷 | `d7c9a493-b930-4c69-a892-fe01808d880c` | member | active | **已撤銷** 00:02:03 |
| Ko-Hung Kuan | `8229dd82-1af8-457e-90ad-f46c16d32369` | member | active | **null（目前唯一有效譯者）** |

正式前端「任務完成」兩入口都呼叫 `complete_case_translation`。此 RPC 要求：**已派出、非協作、呼叫者本人是 active＋未撤銷 translator participant**。不符合即 `P0002 case_unavailable`。沒有管理代完成 RPC。

因此：

- **執行官／PM（威儀）**：按鈕看得到（`isPmOrAbove`），但 JWT 已不是有效譯者 → `case_unavailable`。這是產品缺口，不是「案件不存在」。
- **已撤銷譯者（朱耘廷）**：同錯誤碼；授權已失效，不得用顯示名或舊指派恢復。
- **現任譯者（Ko-Hung Kuan）**：後端條件符合，應可走譯者本人 RPC。本輪未對正式案試寫，**未驗證**他是否實際按過、畫面 revision 是否過期。

audit 補充（不得詮釋成已修好）：

- 00:01:37 威儀曾以**當時有效的自己**成功 `complete_case_translation`（rev 4→5）。
- 之後多次 `pm_update_case_assignments` 改派／再派出，目前有效譯者已換成 Ko-Hung。
- 之後的失敗與「曾成功完成」不互相否定：改派後執行官再按，正式碼仍走譯者 RPC。

## 另一案例（保留，不混因）：Riot - LoL 260904C

- 識別 `fa6f56dc-05f8-42eb-8123-66a0eeac7094`，`delivered`。
- 2026-09-07 重核：顯示有譯者，但 `case_participants` 當時僅 active reviewer。
- 原確認檔無譯者 UUID；缺 participant 不得用姓名補身分。
- 相同錯誤碼 **不代表** 與大世界 260908B 同一根因。

## 本分支修正（`fix/case-buttons-20260908`，承接 #84，基準含 #85／#89）

| 項 | 內容 |
|---|---|
| A 譯者完成 | UI 以 active translator participant UUID 判斷；不再用同名授權 |
| B 管理代完成 | `pm_complete_case_translation`；audit actor＝管理者；同步既有 translator → `completed`；不插假 participant |
| 派出閘門 | 單檔轉 `dispatched` 須已有 active translator participant（隔離 SQL；正式庫未套用） |
| 新增案件 | `createWithOutcome`：列表與詳情皆保留同一 UUID；拒絕／讀不回／不明結果分開提示，不引導連點再建 |
| 前端 | 詳情／列表分流 RPC；管理者代完成不發譯者 Slack |

## 新增案件（同工項 B）

正式站「點了沒反應」不得預設成 `cases_visible` 57014。已區分：沒送出、後端拒絕、已建立但讀不回、結果不明。畫面必須說清楚；已建立不得報成「確定沒建立」。

## 資料補正（獨立；本輪不執行）

- 大世界 260908B **現有**有效譯者 participant，不需為完成本人路徑而補身分。
- Riot 260904C 若缺譯者 UUID，不能自動補 participant。
- 管理代完成不能替代缺失的譯者授權補正。

## 禁止

- 未核准：正式資料寫入、`db push`、merge、部署、重啟 Gate2、付費資源、拿真實案測試。
