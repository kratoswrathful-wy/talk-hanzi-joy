# 程式碼對照（CODEMAP）

> 快速查「功能在哪個檔案」。非完整列表，以維運最常碰到的為主。

## 路由與版面

| 項目 | 位置 |
|------|------|
| 路由表 | `src/App.tsx` |
| 側欄 / 外層 | `src/components/AppLayout.tsx`、`AppSidebar.tsx`；LMS 與 CAT iframe 側欄文案／收合規格見 [`LMS_CAT_SHELL_SIDEBAR_UX_2026-05.md`](./LMS_CAT_SHELL_SIDEBAR_UX_2026-05.md) |
| 個人檔案 | `src/pages/ProfilePage.tsx`（`useAuth` 須含 `isAdmin` 等，見 `HANDOFF.md`） |

## CAT 內嵌編譯器（`/cat`）

| 項目 | 位置 |
|------|------|
| **唯一原始碼目錄** | `cat-tool/`（`app.js`、`db.js`、`index.html`、`js/`、`style.css` 等） |
| **XLIFF → TM 匯入**（`.xliff`、`.xlf`、`.mqxliff`、`.sdlxliff`、`.mxliff`；選檔後 `#tmXliffImportDialog` 與編輯器同款篩選；`CatToolXliffBuildSegments` → `buildTmImportCandidates` → `evaluateSegment`／`segmentPassesSfRowRangePure` → `bulkAddTMSegments`） | [`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js)、[`cat-tool/js/xliff-to-tm.js`](../cat-tool/js/xliff-to-tm.js)；[`cat-tool/app.js`](../cat-tool/app.js) `runTmXliffFilteredImport`；[`cat-tool/index.html`](../cat-tool/index.html) `#tmXliffImportDialog`；決策／映射／**開發過程完整紀錄 §8**：[CAT_XLIFF_TO_TM_IMPORT_PLAN.md](./CAT_XLIFF_TO_TM_IMPORT_PLAN.md) |
| **Phrase mxliff（`.mxliff`）**（匯入 pill、`currentFileFormat='mxliff'`；匯出保留 `{N}` 字面量、`repairMxliffTargetForExport`；Phrase 開匯出檔驗收通過 `e744f50`） | [`cat-tool/js/xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js)（`synthesizeMxliffBraceTags`、`readPhraseMarkContentById`）；[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)（`exportXliffFamilyToBlob` mxliff 分支）；[`cat-tool/app.js`](../cat-tool/app.js)（`openEditor`、`exportBtn`、`_batchExportGetFileFormat`）；**完整紀錄**：[CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md](./CAT_PHRASE_MXLIFF_IMPLEMENTATION_2026-06.md)；管線摘要：[XLIFF_TAG_PIPELINE.md](./XLIFF_TAG_PIPELINE.md) §5 |
| **mqxliff bpt 內層 pt/g 對齊**（TM `<pt>` vs 原文 `<g>`；`reconcileTargetTagsMarkupFromSource` 匯入／F8／匯出） | [`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)、[`xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js)、[`app.js`](../cat-tool/app.js)；[bug-report_mqxliff-bpt-inner-markup-tm-mismatch_2026-06.md](./bug-report_mqxliff-bpt-inner-markup-tm-mismatch_2026-06.md) |
| 字數／TM 加權：Worker、列表／編輯器「切換字數」與**字數分析 Modal**（專案：合併／分項、進度；編輯器：全文／篩選範圍、不儲存報告）規格 | [CAT_WORD_COUNT_WORKER_AND_UI.md](./CAT_WORD_COUNT_WORKER_AND_UI.md) |
| 字數分析 Modal（`runWordCountAnalysis`、`openWordCountModalWithSelection`、`openWordCountModalFromEditor`、`applyWordCountModalUiMode`；`#wordCountModal`、`#btnEditorWordCount`、`#wordCountEditorScopeWrap`；樣式 `.btn-editor-word-count`） | [`cat-tool/app.js`](../cat-tool/app.js)、[`cat-tool/index.html`](../cat-tool/index.html)、[`cat-tool/style.css`](../cat-tool/style.css) |
| **TM 確認寫入（離線）效能**：開檔已載入之寫入 TM 標記於 `_activeTmCacheReadyIds`，確認時優先自 `ActiveTmCache` 比對／更新，**不**再整包 `getTMSegments`；快取未備時仍回退 DB。Dexie **`tmSegments` v21** 新增複合索引 **`[tmId+sourceText]`**（升級自動建索引）。 | [`cat-tool/app.js`](../cat-tool/app.js)（確認寫入 TM 迴圈、`_activeTmCacheReadyIds`）；[`cat-tool/db.js`](../cat-tool/db.js) `db.version(21)`；commit `f9f0b84` |
| 靜態輸出（勿單獨當真相長改） | `public/cat/`（由 `npm run sync:cat`、腳本 `scripts/sync-cat.mjs` 覆寫；`prebuild` 會跑） |
| 捷徑說明 | 根目錄 `AGENTS.md`、`.cursor/rules/cat-tool-source.mdc` |
| **整段取代**（`sfPhraseReplaceWhole`、`#btnPhraseReplace`；頭尾空格與引號搜尋詞統一解析） | [`cat-tool/app.js`](../cat-tool/app.js)：`getPhraseWholeTerm`、`evaluateSegment`、`doReplaceInText`、`performReplaceThis`、`collectFieldSearchRangesOwned`；**已修並驗收** `6a99c2a`；完整紀錄見 [`CAT_PHRASE_REPLACE_WHOLE_SPACES_FIX_2026-06.md`](./CAT_PHRASE_REPLACE_WHOLE_SPACES_FIX_2026-06.md) |
| **mqxliff bpt/ept 內 mq:rxt href 匯出**（Bug #9；memoQ 無法重新匯入） | [`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)：`shouldSkipAmpCollapseForMemoqInline`、`prepareRestoredFragmentForXmlParse`、`tagXmlNeedsReconcileFromSource`；腳本 [`scripts/test-mqxliff-bpt-href-export.mjs`](../scripts/test-mqxliff-bpt-href-export.mjs)；專文 [`bug-report_mqxliff-bpt-href-entity-export_2026-06.md`](./bug-report_mqxliff-bpt-href-entity-export_2026-06.md) |
| **譯文欄 contenteditable 換行**（幽靈 `<br>`、`extract`／搜尋高亮長度一致、Enter／Shift+Enter、純文字貼上、blur／確認前 rebuild） | [`cat-tool/app.js`](../cat-tool/app.js)：`isGhostBr`、`extractSubtree`、`extractTextFromEditor`、`rebuildTargetEditorFromExtractedPlain`、`insertCatControlledNewline`、`getRtEditorTextSegmentsForHighlightMap`；譯文 `.grid-textarea` 之 `paste`／`keydown`／`blur`；完整背景、決策、實作與後續見 [`bug-report_contenteditable-newline-artifacts.md`](./bug-report_contenteditable-newline-artifacts.md) |
| **譯文換行編輯補修**（tag 旁刪字、¶ 可刪換行；2026-05-27 驗收通過） | [`cat-tool/app.js`](../cat-tool/app.js)：`isGhostBr`／`isGhostBrAfterRtTag`、`tryDeleteSemanticNewlineAtCaret`（W1）；`applyNonPrintMarkers`、`canonicalizeTargetEditorFromExtractPlain`、`isGhostOnlyDiv`（W2）；基礎見 [`bug-report_contenteditable-newline-artifacts.md`](./bug-report_contenteditable-newline-artifacts.md) `c4f865d`；歷程 [`CAT_TARGET_NEWLINE_EDIT_NP_PLAN.md`](./CAT_TARGET_NEWLINE_EDIT_NP_PLAN.md) |
| **原文格 TB 內嵌提示**（淡底線、上標 1–9、`::after`、跨相鄰 `Text` 節點之單字尾錨點、TB 依句段閱讀序、`currentTmMatches` 與 Ctrl+1～9 對齊；**同 `(start,end)` 多筆 TB 合併一條底線、字尾多上標**） | [`cat-tool/app.js`](../cat-tool/app.js)：`decorateTbInlineHintsForActiveRow`、`renderLiveTmMatches`、`findTermHitRangesInPlainText`、`pullCrossNodeWordSuffix`、`getCatRightPanelPageSlice`；[`cat-tool/style.css`](../cat-tool/style.css) `.tb-inline-*`；開發過程與 commit 對照見 [`docs/CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md`](./CAT_TB_INLINE_SUPERSCRIPT_DEVLOG_2026-05.md) **§9** |
| 內聯標籤：F8 下一缺漏、`effectiveTags`／`targetTags`、點擊原文 tag 插入同列譯文（假游標位置或句末）、重複佔位檢查 | [`cat-tool/app.js`](../cat-tool/app.js)：`insertNextMissingTag`、`effectiveTags`、`buildTaggedHtml`、`onSourceTagInsertClick`（`#gridBody` 委派）；[`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)：`getSaved`／`restore`；空 `targetTags` + F8 整列 pill 退化見 [`bug-report_f8-targettags-empty-fallback-regression.md`](./bug-report_f8-targettags-empty-fallback-regression.md)；備忘見 [`cat-tool/README.md`](../cat-tool/README.md)「編輯器：內聯標籤」 |
| 真／暫存游標捲動提示：點一下捲至句段列（A+B 一鍵捲動） | [`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)：`navigateToSegmentBySegId`、`showRealCaretTipIfNeeded`；規格 [`CAT_FAKE_CARET_REAL_TIP_ONE_CLICK_PLAN.md`](./CAT_FAKE_CARET_REAL_TIP_ONE_CLICK_PLAN.md) |
| **系統跳焦點即時捲動**（無 smooth 動畫；確認跳行、篩選跳回、F3 導覽、QA 跳句段） | [`cat-tool/app.js`](../cat-tool/app.js)：`focusTargetEditorAtSegmentIndex`、`applySearchMatchNavigationFocus`、`_qaJumpToSegment`；[`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)；紀錄 [`CAT_SCROLL_INSTANT_NAVIGATION_2026-06.md`](./CAT_SCROLL_INSTANT_NAVIGATION_2026-06.md)（`5b5aa3d`） |
| **編輯器疊層 UI**（單檔匯出標籤警告、假游標 `#catEditorChromeLayer`、modal 互斥） | [`cat-tool/app.js`](../cat-tool/app.js) `exportBtn`、`showExportTagWarning`、`suppressCatFakeCaretForOverlay`；[`cat-tool/js/cat-fake-caret.js`](../cat-tool/js/cat-fake-caret.js)；規格 [`CAT_EDITOR_OVERLAY_FAKE_CARET_EXPORT_2026-06.md`](./CAT_EDITOR_OVERLAY_FAKE_CARET_EXPORT_2026-06.md) |
| **QA「Tag 檢查」**（與匯出／譯文 `{N}` 佔位對齊；`runQaChecks`、`_qaPushSegmentRuleFindings`、`_qaTagIdForCompare`、`_qaPlainTargetTagNumSet`） | [`cat-tool/app.js`](../cat-tool/app.js)；「缺少 tag」誤報見 [`bug-report_cat-qa-tag-parity.md`](./bug-report_cat-qa-tag-parity.md)；**pair「尚有未關閉之標籤」誤報**（獨立 `<ph>`）見 [`bug-report_qa-tag-unclosed-false-positive_2026-06.md`](./bug-report_qa-tag-unclosed-false-positive_2026-06.md)；介面折疊（檢查範圍/右下角資訊區）需求與驗收紀錄見 [CAT_QA_UI_COLLAPSE_HISTORY_2026-05.md](./CAT_QA_UI_COLLAPSE_HISTORY_2026-05.md) |
| **驗收波次（編輯器 UI／假游標／QA／篩選摘要／AI 批次／結果表多選）— 實作規劃與落地紀錄（含 2026-05-04 失焦防搶焦點、`5168549`）** | [CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md](./CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md)（`cat-tool/`；實作並 `sync:cat`；見該檔 **§7**） |
| **批次匯入作業檔精靈**（多選、mqxliff 角色、Excel 全域／逐檔欄位、`runBatchImport`；匯入後語言對不符 **`#batchImportLangMismatchDialog`**／`openBatchImportLangMismatchDialog`／`_collectXliffLangMismatchIfAny`） | [`cat-tool/app.js`](../cat-tool/app.js)：`showWizardStep`、`showBatchMqRoleModal`、`showBatchExcelConfigModal`、`_refreshBatchExcelStep`、`onBatchExcelSameCfgToggle`、`runBatchImport`、`xliffImportCtx`；[`cat-tool/index.html`](../cat-tool/index.html)：`wizardStepBatchMq`、`wizardStepBatchExcel`、`wizardStepBatchProgress`、多選 `input`；完整構想與驗收見 [CAT_BATCH_IMPORT_WIZARD_SESSION.md](./CAT_BATCH_IMPORT_WIZARD_SESSION.md) |
| **Excel 匯入警語 + inline tag（可逆）**（先 Rich Text，再字串層 token → `{N}`；匯出需 placeholder→token 還原；**`<color><SpriteName>…</color>` 巢狀 close** 見規格 §6.5；**xlsx 富文本匯出**見規格 §9） | [EXCEL_IMPORT_TAGS_SPEC.md](./EXCEL_IMPORT_TAGS_SPEC.md)（工程規格）；實作計畫 [EXCEL_IMPORT_REVERSIBLE_INLINE_TAGS_IMPLEMENTATION_PLAN.md](./EXCEL_IMPORT_REVERSIBLE_INLINE_TAGS_IMPLEMENTATION_PLAN.md)；摘要與驗收條列 [EXCEL_IMPORT_TAG_WARNING_PLAN.md](./EXCEL_IMPORT_TAG_WARNING_PLAN.md)；**開發／驗收紀錄** [CAT_EXCEL_REVERSIBLE_INLINE_TAGS_HISTORY_2026-05.md](./CAT_EXCEL_REVERSIBLE_INLINE_TAGS_HISTORY_2026-05.md)；實作掛載 [`cat-tool/app.js`](../cat-tool/app.js) `wizardStepBatchExcel`、`showBatchExcelConfigModal`、`_batchExcelConfigs`；富文字 [`cat-tool/js/xlsx-rich-tags.js`](../cat-tool/js/xlsx-rich-tags.js) `extractCellRichTags`；匯出 patch／`tagLayer: 'xlsxRpr'` 見 [`cat-tool/app.js`](../cat-tool/app.js) `excelExportTargetCellForSheet` |
| **批次匯出所選檔案（ZIP）**（工具列「匯出所選」→ 逐檔依格式組 Blob → JSZip 打包下載；ZIP 內檔名含語言對前綴防同名碰撞；tag 問題收集後統一回報；部分失敗仍下載成功部分）。格式分流：XLIFF 族 → `Xliff.exportXliffFamilyToBlob`；PO → `PoImport.exportPoToBlob`；Excel/GoogleSheet → XLSX.js `write({type:'array'})`。單檔匯出路徑不受影響。 | [`cat-tool/app.js`](../cat-tool/app.js)：`batchExportSelectedFiles`、`_batchExportBuildBlob`、`_batchExportGetFileFormat`、`_batchExportZipFilename`；[`cat-tool/index.html`](../cat-tool/index.html)：`#btnProjectBatchExport`；[`cat-tool/js/xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)：`exportXliffFamilyToBlob`；[`cat-tool/js/po-import.js`](../cat-tool/js/po-import.js)：`exportPoToBlob`；相依：JSZip 3.10.1（cdnjs CDN）；設計決策與驗收見 [CAT_BATCH_EXPORT_PLAN.md](./CAT_BATCH_EXPORT_PLAN.md) |
| **mqxliff 預設身分（雲端）** | `cat_files.default_mq_role` ↔ 前端 `defaultMqRole`：[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)（`CAT_FILE_LIST_COLUMNS`、`mapFileRow`、`db.updateFile`）；migration [`20260502160000_cat_files_default_mq_role.sql`](../supabase/migrations/20260502160000_cat_files_default_mq_role.sql)；專案檔案清單欄位見 [`cat-tool/app.js`](../cat-tool/app.js) `loadFilesList`／`projectFilesListMqRoleCellHtml`；說明見 [CAT第四波主記錄.md](./CAT第四波主記錄.md) **§九點五** |
| 準則／專案準則／團隊版雲端 AI 變更與部署 | [CAT_AI_GUIDELINES_AND_PROJECT_RULES.md](./CAT_AI_GUIDELINES_AND_PROJECT_RULES.md) |
| **檔案特殊指示／專案 AI 指示分離**（實作計畫；`cat-tool/app.js` 批次與共用資訊、`db.js`、`cat-cloud-rpc`） | [CAT_AI_FILE_SPECIAL_VS_PROJECT_INSTRUCTIONS_PLAN.md](./CAT_AI_FILE_SPECIAL_VS_PROJECT_INSTRUCTIONS_PLAN.md) |
| **本案／檔案特殊指示 — 共用資訊綠卡與專案頁 Modal**（規劃） | [CAT_AI_FILE_SPECIAL_INSTRUCTIONS_UI_PLAN.md](./CAT_AI_FILE_SPECIAL_INSTRUCTIONS_UI_PLAN.md) |
| 句段 revision／確認衝突（方案 B、樂觀鎖；已落地 Phase A–D） | [`cat-tool/app.js`](../cat-tool/app.js)：`segmentTargetWriteTails`、`awaitPendingSegmentTargetWritesForSeg`、`hydrateSegmentRevisionFromDb`、`applyUpdateSegmentTarget`、`enqueueConfirmSideEffects`、`_revertConfirmAndToast`；後端 [`cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) `db.updateSegmentTarget`；migration `20260421120000_cat_segments_segment_revision.sql`；說明與驗收見 [CAT_SEGMENT_REVISION_CONFLICT_PLAN.md](./CAT_SEGMENT_REVISION_CONFLICT_PLAN.md) |
| **句段匯入順序（`globalId`／`global_id`，含更新作業檔、句段集、團隊 RPC）**／**行內字型嘗試上線與撤回紀錄** | [`cat-tool/db.js`](../cat-tool/db.js) `sortSegmentsByImportOrder`；[`cat-tool/js/file-update.js`](../cat-tool/js/file-update.js) `mergeSegments`（`patch.globalId`）；[`cat-tool/app.js`](../cat-tool/app.js) `_cmpSegmentImportOrderWithinFile`；[`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) `fetchCatSegmentsByFileIdOrdered`、`sortMappedCatSegmentsByImportOrder`；migration [`20260507120000_cat_segments_global_id.sql`](../supabase/migrations/20260507120000_cat_segments_global_id.sql)；完整紀錄與 rt-fmt 調查見 [CAT_SEGMENT_IMPORT_ORDER_AND_INLINE_FMT_ROLLOUT.md](./CAT_SEGMENT_IMPORT_ORDER_AND_INLINE_FMT_ROLLOUT.md) |
| 編輯器底欄進度軌道／「調整統計範圍」按鈕 | [`cat-tool/index.html`](../cat-tool/index.html)：`#progressFill`、`#btnProgressRange`、`#progressRangePopup`、`.editor-status-bar-progress-wrap`；[`cat-tool/style.css`](../cat-tool/style.css)：`.editor-status-bar-progress-track`、`.btn-progress-range-adjust` |
| **編輯器格線**：所屬檔案欄序（Key 後／原文前）、欄寬拖曳、Key／額外資訊全空白自動隱藏 | [`cat-tool/app.js`](../cat-tool/app.js)：`ensureSourceFileColAfterKeys`、`attachColResizer`、`applyAutoHiddenCols`、`applyColSettings`、`renderColSettings`；規格 [CAT_VIEW_SPEC.md](./CAT_VIEW_SPEC.md) §12.2／§12.4／§12.5 |
| **全系統無延遲提示（`[data-tip]`）** | [`cat-tool/app.js`](../cat-tool/app.js)：`initGlobalTooltip`（舊名 `initWcProgressModeTooltip`）；DOM 元素 `#wcProgressModeTooltip.wc-progress-mode-tooltip`；使用說明與未覆蓋清單見 [CAT_TOOLTIP_SYSTEM.md](./CAT_TOOLTIP_SYSTEM.md) |
| CAT 團隊模式原始檔（Storage、`original_file_path`） | [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)、[`supabase/migrations/20260503120000_cat_original_files_storage.sql`](../supabase/migrations/20260503120000_cat_original_files_storage.sql)、[`scripts/backfill-cat-original-files.mjs`](../scripts/backfill-cat-original-files.mjs)；說明見 [incident-report_2026-05-01_rls-and-db-load.md](./incident-report_2026-05-01_rls-and-db-load.md) |
| 團隊版開檔／`getFile` 輕量與大檔卡載入 | `db.getFile` 之 `includeOriginal`（[`cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)）、[`cat-tool/app.js`](../cat-tool/app.js) `catGetFile`／`openEditor`／`waitForTmsIdentityReady`、[`CatToolPage.tsx`](../src/pages/CatToolPage.tsx) `CAT_AUTH_NOT_READY`；見 [bug-report_team-large-file-editor-stuck-loading_2026-05-26.md](./bug-report_team-large-file-editor-stuck-loading_2026-05-26.md) |
| 團隊版匯出原始檔（signed URL）／專案頁單檔直接下載 | `mapFileRowWithOriginalSignedUrl`、`hydrateFile` + `originalSignedUrl`（[`cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)、[`cat-tool/db.js`](../cat-tool/db.js)）；`formatCatExportErrorMessage`、`batchExportSelectedFiles`、`_triggerBrowserDownload`（[`cat-tool/app.js`](../cat-tool/app.js)）；同上 bug report §2.9 |
| 團隊版更新作業檔／Storage canonical path | `db.refreshFileSegments` 之 `newFileBase64`（先 upsert `{projectId}/{fileId}/original` 再寫句段）；[`cat-tool/app.js`](../cat-tool/app.js) Excel 更新 wizard；見 [bug-report_team-large-file-editor-stuck-loading_2026-05-26.md](./bug-report_team-large-file-editor-stuck-loading_2026-05-26.md) §2.11–§2.12 |
| **Excel 更新作業檔後匯出錯列（rowIdx keep 短路）** | [`cat-tool/js/file-update.js`](../cat-tool/js/file-update.js) `mergeSegments`（`segmentsContentEqual`、`segmentPositionEqual`、`buildPositionPatch`）；[`cat-tool/app.js`](../cat-tool/app.js) `excelApplyTranslatedSegmentsToWorkbook`；見 [bug-report_excel-update-export-position_2026-06.md](./bug-report_excel-update-export-position_2026-06.md) |
| **Excel 匯出 colTgt 字串寫錯欄** | [`cat-tool/app.js`](../cat-tool/app.js) `Number(s.colTgt ?? 0)`；見 [CAT_EXCEL_EXPORT_COLTGT_STRING_BUG_2026-05.md](./CAT_EXCEL_EXPORT_COLTGT_STRING_BUG_2026-05.md) |

### CAT：防殘影、深連結載入、詳情頁 key

手動驗收已通過（見 [`HANDOFF.md`](./HANDOFF.md)「CAT：防殘影…」小節）。

| 項目 | 位置 |
|------|------|
| fetch 前清空／切 view（專案／TM／TB／編輯器） | `cat-tool/app.js`：`beginOpenProjectDetailLoading`、`beginOpenTmDetailLoading`、`beginOpenTbDetailLoading`、`beginEditorViewLoadingShell` |
| 深連結首屏主區「載入中」 | `cat-tool/index.html`：`#catMainRouteLoading`；頁尾 inline script 與 `restoreCatRouteFromSession` 之 `finally`（`hideCatMainRouteLoadingEl`） |
| 樣式（主區載入 vs 全螢幕 overlay） | `cat-tool/style.css`：`.cat-main-route-loading` |
| TMS 詳情頁 **`key={id}`** | `src/App.tsx`：`CaseDetailPageWrapper`、`InvoiceDetailPageWrapper`、`ClientInvoiceDetailPageWrapper`、`PageTemplateEditorPageWrapper`、`InternalNotesPageWrapper` |
| 父頁／iframe 網址不同步（待評估） | `src/pages/CatToolPage.tsx`（見 `HANDOFF.md`「已知後續風險」） |

### CAT：線上 TB 分頁（online tabs）關鍵對照

| 項目 | 位置 |
|------|------|
| 分頁資料升級（舊單一 URL → `onlineTabs`） | `cat-tool/app.js`：`migrateOnlineTbToTabs` |
| 分頁卡渲染與拖曳排序 | `cat-tool/app.js`：`renderOnlineTabsSection` |
| 分頁新增/更新流程（確認並擷取） | `cat-tool/app.js`：`openTbTabModal`、`_runTbTabFetch`、`_tbTabFetchFailed` |
| 分頁刪除與術語重編號 | `cat-tool/app.js`：`deleteTbTab` |
| 術語列表來源欄與分頁篩選 | `cat-tool/app.js`：`loadTbTermsList`、`renderTbTabFilters` |
| 分頁管理區與 modal DOM | `cat-tool/index.html`：`#tbOnlineTabsSection`、`#tbTabModal` |
| 術語來源欄表頭 | `cat-tool/index.html`：`#tbTermSourceHeader` |
| Supabase 結構（分頁欄位） | `supabase/migrations/20260429210000_cat_tbs_online_tabs.sql`：`online_tabs` |
| 雲端 RPC 讀寫映射 | `src/lib/cat-cloud-rpc.ts`：`onlineTabs` ↔ `online_tabs` |

> 維運提醒：CAT 功能只改 `cat-tool`；任何異動後都要 `npm run sync:cat` 並同步提交 `public/cat`。

### CAT：提問整合（客戶表單 / LMS 案件綁定）

| 項目 | 位置 |
|------|------|
| 專案詳情（檔案清單、LMS 案件欄位） | `cat-tool/index.html`：`#viewProjectDetail`、`#filesListBody` |
| 專案詳情（句段集清單、涉及檔案折疊） | `cat-tool/index.html`：`#panelProjectViews`、`#viewsListBody`；[`cat-tool/app.js`](../cat-tool/app.js)：`loadViewsList`、`_renderViewFileLinesHtml`、`_ensureViewsFilesToggleDelegation`；說明見 [CAT第四波主記錄.md](./CAT第四波主記錄.md) **§八點六**、[CAT_VIEW_SPEC.md](./CAT_VIEW_SPEC.md) **§4**；建立句段集／預覽分階段決策見 [CAT_VIEW_CREATE_ROADMAP.md](./CAT_VIEW_CREATE_ROADMAP.md) |
| 編輯器工具列（客戶表單 / 內部註記按鈕顯示） | `cat-tool/index.html`：`#viewEditor`、`.editor-toolbar` |
| 編輯器底部資訊列（進度條與「使用者」標籤） | `cat-tool/index.html`：`.editor-status-bar` |
| 使用者標籤渲染與顯隱 | `cat-tool/app.js`：`collabPresenceBar` 相關邏輯 |
| 提問表單 / 內部註記按鈕條件顯示主邏輯 | `cat-tool/app.js`（依專案 URL、檔案 `LMS 案件` 綁定狀態判斷；提問表單外連以命名視窗重用分頁） |
| 專案外部連結儲存後 inline 顯示與可點擊 | `cat-tool/app.js`（專案設定渲染與保存流程） |
| 檔案批次連結案件、批次指派 | `cat-tool/app.js`（檔案清單勾選批次操作） |
| iframe 與主站通訊橋接（開啟內部註記 / 帶入預填） | `src/pages/CatToolPage.tsx`（`postMessage` bridge） |
| 由編輯器建立註記的預填與命名規則收斂 | `src/pages/InternalNotesPage.tsx`、`src/pages/CatToolPage.tsx` |
| 既有內部註記建立入口（對照 `relatedCase` 語意） | `src/pages/CaseDetailPage.tsx`：`handleCreateInternalNote` |
| 內部註記 `relatedCase` 映射 | `src/stores/internal-notes-store.ts`：`relatedCase` ↔ `related_case` |
| 案件狀態驅動 CAT 指派同步（`非已派出 -> 已派出`，不限次數；只新增不移除） | `src/stores/case-store.ts`（狀態轉換偵測 → 呼叫 DB 函式 `sync_cat_file_assignments_for_case`）＋ migrations：`20260508120000_sync_cat_file_assignments_fn.sql`、`20260508130000_sync_cat_file_assignments_fn_fix_translator_jsonb.sql` |
| CAT 資料表（提問/綁案/指派） | `cat_projects`、`cat_files`、`cat_file_assignments` |
| 內部註記資料表 | `internal_notes`（**規劃**欄位 `consultation_slack_records`，見 [`SLACK_NOTIFY_EXPANSION_2026-05.md`](SLACK_NOTIFY_EXPANSION_2026-05.md) §4） |

> 實作注意：僅「客戶表單」「內部註記」屬條件式按鈕；`AI 輔助` 必須維持原顯示規則，不可連帶隱藏。

## 案件

| 項目 | 位置 |
|------|------|
| 案件列表 | `src/pages/CasesPage.tsx` |
| 案件詳情 | `src/pages/CaseDetailPage.tsx` |
| 重複標題邏輯 | `src/lib/case-title-duplicate.ts`、測試 `*.test.ts` |
| 案件資料 store | `src/hooks/use-case-store.ts`、`src/stores/case-store.ts`（依實際 import） |

## 費用管理（稿費總表／請款）

| 項目 | 位置 |
|------|------|
| 費用總表頁 | `src/pages/TranslatorFees.tsx`（欄位定義 `allColumnDefs`、篩選上下文 `filterCtx`） |
| 費用詳情頁 | `src/pages/TranslatorFeeDetail.tsx` |
| 總表篩選／排序取值（**須與欄位顯示同一維度**） | `src/hooks/use-table-views.ts`：`getFieldValue`、`FeeFilterContext`（`invoices`、`clientInvoices`） |
| 營收區（對帳／請款完成 checkbox） | `src/components/ClientInfoSection.tsx` |
| 稿費資料 store | `src/stores/fee-store.ts`、`src/hooks/use-fee-store.ts` |
| 客戶請款單 store（總表「請款完成」欄衍生顯示） | `src/stores/client-invoice-store.ts` |
| 譯者選項含 **`noFee`**（無須開立稿費，`member_translator_settings.no_fee`） | `src/stores/select-options-store.ts`：`loadAssignees` |
| 客戶幣別 → TWD 匯率（利潤換算） | `src/stores/currency-store.ts` |

> 維運：`請款完成`／`利潤`／`費率無誤` 曾發生「詳情與總表篩選不一致」；修正紀錄與驗收見 [`HANDOFF.md`](./HANDOFF.md)「費用總表：篩選器與欄位顯示對齊」。

## 設定頁

| 項目 | 位置 |
|------|------|
| 設定主頁（版面／權限 gate） | `src/pages/SettingsPage.tsx` |
| 任務類型／計費單位／派案來源／客戶報價 | `TaskTypeOrderSection.tsx`、`BillingUnitOrderSection.tsx`、`DispatchRouteSection.tsx`、`ClientPricingSection.tsx`（皆在 `src/components/settings/`） |
| 譯者備註（拖曳排序、DB） | `src/components/settings/TranslatorNotesSection.tsx` |
| 譯者單價級距（含 modal／驗證） | `src/components/settings/TranslatorTierSection.tsx` |
| 圖示庫 | `src/components/settings/IconLibrarySection.tsx` |
| 狀態標籤區塊 | `src/components/settings/StatusStyleSection.tsx` |
| 內部註記狀態／性質 | `src/components/settings/NoteSelectSection.tsx` |
| 請款管道 | `src/components/settings/BillingChannelSection.tsx` |
| 內容性質 | `src/components/settings/CaseCategorySection.tsx` |
| 貨幣設定 | `src/components/settings/CurrencySettingsSection.tsx` |
| 工具列按鈕樣式 | `src/components/settings/ToolbarButtonStyleSection.tsx` |
| Slack（連結／說明／承接預設文案） | `src/components/profile/ProfileSlackCard.tsx`（個人檔案）；承接／無法承接／任務完成通知 `src/lib/slack-case-reply-notify.ts`（`kind`: `accept` \| `decline` \| `task_complete`，`segmentTitle` 可選）、`src/lib/slack-case-reply-defaults.ts`（`DEFAULT_ACCEPT_SUFFIX` 等） |
| Slack 詢案對話框 | `src/components/InquirySlackDialog.tsx`；詢案訊息複製 `src/lib/copy-case-inquiry-message.ts`；mrkdwn 組字 `src/lib/inquiry-slack-message.ts` |
| Slack 擴充紀錄（決策／待落地項目） | [`docs/SLACK_NOTIFY_EXPANSION_2026-05.md`](SLACK_NOTIFY_EXPANSION_2026-05.md) |
| 內部註記頁／store | `src/pages/InternalNotesPage.tsx`、`src/stores/internal-notes-store.ts`、`src/hooks/use-internal-notes-table-views.ts`（**規劃**：`consultation_slack_records` ↔ DB `consultation_slack_records`；**規劃**元件：`NoteReminderSlackDialog` 或同等命名） |
| 重大故障／維運紀錄（DB `ops_incidents`，管理員） | `src/components/settings/OpsIncidentsSection.tsx` |
| ColorPicker 使用顏色聚合 | `src/lib/settings-color-usage.ts` |
| `case-files` 上傳路徑／檔名 | `src/lib/storage-case-files.ts`（`buildCaseFileObjectPath`） |
| 報價格／級距 Tab 切換可編輯格 | `src/lib/settings-editable-cells.ts`（`handleTabKeyDown`、`focusNextEditableCell`） |

## 工具列按鈕（顏色 / 文案 / 圖示 / 群組）

| 項目 | 位置 |
|------|------|
| 按鈕註冊表 | `src/lib/ui-button-registry.ts` |
| 狀態與持久化 | `src/stores/ui-button-style-store.ts` |
| 預設群組版面 | `src/lib/ui-toolbar-groups-defaults.ts` |
| 圖示渲染 | `src/lib/ui-button-icon-render.tsx` |

## 下拉選項與標籤樣式

| 項目 | 位置 |
|------|------|
| 選項（含狀態標籤、客戶等） | `src/stores/select-options-store.ts`（`STATUS_TABLE_MAP`、`ALL_STATUS_TABLES`） |
| 標籤字色等 | `src/stores/label-style-store.ts` |

## 新增設定區塊的建議步驟

1. 在 `src/components/settings/MySection.tsx` 實作 UI。  
2. 在 `SettingsPage.tsx` import 並插入版面。  
3. 若需跨區塊共用小函式，放 `src/lib/` 並補一句 JSDoc。
