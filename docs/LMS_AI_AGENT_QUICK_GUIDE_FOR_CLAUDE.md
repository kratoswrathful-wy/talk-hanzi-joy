# LMS 技能書：Claude 操作 `window.__lmsAgent`

> **給 AI 代理的速查手冊**（非完整規格）。完整開發紀錄、欄位清單與副作用盤點見 [`LMS_AI_AGENT_BRIDGE_2026-06.md`](LMS_AI_AGENT_BRIDGE_2026-06.md)。

## 何時用 `__lmsAgent`、何時才點 UI

| 情境 | 做法 |
|------|------|
| 填寫／修改**案件單**、**費用單**欄位（下拉、時間、核取、文字、陣列） | **`Runtime.evaluate` 呼叫 `window.__lmsAgent`** |
| 查合法下拉選項 | `options.get('taskType')` 等，**不要**截圖點 Radix 下拉 |
| 設交期／審稿期限 | 直接傳 **ISO 字串**，**不要**操作 `DateTimePicker` |
| 核取方塊（`multiCollab`、`reconciled` 等） | patch 傳 `true` / `false` |
| 定案費用、刪除單據、公布案件、Slack 通知 | **必須走 UI**（API 不提供或刻意阻擋） |
| 瀏覽其他頁面、CAT 編輯器、登入 | 照常瀏覽器自動化 |

**前提**：使用者已登入 LMS；`__lmsAgent` 在 App 啟動後掛在 `window` 上（所有環境常駐）。

## 快速開始

```javascript
// 0. 確認 API 存在
!!window.__lmsAgent  // → true

// 1. 探索欄位型別與守門規則
const meta = window.__lmsAgent.describe();
// → { ok: true, data: { case, fee, datetimeFormat, usage, ... } }

// 2. 查下拉合法 label（與設定頁同步）
const opts = window.__lmsAgent.options.get("taskType");
// → { ok: true, data: { fieldKey: "taskType", labels: ["翻譯", ...] } }

// 3. 列出可查的 options key
window.__lmsAgent.options.listKeys();
```

所有方法回傳 `{ ok: true, data }` 或 `{ ok: false, error, allowed? }`。**失敗時先讀 `allowed`**，修正值後重送。

## API 速查

| 方法 | 用途 |
|------|------|
| `describe()` | 欄位型別、合法狀態、巢狀結構、限制 |
| `options.get(fieldKey)` | 單一下拉欄位合法 label |
| `options.listKeys()` | 可查 options 的 key 清單 |
| `case.list({ search, status, limit })` | 搜尋案件 |
| `case.get(id)` | 讀單筆案件 |
| `case.create(initial?)` | 建立草稿案件（強制 `draft`） |
| `case.update(id, patch)` | 修改案件 |
| `fee.list({ search, status, limit })` | 搜尋費用 |
| `fee.get(id)` | 讀單筆費用 |
| `fee.create(initial?)` | 建立草稿費用 |
| `fee.update(id, patch)` | 修改草稿費用 |

## 守則（必讀）

1. **先探索再寫入**：不確定選項時先 `options.get` 或 `describe()`。
2. **時間用 ISO 8601**：例如 `2026-06-30T14:30:00.000Z`；清空傳 `null`。
3. **僅草稿／早期 workflow**：
   - 費用：`status` 只能 `draft`；**不可定案**（`finalized`）；已定案單據 `update` 會被拒。
   - 案件：只允許 `draft` / `inquiry` / `dispatched`；`delivered` 等敏感狀態會被拒。
4. **不提供 delete**：刪除須請使用者走 UI。
5. **錯誤自我修正**：`{ ok: false, error, allowed }` → 用 `allowed` 重試。
6. **不走 UI 的副作用**：Slack、變更紀錄、連結案件自動帶入、重複標題檢查等**不會**觸發（見完整文件）。
7. **`clientInfo` 可部分更新**（2026-06-30 起）：只傳要改的欄位即可；**未傳的 `clientTaskItems` 會保留**。若 patch 含 `clientTaskItems`，則**整包陣列取代**（須傳完整營收列）。
8. **陣列欄位**（`taskItems`、`workGroups`、`collabRows`）：有傳則**整包取代**，未傳則不動。

### 常用 options key

`taskType`、`billingUnit`、`client`、`contact`、`dispatchRoute`、`caseCategory`、`executionTool`、`assignee` 等（完整清單：`options.listKeys()`）。

## 範例腳本

### 建立並填寫草稿費用單

```javascript
const r = window.__lmsAgent.fee.create({
  title: "翻譯：樣本文件",
  assignee: "譯者甲",  // 須為 options.get("assignee") 中的 label
  taskItems: [
    { taskType: "翻譯", billingUnit: "字", unitCount: 1000, unitPrice: 1.5 },
  ],
});
if (!r.ok) console.error(r.error, r.allowed);
else console.log("費用 id:", r.data.id);
```

### 修改案件交期與客戶

```javascript
const id = "案件-uuid";
const r = await window.__lmsAgent.case.update(id, {
  client: "CCJK",
  translationDeadline: "2026-07-01T09:00:00.000Z",
  multiCollab: true,
});
if (!r.ok) console.error(r.error, r.allowed);
```

### 搜尋後更新

```javascript
const cases = window.__lmsAgent.case.list({ search: "關鍵字", limit: 5 });
if (cases.ok && cases.data.length) {
  const c = cases.data[0];
  await window.__lmsAgent.case.update(c.id, { inquiryNote: "AI 補充說明" });
}
```

### 改費用客戶資訊（部分更新 OK）

```javascript
// 只改 PO 與對帳；client、clientTaskItems 營收列會保留
const r = window.__lmsAgent.fee.update(feeId, {
  clientInfo: {
    clientPoNumber: "ECI_JAS_202606_018788",
    reconciled: true,
  },
});
if (!r.ok) console.error(r.error, r.allowed);

// 若要改營收列，須傳完整 clientTaskItems 陣列（整包取代）
const r2 = window.__lmsAgent.fee.update(feeId, {
  clientInfo: {
    clientTaskItems: [
      { taskType: "翻譯", billingUnit: "字", unitCount: 507, clientPrice: 0.05 },
    ],
  },
});
```

### 處理非法下拉值

```javascript
const bad = window.__lmsAgent.fee.update(feeId, {
  taskItems: [{ taskType: "不存在的類型", billingUnit: "字", unitCount: 1, unitPrice: 1 }],
});
// bad.ok === false
// bad.allowed → 合法 taskType 清單，挑一個重送
```

## 常見任務對照

| 任務 | 腳本入口 |
|------|----------|
| 新建費用草稿 | `fee.create({ title, assignee, taskItems })` |
| 改費用工作項目 | `fee.update(id, { taskItems: [...] })` |
| 改費用客戶資訊／對帳 | `fee.update(id, { clientInfo: { reconciled: true, clientPoNumber: "..." } })` — 部分 patch |
| 改營收 clientTaskItems | `fee.update(id, { clientInfo: { clientTaskItems: [完整陣列] } })` — 整包取代 |
| 新建案件草稿 | `case.create({ title: "..." })` |
| 派案前填欄 | `case.update(id, { client, translator: ["甲"], workGroups: [...] })` |
| 設譯者／審稿交期 | `case.update(id, { translationDeadline, reviewDeadline })` |
| 列出測試資料 | `fee.list({ search: "[AI驗收]" })` |

## 相關檔案

- 程式：[`src/lib/ai-agent-bridge.ts`](../src/lib/ai-agent-bridge.ts)
- 完整規格與驗收紀錄：[`LMS_AI_AGENT_BRIDGE_2026-06.md`](LMS_AI_AGENT_BRIDGE_2026-06.md)
