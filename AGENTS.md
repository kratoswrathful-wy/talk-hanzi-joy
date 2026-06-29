# 給 AI / 新協作者的捷徑

## 文件索引

### (A) 給 AI／協作者的行為規則

- **本檔** — 對話語言、推送慣例、CAT 單一來源、工作評估與文件、對話與執行（含資料庫操作）與下列章節。
- **[`.cursor/rules/`](.cursor/rules/)** — 依你正在編輯的檔案路徑自動套用（例如 [`cat-tool-source.mdc`](.cursor/rules/cat-tool-source.mdc)、[`xliff-tag-export.mdc`](.cursor/rules/xliff-tag-export.mdc)）；預設非全域常駐，觸及對應 glob 時才注入。
- **[`.cursor/rules/language-zh-tw.mdc`](.cursor/rules/language-zh-tw.mdc)** — **全域常駐**：對話與文件僅台灣正體中文，禁止混用其他語言書寫說明正文。

### (B) 功能與路徑

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — TMS 本體（React / Vite）、維運邊界
- [`docs/CODEMAP.md`](docs/CODEMAP.md) — 功能與路徑對照
- [`docs/CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md`](docs/CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md) — CAT 內嵌：驗收波次（進階篩選／假游標／QA／篩選摘要／AI 批次／結果表多選）**實作規劃**
- [`cat-tool/README.md`](cat-tool/README.md) — CAT 維護說明（含下拉選單樣式代號 `DD-A / DD-B / DD-C`）

### (C) 領域與深文件（非「Cursor 一律遵守的編輯總規則」）

- [`docs/LMS_CAT_SHELL_SIDEBAR_UX_2026-05.md`](docs/LMS_CAT_SHELL_SIDEBAR_UX_2026-05.md) — LMS 殼層左欄與 CAT iframe 內側欄：導覽文案、收合規則、`TMS_SIDEBAR_MODE` 與驗收
- [`docs/CAT_VIEW_SPEC.md`](docs/CAT_VIEW_SPEC.md) — 介面用語與檢視行為
- [`docs/CAT_CTRL_DIGIT_SHORTCUT_SPEC.md`](docs/CAT_CTRL_DIGIT_SHORTCUT_SPEC.md) — Ctrl+1～9 右欄套用細部規格（與 [`docs/CAT第四波主記錄.md`](docs/CAT第四波主記錄.md) §5-i 對照）
- [`docs/XLIFF_TAG_PIPELINE.md`](docs/XLIFF_TAG_PIPELINE.md) — XLIFF／tag 管線（與 [`xliff-tag-export.mdc`](.cursor/rules/xliff-tag-export.mdc) 呼應）
- [`docs/CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md`](docs/CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md) — **Phrase `.mxliff`** 匯入／編輯器 pill／匯出 Phrase 相容（`ff23f8c`～`e744f50`、驗收步驟與維護邊界）
- [`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md) — 部署檢核
- [`docs/SLACK_SETUP.md`](docs/SLACK_SETUP.md) — Slack 詢案與譯者通知設定；擴充決策與待落地項目見 [`docs/SLACK_NOTIFY_EXPANSION_2026-05.md`](docs/SLACK_NOTIFY_EXPANSION_2026-05.md)
- [`docs/CAT_AI_GUIDELINES_AND_PROJECT_RULES.md`](docs/CAT_AI_GUIDELINES_AND_PROJECT_RULES.md) — **產品**內 CAT 團隊版「AI 準則」資料與 Supabase 流程；**不是**教編輯器如何改程式的通用規範
- [`docs/CAT_AI_FILE_SPECIAL_VS_PROJECT_INSTRUCTIONS_PLAN.md`](docs/CAT_AI_FILE_SPECIAL_VS_PROJECT_INSTRUCTIONS_PLAN.md) — **檔案特殊指示**（專案頁用語）與 **專案 AI 指示** 分離：規格、遷移、驗收與程式觸點（**已落地** Dexie v22／`project_ai_instructions` migration；細節以該檔與程式為準）
- [`docs/CAT_AI_FILE_SPECIAL_INSTRUCTIONS_UI_PLAN.md`](docs/CAT_AI_FILE_SPECIAL_INSTRUCTIONS_UI_PLAN.md) — 共用資訊區「本案／檔案特殊指示」**綠卡 UI**、專案頁編輯 Modal（檔案多選）、編輯器差異與 tooltip 之**實作計畫**（規劃文件）
- [`docs/CAT_SEGMENT_IMPORT_ORDER_AND_INLINE_FMT_ROLLOUT.md`](docs/CAT_SEGMENT_IMPORT_ORDER_AND_INLINE_FMT_ROLLOUT.md) — 句段依匯入順序排序（`global_id`）、更新作業檔與雲端一致；**行內字型／rt-fmt** 上架嘗試之問題與調查紀錄（已撤回）
- [`docs/EXCEL_IMPORT_TAGS_SPEC.md`](docs/EXCEL_IMPORT_TAGS_SPEC.md) — Excel 匯入警語與括號／自訂正則轉 tag（**工程規格**）；高層計畫見 [`docs/EXCEL_IMPORT_TAG_WARNING_PLAN.md`](docs/EXCEL_IMPORT_TAG_WARNING_PLAN.md)；介面預覽 [`docs/preview-excel-import-tags/index.html`](docs/preview-excel-import-tags/index.html)
- [`docs/bug-report_f8-targettags-empty-fallback-regression.md`](docs/bug-report_f8-targettags-empty-fallback-regression.md) — F8／`effectiveTags`／空 `targetTags` 導致整列譯文 tag pill 變純文字（sdlxliff 等常見觸發）；修正方案待實作；與 [`docs/bug-report_mqxliff-partial-target-tags.md`](docs/bug-report_mqxliff-partial-target-tags.md) §2.8 對照
- [`docs/bug-report_mqxliff-team-role-persistence.md`](docs/bug-report_mqxliff-team-role-persistence.md) — mqxliff 在 Team（Supabase）模式下 **T／R1／R2** 無法持久化（重開檔後狀態圖示與鎖定規則錯亂）；根因為 `cat_segments` 缺欄位與 `cat-cloud-rpc` 未映射；2026-05-10 已修（migration + RPC）
- [`docs/bug-report_mqxliff-export-segment-lookup-fail_2026-06.md`](docs/bug-report_mqxliff-export-segment-lookup-fail_2026-06.md) — mqxliff **匯出**時 `idValue`（對話路徑）與 `trans-unit@id`（hash）脫鉤，譯文／確認狀態未寫回 XML；**已修並驗收**（`4fef922`、`xliff_tu_id`）；遊戲對話檔需更新作業檔 backfill
- [`docs/bug-report_mqxliff-bpt-inner-markup-tm-mismatch_2026-06.md`](docs/bug-report_mqxliff-bpt-inner-markup-tm-mismatch_2026-06.md) — mqxliff **bpt/ept 內層** TM `<pt>` vs 原文 `<g>`：F8 無法改正、匯出錯 tag（**已修並驗收** `d1ab161`）；含調查過程、修改步驟與 Companion 第 41 句驗收紀錄
- [`docs/bug-report_mqxliff-export-lookup-key-collision_2026-06.md`](docs/bug-report_mqxliff-export-lookup-key-collision_2026-06.md) — mqxliff **匯出**時 ID（`globalId`）與 Key（`idValue`）數字撞鍵 → 寫入**別句**譯文（NED 等 CSV／Excel 衍生）；**已修**（`byTuId`／`byAux`、移除序號 fallback）；與上一條「查找跳過」區分
- [`docs/bug-report_mqxliff-targettags-xml-mismatch-f8_2026-06.md`](docs/bug-report_mqxliff-targettags-xml-mismatch-f8_2026-06.md) — mqxliff **同句** `targetTags` xml 與原文不一致（`mq:rxt` displaytext；F8／Ctrl+F8 無法改正、紅橘對不上、匯出 memoQ tag 錯）；**已修**（`upsertTargetTagFromSource`、reconcile 全 xml）；樣本 NED 第 24／62／63 行；與撞鍵／Bug #5 區分
- [`docs/bug-report_file-download-uuid-filename.md`](docs/bug-report_file-download-uuid-filename.md) — LMS 下載 `case-files` 附件時瀏覽器建議檔名為 UUID；調查紀錄與以 `downloadFile`（fetch→blob）修正之說明
- [`docs/bug-report_team-large-file-editor-stuck-loading_2026-05-26.md`](docs/bug-report_team-large-file-editor-stuck-loading_2026-05-26.md) — 團隊版大檔：開檔卡「載入中」**已修**（`4422dae`）；匯出 signed URL／單檔直接下載 **已修**（`6acf7d9`）；**更新作業檔** orphan path 根因（`refreshFileSegments` 先刪後傳）**已修**（`e37cbf9`）；見 §2.11–§2.12
- [`docs/bug-report_excel-update-export-position_2026-06.md`](docs/bug-report_excel-update-export-position_2026-06.md) — Excel **更新作業檔**後匯出 F 欄**錯列**（`mergeSegments` keep 短路未同步 `rowIdx`；`globalId`／`status` 假陽性更新統計）；與 [`CAT_EXCEL_EXPORT_COLTGT_STRING_BUG_2026-05.md`](docs/CAT_EXCEL_EXPORT_COLTGT_STRING_BUG_2026-05.md)（寫錯欄）區分
- [`docs/CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md`](docs/CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md) — 原文格 TB 上標／副行：**§9** 為 2026-05-09 第二波（跨節點錨點、TB 閱讀序、多上標、同範圍合併底線）開發與驗收紀錄；程式對照見 [`docs/CODEMAP.md`](docs/CODEMAP.md)
- [`docs/CAT_TB_DEDUP_AND_SUPPRESS_2026-06.md`](docs/CAT_TB_DEDUP_AND_SUPPRESS_2026-06.md) — 右欄 TB 比對**子字串壓制**（須嚴格原文子字串；Card／card 不互壓）、**同原文同譯文合併**、**工作階段隱藏／復原**、AI 批次可選帶入；**已驗收**
- [`docs/CAT_TB_EDITOR_LIVE_SYNC_PLAN_2026-06.md`](docs/CAT_TB_EDITOR_LIVE_SYNC_PLAN_2026-06.md) — 術語庫改刪**即時同步**編輯器快取、footer **編輯／刪除術語**
- [`docs/CAT_MQXIFF_FILTER_STATUS_IMPLEMENTATION.md`](docs/CAT_MQXIFF_FILTER_STATUS_IMPLEMENTATION.md) — mqxliff **進階篩選「memoQ 確認身分」** 定案 UI、`evaluateSegment` 第四維、編輯器／TM 匯入／QA 摘要等**全部觸點**與驗收；靜態預覽見 [`docs/preview-mqxliff-filter-status-options/index.html`](docs/preview-mqxliff-filter-status-options/index.html)
- [`docs/CAT_EDITOR_OVERLAY_FAKE_CARET_EXPORT_2026-06.md`](docs/CAT_EDITOR_OVERLAY_FAKE_CARET_EXPORT_2026-06.md) — 單檔匯出**標籤警告**不被全螢幕 loading 擋住；假游標／捲動提示掛 **`#editorGrid` chrome 層**、modal 開啟隱藏／關閉自動恢復（**已實作**，待驗收）
- [`docs/CAT_SCROLL_INSTANT_NAVIGATION_2026-06.md`](docs/CAT_SCROLL_INSTANT_NAVIGATION_2026-06.md) — 系統跳焦點一律即時捲動（`scrollIntoView` `behavior: 'auto'`）；清除篩選／搜尋導覽／確認跳行等**已修並驗收** `5b5aa3d`；與 [`CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md`](docs/CAT_CONFIRM_SCROLL_CENTER_FIX_2026-05.md) 置中邏輯互補
- [`docs/CAT_PHRASE_REPLACE_WHOLE_SPACES_FIX_2026-06.md`](docs/CAT_PHRASE_REPLACE_WHOLE_SPACES_FIX_2026-06.md) — **整段取代**頭尾空格與手動引號時搜尋標記／取代不一致（**已修並驗收** `6a99c2a`）；`getPhraseWholeTerm` 四觸點同步
- [`docs/bug-report_mqxliff-bpt-href-entity-export_2026-06.md`](docs/bug-report_mqxliff-bpt-href-entity-export_2026-06.md) — mqxliff **bpt/ept 內 mq:rxt 超連結**匯出編碼損壞（Bug #9）；`shouldSkipAmpCollapseForMemoqInline`、reconcile 編碼深度；Consumer Insights 樣本
- [`docs/bug-report_mqxliff-bpt-ph-type-mismatch_2026-06.md`](docs/bug-report_mqxliff-bpt-ph-type-mismatch_2026-06.md) — mqxliff **bpt/ept vs ph 結構型別不匹配**（Bug #10；TM 模糊匹配、F8 無效）；`fixMqxliffBptPhTypeMismatch`；`extractMqRxtDisplayText` displaytext pill 顯示
- [`docs/CAT_TAG_VIEW_MODE_IMPLEMENTATION_PLAN.md`](docs/CAT_TAG_VIEW_MODE_IMPLEMENTATION_PLAN.md) — 編輯器**標籤顯示三模式**（僅編號／簡短／延長）、`displayFull`、無延遲 tooltip
- [`docs/CAT_PAIRED_TAG_ARROW_BORDER_IMPLEMENTATION_PLAN.md`](docs/CAT_PAIRED_TAG_ARROW_BORDER_IMPLEMENTATION_PLAN.md) — 成對 tag **箭頭外框**（方案 B；§8 失敗紀錄、**待 SVG**）；預覽 [`docs/preview-cat-paired-tag-border/index.html`](docs/preview-cat-paired-tag-border/index.html)
- [`docs/bug-report_mqxliff-tm-ph-sequential-mismatch_2026-06.md`](docs/bug-report_mqxliff-tm-ph-sequential-mismatch_2026-06.md) — **Bug #11** TM 連續 ph 佔位錯位（`fixMqxliffTmPhSequentialPairs`）；與 Bug #10 區分
- [`docs/bug-report_mqxliff-mq-rxt-val-mismatch_2026-06.md`](docs/bug-report_mqxliff-mq-rxt-val-mismatch_2026-06.md) — **Bug #12** mq:rxt `val` 屬性不符（reconcile 短路；**已修並驗收** `2a88a48`）；樣本 `36432` 列 203
- [`docs/CAT_MQXLIFF_INSERTED_MATCH_UI_2026-06.md`](docs/CAT_MQXLIFF_INSERTED_MATCH_UI_2026-06.md) — mqxliff **memoQ 預翻／機翻**（`<mq:insertedmatch>`）右欄比對表第一列、百分比與 `MT /` 分色；開發／驗收紀錄
- [`docs/CAT_EDITOR_LARGE_FILE_PERF_2026-06.md`](docs/CAT_EDITOR_LARGE_FILE_PERF_2026-06.md) — 編輯器**大檔效能**；Phase 1～2.2 首批**已驗收**（主紀錄 §開發與驗收時序）
- [`docs/CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md`](docs/CAT_EDITOR_TAG_COLOR_AND_NAV_FIX_2026-06.md) — **Phase 2.3**（`0670242`）+ **2.3b** `694fa81` + **2.3c** `0a073ea`（驗收未通過）+ **2.3d** `42bbd17` + **2.3e** `78818d0`（部分未通過）+ **2.3f** `927ceec`（部分未通過）+ **2.3g** `e84f06d`（未通過）+ **2.3h** 疊層 fixed／移除 suspend；**2.3h 待驗收**
- [`docs/bug-report_virt-scroll-confirm-nav-rowidx_2026-06.md`](docs/bug-report_virt-scroll-confirm-nav-rowidx_2026-06.md) — 大檔虛擬捲動 **rowIdx 污染**、確認後不跳行、重複句 DOM；**已修並驗收** `51815db`（Phase 2.3 延伸見上）
- [`docs/bug-report_ai-batch-parse-error-no-retry_2026-06.md`](docs/bug-report_ai-batch-parse-error-no-retry_2026-06.md) — AI 批次翻譯 **parse_error 不重試**、逐批 UI 刷新、**提示語開頭** Team 專案共用（`batch_introduction` migration）
- [`docs/CAT_AI_BATCH_SURROUNDING_CONTEXT_PLAN_2026-06.md`](docs/CAT_AI_BATCH_SURROUNDING_CONTEXT_PLAN_2026-06.md) — AI 批次 **參照來源「上下文」**（上下各 10 句原文＋譯文）
- [`docs/CAT_AI_BATCH_STABILITY_FIX_PLAN_2026-06.md`](docs/CAT_AI_BATCH_STABILITY_FIX_PLAN_2026-06.md) — AI 批次 **穩定修正**（備註誤譯 prompt、切批字元含 extra、詢問路徑分批、聚焦漏句 blur；**已實作，待驗收**）
- [`docs/bug-report_mxliff-confirm-level-export_2026-06.md`](docs/bug-report_mxliff-confirm-level-export_2026-06.md) — mxliff 匯出 `m:confirmed="1"` 未對齊 `m:level`、Phrase 顯示未確認；TM 鎖定句段確認值被覆寫；**已修並驗收** `12eb3ab`
- [`docs/CAT_LOCKED_SEGMENT_CONFIRM_UX_2026-06.md`](docs/CAT_LOCKED_SEGMENT_CONFIRM_UX_2026-06.md) — 鎖定／禁止編輯句段確認狀態保留、匯入匯出規格、編輯器選取與批次 toast；I2Loc 樣本驗收紀錄
- [`docs/CAT_IMPORT_CASE_LINK_2026-06.md`](docs/CAT_IMPORT_CASE_LINK_2026-06.md) — 匯入選填連結 LMS 案件（一般＋GS；`49db7c2` 起）
- [`docs/CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md`](docs/CAT_WORKFLOW_STAGES_AND_REVISION_TRACKING_PLAN_2026-06.md) — **工作階段／追蹤修訂／TMS 整合大計畫**（Phase A／**Phase B 已落地**；**B-6 已實作**；**B-7 已落地**；**Phase C C-1.1 已驗收**；C-3 匯出規劃中）
- [`docs/CAT_REVISION_TRACKING_PHASE_C_SPEC_2026-06.md`](docs/CAT_REVISION_TRACKING_PHASE_C_SPEC_2026-06.md) — **Phase C 追蹤修訂**規格與 §12 開發／驗收紀錄（C-1～C-1.1 已驗收；C-3 規劃中）
- [`docs/CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md`](docs/CAT_WORKFLOW_PHASE_B_SPEC_2026-06.md) — **Phase B Workflow** 完整規格（**已落地並驗收** `e4a6205`～`d7232ab`：v5 migration／檔案清單逐行、LMS 雙向、開檔熱修 §11.7、更新檔 Modal §11.8、任務完成按下驗證 §11.9；**B-6 延伸** §12 已實作；**B-7** §13）
- [`docs/CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md`](docs/CAT_WORKFLOW_PREP_AND_REVIEW_B6_SPEC_2026-06.md) — **Phase B-6** 檔案準備閘門 + 審稿任務完成（**已實作** `fd67332`、migration 已 push；prep 僅 PM 可編、審稿任務完成；審稿暫不 Slack；舊檔 backfill；**派出閘門 2026-06-23 解耦**見下條）
- [`docs/CAT_WORKFLOW_PREP_DISPATCH_DECOUPLE_2026-06.md`](docs/CAT_WORKFLOW_PREP_DISPATCH_DECOUPLE_2026-06.md) — **B-6 派出與 prep 解耦**（**已驗收** `d247d9a`：移除阻擋式 prep gate、非阻擋警示 toast、多人即時 CAT 指派 sync、`accepted` SQL 過濾）
- [`docs/CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md`](docs/CAT_WORKFLOW_B7_UNIFIED_STATUS_AND_LIST_UX_2026-06.md) — **Phase B-7** 統一顯示狀態 + 檔案清單／儀表板 UX（**B-7a～g**；§12 匯入已確認句段；§14 批次審稿完成作業）
- [`docs/CAT_WORKFLOW_CONFIRM_STATUS_UX_2026-06.md`](docs/CAT_WORKFLOW_CONFIRM_STATUS_UX_2026-06.md) — **B-7g** 確認狀態五態、點圖示／Ctrl+Enter、審稿回溯、篩選進度、PM 切換（**已驗收** `c503f9d`；開發紀錄 §13）
- [`docs/CAT_CONFIRM_FILTER_BATCH_IMPROVEMENT_PLAN_2026-06.md`](docs/CAT_CONFIRM_FILTER_BATCH_IMPROVEMENT_PLAN_2026-06.md) — 確認狀態 **Phase 1**：篩選重構、批次確認瞬間 UI、範圍外重複 Modal（**已落地並初步驗收** `9ef343b`）
- [`docs/bug-report_segment-confirm-status-wf-inconsistency_2026-06.md`](docs/bug-report_segment-confirm-status-wf-inconsistency_2026-06.md) — `status` 與 Workflow 時間戳不一致四症狀、根因與稽核查詢（**已修並初步驗收** `9ef343b`）
- [`docs/CAT_CONFIRM_STATUS_PHASE2_PLAN_2026-06.md`](docs/CAT_CONFIRM_STATUS_PHASE2_PLAN_2026-06.md) — 確認狀態 **Phase 2**：套色／memoQ 統一、DB backfill、完整驗收
- [`docs/CAT_BULK_REVIEW_COMPLETE_2026-06.md`](docs/CAT_BULK_REVIEW_COMPLETE_2026-06.md) — 批次審稿完成作業執行記錄（2026-06-19；413 個 stage；LMS 審稿指派比對；264 個 `workflow_status` bug 修正；稍後處理清單）
- [`docs/bug-report_workflow-whole-file-assign-edit-lock_2026-06.md`](docs/bug-report_workflow-whole-file-assign-edit-lock_2026-06.md) — Workflow **整檔指派卻句段鎖定**（修復 **B-7d**）
- [`docs/bug-report_workflow-import-confirmed-status-column_2026-06.md`](docs/bug-report_workflow-import-confirmed-status-column_2026-06.md) — 匯入 XLIFF **已確認 vs 狀態欄**（**B-7e 已實作**；五態互動見 **B-7g**）
- [`docs/bug-report_import-confirmed-tm-write-progress-overlay_2026-06.md`](docs/bug-report_import-confirmed-tm-write-progress-overlay_2026-06.md) — 匯入確認疊層（**已修並驗收**）、TM 去重（**已修並驗收**）、匯入路徑 `ActiveWriteTms`（**已修並驗收** `c4e4736`）
- [`docs/CAT_SORT_AND_DISPLAY_ORDER_SPEC_2026-06.md`](docs/CAT_SORT_AND_DISPLAY_ORDER_SPEC_2026-06.md) — **B-0** 檔序、句段集排序、左欄顯示序、篩選 A、Workflow 列號對齊
- **1UP CAT／LMS 整合 UX 大計畫**（Cursor plan `1up_ux_與遷移`）— **唯一完整主紀錄**（第二波 UX、B+D2、UX 微調、加號）；Git 摘要 [`docs/CAT_LMS_1UP_UX_AND_MIGRATION_DEVLOG_2026-06.md`](docs/CAT_LMS_1UP_UX_AND_MIGRATION_DEVLOG_2026-06.md)

## 回覆與推送慣例

### 語言與用字（強制，全域）

- **僅使用台灣正體中文**與使用者對話、撰寫說明與 `docs/` 文件正文。
- **禁止**以簡體中文、日文、韓文或**整段英文**當作對使用者的說明正文；程式識別符、檔名、欄位名等以反引號保留者除外。
- **禁止**簡中慣用詞寫入產品語境或對使用者說明（例如：匹配、视频、软件、信息、默认）。
- **介面用語**：與翻譯記憶相關之否定表述用「**無相符**」等，不用「匹配」（詳見 [`docs/CAT_VIEW_SPEC.md`](docs/CAT_VIEW_SPEC.md) §1.3）。不確定時請先與產品確認。
- 技術術語可出現，但對專案擁有者須**首次白話解釋**；同一則對話不重複定義。
- 細節與 Cursor 常駐規則：[`/.cursor/rules/language-zh-tw.mdc`](.cursor/rules/language-zh-tw.mdc)（`alwaysApply: true`）。
- 除非使用者另有明確指示，否則每次完成可提交的變更後，預設流程為：**直接推送**，並依下方「變更完成並推送後的回報」結構回覆。

## 與專案擁有者溝通

- **背景**：專案擁有者**不具程式背景**為預設假設。使用者若要求「白話」或「白話文」，意指**外行也能理解**的說明，不預設對方懂分支、API、migration 等詞彙。
- **技術名詞**：**可以**出現；每次出現後須用白話說明**該術語**或**整句技術語句**在講什麼、與對方有何關係。同一則對話中，同一術語**解釋過一次即可**，後續不再重複定義。
- **行內程式碼**（以反引號標示、介面常顯示為灰底等寬字，例如 `main`、`AGENTS.md`）：**不必**為了「少用」而避免，可用來標示檔名、分支名、指令等；重點是搭配白話說明讓對方知道在講什麼。

## 新需求或新任務時的回覆

當使用者提出**一項新的需求或新任務**（有明確要做的事）時，回覆中**務必**附加條列：

- **需要你決定的事項**：選擇、取捨、優先順序等。
- **需要你注意的事項**：風險、限制、後續影響、是否需手動操作等。

一般閒聊、確認或延續同一任務的細節追問，不強制條列；若仍涉及重大取捨，建議仍條列決策點。

## 變更完成並推送後的回報

每次變更已提交並推送後，請依序提供：

1. **推送／版本**：分支名稱（通常 `main`）與 commit 編號（至少 7 字元短碼），必要時附 commit 訊息一行，方便在 GitHub 或本機比對。
2. **變更摘要**：極短說明改了什麼（檔案或行為層級），不以大段程式碼當唯一說明。
3. **預計體驗變更**：使用者實際會感受到什麼（畫面、流程、效能、誰受影響）；若幾乎無 UI 變化亦請註明。
4. **如何驗收（白話）**：以外行能跟著做的步驟寫成清單（開哪個畫面、點哪裡、預期看到什麼）；後端或純設定變更則說明「你會注意到什麼現象」或「無需操作時如何確認已完成」。

## 工作評估與文件

- **實作與規劃**：本專案目前由 AI 承擔實作；評估工項、排程、取捨或技術方案時，**不必**預設「人類工程師的產能、熟悉度或可用工時」。
- **文件**：撰寫或維護供留存之文件（例如 `docs/`、`README`、以及註解中預期日後由人閱讀的說明）時，**仍應**假設日後可能由人類（含維運者或專案主人）閱讀，維持清楚脈絡與可讀性。

## 對話與執行

### 說明與交付（避免請使用者從對話複製貼上）

- 優先**直接改檔**或透過工具套用變更；向使用者說明時以**檔案路徑、行為摘要、驗收方式**為主。
- **避免**把大段程式碼或長串終端機指令當成「請自行複製貼上」的唯一交付方式。
- 僅在環境無法代為寫入或執行時，才附上**最短**必要內容，並說明為何無法代做。

### Supabase 與資料庫操作

- 變更若伴隨 **migration**（資料庫結構版本變更）、種子資料或專案慣例中的 Supabase／Postgres 步驟，**預設由代理在權限與環境允許時直接執行完畢**（例如新增或修改 `supabase/migrations/*.sql` 後執行 **`supabase db push`**；實際指令與部署順序以 [`docs/HANDOFF.md`](docs/HANDOFF.md)、[`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md) 為準）。
- **不要**預設把整串流程留給使用者執行；結尾不應以「請執行以下 bash」當成預設交付。
- 若執行失敗（未 link、缺憑證、無法連線、僅 Dashboard 可完成等），應簡述**錯誤與阻擋原因**，並只請使用者補**無法代辦的那一步**。

## CAT 內嵌編譯器（`/cat`）

- **僅在 [`cat-tool/`](cat-tool/) 修改** Vanilla CAT 的 `app.js`、`db.js`、`index.html`、`js/` 等。
- **不要**以 `public/cat/` 當第二套原始碼長期手改。
- 改完在**專案根目錄**執行 **`npm run sync:cat`**，再一併提交 `cat-tool` 與 `public/cat` 的變更。
- `npm run build` 的 **`prebuild` 會自動**跑 `sync:cat`；靜預覽與他人 clone 仍建議手動 sync 後提交，避免 `public/cat` 落後。

細節與風險：[`cat-tool/README.md`](cat-tool/README.md)、[`.cursor/rules/cat-tool-source.mdc`](.cursor/rules/cat-tool-source.mdc)。

## 在 VS Code / Cursor 裡

- **Command Palette**（`Ctrl+Shift+P` / `Cmd+Shift+P`）→ **Tasks: Run Task** → **「Sync CAT (cat-tool → public/cat)」**（定義在 [`.vscode/tasks.json`](.vscode/tasks.json)）。
