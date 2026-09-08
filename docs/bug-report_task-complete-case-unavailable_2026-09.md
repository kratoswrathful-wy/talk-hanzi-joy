狀態：實作中（本機／隔離測試；未授權正式 migration／部署）

# Bug：單檔「任務完成」回 case_unavailable

正式基準仍為 `39002a1bc9f77fb0436ad1dce2a7f010654e9fc8`（`dpl_9nNqVH6Y6KzEqfoHkySY6iYFGN89`）。本項在獨立 worktree／分支修正，不從舊 #84 分支直接發布。

## 本輪主案例：大世界 260908B

使用者已明確指定本輪主測案例為「大世界 260908B」。**不再要求回到 Pinnacle**；Pinnacle 不是本項驗收條件。Riot - LoL 260904C 僅作不同原因的對照案例。

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

## 新增案件：原始「點了沒反應」

正式發布碼 `39002a1b`（不是本機後續 checkpoint）的列表入口是：

```ts
const newCase = await caseStore.create({ title: "新案件", ...templateValues });
if (newCase) navigate(`/cases/${newCase.id}`, { state: { autoFocusTitle: true } });
```

`create()` 在 #89 已改成包 `createWithOutcome`，但**對外契約仍是**：只有 `kind === "created"` 才回傳紀錄，其餘一律 `null`。列表／詳情新增入口吃這個 `null` 後**沒有 toast、沒有識別、沒有導航**。

因此可重現的吞錯層是 **UI 處理 `create() === null`**，不是「按鈕沒綁事件」本身：

| 實際後端結果 | 當時畫面 | 分類 |
|---|---|---|
| 未送出（角色載入失敗導致按鈕未渲染） | 完全沒反應 | 第 3 項候選，本項未證實為主因 |
| `admin_create_case` 被拒 | `create()`→null，無提示 | 2. 後端拒絕被吞 |
| RPC 成功但 `cases_visible` 讀回失敗／逾時 | `create()`→null，無提示；案件可能已存在 | 3. 已建立但讀回／導航失敗 |
| 連線中斷／回應遺失 | `create()`→null，無提示 | 4. 結果未知被當成沒發生 |

`cases_visible` 整表 57014 只能列為**放大讀回失敗的候選**，除非同一操作證明讀回路徑就是該次 GET。本輪不把它當成按鈕失效的既定根因。

修法：列表／詳情改呼 `createWithOutcome`，四種結果都有提示；已建立／不明結果保留同一 UUID 且防連點。這修的是吞錯與重複建案，不宣稱已解決列表逾時。

## 資料補正（獨立；本輪不執行）

- 大世界 260908B **現有**有效譯者 participant，不需為完成本人路徑而補身分。
- Riot 260904C 若缺譯者 UUID，不能自動補 participant。
- 管理代完成不能替代缺失的譯者授權補正。

## 禁止

- 未核准：正式資料寫入、`db push`、merge、部署、重啟 Gate2、付費資源、拿真實案測試。
