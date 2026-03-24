# 案件「流程按鈕」一覽

**流程按鈕**：指會**改變案件狀態**或**進入承接／無法承接流程**的頂部工具列按鈕（案件個別頁第一排；不含「返回列表」「詢案訊息／Slack／複製」等固定動作，該類見文末補充）。

**角色**

| 稱呼 | 程式 |
|------|------|
| **譯者** | `user_roles.role === "member"` |
| **PM／執行長** | `role === "pm"` 或 `"executive"`（以下合稱 **PM+**） |

**譯者是否為本案譯者**：`profile.display_name` 出現在 `translator[]`，或（多人協作時）出現在任一模列之 `collabRows[].translator`（`isCurrentUserTranslator`）。

---

## 一、案件個別頁：第一排由左到右的渲染順序

實作上同一列為 `flex` **由左到右**依序為：

1. **新增案件**（僅 PM+，[`CreateWithTemplateButton`](src/components/CreateWithTemplateButton.tsx)）
2. **無法承接**（僅譯者，且狀態為草稿或詢案中）
3. **左側灰底按鈕**（最多一顆，見下表「灰」欄）
4. **右側主色按鈕**（最多一顆，見下表「主」欄）

同一時間「灰」與「主」各最多顯示一顆，依**案件狀態**與**角色**分支（見下表）。

---

## 二、依案件狀態：PM+ 與譯者分別看到什麼

欄位說明：**灰** = 左側灰底流程按鈕；**主** = 右側主色流程按鈕；**—** = 該角色在此狀態沒有對應流程按鈕（仍可能有「新增」僅 PM+）。

| 狀態 | PM+：灰 → 主（左→右） | 譯者：灰 → 主 |
|------|------------------------|----------------|
| **草稿** `draft` | **刪除** → **公布** | **無法承接** → — |
| **詢案中** `inquiry` | **收回為草稿** → **確定指派** | **無法承接** → **承接本案**（見多人／洽詢特例） |
| **已派出** `dispatched` | **取消指派** → **任務完成**（見多人特例） | — → **任務完成**（須為本案譯者；見多人特例） |
| **任務完成** `task_completed` | **退回修正** → **交件完畢** | — → — |
| **已交件** `delivered` | **退回修正** → **處理回饋** | — → — |
| **處理回饋** `feedback` | **退回修正** → **處理完畢**（譯者或 PM+ 皆可按，條件見下） | — → **處理完畢**（須為本案譯者或 PM+） |
| **回饋處理完畢** `feedback_completed` | **退回處理** → **交件完畢** | — → — |

### 補充說明

- **公布**：PM+ 於草稿時；若與他案標題重複會阻擋並 toast（[`assertUniqueCaseTitle`](src/pages/CaseDetailPage.tsx)）。
- **確定指派**：PM+ 於詢案中；**譯者欄為空**時按鈕 **disabled**，hover 顯示「譯者欄不得空白」。
- **任務完成**（已派出）：**譯者**需為 `isCurrentUserTranslator`；**PM+** 亦可按（程式為 `isCurrentUserTranslator || isPmOrAbove`）。
- **處理完畢**（處理回饋）：**譯者**或 **PM+** 皆可（同上邏輯）。
- **交件完畢**（任務完成／回饋處理完畢）：**僅 PM+**。
- **處理回饋**（已交件 → 進入回饋）：**僅 PM+**。
- **退回修正**：按狀態將案件打回 **已派出**；若為 **多人協作**，會將各列 `taskCompleted`、`delivered` 勾選清除（見 [`handleRevertToDispatched`](src/pages/CaseDetailPage.tsx)）。
- **退回處理**：僅在 **回饋處理完畢** 時出現，將狀態打回 **處理回饋**。

### 按鈕名稱對照（您提到的用語）

| 您使用的名稱 | 系統預設標籤（可於設定覆寫） |
|--------------|------------------------------|
| 公佈 | **公布** |
| 退回修改 | **退回修正**（`cases_detail_revert_revision`） |

---

## 三、多人協作（`multiCollab === true`）特例

| 流程按鈕 | 行為 |
|----------|------|
| **承接本案** | 按鈕 **disabled** + 灰化；Tooltip：**「請於表格內可承接的橫列勾選「確認承接」」** |
| **任務完成** | 按鈕 **disabled** + 灰化；Tooltip：**「請直接勾選「任務完成」」** |

（單人案件無上述鎖定，可直接點擊。）

### 詢案中：已有其他譯者名單但不含自己

**承接本案** **disabled** + Tooltip：**「本案可能正洽詢其他譯者，如欲承接請洽派案人員」**（`hasOtherTranslator`）。

---

## 四、流程按鈕清單（含補齊）

以下為案件個別頁已註冊之流程相關 `uiButtonId`（設定內可改樣式／標籤）：

| 預設標籤 | `uiButtonId` | 備註 |
|----------|--------------|------|
| 無法承接 | `cases_detail_decline` | 譯者／草稿或詢案中 |
| 收回為草稿 | `cases_detail_revert_to_draft` | PM+／詢案中 |
| 取消指派 | `cases_detail_cancel_dispatch` | PM+／已派出 |
| 退回修正 | `cases_detail_revert_revision` | PM+／已交件、處理回饋、任務完成 |
| 退回處理 | `cases_detail_revert_to_feedback` | PM+／回饋處理完畢 |
| 刪除 | `cases_detail_delete_draft` | PM+／草稿（刪除整案） |
| 公布 | `cases_detail_publish` | PM+／草稿 |
| 承接本案 | `cases_detail_accept_case` | 譯者／詢案中 |
| 確定指派 | `cases_detail_finalize_assign` | PM+／詢案中 |
| 任務完成 | `cases_detail_task_complete` | 已派出 |
| 處理完畢 | `cases_detail_feedback_done` | 處理回饋 |
| 處理回饋 | `cases_detail_feedback_open` | PM+／已交件 |
| 交件完畢 | `cases_mark_delivered` | PM+／任務完成或回饋處理完畢（與案件總表共用） |

**未列入「流程按鈕」但同列相鄰**：**新增案件**（`cases_add`）、頁面下方區塊之 **詢案訊息**、**Slack 詢案**、**複製本頁**（不改狀態之工具）。

---

## 五、案件總表（`CasesPage`）— 與流程相關的按鈕

僅 **PM+**（`isAdmin`）可見整排管理按鈕。

| 按鈕 | 顯示／啟用邏輯 |
|------|----------------|
| 新增案件 | 永遠顯示 |
| **交件完畢** | **與個別頁一致**：僅當**已選取的每一筆**皆為 `task_completed` 或 `feedback_completed` 時**顯示**；否則不顯示 |
| 詢案訊息／Slack／產生費用單 | 永遠顯示；未選列時 **disabled** |
| 複製本頁 | 永遠顯示；**僅選一筆**時可點 |
| 刪除（垃圾桶） | 置右；未選列時 **disabled** |

---

## 六、建議閱讀方式

- **查「某狀態下誰能按什麼」**：以 **第二節表格** 為主。
- **查多人協作與 Tooltip**：**第三節**。
- **查總表與個別頁差異**：**第五節** vs **第二節**。

實作來源：[`CaseDetailPage.tsx`](src/pages/CaseDetailPage.tsx)（約 1406–1628 行）、[`CasesPage.tsx`](src/pages/CasesPage.tsx) 工具列。
