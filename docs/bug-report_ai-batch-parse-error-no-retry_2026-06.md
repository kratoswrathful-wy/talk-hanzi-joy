# Bug Report：AI 批次翻譯 parse_error 不重試 ＋ 提示語開頭專案共用

> 建立：2026-06-23  
> 狀態：**已修**（`isRetryable` 納入 parse_error／context_length_exceeded；逐批 `rerenderCurrentSegments`；Team 模式 `batch_introduction` 雲端同步）  
> 相關：[`CAT_AI_GUIDELINES_AND_PROJECT_RULES.md`](CAT_AI_GUIDELINES_AND_PROJECT_RULES.md)、[`cat-tool/js/ai-translate.js`](../cat-tool/js/ai-translate.js)、[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)

---

## 1. 現象

### 1.1 parse_error 中止批次

批次 AI 翻譯（例如 `Pulse Localization - For translators.xlsx_zho-TW.mqxliff`）在約第 150 句（10 句一批 ≈ 第 15 批）時，出現 toast：

> **翻譯失敗：AI 回傳格式不正確，正在重試……**

任務立即中止。錯誤訊息寫「正在重試」，實際上從未重試。

### 1.2 UI 不逐批刷新（附帶）

每批完成後已呼叫 `applyUpdateSegmentTarget` 寫入資料，但 `rerenderCurrentSegments()` 僅在全部完成後呼叫一次，使用者看不到逐批進度。

### 1.3 提示語開頭未在 Team 模式共用（附帶）

「提示語開頭（introduction）」在單機版已存於 Dexie `aiProjectSettings.batchIntroduction`（依 `projectId`），但 **Team 模式**的 `cat-cloud-rpc` 未映射至 Supabase，導致：

- A 使用者在本機／瀏覽器儲存的開頭，B 使用者開啟同專案批次視窗時看不到；
- 換裝置或清快取後內容遺失。

---

## 2. 根因

### 2.1 parse_error 未納入重試條件

[`cat-tool/js/ai-translate.js`](../cat-tool/js/ai-translate.js) 的 `callApi()` 在 `JSON.parse(raw)` 失敗時回傳：

```javascript
error: 'AI 回傳格式不正確，正在重試……'
```

但 [`cat-tool/app.js`](../cat-tool/app.js) 批次迴圈的重試 guard 僅判斷 `isRateLimit`（429 速率限制）：

```javascript
const isRateLimit = String(result.error || '').includes('請求速率超過上限');
if (!isRateLimit || guardRetry >= 2) {
    // 存進度、顯示失敗、return — parse_error 直接走這條
}
```

`parse_error` 不含「請求速率超過上限」→ 立即中止，從未降載重試。

### 2.2 為何約第 150 句才出現

非特定句段問題，而是**統計累積**：每批 AI 偶發回傳不完整 JSON（句段含 `{`/`"` 等特殊字元、API 瞬間抖動等），10 句一批跑 15 批後機率顯著升高。

### 2.3 提示語開頭僅本機 Dexie

| 模式 | 儲存位置 | 跨使用者 |
|------|----------|----------|
| 單機 CAT | Dexie `aiProjectSettings.batchIntroduction` | 僅同瀏覽器 |
| Team CAT | 應為 Supabase `cat_ai_project_settings.batch_introduction` | 專案內共用 |

修正前 Team 模式的 `mapAiProjectSettingsRow`／`db.saveAiProjectSettings` **未含** `batch_introduction` 欄位。

---

## 3. 修正方案

### 3.1 擴充可重試錯誤類型

**檔案**：[`cat-tool/app.js`](../cat-tool/app.js)

```javascript
const isRateLimit   = String(result.error || '').includes('請求速率超過上限');
const isParseError  = String(result.error || '').includes('回傳格式不正確');
const isContextLong = String(result.error || '').includes('提示內容過長');
const isRetryable   = isRateLimit || isParseError || isContextLong;
if (!isRetryable || guardRetry >= 2) { /* 失敗中止 */ }

const retryLabel = isRateLimit ? '速率限制'
    : isParseError ? 'AI 回傳格式問題' : '提示過長';
const backoffMs = isRateLimit
    ? Math.min(12000, 1200 * guardRetry + Math.floor(Math.random() * 400))
    : Math.min(2000, 400 * guardRetry + Math.floor(Math.random() * 200));
```

- `parse_error`／`context_length_exceeded`：縮小 `dynamicBatchSize`／`dynamicCharLimit` 後重試（最多 2 次）。

### 3.2 逐批刷新 UI

每批寫入迴圈結束後呼叫 `rerenderCurrentSegments()`。該函式僅更新 DOM 中可見列，批次間呼叫不影響效能。

### 3.3 提示語開頭：專案級共用（含 Team 雲端）

**資料庫 migration**：[`supabase/migrations/20260623120000_cat_ai_project_settings_batch_introduction.sql`](../supabase/migrations/20260623120000_cat_ai_project_settings_batch_introduction.sql)

```sql
alter table public.cat_ai_project_settings
  add column if not exists batch_introduction text not null default '';
```

**雲端 RPC**：[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)

- `mapAiProjectSettingsRow`：`batchIntroduction: r.batch_introduction ?? ''`
- `db.saveAiProjectSettings`：patch 含 `batchIntroduction` 時寫入 `batch_introduction`；否則保留現值
- `db.getAiProjectSettings` 預設物件含 `batchIntroduction: ''`

**前端**（既有 debounce 儲存邏輯不變，Team 模式改走 RPC）：

- [`cat-tool/app.js`](../cat-tool/app.js) `openAiBatchModal`：開啟時 `getAiProjectSettings` 載入 `batchIntroduction`
- `introEl.oninput`：debounce 呼叫 `saveAiProjectSettings(currentProjectId, { batchIntroduction })`
- `_buildAiOptions`：DOM 無值時 fallback `psettings.batchIntroduction`（批次關閉 modal 後仍帶入 prompt）
- [`cat-tool/index.html`](../cat-tool/index.html)：placeholder／說明改為「依專案儲存並共用」

**行為定義**：

- 儲存單位：**專案**（`projectId`），非檔案、非使用者本機設定。
- 團隊版：最後一位有權限編輯並觸發 debounce 儲存的使用者內容為準；其他使用者下次開啟批次視窗即看到最新版。
- 單機版：仍存 Dexie；無專案時 fallback `localStorage`（舊行為保留）。

---

## 4. 驗收步驟

### parse_error 重試

1. 開啟 `Pulse Localization - For translators.xlsx_zho-TW.mqxliff`，10 句一批，跑超過 150 句——若遇 parse 問題，應 toast「偵測到 AI 回傳格式問題，降載為每批 N 句…」並自動繼續。
2. 429 rate limit 仍正常：toast 顯示「速率限制」，行為不變。

### 逐批 UI

3. 批次進行中，每批完成後譯文欄即時顯示，不需等全部完成。

### 提示語開頭共用（Team）

4. 使用者 A 在專案 X 的批次視窗輸入提示語開頭並稍候（debounce 儲存）。
5. 使用者 B 開啟同專案任一檔案的批次視窗 → 應看到 A 儲存的相同內容。
6. B 修改後，A 重新開啟批次視窗 → 應看到 B 的最新版。

---

## 5. 程式觸點

| 符號 | 檔案 |
|------|------|
| 批次重試 guard | `cat-tool/app.js`（`_runAiBatchTranslate` 內 while 迴圈） |
| `ERROR_MESSAGES.parse_error` | `cat-tool/js/ai-translate.js` |
| `rerenderCurrentSegments` | `cat-tool/app.js` |
| `batchIntroduction` 本機 schema | `cat-tool/db.js` |
| `batch_introduction` 雲端欄位 | `supabase/migrations/20260623120000_…sql` |
| RPC 映射 | `src/lib/cat-cloud-rpc.ts` |
| 批次 UI 文案 | `cat-tool/index.html` |

變更 `cat-tool/` 後執行 `npm run sync:cat`。Team 模式需 `supabase db push` 套用 migration。

---

## 6. 狀態

| 項目 | 狀態 |
|------|------|
| 本文件 | 規格／紀錄 |
| `isRetryable` 擴充 | **已實作** |
| 逐批 `rerenderCurrentSegments` | **已實作** |
| `batch_introduction` migration | **已實作** |
| 雲端 RPC 映射 | **已實作** |
| UI 共用說明文案 | **已實作** |
