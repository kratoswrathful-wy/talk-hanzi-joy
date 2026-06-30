# LMS AI 操作切入點（`window.__lmsAgent`）

> 2026-06 規劃、實作與驗收。讓 AI 以瀏覽器腳本直接讀寫**案件單**與**費用單**，跳過下拉選單、時間介面、核取方塊的點擊操作。

**Claude 速查技能書**：[`LMS_AI_AGENT_QUICK_GUIDE_FOR_CLAUDE.md`](LMS_AI_AGENT_QUICK_GUIDE_FOR_CLAUDE.md)（本檔為完整規格與驗收紀錄）。

**狀態**：**已實作並驗收**（2026-06-30；Claude AI 代理 10/10 通過，commit `82644f0`）

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

## 部分更新語意（PATCH）

| 欄位類型 | `fee.update` / `case.update` 行為 |
|----------|-----------------------------------|
| **頂層單欄**（`title`、`assignee`、`client`、交期等） | 安全：只改 patch 內 key，其餘頂層欄位不動 |
| **`clientInfo` 物件** | **深層合併**（`mergeClientInfoPatch`）：未提及子欄位保留現值；`clientTaskItems` 未傳則保留營收列 |
| **`clientInfo.clientTaskItems`** | 有傳 → **整包陣列取代**（須傳完整列或接受覆寫） |
| **`taskItems` / `workGroups` / `collabRows`** | 有傳 → **整包陣列取代**（Phase 2 可改依 id 合併） |

### Bug 紀錄：`clientInfo` 誤清空（2026-06-30，已修）

修復前部分 `clientInfo` patch 會套用 `defaultClientInfo` 導致營收歸零。詳見 [`bug-report_lms-agent-fee-clientInfo-overwrite_2026-06.md`](bug-report_lms-agent-fee-clientInfo-overwrite_2026-06.md)。回歸測試：[`ai-agent-bridge.clientInfo.test.ts`](../src/lib/ai-agent-bridge.clientInfo.test.ts)。

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

正式環境 AI 代理驗收腳本（T1–T10）見下方 §7.2；Slack `#development` thread（2026-06-30 08:41 CST）已執行完畢。

## 開發與驗收紀錄

### 1. 背景與動機（2026-06-30）

LMS 案件單、費用單表單含大量 **Radix UI 下拉**、自訂 **`DateTimePicker`**（Popover + 日曆 + 時區）、**核取方塊**與文字輸入。AI 若用「截圖＋點擊」自動化：

- 下拉選項在 portal 內、收合時不存在於 DOM，定位 fragile。
- 時間介面多步驟，難以穩定填出正確 ISO。
- React 受控元件無法靠改 DOM 塞值。

另曾討論「直接寫 Supabase／後端」：格式雖可控制，但易填不存在的狀態值、且跳過前端連動。本功能改在 **store 層** 包 API：與人手操作共用寫入路徑，並加 **驗證層** 對照 `selectOptionsStore`，使下拉合法值與設定頁自動同步。

### 2. 方案選型

| 方案 | 說明 | 本專案決策 |
|------|------|------------|
| A. `data-testid` | 穩定定位，仍須多步點擊 | 輔助；非主路徑 |
| B. **`window.__lmsAgent`** | 腳本直接 `caseStore` / `feeStore` | **採用（主路徑）** |
| C. Supabase MCP 直寫 DB | 繞過 UI，適合批次查改 | 並存；本功能不取代 |
| D. 換成原生 `<select>` | 自動化友善 | 未採；侵入 UI |

架構：`AI 腳本 → __lmsAgent → 驗證層 → caseStore/feeStore → React 畫面 + Supabase`。

### 3. 產品決策（與專案擁有者確認）

規劃過程中曾討論：直接寫後端易填錯狀態值；bridge 若對照 `selectOptionsStore` 則下拉變動可自動同步。初版規劃傾向「僅測試環境、只改既有單」，最終定案如下：

| 議題 | 初議 | **最終決策** | 理由 |
|------|------|------------|------|
| 環境 | 僅 test | **所有環境常駐** | 需在正式環境讓 AI 執行真實工作 |
| 操作範圍 | 只改既有單 | **可建立 + 可修改**；不可刪除 | 滿足 AI 協助建單填欄 |
| 定案 | — | **不可** `fee.status = finalized` | 定案＝開立完成，不可逆，保留人手把關 |
| 案件 workflow | — | 僅允許 `draft` / `inquiry` / `dispatched` | 交件後狀態由人手流程推進 |
| 驗證失敗 | — | 回傳 `error` + `allowed` 合法值 | 讓 AI 自我修正，不必猜選項 |
| 下拉合法值 | — | 讀 `selectOptionsStore` | 設定頁改選項後 bridge 自動跟上 |

### 4. 實作內容

#### 4.1 新增檔案

- [`src/lib/ai-agent-bridge.ts`](../src/lib/ai-agent-bridge.ts)
  - `installAiAgentBridge()` → 掛載 `window.__lmsAgent`
  - `describe()` / `options.get()` / `options.listKeys()`
  - `case.list|get|create|update` / `fee.list|get|create|update`
  - 驗證：文字、數字、布林、ISO 時間、下拉（options store）、狀態守門
  - 巢狀：`workGroups`、`collabRows`、`taskItems`、`clientInfo`
  - 匯出常數 `CASE_STATUS_ALLOWED` / `CASE_STATUS_BLOCKED` 供文件與測試對照

#### 4.2 修改檔案

- [`src/App.tsx`](../src/App.tsx)：`useEffect` 啟動時呼叫 `installAiAgentBridge()`（不分環境）
- [`AGENTS.md`](../AGENTS.md)：文件索引

#### 4.3 刻意未實作

- `delete`（案件／費用）
- `fee` 定案、`case` 複製（`duplicate`）
- 元件層：Slack 通知、變更紀錄合併、Notion 匯入、重複標題對話框（見 § 元件層副作用盤點）

### 5. Git 時序

| 時間（約） | Commit | 說明 |
|------------|--------|------|
| 2026-06-30 | `3d5c3e1` | 初版：`ai-agent-bridge.ts`、`App.tsx` 掛載、本文件、`AGENTS.md` 索引 |
| 2026-06-30 | `82644f0` | **fix**：Vercel `tsc -b` 失敗；`AgentResult` union 窄化問題，改 `result.ok === false` + `failFrom()` |

### 6. 建置問題與修正

**現象**：Vercel 部署 `3d5c3e1` 時 `tsc -b` 報錯（約 14 處 TS2322）。

**根因**：驗證函式回傳 `AgentResult<T>`（success | fail union）。以 `!result.ok` early return 時，TypeScript 未將失敗分支窄化為 `{ ok: false }`，導致 `return result` 與存取 `.error` 型別不相容。

**修正**（`82644f0`）：

- 新增 `failFrom(result)` 轉發失敗結果
- 所有失敗分支改為 `if (result.ok === false) return failFrom(result)`

本機 `npx tsc -b` 通過後重新推送，Vercel 部署成功。

### 7. 驗收流程

#### 7.1 驗收方式

- **執行者**：Claude（AI 代理），非人手點 UI
- **手段**：瀏覽器自動化 + `Runtime.evaluate` 呼叫 `window.__lmsAgent`
- **環境**：`https://talk-hanzi-joy.vercel.app`（正式）
- **登入**：PM（威儀）
- **任務張貼**：Slack `#development`（2026-06-30 08:41 CST；commit `82644f0`）
  - 驗收任務訊息：https://1up-studio.slack.com/archives/C0BDSDCT9B5/p1782780099779469
  - 首次部署 `3d5c3e1` 建置失敗後，改貼 `82644f0` 版本任務

#### 7.2 驗收項目（T1–T10）

| 項 | 內容 | 預期 |
|----|------|------|
| T1 | `__lmsAgent` 存在 | `true` |
| T2 | `describe()` | `{ ok: true, data: { case, fee, ... } }` |
| T3 | `options.get('taskType')` | labels 含「翻譯」 |
| T4 | `fee.create` 草稿 | `status: 'draft'`，有 id |
| T5 | `fee.update` taskItems | 不走 UI，`unitCount: 100` |
| T6 | 阻擋 `status: finalized` | `{ ok: false }`，allowed 含 `draft` |
| T7 | `case.create` 草稿 | `status: 'draft'` |
| T8 | ISO `translationDeadline` | 合法 ISO 寫入 |
| T9 | 阻擋 `status: delivered` | `{ ok: false }`，allowed 含 draft/inquiry/dispatched |
| T10 | 非法 taskType | `{ ok: false, allowed: [...] }` |

測試資料標題前綴：**`[AI驗收]`**；驗收後**只列出、不刪除**，由 PM 手動清理。

#### 7.3 驗收結果（2026-06-30）

| 項目 | 結果 |
|------|------|
| 總結 | **10/10 通過** |
| 環境 | talk-hanzi-joy.vercel.app |
| 登入 | 威儀（PM） |
| 回報位置 | Slack `#development` thread（父訊息 2026-06-30 08:41 CST） |

**解讀**：正式環境已可讓 AI 以腳本建立／修改草稿案件與費用；守門（不定案、不寫敏感 workflow、非法下拉被拒）運作正常。

#### 7.4 測試資料清理

Claude 回覆未附具體 UUID。請在 LMS 搜尋標題 **`[AI驗收]`**，或於主控台：

```javascript
window.__lmsAgent.fee.list({ search: "[AI驗收]" });
window.__lmsAgent.case.list({ search: "[AI驗收]" });
```

刪除 T4（費用）、T7（案件）建立的草稿即可。

### 8. 已知限制與後續可選項

| 限制 | 說明 |
|------|------|
| 元件層副作用 | edit_logs、Slack、Notion 帶入等不觸發（見上文表格） |
| 正式環境常駐 | 已登入且能執行 JS 的 session 即可呼叫；RLS 仍把關 |
| 無 delete API | 刪除須走 UI 或日後擴充 |
| 案件重複標題 | bridge 不檢查；公布流程才檢查 |
| 陣列整包取代 | `taskItems` / `workGroups` / `collabRows` 有傳則整包換（見 § 部分更新語意） |

**後續可選**（未排程）：

- 環境或角色旗標（僅 PM/Executive 可呼叫）
- `data-testid` 作 UI 自動化後備
- 補 `edit_logs` 合併（若 AI 也需留變更紀錄）
- 驗收腳本收進 `scripts/` 供 CI 或重跑
- **Phase 2**：陣列欄位依 `id` 合併列

## 相關檔案

- [`src/lib/ai-agent-bridge.ts`](../src/lib/ai-agent-bridge.ts)
- [`src/App.tsx`](../src/App.tsx)
- [`src/stores/case-store.ts`](../src/stores/case-store.ts)
- [`src/stores/fee-store.ts`](../src/stores/fee-store.ts)
- [`src/stores/select-options-store.ts`](../src/stores/select-options-store.ts)
