# Bug Report：`fee.update` 對 `clientInfo` 部分更新清空未提及欄位

**回報日期**：2026-06-30  
**發現者**：威儀（透過 Claude 開單助理操作）  
**外部報告**：`BUG_fee_update_clientInfo_overwrite.md`（本機 Claude 專案）  
**影響範圍**：[`src/lib/ai-agent-bridge.ts`](../src/lib/ai-agent-bridge.ts) — `window.__lmsAgent.fee.update` / `fee.create` 的 `clientInfo` 處理  
**嚴重程度**：高 — 靜默清空營收 `clientTaskItems`（字數、單價），營收 USD 歸零；對帳勾選後 UI 鎖定難發現  

**狀態**：**已修**（`mergeClientInfoPatch` 深層合併；Vitest 案例 A–C）

---

## 症狀

對既有費用單執行：

```javascript
await window.__lmsAgent.fee.update(feeId, {
  clientInfo: { clientPoNumber: "ECI_JAS_202606_018788", reconciled: true },
});
```

預期只改 PO 與對帳勾選，實際卻：

- `client`、`contact`、`clientCaseId`、`dispatchRoute` 等 → 空字串
- `clientTaskItems` → 預設 `{ unitCount: 0, clientPrice: 0 }`，**營收資料遺失**

另：直接傳 `clientTaskItems` 會報「不是可寫入欄位」，但不傳又會被預設列覆蓋。

## 根因

`validateClientInfo` 使用 `{ ...defaultClientInfo, ...patch }` 當底，**未讀取該筆費用現有 `clientInfo`**。`feeStore.updateFee` 對 `clientInfo` 為淺層合併，整包不完整物件寫回 DB。

## 修正

1. 新增 **`mergeClientInfoPatch(existing, patch)`**（export 供測試）
   - 純量子欄位：僅覆寫 patch 中出現的 key
   - `clientCaseLink`：淺層合併
   - `clientTaskItems`：patch **未含** → 保留 existing；**有含** → 驗證後整包取代
2. `validateFeePatch(patch, existingFee)`：`fee.update` / `fee.create` 傳入現有費用單
3. 回歸測試：[`src/lib/ai-agent-bridge.clientInfo.test.ts`](../src/lib/ai-agent-bridge.clientInfo.test.ts)

## 驗收

```javascript
// 既有單含 clientTaskItems unitCount: 507, clientPrice: 0.05
const r = await window.__lmsAgent.fee.update(feeId, {
  clientInfo: { reconciled: true, clientPoNumber: "TEST" },
});
// r.data.clientInfo.client 不變
// r.data.clientInfo.clientTaskItems[0].unitCount === 507
```

`npm test -- src/lib/ai-agent-bridge.clientInfo.test.ts` 全過。

## 相關文件

- 完整 bridge 規格：[`LMS_AI_AGENT_BRIDGE_2026-06.md`](LMS_AI_AGENT_BRIDGE_2026-06.md) § 部分更新語意
- Claude 技能書：[`LMS_AI_AGENT_QUICK_GUIDE_FOR_CLAUDE.md`](LMS_AI_AGENT_QUICK_GUIDE_FOR_CLAUDE.md)

## 未含於本修（Phase 2）

`taskItems` / `workGroups` / `collabRows` 仍為「有傳則整包陣列取代」，未做依 `id` 合併列。
