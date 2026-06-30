# LMS AI 操作切入點（`window.__lmsAgent`）

> 2026-06 規劃與實作。讓 AI 以瀏覽器腳本直接讀寫**案件單**與**費用單**，跳過下拉選單、時間介面、核取方塊的點擊操作。

## 目的

LMS 表單使用 Radix UI 下拉、自訂 `DateTimePicker` 等元件，對 AI 視覺自動化（截圖＋點擊）成本高且易失敗。本切入點在 React store 之上提供結構化 API，AI 透過 `Runtime.evaluate` 呼叫 `window.__lmsAgent`，一行完成填單。

## 架構

```
AI 腳本 → window.__lmsAgent → 驗證層 → caseStore / feeStore → 畫面 + Supabase
                                    ↑
                          selectOptionsStore（設定頁可調的下拉選項）
```

- **程式位置**：[`src/lib/ai-agent-bridge.ts`](../src/lib/ai-agent-bridge.ts)
- **掛載**：[`src/App.tsx`](../src/App.tsx) 啟動時 `installAiAgentBridge()`，**所有環境常駐**。
- **不提供** `delete`；費用單不可定案（`finalized`）。

## API 一覽

所有方法回傳 `{ ok: true, data }` 或 `{ ok: false, error, allowed? }`。

| 方法 | 說明 |
|------|------|
| `__lmsAgent.describe()` | 欄位型別、下拉合法值來源、時間／核取欄位、守門規則、已知限制 |
| `__lmsAgent.options.get(fieldKey)` | 查某下拉欄位目前合法 label 清單 |
| `__lmsAgent.options.listKeys()` | 可查的 options 欄位 key |
| `__lmsAgent.case.list(filter?)` | 列出案件（可 `search` / `status` / `limit`） |
| `__lmsAgent.case.get(id)` | 讀單筆案件 |
| `__lmsAgent.case.create(initial?)` | 建立草稿案件（強制 `status: draft`） |
| `__lmsAgent.case.update(id, patch)` | 修改案件欄位 |
| `__lmsAgent.fee.list(filter?)` | 列出費用 |
| `__lmsAgent.fee.get(id)` | 讀單筆費用 |
| `__lmsAgent.fee.create(initial?)` | 建立草稿費用 |
| `__lmsAgent.fee.update(id, patch)` | 修改草稿費用 |

## AI 使用守則

1. **先探索再寫入**：`describe()` 或 `options.get('taskType')` 查合法值，再 `update` / `create`。
2. **時間一律 ISO 字串**：例如 `2026-06-30T14:30:00.000Z`；`null` 表示清空。
3. **不合法時讀 `allowed`**：回傳的 `allowed` 陣列即目前合法選項，修正後重送。
4. **已定案費用不可改**：`status === 'finalized'` 的費用單會被拒絕。
5. **不可定案**：不可把 fee `status` 設為 `finalized`。

## 草稿守門規則

### 費用單

- 僅允許 `status: 'draft'`。
- 已 `finalized` 的單據：`update` 一律拒絕。

### 案件單

- 允許 workflow 狀態：`draft`、`inquiry`、`dispatched`。
- 阻擋：`task_completed`、`delivered`、`feedback`、`feedback_completed`（敏感／交件後狀態）。

## 欄位對照

### 案件單（`case.update` / `case.create` 頂層 patch）

| 欄位 | 型別 | 合法值來源 |
|------|------|------------|
| `title` | 文字 | — |
| `status` | 狀態 | 僅 `draft` / `inquiry` / `dispatched` |
| `client` | 下拉 | `selectOptionsStore` → `client` |
| `contact` | 下拉 | `contact` |
| `dispatchRoute` | 下拉 | `dispatchRoute` |
| `category` | 下拉 | `caseCategory` |
| `executionTool` | 下拉 | `executionTool` |
| `billingUnit` | 下拉 | `billingUnit` |
| `translator` | 字串陣列 | `assignee`（譯者／成員） |
| `reviewer` | 下拉 | `assignee` |
| `translationDeadline` | ISO 時間 | — |
| `reviewDeadline` | ISO 時間 | — |
| `multiCollab` | 核取 | 布林 |
| `internalNoteForm` | 核取 | 布林 |
| `clientQuestionForm` | 核取 | 布林 |
| `catToolEnabled` | 核取 | 布林 |
| `workGroups` | 陣列 | 每列：`workType`→`taskType`、`billingUnit`、`unitCount` |
| `collabRows` | 陣列 | 每列：譯者／審稿／交期／承接／完成等欄位 |

完整清單以 `describe().data.case` 為準。

### 費用單（`fee.update` / `fee.create`）

| 欄位 | 型別 | 合法值來源 |
|------|------|------------|
| `title` | 文字 | — |
| `assignee` | 下拉 | `assignee` |
| `status` | 狀態 | 僅 `draft` |
| `internalNote` | 文字 | — |
| `taskItems` | 陣列 | `taskType`、`billingUnit`、`unitCount`、`unitPrice` |
| `clientInfo` | 物件 | 客戶／聯絡人／派案途徑等；核取：`reconciled`、`rateConfirmed`、`invoiced` 等 |

`taskType` / `billingUnit` 驗證讀 **`selectOptionsStore`**（與設定頁同步），不再依賴寫死型別。

## 用法範例

在瀏覽器主控台或 AI `Runtime.evaluate`：

```javascript
// 1. 探索
await window.__lmsAgent.describe();
await window.__lmsAgent.options.get("taskType");

// 2. 建立草稿費用並填欄位
const created = window.__lmsAgent.fee.create({
  title: "翻譯：樣本文件",
  assignee: "譯者甲",
  taskItems: [
    { taskType: "翻譯", billingUnit: "字", unitCount: 1000, unitPrice: 1.5 },
  ],
});
if (!created.ok) console.error(created.error, created.allowed);

// 3. 修改案件交期
const updated = await window.__lmsAgent.case.update("案件-uuid", {
  translationDeadline: "2026-07-01T09:00:00.000Z",
  client: "CCJK",
});
```

## 元件層副作用盤點（AI 切入點**不會**自動觸發）

以下邏輯寫在頁面元件的 `onChange` / 按鈕流程，**直接走 store 會繞過**。使用 AI 切入點時須知：

### 案件單 [`CaseDetailPage.tsx`](../src/pages/CaseDetailPage.tsx)

| 行為 | 觸發方式 | AI 切入點 |
|------|----------|-----------|
| 變更紀錄 `edit_logs` | 僅在 `changeLogEnabledAt` 已啟用且經 `updateCaseData` 合併 | **不寫入** edit_logs |
| 變更紀錄啟用 | 狀態改為 `dispatched` 時自動設 `changeLogEnabledAt` | **會**（store 內 [`case-store.update`](../src/stores/case-store.ts) 已處理） |
| CAT workflow 指派同步 | 派案相關欄位或狀態變動 | **會**（store 內已處理） |
| 重複標題檢查 | UI「公布」等流程呼叫 `findDuplicateTitleCase` | **不檢查**；AI 可直接寫入重複 title |
| Slack 詢案 | `InquirySlackDialog` 手動開啟 | **不發送** |
| Slack 譯者回覆 | 留言時 `maybeSendTranslatorCaseReplySlack` | **不發送**（comments 欄位亦不可經 AI patch 寫入） |
| 複製案件 | `caseStore.duplicate` + 標題排序對話框 | 不提供；請用 `create` |

### 費用單 [`TranslatorFeeDetail.tsx`](../src/pages/TranslatorFeeDetail.tsx)

| 行為 | 觸發方式 | AI 切入點 |
|------|----------|-----------|
| 定案 `finalized` | 按「開立完成」 | **禁止** |
| 變更紀錄 `editLogs` | 元件內合併 | **不寫入** |
| 連結案件自動帶入 | 選 internalNoteUrl / 案件連結後非同步載入 | **不觸發**；需手動填 `title` / `assignee` / `taskItems` 等 |
| 主要／非主要營收互斥 | `isFirstFee` / `notFirstFee` 離頁 toast | **不 toast**；寫入後可能與 UI 規則不一致，請依 `describe` 自行設對 |
| Notion 匯入 | URL 參數 / 按鈕 | **不觸發** |
| 重複 isFirstFee 警告 | 掛載偵測 | **不 toast** |

### 新建費用頁 [`NewTranslatorFee.tsx`](../src/pages/NewTranslatorFee.tsx)

- 此頁為 Notion 匯入精靈，**未**直接呼叫 store 儲存；AI 應使用 `fee.create` / `fee.update`，不必模擬此頁流程。

## 下拉選項自動更新

驗證層讀 [`selectOptionsStore`](../src/stores/select-options-store.ts) 的 `getSortedOptions(fieldKey)`。在設定頁新增／刪除選項後，**不需改 bridge 程式**，`options.get` 與 `describe` 即反映最新清單。

## 安全與環境

- 正式環境常駐：等同開放給已登入、可執行主控台 JS 的使用者（含 AI 自動化）。
- 依賴 Supabase RLS 與現有登入 session；未登入時 store 可能為空，寫入仍受後端權限約束。
- 後續若需收緊，可加環境旗標或角色檢查於 `installAiAgentBridge`。

## 驗收（白話）

1. 開啟 LMS 並登入，在瀏覽器主控台輸入 `window.__lmsAgent.describe()`，應回傳 `{ ok: true, data: { case, fee, ... } }`。
2. `options.get('taskType')` 應列出與設定頁一致的工作類型。
3. `fee.create({ title: 'AI 測試' })` 應在費用清單出現新草稿；畫面刷新後仍在。
4. 對已定案費用執行 `fee.update` 應回 `{ ok: false, error: '...已定案...' }`。
5. `case.update(id, { status: 'delivered' })` 應被拒絕並附 `allowed` 清單。

## 相關檔案

- [`src/lib/ai-agent-bridge.ts`](../src/lib/ai-agent-bridge.ts)
- [`src/App.tsx`](../src/App.tsx)
- [`src/stores/case-store.ts`](../src/stores/case-store.ts)
- [`src/stores/fee-store.ts`](../src/stores/fee-store.ts)
- [`src/stores/select-options-store.ts`](../src/stores/select-options-store.ts)
