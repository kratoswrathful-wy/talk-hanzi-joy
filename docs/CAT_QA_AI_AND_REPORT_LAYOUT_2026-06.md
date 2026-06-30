# CAT QA：AI 檢查擴充與報告版面

> **狀態**：**初步驗收通過**（2026-07-01，commit `36885ea`）；**待補測** T2／T3 動態反灰、T7 忽略同步、T11 雲端偏好  
> **範圍**：`cat-tool/` → `public/cat/`；Team 模式雲端偏好 + `cat_ai_settings.prompts` JSON 擴充  
> **關聯**：[`CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md`](./CAT_EDITOR_UX_QA_WAVE_IMPLEMENTATION_PLAN.md)（既有規則 QA、結果表多選）、[`CAT_AI_GUIDELINES_AND_PROJECT_RULES.md`](./CAT_AI_GUIDELINES_AND_PROJECT_RULES.md)（共用資訊準則）  
> **Slack 驗收 thread**：[#development — CAT QA AI 擴充](https://1up-studio.slack.com/archives/C0BDSDCT9B5/p1782837024956729)

---

## 1. 目的

在 CAT 編輯器內完成品質檢查：列出問題 → 點 `#` 跳句 → 直接改譯文。**不**匯出 Excel。

本輪新增：

1. **AI 檢查**六類（分輪 API，不合併 prompt）
2. **結果表**可顯示於右側窄欄、下方寬面板，或兩邊同時（個人雲端偏好）
3. **操作區**永遠在右側 QA 分頁

---

## 2. 檢查項目

### 2.1 規則檢查（本地）

| 勾選 | 預設 | 類型 |
|------|------|------|
| 術語是否有遺漏或錯誤 | 開 | 術語未套用 |
| Tag 是否有遺漏 | 開 | Tag 檢查 |
| 原文相同但譯文不一致 | 開 | 譯文不一致 |
| 數字與原文不一致 | 開 | 數字不相符 |

程式：`runQaChecks`、`_qaPushSegmentRuleFindings`（[`cat-tool/app.js`](../cat-tool/app.js)）

### 2.2 AI 檢查（分輪）

| 勾選 | 結果 `type` | 空狀態 |
|------|-------------|--------|
| 錯字／打字 | 錯字 | 永遠可勾 |
| 語意與翻譯正確性 | 語意 | 永遠可勾 |
| 翻譯準則 | 翻譯準則 | 共用資訊無已選條目 → 反灰 |
| 文風偏好 | 文風 | 無已選條目 → 反灰 |
| 專案準則 | 專案準則 | 無條目 → 反灰 |
| 本案特殊指示 | 特殊指示 | 本檔無已套用指示 → 反灰 |

- **不帶** AI 翻譯用風格修改範例（`styleExamples`）
- 準則類：`_buildAiOptions` 對應子集注入 prompt
- 語意／錯字：不注入準則條目
- 每勾選項 = **獨立 API 輪次**（禁止合併多格 prompt）

### 2.3 檢查範圍（規則 + AI 共用）

含鎖定、句段範圍、目前篩選結果（與既有行為一致）。

---

## 3. 結果資料形狀

```js
{ segId, gid, type, info, key }
```

| 欄 | 規則 QA | AI QA |
|----|---------|-------|
| `type` | 程式固定字串 | 程式固定（對應勾選項） |
| `info` | 模板拼接 | AI JSON `issues` |
| `key` | 例 `${gid}:tag` | 例 `${gid}:typo`、`${gid}:semantic`、`${gid}:qg-trans` |

---

## 4. 報告版面

| 區域 | 內容 |
|------|------|
| 右側 `#tabQA` | 勾選、範圍、開始 QA、結果位置偏好、狀態列；結果表（可選） |
| 下方 `#tabQaResults` | 寬結果表（可選） |

偏好 `qa_report_surface`：`bottom`（預設）| `right` | `both`  
儲存：[`cat_user_ui_prefs.qa_report_surface`](../supabase/migrations/20260630140000_cat_user_ui_prefs_qa_report_surface.sql)，個人雲端；離線 `localStorage` fallback。

跑完 QA：

1. **強制**右側切到 QA 分頁
2. 偏好 `bottom` 或 `both` → 下方切「QA 結果」tab 並展開 `#notesPanel`

---

## 5. AI 管理 — 六格可編 prompt

存於 `cat_ai_settings.prompts`（jsonb）：

| 鍵 | UI id |
|----|-------|
| `typoSystem` | `aiPromptTypoSystem` |
| `qaSemanticSystem` | `aiPromptQaSemanticSystem` |
| `qaTransGuidelineSystem` | `aiPromptQaTransGuidelineSystem` |
| `qaStyleGuidelineSystem` | `aiPromptQaStyleGuidelineSystem` |
| `qaProjectGuidelineSystem` | `aiPromptQaProjectGuidelineSystem` |
| `qaSpecialInstructionSystem` | `aiPromptQaSpecialInstructionSystem` |

每格下方唯讀：`預設提示詞：「……」`（來源 [`QA_DEFAULT_PROMPTS`](../cat-tool/js/ai-translate.js)）。  
留空用內建；有內容取代主體，程式仍附加 JSON 結尾。

---

## 6. 程式觸點

| 功能 | 檔案 |
|------|------|
| QA 主流程、雙渲染、可用性 | [`cat-tool/app.js`](../cat-tool/app.js) |
| AI 批次 QA | [`cat-tool/js/ai-translate.js`](../cat-tool/js/ai-translate.js) |
| UI | [`cat-tool/index.html`](../cat-tool/index.html)、[`cat-tool/style.css`](../cat-tool/style.css) |
| 偏好 RPC | [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts)、[`cat-tool/db.js`](../cat-tool/db.js) |
| 確認後增量 | `_qaIncrementalRefreshAfterConfirm`（AI 項不重跑） |

---

## 7. 驗收清單（規格對照）

| # | 項目 | 狀態（2026-07-01） |
|---|------|-------------------|
| T0 | 部署含 `36885ea` | ✅ PASS |
| T1 | 只勾規則 → 不呼叫 AI | ✅ PASS |
| T2 | 翻譯準則無條目 → 反灰 | ⏳ 待補測（首輪僅靜態觀察） |
| T3 | 共用資訊選準則後可勾 | ⏳ 待補測（樣本檔本來就有準則） |
| T4 | 勾語意 → 類型「語意」、≥1 次 API | ✅ PASS |
| T5 | 錯字+語意 → 兩輪 API、`（1/2）`／`（2/2）` | ✅ PASS |
| T6 | 預設 `bottom` → 右側表隱藏、下方有表並展開 | ✅ PASS |
| T7 | `both` → 兩表列數一致；忽略同步 | ⚠️ 列數 PASS；**忽略同步待補測** |
| T8 | 跑完 QA → 右側 QA tab；bottom/both 時下方 QA 結果 tab | ✅ PASS（首輪未明寫右側 tab，建議補斷言） |
| T9 | 點 `#` 跳句 | ✅ PASS |
| T10 | AI 管理六格 + 預設提示詞展示 | ✅ PASS |
| T11 | Team 改結果位置 → 重整後雲端偏好一致 | ⏳ 待補測（首輪誤判為 CLI sync） |
| T12–T14 | 準則違反／確認增量／特殊指示 | 選測，首輪未做 |

---

## 8. 開發與實作紀錄

### 8.1 產品定案（2026-06 討論）

| 主題 | 定案 |
|------|------|
| 報告預設位置 | **下方**「QA 結果」分頁（`qa_report_surface = bottom`） |
| 偏好儲存 | **個人雲端** `cat_user_ui_prefs`；離線 `localStorage` fallback |
| 版面選項 | `bottom`／`right`／`both`（三選一）；**操作區永遠在右側 QA 分頁** |
| 跑完 QA 導覽 | 強制右側 QA 分頁；`bottom`／`both` 時展開 `#notesPanel` 並切下方「QA 結果」 |
| AI 檢查 | 六類、**每類獨立 API 輪次**（禁止合併 prompt） |
| 準則類反灰 | 翻譯／文風／專案準則、本案特殊指示：無可用條目時 checkbox `disabled` |
| QA prompt | AI 管理頁六格可編；留空用 `QA_DEFAULT_PROMPTS` 內建；格下唯讀展示預設全文 |
| 不帶入 | AI 翻譯用 `styleExamples` **不**注入 QA |

### 8.2 實作時序（單次交付 `36885ea`）

1. **規格文件** — 本檔初版 + [`docs/CODEMAP.md`](./CODEMAP.md) 索引列  
2. **DB** — migration [`20260630140000_cat_user_ui_prefs_qa_report_surface.sql`](../supabase/migrations/20260630140000_cat_user_ui_prefs_qa_report_surface.sql)；`supabase db push`  
3. **雲端 RPC** — [`src/lib/cat-cloud-rpc.ts`](../src/lib/cat-cloud-rpc.ts) 讀寫 `qa_report_surface`  
4. **本機偏好** — [`cat-tool/db.js`](../cat-tool/db.js) `getUserUiPref`／`setUserUiPref` + `localStorage`  
5. **UI** — [`cat-tool/index.html`](../cat-tool/index.html)、[`cat-tool/style.css`](../cat-tool/style.css)：規則／AI 分區、六勾選、結果位置 radio、下方 `#tabQaResults`、右側 `#qaResultsWrapRight`  
6. **AI 模組** — [`cat-tool/js/ai-translate.js`](../cat-tool/js/ai-translate.js)：`QA_DEFAULT_PROMPTS`、`qaSemanticReview`、`qaGuidelineReview`（JSON 結尾固定）  
7. **主流程** — [`cat-tool/app.js`](../cat-tool/app.js)：`btnRunQA` 分輪編排、雙容器 `renderQaResults`、偏好 load/save、跑完 `_qaNavAfterRunComplete`  
8. **同步** — `npm run sync:cat` → `public/cat/`

### 8.3 關鍵程式決策與除錯要點

| 議題 | 作法 |
|------|------|
| 準則可用性 | `getQaAiCheckAvailability()` 讀共用資訊／專案設定／本檔特殊指示；`syncQaAiCheckAvailability()` 設 `disabled` + label `title` |
| 何時重算反灰 | 進 QA 分頁、QA 控制解鎖、編輯器共用資訊儲存後、`applicableSpecialInstructionIds` 更新後 |
| 雙表渲染 | `renderQaResults()` 依 `qaReportSurface` 寫入 `#qaResultsTableRight` 與 `#qaResultsTableBottom`；`_qaIgnoredSet` 兩邊共用 |
| 右側 wrap 隱藏 | `#qaResultsWrapRight` 留在 DOM，`display: none`（非移除節點）— 驗收時勿以「元素不存在」判 FAIL |
| 分輪進度 | `btnRunQA` 依勾選組 `aiRounds[]` 循序 `await`；狀態列顯示 `（i/n）` |
| 確認後增量 | `_qaIncrementalRefreshAfterConfirm`：本地規則項可更新；AI 項（錯字／語意等）**不重跑** API |
| iframe 驗收 | CAT 在 LMS iframe 內時須對 **iframe `contentDocument`** 查 DOM，非外層頁 |

### 8.4 主要觸點函式（便於回溯）

```
cat-tool/app.js
  getQaAiCheckAvailability / syncQaAiCheckAvailability
  _loadQaReportSurfacePref / _saveQaReportSurfacePref / _applyQaReportSurfaceUi
  renderQaResults / renderQaRunSummary
  _qaNavAfterRunComplete
  btnRunQA（分輪 AI + 規則合併 _qaResults）
  _qaIncrementalRefreshAfterConfirm

cat-tool/js/ai-translate.js
  QA_DEFAULT_PROMPTS
  qaSemanticReview / qaGuidelineReview
```

---

## 9. AI 驗收紀錄（Claude，2026-07-01）

- **執行者**：Claude AI（瀏覽器自動化）  
- **環境**：https://talk-hanzi-joy.vercel.app（`dpl_CsPovPBfKr3SRAYjRr7Hxr4ey8oC`，`36885ea`）  
- **樣本**：`ConservationProjects_TW_1-87_zho-TW.mqxliff`（Planet Zoo 2，87 句）  
- **登入**：威儀（PM，Team 模式）

### 9.1 首輪結果摘要

| 結果 | 測項（**本檔編號**） |
|------|---------------------|
| ✅ PASS | T0、T1、T4、T5、T6、T8、T9、T10 |
| ⚠️ 部分 | T7（兩表列數一致，未測忽略）；T2／T3（有／無準則各觀察到一端，未做同流程動態切換） |
| ⏳ 未測 | T11（Claude 誤以 `npm run sync:cat` 跳過；規格 T11 為**雲端偏好跨重整**） |
| 選測 SKIP | T12–T14 |

**PM 裁定**：接受為**初步驗收通過**；待補測項見 §7 與 §9.2。

### 9.2 待補測（Slack thread 回覆，勿開新帖）

| 項 | 補測重點 |
|----|----------|
| T2 + T3 | 同一編輯流程：清空翻譯準則 → 反灰；再選準則儲存 → 可勾 |
| T7 | `both` 模式下忽略一筆 → 兩表同步 |
| T11 | `setUserUiPref` 改 `right` → `location.reload()` → 讀回與 UI radio 一致 |
| T8（可選） | 明確斷言 `.tab-btn[data-tab="tabQA"]` 含 `active` |
| T12–T14（可選） | 準則違反列、確認後增量、特殊指示反灰／可跑 |

補測完成後請更新本檔 §7 表格與 §9.1 狀態列。
