狀態：已落地待驗收

# BCD 波次 Playwright — 本機登入與 Claude 執行手冊

> **對應規格**：[`CAT_BCD_WAVE_PLAYWRIGHT_ACCEPTANCE_2026-07.md`](CAT_BCD_WAVE_PLAYWRIGHT_ACCEPTANCE_2026-07.md)  
> **帳號說明**：[`CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md`](CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md) §Playwright 專用帳號

---

## A. 威儀本機只需做兩件事

### A1. 補本機 `.env`（勿 commit）

帳號見 [`CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md`](CAT_EDITOR_NAV_PHASE_2_3Q_PLAYWRIGHT_PLAN.md) §Playwright 專用帳號；密碼僅寫在本機 `.env` 的 `PLAYWRIGHT_TEST_PASSWORD`（**禁止**寫入 docs 或 commit）。

```text
PLAYWRIGHT_TEST_EMAIL=playwright-e2e@1up.local
PLAYWRIGHT_TEST_PASSWORD=<見本機 .env>
PLAYWRIGHT_BASE_URL=https://talk-hanzi-joy.vercel.app
PLAYWRIGHT_ENTER_TEST_MODE=1
PLAYWRIGHT_CAT_SMALL_FIXTURE=tests/fixtures/Test_Small.mqxliff
```

### A2. 產生登入 session 檔

```powershell
Set-Location "c:\Homemade Apps\1UP TMS"
npx playwright install chromium
npx playwright test tests/auth.setup.ts --project=setup
```

**成功標誌**：終端顯示 `1 passed`；出現 `playwright/.auth/user.json`（內為 cookie／session，不是明文密碼）。

若要給 Claude 雲端 sandbox 用：把 `playwright/.auth/user.json` 複製到共用資料夾後通知 Claude 路徑（**勿 commit 此檔**）。

---

## B. 貼給 Claude 的執行提示（複製整段）

```text
你是 BCD 波次 Playwright 驗收執行者。請在已 clone 的 talk-hanzi-joy repo（main ≥ 0312648c，含 sync:cat）執行瀏覽器 UI 回歸。

## 前置
1. repo 根目錄有 `tests/fixtures/Test_Small.mqxliff`
2. 已有 `playwright/.auth/user.json`（若無：請停下，請威儀先跑 `npx playwright test tests/auth.setup.ts --project=setup`）
3. `.env` 含 PLAYWRIGHT_*（或僅本機跑時設 PLAYWRIGHT_BASE_URL=http://localhost:8080）

## 執行
Set-Location "<repo根目錄>"
npm run typecheck:e2e
npx playwright test -g "BCD 波次" --project=chromium

## 通過條件（三項全綠才算 pass）
| 測項 | 通過條件 |
|------|----------|
| BCD-B | `#btnToggleEditorWordMode` 等加權按鈕 hidden 且不可見 |
| BCD-C | 小檔 CatVirtGrid 關閉；清除篩選後 `centeredOk` 且 \|rowCenterDeltaPx\| ≤ 16 |
| BCD-D | 審稿確認句段 noop Ctrl+Enter 後焦點跳下一句，`data-wf-state` 仍 review_confirmed |

## 失敗時
- 附 `npx playwright show-trace <trace.zip>` 路徑或失敗截圖
- 不要改程式；只回報失敗測項與診斷

## 回報格式（thread 內表格）
| 測項 | 結果 | 備註 |
| BCD-B | pass/fail | |
| BCD-C | pass/fail | |
| BCD-D | pass/fail | |
```

---

## C. 本機直接跑（不必經 Claude）

```powershell
Set-Location "c:\Homemade Apps\1UP TMS"
npx playwright test -g "BCD 波次" --project=chromium
```

本機預設 `PLAYWRIGHT_BASE_URL=http://localhost:8080`，`playwright.config` 會自動 `npm run dev`。

**已有 `playwright/.auth/user.json`、且本輪刻意不跑 `auth.setup` 時**（例如乾淨 worktree 已人工放入 session 檔、或避免覆寫現有登入狀態），可加 `--no-deps` 略過 `setup` 專案：

```powershell
npx playwright test -g "BCD 波次" --project=chromium --no-deps
```

前提：`playwright/.auth/user.json` 仍有效；**勿 commit** 此檔。BCD 波次 spec 以離線 CAT 為主，不依賴測試模式假人切換。

---

## D. 常見錯誤

| 訊息 | 處理 |
|------|------|
| 請在 .env 設定 PLAYWRIGHT_TEST_EMAIL / PASSWORD | 補 A1 密碼後重跑 auth.setup；或已有有效 `user.json` 時改加 `--no-deps`（見 §C） |
| 找不到 Test_Small.mqxliff | 確認 `tests/fixtures/Test_Small.mqxliff` 存在 |
| 找不到「進入測試模式」 | 確認 `PLAYWRIGHT_ENTER_TEST_MODE=1` 且帳號為真人執行長 |
