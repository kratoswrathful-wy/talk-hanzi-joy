狀態：實作中

# Gate2 上線後審核缺口處理表（2026-09-07）

來源：Codex `GATE2_POST_RELEASE_RISK_AUDIT_2026-09-07.md`。  
原則：工具保全與 PR #84 阻擋優先；**不**整包宣稱正常輸入已全部恢復。

| ID | 摘要 | 狀態 | 最小測例／證據 |
|---|---|---|---|
| F01 | 工具遮罩→整組 updateCredentials 清空 | **已修（本機分支）／尚未部署** | vitest：`case-tool-credentials-persist`（拒遮罩、單欄合併、失敗保留草稿、序列化連編）；正式案結構摘要已庫外存證 |
| F09 | credentials load 在途舊請求回填 | **已修／尚未部署** | vitest：`case-credential-access` clearAll／clear 後 stale load 拋 `CredentialLoadStaleError` |
| F10 | AI `tool.setField` 走 case.update | **已修／尚未部署** | bridge 改 `updateCredentials`；`case.update` 拒 tools／login* |
| F11 | Slack OAuth 補償競態 | **待重現** | 故障注入 unread previousCred／並行 callback（未做） |
| #84 trigger | BEFORE UPDATE 擋合法承接 | **已修／尚未部署** | migration 改 CONSTRAINT DEFERRED；SQL：`pm_complete_case_translation_check` 同交易 update+insert、accept、assign+dispatch |
| #84 wrapper | 缺前置靜默略過 | **已修／尚未部署** | migration：`install_maintenance_write_wrapper` 缺則 raise |
| #84 finalize | 確定指派未等保存 | **已修／尚未部署** | CaseDetailPage `await caseStore.update` 後才 toast |
| #84 participant 查詢 | 未綁請求代次／未分失敗與無授權 | **已修／尚未部署** | requestGen＋loadState `error`/`empty` |
| #84 completeness | helper 未接線；缺 UUID 略過 | **已修／尚未部署** | `deriveExpected` 保留 name-only；`scripts/check-assignment-position-completeness.mjs` |
| F02 | 總表 onCommit 漏傳指派 meta | **已證實／尚未修** | CasesPage adapter 只傳 (id,field,value)；測：單格選人後 RPC patch 無 UUID |
| F03 | member 留言被白名單排除 | **已證實／尚未修** | store 白名單無 comments；測：member `save({comments})` 被拒 |
| F04 | 交稿附件錯綁 case_detail_keyword | **已證實／尚未修** | registry＋member edit=false；測：上傳後欄位 onChange 被 field_not_permitted |
| F05 | 複製／範本／復原缺工具與 UUID | **已證實／尚未修** | toDb 剝 tools；範本審稿僅 label |
| F06 | 撤銷改派／多人轉單人姓名-only | **已證實／尚未修** | 與 F02 合併治理；測：取消 collab 無 translatorUserId |
| F07 | CAT 完成同步管理者入口＋吞錯 | **已證實／尚未修** | cat-wf-lms-sync 帶 updated_at；dispatch helper 忽略 error |
| F08 | 一般／批次保存未等結果、混合 RPC | **已證實／部分關聯已觸及** | finalize 已等結果；總表批次仍立即 ++；混合兩次 RPC 未原子 |

## 分支地圖

| 工項 | 分支 | worktree |
|---|---|---|
| 工具保全 F01/F09/F10 | `fix/tool-credentials-masked-write` | `1UP-TMS-tool-wipe-20260907` |
| PR #84 阻擋與接線 | `fix/task-complete-admin-rpc` | `1UP-TMS-task-complete-20260907` |
| PR #83 工作類型 | 暫停 | `1UP-TMS-worktype-20260906` |

## 未核准事項

不寫正式資料、不補 participant、不 merge／db push／部署、不整組還原工具。
