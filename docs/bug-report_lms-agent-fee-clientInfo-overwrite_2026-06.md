# Bug Report：`fee.update` 對 `clientInfo` 部分更新清空未提及欄位

**回報日期**：2026-06-30  
**發現者**：威儀（透過 Claude 開單助理操作）  
**外部報告**：`BUG_fee_update_clientInfo_overwrite.md`（本機 Claude 專案）  
**影響範圍**：[`src/lib/ai-agent-bridge.ts`](../src/lib/ai-agent-bridge.ts) — `window.__lmsAgent.fee.update` / `fee.create` 的 `clientInfo` 處理  
**嚴重程度**：高 — 靜默清空營收 `clientTaskItems`（字數、單價），營收 USD 歸零；對帳勾選後 UI 鎖定難發現  

**狀態**：**已修並驗收**（`18fdf0a`；Vitest 5 項 + Claude C1–C5 全過；部署 `f295746`）

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

## 修正（commit `18fdf0a`）

1. 新增 **`mergeClientInfoPatch(existing, patch)`**（export 供測試）
   - 純量子欄位：僅覆寫 patch 中出現的 key
   - `clientCaseLink`：淺層合併
   - `clientTaskItems`：patch **未含** → 保留 existing；**有含** → 驗證後整包取代
2. `validateFeePatch(patch, existingFee)`：`fee.update` / `fee.create` 傳入現有費用單
3. 回歸測試：[`src/lib/ai-agent-bridge.clientInfo.test.ts`](../src/lib/ai-agent-bridge.clientInfo.test.ts)
4. 文件：本檔、[`LMS_AI_AGENT_BRIDGE_2026-06.md`](LMS_AI_AGENT_BRIDGE_2026-06.md) §8、[`LMS_AI_AGENT_QUICK_GUIDE_FOR_CLAUDE.md`](LMS_AI_AGENT_QUICK_GUIDE_FOR_CLAUDE.md)

### 部署阻擋（commit `f295746`，與本 bug 無功能耦合）

推送 `18fdf0a` 後 Vercel `tsc -b` 失敗：`cat_user_segment_markers` 未入 Supabase 型別（CAT 2.3k 色點表）。以 `as any` 修正 `cat-cloud-rpc.ts` 三處後部署成功。

## 驗收

### 本機 Vitest

```bash
npm test -- src/lib/ai-agent-bridge.clientInfo.test.ts
```

| 案例 | 重點 | 結果 |
|------|------|------|
| A | 部分 patch 保留 client／contact／507／0.05 | pass |
| B | 整包 `clientTaskItems` 取代 | pass |
| C | default 底的部分 patch | pass |
| — | `clientCaseLink` 淺層合併 | pass |
| — | 非法 taskType + `allowed` | pass |

### 正式環境 Claude AI（C1–C5）

| 項目 | 內容 |
|------|------|
| 環境 | `https://talk-hanzi-joy.vercel.app` |
| 任務 | Slack `#development` 2026-06-30 14:29 — https://1up-studio.slack.com/archives/C0BDSDCT9B5/p1782800951571309 |
| 回覆 | 2026-06-30 18:21 — https://1up-studio.slack.com/archives/C0BDSDCT9B5/p1782814864919499 |
| 總結 | **5/5 通過** |
| 測試 feeId | `6145f23c-1f5b-4a18-81a3-d1d8be7aa3b9`（`[AI驗收-ci] clientInfo 深層合併`） |

核心腳本（C2，修復前會歸零）：

```javascript
const r = await window.__lmsAgent.fee.update(feeId, {
  clientInfo: { reconciled: true, clientPoNumber: "ECI_JAS_202606_018788" },
});
// r.data.clientInfo.client 仍 "ECI"
// r.data.clientInfo.clientTaskItems[0].unitCount === 507
// r.data.clientInfo.clientTaskItems[0].clientPrice === 0.05
```

## 測試資料清理

PM 確認後可刪除 feeId `6145f23c-1f5b-4a18-81a3-d1d8be7aa3b9`，或搜尋 `[AI驗收-ci]`。

## 相關文件

- 完整 bridge 規格與開發時序：[`LMS_AI_AGENT_BRIDGE_2026-06.md`](LMS_AI_AGENT_BRIDGE_2026-06.md) §8
- Claude 技能書：[`LMS_AI_AGENT_QUICK_GUIDE_FOR_CLAUDE.md`](LMS_AI_AGENT_QUICK_GUIDE_FOR_CLAUDE.md)

## 未含於本修（Phase 2）

`taskItems` / `workGroups` / `collabRows` 仍為「有傳則整包陣列取代」，未做依 `id` 合併列。
