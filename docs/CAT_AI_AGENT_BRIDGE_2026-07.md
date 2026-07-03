# CAT AI 操作橋接（`window.__catAgent`）

> 狀態：**已實作**（2026-07-02）  
> **AI 操作流程（導覽、匯入、AI 批次）**：[`TMS_CAT_AI_AGENT_OPERATIONS_GUIDE_2026-07.md`](TMS_CAT_AI_AGENT_OPERATIONS_GUIDE_2026-07.md)（Claude 首讀）

## 掛載

- iframe 內：[`cat-tool/js/cat-agent-bridge.js`](../cat-tool/js/cat-agent-bridge.js)（`installCatAgentBridge()`）
- 父頁代理：`window.__tmsAgent.cat.invoke(method, args)`（需 `/cat` iframe）

## API

| 方法 | 說明 |
|------|------|
| `describe()` | 當前 project/file、句數、VirtGrid |
| `aiBatch.getSettings()` | 讀 user×project prefs + DOM |
| `aiBatch.setSettings(patch)` | 寫入 prefs 並更新 UI |
| `aiBatch.openModal()` | 開啟批次 Modal |
| `aiBatch.run()` | 觸發執行（需 Modal 已綁定） |
| `aiBatch.previewPrompt()` | 預覽 prompt |
| `import.fromBytes({ fileName, base64, sourceLang, targetLang, ... })` | 繞過 file input 匯入 |

### `import.fromBytes` 參數

| 參數 | 必填 | 說明 |
|------|------|------|
| `fileName` | 是 | 含副檔名 |
| `base64` 或 `bytes` | 是 | 檔案內容 |
| `contentType` | 否 | MIME |
| `sourceLang` / `targetLang` | 是 | 語言對 |
| `mqRole` | mqxliff 建議 | 如 `T_ALLOW_R1` |
| `caseInfo` | 否 | `{ caseId, caseTitle }` 團隊版連結 LMS |
| `excelConfigMap` | Excel 時 | 通常需 UI 精靈；單獨呼叫易失敗 |

父頁呼叫範例（須已開 `/cat/team/projects/:id`）：

```javascript
await __tmsAgent.cat.invoke("import.fromBytes", [{
  fileName: "sample.mqxliff",
  base64: "...",
  sourceLang: "en-US",
  targetLang: "zh-TW",
  mqRole: "T_ALLOW_R1",
}]);
```

> **勿在 LMS 父頁**搜尋「+ 匯入檔案」按鈕；該鈕在 iframe 內。優先使用本 API。

## 每人每專案 prefs

- **Team**：`cat_ai_user_batch_prefs`（migration `20260702120000`）
- **Offline**：Dexie `aiUserBatchPrefs`（db v28）
- 含：`batchRefOptions`、`candidatePool`、`rangeMode`、`batchIntroduction`、執行選項等

讀取順序：user prefs → 專案 `batch_ref_options` 預設 → 內建預設。

## 驗收（AI 可程式化）

1. iframe 內 `!!window.__catAgent`
2. 開專案與檔案後 `describe().data.segmentCount > 0`
3. `aiBatch.setSettings({ batchRefOptions: { tm: false } })` 後 `getSettings` 一致
4. 換分頁重開 Modal，勾選仍保留（同 user×project）
5. Team：換瀏覽器同帳號 prefs 一致（需 migration 已 push）

### Playwright 對照

| 手動／AI 項 | Playwright ID | 自動化 |
|-------------|---------------|--------|
| 1 | P2-C1 | 是（離線 iframe） |
| 2 | P2-C2 | 是 |
| 3 | P2-C3 | 是 |
| 4 | P2-C4 | 是（關閉再開 Modal；跨 reload 手動） |
| 5 | P2-C6 | **手動**（Team 跨瀏覽器） |
| 父頁 `cat.invoke` | P2-C5 | 是 |

完整規格與執行方式：[`TMS_AI_AGENT_BRIDGE_PHASE2_PLAYWRIGHT_PLAN.md`](TMS_AI_AGENT_BRIDGE_PHASE2_PLAYWRIGHT_PLAN.md)（含 §開發紀錄、線上測試模式說明）

**AI 整合操作（建單、CAT 匯入、AI 批次）**：[`TMS_CAT_AI_AGENT_OPERATIONS_GUIDE_2026-07.md`](TMS_CAT_AI_AGENT_OPERATIONS_GUIDE_2026-07.md)

## 相關檔案

- [`cat-tool/app.js`](../cat-tool/app.js) — `openAiBatchModal`、prefs 讀寫
- [`cat-tool/db.js`](../cat-tool/db.js) — `getAiUserBatchPrefs` / `saveAiUserBatchPrefs`
- [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) — Team RPC
