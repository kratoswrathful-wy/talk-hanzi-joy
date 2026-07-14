狀態：規劃中

# E2E flaky 穩定化：lms-tool-set-field／dev-switch-user-persona

日期：2026-07-14  
優先：低（非擋關慢軌；有空檔再排）  
來源：E2E run #20（commit `7f4c1e13`／PR #42）於 `lms-tool-set-field` seed「更新後讀取案件失敗」；審核方比對同 PR #18／#19 該測綠、main #12 掛的是另一測試（`dev-switch-user-persona`），判定與 CAT meta／額外資訊變更無關的間歇失敗。

## 目標

兩者在 CI 連續 **5 次** `workflow_dispatch`（E2E Playwright）**全綠**。

## 對象

| Spec | 症狀（CI） | 建議做法 |
|------|------------|----------|
| [`tests/lms-tool-set-field.spec.ts`](../tests/lms-tool-set-field.spec.ts) | seed 後「更新後讀取案件失敗」 | 寫後讀改為輪詢重試（上限數秒），避免剛寫入尚未可見 |
| [`tests/dev-switch-user-persona.spec.ts`](../tests/dev-switch-user-persona.spec.ts) | 進入線上測試模式／換人相關失敗 | `switchToTestPersona` 前先等測試模式指示元素就緒，勿直接斷言 |

## 約束

- 慢軌、非擋關：本工單不升格為 push／PR 擋關條件。
- 遵守 [`testing.mdc`](../.cursor/rules/testing.mdc)：確定訊號等待，禁止固定 `sleep`；多角色斷言前須確認生效身分。
- 相關 workflow：[`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml)；主計畫索引見 [`ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md`](./ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md) §20。

## 驗收

1. 本機或 CI 以確定訊號修好上述等待條件。
2. 對 `main`（或修復分支）`workflow_dispatch` **連續 5 次** E2E 全綠，並於本檔或 thread 貼 run 連結。
3. 通過後狀態改「已完成」，摘要可寫入 CODEMAP／主計畫 OBS 待辦區（若已列）。

## 備註

- 2026-07-14：已對最新 `main`（`dc9e28db`）手動重跑一次 E2E 確認是否再現；結果記入下方。

### 手動重跑結果（2026-07-14）

- Run：[Actions #29322613828](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29322613828)（`workflow_dispatch`／`main`＠`dc9e28db`）
- 結論：**failure**（約 11 分鐘）
- **再現**：`tests/lms-tool-set-field.spec.ts` — `LMS tool.setField…寫入工具多行欄位後回讀 verified`  
  - `Error: {"ok":false,"step":"seed-tools","error":"更新後讀取案件失敗"}`（含 retry #1 同錯）
- **本 run 通過**：`tests/dev-switch-user-persona.spec.ts`（此輪未掛）

### 深入查證（同測再掛後，2026-07-14）

1. Spec 的 `seed-tools` 步驟呼叫 `__lmsAgent.case.update` 塞入 `tools`；失敗訊息來自橋接層，非 Playwright 另做的 `case.get`。
2. [`src/lib/ai-agent-bridge.ts`](../src/lib/ai-agent-bridge.ts) `case.update`（約 L1056–1063）：

```ts
await caseStore.update(id, validated.data);
const updated = caseStore.getById(id);
return updated ? ok(updated) : fail("更新後讀取案件失敗");
```

即：**寫入後同步讀本地 store**；`getById` 暫時拿不到就整段 `update` 判失敗。間歇失敗符合「optimistic／realtime／rehydrate 競態」而非 CAT 功能回歸。
3. 建議修點（實作時擇一或併用）  
   - **測試層**：seed／`setField` 前對 `case.get` 輪詢至可見（或重試 `case.update`），上限數秒。  
   - **橋接層（較治本）**：`case.update`（同理 fee／invoice）寫後讀改短輪詢，避免所有呼叫端各做一遍。  
4. persona 測試此輪綠：仍保留工單，因 main 歷史 #12 曾掛；實作時在 `switchToTestPersona` 前等測試模式指示元素就緒。
