# AI Bridge Phase 2 Playwright 驗收計畫

> **狀態**：已實作並驗收（2026-07-02）  
> **對應功能**：[`TMS_AI_AGENT_BRIDGE_PHASE2_PLAN.md`](TMS_AI_AGENT_BRIDGE_PHASE2_PLAN.md)、[`CAT_AI_AGENT_BRIDGE_2026-07.md`](CAT_AI_AGENT_BRIDGE_2026-07.md)  
> **程式**：[`tests/ai-bridge-phase2.spec.ts`](../tests/ai-bridge-phase2.spec.ts)、[`tests/helpers/ai-agent-eval.ts`](../tests/helpers/ai-agent-eval.ts)、[`tests/helpers/test-mode.ts`](../tests/helpers/test-mode.ts)

---

## 目的

以 Playwright 對 AI Bridge Phase 2 做**可重複**的端對端回歸驗收：在瀏覽器內透過 `page.evaluate`／iframe `evaluate` 呼叫 `__tmsAgent`／`__catAgent`，不靠截圖判斷。

正式環境 smoke 仍可由 Slack Claude 驗收；本計畫負責**本地／CI 回歸**，以及**線上測試模式**下的可重複驗收（見 §環境、`tests/helpers/test-mode.ts`）。

---

## 環境

| 項目 | 設定 |
|------|------|
| 預設 URL | `http://localhost:8080`（`PLAYWRIGHT_BASE_URL` 可覆寫） |
| 啟動 | 本地：`npm run dev`；**線上測試**：`PLAYWRIGHT_BASE_URL` + `PLAYWRIGHT_ENTER_TEST_MODE=1`（登入後自動「進入測試模式」） |
| 登入 | `.env` 的 `PLAYWRIGHT_TEST_EMAIL`／`PLAYWRIGHT_TEST_PASSWORD`（線上測試用**真人執行長**帳密，setup 會切為 `test-exec@test.local`） |
| **權限** | LMS 寫入須 `env` 與 DB `current_env()` 一致：本機 localhost → `test`；線上須**測試模式**（`@test.local` 假人），勿用真人帳號直接寫正式區 |
| CAT 小檔 | [`tests/fixtures/Test_Small.mqxliff`](../tests/fixtures/Test_Small.mqxliff) 或 `PLAYWRIGHT_CAT_SMALL_FIXTURE` |
| Supabase | 與 `.env` 的 `VITE_SUPABASE_*` 相同；線上測試模式寫入 **`env=test`** 測試區 |

### 線上測試模式（與正式區區分）

本專案**沒有**獨立 staging 網址；線上測試依 [`CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md`](CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md)：

1. 真人**執行長**登入 `https://talk-hanzi-joy.vercel.app`
2. Playwright setup 點頂欄 **「進入測試模式」** → 切為 `test-exec@test.local`
3. 橘色警示條出現後，LMS／CAT 寫入皆在 **`env=test`**，與正式營運資料隔離

**勿**用 `PLAYWRIGHT_ALLOW_PRODUCTION=1` 搭配真人帳號直接寫正式區（曾誤跑，見 §開發紀錄）。

---

## 安全規則

- 測試資料標題前綴：**`[PW] ai-bridge`**
- 測試結束後**不自動刪除**；由 PM 手動清理
- **禁止**預設對 production **正式區**跑破壞性測試；線上請用 `PLAYWRIGHT_ENTER_TEST_MODE=1`（頂欄測試模式，資料 `env=test`）

清理查詢：

```javascript
window.__lmsAgent.case.list({ search: "[PW] ai-bridge" });
window.__lmsAgent.fee.list({ search: "[PW]" });
```

---

## 執行方式

```bash
npm run typecheck:e2e
npm run test:e2e -- tests/ai-bridge-phase2.spec.ts
```

若登入狀態過期：

```bash
npx playwright test tests/auth.setup.ts
```

---

## LMS 測項（P2-L1～L8）

父頁 `page.evaluate` 呼叫 `window.__tmsAgent`。

| ID | 內容 | 通過條件 |
|----|------|----------|
| P2-L1 | 入口與別名 | `!!__tmsAgent` 且 `__lmsAgent === __tmsAgent.lms` |
| P2-L2 | `describe()` | `ok === true` |
| P2-L3 | `upload.fromBytes` | 小 txt 上傳成功，回傳含 `url` |
| P2-L4 | 案件 + 作業檔 | `case.create` + `case.update(workingFiles)` → `get` 含該檔 |
| P2-L5 | `case.generateFees` | `ok` 且 `fees.length >= 1` |
| P2-L6 | 譯者請款 | `invoice.create` → `get` 成功 |
| P2-L7 | 客戶請款 | `clientInvoice.create` → `get` 成功 |
| P2-L8 | 費用定案 | `fee.update({ status: 'finalized' })` **應 ok**（Phase 2 治理放寬；與初版 LMS T6 相反） |

---

## CAT 測項（P2-C1～C5）

離線版 `/cat/offline`；重用 [`cat-offline-open.ts`](../tests/helpers/cat-offline-open.ts)。

| ID | 內容 | 通過條件 |
|----|------|----------|
| P2-C1 | `__catAgent` 存在 | iframe 內 `!!__catAgent` |
| P2-C2 | `describe()` | `segmentCount > 0` |
| P2-C3 | prefs 寫讀 | `setSettings({ batchRefOptions: { tm: false } })` → `getSettings` 的 `tm === false` |
| P2-C4 | prefs 持久化 | 關 Modal → 再開 Modal → `getSettings` 仍 `tm === false`（同編輯器工作階段；跨 parent reload 見手動） |
| P2-C5 | 父頁 `cat.invoke` | `__tmsAgent.cat.invoke('aiBatch.getSettings')` → `ok` |

---

## 手動／暫不自動

| 項 | 原因 |
|----|------|
| P2-C6 Team 跨瀏覽器 prefs | 需 Team 專案 + 第二 browser context |
| `aiBatch.run()` 真呼叫 LLM | 成本高、不穩定 |

---

## 與 Vitest 分工

| 層級 | 檔案 | 涵蓋 |
|------|------|------|
| 單元 | [`ai-agent-upload.test.ts`](../src/lib/ai-agent-upload.test.ts)、[`ai-agent-bridge.clientInfo.test.ts`](../src/lib/ai-agent-bridge.clientInfo.test.ts) | 參數驗證、clientInfo 合併 |
| E2E | 本 spec | bridge 掛載、Supabase 上傳、請款、Dexie prefs、postMessage |

---

## 執行報告

| 欄位 | 值 |
|------|-----|
| 日期 | 2026-07-02 |
| Commit | `a2d2837` |
| 環境 | 線上 `https://talk-hanzi-joy.vercel.app` + **測試模式**（`PLAYWRIGHT_ENTER_TEST_MODE=1`；假執行長 `test-exec@test.local`，`env=test`） |
| 指令 | `npm run test:e2e -- tests/ai-bridge-phase2.spec.ts` |
| 總結 | **10 passed / 0 failed**（約 54s；線上**測試模式**，非正式區） |

| 測項 | 結果 | 備註 |
|------|------|------|
| P2-L1 | 通過 | |
| P2-L2 | 通過 | |
| P2-L3 | 通過 | |
| P2-L4 | 通過 | |
| P2-L5 | 通過 | |
| P2-L6 | 通過 | |
| P2-L7 | 通過 | |
| P2-L8 | 通過 | |
| P2-C1 | 通過 | |
| P2-C2 | 通過 | |
| P2-C3 | 通過 | |
| P2-C4 | 通過 | 改驗「關 Modal → 再開 Modal」；LMS iframe 內跨 parent reload 重開專案檔不穩，列手動 |
| P2-C5 | 通過 | |

**測試資料**：標題前綴 `[PW] ai-bridge`。**測試區**可用頂欄「重置測試環境」；若曾誤寫**正式區**見 §開發紀錄。

---

## 開發紀錄

### 2026-07-02 — 初版 spec 與線上測試模式修正

| 項目 | 內容 |
|------|------|
| 新增 | `tests/ai-bridge-phase2.spec.ts`（P2-L1～L8、P2-C1～C5） |
| 新增 | `tests/helpers/ai-agent-eval.ts`（`PW_PREFIX`、probe、`waitForCatIframeUserId` 等） |
| 新增 | `tests/helpers/test-mode.ts`（`PLAYWRIGHT_ENTER_TEST_MODE`、登入後自動進測試模式） |
| 調整 | `tests/auth.setup.ts`：登入後 `goto /cases` 並呼叫 `enterOnlineTestMode` |
| 調整 | `tests/global-setup.ts`：允許 production URL 當 `PLAYWRIGHT_ENTER_TEST_MODE=1` |
| 調整 | `playwright.config.ts`：納入 `ai-bridge-phase2`；非 localhost 不啟 `webServer` |
| 調整 | `tests/helpers/cat-offline-open.ts`：匯出 `waitForCatEditorReady` |
| 文件 | 本檔、`TMS_AI_AGENT_BRIDGE_PHASE2_PLAN.md`、`CAT_AI_AGENT_BRIDGE_2026-07.md`、`.env.example` |

**環境踩坑（已修正）**

1. **本機 localhost + 正式帳號**：`getEnvironment()` 為 `test`、DB `current_env()` 為 `production` → LMS 寫入被 RLS 擋；探測會 skip L4～L8。
2. **誤用正式區**：曾設 `PLAYWRIGHT_ALLOW_PRODUCTION=1` 並以真人帳號跑全套 → 資料寫入 **`env=production`**（非測試環境）。**正解**：`PLAYWRIGHT_ENTER_TEST_MODE=1`，setup 切假執行長。
3. **進測試模式時機**：`user_roles` 未載入前頂欄無「進入測試模式」→ setup 改等按鈕可見（最長 90s）並先 `goto /cases`。
4. **P2-C4**：LMS iframe 內「重開專案檔」導覽不穩；改驗「關 Modal → 再開 Modal」同工作階段 prefs；跨 reload 列手動。

**驗收結果**：線上測試模式 **10 passed / 0 failed**（見上表 §執行報告）。

### 2026-07-03 — 整合操作指南

- 新增 [`TMS_CAT_AI_AGENT_OPERATIONS_GUIDE_2026-07.md`](TMS_CAT_AI_AGENT_OPERATIONS_GUIDE_2026-07.md)（Claude 首讀；含 CAT 匯入 `import.fromBytes` 與 iframe 導覽說明）。
