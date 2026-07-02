# CAT AI 操作橋接（`window.__catAgent`）

> 狀態：**已實作**（2026-07-02）

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

## 相關檔案

- [`cat-tool/app.js`](../cat-tool/app.js) — `openAiBatchModal`、prefs 讀寫
- [`cat-tool/db.js`](../cat-tool/db.js) — `getAiUserBatchPrefs` / `saveAiUserBatchPrefs`
- [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) — Team RPC
