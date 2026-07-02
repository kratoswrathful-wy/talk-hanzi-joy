# Phase 2.3q Playwright 驗收計畫

> **狀態**：**初版已實作**（2026-07-02）— `playwright.config.ts`、`tests/cat-navigation-2-3q.spec.ts`、helpers；執行需 `PLAYWRIGHT_TEST_EMAIL`／`PASSWORD`；**首輪本機執行報告見 §測試執行報告**（D／G／H／I 通過；A 未通過；B／C／E 未跑）
> **對應實作**：Phase 2.3q `6344baa`（[`CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md)）  
> **主紀錄**：[`CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](./CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) §3.18

---

## 目的

以 Playwright 自動化驗收 Phase 2.3q 共用 explicit 導覽管線修正，涵蓋：

1. Ctrl+Enter 確認跳行
2. 清除篩選回到目標句
3. 手動點擊取消 stale 導覽
4. 小檔非 virt 回歸
5. （第二輪）Ctrl+F 不搶焦點、Ctrl+G／F3／QA smoke
6. **F8 於已確認句段**：viewport 不應甩到無關區、假游標離屏 tip 不應誤導焦點（Test G／H）
7. **手動點開譯文格**：viewport 不應「亂跳一陣」（Test I；與 Test C 互補）

**禁止**只靠截圖判斷。測試須在 CAT iframe 內檢查 DOM 焦點、列置中、內部 debug 狀態與 console log。

---

## 決策摘要（已確認）

| 項目 | 決定 |
|------|------|
| CAT 模式 | **優先離線版** [`/cat/offline`](../src/pages/CatToolPage.tsx)（無 Supabase／Team RPC 依賴） |
| 大檔樣本 | `Test_Big.mqxliff` — **6333 句**，~10.7 MB，`CatVirtGrid.isEnabled() === true` |
| 小檔樣本 | `Test_Small.mqxliff` — **33 句**，~64 KB，非 virt 路徑 |
| 測試環境 | **強制**只在測試環境跑；禁止預設打 production |
| 本文件範圍 | 計畫 + **初版 Playwright 程式**（`npm run test:e2e`） |

樣本來源（PM 提供）：本機 `Downloads/Test_Big.mqxliff`、`Downloads/Test_Small.mqxliff`，可匯入離線版 CAT。`Test_Big`（6333 句）與產品樣本 `54316_02_WORDNT_RiftboundCoreRulesRUP4Sta_v2_zh_TW.docx_zho-TW.mqxliff` 同屬大檔 virt 路徑；可選 `PLAYWRIGHT_CAT_RIFTBOUND_FIXTURE` 指向後者做手動對照。

---

## 症狀與根因（PM 回報 2026-07）

**「亂跳一陣」是不是虛擬網格的副作用？**

**部分是，但不只是。** 大檔（≥800 句）啟用 virt 後，任何觸發 **重畫** 的事件都可能讓 viewport 跳到別處：

| 機制 | 程式觸點 | PM 回報對照 |
|------|----------|-------------|
| **navAnchorLock 重畫** | [`grid-virtual-scroll.js`](../cat-tool/js/grid-virtual-scroll.js) `scheduleResizeRepaint` L200–203 | 舊錨點在列高變化重畫時把畫面拉回遠端句（如 #3200） |
| **假游標與 viewport 脫節** | [`cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js) `showOffScreenFakeTip` | 畫面在 ~#20，藍卡顯示「暫存游標位於第 3200 號句段」 |
| **手動點擊 stale nav** | 2.3q `cancelPendingNavigationForUserInteraction` | 來回拉扯、最終選取與假游標錯列（Test C／I） |
| **F8 間接重畫** | [`insertNextMissingTag`](../cat-tool/app.js) L18666 | F8 不直接 scroll；插入 tag → 列高變 → `ResizeObserver` → virt 重畫 |

**F8 是觸發器，virt 重畫 + 舊錨點／假游標狀態是放大器**；與 2.3q explicit 導覽管線重疊但不完全相同，須以 Test G～I 獨立覆蓋。已確認句 F8 若觸發 workflow revoke，**允許**句段變未確認，但 **viewport 與焦點須停在同一句**（不要求 `centeredOk`）。

---

## 安全規則

- Ctrl+Enter **會確認句段**；僅對專用 fixture 檔執行。
- **禁止**對 production 正式案件檔跑破壞性測試。
- 第一版僅 `/cat/offline` + 本機 IndexedDB，不接正式雲端資料。

---

## 測試環境策略（強制）

Playwright **可以且應該**指定只在測試環境工作。三層隔離：

### 第一版（離線版）— 天然隔離

| 項目 | 設定 |
|------|------|
| 預設 baseURL | `http://localhost:8080`（與 `vite.config.ts` 一致） |
| 啟動方式 | `playwright.config.ts` 的 `webServer` 自動跑 `npm run dev` |
| CAT 路徑 | `/cat/offline` only |
| 資料 | 本機 IndexedDB + 匯入 fixture |
| 破壞性操作 | Ctrl+Enter 只對 `Test_Big` / `Test_Small` |

### URL 守門（`globalSetup`）

**允許**（白名單）：

- `http://localhost:*` / `http://127.0.0.1:*`
- `http://[::1]:*`（可選）
- Vercel **Preview** URL（CI 以 `PLAYWRIGHT_BASE_URL` 指定；勿用 production alias）

**禁止**（除非明確覆寫）：

- `https://talk-hanzi-joy.vercel.app`（production）

```ts
// tests/global-setup.ts（下階段實作）
const url = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const isProd = /^https:\/\/talk-hanzi-joy\.vercel\.app/.test(url);
if (isProd && process.env.PLAYWRIGHT_ALLOW_PRODUCTION !== '1') {
  throw new Error('Playwright 禁止對 production 執行；請設 PLAYWRIGHT_BASE_URL=localhost');
}
```

`package.json` 腳本建議：

```json
"test:e2e": "playwright test",
"test:e2e:local": "cross-env PLAYWRIGHT_BASE_URL=http://localhost:5173 playwright test"
```

### 第二階段（Team 模式）

若日後改測 `/cat/team`，須搭配產品**測試模式**（[`CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md`](./CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md)）：

- 真人執行長切換假人身分 → 資料 `env=test`
- **不可**用真人 PM 在 production 跑確認句段測試
- `storageState` 來自測試模式登入，非正式營運帳號

---

## Fixture 策略

| 檔案 | 句數 | 建議存放 | 理由 |
|------|------|----------|------|
| `Test_Small.mqxliff` | 33 | **`tests/fixtures/` 並 commit** | ~64 KB，CI 可直接用 |
| `Test_Big.mqxliff` | 6333 | **`tests/fixtures/`** 或 `PLAYWRIGHT_CAT_LARGE_FIXTURE` 環境變數 | ~10.7 MB；若不入 git，本機預設可指 `Downloads/Test_Big.mqxliff` |

環境變數備援：

- `PLAYWRIGHT_CAT_LARGE_FIXTURE` — 大檔路徑
- `PLAYWRIGHT_CAT_SMALL_FIXTURE` — 小檔路徑

### 離線版開檔流程 `openOfflineCatWithFile(page, fixturePath)`

1. `page.goto('/cat/offline')`
2. 等待 iframe `iframe[src*="/cat/"]`
3. iframe 內 `localStorage.setItem('catNavDebug','1')`（**不需 reload**）
4. `frame.locator('#sourceFileInput').setInputFiles(fixturePath)`
5. 完成匯入精靈／開檔 UI（第一輪實作需 codegen 記錄 selector）
6. 等待 `#editorGrid` 與 `.grid-data-row`
7. 大檔 assert：`CatVirtGrid.isEnabled() === true`；小檔 assert：`=== false`

匯入觸點：[`cat-tool/index.html`](../cat-tool/index.html) `#sourceFileInput`（L2117）。

---

## 與 GPT5-5 草稿的差異

對照外部草稿 `cursor_playwright_cat_2_3q_acceptance.md`，本 repo 定案如下：

| 議題 | GPT5-5 草稿 | 本計畫定案 |
|------|-------------|------------|
| 預設 baseURL | production | **`http://localhost:5173`** + URL 守門 |
| webServer | 未提及 | **自動 `npm run dev`** |
| 假游標 selector | 多個不存在 id/class | **`.cat-fake-caret:not(.hidden)`** |
| 手動取消 log | `user interaction cancelled...` | **`[catNav] manual cancel`** + `[catVirt] cancelNavigationAnchor` |
| 篩選 UI | placeholder 猜測 | **`#sfInput`**、**`#sfModeFilter`**、**`#btnSfClearNav`** |
| Ctrl+F | 泛用 input | **`#sfInput`** focused |
| 鍵盤 | `page.keyboard.press` | **iframe 內** `.grid-textarea` 的 `.press(...)` |
| stale nav | `waitForTimeout(1000)` | **`expect.poll`** + **`getDebugState().navAnchorLock === false`** |
| 內部狀態 | 僅 DOM + console | DOM 主斷言；輔助 **`getDebugState()`**、**`__catNavState`** |
| console 解析 | 字串搜 `centerOk: false` | **不作唯一 pass 條件** |
| 與 vitest | 未說明 | 獨立 **`npm run test:e2e`** |

---

## Playwright 基礎建設（已實作）

**依賴**：

```bash
npm install -D @playwright/test
npx playwright install chromium
```

**執行前**：在 `.env` 加入 `PLAYWRIGHT_TEST_EMAIL`、`PLAYWRIGHT_TEST_PASSWORD`（TMS 登入帳密）。

```bash
npm run test:e2e
```

**建議檔案結構**：

```text
playwright.config.ts
tests/
  global-setup.ts
  cat-navigation-2-3q.spec.ts
  helpers/
    cat-frame.ts
    cat-nav-assert.ts
    cat-nav-debug.ts
    cat-offline-open.ts
  fixtures/
    Test_Small.mqxliff
    Test_Big.mqxliff          # 或 .gitignore + env
playwright/.auth/             # 第二階段 Team；加入 .gitignore
```

**`playwright.config.ts` 要點**：

- `testDir: './tests'`
- `globalSetup: './tests/global-setup.ts'`
- `webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI }`
- `timeout: 60_000`；`expect.timeout: 10_000`
- `retries: process.env.CI ? 1 : 0`
- `use.trace / screenshot / video: 'retain-on-failure'`
- `baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'`
- 單一 project `chromium` Desktop Chrome

**`.gitignore` 增項**：`playwright/.auth/`、`test-results/`、`playwright-report/`

---

## Helper 規格

### `catFrame(page)`

```ts
return page.frameLocator('iframe[src*="/cat/"], iframe[src*="cat/index.html"]');
```

### `enableCatNavDebug(frame)`

```ts
await frame.locator('body').evaluate(() => {
  localStorage.setItem('catNavDebug', '1');
});
```

### `getCatNavigationState(frame)`

在 iframe 內 `evaluate`，回傳：

- `activeIsGridTextarea`、`activeInTargetCol`、`activeSegId`
- `rowCenterDeltaPx`（row 中心 vs `#editorGrid` 中心）
- `centeredOk`（`|delta| <= 16`）
- `fakeCaretVisible`（`.cat-fake-caret:not(.hidden)` 可見）

置中量測須對齊 [`cat-tool/app.js`](../cat-tool/app.js) `measureRowCenterDeltaPx`。

### `getVirtDebugState(frame)`

```ts
await frame.locator('body').evaluate(() => window.CatVirtGrid?.getDebugState?.());
```

Test C 須 assert `navAnchorLock === false`。

### `attachCatConsoleCollector(page)`

收集含 `[catNav]`、`[catVirt]`、`[catFakeCaret]` 的 console；失敗時 `dumpRecent(50)`。**僅作診斷**，不作唯一 pass／fail 依據。

### `pollViewportStable(frame, ms?, interval?)`

在 iframe 內每 `interval`（預設 100ms）記錄 `#editorGrid.scrollTop` 與第一個可見 `.grid-data-row` 的 `data-seg-id`；於 `ms`（預設 2000）內若 scrollTop 或 firstVisibleSegId **變動超過 2 次** → `stable: false`。

### `jumpToDisplayIndex(frame, displayId)`（2026-07-02 實作）

大檔 virt 下手動捲動不可靠；改點 `#btnJumpToSegmentToolbar`（Ctrl+G）→ `#catGenericPromptModal` 填 display # → `#btnCatGenericPromptOk`。跳轉後 `pollViewportStable` 再回傳該列 `data-seg-id`。呼叫前須 `dismissBlockingModals`。

### `dismissBlockingModals(frame)`（2026-07-02 實作）

依序關閉擋住點擊的 overlay：

- `#highMatchGuardModal` → `#btnHighMatchGuardOk`（高相符度句段編輯確認）
- `#catGenericConfirmModal` → `#btnCatGenericConfirmCancel`（Workflow「檔案準備中」；標題「檔案準備中」，不阻擋編輯）

### `clickConfirmedTargetNearDisplay(frame, centerDisplay, radius?)`（2026-07-02 實作）

`jumpToDisplayIndex` 後在可見 DOM 掃 `.grid-data-row.row-bg-confirmed`（display 落在 `center ± radius`；fallback 掃 display # 小於 500），點該列 `.col-target .grid-textarea`，回傳 `segId`。Test G／H 前置步驟 2 用此取代僅 `findConfirmedTargetSegId`。

### `getCatNavSnapshot(frame)`

在 `getCatNavigationState` 基礎上擴充：

- `savedFakeCaretSegId`：`catFakeCaret?.getSaved?.()?.segId`
- `fakeOffScreenTipVisible`：`.cat-fake-caret-scroll-tip:not(.hidden)` 且文字含「暫存游標」
- `virt`：`CatVirtGrid?.getDebugState?.()`
- `scrollTop`、`firstVisibleDisplayId`（`.col-id` 文字）

失敗時 dump 完整 snapshot + 最近 console。

---

## 驗收測項（對應 2.3q A～I）

### 共用通過條件

**Explicit 置中導覽**（A、B、D）：

```js
activeIsGridTextarea === true
activeInTargetCol === true
centeredOk === true   // |rowCenterDeltaPx| <= 16
```

**手動點擊**（C、I）— **不要求置中**：

```js
activeSegId === clickedSegId
activeIsGridTextarea === true
fakeCaretVisible === false   // 或無離屏 tip
CatVirtGrid.getDebugState().navAnchorLock === false
```

**F8／編輯中**（G、H）— **不要求 centeredOk**（F8 非 explicit 導覽）：

```js
activeSegId === f8SegId
activeIsGridTextarea === true
activeInTargetCol === true
pollViewportStable === true
```

使用 `expect.poll`（timeout 5～8s），失敗訊息附 `getCatNavSnapshot` + console dump。

### Test A — 大檔 Ctrl+Enter ×5

- Fixture：`Test_Big.mqxliff`
- 前置：`CatVirtGrid.isEnabled() === true`；可選中段捲動後再測
- 每輪：iframe 內 `Control+Enter` → poll 置中 + 焦點
- 可選 debug log：`completed: true`、`focusOk`、`centerOk`

### Test B — 大檔清除篩選

1. 點譯文格，記 `editedSegId`
2. `#sfModeFilter` → `#sfInput` 填篩選條件
3. `#btnSfClearNav` 清除
4. 預期：`activeSegId === editedSegId`、置中、無假游標

### Test C — 手動取消 stale nav

1. Ctrl+Enter 啟動 explicit nav
2. **立即**點另一可見 `.col-target .grid-textarea`
3. poll：`activeSegId === clickedSegId`；`navAnchorLock === false`
4. 再 poll 2s：segId 不變（防 stale navGen）
5. console 含 `manual cancel`

### Test D — 小檔回歸

- Fixture：`Test_Small.mqxliff`
- `CatVirtGrid.isEnabled() === false`
- Ctrl+Enter；可選 clear filter

### Test E — Ctrl+F 不搶焦點（第二輪）

- 大檔開啟後 iframe 內 Ctrl+F
- `#sfInput` 保持 focused；填字後仍 focused

### Test F — 失敗可見性（第二輪）

- 難以穩定觸發 `[catNav] flush failed`
- 第一版僅記錄需 debug hook；不做脆弱字串 log 斷言

### Test G — F8 於已確認句段：viewport 不應甩到無關區（PM 1(1)）

**Fixture**：`Test_Big.mqxliff`

**前置**：

1. 捲到中段（display #3000–3200），點譯文格編輯（自然保存暫存游標）
2. 捲到前段（約 display #13–22），點 **已確認**（綠底／✓）句段譯文格
3. 記 `f8SegId` = `activeSegId`

**動作**：iframe 內對 active `.grid-textarea` 按 `F8`

**通過**（poll 3s）：

- `activeSegId === f8SegId` 且 `activeIsGridTextarea === true`
- `pollViewportStable` 為 stable
- 若 `savedFakeCaretSegId !== f8SegId` 且出現離屏 tip：允許 tip，但 **不得** 在 3s 內把 `activeSegId` 改成 `savedFakeCaretSegId`
- 可選：`firstVisibleDisplayId` 仍落在 #13–30（±5），不應整窗跳到 #3200

**子項**：G-a（tag 已齊、reconcile 短路）；G-b（會插入 tag、可能 unconfirm）— 見 [`insertNextMissingTag`](../cat-tool/app.js) L18674。

### Test H — F8 後來回拉扯 + 假游標錯列（PM 1(2)）

**前置**：同 Test G 步驟 1–2

**動作**：`F8` ×1

**通過**（poll 3s，每 100ms 取樣）：

- `scrollTop` 取樣變動次數 **≤ 2**
- 最終 `activeSegId === f8SegId`
- 焦點在 `f8SegId` 時，假游標／離屏 tip **不得** 指向步驟 1 的遠端 `savedFakeCaretSegId`
- `getDebugState().navAnchorLock === false`

### Test I — 手動點譯文格：viewport 穩定（PM 2；加強 Test C）

**前置**：`Test_Big`；可選先 `Ctrl+Enter` 或僅手動捲動

**動作**：點另一可見 `.col-target .grid-textarea`（**不要求**緊接 Ctrl+Enter）

**通過**：

- `pollViewportStable` 2s
- `activeSegId === clickedSegId`
- stable 後不得再跳走；**不要求** `centeredOk`
- 焦點在 clicked 列時 `fakeOffScreenTipVisible === false`

與 Test C：C 測「取消 stale explicit nav」；I 測「日常手動點擊不亂跳」。

**第一版實作優先序**：D（冒煙）→ A → B → C → **G → H → I** → E → F

---

## 與現有驗收流程

| 階段 | 執行者 | 用途 |
|------|--------|------|
| Playwright A～I | 本機／CI | 開發期回歸（含 F8／viewport 穩定 G～I） |
| Claude AI Slack | 部署後 | 全量驗收（見 [`.cursor/rules/claude-ai-acceptance-slack.mdc`](../.cursor/rules/claude-ai-acceptance-slack.mdc)） |

---

## 程式觸點索引

| 檔案 | 區段 |
|------|------|
| [`cat-tool/app.js`](../cat-tool/app.js) | `flushPendingEditorFocus`、`insertNextMissingTag`（F8）、`focusin`、confirm-jump、`window.__catNavState` |
| [`cat-tool/js/grid-virtual-scroll.js`](../cat-tool/js/grid-virtual-scroll.js) | `cancelNavigationAnchor`、`getDebugState`、`scheduleResizeRepaint`（navAnchorLock） |
| [`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js) | `.cat-fake-caret`、`refreshAfterVirtRender` |
| [`cat-tool/index.html`](../cat-tool/index.html) | `#sourceFileInput`、`#sfInput`、`#btnSfClearNav` |
| [`src/pages/CatToolPage.tsx`](../src/pages/CatToolPage.tsx) | `/cat/offline` iframe 嵌入 |

---

## 實作順序（Playwright 本身）

```text
1. 安裝 @playwright/test + config + globalSetup 守門
2. helpers + fixtures（Test_Small commit；Test_Big 依 PM 決定）
3. Test D 冒煙
4. Test A → B → C
5. Test G → H → I（F8／viewport 穩定）
6. Test E → F（第二輪）
7. 可選 GitHub Actions（preview URL + fixture artifact）
```

---

## 測試執行報告（2026-07-02）

> **審查對象**：GPT 5.5（或後續 AI 代理）— 本節為可機讀的執行紀錄與接續指引，非給 PM 手動點 UI 的步驟清單。  
> **執行者**：Cursor 代理（本機 Windows + PowerShell）  
> **環境**：`PLAYWRIGHT_BASE_URL` 預設 `http://localhost:8080`；`webServer` 自動 `npm run dev`；帳密自 `.env`（`PLAYWRIGHT_TEST_EMAIL`／`PLAYWRIGHT_TEST_PASSWORD`，**勿 commit**）  
> **大檔 fixture**：`Test_Big.mqxliff`（6333 句）；小檔 `tests/fixtures/Test_Small.mqxliff`  
> **程式狀態**：helpers／spec 修正已寫入工作區；**截至本報告撰寫時尚未 git commit／push**

### 失敗分類（審查時請先讀）

| 類型 | 定義 | 本輪是否出現 |
|------|------|--------------|
| **L0 跑不起來** | 語法錯誤、`No tests found`、登入失敗、fixture 缺失 | 早期 G 輪有（重複 import）；已修 |
| **L1 基礎設施 timeout** | 測試腳本／selector／modal 未處理導致 180s timeout | 早期 G 輪有；已修（見 §基礎設施修正） |
| **L2 斷言未通過** | 流程跑完，`expect`／`expect.poll` 條件不成立 | **Test A**（`centeredOk: false`） |
| **L3 未執行** | `describe.serial` 前項失敗而 skip | **Test B**（A 失敗後）；**C／E** 本輪未單獨 invoke |

**結論（給審查者）**：本輪**不是**「Playwright 整體跑不起來」；多數測項已完成驗收流程並得出 pass／fail。**唯一產品向 fail 為 Test A**（大檔 explicit 置中）。G／H／I pass 表示 F8→virt 重畫路徑在目前 fixture 上可接受。

### 執行結果總表

| 測項 | 結果 | 耗時（約） | 備註 |
|------|------|-----------|------|
| `auth.setup` | ✅ pass | ~3s | 等 `iframe[title="CAT 個人離線版"]`，勿用 `not.toHaveURL(/login/)` |
| **Test D** | ✅ pass | ~29s | 小檔；`CatVirtGrid.isEnabled() === false`；`centeredOk === true` |
| **Test A** | ❌ fail | ~33s | 大檔；`Ctrl+Enter` 後 30s poll：`centeredOk` 仍 `false`；焦點在譯文格 |
| **Test B** | ⏭ skip | — | 與 A 同 `describe.serial` |
| **Test C** | ⏭ 未跑 | — | 本輪未 `-g` 單獨執行 |
| **Test G** | ✅ pass | ~11s | 見 §GHI 最終輪 |
| **Test H** | ✅ pass | ~11s | |
| **Test I** | ✅ pass | ~3s | |
| **Test E** | ⏭ 未跑 | — | |

**最終可宣告通過**：setup + D + G + H + I（**5+1 項**）。  
**明確未通過**：A。**待跑**：B（依賴 A 或拆 serial）、C、E。

### 代表性指令與 exit code

```powershell
Set-Location "c:\Homemade Apps\1UP TMS"
npx playwright test -g "Test D" --project=chromium                    # exit 0
npx playwright test -g "Test G —|Test H —|Test I —" --project=chromium  # exit 0（最終輪）
npx playwright test -g "Test A —|Test B —" --project=chromium          # exit 1（A fail）
npm run test:e2e                                                      # 全套；大檔 beforeAll 可達 3～10+ min
```

失敗 trace（Test A）：`test-results/cat-navigation-2-3q-Phase--4627d-*-Test-A-*-chromium/trace.zip`  
診斷：`npx playwright show-trace <path>` → 查 `rowCenterDeltaPx`、`getCatNavSnapshot`。

### Test A 失敗細節（L2，產品／量測待釐清）

- **檔案**：`tests/cat-navigation-2-3q.spec.ts` Test A
- **前置**：`openOfflineCatWithFile` + `assertVirtEnabled(true)`；`scrollToDisplayIndex(20)`；點譯文格
- **動作**：`Control+Enter`（規格寫 ×5；spec 實作 ×3）
- **失敗斷言**：

```js
expect.poll(getCatNavigationState).toMatchObject({
  activeIsGridTextarea: true,
  activeInTargetCol: true,
  centeredOk: true,   // 收到 false
});
```

- **已排除**：登入、開檔、virt 啟用、焦點不在譯文格
- **審查假說**（擇一或並存）：
  1. **產品**：大檔 virt 下 `flushPendingEditorFocus`／置中捲動在 headless 仍未在 30s 內收斂（2.3q 置中回歸）
  2. **測試**：`measureRowCenterDeltaPx` 與 virt 重畫時序競態；可試拉長 poll、先 `pollViewportStable`、或記錄 `rowCenterDeltaPx` 數值再定門檻
  3. **環境**：`resetEditorView` 每測前 `scrollTop=0` 是否干擾 A（GHI 未要求 `centeredOk` 故不受影響）

**與 G/H/I 的關係**：G/H/I 依計畫**不要求** `centeredOk`；A fail **不推翻** G/H/I pass 對 F8／viewport 的結論。

### 基礎設施修正（L1，已寫入 helpers／spec）

審查接續時請假設下列已存在於 `tests/helpers/` 與 `cat-navigation-2-3q.spec.ts`：

| 問題 | 症狀 | 修正 |
|------|------|------|
| 專案歡迎 Modal | 擋「匯入檔案」 | `dismissProjectWelcome` → `#btnProjectWelcomeSkip` |
| 語言對不符 | 匯入 wizard 卡住 | 匯入選 `en-us`／`zh-tw`；`#batchImportLangMismatchDialog` 確定 |
| mq 身分 Modal 晚出現 | 句段 0/0 | `confirmMqRoleOnOpen` 輪詢至 120s |
| 大檔 virt 捲動 | `scrollToDisplayIndex` 回傳 null | 改 `jumpToDisplayIndex`（Ctrl+G） |
| 高相符度 guard | `#highMatchGuardModal` 擋點擊 | `dismissHighMatchGuard` → 仍要編輯 |
| Workflow 檔案準備中 | `#catGenericConfirmModal` 擋工具列 | `dismissCatGenericConfirm` → 取消 |
| G 找不到已確認句 | `findConfirmedTargetSegId` 僅掃可見列且範圍過窄 | `clickConfirmedTargetNearDisplay(frame, 17, 10)` |
| virt 點 `.first()` 譯文格 | DOM detach 重試至 timeout | 改以 `jumpToDisplayIndex` 回傳之 `data-seg-id` 點擊 |

`describe.serial` 僅套在 **Test A–I 大檔**區塊；Test D 獨立。

### G/H/I 迭代紀錄（供審查者略讀）

| 輪次 | exit | 主因 |
|------|------|------|
| 1 | 1 | `clickTargetTextareaAtDisplay(3100)` → virt DOM detach |
| 2 | 1 | `#catGenericConfirmModal`（檔案準備中）擋 `#btnJumpToSegmentToolbar` |
| 3 | 1 | `findConfirmedTargetSegId` 回傳 null（jump 至 15 後可見列無綠底） |
| **4** | **0** | 上述修正 + `clickConfirmedTargetNearDisplay`；**4 passed ~1.1 min** |

### 給 GPT 5.5 的接續任務（建議優先序）

1. **Test A 根因**：讀 A 的 trace／snapshot；在 iframe 內 log `rowCenterDeltaPx`、`virt.getDebugState()`；判定修產品或修測試等待
2. **拆 serial 或單跑 B**：`npx playwright test -g "Test B —"`；B 亦要求 `centeredOk`，可能與 A 同源
3. **補跑 C、E**：`npx playwright test -g "Test C —|Test E —"`
4. **commit**：helpers + spec + 本報告；**排除** `.env`
5. **若 A/B 確認產品 bug**：對照 [`CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md`](./CAT_EDITOR_NAV_PHASE_2_3Q_PLAN.md) 開修復；G～I 作為 F8 路徑回歸網

### 與 Slack Claude 驗收的邊界

- 本 Playwright 套件：**本機／CI 回歸**；目前**未**接 Slack `#development` AI 驗收流程
- 部署後全量驗收仍依 [`.cursor/rules/claude-ai-acceptance-slack.mdc`](../.cursor/rules/claude-ai-acceptance-slack.mdc)；若 PM 要 AI 驗收 2.3q，須另發任務並含 commit 短碼

---

## 注意事項

- **`Test_Big.mqxliff` ~10.7 MB**：commit 前請 PM 確認；可用 `PLAYWRIGHT_CAT_LARGE_FIXTURE` 備援。
- **匯入精靈**：離線版匯入後可能有確認步驟，實作時以 codegen 記錄 selector。
- **Debug**：CAT iframe Console：`localStorage.setItem('catNavDebug','1')`。
- **F8 副作用**：插入 tag 可能 `unconfirmSegmentVisualAfterReplace`；G／H 須在 fixture 上跑，優先 tag 已齊句段。
- **display # vs segId**：藍卡「第 3200 號句段」為 display index；assert 同時記 `data-seg-id` 與 `.col-id` 文字。
- **G～I 若 6344baa 後仍失敗**：可能未涵蓋 F8→resize→`navAnchorLock` 路徑，需另開修復任務；Playwright 先鎖定回歸。
