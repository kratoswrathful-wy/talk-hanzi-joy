# TMS AI Bridge Phase 2（LMS 擴充）

> 狀態：**已實作**（2026-07-02）  
> 前置：[`LMS_AI_AGENT_BRIDGE_2026-06.md`](LMS_AI_AGENT_BRIDGE_2026-06.md)

## 入口

| 全域物件 | 說明 |
|----------|------|
| `window.__tmsAgent` | 頂層入口（含 `lms` 與 `cat.invoke`） |
| `window.__lmsAgent` | 與 `__tmsAgent.lms` 相同（向後相容） |

程式：[`src/lib/ai-agent-bridge.ts`](../src/lib/ai-agent-bridge.ts)、[`src/lib/ai-agent-upload.ts`](../src/lib/ai-agent-upload.ts)

## 新增能力摘要

### 上傳 `upload.fromBytes`

```javascript
const up = await __lmsAgent.upload.fromBytes({
  fileName: "sample.pdf",
  contentType: "application/pdf",
  base64: "...", // 或 bytes: [...]
});
// → { ok, data: { name, url, size } }
```

### 案件擴充

- 全檔案陣列欄位、`clientCaseLink`、`tools` / `questionTools`、`comments`
- `options.getToolSchema(toolLabel, toolFieldKey?)`
- `case.generateFees(caseId)` → 費用 id 與 `/fees/{id}` 連結

### 費用

- 允許 `status: "finalized"`；定案時寫入 `finalizedBy` / `finalizedAt`

### 譯者請款 `invoice.*`、客戶請款 `clientInvoice.*`

- `list` / `get` / `create` / `update` / `delete`
- `addFees` / `removeFee`

### 導覽

```javascript
__lmsAgent.navigate.urlFor({ type: "fee", id: "..." });
```

### 陣列合併

`workGroups` / `collabRows` / `taskItems` / `clientInfo.clientTaskItems` 可傳：

```javascript
{ mergeById: true, items: [{ id: "existing-id", unitCount: 200 }] }
```

## 治理

程式層**不設** workflow／定案閘門；`describe().governance` 說明任務提示治理。RLS 仍把關。

## 驗收（白話）

1. `!!window.__tmsAgent` 為 true；`__lmsAgent === __tmsAgent.lms`
2. `upload.fromBytes` 小檔 → `case.update` 寫入 `workingFiles`
3. `case.generateFees` 產生連結案件之費用單
4. `invoice.create` / `clientInvoice.create` 可建立並 `get`
5. 費用 `update` 設 `finalized` 成功

### Playwright 自動驗收

可程式化回歸見 **[`TMS_AI_AGENT_BRIDGE_PHASE2_PLAYWRIGHT_PLAN.md`](TMS_AI_AGENT_BRIDGE_PHASE2_PLAYWRIGHT_PLAN.md)**：

- LMS：**P2-L1～P2-L8**（`tests/ai-bridge-phase2.spec.ts`）
- 執行：`npm run test:e2e -- tests/ai-bridge-phase2.spec.ts`
- 測試資料前綴 **`[PW] ai-bridge`**（測完不自動刪）

> **注意**：P2-L8 驗證費用可定案；與初版 LMS bridge T6（應阻擋 `finalized`）行為已不同，屬 Phase 2 治理放寬。

## CAT 相關

見 [`CAT_AI_AGENT_BRIDGE_2026-07.md`](CAT_AI_AGENT_BRIDGE_2026-07.md)；父頁 `__tmsAgent.cat.invoke('aiBatch.getSettings')` 需已開啟 `/cat` iframe。CAT Playwright 測項 **P2-C1～P2-C5** 見上列 Playwright 計畫。

## 開發紀錄

| 日期 | 內容 |
|------|------|
| 2026-07-02 | Phase 2 功能落地（`0f87353`）：`__tmsAgent`、upload、請款、CAT prefs |
| 2026-07-02 | Playwright 驗收 spec + **線上測試模式**整合；詳見 [`TMS_AI_AGENT_BRIDGE_PHASE2_PLAYWRIGHT_PLAN.md`](TMS_AI_AGENT_BRIDGE_PHASE2_PLAYWRIGHT_PLAN.md) §開發紀錄 |
