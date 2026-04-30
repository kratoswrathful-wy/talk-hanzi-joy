# AI 任務 UX 第二波盤點計畫

> 狀態：草案（承接 §7.1 第一波已實作）
>  
> 入口：`docs/CAT_AI_GUIDELINES_AND_PROJECT_RULES.md` §7.1、§8（2026-04-30 補充收錄）

## 1) 目標與範圍

- 釐清 AI 長任務在刷新/中斷情境下的狀態語意，避免「進行中」殘留誤導。
- 評估任務紀錄由 `localStorage` 升級為伺服器持久化（Supabase）的可行作法與風險。
- 對齊「全文掃描」與「批次翻譯」在中斷、恢復、驗收上的一致規則。
- 建立平台異常（Supabase unhealthy/522/CORS）下的驗收基線，避免誤判責任邊界。

## 2) Checklist（高可見追蹤）

- [ ] DECISION_PENDING: `running` 在重整後是否自動改標 `interrupted`/`aborted`
- [ ] DECISION_PENDING: 任務紀錄是否改為 Supabase 持久化（含權限/RLS）
- [ ] DECISION_PENDING: 掃描與批次是否採相同「中斷後可恢復」策略
- [ ] VALIDATION_PENDING: 平台恢復後重跑回歸，確認進度與結案狀態可穩定落記
- [ ] VALIDATION_PENDING: 在多分頁/多專案切換下，任務上下文（專案/檔案/範圍）不串錯

## 3) 決策議題

### A. 狀態語意修正

- DECISION_PENDING: `running` 是否僅作「曾啟動」語意，或需嚴格代表「目前仍在執行」。
- DECISION_PENDING: 若採嚴格語意，刷新載入時是否將殘留 `running` 批次改為 `interrupted`，並補 `interruptedAt`。
- RISK: 未修正前，使用者可能誤以為任務仍在背景執行，造成重複操作或錯誤期待。
- NEXT_STEP: 先定義狀態列舉與轉移表，再實作資料遷移（`catAiTaskLogV1` -> 新版本 key）。

### B. 伺服器持久化

- DECISION_PENDING: 是否新增任務紀錄表（例如 `cat_ai_task_logs`）保存 start/update/finish 事件。
- DECISION_PENDING: 欄位最小集合：`task_type`、`project_id`、`project_name`、`file_path`、`range_summary`、`status`、`progress_json`、`started_at`、`finished_at`、`error_summary`。
- RISK: 若直接把高頻 update 全量落 DB，可能造成寫入噪音與成本上升。
- NEXT_STEP: 先做「節流寫入」方案（例如僅狀態變化或每 N 秒/每 N 筆進度落一次）。

### C. 一致性與恢復規則

- DECISION_PENDING: 掃描與批次在「取消/失敗/刷新中斷」是否共用同一錯誤碼與顯示文案。
- VALIDATION_PENDING: 驗證 `runAiBatchTranslate` 與 `_runAiScan` 的任務上下文欄位是否可完整對齊。
- RISK: 兩條流程規則分岔會增加維護成本，並降低使用者對「任務紀錄」可預期性。
- NEXT_STEP: 抽共用 task lifecycle helper，減少兩路重複判斷。

### D. 平台事件與驗收邊界

- DECISION_PENDING: 訂定平台異常期間的「暫停驗收」判準（例如 Supabase 服務 unhealthy 或連續 522）。
- VALIDATION_PENDING: 平台恢復後，重跑固定 smoke 流程（啟動任務 -> 觀察進度 -> 完成/失敗結案）。
- RISK: 未先排除平台事件就回報前端缺陷，會造成錯誤修復方向。
- NEXT_STEP: 補一份固定回歸腳本與紀錄模板，附在後續 PR 說明。

## 4) 驗收輸出（第二波完成時應具備）

- [ ] 文件：`§7.1` 與本計畫的 `DECISION_PENDING` 全部轉為已決議或明確延期。
- [ ] 實作：任務狀態在刷新後不再錯標為「進行中」。
- [ ] 實作（若採伺服器化）：可跨裝置/跨分頁讀到一致任務紀錄。
- [ ] 測試：至少包含成功、失敗、取消、刷新中斷、平台異常恢復後重跑。

