狀態：實作中

# 工具憑證遮罩寫入修復說明（F01／F09／F10）

## 根因

1. `CaseDetailPage` 在 credentials 清除／重載空窗時，以 `cases_visible` 的遮罩 `tools`（`fieldValues: {}`）當底稿。
2. `patchTools`／`patchQuestionTools` 整組呼叫 `updateCredentials`；DB 對提供的 `tools` 鍵整組替換。
3. `updateCredentials` 成功後 `clear` 快取，再觸發公開 view 回退，放大競態。
4. `case-credential-access.load` 無 generation；切帳／撤權後舊請求可回填。
5. AI `tool.setField` 走 `caseStore.update`，`toDb` 剝除 tools → 看似成功實則未寫入。

## 修復要點

- 寫入僅允許完整 credentials 底稿；拒遮罩 fallback。
- 每案序列化 persist；失敗保留草稿並 toast。
- load／clear generation；保存成功改 `load`+`put`，不再 clear→空窗。
- `tool.setField` → `updateCredentials`；`case.update` 拒敏感鍵。

## 測試

`vitest`：`case-credential-access`、`case-tool-credentials-guard`、`case-tool-credentials-persist`（17 項通過）。

## 正式案證據（無密文）

`C:\Homemade Apps\1UP-TMS-isolation-20260901\scripts\.cache\tool-wipe-evidence-20260907\`  
live revision=9；memoQ 6鍵/3非空 vs 備份 7鍵/6非空。局部復原見同目錄 `PARTIAL_RESTORE_PLAN.md`。

## 未部署

本分支不得 merge／db push／部署，除非另核准。
