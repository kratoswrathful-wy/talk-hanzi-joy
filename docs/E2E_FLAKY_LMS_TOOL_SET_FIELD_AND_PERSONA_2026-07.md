狀態：已落地待驗收

# E2E flaky 穩定化：lms-tool-set-field／dev-switch-user-persona

日期：2026-07-14  
優先：**現在修**（生產 `__lmsAgent` 寫後讀競態；非僅測訊）  
分支：`fix/bridge-readback-race`  
來源：E2E run #20（commit `7f4c1e13`／PR #42）於 `lms-tool-set-field` seed「更新後讀取案件失敗」；審核方比對同 PR #18／#19 該測綠、main #12 掛的是另一測試（`dev-switch-user-persona`），判定與 CAT meta／額外資訊變更無關的間歇失敗。升級理由：日常 AI 建單／開費用亦走 `case.update`，假失敗會誤導重寫。

## 目標

兩者在 CI 連續 **5 次** `workflow_dispatch`（E2E Playwright）**全綠**。

## 對象／已採做法

| Spec／層 | 症狀（CI） | 做法 |
|----------|------------|------|
| 橋接層 | `更新後讀取…失敗` 假失敗 | 共用 [`ai-agent-readback.ts`](../src/lib/ai-agent-readback.ts) 短輪詢（約 5s）；區分「寫入失敗」／「寫入成功但回讀逾時」 |
| case-store | 回讀期間 realtime／poll 沖掉 tools fieldValues | `PENDING_CLEANUP` 對齊 5s；`mergeToolEntriesPreferRicher` |
| clientInvoice-store | SELECT 短暫缺欄沖掉樂觀寫入 | update 後 `dbToApp` 再疊本次 `updates` |
| [`tests/lms-tool-set-field.spec.ts`](../tests/lms-tool-set-field.spec.ts) | seed 寫後讀失敗 | seed 輪詢至 tools 含 memoQ；setField 用 `toolEntryId`；回讀逾時再 `get` 確認 |
| [`tests/dev-switch-user-persona.spec.ts`](../tests/dev-switch-user-persona.spec.ts) | 測試模式未就緒就換人 | `expectTestModePersonaUiReady`（橫幅＋切換列）後再 `switchToTestPersona` |

## 約束

- 慢軌、非擋關：本工單不升格為 push／PR 擋關條件。
- 遵守 [`testing.mdc`](../.cursor/rules/testing.mdc)：確定訊號等待，禁止固定 `sleep`；多角色斷言前須確認生效身分。
- 相關 workflow：[`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml)；主計畫索引見 [`ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md`](./ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md) §20。
- AI 呼叫端語意：[`LMS_AI_AGENT_QUICK_GUIDE_FOR_CLAUDE.md`](./LMS_AI_AGENT_QUICK_GUIDE_FOR_CLAUDE.md)、[`LMS_AI_AGENT_BRIDGE_2026-06.md`](./LMS_AI_AGENT_BRIDGE_2026-06.md)。

## 驗收

1. Vitest（含 `ai-agent-readback`）＋相關 e2e 綠。
2. 對修復分支 `workflow_dispatch` **連續 5 次** E2E 全綠，並於本檔貼 run 連結。
3. 通過並合併後狀態改「已完成」。

## 備註

### 手動重跑結果（2026-07-14，修前）

- Run：[Actions #29322613828](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29322613828)（`workflow_dispatch`／`main`＠`dc9e28db`）
- 結論：**failure**；再現 `lms-tool-set-field` seed「更新後讀取案件失敗」

### 修復後 5× workflow_dispatch（tip `896fc95e`，2026-07-14／15）

連續 **6／6** 全綠（皆 `workflow_dispatch`，同一個 tip）：

1. ✅ [#29343700225](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29343700225)
2. ✅ [#29344642588](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29344642588)
3. ✅ [#29344665631](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29344665631)
4. ✅ [#29344669634](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29344669634)
5. ✅ [#29344673846](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29344673846)
6. ✅ [#29344678057](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29344678057)（加跑確認）

另：PR 觸發 [#29341794300](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29341794300) 亦綠（同 tip）。

### 較早輪次（未達標）

- tip `fd9a21fe`／`66345afa`：目標測項已綠，套件仍偶發 CAT／W10 假人
- tip `6695d055`：連續 **4／5** 全綠（#5 掛於 reload 後 personas 尚未渲染即斷言 active）
  - ✅ [#29333224285](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29333224285)
  - ✅ [#29334213218](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29334213218)
  - ✅ [#29335093316](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29335093316)
  - ✅ [#29336186343](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29336186343)
  - ❌ [#29337133515](https://github.com/kratoswrathful-wy/talk-hanzi-joy/actions/runs/29337133515)（`w10-fees-visible-translator`：換人後假人列未就緒）
- 後續：`switchToTestPersona` reload 後再等 `expectTestModePersonaUiReady` + create pending 保護 → tip `896fc95e` 達標（見上）
